import {
  int, intOrDash, intSigned, utcClock, humanAge, percent, sharePercent, fixed, usdFixed, toDisplay,
} from '../format.mjs';
import { toUsd, toShareUsd, formatUsd, formatUsdSigned } from '../../money.mjs';
import { profitTable, BUCKET_SIZES } from '../../buckets.mjs';
import { dayTotals, totalsOf } from '../state.mjs';
import { LEVEL, TABS, SORTS, sortByNav } from '../nav.mjs';
import { convergence, modeModel, gameModel, edgeApi } from '../math.mjs';
import { matchingRows } from './compare.mjs';
import { totalLabel } from './roster.mjs';
import { renderDailyPlain } from './daily.mjs';
import { sparkline } from '../sparkline.mjs';

/**
 * Every view reachable from the keyboard, in the one order the rest of the
 * dashboard is pinned to: `bin/stake-dash.mjs` prints this same array in its
 * own `--view` error message, and a test asserts it by exact `deepEqual` - so
 * both read this constant rather than keeping their own copy that could drift.
 */
export const VIEWS = ['roster', 'health', 'live', 'today', 'buckets', 'mode', 'compare', 'daily'];

/**
 * Plain text for a pipe or a redirect - one snapshot, no escapes, no alt
 * screen, no colour. A redirected dashboard has nobody to press a key, so
 * every level `nav` can reach (roster, a game's four tabs, one bet mode,
 * cross-game compare, the daily table) has to be reachable here too, driven by `state.nav`
 * exactly the way `renderFrame` is - just formatted with `padStart`/`padEnd`
 * instead of the colour helpers in `format.mjs`.
 */
export function renderPlain(state) {
  const nav = state.nav;
  const isBucketsTab = nav?.level === LEVEL.GAME && nav?.tab === 'buckets';

  const lines = [];
  lines.push(`${state.meta?.team ?? 'roster'} @ ${new Date(state.now).toISOString()}`);
  lines.push(`online ${int(state.online)}  position ${formatUsd(state.team)}  carry ${formatUsd(state.carry)}  last poll ${state.ageMs === null ? 'never' : `${humanAge(state.ageMs)} ago`}${state.stale ? ' (STALE)' : ''}`);
  lines.push(`sid ${state.meta?.auth_state ?? 'unknown'} via ${state.meta?.sid_source || 'n/a'}  aof ${state.meta?.persistence ?? 'unknown'}`);
  if (state.redisMemory?.over) lines.push(`REDIS MEMORY ${state.redisMemory.human} over the ${state.redisMemory.limitHuman} limit (REDIS_DB_SIZE)`);
  const day = dayTotals(state);
  lines.push(`day since ${new Date(state.dayFrom).toISOString().slice(11, 16)}Z  bets ${intSigned(day.count)}  turnover ${formatUsd(day.turnover)}  profit ${formatUsdSigned(day.profit)}${state.dayCoverage?.partial ? (state.dayCoverage.fromTs ? '  (partial window)' : '  (no trail in this window yet)') : ''}`);
  lines.push('');

  // Mutually exclusive, same as renderFrame: exactly one of these draws,
  // never the roster table underneath it - a piped `--view health` should
  // not also have to scroll past the whole roster to find it.
  if (nav?.level === LEVEL.COMPARE) {
    lines.push(...renderComparePlain(state, nav));
  } else if (nav?.level === LEVEL.DAILY) {
    lines.push(...renderDailyPlain(state));
  } else if (nav?.level === LEVEL.MODE) {
    lines.push(...renderModePlain(state, nav));
  } else if (nav?.level === LEVEL.GAME && !isBucketsTab) {
    lines.push(...renderGameTabPlain(state, nav));
  } else if (!isBucketsTab) {
    lines.push(...renderRosterPlain(state));
  }

  renderBucketsInto(lines, state, nav, isBucketsTab);

  if (state.events?.length) {
    lines.push('');
    lines.push('POSSIBLE EVENTS');
    for (const e of state.events.slice(0, 5)) {
      lines.push(`  ${e.title.toUpperCase()} ${e.game} (${e.confidence}, ${e.findings} findings)`);
      lines.push(`    ${e.description}`);
    }
  }

  if (state.summaries?.length) {
    lines.push('');
    lines.push(`RUNNING ACTION (${state.summaryMinutes ?? state.pollMinutes ?? 5} min)`);
    for (const entry of state.summaries.slice(0, 8)) {
      lines.push(`  ${new Date(Number(entry.to)).toISOString().slice(11, 19)} bets ${intSigned(entry.count)}  turnover ${formatUsdSigned(toUsd(entry.turnover, state.money))}  profit ${formatUsdSigned(toShareUsd(entry.profit, state.money.profitShare, state.money))}  ${entry.activeGames} active${entry.topMover ? `, top ${entry.topMover}` : ''}${Number(entry.alerts) ? `, ${entry.alerts} findings` : ''}`);
    }
  }

  if (state.alerts.length) {
    lines.push('');
    lines.push('FINDINGS');
    for (const a of state.alerts.slice(0, 10)) {
      lines.push(`  ${new Date(a.ts).toISOString().slice(11, 19)} ${String(a.severity).padEnd(4)} ${a.message}`);
    }
  }
  return lines.join('\n');
}

/** The roster table - unchanged from before `nav` drove every other view. */
function renderRosterPlain(state) {
  const rate = state.rateLabel ?? '/m';
  const out = [[
    'GAME'.padEnd(20), 'NOW'.padStart(5), 'BETS'.padStart(9), `BETS${rate}`.padStart(9), 'PLAYERS'.padStart(9),
    'TURNOVER'.padStart(14), `TURN${rate}`.padStart(13), 'PROFIT'.padStart(13), `PROFIT${rate}`.padStart(13),
    'DAY TURN'.padStart(13), 'DAY PROFIT'.padStart(13), 'EXPECTED'.padStart(12), 'RTP'.padStart(9),
  ].join('')];
  // The same cells for a game and for the TOTAL line; only the first and the
  // PLAYERS cell differ, so the two cannot format one figure two ways.
  const line = (r, name, players) => [
    name.slice(0, 19).padEnd(20),
    (r.online === null ? '-' : int(r.online)).padStart(5),
    intOrDash(r.count).padStart(9),
    intSigned(r.dCount).padStart(9),
    players.padStart(9),
    formatUsd(r.turnoverUsd).padStart(14),
    formatUsdSigned(r.dTurnoverUsd).padStart(13),
    formatUsd(r.profitUsd).padStart(13),
    formatUsdSigned(r.dProfitUsd).padStart(13),
    formatUsd(r.dayTurnoverUsd).padStart(13),
    formatUsdSigned(r.dayProfitUsd).padStart(13),
    formatUsd(r.expectedUsd).padStart(12),
    (r.rtp === null ? '-' : `${r.rtp.toFixed(2)}%`).padStart(9),
  ].join('');

  for (const r of [...state.rows].sort((a, b) => b.turnover - a.turnover)) {
    out.push(line(r, r.name, intOrDash(r.unique)));
  }

  // Every game the table above prints: this table has no filter, so the
  // label never says "of". PLAYERS is blank rather than a dash - one player
  // on two games counts in both, so there is no true sum to be missing.
  if (state.rows.length) {
    out.push(line(totalsOf(state.rows), totalLabel(state.rows.length, null, 19), ''));
  }
  return out;
}

/**
 * One game's four tabs (health/live/today), reusing the exact row objects
 * `state.modeRows` already carries - built once per frame in `app.mjs`'s
 * `#read()` - rather than recomputing anything here.
 *
 * `turnoverUsd`/`profitUsd`/`expectedUsd`/`vsExpectedUsd` on each row are
 * already dollars; `dTurnover`/`dProfit`/`dayTurnover`/`dayProfit` are raw
 * micro-dollars and go through `toDisplay` below. Mixing the two up scales a
 * figure by `unitsPerDollar` while it still looks like a plausible number.
 */
function renderGameTabPlain(state, nav) {
  const rows = state.modeRows ?? [];
  const out = [`${nav.game ?? '?'}   ${(nav.tab ?? 'health').toUpperCase()}   [${TABS.map((t) => (t === nav.tab ? `*${t}*` : t)).join(' ')}]${sortSuffix(nav.sort)}`];

  if (!rows.length) {
    out.push(gameDataMessage(state, nav.game));
    return out;
  }

  // Same rule as the TTY `views/game.mjs`: canonical BASE-first order (how
  // `rows` already arrives) is the DEFAULT; `s` (via `nav.sort`, reachable
  // even from a `--view` flag path that later grows a `--sort` flag) overrides
  // it, and the header above already names whichever is active.
  const sorted = sortByNav(rows, nav.sort);
  const rate = state.rateLabel ?? '/m';
  const tab = nav.tab ?? 'health';

  if (tab === 'live') {
    out.push([
      'MODE'.padEnd(18), `SPINS${rate}`.padStart(10), `TURN${rate}`.padStart(14),
      `PROFIT${rate}`.padStart(14), 'SHARE'.padStart(8), '12x'.padStart(13),
    ].join(''));
    for (const r of sorted) {
      out.push([
        r.mode.padEnd(18),
        intSigned(r.dCount).padStart(10),
        formatUsdSigned(toDisplay(r.dTurnover, state)).padStart(14),
        formatUsdSigned(toDisplay(r.dProfit, state, state.money?.profitShare)).padStart(14),
        sharePercent(r.shareTurnover).padStart(8),
        sparkline(r.spark, 12).padStart(13),
      ].join(''));
    }
  } else if (tab === 'today') {
    out.push([
      'MODE'.padEnd(18), 'SPINS'.padStart(10), 'TURNOVER'.padStart(14), 'PROFIT'.padStart(14), 'SHARE'.padStart(8),
    ].join(''));
    for (const r of sorted) {
      out.push([
        r.mode.padEnd(18),
        intOrDash(r.dayCount).padStart(10),
        formatUsd(toDisplay(r.dayTurnover, state)).padStart(14),
        formatUsdSigned(toDisplay(r.dayProfit, state, state.money?.profitShare)).padStart(14),
        sharePercent(r.shareTurnover).padStart(8),
      ].join(''));
    }
  } else {
    // HEALTH: everything the snapshot carries, so it is right on frame one.
    out.push([
      'MODE'.padEnd(18), 'COST'.padStart(6), 'AVGBET'.padStart(8), 'SPINS'.padStart(10),
      'TURNOVER'.padStart(14), 'PROFIT'.padStart(14), 'RTP'.padStart(8), 'EFF'.padStart(8),
      'NORM'.padStart(8), 'EDGE_API'.padStart(10), 'vs EXP'.padStart(14),
    ].join(''));
    for (const r of sorted) {
      out.push([
        r.mode.padEnd(18),
        (r.cost === null ? '-' : `${fixed(r.cost, 0)}x`).padStart(6),
        fixed(r.avgBet, 2).padStart(8),
        intOrDash(r.count).padStart(10),
        formatUsd(r.turnoverUsd).padStart(14),
        formatUsdSigned(r.profitUsd).padStart(14),
        percent(r.rtp).padStart(8),
        percent(r.effectiveRtp).padStart(8),
        percent(r.normalizedRtp).padStart(8),
        percent(edgeApi(r)).padStart(10),
        formatUsdSigned(r.vsExpectedUsd).padStart(14),
      ].join(''));
    }

    const findings = sorted.flatMap((r) => (r.findings ?? []).map((f) => `  ${r.mode.padEnd(18)} ${f.message}`));
    if (findings.length) {
      out.push('');
      out.push('VERDICT');
      out.push(...findings);
    }
  }

  return out;
}

/**
 * `--game`/`--mode` deliberately never hard-exit on an unrecognised slug
 * (Ruling 22): `metro-night-run` is a real catalogue slug with `isLive:
 * false`, so it never appears in the live roster or `state.perGame`, and
 * validating either flag against the live set would reject that legitimate,
 * currently-dark game. Instead the MESSAGE tells a typo apart from a real
 * game with no data yet: a slug this dashboard has never seen anywhere -
 * not the roster, not the full catalogue - says so and lists what IS
 * available; a known game that simply has no per-mode data keeps today's
 * wording. `state.knownGames` (`app.mjs`'s `#read()`) is only ever absent on
 * a hand-built state (e.g. a test), and absence must fall back to the old
 * wording rather than risk a false "unknown" with no evidence to back it.
 */
function isUnknownGame(state, slug) {
  const known = state.knownGames;
  return Boolean(slug && Array.isArray(known) && known.length && !known.includes(slug));
}

function unknownGameMessage(state, slug) {
  const available = [...new Set(state.knownGames ?? [])].sort().join(', ');
  return `unknown game "${slug}" - not found anywhere in the data. available: ${available}`;
}

function gameDataMessage(state, slug) {
  return isUnknownGame(state, slug) ? unknownGameMessage(state, slug) : 'no per-mode data for this game yet';
}

/** Same distinction one level down: a bet mode name absent from the game's
 * own captured math model - when one has been captured at all - is a typo,
 * distinct from a real mode that simply has no data yet.
 */
function modeDataMessage(state, nav) {
  if (isUnknownGame(state, nav.game)) return unknownGameMessage(state, nav.game);
  const known = Object.keys(gameModel(state.mathModel, nav.game)?.modes ?? {});
  if (nav.mode && known.length && !known.includes(nav.mode)) {
    return `unknown bet mode "${nav.mode}" for ${nav.game} - not in the captured math model. available: ${[...known].sort().join(', ')}`;
  }
  return 'no data for this bet mode yet';
}

/**
 * One bet mode of one game, in full - the plain-text form of `views/mode.mjs`.
 * Same row, same raw-vs-dollar fields as `renderGameTabPlain` above.
 */
function renderModePlain(state, nav) {
  const rows = state.modeRows ?? [];
  const row = rows.find((r) => r.mode === nav.mode);
  const out = [`${nav.game ?? '?'}   mode   ${nav.mode ?? '?'}`];

  if (!row) {
    out.push(modeDataMessage(state, nav));
    return out;
  }

  const game = gameModel(state.mathModel, nav.game);
  const mode = modeModel(state.mathModel, nav.game, nav.mode);
  const rate = state.rateLabel ?? '/m';

  out.push(`cost ${row.cost === null ? '-' : `${fixed(row.cost, 0)}x`}   avgBet ${usdFixed(row.avgBet, 2)}   spins ${intOrDash(row.count)}`);
  out.push(`turnover ${formatUsd(row.turnoverUsd)}   profit ${formatUsdSigned(row.profitUsd)}   expected ${formatUsd(row.expectedUsd)}   vs exp ${formatUsdSigned(row.vsExpectedUsd)}`);
  out.push(`spins${rate} ${intSigned(row.dCount)}   turnover${rate} ${formatUsdSigned(toDisplay(row.dTurnover, state))}   profit${rate} ${formatUsdSigned(toDisplay(row.dProfit, state, state.money?.profitShare))}`);
  out.push(`today spins ${intOrDash(row.dayCount)}   today turnover ${formatUsd(toDisplay(row.dayTurnover, state))}   today profit ${formatUsdSigned(toDisplay(row.dayProfit, state, state.money?.profitShare))}`);
  out.push(`rtp ${sharePercent(row.rtp)}   eff ${sharePercent(row.effectiveRtp)}   norm ${sharePercent(row.normalizedRtp)}`);

  if (Array.isArray(game?.costLadder) && game.costLadder.length) {
    out.push(`ladder ${game.costLadder.map((c) => (c === row.cost ? `[${c}x]` : `${c}x`)).join(' * ')}`);
  }

  const band = convergence({ sigma: mode?.sigma, count: row.count });
  out.push(band
    ? `n=${intOrDash(row.count)}   SE +/-${(band.se * 100).toFixed(1)}pp   needs ~${int(band.needFor1pp)} rounds for +/-1pp`
    : `n=${intOrDash(row.count)}   (no captured model - no convergence band)`);

  for (const f of row.findings ?? []) {
    out.push(f.message);
  }

  return out;
}

/**
 * The cross-game bet-mode comparison, snapshot-only exactly as
 * `views/compare.mjs` is: `matchingRows` (imported from there, not
 * reimplemented here - the old copy had the same contract as
 * `matchingRows`/`gameSlugsInOrder` and zero tests of its own) calls
 * `buildModeRows` per game with an empty `modeTrail`, so every rate/delta
 * field comes back null and only the month-to-date snapshot figures (already
 * dollars) are shown.
 */
function renderComparePlain(state, nav) {
  const compareMode = nav.compareMode;
  const out = [`compare   mode   ${compareMode ?? '?'}${sortSuffix(nav.sort)}`];

  const rows = compareMode ? matchingRows(state, compareMode) : [];
  if (!rows.length) {
    out.push('no game is running this bet mode');
    return out;
  }

  // Same rule as the TTY `views/compare.mjs`: roster order is the DEFAULT,
  // `s` overrides it, and the header above already names the active sort.
  const sorted = sortByNav(rows, nav.sort);
  out.push([
    'GAME'.padEnd(18), 'COST'.padStart(6), 'SPINS'.padStart(10), 'TURNOVER'.padStart(14),
    'PROFIT'.padStart(14), 'RTP'.padStart(8), 'EFF'.padStart(8), 'vs EXP'.padStart(14),
  ].join(''));
  for (const r of sorted) {
    out.push([
      r.game.slice(0, 17).padEnd(18),
      (r.cost === null ? '-' : `${fixed(r.cost, 0)}x`).padStart(6),
      intOrDash(r.count).padStart(10),
      formatUsd(r.turnoverUsd).padStart(14),
      formatUsdSigned(r.profitUsd).padStart(14),
      percent(r.rtp).padStart(8),
      percent(r.effectiveRtp).padStart(8),
      formatUsdSigned(r.vsExpectedUsd).padStart(14),
    ].join(''));
  }
  return out;
}

/** `''` when the sort is still the untouched default - see `views/game.mjs`'s twin. */
function sortSuffix(sort) {
  return sort && sort !== SORTS[0] ? `   sort ${sort}` : '';
}

/**
 * The bucket table, appended below whichever view drew above it.
 *
 * Driven by `nav` when it names the buckets tab explicitly; otherwise falls
 * back to the legacy `state.bucket`/`state.focus` pair, which is how a hand
 * built test state (or any caller predating `nav`) still reaches this table.
 */
function renderBucketsInto(lines, state, nav, isBucketsTab) {
  const focus = isBucketsTab ? nav.game : (nav ? null : state.focus);
  const bucket = isBucketsTab ? (nav.bucket ?? '5m') : (nav ? null : state.bucket);
  if (!(bucket && focus)) return;

  const sizeMs = BUCKET_SIZES[bucket] ?? BUCKET_SIZES['5m'];
  const table = profitTable({
    trail: state.gameTrails?.[focus] ?? [],
    modeTrail: state.modeTrails?.[focus] ?? [],
    sizeMs,
    from: state.now - 23 * sizeMs,
    to: state.now,
    trimUnreached: true,
  });
  // Mode names are whatever the game calls them, and NEITHER_OR_NONE is
  // wider than any money figure - so the column is sized to its title, not
  // the other way round, or it runs into its neighbour.
  const widthOf = (m) => Math.max(14, m.length + 2);
  const cell = (v, w) => (v === null || v === undefined
    ? '-'
    : formatUsdSigned(toShareUsd(v, state.money.profitShare, state.money))).padStart(w);

  lines.push('');
  lines.push(`${focus} PROFIT BY ${bucket.toUpperCase()} (UTC)${table.modes.length ? '' : '  - no per-mode trail yet'}`);
  lines.push(['BUCKET'.padEnd(8), 'TOTAL'.padStart(14), ...table.modes.map((m) => m.padStart(widthOf(m)))].join(''));
  for (const b of table.rows) {
    lines.push([
      utcClock(b.from).padEnd(8),
      cell(b.total, 14),
      ...table.modes.map((m) => cell(b.byMode[m], widthOf(m))),
    ].join(''));
  }
}
