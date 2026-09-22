import {
  C, percent, sharePercent, intOrDash, intSigned, fixed, usd, usdSigned, profitSigned, moneySigned,
} from '../format.mjs';
import { fit, row } from '../layout.mjs';
import { formatUsdSigned } from '../../money.mjs';
import { sparkline } from '../sparkline.mjs';
import { renderBuckets } from './buckets.mjs';
import { TABS, SORTS, sortByNav } from '../nav.mjs';
import { edgeApi } from '../math.mjs';

const TITLES = { health: 'HEALTH', live: 'LIVE', today: 'TODAY', buckets: 'BUCKETS' };

export function renderGame(state, box, width, budget) {
  const nav = state.nav ?? {};
  const rows = state.modeRows ?? [];
  const lines = [
    box.line(`${C.bold}${nav.game ?? '?'}${C.reset}   ${C.dim}per bet mode${C.reset}${sortSuffix(nav.sort)}`),
    box.line(tabStrip(nav.tab)),
  ];

  // `views/buckets.mjs` reads `state.focus` and `state.bucket`, not `state.nav`.
  // Adapt at this boundary rather than teaching buckets.mjs about nav, so its
  // own (verbatim, already-tested) contract stays untouched.
  if (nav.tab === 'buckets') {
    return [...lines, ...renderBuckets(
      { ...state, focus: nav.game, bucket: nav.bucket ?? '5m' },
      box, width, budget - 2,
    )];
  }

  if (!rows.length) {
    lines.push(box.line(`${C.dim}no per-mode data for this game yet${C.reset}`));
    return lines;
  }

  // `s` was previously read only by the roster - a dead key here, silently
  // mutating `nav.sort` with no visible effect. The canonical BASE-first
  // order (`rows` arrives in that order already, from `buildModeRows`) is
  // the DEFAULT (`SORTS[0]`); an explicit `s` press overrides it, and the
  // header above states whichever is currently active so the two can never
  // silently disagree.
  const sorted = sortByNav(rows, nav.sort);
  const columns = fit(columnsFor(nav.tab, state), width - 4);
  lines.push(box.line(`${C.bold}${row(columns, (c) => c.title)}${C.reset}`));
  for (const r of sorted.slice(0, Math.max(1, budget - 4))) {
    lines.push(box.line(row(columns, (c) => c.value(r, c.width))));
  }

  if (nav.tab === 'health') lines.push(...verdicts(sorted, box));
  return lines;
}

/** `''` when the sort is still the untouched default - the header only ever
 * names a sort the user actually chose with `s`. */
function sortSuffix(sort) {
  return sort && sort !== SORTS[0] ? `   ${C.dim}sort${C.reset} ${C.cyan}${sort}${C.reset}` : '';
}

function tabStrip(active) {
  return TABS.map((tab, i) => {
    const label = `${i + 1} ${TITLES[tab]}`;
    return tab === active ? `${C.bold}${C.cyan}[${label}]${C.reset}` : `${C.dim} ${label} ${C.reset}`;
  }).join(' ');
}

function columnsFor(tab, state) {
  const name = { key: 'mode', title: 'MODE', width: 16, align: 'left', priority: 1, value: (r) => r.mode };
  const rate = state.rateLabel ?? '/m';

  if (tab === 'live') {
    return [
      name,
      { key: 'dCount', title: `SPINS${rate}`, width: 10, align: 'right', priority: 2, value: (r) => intSigned(r.dCount) },
      { key: 'dTurn', title: `TURN${rate}`, width: 12, align: 'right', priority: 3, value: (r) => usdSigned(r.dTurnover, state) },
      { key: 'dProfit', title: `PROFIT${rate}`, width: 13, align: 'right', priority: 4, value: (r) => profitSigned(r.dProfit, state) },
      { key: 'share', title: 'SHARE', width: 8, align: 'right', priority: 5, value: (r) => sharePercent(r.shareTurnover) },
      { key: 'spark', title: '12x', width: 12, align: 'right', priority: 6, value: (r, w) => sparkline(r.spark, w) },
    ];
  }

  if (tab === 'today') {
    return [
      name,
      { key: 'daySpins', title: 'SPINS', width: 10, align: 'right', priority: 2, value: (r) => intOrDash(r.dayCount) },
      { key: 'dayTurn', title: 'TURNOVER', width: 13, align: 'right', priority: 3, value: (r) => usd(r.dayTurnover, state) },
      { key: 'dayProfit', title: 'PROFIT', width: 13, align: 'right', priority: 4, value: (r) => profitSigned(r.dayProfit, state) },
      { key: 'share', title: 'SHARE', width: 8, align: 'right', priority: 5, value: (r) => sharePercent(r.shareTurnover) },
    ];
  }

  // HEALTH: everything the snapshot carries, so it is right on frame one.
  return [
    name,
    { key: 'cost', title: 'COST', width: 6, align: 'right', priority: 3, value: (r) => (r.cost === null ? '-' : `${fixed(r.cost, 0)}x`) },
    { key: 'avgBet', title: 'AVGBET', width: 8, align: 'right', priority: 8, value: (r) => fixed(r.avgBet, 2) },
    { key: 'count', title: 'SPINS', width: 10, align: 'right', priority: 4, value: (r) => intOrDash(r.count) },
    { key: 'turnover', title: 'TURNOVER', width: 13, align: 'right', priority: 5, value: (r) => usd(r.turnoverUsd, state, true) },
    { key: 'profit', title: 'PROFIT', width: 13, align: 'right', priority: 6, value: (r) => moneySigned(r.profitUsd) },
    { key: 'rtp', title: 'RTP', width: 8, align: 'right', priority: 2, value: (r) => percent(r.rtp) },
    { key: 'eff', title: 'EFF', width: 8, align: 'right', priority: 7, value: (r) => percent(r.effectiveRtp) },
    { key: 'norm', title: 'NORM', width: 8, align: 'right', priority: 9, value: (r) => percent(r.normalizedRtp) },
    // `edge_api = expectedReturn / turnover`, NO `expectedShare` divisor - see
    // `math.mjs`'s `edgeApi()`. Lowest priority of the lot: it is the newest,
    // least-consequential-to-lose column here, so a narrow terminal sheds it
    // before the mode name ever comes under pressure.
    { key: 'edgeApi', title: 'EDGE_API', width: 8, align: 'right', priority: 11, value: (r) => percent(edgeApi(r)) },
    { key: 'vs', title: 'vs EXP', width: 13, align: 'right', priority: 10, value: (r) => signed(r.vsExpectedUsd) },
  ];
}

/**
 * The per-mode verdicts under the HEALTH table.
 *
 * `noise` findings are printed in full rather than suppressed: the whole point
 * of the tab is that a margin nobody can read should SAY so, instead of being
 * quietly omitted and leaving the reader to assume the silence means healthy.
 */
function verdicts(rows, box) {
  const out = [box.rule('VERDICT')];
  for (const r of rows) {
    for (const f of r.findings ?? []) {
      const colour = f.severity === 'crit' ? C.red : f.severity === 'warn' ? C.yellow : C.dim;
      out.push(box.line(`${colour}${r.mode.padEnd(16)}${C.reset} ${f.message}`));
    }
  }
  return out.length === 1 ? [] : out;
}

const signed = (dollars) => formatUsdSigned(dollars);
