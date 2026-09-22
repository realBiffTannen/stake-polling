import {
  C, sharePercent, int, intOrDash, intSigned, fixed, usd, usdSigned, profitSigned, moneySigned, usdFixed,
} from '../format.mjs';
import { formatUsd, formatUsdSigned } from '../../money.mjs';
import { sparkline } from '../sparkline.mjs';
import { convergence, modeModel, gameModel } from '../math.mjs';
import { profitTable, BUCKET_SIZES } from '../../buckets.mjs';

// How many bucket columns the mini-history looks back over.
const HISTORY_WIDTH = 24;

/**
 * The single-mode focus card: every figure the API carries for ONE bet mode of
 * ONE game, laid out as labelled pairs rather than a table - there is exactly
 * one row of data here, and a one-row table wastes the width that makes this
 * card worth opening.
 */
export function renderMode(state, box, width, budget) {
  const nav = state.nav ?? {};
  const rows = state.modeRows ?? [];
  const row = rows.find((r) => r.mode === nav.mode);

  const lines = [box.line(identity(nav))];

  if (!row) {
    lines.push(box.line(`${C.dim}no data for this bet mode yet${C.reset}`));
    return lines;
  }

  const game = gameModel(state.mathModel, nav.game);
  const mode = modeModel(state.mathModel, nav.game, nav.mode);

  lines.push(box.line(costLine(row)));
  lines.push(box.line(totalsLine(row)));
  lines.push(box.line(liveLine(row, state)));
  lines.push(box.line(dayLine(row, state)));
  lines.push(box.line(ratesLine(row)));

  const rungs = ladder(game?.costLadder, row.cost);
  if (rungs) lines.push(box.line(`${C.dim}ladder${C.reset} ${rungs}`));

  lines.push(box.line(convergenceLine(row, mode)));
  lines.push(box.line(historyLine(state, nav)));

  for (const f of row.findings ?? []) {
    const colour = f.severity === 'crit' ? C.red : f.severity === 'warn' ? C.yellow : C.dim;
    lines.push(box.line(`${colour}${f.message}${C.reset}`));
  }

  return lines.slice(0, Math.max(1, budget ?? lines.length));
}

function identity(nav) {
  return `${C.bold}${nav.game ?? '?'}${C.reset}   ${C.dim}mode${C.reset}   ${C.bold}${C.cyan}${nav.mode ?? '?'}${C.reset}`;
}

function costLine(r) {
  return `${C.dim}cost${C.reset} ${r.cost === null ? '-' : `${fixed(r.cost, 0)}x`}`
    + `   ${C.dim}avgBet${C.reset} ${usdFixed(r.avgBet, 2)}`
    + `   ${C.dim}spins${C.reset} ${intOrDash(r.count)}`;
}

function totalsLine(r) {
  return `${C.dim}turnover${C.reset} ${formatUsd(r.turnoverUsd)}`
    + `   ${C.dim}profit${C.reset} ${moneySigned(r.profitUsd)}`
    + `   ${C.dim}expected${C.reset} ${formatUsd(r.expectedUsd)}`
    + `   ${C.dim}vs exp${C.reset} ${formatUsdSigned(r.vsExpectedUsd)}`;
}

function ratesLine(r) {
  return `${C.dim}rtp${C.reset} ${sharePercent(r.rtp)}`
    + `   ${C.dim}eff${C.reset} ${sharePercent(r.effectiveRtp)}`
    + `   ${C.dim}norm${C.reset} ${sharePercent(r.normalizedRtp)}`;
}

/**
 * The per-poll delta, in the same raw-units-need-converting shape as
 * `views/game.mjs`'s LIVE tab: `dCount` is already a count, `dTurnover` and
 * `dProfit` are raw micro-dollars and `dProfit` additionally carries the
 * studio's share, exactly as `profitUsd` does on the totals line above.
 */
function liveLine(r, state) {
  const rate = state.rateLabel ?? '/m';
  return `${C.dim}spins${rate}${C.reset} ${intSigned(r.dCount)}`
    + `   ${C.dim}turnover${rate}${C.reset} ${usdSigned(r.dTurnover, state)}`
    + `   ${C.dim}profit${rate}${C.reset} ${profitSigned(r.dProfit, state)}`;
}

/** Same raw-units conversion, for the since-accounting-boundary totals. */
function dayLine(r, state) {
  return `${C.dim}today spins${C.reset} ${intOrDash(r.dayCount)}`
    + `   ${C.dim}today turnover${C.reset} ${usd(r.dayTurnover, state)}`
    + `   ${C.dim}today profit${C.reset} ${profitSigned(r.dayProfit, state)}`;
}

/** The game's whole cost ladder, with this mode's own rung picked out. */
function ladder(costLadder, cost) {
  if (!Array.isArray(costLadder) || !costLadder.length) return null;
  return costLadder.map((c) => (c === cost ? `${C.bold}${C.cyan}${c}x${C.reset}` : `${C.dim}${c}x${C.reset}`)).join(' · ');
}

/**
 * The sample size, plus the standard-error band ONLY when a captured model
 * exists for this mode. `convergence()` already returns null rather than an
 * invented band when there is nothing to base one on - this just prints
 * whichever of the two comes back, and never estimates the missing half.
 */
function convergenceLine(row, mode) {
  const band = convergence({ sigma: mode?.sigma, count: row.count });
  return band
    ? `n=${intOrDash(row.count)}   SE +/-${(band.se * 100).toFixed(1)}pp   needs ~${int(band.needFor1pp)} rounds for +/-1pp`
    : `n=${intOrDash(row.count)}   ${C.dim}(no captured model - no convergence band)${C.reset}`;
}

/**
 * A wall-clock mini-history of this mode's profit, bucketed at the drill-down
 * granularity (`nav.bucket`). `profitTable` returns no rows at all when both
 * trails are empty (nothing has been recorded since either poller started, or
 * this session has no trail keyed under this game yet), so that has to be its
 * own branch rather than something `sparkline` is trusted to paper over.
 */
function historyLine(state, nav) {
  const sizeMs = BUCKET_SIZES[nav.bucket] ?? BUCKET_SIZES['1h'];
  const to = state.now;
  const from = to - (HISTORY_WIDTH - 1) * sizeMs;
  const trail = state.gameTrails?.[nav.game] ?? [];
  const modeTrail = state.modeTrails?.[nav.game] ?? [];
  const table = profitTable({ trail, modeTrail, sizeMs, from, to, trimUnreached: true });

  if (!table.rows.length) {
    return `${C.dim}history   no bucket trail yet${C.reset}`;
  }

  const series = table.rows.slice().reverse().map((bucket) => bucket.byMode[nav.mode] ?? null);
  return `${C.dim}history${C.reset} ${sparkline(series, HISTORY_WIDTH)}`;
}
