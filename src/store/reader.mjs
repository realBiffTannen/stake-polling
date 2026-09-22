/** Read side. Used by the dashboard, and by the poller to rebuild its baselines. */

import { gameIds, liveGameIds, mergeSlugs } from '../games.mjs';

const NUMERIC_ALERT_FIELDS = ['ts', 'value', 'baseline', 'z'];

/**
 * Everything one dashboard frame needs, in one round of reads.
 * @param {number} alertLimit how many recent alerts to return, newest first
 */
export async function readDashboard(client, k, alertLimit = 50) {
  const [meta, roster, games, graph, lifetime, balance, alerts, summaries] = await Promise.all([
    client.hGetAll(k.meta),
    readSnapshot(client, k.roster),
    readSnapshot(client, k.games),
    readSnapshot(client, k.graph),
    readSnapshot(client, k.lifetime),
    readSnapshot(client, k.balance),
    readAlerts(client, k, alertLimit),
    readSummaries(client, k, 12),
  ]);

  const names = gameNames(roster, games);
  const perGame = {};
  await Promise.all(
    names.map(async (name) => {
      const snap = await readSnapshot(client, k.game(name));
      if (snap) perGame[name] = snap;
    }),
  );

  return { meta: meta ?? {}, roster, games, graph, lifetime, balance, perGame, alerts, summaries, gameNames: names };
}

/**
 * Trails in exactly the shape src/detect/rules.mjs consumes: oldest-first
 * samples of `{ ts, fields }` with numeric field values.
 *
 * With `{ modes: true }` the result also carries `modes[slug]`, the per-bet-mode
 * trail whose fields are `MODE:field` (see src/modes.mjs).
 */
export async function readTrails(client, k, names, window, { modes = false } = {}) {
  const [team, online] = await Promise.all([
    readStream(client, k.tsTeam, window),
    readStream(client, k.tsOnline, window),
  ]);
  const games = {};
  const modeTrails = modes ? {} : undefined;
  await Promise.all(
    names.map(async (name) => {
      games[name] = await readStream(client, k.tsGame(name), window);
      if (modes) modeTrails[name] = await readStream(client, k.tsGameModes(name), window);
    }),
  );
  // Opt-in because the poller reads this every tick purely to feed the
  // detector, and the detector works on game totals - doubling its reads to
  // fetch per-mode trails nothing looks at would be a cost with no reader.
  return modes ? { team, online, games, modes: modeTrails } : { team, online, games };
}

/**
 * Every game's trail from `fromMs` onwards, oldest-first, in the same sample
 * shape `readTrails` returns.
 *
 * By time rather than by count, for the daily table: "the last N samples" only
 * means "the last N days" while the poll period never changes, and the trail
 * outlives any one setting of it.
 */
export async function readGameTrailsSince(client, k, names, fromMs) {
  const games = {};
  await Promise.all(
    names.map(async (name) => {
      const rows = await client.xRange(k.tsGame(name), String(Math.floor(fromMs)), '+');
      games[name] = (rows ?? []).map((row) => ({ ts: idToMs(row.id), fields: numeric(row.message) }));
    }),
  );
  return games;
}

/**
 * One game's per-bet-mode trail, on its own.
 *
 * `readTrails({ modes: true })` reads every game's mode trail at once - the
 * right cost for the TUI, which pays it once per interactive frame. A web
 * request only ever needs the one game it is drilling into, so this reads
 * just that game's stream rather than paying for the whole roster on every
 * page load.
 */
export async function readModeTrail(client, k, slug, window) {
  return readStream(client, k.tsGameModes(slug), window);
}

export async function readSnapshot(client, key) {
  const raw = await client.get(key);
  if (!raw) return null;
  try {
    return JSON.parse(raw);
  } catch {
    return null;
  }
}

export async function readAlerts(client, k, limit = 50) {
  const rows = await client.xRevRange(k.alerts, '+', '-', { COUNT: limit });
  return (rows ?? []).map((row) => {
    const alert = { ...row.message };
    for (const field of NUMERIC_ALERT_FIELDS) {
      if (alert[field] !== undefined) alert[field] = Number(alert[field]);
    }
    return alert;
  });
}

const NUMERIC_SUMMARY_FIELDS = ['from', 'to', 'minutes', 'turnover', 'profit', 'count', 'onlinePlayers', 'activeGames', 'topMoverTurnover', 'alerts', 'crits', 'warns'];

/** The running action log, newest first. */
export async function readSummaries(client, k, limit = 12) {
  const rows = await client.xRevRange(k.summary, '+', '-', { COUNT: limit });
  return (rows ?? []).map((row) => {
    const entry = { ...row.message };
    for (const field of NUMERIC_SUMMARY_FIELDS) {
      if (entry[field] !== undefined) entry[field] = Number(entry[field]);
    }
    return entry;
  });
}

/** Newest `count` entries of a stream, returned oldest-first. */
async function readStream(client, key, count) {
  const rows = await client.xRevRange(key, '+', '-', { COUNT: count });
  return (rows ?? [])
    .map((row) => ({ ts: idToMs(row.id), fields: numeric(row.message) }))
    .reverse();
}

function numeric(message) {
  const out = {};
  for (const [key, value] of Object.entries(message ?? {})) {
    const n = Number(value);
    out[key] = Number.isFinite(n) && value !== '' ? n : value;
  }
  return out;
}

function idToMs(id) {
  return Number(String(id).split('-')[0]);
}

/**
 * Every game worth reading: the roster, plus anything the catalogue says is
 * live that the roster has not listed yet.
 *
 * The union rather than a fallback. A game that goes live before it takes its
 * first bet is in `/games` with `isLive: true` and absent from `/stats`, and
 * treating the catalogue as a fallback would only consult it when the roster
 * was EMPTY - which is to say never, exactly when it is needed.
 *
 * Dark titles are excluded: 15 of the 25 catalogue entries are unreleased and
 * every per-game read against one is a 404.
 */
function gameNames(roster, games) {
  return mergeSlugs(gameIds(roster?.data), liveGameIds(games?.data));
}

/**
 * The team trail from `fromMs` on, oldest first - by TIME, not by count. The
 * settlement page compares today with the same slice of yesterday, so it needs
 * a reading at or before yesterday's midnight, and a sample count cannot
 * promise that: the trail has been written at 30-second and 1-minute spacing
 * as well as 2.5-minute, so N samples cover a different span in each era.
 */
export async function readTeamTrailSince(client, k, fromMs) {
  return readSince(client, k.tsTeam, fromMs);
}

/** Any trail stream from `fromMs` on, oldest first, in the usual sample shape. */
export async function readSince(client, key, fromMs) {
  const rows = await client.xRange(key, String(Math.floor(fromMs)), '+');
  return (rows ?? []).map((row) => ({ ts: idToMs(row.id), fields: numeric(row.message) }));
}
