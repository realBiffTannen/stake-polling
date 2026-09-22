// test/trends.test.mjs
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { rollingMean, returningTrend, pearson } from '../src/insights/trends.mjs';

const daily = [
  { date: '2026-09-16', players: 100, newPlayers: 40, returningPlayers: 60, measured: true },
  { date: '2026-09-17', players: 120, newPlayers: 30, returningPlayers: 90, measured: true },
  { date: '2026-09-18', players: null, newPlayers: null, returningPlayers: null, measured: false },
];
const released = [
  { date: '2026-09-16', released: 10, reconstructed: true },
  { date: '2026-09-17', released: 12, reconstructed: false },
  { date: '2026-09-18', released: 12, reconstructed: false },
];

test('a rolling mean over a window ignores unmeasured days rather than counting them as zero', () => {
  // Day three was never measured, so its window holds only day two's 90.
  assert.deepEqual(rollingMean(daily, 'returningPlayers', 2), [60, 75, 90]);
});

test('a window with nothing measured in it is null, not zero', () => {
  const rows = [{ returningPlayers: null }, { returningPlayers: null }];
  assert.deepEqual(rollingMean(rows, 'returningPlayers', 2), [null, null]);
});

test('the trend divides returning players by the number of games released that day', () => {
  const trend = returningTrend({ daily, released });
  assert.equal(trend[0].avgReturning, 6);
  assert.equal(trend[1].avgReturning, 7.5);
  assert.equal(trend[1].released, 12);
  assert.equal(trend[0].reconstructed, true);
});

test('a day with no measurement carries a null average, never a zero', () => {
  const trend = returningTrend({ daily, released });
  assert.equal(trend[2].avgReturning, null);
});

test('a released count of zero does not divide, it yields null', () => {
  const trend = returningTrend({ daily: [daily[0]], released: [{ date: '2026-09-16', released: 0, reconstructed: true }] });
  assert.equal(trend[0].avgReturning, null);
});

test('pearson correlates two series and reports its sample size', () => {
  const { r, n } = pearson([1, 2, 3, 4], [2, 4, 6, 8]);
  assert.equal(n, 4);
  assert.ok(Math.abs(r - 1) < 1e-9);
});

test('pearson refuses fewer than three pairs rather than reporting a perfect fit', () => {
  assert.equal(pearson([1, 2], [2, 4]), null);
});

test('the 28-day mean spans further back than the 7-day mean', () => {
  const daily = Array.from({ length: 30 }, (_, i) => ({
    date: `2026-09-${String(i + 1).padStart(2, '0')}`,
    // 10 a day for the first 23 days, then 100 a day for the last 7.
    newPlayers: i < 23 ? 10 : 100,
    returningPlayers: i < 23 ? 10 : 100,
    measured: true,
  }));
  const released = daily.map(r => ({ date: r.date, released: 10, reconstructed: false }));
  const last = returningTrend({ daily, released }).at(-1);
  assert.equal(last.rolling7, 100, 'the 7-day window sees only the busy stretch');
  assert.ok(last.rolling28 > 10 && last.rolling28 < 100, `the 28-day window still carries the quiet days: ${last.rolling28}`);
  assert.ok(last.rolling28 < last.rolling7, 'the longer window lags a rise');
  assert.equal(last.newRolling7, 100, 'newRolling7 follows newPlayers, not returningPlayers');
});

test('newRolling7 and rolling7 are not the same series', () => {
  const daily = [
    { date: '2026-09-17', newPlayers: 5, returningPlayers: 50, measured: true },
    { date: '2026-09-18', newPlayers: 5, returningPlayers: 50, measured: true },
  ];
  const released = daily.map(r => ({ date: r.date, released: 5, reconstructed: false }));
  const last = returningTrend({ daily, released }).at(-1);
  assert.equal(last.newRolling7, 5);
  assert.equal(last.rolling7, 50);
});

test('the daily rows define the span; a released-only date is not invented', () => {
  const daily = [{ date: '2026-09-18', newPlayers: 1, returningPlayers: 9, measured: true }];
  const released = [
    { date: '2026-09-17', released: 10, reconstructed: true },
    { date: '2026-09-18', released: 10, reconstructed: false },
  ];
  const trend = returningTrend({ daily, released });
  assert.deepEqual(trend.map(r => r.date), ['2026-09-18']);
});

test('a date with no released row still produces a row, with nulls', () => {
  const daily = [{ date: '2026-09-18', newPlayers: 1, returningPlayers: 9, measured: true }];
  const trend = returningTrend({ daily, released: [] });
  assert.equal(trend[0].released, null);
  assert.equal(trend[0].avgReturning, null);
  assert.equal(trend[0].returningPlayers, 9, 'the measured count survives even with no release data');
});

test('pearson returns exactly -1 for a perfect negative correlation', () => {
  const { r } = pearson([1, 2, 3, 4], [4, 3, 2, 1]);
  assert.equal(r, -1);
});

test('pearson returns null for a constant series (zero variance)', () => {
  assert.equal(pearson([5, 5, 5, 5], [1, 2, 3, 4]), null);
  assert.equal(pearson([1, 2, 3, 4], [7, 7, 7, 7]), null);
});
