import { test } from 'node:test';
import assert from 'node:assert/strict';
import { writeFileSync, mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import {
  loadMathModel, gameModel, modeModel, marginOf, edgeApi,
  convergence, isReadable, checkMode,
} from '../src/tui/math.mjs';
import { gameStats } from './fixtures/live.mjs';

const MONEY = { unitsPerDollar: 1_000_000, profitShare: 0.1, expectedShare: 0.075 };
const model = loadMathModel(new URL('./fixtures/math.json', import.meta.url).pathname);
const near = (a, b, tol = 1e-9) => assert.ok(Math.abs(a - b) < tol, `${a} !== ${b}`);

test('edge_api carries no expectedShare divisor and equals the response own 1 - rtp', () => {
  // Verified against the real capture: all three Pixel Carnivals modes.
  for (const mode of gameStats.stats) {
    near(edgeApi(mode), 1 - mode.rtp, 1e-6);
  }
  near(edgeApi(gameStats.stats[0]), 0.033, 1e-6);
});

test('edge_api is null rather than Infinity on a game with no turnover', () => {
  assert.equal(edgeApi({ expectedReturn: 5, turnover: 0 }), null);
  assert.equal(edgeApi({ expectedReturn: null, turnover: 100 }), null);
});

test('margin is the gross ratio profit/turnover - no share divisor', () => {
  // `profit` on a row is already gross, not the studio's share of it -
  // verified against the live roster, where pixel-geyser carries both
  // `profit: 3320484951` and `revenueShare: 332048494`, and
  // revenueShare/profit is exactly 0.100: the separate 10% cut, taken from a
  // `profit` that is already gross. So a $1,000 profit on $10,000 turnover is
  // directly a 10% margin, with no division by profitShare.
  near(marginOf({ profit: 1_000, turnover: 10_000 }), 0.1);
  assert.equal(marginOf({ profit: 1, turnover: 0 }), null);
});

test('a null profit is not a zero margin, and does not disarm the impossibility check', () => {
  assert.equal(marginOf({ profit: null, turnover: 10_000 }), null);

  // A fabricated 0 would sit inside [-maxWin, 1] and silently suppress the
  // impossible_margin finding - the check exists to catch exactly this class
  // of broken response, so it must not be switched off by one.
  const findings = checkMode({
    row: { mode: 'BASE', turnover: 1_000_000, expectedReturn: 45_000, rtp: 0.955, profit: null, count: 1000 },
    game: gameModel(model, 'metro-night-run'),
    mode: modeModel(model, 'metro-night-run', 'BASE'),
    money: MONEY,
  });
  assert.equal(findings.some((f) => f.kind === 'impossible_margin'), false,
    'an absent margin is not an impossible one - it is simply not a reading');
});

test('convergence is the standard error of the margin, sigma over root n', () => {
  const c = convergence({ sigma: 45.696, count: 10_000 });
  near(c.se, 0.45696, 1e-9);
  assert.equal(c.needFor1pp, Math.ceil((45.696 / 0.01) ** 2));
  assert.equal(convergence({ sigma: 45.696, count: 0 }), null);
  assert.equal(convergence({ sigma: null, count: 100 }), null, 'no sigma means no band, not a guess');
});

test('convergence treats a null count the same explicit way as a null sigma, not by n<=0 coincidence', () => {
  // Before this fix, `Number(null)` coerced to 0 and was rejected only
  // because 0 also happens to fail the `n <= 0` boundary - correct today,
  // but a numeric coincidence rather than a contract. Routed through
  // `numberOrNull` like everywhere else, so a future edit to that boundary
  // (e.g. allowing n === 0 for some reason) cannot silently start reading a
  // null count as a real zero-sample band.
  assert.equal(convergence({ sigma: 45.696, count: null }), null);
  assert.equal(convergence({ sigma: 45.696, count: '' }), null);
  // A genuine zero count still yields no band, for the ordinary reason - you
  // cannot compute a standard error over zero samples.
  assert.equal(convergence({ sigma: 45.696, count: 0 }), null);
});

test('a margin whose error bar is wider than the edge is not readable', () => {
  // Metro BASE: +/-45.7pp against a 4.50% edge.
  assert.equal(isReadable(0.45696, 0.045), false);
  // Metro VIPER_VAULT: +/-1.5pp against the same edge.
  assert.equal(isReadable(0.014647, 0.045), true);
  assert.equal(isReadable(null, 0.045), null);
});

test('math.json carries metro-night-run with all five modes', () => {
  const game = gameModel(model, 'metro-night-run');
  near(game.edge, 0.045);
  assert.equal(game.maxWin, 50_000);
  assert.deepEqual(game.costLadder, [1, 3, 75, 100, 150]);
  assert.deepEqual(
    Object.keys(game.modes).sort(),
    ['ANTE', 'BASE', 'COASTAL_CRUISER', 'ICY_SPINOUT', 'VIPER_VAULT'],
  );
  assert.equal(modeModel(model, 'metro-night-run', 'BASE').sigma, 45.696);
  assert.equal(modeModel(model, 'metro-night-run', 'ANTE').worstLossStreak, 174);
});

test('an unknown game or mode degrades to null rather than throwing', () => {
  assert.equal(gameModel(model, 'no-such-game'), null);
  assert.equal(modeModel(model, 'metro-night-run', 'NO_SUCH_MODE'), null);
  assert.equal(modeModel({}, 'anything', 'BASE'), null);
});

test('a missing math.json loads as an empty model, not an exception', () => {
  assert.deepEqual(loadMathModel('/nonexistent/math.json'), {});
});

test('a malformed math.json loads as an empty model, not an exception', () => {
  const dir = mkdtempSync(join(tmpdir(), 'math-test-'));
  const badPath = join(dir, 'math.json');
  writeFileSync(badPath, '{ this is not valid JSON', 'utf8');
  assert.deepEqual(loadMathModel(badPath), {});
});

test('the response-internal check needs no math.json at all', () => {
  const broken = { mode: 'BASE', turnover: 1000, expectedReturn: 500, rtp: 0.955, profit: 10, count: 10 };
  const findings = checkMode({ row: broken, game: null, mode: null, money: MONEY });
  const drift = findings.find((f) => f.kind === 'response_edge_mismatch');
  assert.ok(drift, 'expectedReturn/turnover of 50% against a stated 4.5% edge must be caught');
  assert.equal(drift.severity, 'crit');
});

test('a healthy mode raises nothing', () => {
  const healthy = { mode: 'BASE', turnover: 1_000_000, expectedReturn: 45_000, rtp: 0.955, profit: 4_500, count: 1000 };
  const findings = checkMode({
    row: healthy,
    game: gameModel(model, 'metro-night-run'),
    mode: modeModel(model, 'metro-night-run', 'BASE'),
    money: MONEY,
  });
  assert.deepEqual(findings.filter((f) => f.severity !== 'info'), []);
});

test('a deployed RTP that disagrees with the captured model is flagged as a version change', () => {
  const drifted = { mode: 'BASE', turnover: 1_000_000, expectedReturn: 33_000, rtp: 0.967, profit: 3_300, count: 1000 };
  const findings = checkMode({
    row: drifted,
    game: gameModel(model, 'metro-night-run'),
    mode: modeModel(model, 'metro-night-run', 'BASE'),
    money: MONEY,
  });
  const drift = findings.find((f) => f.kind === 'model_drift');
  assert.ok(drift);
  assert.match(drift.message, /math/i, 'the wording must point at the math version, not at players');
});

test('a margin outside [-maxWin, 1] is impossible, not unlucky', () => {
  const impossible = { mode: 'BASE', turnover: 1000, expectedReturn: 45, rtp: 0.955, profit: 2000, count: 10 };
  // profit is already gross (no share division): 2000 on turnover 1000 -> margin 200%.
  const findings = checkMode({
    row: impossible,
    game: gameModel(model, 'metro-night-run'),
    mode: modeModel(model, 'metro-night-run', 'BASE'),
    money: MONEY,
  });
  const bad = findings.find((f) => f.kind === 'impossible_margin');
  assert.ok(bad);
  assert.equal(bad.severity, 'crit');
});

test('a null rtp is absent, not a stated 0% RTP, and raises no spurious edge mismatch', () => {
  // Before the fix, `Number(null)` coerced to 0, making statedEdge 1.0 - a
  // 100% house edge - against an apiEdge of 4.5%, firing a critical
  // response_edge_mismatch on a perfectly ordinary row whose rtp field
  // simply had not landed yet.
  const findings = checkMode({
    row: { mode: 'BASE', turnover: 1_000_000, expectedReturn: 45_000, rtp: null, profit: 45_000, count: 1000 },
    game: gameModel(model, 'metro-night-run'),
    mode: modeModel(model, 'metro-night-run', 'BASE'),
    money: MONEY,
  });
  assert.equal(findings.some((f) => f.kind === 'response_edge_mismatch'), false,
    'an absent rtp must not be read as a stated 0% RTP');
  assert.equal(findings.some((f) => f.kind === 'model_drift'), false,
    'an absent rtp must not be compared against the captured model either');
});

test('a genuinely stated rtp of 0 is still evaluated, not skipped as absent', () => {
  // rtp: 0 is a real (if alarming) measured reading - this mode returned
  // nothing at all - and must still drive both edge checks, unlike a null.
  const findings = checkMode({
    row: { mode: 'BASE', turnover: 1_000_000, expectedReturn: 1_000_000, rtp: 0, profit: 45_000, count: 1000 },
    game: gameModel(model, 'metro-night-run'),
    mode: modeModel(model, 'metro-night-run', 'BASE'),
    money: MONEY,
  });
  // apiEdge (1_000_000/1_000_000 = 1.0) agrees with statedEdge (1 - 0 = 1.0),
  // so no mismatch - proof rtp: 0 was actually used in the comparison.
  assert.equal(findings.some((f) => f.kind === 'response_edge_mismatch'), false);
  // metro-night-run's captured edge is 4.5%, nowhere near the 100% edge a
  // real rtp of 0 implies - model_drift firing proves the 0 was evaluated,
  // not silently dropped the way an absent rtp is.
  assert.equal(findings.some((f) => f.kind === 'model_drift'), true,
    'rtp: 0 is a real edge of 100% and must be checked against the captured model');
});

test('a null count skips the convergence check outright, not by accident of n<=0', () => {
  const findings = checkMode({
    row: { mode: 'BASE', turnover: 1_000_000, expectedReturn: 45_000, rtp: 0.955, profit: 45_000, count: null },
    game: gameModel(model, 'metro-night-run'),
    mode: modeModel(model, 'metro-night-run', 'BASE'),
    money: MONEY,
  });
  assert.equal(findings.some((f) => f.kind === 'readable' || f.kind === 'noise'), false,
    'no sample size exists for a mode whose count was never measured this poll');
});

test('a genuine count of 0 is evaluated as zero samples, still with no band - same as convergence() alone', () => {
  const findings = checkMode({
    row: { mode: 'BASE', turnover: 0, expectedReturn: 0, rtp: 0.955, profit: 0, count: 0 },
    game: gameModel(model, 'metro-night-run'),
    mode: modeModel(model, 'metro-night-run', 'BASE'),
    money: MONEY,
  });
  assert.equal(findings.some((f) => f.kind === 'readable' || f.kind === 'noise'), false,
    'zero samples cannot produce a standard error, but this is n=0, not an absent reading');
});

test('a quiet zero-inflated mode is reported as expected, not as a stall', () => {
  const ante = modeModel(model, 'metro-night-run', 'ANTE');
  const findings = checkMode({
    row: { mode: 'ANTE', turnover: 3000, expectedReturn: 135, rtp: 0.955, profit: 0, count: 120 },
    game: gameModel(model, 'metro-night-run'),
    mode: ante,
    money: MONEY,
  });
  const quiet = findings.find((f) => f.kind === 'expected_quiet');
  assert.ok(quiet, 'ANTE runs 174 losing spins at 1-in-1000; 120 is unremarkable');
  assert.equal(quiet.severity, 'info');
});

test('a null profit does not manufacture an expected_quiet reassurance', () => {
  // Before the fix, `Number(null) === 0` satisfied the rule's first
  // condition, and the dashboard would tell the reader "ANTE pays nothing on
  // 73.03% of rounds ... 120 quiet spins is unremarkable" about a mode whose
  // profit was never actually read - a reassurance manufactured from an
  // absent reading, worse than the other instances because it tells a reader
  // watching a genuinely stalled bonus that everything is fine.
  const ante = modeModel(model, 'metro-night-run', 'ANTE');
  const findings = checkMode({
    row: { mode: 'ANTE', turnover: 3000, expectedReturn: 135, rtp: 0.955, profit: null, count: 120 },
    game: gameModel(model, 'metro-night-run'),
    mode: ante,
    money: MONEY,
  });
  assert.equal(findings.some((f) => f.kind === 'expected_quiet'), false,
    'an unread profit must raise no opinion at all, not a quiet verdict');
});

test('a genuine profit of exactly 0 still raises expected_quiet - this is the rule the check exists for', () => {
  // The opposite-direction pin: fixing the null case must not also swallow
  // the real, measured zero this rule exists to explain.
  const ante = modeModel(model, 'metro-night-run', 'ANTE');
  const findings = checkMode({
    row: { mode: 'ANTE', turnover: 3000, expectedReturn: 135, rtp: 0.955, profit: 0, count: 120 },
    game: gameModel(model, 'metro-night-run'),
    mode: ante,
    money: MONEY,
  });
  const quiet = findings.find((f) => f.kind === 'expected_quiet');
  assert.ok(quiet, 'a genuinely measured zero-profit mode below its worst loss streak must still be explained');
  assert.equal(quiet.severity, 'info');
});

// --- Sweep of checkMode for the same trap on the captured-model side ---
//
// Instance #7 (above) was found on `row.profit`. Sweeping the rest of
// checkMode turned up two more bare `Number(...)` coercions on fields that
// could arrive null - not from the live row this time, but from a partially
// populated captured math.json entry: `game.edge` (drove model_drift) and
// `game.maxWin` (drove impossible_margin). A third, more indirect instance
// was `isReadable`/`pct` being handed that same possibly-null `game.edge`
// without a guard. None of these are reachable with today's math.json (every
// entry is fully populated), but the fix closes the class the same way as
// everywhere else in this file, defensively, before a malformed capture ever
// ships one.

test('a captured model missing its edge field raises no model_drift, rather than comparing against a fabricated 0%', () => {
  const findings = checkMode({
    row: { mode: 'BASE', turnover: 1_000_000, expectedReturn: 45_000, rtp: 0.955, profit: 45_000, count: 1000 },
    game: { edge: null, maxWin: 50_000, modes: {} },
    mode: null,
    money: MONEY,
  });
  assert.equal(findings.some((f) => f.kind === 'model_drift'), false,
    'a null captured edge must not be read as a captured 0% edge');
});

test('a captured model missing its maxWin raises no impossible_margin, rather than treating the cap as 0', () => {
  // `-Number(null)` is `-0`; without the guard, `margin < -0` would flag
  // almost any negative margin as impossible even though the model simply
  // never captured a max-win cap.
  const findings = checkMode({
    row: { mode: 'BASE', turnover: 10_000, expectedReturn: 450, rtp: 0.955, profit: -50, count: 1000 },
    game: { edge: 0.045, maxWin: null, modes: {} },
    mode: null,
    money: MONEY,
  });
  assert.equal(findings.some((f) => f.kind === 'impossible_margin'), false,
    'a null captured maxWin must not silently become a 0x cap');
});

test('a captured model missing its edge field skips the readable/noise verdict, rather than defaulting to noise', () => {
  const findings = checkMode({
    row: { mode: 'BASE', turnover: 1_000_000, expectedReturn: 45_000, rtp: 0.955, profit: 45_000, count: 1000 },
    game: { edge: null, maxWin: 50_000, modes: {} },
    mode: { sigma: 45.696 },
    money: MONEY,
  });
  assert.equal(findings.some((f) => f.kind === 'readable' || f.kind === 'noise'), false,
    'with no captured edge to compare against, readability cannot be judged at all - not defaulted to "noise"');
});

test('a fully captured model still raises model_drift, impossible_margin and noise exactly as before the sweep', () => {
  // Guards against over-correction: a real, fully-populated game/mode must
  // behave identically to every other test in this file.
  const drifted = { mode: 'BASE', turnover: 1_000_000, expectedReturn: 33_000, rtp: 0.967, profit: 3_300, count: 1000 };
  const findings = checkMode({
    row: drifted,
    game: gameModel(model, 'metro-night-run'),
    mode: modeModel(model, 'metro-night-run', 'BASE'),
    money: MONEY,
  });
  assert.ok(findings.some((f) => f.kind === 'model_drift'), 'model_drift must still fire with a real captured edge');
  assert.ok(findings.some((f) => f.kind === 'noise'), 'BASE must still be readable-checked with a real captured edge');
});

// --- Regression: the profitShare-division bug (fixed 2026-09-19) ---
//
// `marginOf` used to divide `profit` by `profitShare` on the false assumption
// that a row's `profit` already carried the studio's 10% share and had to be
// divided back out to gross. Live data disproves that: pixel-geyser's roster
// row carries both `profit: 3320484951` and `revenueShare: 332048494`, and
// revenueShare/profit is exactly 0.100 - `profit` IS the gross figure,
// `revenueShare` is the separate 10% cut taken from it. The bug inflated
// every margin by 10x and made `impossible_margin` fire as a false CRITICAL
// on every healthy game (pixel-geyser BASE read as 89.25% instead of 8.93%).

test('regression: a real gross row (pixel-geyser BASE shape, ~8.93% margin) does not trip impossible_margin', () => {
  const turnover = 1_000_000_000; // micro-dollars
  const profit = 89_300_000;      // gross, 8.93% of turnover - matches the live BASE reading
  const row = {
    mode: 'BASE', turnover, profit, count: 5000,
    expectedReturn: profit, rtp: 1 - profit / turnover,
  };
  const game = { edge: profit / turnover, maxWin: 10_000, modes: {} };

  near(marginOf(row), 0.0893, 1e-9);

  const findings = checkMode({ row, game, mode: null, money: MONEY });
  assert.equal(findings.some((f) => f.kind === 'impossible_margin'), false,
    'a few-percent gross margin is not an impossible >100% margin - the old /profitShare arithmetic said it was');
});
