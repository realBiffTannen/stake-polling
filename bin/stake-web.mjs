#!/usr/bin/env node
import { createClient } from 'redis';
import { loadConfig } from '../src/config.mjs';
import { keys } from '../src/store/keys.mjs';
import { redisOptions } from '../src/store/redis.mjs';
import { storeFor, dashboardArchive } from '../src/archive/stores.mjs';
import { createAuth } from '../src/web/auth.mjs';
import { readDashboard, readTrails, readSnapshot, readModeTrail, readTeamTrailSince, readSince } from '../src/store/reader.mjs';
import { buildState } from '../src/tui/state.mjs';
import { ApiClient } from '../src/api/client.mjs';
import { readSidFile } from '../src/sid/index.mjs';
import { Lock } from '../src/poll/lock.mjs';
import { syncDaily } from '../src/insights/sync.mjs';
import { buildRollups } from '../src/insights/rollup.mjs';
import { buildInsights } from '../src/insights/model.mjs';
import { createWebServer } from '../src/web/server.mjs';
import { createDataCache } from '../src/web/data-cache.mjs';
import { periodMs } from '../src/poll/schedule.mjs';
import { loadMathModel } from '../src/math/checks.mjs';
import { titlesOf } from '../src/games.mjs';
import { logSources, readLog } from '../src/store/log.mjs';
import { wideCsv, longCsv, dayBounds } from '../src/store/export.mjs';

const config = loadConfig(), k = keys(config.team);
// Loaded once at startup, not per request: the model file does not change
// while the process is running, and re-parsing it on every dashboard read
// would be pure waste.
// math.json at the root, unless STAKE_MATH_FILE names another (the demo build does).
const mathModel = loadMathModel(process.env.STAKE_MATH_FILE || new URL('../math.json', import.meta.url).pathname);
let host = process.env.STAKE_WEB_HOST ?? config.web?.host ?? '0.0.0.0';
let port = Number(process.env.STAKE_WEB_PORT ?? config.web?.port ?? 3005);
let syncEnabled = process.env.STAKE_WEB_SYNC !== '0';
const args = process.argv.slice(2);
for (let i = 0; i < args.length; i++) {
  if (args[i] === '--host') host = args[++i];
  else if (args[i] === '--port') port = Number(args[++i]);
  else if (args[i] === '--no-sync') syncEnabled = false;
  else if (args[i] === '--help') {
    console.log('Usage: npm run web -- [--port 3005] [--host 0.0.0.0] [--no-sync]');
    console.log('The dashboard is unauthenticated. --host 127.0.0.1 keeps it on this machine.');
    process.exit(0);
  } else { console.error(`Unknown option: ${args[i]}`); process.exit(1); }
}
if (!host || !Number.isInteger(port) || port < 1 || port > 65535) {
  console.error('Provide a host and a port between 1 and 65535.'); process.exit(1);
}
const client = createClient({ ...redisOptions(config.redisUrl), socket: { connectTimeout: 5000, reconnectStrategy: n => n < 3 ? 500 : false } });
client.on('error', () => console.error('Redis connection unavailable.'));
try { await client.connect(); } catch { console.error('Start Redis, then run npm run web again.'); process.exit(1); }

// One Redis read per poll tick, shared by every request until the poller
// announces its next tick (or one poll period passes - see data-cache.mjs).
const dataCache = createDataCache({
  ttlMs: periodMs(config.pollMinutes),
  versionOf: (data) => data.dashboard.meta?.last_ok ?? null,
  load: async () => {
    // The per-mode daily rollup (src/insights/rollup.mjs) accumulates forward
    // into this key from the five-minute mode trail; nothing in these two
    // pages computes it inline, since scanning a month of trail on every
    // dashboard request is the cost that rollup exists to avoid. Until a
    // separate job writes it, this reads back empty and the mode/game pages
    // simply show "no daily history yet" rather than fabricating one.
    const [dashboard, snapshot, modeRollup, catalogue] = await Promise.all([
      readDashboard(client, k),
      readSnapshot(client, k.dailyInsights),
      readSnapshot(client, k.modeRollup),
      // No writer populates this key yet (a later task adds one), so this
      // reads back null today and the trends page falls back to `{}` -
      // rendering every released day as reconstructed rather than failing.
      readSnapshot(client, k.catalogue),
    ]);
    const trails = await readTrails(client, k, dashboard.gameNames, Math.ceil(1440 / config.pollMinutes) + 2);
    // Explicit allow-list: the browser never receives credentials or their hashes.
    dashboard.meta = Object.fromEntries(['last_ok', 'auth_state', 'persistence'].map(key => [key, dashboard.meta[key]]));
    dashboard.meta.team = config.team;
    return { dashboard, trails, snapshot: snapshot ?? {}, modeRollup: modeRollup ?? { version: 1, games: {} }, catalogue: catalogue ?? {} };
  },
});
const readData = () => dataCache.get();
// Per-mode trails, memoised per data version: the analysis page wants every
// game's, and re-reading 13 streams for each span of it would undo the cache.
let modeMemo = { version: null, trails: new Map() };
// One stream read back by time and memoised per data version: seven days of
// it for the players-online chart and the hour-of-day profile, and as long as
// the span for an analysis window beyond the shared 24-hour trail.
let historyMemo = { version: null, streams: new Map() };
function historyOf(version, key, now, hours = 7 * 24) {
  if (historyMemo.version !== version) historyMemo = { version, streams: new Map() };
  const id = `${hours}h:${key}`;
  if (!historyMemo.streams.has(id)) historyMemo.streams.set(id, readSince(client, key, now - hours * 3_600_000 - 30 * 60_000));
  return historyMemo.streams.get(id);
}
async function modeTrailFor(version, slug) {
  if (modeMemo.version !== version) modeMemo = { version, trails: new Map() };
  if (!modeMemo.trails.has(slug)) modeMemo.trails.set(slug, readModeTrail(client, k, slug, Math.ceil(1440 / config.pollMinutes) + 2));
  return modeMemo.trails.get(slug);
}
// The poll log reads Redis directly, a page at a time - it is the one view
// whose whole point is the raw entries, so it goes around the dashboard model.
async function log(query) {
  const sources = await logSources(client, k);
  const wanted = query.get('source');
  const source = sources.some(s => s.id === wanted) ? wanted : 'all';
  const page = await readLog(client, source === 'all' ? sources : sources.filter(s => s.id === source),
    { before: query.get('before'), after: query.get('after'), oldest: query.get('oldest') === '1' });
  return { page, sources, source };
}
// Raw CSV of the poll log: one stream wide (a column per field), or every
// stream long (a row per data point), for one UTC day or everything retained.
// Null for a stream that does not exist, which the server turns into a 404.
async function exporter(query) {
  const sources = await logSources(client, k);
  const source = query.get('source') || 'all';
  const date = query.get('date') || null;
  const bounds = date ? dayBounds(date) : null;
  if (source === 'all') return { filename: `stake-all-${date ?? 'retained'}.csv`, chunks: longCsv(client, sources, bounds) };
  const one = sources.find(s => s.id === source);
  if (!one) return null;
  return { filename: `stake-${source}-${date ?? 'retained'}.csv`, chunks: wideCsv(client, one, bounds) };
}
// The nightly archive's store, for the archive page: the files it holds, a
// download link for each, and the archiver's last run. The web process never
// writes to it - bin/stake-archive.mjs does.
let archiveStore = null;
let archiveSetupError = null;
try { archiveStore = await storeFor(config); } catch (err) { archiveSetupError = String(err?.message ?? err); }
const archive = dashboardArchive({ store: archiveStore, setupError: archiveSetupError, readStatus: () => readSnapshot(client, k.archiveStatus) });
// Optional sign-in (src/web/auth.mjs): off until turned on from Settings.
const auth = createAuth({ client, k });
// Standing warnings dismissed for everyone - one Redis set of their keys.
const dismissals = {
  list: () => client.sMembers(k.dismissed),
  add: (key) => client.sAdd(k.dismissed, key),
  clear: () => client.del(k.dismissed),
};
const server = createWebServer({ log, exporter, archive, auth, dismissals, version: () => dataCache.version(), pageTtlMs: periodMs(config.pollMinutes), read: async (query, hint) => {
  const { dashboard, trails, snapshot, modeRollup, catalogue } = await readData(), now = Date.now();
  const state = buildState(dashboard, trails, now, config);
  const listings = state.rows.map(r => ({ slug: r.name, name: r.label }));
  // The captured math corpus, and the per-mode data the game/mode pages need,
  // attached onto the state buildState() already produced rather than folded
  // into it - buildState is shared with the TUI, and neither of those pages
  // exists there.
  state.math = mathModel;
  // Standing warnings someone dismissed for everyone (views/parts.mjs).
  state.dismissed = new Set(await dismissals.list());
  // Same reasoning for the release catalogue the trends page reads: no
  // writer populates k.catalogue yet (a later task adds one), so this is
  // `{}` today and releasedSeries() reconstructs every day from first
  // activity rather than the page failing to render.
  state.catalogue = catalogue;
  // The slugs of all live games, for the math corpus page to identify games
  // that have no captured model.
  state.liveSlugs = (dashboard.games?.data ?? []).filter(g => g?.isLive).map(g => g.slug);
  // Every catalogue title, live or not, through titlesOf()'s allow-list - the
  // overview's not-yet-live table and those titles' game pages read it.
  state.titles = titlesOf(dashboard.games?.data);
  // dashboard.perGame is keyed by slug with each entry shaped
  // `{ ts, endpoint, ok, data: { name, slug, image, stats: [...], betStats } }`
  // (see src/store/writer.mjs putSnapshot and the gameStats fixture in
  // test/fixtures/live.mjs) - NOT `dashboard.games`, which is the raw
  // `/games` catalogue snapshot. `stats` is already the per-mode row array
  // these pages want, untouched - PROVIDED it actually is one.
  //
  // Two guards, both explicit rather than assumed:
  //   `payload?.ok`            putSnapshot only ever persists an ok:true
  //                            snapshot today, but that invariant lives in
  //                            src/store/writer.mjs, a different module. This
  //                            reader does not trust it silently.
  //   `Array.isArray(stats)`   the upstream payload is untrusted JSON. `?? []`
  //                            alone only catches a MISSING stats field; a
  //                            present-but-malformed one (an object, a
  //                            string, ...) would sail through and blow up
  //                            the view's `.reduce`/`.map`/`.find` calls,
  //                            which the request handler then turns into a
  //                            503 for a page that had everything else it
  //                            needed to render.
  state.modeRows = Object.fromEntries(Object.entries(dashboard.perGame ?? {})
    .map(([slug, payload]) => [slug, payload?.ok && Array.isArray(payload?.data?.stats) ? payload.data.stats : []]));
  state.modeDays = Object.fromEntries(Object.entries(modeRollup.games ?? {}).map(([slug, days]) => [slug, days]));
  // Players online, for the analysis page's hourly chart - already read as
  // part of the trails above, so this costs nothing.
  state.onlineTrail = trails.online ?? [];
  if (hint?.history) {
    const v = dashboard.meta?.last_ok ?? null;
    state.history = hint.history === 'studio'
      ? { online: await historyOf(v, k.tsOnline, now), team: await historyOf(v, k.tsTeam, now) }
      : { game: await historyOf(v, k.tsGame(hint.history), now) };
  }
  // An analysis span longer than the shared trail (Last 3 days) reads its own
  // trails by time - by count, the trail's older, denser eras would cover less
  // than the label says. Kept apart from gameTrails/modeTrails, which the tape
  // and the quiet share read as the last 24 hours whatever span is picked.
  if (hint?.trailHours) {
    const v = dashboard.meta?.last_ok ?? null;
    const slugs = dashboard.gameNames;
    const [online, ...read] = await Promise.all([historyOf(v, k.tsOnline, now, hint.trailHours),
      ...slugs.map(slug => historyOf(v, k.tsGame(slug), now, hint.trailHours)),
      ...slugs.map(slug => historyOf(v, k.tsGameModes(slug), now, hint.trailHours))]);
    state.spanTrails = { online,
      games: Object.fromEntries(slugs.map((slug, i) => [slug, read[i]])),
      modes: Object.fromEntries(slugs.map((slug, i) => [slug, read[slugs.length + i]])) };
  }
  // The poll tick this state was built from - the page cache's key.
  state.dataVersion = dashboard.meta?.last_ok ?? null;
  // The raw upstream snapshots, for the settlement and data-health views,
  // which reconcile one endpoint against another and so need them unchewed.
  // Server-side only: views render figures computed from these, never the
  // payloads themselves.
  state.raw = { roster: dashboard.roster, games: dashboard.games, balance: dashboard.balance,
    graph: dashboard.graph, lifetime: dashboard.lifetime, perGame: dashboard.perGame ?? {} };
  // The daily-insights snapshot (per game, per UTC day), for the unusual-days
  // finder - already in hand from readData(), so this costs nothing.
  state.dailySnapshot = snapshot;
  // How often each endpoint is polled, in ticks - the freshness check needs it
  // to tell a stale snapshot from one that is simply polled less often.
  state.cadence = config.intervals ?? {};
  // The team trail back to just before yesterday's 00:00Z, only for the view
  // that compares today with the same slice of yesterday. By time, not count:
  // the trail's spacing has changed over its life.
  if (hint?.teamDays) {
    const d = new Date(now);
    const midnight = Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate());
    state.teamTrail = await readTeamTrailSince(client, k, midnight - (hint.teamDays - 1) * 86_400_000 - 30 * 60_000);
  }
  // The per-mode trail is otherwise never fetched on this path (see readData
  // above) - reading it for every game on every request would double the
  // Redis cost of pages that never use it. Three readers ask for it through
  // the hint: the bucket-cadence page (one game), a game page on a trail span
  // (one game), and the analysis page on a trail span (every game).
  const modeSlugs = hint?.modesFor === 'all' ? dashboard.gameNames
    : [...new Set([hint?.modesFor, hint?.bucketsSlug].filter(Boolean))];
  if (modeSlugs.length) {
    const read = await Promise.all(modeSlugs.map(slug => modeTrailFor(dashboard.meta?.last_ok ?? null, slug)));
    state.modeTrails = { ...state.modeTrails, ...Object.fromEntries(modeSlugs.map((slug, i) => [slug, read[i]])) };
  }
  return { state, model: buildInsights({ snapshot, now, query, money: config.money, listings }) };
} });
try {
  await new Promise((resolve, reject) => { server.once('error', reject); server.listen(port, host, resolve); });
} catch (err) {
  console.error(err.code === 'EADDRINUSE' ? `Port ${port} is already in use. Choose --port <number>.` : 'Could not start the web server.');
  await client.quit(); process.exit(1);
}
// The pages most visited, and the fragments their open tabs refresh with,
// rendered into the page cache as soon as a tick's data is in Redis - so the
// first visitor after a poll never waits for a render.
const WARM = ['/', '/analysis', '/trends', '/settlement', '/insights', '/live', '/log']
  .flatMap((path) => [path, `${path}?fragment=1`]);
const warm = () => server.warm(WARM).catch(() => {});
// The poller PUBLISHes on the tick channel after each tick's MULTI lands.
// Listening needs its own connection (a subscribed client can do nothing
// else); without it the caches still turn over on the poll-period TTL.
try {
  const sub = client.duplicate();
  sub.on('error', () => {});
  await sub.connect();
  await sub.subscribe(k.chTick, () => { dataCache.invalidate(); warm(); });
} catch {
  console.error('Tick announcements unavailable - cached pages refresh once per poll period instead.');
}
warm();
console.log(`Player insights: http://${host}:${port}`);
if (host === '0.0.0.0') console.log('  (reachable by anyone on this network - no password. --host 127.0.0.1 to keep it local)');
console.log(syncEnabled ? 'Daily history sync enabled; cached history refreshes every 3 minutes.' : 'Daily history sync disabled; displaying cached data.');

const abort = new AbortController();
const lock = new Lock(client, k.lockInsights, 180);
let syncing = null;
async function runSync() {
  if (syncing || abort.signal.aborted) return;
  syncing = (async () => {
    if (!await lock.acquire()) return;
    try {
      const previous = await readSnapshot(client, k.dailyInsights) ?? {};
      const sid = process.env.STAKE_SID || await readSidFile(config.sidFile);
      if (!sid) {
        await client.set(k.dailyInsights, JSON.stringify({ ...previous, error: 'AUTH' }));
        console.log('Daily history needs .sid or STAKE_SID; cached data remains available.');
        return;
      }
      const api = new ApiClient({ ...config, sid });
      const save = async snapshot => {
        if (!await lock.refresh()) throw new Error('LOCK_LOST');
        await client.set(k.dailyInsights, JSON.stringify(snapshot));
      };
      const snapshot = await syncDaily({ api, previous, trackingStart: config.lifetimeStart, days: 30,
        delayMs: 100, signal: abort.signal, onProgress: save });
      await save(snapshot);
      console.log(`Daily history: ${Object.keys(snapshot.days).length} days cached${snapshot.error ? `; sync ${snapshot.error}` : ''}.`);

      // Per-mode history lives ONLY in the five-minute trail (30-day Redis
      // retention) and the catalogue's live-set has no release date in the
      // API at all - both are unrecoverable once they age out, so this rolls
      // them forward into their own keys every sync rather than leaving them
      // to be recomputed later from data that will already be gone.
      const listingSnapshot = await readSnapshot(client, k.games);
      // A Redis hiccup on k.games must not read back as "zero games were
      // live today" - that is a fact about the read, not about the roster,
      // and this studio never actually has zero live games. Treat anything
      // short of a real, non-empty listing as unavailable and skip only the
      // catalogue write; the mode rollup below does not depend on it.
      const listingValid = Array.isArray(listingSnapshot?.data) && listingSnapshot.data.length > 0;
      const listing = listingValid ? listingSnapshot.data : [];
      const trails = await readTrails(client, k, listing.map(g => g.slug), Math.ceil(1440 / config.pollMinutes) * 31, { modes: true });
      const previousRollups = {
        modes: await readSnapshot(client, k.modeRollup) ?? {},
        catalogue: await readSnapshot(client, k.catalogue) ?? {},
      };
      const rollups = buildRollups({ previous: previousRollups, trails, listing, snapshot, now: Date.now() });
      if (!await lock.refresh()) throw new Error('LOCK_LOST');
      await client.set(k.modeRollup, JSON.stringify(rollups.modes));
      if (listingValid) {
        await client.set(k.catalogue, JSON.stringify(rollups.catalogue));
      } else {
        console.log('Catalogue rollup skipped this sync: game listing (k.games) was empty or unreadable; mode rollup still written.');
      }
    } finally { await lock.release(); }
  })().catch(() => console.error('Daily sync could not complete; will retry automatically.')).finally(() => { syncing = null; });
  return syncing;
}
if (syncEnabled) void runSync();
const timer = syncEnabled ? setInterval(runSync, 3 * 60000) : null;
let stopping = false;
async function shutdown() {
  if (stopping) return;
  stopping = true;
  if (timer) clearInterval(timer);
  abort.abort();
  await new Promise(resolve => { server.close(resolve); server.closeAllConnections(); });
  if (syncing) await syncing;
  if (client.isOpen) await client.quit();
}
process.on('SIGINT', shutdown);
process.on('SIGTERM', shutdown);
