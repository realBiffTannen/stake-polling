import { deltas } from './detect/baseline.mjs';

/**
 * The running action log.
 *
 * Every five minutes the poller writes one line describing what the roster
 * actually did: how much was bet, how it moved, which game moved most, and
 * what fired. Scrolling a minute-by-minute trail to answer "what happened
 * while I was away" is work; this is the answer already written down.
 *
 * Figures are in raw API units, like everything else stored. Display converts.
 */

/**
 * @param {object} trails as read for the detector, oldest-first
 * @param {object[]} alerts raised during the window
 * @param {{ from: number, to: number }} window
 */
export function buildSummary(trails, alerts, { from, to }) {
  const games = trails?.games ?? {};
  const totals = { turnover: 0, profit: 0, count: 0 };
  const movers = [];

  for (const [game, samples] of Object.entries(games)) {
    const moved = { game, turnover: 0, profit: 0, count: 0 };
    for (const field of ['turnover', 'profit', 'count']) {
      moved[field] = sumWindow(samples, field, from, to);
      totals[field] += moved[field];
    }
    if (moved.turnover !== 0 || moved.count !== 0) movers.push(moved);
  }

  movers.sort((a, b) => Math.abs(b.turnover) - Math.abs(a.turnover));

  const online = lastValue(trails?.online, 'onlinePlayers');
  const bySeverity = countBy(alerts, 'severity');

  return {
    from,
    to,
    minutes: Math.max(1, Math.round((to - from) / 60000)),
    turnover: totals.turnover,
    profit: totals.profit,
    count: totals.count,
    onlinePlayers: online,
    activeGames: movers.length,
    topMover: movers[0]?.game ?? null,
    topMoverTurnover: movers[0]?.turnover ?? 0,
    alerts: (alerts ?? []).length,
    crits: bySeverity.crit ?? 0,
    warns: bySeverity.warn ?? 0,
    kinds: [...new Set((alerts ?? []).map((a) => a.kind).filter(Boolean))].join(','),
  };
}

/** Sum of the per-minute deltas whose sample lands in (from, to]. */
function sumWindow(samples, field, from, to) {
  if (!Array.isArray(samples) || samples.length < 2) return 0;
  const steps = deltas(samples.map((s) => Number(s?.fields?.[field] ?? 0)));
  let total = 0;
  for (let i = 0; i < steps.length; i++) {
    const ts = Number(samples[i + 1]?.ts);
    if (ts > from && ts <= to) total += steps[i];
  }
  return total;
}

function lastValue(samples, field) {
  if (!Array.isArray(samples) || !samples.length) return 0;
  return Number(samples.at(-1)?.fields?.[field] ?? 0);
}

function countBy(items, key) {
  const out = {};
  for (const item of items ?? []) {
    const k = item?.[key];
    if (k) out[k] = (out[k] ?? 0) + 1;
  }
  return out;
}
