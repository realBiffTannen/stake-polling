import { readFileSync } from 'node:fs';

/**
 * The captured math models, and the checks that can be made against a live
 * response without any statistics at all.
 *
 * Everything here degrades to null when the model is absent. A dashboard that
 * invents a convergence band for a game nobody captured is worse than one that
 * prints the sample size and stops.
 */

/** The model file, or an empty model when it is missing or malformed. */
export function loadMathModel(path) {
  try {
    const parsed = JSON.parse(readFileSync(path, 'utf8'));
    return parsed && typeof parsed === 'object' ? parsed : {};
  } catch {
    return {};
  }
}

export function gameModel(model, slug) {
  return model?.[slug] ?? null;
}

export function modeModel(model, slug, mode) {
  return model?.[slug]?.modes?.[mode] ?? null;
}

/**
 * The edge the API itself believes in.
 *
 * NO `expectedShare` divisor. `expectedReturn` is the gross expected house win,
 * `turnover x edge`, and this ratio reproduces the response's own `1 - rtp`
 * exactly. `expectedShare` (7.5%) is a display rate for the accounting page's
 * "Expected" column and has no part in this identity - dividing by it yields
 * 44%, which is not an edge.
 */
export function edgeApi({ expectedReturn, turnover }) {
  if (expectedReturn === null || expectedReturn === undefined || expectedReturn === ''
      || turnover === null || turnover === undefined || turnover === '') return null;
  const e = Number(expectedReturn);
  const t = Number(turnover);
  if (!Number.isFinite(e) || !Number.isFinite(t) || t === 0) return null;
  return e / t;
}

/**
 * Observed house margin: the gross figure over turnover, no share divisor.
 *
 * `profit` on a roster/mode row is ALREADY gross - not the studio's share of
 * it. Verified against a live roster row for pixel-geyser, which carries both
 * `profit: 3320484951` and `revenueShare: 332048494`: revenueShare / profit
 * is exactly 0.100, so `revenueShare` is the separate 10% studio cut and
 * `profit` is the gross GGR it was cut from - the same relationship
 * `money.mjs` documents for the accounting page's own "Profit (10% ggr)" /
 * "Expected" columns, which display SHARES, not this row's raw `profit`.
 *
 * The previous version divided `profit` by `profitShare` here on the false
 * assumption that `profit` already carried the 10% share and needed dividing
 * back out to gross - that inflated every margin by 10x (pixel-geyser BASE
 * read as 89.25% instead of the true 8.93%), which in turn tripped
 * `impossible_margin` as a false CRITICAL on healthy games.
 *
 * `profitShare` is still the right divisor elsewhere: `toShareUsd(profit,
 * money.profitShare, money)` in the views turns this same gross `profit`
 * INTO the studio's dollar share for display, which is a different operation
 * from this ratio and must not change.
 */
export function marginOf({ profit, turnover }) {
  if (profit === null || profit === undefined || profit === '') return null;
  const p = Number(profit);
  const t = Number(turnover);
  if (!Number.isFinite(p) || !Number.isFinite(t) || t === 0) return null;
  return p / t;
}

/**
 * Standard error of the observed margin: sigma / sqrt(N).
 *
 * Honest per BET MODE, where stakes are near-equal so N_eff is about the spin
 * count. NOT honest across a whole game: one 150x buy inside a window of 1x
 * base spins dominates the sum of squared stakes, and this formula would
 * understate the noise by an order of magnitude. Only ever call it per mode.
 */
export function convergence({ sigma, count }) {
  // Routed through `numberOrNull`, not a bare `Number(...)`: a null `sigma`
  // or `count` currently happens to fall out of the `<= 0` rejection anyway
  // (`Number(null)` is exactly 0), so the output was never actually wrong -
  // but that is a numeric coincidence tied to this threshold, not a
  // contract, and callers should not depend on it holding across a future
  // edit to the boundary.
  const s = numberOrNull(sigma);
  const n = numberOrNull(count);
  if (s === null || n === null || n <= 0 || s <= 0) return null;
  return { se: s / Math.sqrt(n), needFor1pp: Math.ceil((s / 0.01) ** 2) };
}

/**
 * A margin means nothing when its own error bar is wider than the edge.
 *
 * `edge` is read the same guarded way as everywhere else in this file: a
 * null/undefined/'' edge is "not captured", and `Number(null)` being 0 and
 * finite must not silently become "the edge is 0%", which would force every
 * comparison to read as unreadable noise instead of "cannot judge - no edge".
 */
export function isReadable(se, edge) {
  const e = numberOrNull(edge);
  if (se === null || se === undefined || e === null) return null;
  return Number(se) < Math.abs(e);
}

const MATCH = 5e-4; // half a tenth of a point - tighter than any real drift

/**
 * @param {{ row: object, game: object|null, mode: object|null, money: object }} input
 * @returns {{ kind: string, severity: 'info'|'warn'|'crit', message: string }[]}
 */
export function checkMode({ row, game, mode, money }) {
  const findings = [];
  const apiEdge = edgeApi(row ?? {});
  // `Number(null)` is 0 and finite, so a bare `Number(row?.rtp)` would turn a
  // missing rtp into a stated 0% RTP - statedEdge 1.0 - and could fire a
  // spurious response_edge_mismatch against a perfectly healthy row. Same
  // guard for count below: a bare coercion would already happen to work via
  // convergence()'s `n <= 0` guard, but that is an accident, not a contract.
  const rtp = numberOrNull(row?.rtp);
  const statedEdge = rtp === null ? null : 1 - rtp;

  // 1. The response against itself. Needs no captured model.
  if (apiEdge !== null && statedEdge !== null && Math.abs(apiEdge - statedEdge) > MATCH) {
    findings.push({
      kind: 'response_edge_mismatch',
      severity: 'crit',
      message: `expectedReturn/turnover is ${pct(apiEdge)} but this response states rtp ${pct(1 - statedEdge)} - the row is malformed or partially populated`,
    });
  }

  // 2. The response against the captured model. `game.edge` is read the same
  //    guarded way as `row?.rtp` above: a malformed model entry with a null
  //    edge must not compare the deployed rtp against a fabricated 0%.
  const capturedEdge = numberOrNull(game?.edge);
  if (game && statedEdge !== null && capturedEdge !== null && Math.abs(statedEdge - capturedEdge) > MATCH) {
    findings.push({
      kind: 'model_drift',
      severity: 'warn',
      message: `deployed edge ${pct(statedEdge)} against captured ${pct(capturedEdge)} - the deployed math is not the captured math version, or a mode was added. Re-capture rather than reading this as player behaviour.`,
    });
  }

  // 3. Arithmetic impossibility. `avg_ticket x count` is turnover, so the whole
  //    liability bound reduces to a range check on the margin itself. Same
  //    guard on `game.maxWin`: a null cap must not silently become `-0`,
  //    which would flag almost any negative margin as impossible.
  const margin = marginOf({ ...row });
  const maxWin = numberOrNull(game?.maxWin);
  if (margin !== null && game && maxWin !== null) {
    if (margin > 1 || margin < -maxWin) {
      findings.push({
        kind: 'impossible_margin',
        severity: 'crit',
        message: `margin ${pct(margin)} is outside [-${maxWin.toLocaleString('en-US')}x, 100%] - a plumbing bug, not variance`,
      });
    }
  }

  // 4. Convergence, and whether the margin can be read at all. `isReadable`
  //    now returns null (not a coerced false) when there is no captured edge
  //    to compare against, and that must skip the finding outright - not
  //    manufacture a "noise" verdict from a comparison edge that isn't there.
  const count = numberOrNull(row?.count);
  const band = count === null ? null : convergence({ sigma: mode?.sigma, count });
  if (band) {
    const readable = isReadable(band.se, capturedEdge);
    if (readable !== null) {
      findings.push({
        kind: readable ? 'readable' : 'noise',
        severity: 'info',
        message: readable
          ? `margin readable: +/-${pct(band.se)} at n=${count.toLocaleString('en-US')}`
          : `margin is noise: +/-${pct(band.se)} at n=${count.toLocaleString('en-US')}, against a ${pct(capturedEdge)} edge. Needs ~${band.needFor1pp.toLocaleString('en-US')} rounds for +/-1pp.`,
      });
    }
  }

  // 5. A zero-inflated mode going quiet is its design, not an outage. Guarded
  //    on `profit` the same way as `rtp` and `count` above: a bare
  //    `Number(row?.profit) === 0` would let a row whose profit was never
  //    read satisfy this condition, and the dashboard would then manufacture
  //    a REASSURANCE - "unremarkable" - about a mode nobody actually measured.
  const profit = numberOrNull(row?.profit);
  if (mode && profit === 0 && count !== null && count > 0
      && count < Number(mode.worstLossStreak ?? 0)) {
    findings.push({
      kind: 'expected_quiet',
      severity: 'info',
      message: `${row.mode} pays nothing on ${pct(mode.zeroRate)} of rounds and runs ${mode.worstLossStreak} losing spins at 1-in-1000 - ${count} quiet spins is unremarkable`,
    });
  }

  return findings;
}

/**
 * A fraction as a percentage string, or '-' when it was never measured.
 *
 * Same guard as `format.mjs`'s `percent()`: `Number(null)` is 0 and finite,
 * so without the explicit check first this would print "0.00%" for a
 * captured-model field (edge, zeroRate, ...) that simply isn't populated.
 */
function pct(v) {
  if (v === null || v === undefined || v === '') return '-';
  const n = Number(v);
  return Number.isFinite(n) ? `${(n * 100).toFixed(2)}%` : '-';
}

/**
 * A row field as a finite number, or null when it was never measured.
 *
 * `Number(null)` is 0 - finite - so a field that is present but `null` would
 * otherwise read as a measured zero. Same three-value guard as
 * `money.mjs`'s `toUsd` and `mode-rows.mjs`'s `number()`.
 */
function numberOrNull(v) {
  if (v === null || v === undefined || v === '') return null;
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
}

/**
 * Where a game's deployed math disagrees with its captured model: a mode the
 * model does not have, a mode at a different cost, or a mode stating a
 * different RTP. The API serves only these few figures of a game's math -
 * sigma, tails and compliance are not exposed - so this is all that can be
 * checked automatically, and any hit means math.json needs recapturing for
 * the game (a new math version was published, or a mode was added).
 *
 * A captured mode missing from the deployed rows is NOT reported: the stats
 * endpoint cannot tell a removed mode from one nobody has played yet this
 * month, and a first-of-the-month false alarm on every buy mode would teach
 * people to ignore the real ones.
 */
export function mathDrift(game, rows) {
  const deployed = (Array.isArray(rows) ? rows : []).filter((r) => typeof r?.mode === 'string');
  if (!game || !deployed.length) return [];
  const modes = game.modes ?? {};
  const gameRtp = numberOrNull(game.edge) === null ? null : 1 - Number(game.edge);
  const out = [];
  for (const row of deployed) {
    const model = modes[row.mode];
    if (!model) {
      out.push({ kind: 'mode_added', mode: row.mode, message: `${row.mode} is deployed but not in math.json` });
      continue;
    }
    const cost = numberOrNull(row.cost), capturedCost = numberOrNull(model.cost);
    if (cost !== null && capturedCost !== null && cost !== capturedCost) {
      out.push({ kind: 'cost', mode: row.mode, message: `${row.mode} costs ${cost}x deployed, ${capturedCost}x captured` });
    }
    const rtp = numberOrNull(row.rtp), capturedRtp = numberOrNull(model.rtp) ?? gameRtp;
    if (rtp !== null && capturedRtp !== null && Math.abs(rtp - capturedRtp) > MATCH) {
      out.push({ kind: 'rtp', mode: row.mode, message: `${row.mode} states ${pct(rtp)} deployed, ${pct(capturedRtp)} captured` });
    }
  }
  const order = { rtp: 0, cost: 1, mode_added: 2 };
  return out.sort((a, b) => order[a.kind] - order[b.kind]);
}
