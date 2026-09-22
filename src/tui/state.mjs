import { deltas } from '../detect/baseline.mjs';
import { toUsd, toShareUsd, DEFAULT_MONEY } from '../money.mjs';
import { dayStart, sumSince, coverage } from '../window.mjs';
import { synthesise } from '../detect/events.mjs';
import { liveListings, idOf } from '../games.mjs';
import { num } from './format.mjs';

// Two and a half poll periods: one missed tick is not yet a problem, two is.
// Tied to the period so that slowing the poller down does not make the whole
// dashboard permanently read STALE.
const STALE_MULTIPLE = 2.5;

/**
 * Fold the raw Redis reads into the shape the renderer draws.
 *
 * Kept separate from renderFrame so the arithmetic - deltas, RTP, staleness -
 * is testable without a terminal, and so a repaint costs nothing but string
 * building.
 */
/**
 * @param {object} config the loaded config, or any subset of it - the defaults
 *   keep this callable from a test with two arguments.
 */
export function buildState(dashboard, trails, now = Date.now(), config = {}) {
  const money = config.money ?? DEFAULT_MONEY;
  const pollMinutes = config.pollMinutes ?? 1;
  const games = gameList(dashboard?.roster?.data);
  const online = onlineBySlug(dashboard?.games?.data);
  const lifetime = lifetimeBySlug(dashboard?.lifetime?.data);
  const dayFrom = dayStart(now, config.dayBoundaryUtcHour ?? 12);

  const rows = games.map((entry) => {
    // The slug is the identity everywhere: URLs, Redis keys, trail lookups.
    const name = entry?.slug ?? entry?.name ?? '?';
    const trail = trails?.games?.[name] ?? [];
    const turnoverDeltas = deltas(trail.map((s) => Number(s.fields?.turnover ?? 0)));
    const countDeltas = deltas(trail.map((s) => Number(s.fields?.count ?? 0)));
    const profitDeltas = deltas(trail.map((s) => Number(s.fields?.profit ?? 0)));
    // The roster nests its metrics; fall back to the entry itself for fixtures
    // and for any future flattening upstream.
    const stats = entry?.stats ?? entry ?? {};
    const turnover = num(stats.turnover);
    const profit = num(stats.profit);
    // Not num(): a game the lifetime snapshot has not covered has no lifetime
    // figure at all, and num() would make that a measured zero. See
    // lifetimeBySlug below.
    const lifetimeTurnover = lifetime.has(name) ? lifetime.get(name) : null;

    return {
      name,
      label: entry?.name ?? name,
      count: num(stats.count),
      turnover,
      profit,
      unique: num(stats.unique),
      expectedProfit: num(stats.expectedProfit),
      online: online.get(name) ?? null,
      // RTP is computed from the GROSS figures - it is a property of the game,
      // not of the studio's share of it.
      rtp: turnover > 0 ? (1 - profit / turnover) * 100 : null,
      // Per-minute change, from the last two samples in the trail. A game with
      // only one sample has no delta yet - that is null, not zero, because a
      // zero here would read as "this game took nothing this minute".
      dCount: countDeltas.at(-1) ?? null,
      dTurnover: turnoverDeltas.at(-1) ?? null,
      dProfit: profitDeltas.at(-1) ?? null,
      spark: turnoverDeltas,
      lifetimeTurnover,
      // Display figures, matching the studio accounting page exactly.
      turnoverUsd: toUsd(turnover, money),
      // Turnover since `lifetimeStart`, from the hourly lifetime snapshot -
      // a different horizon from `turnoverUsd`, which is month-to-date.
      lifetimeTurnoverUsd: toUsd(lifetimeTurnover, money),
      profitUsd: toShareUsd(profit, money.profitShare, money),
      expectedUsd: toShareUsd(num(stats.expectedProfit), money.expectedShare, money),
      dTurnoverUsd: toUsd(turnoverDeltas.at(-1), money),
      dProfitUsd: profitDeltas.length ? toShareUsd(profitDeltas.at(-1), money.profitShare, money) : null,
      // Since the accounting day boundary, accumulated from our own trail.
      dayTurnoverUsd: toUsd(sumSince(trail, 'turnover', dayFrom), money),
      dayProfitUsd: toShareUsd(sumSince(trail, 'profit', dayFrom), money.profitShare, money),
      dayCount: sumSince(trail, 'count', dayFrom),
    };
  });

  // A game can be live before the roster grows a row for it. Showing it with
  // dashes says "live, nothing yet"; leaving it out says nothing at all, and
  // the launch goes unwatched until its first settled bet.
  const listed = new Set(rows.map((r) => r.name));
  for (const entry of liveListings(dashboard?.games?.data)) {
    const slug = idOf(entry);
    if (listed.has(slug)) continue;
    // A game that took bets in a PREVIOUS month and none in this one is live,
    // absent from the month-to-date roster, and has a lifetime turnover worth
    // showing - so the pending row gets the lifetime figure even though every
    // other number on it is unmeasured.
    rows.push(pendingRow(slug, entry, lifetime.has(slug) ? lifetime.get(slug) : null, money));
  }

  const lastOk = Number(dashboard?.meta?.last_ok ?? 0);
  return {
    now,
    // The balance endpoint is already in the same units with the share
    // applied: position === carry + (month profit x profitShare).
    team: toUsd(dashboard?.balance?.data?.position, money),
    carry: toUsd(dashboard?.balance?.data?.carry, money),
    money,
    online: sumOnline(dashboard?.games?.data),
    rows,
    perGame: dashboard?.perGame ?? {},
    alerts: dashboard?.alerts ?? [],
    meta: dashboard?.meta ?? {},
    lastOk,
    ageMs: lastOk ? now - lastOk : null,
    stale: lastOk ? now - lastOk > pollMinutes * 60000 * STALE_MULTIPLE : true,
    focus: null,
    sort: 'turnover',
    showAlerts: true,
    pollMinutes,
    rateLabel: config.rateLabel ?? (pollMinutes === 1 ? '/m' : `/${pollMinutes}m`),
    dayFrom,
    dayCoverage: coverage(trails?.online ?? [], dayFrom, now),
    events: synthesise(dashboard?.alerts ?? [], now),
    // The bucket view differences these itself, so the raw trails are kept
    // rather than a pre-chewed summary: which buckets it draws depends on how
    // tall the terminal is, and buildState does not know that.
    gameTrails: trails?.games ?? {},
    modeTrails: trails?.modes ?? {},
    bucket: null,
    summaries: dashboard?.summaries ?? [],
    summaryMinutes: Number(dashboard?.summaries?.[0]?.minutes) || (config.intervalMinutes?.summary ?? pollMinutes),
    // Turnover since tracking began, and the two facts a reader needs to
    // judge it: the date it counts from and when it was last read.
    //
    // Summed from the SNAPSHOT's own rows rather than from `rows` above, so a
    // title that has been delisted from the roster still contributes the
    // turnover it actually took. The LIFETIME TURN column therefore need not
    // add up to this tile, and that is the correct behaviour rather than a
    // discrepancy - the table shows the roster, this shows the studio.
    lifetime: {
      turnover: lifetime.size ? toUsd([...lifetime.values()].reduce((a, b) => a + b, 0), money) : null,
      from: config.lifetimeStart ?? null,
      ts: measured(dashboard?.lifetime?.ts) ? Number(dashboard.lifetime.ts) : null,
      games: lifetime.size,
    },
  };
}

/**
 * A game the catalogue calls live but the roster has not listed.
 *
 * Every figure is null, not zero. `$0.00` and `0` are measurements, and the
 * only thing actually known about this game is that it is on and how many
 * people are on it - which is precisely the fact worth showing at a launch.
 */
function pendingRow(slug, entry, lifetimeTurnover = null, money = DEFAULT_MONEY) {
  return {
    name: slug,
    label: entry?.name ?? slug,
    pending: true,
    count: null,
    turnover: null,
    profit: null,
    unique: null,
    expectedProfit: null,
    online: Number.isFinite(Number(entry?.onlinePlayers)) ? Number(entry.onlinePlayers) : null,
    rtp: null,
    dCount: null,
    dTurnover: null,
    dProfit: null,
    spark: [],
    turnoverUsd: null,
    profitUsd: null,
    expectedUsd: null,
    dTurnoverUsd: null,
    dProfitUsd: null,
    dayTurnoverUsd: null,
    dayProfitUsd: null,
    dayCount: null,
    // The one figure a pending row CAN hold, when the game earned it in an
    // earlier month. Still null when the lifetime snapshot does not list it.
    lifetimeTurnover,
    lifetimeTurnoverUsd: toUsd(lifetimeTurnover, money),
  };
}

/**
 * Lifetime turnover per slug, from the `lifetime` snapshot - the same roster
 * endpoint read over `lifetimeStart`..today on its own hourly cadence.
 *
 * A Map with the game ABSENT rather than a figure of zero, because the two
 * mean different things and only one of them is true: the lifetime range is
 * not re-read every tick, so a game the snapshot has not covered yet (a
 * launch since the last hourly read, a snapshot Redis could not serve, an
 * endpoint failure that left the previous snapshot in place) has no lifetime
 * reading at all. `Number(undefined)` and `Number(null)` are both 0, which
 * would put a confident $0.00 next to a month-to-date total contradicting it.
 */
function lifetimeBySlug(data) {
  const map = new Map();
  for (const entry of gameList(data)) {
    const slug = entry?.slug ?? entry?.name;
    const turnover = entry?.stats?.turnover ?? entry?.turnover;
    if (slug && measured(turnover)) map.set(slug, Number(turnover));
  }
  return map;
}

export function gameList(payload) {
  if (Array.isArray(payload)) return payload;
  for (const key of ['games', 'data', 'items', 'results']) {
    if (Array.isArray(payload?.[key])) return payload[key];
  }
  return [];
}

export function modeList(payload) {
  if (Array.isArray(payload)) return payload;
  // The live per-game response puts the per-mode array under `stats`.
  for (const key of ['stats', 'modes', 'betModes', 'data']) {
    if (Array.isArray(payload?.[key])) return payload[key];
  }
  return [];
}

/** onlinePlayers is reported per game; the team figure is the sum. */
function sumOnline(data) {
  return gameList(data).reduce((total, g) => total + num(g?.onlinePlayers), 0);
}

function onlineBySlug(data) {
  const map = new Map();
  for (const entry of gameList(data)) {
    const slug = entry?.slug ?? entry?.name;
    if (slug && Number.isFinite(Number(entry?.onlinePlayers))) map.set(slug, Number(entry.onlinePlayers));
  }
  return map;
}

/** A figure somebody actually measured. `Number(null)` and `Number('')` are both 0, so neither counts. */
function measured(v) {
  return v !== null && v !== undefined && v !== '' && Number.isFinite(Number(v));
}

/**
 * One field summed across rows, counting only the rows that measured it.
 *
 * Null when none did: a roster of games that have not taken a bet yet has not
 * measured a total, and "$0.00" would claim it had. A row that did not measure
 * the field contributes nothing, rather than a zero - the two sum the same,
 * but only one of them can tell "nobody measured this" from "it came to zero".
 */
export function sumMeasured(rows, field) {
  const values = rows.map((r) => r[field]).filter(measured);
  return values.length ? values.reduce((a, b) => a + Number(b), 0) : null;
}

/**
 * Every additive figure of `rows`, summed - the roster table's TOTAL row, and
 * the source of the header's roster and day lines, so the two cannot disagree.
 *
 * Shaped like a row, field for field, so the table draws it through the same
 * column definitions as the games above it. PLAYERS (`unique`) is absent on
 * purpose: one player on two games is counted by both, so no sum of that
 * column is true.
 *
 * `online` sums the rows too, not `state.online`: the header's figure counts
 * every catalogue title, including a dark one with no row, and ignores the
 * roster filter - a total has to match the column it sits under.
 */
export function totalsOf(rows) {
  return {
    online: sumMeasured(rows, 'online'),
    count: sumMeasured(rows, 'count'),
    dCount: sumMeasured(rows, 'dCount'),
    turnoverUsd: sumMeasured(rows, 'turnoverUsd'),
    dTurnoverUsd: sumMeasured(rows, 'dTurnoverUsd'),
    profitUsd: sumMeasured(rows, 'profitUsd'),
    dProfitUsd: sumMeasured(rows, 'dProfitUsd'),
    dayTurnoverUsd: sumMeasured(rows, 'dayTurnoverUsd'),
    lifetimeTurnoverUsd: sumMeasured(rows, 'lifetimeTurnoverUsd'),
    dayProfitUsd: sumMeasured(rows, 'dayProfitUsd'),
    dayCount: sumMeasured(rows, 'dayCount'),
    expectedUsd: sumMeasured(rows, 'expectedUsd'),
    rtp: grossRtp(rows),
  };
}

/**
 * The roster's RTP, from its GROSS figures, exactly as each row's is.
 *
 * Summed first and divided once: an average of per-game RTPs weights a $50
 * game the same as a $150,000 one. Only games whose own RTP exists take part
 * - measured turnover above zero, measured profit - so the total is made of
 * the same games the RTP column above it shows a figure for.
 */
function grossRtp(rows) {
  const games = rows.filter((r) => measured(r.turnover) && measured(r.profit) && Number(r.turnover) > 0);
  if (!games.length) return null;
  const turnover = sumMeasured(games, 'turnover');
  return (1 - sumMeasured(games, 'profit') / turnover) * 100;
}

/**
 * Day-so-far totals across the roster, from our own trail.
 *
 * Null when no game has a reading inside the window - a poller started two
 * minutes ago has not measured the day, and "$0.00" would claim it had.
 */
export function dayTotals(state) {
  const t = totalsOf(state.rows);
  return { turnover: t.dayTurnoverUsd, profit: t.dayProfitUsd, count: t.dayCount };
}

/**
 * Month-to-date totals across the roster, for the header line.
 *
 * Null when no game has a reading, the same as `dayTotals` - this used to add
 * `?? 0` per row, so a roster of nothing but pending launches printed a
 * confident "$0.00" here while every row under it read "-".
 */
export function rosterTotals(state) {
  const t = totalsOf(state.rows);
  return { turnover: t.turnoverUsd, profit: t.profitUsd };
}
