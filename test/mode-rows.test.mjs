import { test } from 'node:test';
import assert from 'node:assert/strict';
import { buildModeRows } from '../src/tui/mode-rows.mjs';
import { loadMathModel } from '../src/tui/math.mjs';
import { metroGameStats } from './fixtures/live.mjs';

const MIN = 60000;
const NOW = Date.parse('2026-09-16T15:00:00Z');
const config = {
  money: { unitsPerDollar: 1_000_000, profitShare: 0.1, expectedShare: 0.075 },
  dayBoundaryUtcHour: 12,
  pollMinutes: 5,
};
const mathModel = loadMathModel(new URL('./fixtures/math.json', import.meta.url).pathname);

const snapshot = { ok: true, data: metroGameStats };
const gameRow = { name: 'metro-night-run', turnover: 19_042_500_000, count: 55_462, profit: -103_087_500 };

/** Cumulative per-mode samples, minutes back from NOW. */
const modeTrail = [
  { ts: NOW - 10 * MIN, fields: { 'BASE:turnover': 11_000_000_000, 'BASE:profit': -400_000_000, 'BASE:count': 44000 } },
  { ts: NOW - 5 * MIN,  fields: { 'BASE:turnover': 11_500_000_000, 'BASE:profit': -410_000_000, 'BASE:count': 46000 } },
  { ts: NOW,            fields: { 'BASE:turnover': 12_000_000_000, 'BASE:profit': -420_000_000, 'BASE:count': 48210 } },
];

const build = (overrides = {}) => buildModeRows({
  snapshot, modeTrail, gameRow, now: NOW, config, mathModel, slug: 'metro-night-run', ...overrides,
});

test('every mode in the snapshot becomes a row, in canonical order', () => {
  assert.deepEqual(
    build().map((r) => r.mode),
    ['BASE', 'ANTE', 'COASTAL_CRUISER', 'ICY_SPINOUT', 'VIPER_VAULT'],
  );
});

test('the fields the old view discarded are all present', () => {
  const base = build().find((r) => r.mode === 'BASE');
  assert.equal(base.cost, 1);
  assert.equal(base.avgBet, 0.25);
  assert.equal(base.turnover, 12_000_000_000);
  assert.equal(base.profit, -420_000_000);
  assert.equal(base.expectedReturn, 540_000_000);
  assert.equal(base.normalizedRtp, 0.9490);
});

test('turnover converts gross and profit converts at the studio share', () => {
  const base = build().find((r) => r.mode === 'BASE');
  assert.equal(base.turnoverUsd, 12_000);
  assert.equal(base.profitUsd, -42, 'profit is the 10% share: -420_000_000 micro-$ x 0.1');
  assert.equal(base.expectedUsd, 40.5, 'expected displays at 7.5%');
});

test('vsExpected is computed gross, before either share is applied', () => {
  const base = build().find((r) => r.mode === 'BASE');
  // Subtracting the two CONVERTED figures would subtract a 10% share from a
  // 7.5% share and produce a number that means nothing.
  assert.equal(base.vsExpected, -420_000_000 - 540_000_000);
});

test('share of the game is computed from the snapshot totals', () => {
  const base = build().find((r) => r.mode === 'BASE');
  assert.ok(Math.abs(base.shareTurnover - 12_000_000_000 / 19_042_500_000) < 1e-9);
});

test('a mode with a trail gets rates and day totals', () => {
  const base = build().find((r) => r.mode === 'BASE');
  assert.equal(base.dTurnover, 500_000_000);
  assert.equal(base.dCount, 2210);
  assert.equal(base.dProfit, -10_000_000);
  assert.equal(base.dayTurnover, 1_000_000_000, 'the whole trail sits after 12:00Z');
});

test('a mode with no trail shows dashes, not zeros', () => {
  const ante = build().find((r) => r.mode === 'ANTE');
  assert.equal(ante.dTurnover, null, '$0.00 would claim we measured a quiet interval');
  assert.equal(ante.dCount, null);
  assert.equal(ante.dayTurnover, null);
  assert.deepEqual(ante.spark, []);
  // Its snapshot totals are still known and still shown.
  assert.equal(ante.turnover, 4_560_000_000);
});

test('an empty trail leaves every snapshot figure intact', () => {
  const rows = build({ modeTrail: [] });
  assert.equal(rows.length, 5);
  assert.equal(rows.find((r) => r.mode === 'BASE').turnover, 12_000_000_000);
  assert.equal(rows.find((r) => r.mode === 'BASE').dTurnover, null);
});

test('a failed or absent snapshot yields no rows rather than throwing', () => {
  assert.deepEqual(build({ snapshot: null }), []);
  assert.deepEqual(build({ snapshot: { ok: false, data: null } }), []);
});

test('findings ride along on each row', () => {
  const base = build().find((r) => r.mode === 'BASE');
  assert.ok(Array.isArray(base.findings));
  // 12bn micro-$ of turnover at n=48,210 on a sigma of 45.696 is still noise.
  assert.ok(base.findings.some((f) => f.kind === 'noise'));
});

test('a game absent from math.json still builds rows, just without a band', () => {
  const rows = buildModeRows({
    snapshot, modeTrail, gameRow, now: NOW, config, mathModel: {}, slug: 'metro-night-run',
  });
  assert.equal(rows.length, 5);
  assert.equal(rows[0].findings.some((f) => f.kind === 'noise' || f.kind === 'readable'), false);
});

test('vsExpected is null when either side is missing, never a coerced zero', () => {
  const snapshot = { ok: true, data: { stats: [
    { mode: 'BASE', count: 10, turnover: 1_000_000, profit: null, expectedReturn: 45_000, rtp: 0.955, cost: 1, avgBet: 0.25 },
    { mode: 'ANTE', count: 10, turnover: 1_000_000, profit: 45_000, expectedReturn: null, rtp: 0.955, cost: 3, avgBet: 0.25 },
  ] } };
  const rows = buildModeRows({
    snapshot, modeTrail: [], gameRow, now: NOW, config, mathModel, slug: 'metro-night-run',
  });
  // `null - 45000` would be -45000: a confident figure for something we never measured.
  assert.equal(rows.find((r) => r.mode === 'BASE').vsExpected, null);
  assert.equal(rows.find((r) => r.mode === 'ANTE').vsExpected, null);
  assert.equal(rows.find((r) => r.mode === 'BASE').vsExpectedUsd, null);
});

test('a share of an unmeasured figure is null, but a share of a measured zero survives as zero', () => {
  const snapshot = { ok: true, data: { stats: [
    // BASE never had its turnover measured this poll: `Number(null)` is 0 and
    // finite, so a bare coercion would report "0% of the game's turnover" -
    // a confident, wrong statement about a figure that simply isn't there.
    { mode: 'BASE', count: 10, turnover: null, profit: 45_000, expectedReturn: 45_000, rtp: 0.955, cost: 1, avgBet: 0.25 },
    // ANTE genuinely took zero turnover this poll - a real measured zero,
    // and its share of the game's turnover is a real, reportable 0.
    { mode: 'ANTE', count: 10, turnover: 0, profit: 45_000, expectedReturn: 45_000, rtp: 0.955, cost: 3, avgBet: 0.25 },
  ] } };
  const rows = buildModeRows({
    snapshot, modeTrail: [], gameRow: { turnover: 1_000_000, count: 100, profit: 1000 },
    now: NOW, config, mathModel, slug: 'metro-night-run',
  });
  assert.equal(rows.find((r) => r.mode === 'BASE').shareTurnover, null);
  assert.equal(rows.find((r) => r.mode === 'ANTE').shareTurnover, 0);
});

test('a null value inside a trail sample is excluded, not read as a present zero reading', () => {
  // `normaliseModes` (../modes.mjs) never writes a null/'' field in
  // production - only a finite number, or the key is simply absent - so this
  // is defensive rather than reproducing an observed bug. But the old filter
  // (`Number.isFinite(Number(x)) && x !== ''`) would have treated a
  // corrupted `null` entry as a genuine reading of zero turnover, and a
  // delta computed against a fabricated zero swings wildly in both
  // directions instead of simply skipping the bad sample.
  const trail = [
    { ts: NOW - 10 * MIN, fields: { 'BASE:turnover': 11_000_000_000, 'BASE:count': 44000 } },
    { ts: NOW - 5 * MIN,  fields: { 'BASE:turnover': null, 'BASE:count': 46000 } },
    { ts: NOW,            fields: { 'BASE:turnover': 12_000_000_000, 'BASE:count': 48210 } },
  ];
  const base = build({ modeTrail: trail }).find((r) => r.mode === 'BASE');
  // The null sample is dropped entirely: the only delta left is between the
  // first and third readings, 1,000,000,000 - not a fabricated 0 or 12bn.
  assert.equal(base.dTurnover, 1_000_000_000);
  assert.deepEqual(base.spark, [1_000_000_000]);
  assert.equal(base.dayTurnover, 1_000_000_000);
});
