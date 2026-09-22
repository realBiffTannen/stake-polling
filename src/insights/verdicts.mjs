import { checkMode, convergence, marginOf, isReadable } from '../math/checks.mjs';
import { pearson } from './trends.mjs';

/**
 * What the captured math says, set against what players actually did.
 *
 * Every verdict states its sample size and whether the claim is readable at
 * that size. A verdict whose error bar is wider than the effect it describes
 * is reported as "not readable yet" - the dashboard's job is to say when it
 * cannot tell, not to guess louder.
 *
 * `readable` is a three-value guard, same discipline as `isReadable` in
 * src/math/checks.mjs: `true`/`false` once there is a captured edge and a
 * convergence band to compare it to, and `null` - never a coerced `false` -
 * when there was no captured model to judge against at all. Reporting a
 * missing model as `false` would read as "this is noise", which is a claim;
 * the honest statement is "this cannot be judged".
 *
 * Nothing here recommends a change. The RTP band ceiling and the compliance
 * limits are the operator's business; this module only reports what is true.
 */

const num = (v) => (v === null || v === undefined || v === '' ? null : Number.isFinite(Number(v)) ? Number(v) : null);
const pct = (v) => (v === null ? '-' : `${(v * 100).toFixed(2)}%`);

/**
 * @param {{ row: object, game: object|null, mode: object|null, money: object }} input
 * @returns {Verdict[]}
 */
export function modeVerdicts({ row, game, mode, money }) {
  const count = num(row?.count);
  const band = convergence({ sigma: mode?.sigma, count });
  const edge = num(game?.edge);
  const readable = band ? isReadable(band.se, edge) : null;
  const base = checkMode({ row, game, mode, money }).map(v => ({ ...v, n: count, readable }));

  // checkMode() deliberately emits nothing about the convergence band when
  // there is no captured edge to judge it against (isReadable returns null,
  // and it skips the finding rather than manufacture "noise"). But a mode
  // with a captured sigma and no captured edge is a real, distinct state -
  // "there is a model, it just has no rate to compare against" - and it
  // should still be visible, with readable explicitly null, never a false
  // that would read as "this is noise".
  if (band && edge === null) {
    base.push({
      kind: 'band', severity: 'info', n: count, readable: null,
      message: `margin band +/-${pct(band.se)} at n=${count.toLocaleString('en-US')} - no captured edge to compare against`,
    });
  }

  // Observed margin against the captured edge, expressed in standard errors.
  // checkMode() already reports whether the margin is readable at this n; this
  // adds the direction and magnitude of the drift once it clears a plain
  // significance bar, so a game that is quietly running hot or cold shows up
  // even before the mismatch is large enough to trip model_drift.
  //
  // `row.profit` is already gross - see the doc comment on `marginOf` in
  // src/math/checks.mjs - so no `profitShare` is passed here.
  const margin = marginOf({ ...row });
  if (band && edge !== null && margin !== null) {
    const z = (margin - edge) / band.se;
    if (Math.abs(z) >= 3) {
      base.push({
        kind: 'volatility_drift', severity: Math.abs(z) >= 5 ? 'warn' : 'info', n: count, readable,
        message: `observed margin ${pct(margin)} sits ${z.toFixed(1)} standard errors from the captured ${pct(edge)} at n=${count.toLocaleString('en-US')}`,
      });
    }
  }
  return base;
}

/**
 * How play is actually distributed across the designed cost ladder.
 *
 * @param {{ rows: object[], game: object|null }} input
 * @returns {Verdict|null}
 */
export function mixVerdict({ rows = [], game }) {
  if (!game?.modes) return null;
  const played = rows.filter(r => num(r?.count) > 0);
  const total = played.reduce((a, r) => a + num(r.count), 0);
  if (!total) return null;
  const silent = Object.keys(game.modes).filter(name => !played.some(r => r.mode === name));
  const shares = played
    .map(r => `${r.mode} ${((num(r.count) / total) * 100).toFixed(1)}%`)
    .join(', ');
  return {
    kind: 'mode_mix', severity: 'info', n: total, readable: total >= 100,
    message: silent.length
      ? `played mix ${shares}; designed but unplayed in this window: ${silent.join(', ')}`
      : `played mix ${shares}`,
  };
}

/**
 * A margin beyond the captured max win is a plumbing bug, not a tail event -
 * report it as certain (readable: true) regardless of sample size, since a
 * single impossible round is proof on its own and does not need convergence.
 *
 * @param {{ row: object, game: object|null, mode: object|null, money: object }} input
 * @returns {Verdict|null}
 */
export function tailVerdict({ row, game, mode, money }) {
  const maxWin = num(game?.maxWin);
  // `row.profit` is already gross - see `marginOf` in src/math/checks.mjs.
  const margin = marginOf({ ...row });
  if (maxWin === null || margin === null) return null;
  if (margin >= -maxWin) return null;
  return {
    kind: 'beyond_max_win', severity: 'crit', n: num(row?.count), readable: true,
    message: `this window lost ${pct(-margin)} of turnover against a captured ${maxWin.toLocaleString('en-US')}x cap - a plumbing bug, not a tail event`,
  };
}

/**
 * All verdicts for one game across every row this window, worst severity
 * first. A game with no captured model (`game: null`) produces nothing -
 * never a verdict computed against a fabricated baseline.
 *
 * @param {{ rows: object[], game: object|null, money: object }} input
 * @returns {Verdict[]}
 */
export function gameVerdicts({ rows = [], game, money }) {
  if (!game) return [];
  const out = [];
  for (const row of rows) {
    const mode = game.modes?.[row.mode] ?? null;
    const modeFindings = modeVerdicts({ row, game, mode, money });
    out.push(...modeFindings);
    // beyond_max_win and checkMode's impossible_margin both fire on the same
    // condition (margin < -maxWin) - one cap breach is one crit, not two, so
    // only add the tail verdict when this row didn't already report it.
    const alreadyFlagged = modeFindings.some(v => v.kind === 'impossible_margin');
    if (!alreadyFlagged) {
      const tail = tailVerdict({ row, game, mode, money });
      if (tail) out.push(tail);
    }
  }
  const mix = mixVerdict({ rows, game });
  if (mix) out.push(mix);
  const order = { crit: 0, warn: 1, info: 2 };
  return out.sort((a, b) => order[a.severity] - order[b.severity]);
}

/**
 * Whether a game's math shape moves with how many of its players come back.
 *
 * Correlation across a dozen titles is weak evidence and is labelled as such:
 * each row carries its own n, and a game with no captured model is excluded
 * rather than defaulted to some average.
 *
 * `note` describes the DIMENSION only - never a direction. `r` is computed
 * independently of any prose, so a hard-coded "higher X, fewer players"
 * sentence can (and, on live data, will) end up asserting the opposite of
 * what that row's own number says. The direction belongs at render time,
 * derived from the sign and size of `r` - see src/web/views/trends.mjs.
 */
export function correlations({ games = [], model = {} }) {
  const rows = games
    .map(g => ({ ...g, math: model[g.slug] }))
    .filter(g => g.math && num(g.players) > 0 && num(g.returningPlayers) !== null)
    .map(g => ({ ...g, rate: g.returningPlayers / g.players }));
  const dims = [
    { label: 'returning rate against base volatility', pick: g => num(g.math.baseVolatility),
      note: 'the captured base volatility of each game' },
    { label: 'returning rate against house edge', pick: g => num(g.math.edge),
      note: 'the captured house edge of each game' },
    { label: 'returning rate against top bonus cost',
      pick: g => (Array.isArray(g.math.costLadder) && g.math.costLadder.length
        ? Math.max(...g.math.costLadder) : null),
      note: "the price of each game's most expensive bonus buy" },
  ];
  const out = [];
  for (const dim of dims) {
    const result = pearson(rows.map(dim.pick), rows.map(g => g.rate));
    if (result) out.push({ label: dim.label, r: result.r, n: result.n, note: dim.note });
  }
  return out;
}
