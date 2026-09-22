import { C, percent, intOrDash, fixed, moneySigned } from '../format.mjs';
import { fit, row } from '../layout.mjs';
import { formatUsd, formatUsdSigned } from '../../money.mjs';
import { buildModeRows } from '../mode-rows.mjs';
import { modeOrder } from '../../modes.mjs';
import { modeList } from '../state.mjs';
import { SORTS, sortByNav } from '../nav.mjs';

/**
 * The cross-game bet-mode comparison screen: pick one mode name (BASE, ANTE,
 * FREE_SPINS...) and see it down every game in the roster that runs it.
 *
 * SNAPSHOT-ONLY, deliberately: `buildModeRows` is called per game with an
 * empty `modeTrail`, so opening this screen costs no extra Redis reads. That
 * means every rate/delta field that depends on a trail (dCount, dayProfit,
 * spark, ...) comes back null here - only the month-to-date snapshot figures
 * are ever populated, which is exactly what this table shows.
 */

/**
 * Every mode name any game in `perGame` runs, unioned across snapshots and
 * ordered BASE-first-then-alphabetical so `nav.reduce`'s `[`/`]` stepping and
 * every rendered table agree on one canonical order.
 */
export function compareModes(perGame) {
  const names = [];
  for (const snap of Object.values(perGame ?? {})) {
    if (!snap?.ok) continue;
    for (const r of modeList(snap.data)) {
      const name = r?.mode ?? r?.name ?? r?.betMode;
      if (name) names.push(name);
    }
  }
  return modeOrder(names);
}

export function renderCompare(state, box, width, budget) {
  const nav = state.nav ?? {};
  const lines = [box.line(header(nav))];

  const matches = matchingRows(state, nav.compareMode);

  // A mode nobody runs must say so - a bare header or an empty table would
  // both read as "still loading", not "there is nothing here to show".
  if (!matches.length) {
    lines.push(box.line(`${C.dim}no game is running this bet mode${C.reset}`));
    return lines;
  }

  // Same rule as `views/game.mjs`: roster order is the DEFAULT (`SORTS[0]`),
  // `s` overrides it, and the header above already names the active sort so
  // the two can never silently disagree. Without this, `s` on this screen
  // was a dead key - it moved `nav.sort` with no visible effect at all.
  const sorted = sortByNav(matches, nav.sort);
  const columns = fit(columnsFor(), width - 4);
  lines.push(box.line(`${C.bold}${row(columns, (c) => c.title)}${C.reset}`));
  for (const m of sorted.slice(0, Math.max(1, budget - 2))) {
    lines.push(box.line(row(columns, (c) => c.value(m))));
  }

  return lines;
}

function header(nav) {
  return `${C.bold}compare${C.reset}   ${C.dim}bet mode${C.reset}   ${C.bold}${C.cyan}${nav.compareMode ?? '?'}${C.reset}${sortSuffix(nav.sort)}`;
}

/** `''` when the sort is still the untouched default - see `views/game.mjs`'s twin. */
function sortSuffix(sort) {
  return sort && sort !== SORTS[0] ? `   ${C.dim}sort${C.reset} ${C.cyan}${sort}${C.reset}` : '';
}

/**
 * One row per game that runs `mode`, in roster order. A game whose per-mode
 * rows have no entry for `mode` is left OUT of the result entirely - not
 * represented with dashes, which would misreport it as having run the mode
 * and taken nothing.
 */
export function matchingRows(state, mode) {
  const out = [];
  for (const slug of gameSlugsInOrder(state)) {
    const snapshot = state.perGame?.[slug];
    if (!snapshot?.ok) continue;

    const modeRows = buildModeRows({
      snapshot,
      modeTrail: [],
      gameRow: (state.rows ?? []).find((r) => r.name === slug),
      now: state.now,
      config: state.config,
      mathModel: state.mathModel,
      slug,
    });

    const found = modeRows.find((r) => r.mode === mode);
    if (found) out.push({ ...found, game: slug });
  }
  return out;
}

/** The roster's own order first, then any `perGame` slug the roster hasn't listed yet. */
export function gameSlugsInOrder(state) {
  const seen = new Set();
  const order = [];
  for (const r of state.rows ?? []) {
    if (r?.name && !seen.has(r.name)) {
      seen.add(r.name);
      order.push(r.name);
    }
  }
  for (const slug of Object.keys(state.perGame ?? {})) {
    if (!seen.has(slug)) {
      seen.add(slug);
      order.push(slug);
    }
  }
  return order;
}

/**
 * GAME carries `priority: 1` so a narrow terminal sheds every other column
 * before it ever loses the one thing that says which game a row belongs to.
 *
 * `turnoverUsd`/`profitUsd`/`rtp`/`effectiveRtp`/`vsExpectedUsd` are the
 * month-to-date snapshot figures `buildModeRows` always populates, USD fields
 * already converted - passed straight to the formatters, never re-divided.
 */
function columnsFor() {
  return [
    { key: 'game', title: 'GAME', width: 16, align: 'left', priority: 1, value: (r) => r.game },
    { key: 'cost', title: 'COST', width: 6, align: 'right', priority: 2, value: (r) => (r.cost === null ? '-' : `${fixed(r.cost, 0)}x`) },
    { key: 'spins', title: 'SPINS', width: 10, align: 'right', priority: 3, value: (r) => intOrDash(r.count) },
    { key: 'turnover', title: 'TURNOVER', width: 13, align: 'right', priority: 4, value: (r) => formatUsd(r.turnoverUsd) },
    { key: 'profit', title: 'PROFIT', width: 13, align: 'right', priority: 5, value: (r) => moneySigned(r.profitUsd) },
    { key: 'rtp', title: 'RTP', width: 8, align: 'right', priority: 6, value: (r) => percent(r.rtp) },
    { key: 'eff', title: 'EFF', width: 8, align: 'right', priority: 7, value: (r) => percent(r.effectiveRtp) },
    { key: 'vs', title: 'vs EXP', width: 13, align: 'right', priority: 8, value: (r) => formatUsdSigned(r.vsExpectedUsd) },
  ];
}
