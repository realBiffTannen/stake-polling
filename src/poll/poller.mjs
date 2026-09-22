import { Cadence } from './schedule.mjs';
import { writeTick, writeAlert, writeMeta } from '../store/writer.mjs';
import { readTrails, readSnapshot } from '../store/reader.mjs';
import { detect } from '../detect/rules.mjs';
import { deltas as toDeltas } from '../detect/baseline.mjs';
import { fingerprint } from '../sid/index.mjs';
import { buildSummary } from '../summary.mjs';
import { normaliseModes } from '../modes.mjs';
import { listOf, idOf, gameIds, liveGameIds, mergeSlugs } from '../games.mjs';

// Re-exported: these were part of this module's surface before they moved to
// src/games.mjs to be shared with the read side.
export { gameIds, liveGameIds, mergeSlugs };

const SCHEMA_VERSION = '1';
const GAME_STATS_CONCURRENCY = 4;
const TOTAL_FAILURES_BEFORE_ALERT = 3;

/**
 * One minute of work: fetch, normalise, detect, write.
 *
 * `tick` is the whole poller. The binary around it only decides when to call
 * it and what to do when the credential dies, which keeps the interesting part
 * testable with a stub API and a real Redis.
 */
export class Poller {
  constructor({ api, client, keys, config, gate, sid = null }) {
    this.api = api;
    this.client = client;
    this.keys = keys;
    this.config = config;
    this.gate = gate;
    this.cadence = new Cadence(config.intervals);
    this.sidFingerprint = sid ? fingerprint(sid) : null;
    this.sidSource = null;
    this.consecutiveFailures = 0;
    this.consecutiveTotalFailures = 0;
    this.knownGames = [];
    // Every slug this poller has ever seen on the roster or live in the
    // catalogue. Seeded once from Redis so a restart does not read the whole
    // roster as ten simultaneous launches, and so a game that went live while
    // the process was down is still announced when it comes back.
    this.seenGames = new Set();
    this.seeded = false;
    // Alerts raised since the last summary was written, so the running log can
    // say what fired during its window rather than only what is firing now.
    this.windowAlerts = [];
    this.lastSummaryAt = null;
  }

  /**
   * @param {number} now the minute boundary this tick belongs to
   * @param {number} tickIndex monotonically increasing, drives the sub-cadences
   * @returns {Promise<{ ok: boolean, ts: number, failures: object[], alerts: object[], authExpired: boolean }>}
   */
  async tick(now, tickIndex) {
    const due = this.cadence.due(tickIndex);
    const failures = [];
    const snapshots = { perGame: {} };

    const [roster, games, balance] = await Promise.all([
      due.roster ? this.api.teamStats() : null,
      due.games ? this.api.teamGames() : null,
      due.balance && this.api.balance ? this.api.balance() : null,
    ]);

    // An expired credential is not a transport failure - every subsequent
    // request this minute would fail the same way, and writing samples from a
    // half-answered API would put fiction in the trail.
    const authFailure = [roster, games].find((r) => r && !r.ok && r.error.code === 'AUTH');
    if (authFailure) return this.#reportAuthExpired(now);

    record(snapshots, 'roster', roster, failures);
    record(snapshots, 'games', games, failures);
    record(snapshots, 'balance', balance, failures);

    const slugs = await this.#gameSlugs(roster, games);
    if (due.gameStats && slugs.length) {
      const results = await mapWithConcurrency(slugs, GAME_STATS_CONCURRENCY, (slug) => this.api.gameStats(slug));
      for (let i = 0; i < slugs.length; i++) {
        const result = results[i];
        if (result.ok) snapshots.perGame[slugs[i]] = { ok: true, endpoint: result.endpoint, data: result.data };
        else failures.push({ endpoint: `gameStats:${slugs[i]}`, ...result.error });
        if (!result.ok && result.error.code === 'AUTH') return this.#reportAuthExpired(now);
      }
    }

    if (due.graph) {
      const graph = await this.api.graph();
      record(snapshots, 'graph', graph, failures);
    }
    if (due.lifetime) {
      const lifetime = await this.api.teamStats({ start: this.config.lifetimeStart, end: isoDate(now) });
      record(snapshots, 'lifetime', lifetime, failures);
    }

    const samples = normalise({
      roster: roster?.ok ? roster.data : null,
      games: games?.ok ? games.data : null,
      balance: balance?.ok ? balance.data : null,
    });
    // The per-mode array has been fetched every tick since the beginning and
    // only ever survived as the `:latest` snapshot, which the next tick
    // overwrote. Keeping it as a trail is what makes "what did the bonus round
    // earn between 14:35 and 14:40" answerable, and it costs no extra request.
    samples.modes = normaliseModes(snapshots.perGame);

    // One read of the trail serves both the detector and the tick's own
    // per-minute deltas.
    const trails = await this.#trailWith(samples, now);
    const alerts = trails ? this.gate.admit(detect({ now, trails, config: this.config.detect }), now) : [];
    const tickDeltas = trails ? rosterDeltas(trails) : null;

    // Raised outside the detector: this is a fact about the roster, not a
    // statistical finding, and it must not wait out the 12-sample warm-up that
    // every metric on a brand-new game is subject to.
    for (const slug of await this.#newGames(slugs)) {
      alerts.push({
        ts: now,
        severity: 'warn',
        kind: 'new_game',
        game: slug,
        metric: 'roster',
        value: slugs.length,
        baseline: slugs.length - 1,
        z: 0,
        message: `${slug} is live - the roster is now ${slugs.length} games`,
      });
    }

    this.windowAlerts.push(...alerts);
    const summary = this.#summaryIfDue(due, trails, now, tickIndex);

    const totalFailure = !roster?.ok && !games?.ok;
    this.consecutiveFailures = failures.length ? this.consecutiveFailures + 1 : 0;
    this.consecutiveTotalFailures = totalFailure ? this.consecutiveTotalFailures + 1 : 0;

    if (this.consecutiveTotalFailures === TOTAL_FAILURES_BEFORE_ALERT) {
      alerts.push({
        ts: now,
        severity: 'crit',
        kind: 'poll_failure',
        game: 'team',
        metric: 'poll',
        value: this.consecutiveTotalFailures,
        baseline: 0,
        z: 0,
        message: `no endpoint has answered for ${this.consecutiveTotalFailures} consecutive minutes`,
      });
    }

    await writeTick(
      this.client,
      this.keys,
      {
        ts: now,
        ok: failures.length === 0,
        snapshots,
        samples,
        alerts,
        summary,
        meta: this.#meta({ auth_state: 'ok', last_error: failures.at(-1)?.message ?? '' }),
      },
      this.config.retention,
    );

    return { ok: failures.length === 0, ts: now, failures, alerts, deltas: tickDeltas, summary, authExpired: false };
  }

  /**
   * The stored trail with this minute's sample appended.
   *
   * The sample has not been written yet - the whole tick goes out in one MULTI
   * at the end. Appending it in memory is what lets a spike be reported in the
   * minute it happens rather than the minute after, and it is also what makes
   * this tick's own delta available before the write.
   */
  async #trailWith(samples, now) {
    try {
      const names = Object.keys(samples.games);
      const trails = await readTrails(this.client, this.keys, names, this.config.detect.window + 2);

      if (Object.keys(samples.team).length) trails.team.push({ ts: now, fields: samples.team });
      if (Object.keys(samples.online).length) trails.online.push({ ts: now, fields: samples.online });
      for (const [name, fields] of Object.entries(samples.games)) {
        (trails.games[name] ??= []).push({ ts: now, fields });
      }
      return trails;
    } catch {
      return null; // detection must never be the reason a tick fails to record
    }
  }

  /**
   * One running-log entry every `intervals.summary` ticks.
   *
   * Skipped on the very first tick of a run: the window would start before the
   * poller did, and a summary of a period nobody measured is a fiction.
   */
  #summaryIfDue(due, trails, now, tickIndex) {
    if (!due.summary || !trails || tickIndex === 0) return null;

    const minutes = this.config.intervalMinutes?.summary ?? this.config.pollMinutes ?? 5;
    const from = this.lastSummaryAt ?? now - minutes * 60000;
    const summary = buildSummary(trails, this.windowAlerts, { from, to: now });

    this.windowAlerts = [];
    this.lastSummaryAt = now;
    return summary;
  }

  /**
   * Which games to ask about this tick.
   *
   * Two sources, because they disagree at exactly the moment that matters. The
   * roster (`/stats`) is the authority on figures but only lists a game once it
   * has some. The catalogue (`/games`) knows a game is live the moment it is,
   * and is already being fetched. Taking the union means a launch is watched
   * from the flag flip rather than from the first settled bet.
   *
   * Falls back to the last tick's list, then to the stored snapshots, so a
   * transport failure does not silently shrink the roster to nothing.
   */
  async #gameSlugs(roster, games) {
    const merged = mergeSlugs(
      roster?.ok ? gameIds(roster.data) : [],
      games?.ok ? liveGameIds(games.data) : [],
    );
    if (merged.length) { this.knownGames = merged; return merged; }

    if (this.knownGames.length) return this.knownGames;
    const [rosterSnap, gamesSnap] = await Promise.all([
      readSnapshot(this.client, this.keys.roster),
      readSnapshot(this.client, this.keys.games),
    ]);
    this.knownGames = mergeSlugs(gameIds(rosterSnap?.data), liveGameIds(gamesSnap?.data));
    return this.knownGames;
  }

  /**
   * The slugs never seen before, and the bookkeeping that keeps it to once.
   *
   * Returns nothing when there was no prior knowledge to compare against: a
   * cold start meets the whole roster at once, and ten "a game went live"
   * findings on first boot would train the reader to ignore the one that
   * matters.
   */
  async #newGames(slugs) {
    if (!this.seeded) {
      const [rosterSnap, gamesSnap] = await Promise.all([
        readSnapshot(this.client, this.keys.roster),
        readSnapshot(this.client, this.keys.games),
      ]);
      for (const slug of mergeSlugs(gameIds(rosterSnap?.data), liveGameIds(gamesSnap?.data))) {
        this.seenGames.add(slug);
      }
      this.seeded = true;
    }

    const hadPriorKnowledge = this.seenGames.size > 0;
    const fresh = slugs.filter((slug) => !this.seenGames.has(slug));
    for (const slug of slugs) this.seenGames.add(slug);
    return hadPriorKnowledge ? fresh : [];
  }

  async #reportAuthExpired(now) {
    this.consecutiveFailures += 1;
    await writeMeta(this.client, this.keys, this.#meta({
      auth_state: 'expired',
      last_error: 'the sid was rejected (401/403)',
      last_attempt: String(now),
    }));
    const alert = {
      ts: now,
      severity: 'crit',
      kind: 'auth',
      game: 'team',
      metric: 'sid',
      value: 0,
      baseline: 0,
      z: 0,
      message: 'the sid expired - polling is paused until a new one is supplied',
    };
    await writeAlert(this.client, this.keys, alert, this.config.retention).catch(() => {});
    return { ok: false, ts: now, failures: [{ endpoint: 'auth', code: 'AUTH', message: 'sid rejected' }], alerts: [alert], deltas: null, authExpired: true };
  }

  /** Never put the sid itself in here - only a fingerprint of it. */
  #meta(extra) {
    return {
      ...extra,
      consecutive_failures: String(this.consecutiveFailures),
      sid_fingerprint: this.sidFingerprint ?? '',
      sid_source: this.sidSource ?? '',
      schema_version: SCHEMA_VERSION,
      pid: String(process.pid),
    };
  }

  /** Called when the credential is replaced mid-run. */
  setSid(sid, source) {
    this.api.setSid(sid);
    this.sidFingerprint = fingerprint(sid);
    this.sidSource = source;
  }
}

/**
 * Reduce the API payloads to the numbers the trail stores.
 *
 * Shapes here are pinned to what studio.engine.io actually returns (captured
 * in test/fixtures/live.mjs), not to what the endpoint table implies:
 *
 *   /stats    an array of { name, slug, stats: { count, turnover, profit,
 *             expectedProfit, unique } } - the metrics are NESTED
 *   /games    the whole catalogue, with onlinePlayers and month/day totals
 *             PER GAME; the team figure is the sum, and unreleased titles
 *             carry stats: null
 *   /balance  { position, expectedProfit, carry } - a separate endpoint, the
 *             roster response has no balance in it at all
 *
 * Games are keyed by SLUG throughout. The display name is not an identifier:
 * requesting `Pixel Nest` instead of `pixel-nest` is a 404.
 */
export function normalise({ roster, games, balance }) {
  const out = { team: {}, online: {}, games: {} };

  const catalogue = indexBySlug(listOf(games));

  for (const entry of listOf(roster)) {
    const slug = idOf(entry);
    if (!slug) continue;

    const fields = {};
    assign(fields, entry.stats ?? entry, {
      count: ['count', 'spins', 'bets'],
      turnover: ['turnover', 'wagered'],
      profit: ['profit', 'revenue'],
      unique: ['unique', 'uniquePlayers'],
      expectedProfit: ['expectedProfit', 'expected'],
    });

    // Per-game concurrent players is the sharpest "traffic moved to this game"
    // signal available, and it is already in the catalogue response.
    const listed = catalogue.get(slug);
    if (listed && Number.isFinite(Number(listed.onlinePlayers))) {
      fields.onlinePlayers = Number(listed.onlinePlayers);
    }

    if (Object.keys(fields).length) out.games[slug] = fields;
  }

  // Team totals are the sum of the roster - there is no team-level row.
  for (const field of ['count', 'turnover', 'profit', 'expectedProfit']) {
    const values = Object.values(out.games).map((g) => g[field]).filter(Number.isFinite);
    if (values.length) out.team[field] = values.reduce((a, b) => a + b, 0);
  }

  if (balance) {
    assign(out.team, balance, {
      position: ['position'],
      carry: ['carry'],
      balanceExpectedProfit: ['expectedProfit'],
    });
  }

  const listed = [...catalogue.values()];
  if (listed.length) {
    out.online.onlinePlayers = sum(listed.map((g) => g.onlinePlayers));
    out.online.dayTurnover = sum(listed.map((g) => g.stats?.day?.turnover));
    out.online.dayProfit = sum(listed.map((g) => g.stats?.day?.profit));
    out.online.dayCount = sum(listed.map((g) => g.stats?.day?.count));
    out.online.monthTurnover = sum(listed.map((g) => g.stats?.month?.turnover));
    out.online.monthProfit = sum(listed.map((g) => g.stats?.month?.profit));
  }

  return out;
}

/**
 * What changed across the whole roster in this minute, in raw API units.
 *
 * Summed from each game's last two samples. Null until at least one game has
 * two samples to difference - a first tick has nothing to compare against, and
 * reporting 0 there would claim a quiet minute that was never measured.
 *
 * Month rollovers are handled by `deltas()`, so a reset contributes that
 * minute's real volume rather than a large negative number.
 */
export function rosterDeltas(trails) {
  const fields = ['turnover', 'profit', 'count'];
  const totals = { turnover: 0, profit: 0, count: 0 };
  let measured = false;

  for (const samples of Object.values(trails?.games ?? {})) {
    if (!Array.isArray(samples) || samples.length < 2) continue;
    for (const field of fields) {
      const series = samples.map((s) => Number(s?.fields?.[field] ?? 0));
      const last = toDeltas(series).at(-1);
      if (Number.isFinite(last)) {
        totals[field] += last;
        measured = true;
      }
    }
  }

  return measured ? totals : null;
}

function indexBySlug(entries) {
  const map = new Map();
  for (const entry of entries) {
    const slug = idOf(entry);
    if (slug) map.set(slug, entry);
  }
  return map;
}

function sum(values) {
  return values.map(Number).filter(Number.isFinite).reduce((a, b) => a + b, 0);
}

function assign(target, source, spec) {
  for (const [field, paths] of Object.entries(spec)) {
    for (const path of paths) {
      const value = dig(source, path);
      const n = Number(value);
      if (value !== undefined && value !== null && Number.isFinite(n)) {
        target[field] = n;
        break;
      }
    }
  }
}

function dig(obj, path) {
  return path.split('.').reduce((acc, part) => (acc == null ? undefined : acc[part]), obj);
}

function record(snapshots, name, result, failures) {
  if (!result) return;
  if (result.ok) snapshots[name] = { ok: true, endpoint: result.endpoint, data: result.data };
  else failures.push({ endpoint: name, ...result.error });
}

function isoDate(ms) {
  return new Date(ms).toISOString().slice(0, 10);
}

/** A small pool - the API is somebody else's service, not a load target. */
async function mapWithConcurrency(items, limit, fn) {
  const out = new Array(items.length);
  let cursor = 0;
  const workers = Array.from({ length: Math.min(limit, items.length) }, async () => {
    while (cursor < items.length) {
      const index = cursor++;
      out[index] = await fn(items[index], index);
    }
  });
  await Promise.all(workers);
  return out;
}
