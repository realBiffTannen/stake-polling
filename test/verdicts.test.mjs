import { test } from 'node:test';
import assert from 'node:assert/strict';
import { modeVerdicts, mixVerdict, tailVerdict, gameVerdicts } from '../src/insights/verdicts.mjs';

const money = { unitsPerDollar: 1_000_000, profitShare: 0.1, expectedShare: 0.075 };
const game = {
  edge: 0.033, maxWin: 10000, costLadder: [1, 35],
  tail: { '5000': 9.8e-4, '10000': 9.8e-4 },
  modes: {
    BASE: { cost: 1, rtp: 0.967, sigma: 11.1874, zeroRate: 0.944, hitRate: 0.056, worstLossStreak: 120 },
    BONUS0: { cost: 35, rtp: 0.967, sigma: 1.2007, zeroRate: 0, hitRate: 0.187, worstLossStreak: 33 },
  },
};
// `profit` is gross, not the studio's 10% share (see `marginOf` in
// src/math/checks.mjs) - so the default profit that lands margin on the
// captured edge (0.033) is 33_000_000 on turnover 1_000_000_000, not the
// 3_300_000 a /profitShare division would have needed.
const row = (over = {}) => ({ mode: 'BASE', count: 1000, turnover: 1000_000_000, profit: 33_000_000, rtp: 0.967, expectedReturn: 33_000_000, ...over });

test('every existing check still fires through the new entry point', () => {
  const found = modeVerdicts({ row: row({ rtp: 0.90 }), game, mode: game.modes.BASE, money });
  assert.ok(found.some(v => v.kind === 'model_drift'));
});

test('a verdict carries its sample size and whether it is readable', () => {
  const found = modeVerdicts({ row: row(), game, mode: game.modes.BASE, money });
  const band = found.find(v => v.kind === 'noise' || v.kind === 'readable');
  assert.equal(band.n, 1000);
  assert.equal(typeof band.readable, 'boolean');
});

test('a captured model with no edge yields readable null, not a verdict of noise', () => {
  const edgeless = { ...game, edge: null };
  const found = modeVerdicts({ row: row(), game: edgeless, mode: game.modes.BASE, money });
  assert.ok(found.length > 0, 'a mode with a captured sigma still reports its band');
  for (const v of found) {
    assert.equal(v.readable, null, `${v.kind} must not claim readability with no edge to compare against`);
    assert.notEqual(v.readable, false, 'null must never be coerced to false');
  }
});

test('a plausible drift is reported as volatility_drift, isolated from impossible_margin', () => {
  // sigma=11.1874, n=1000 -> se = 11.1874/sqrt(1000) = 0.35377665...
  // Target z = -4 SE from the captured edge (0.033): margin = 0.033 + (-4 * se) = -1.3821066...
  // profit is gross (no share division - see `marginOf`): profit = margin * turnover
  // = -1.3821066 * 1_000_000_000 = -1_382_106_600 exactly.
  // This margin (-1.38) sits well inside [-maxWin(-10000), 1], so neither impossible_margin
  // nor beyond_max_win can fire - only the z-score path is exercised.
  const found = modeVerdicts({ row: row({ profit: -1_382_106_600 }), game, mode: game.modes.BASE, money });
  const kinds = found.map(v => v.kind);
  assert.ok(kinds.includes('volatility_drift'), `expected volatility_drift, got: ${kinds.join(', ')}`);
  assert.ok(!kinds.includes('impossible_margin'), `impossible_margin must not fire here, got: ${kinds.join(', ')}`);
  const drift = found.find(v => v.kind === 'volatility_drift');
  assert.equal(drift.n, 1000);
});

test('a mode nobody plays is reported against the designed cost ladder', () => {
  const verdict = mixVerdict({ rows: [row({ mode: 'BASE', count: 10000 }), row({ mode: 'BONUS0', count: 0, turnover: 0 })], game });
  assert.equal(verdict.kind, 'mode_mix');
  assert.match(verdict.message, /BONUS0/);
});

test('mode mix says nothing when no mode has been played at all', () => {
  assert.equal(mixVerdict({ rows: [row({ count: 0, turnover: 0 })], game }), null);
});

test('a win beyond the captured max win is a crit, not variance', () => {
  const verdict = tailVerdict({ row: row({ profit: -20_000_000_000, turnover: 1_000_000 }), game, mode: game.modes.BASE, money });
  assert.equal(verdict.severity, 'crit');
});

test('no captured model yields no fabricated verdicts', () => {
  assert.deepEqual(gameVerdicts({ rows: [row()], game: null, money }), []);
});

test('one cap breach produces one crit, not two', () => {
  // expectedReturn is overridden alongside turnover (to statedEdge * turnover
  // = 0.033 * 1_000_000 = 33_000) so the row stays internally consistent and
  // the only crit-worthy fact left is the cap breach itself - otherwise the
  // default expectedReturn (sized for the default 1e9 turnover) would trip
  // an unrelated response_edge_mismatch and defeat the "one crit" assertion.
  const breach = row({ profit: -20_000_000_000, turnover: 1_000_000, expectedReturn: 33_000 });
  const found = gameVerdicts({ rows: [breach], game, money });
  const crits = found.filter(v => v.severity === 'crit');
  assert.equal(crits.length, 1, `one event, one crit: got ${crits.map(v => v.kind).join(', ')}`);
});
