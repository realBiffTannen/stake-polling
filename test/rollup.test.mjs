import { test } from 'node:test';
import assert from 'node:assert/strict';
import { rollupModeDays, mergeModeDays } from '../src/insights/rollup.mjs';

const at = (iso) => Date.parse(iso);
const sample = (iso, fields) => ({ ts: at(iso), fields });

test('a mode day is the difference across that UTC calendar day', () => {
  const modeTrail = [
    sample('2026-09-17T23:55:00Z', { 'BASE:count': 100, 'BASE:turnover': 1000, 'BASE:profit': 10 }),
    sample('2026-09-18T11:00:00Z', { 'BASE:count': 160, 'BASE:turnover': 1600, 'BASE:profit': 25 }),
    sample('2026-09-18T23:55:00Z', { 'BASE:count': 200, 'BASE:turnover': 2000, 'BASE:profit': 30 }),
  ];
  const days = rollupModeDays({ modeTrail, from: at('2026-09-18T00:00:00Z'), to: at('2026-09-19T00:00:00Z') });
  assert.deepEqual(days['2026-09-18'].BASE, { count: 100, turnover: 1000, profit: 20 });
});

test('a day with no samples is absent, not a fabricated zero', () => {
  const modeTrail = [sample('2026-09-18T12:00:00Z', { 'BASE:count': 10, 'BASE:turnover': 10, 'BASE:profit': 1 })];
  const days = rollupModeDays({ modeTrail, from: at('2026-09-17T00:00:00Z'), to: at('2026-09-19T00:00:00Z') });
  assert.equal(days['2026-09-17'], undefined);
});

test('every mode in the stream is rolled up, not only BASE', () => {
  const modeTrail = [
    sample('2026-09-18T00:05:00Z', { 'BASE:count': 10, 'BONUS:count': 2, 'BASE:turnover': 10, 'BONUS:turnover': 200, 'BASE:profit': 1, 'BONUS:profit': -5 }),
    sample('2026-09-18T23:55:00Z', { 'BASE:count': 40, 'BONUS:count': 5, 'BASE:turnover': 40, 'BONUS:turnover': 500, 'BASE:profit': 4, 'BONUS:profit': -2 }),
  ];
  const days = rollupModeDays({ modeTrail, from: at('2026-09-18T00:00:00Z'), to: at('2026-09-19T00:00:00Z') });
  assert.deepEqual(Object.keys(days['2026-09-18']).sort(), ['BASE', 'BONUS']);
  assert.equal(days['2026-09-18'].BONUS.profit, 3);
});

test('a non-mode field in the same stream is ignored', () => {
  const modeTrail = [
    sample('2026-09-18T00:05:00Z', { onlinePlayers: 4, 'BASE:count': 10, 'BASE:turnover': 10, 'BASE:profit': 1 }),
    sample('2026-09-18T23:55:00Z', { onlinePlayers: 9, 'BASE:count': 20, 'BASE:turnover': 20, 'BASE:profit': 2 }),
  ];
  const days = rollupModeDays({ modeTrail, from: at('2026-09-18T00:00:00Z'), to: at('2026-09-19T00:00:00Z') });
  assert.deepEqual(Object.keys(days['2026-09-18']), ['BASE']);
});

test('merging keeps recorded history and lets a newer reading replace a day', () => {
  const previous = { '2026-09-17': { BASE: { count: 5, turnover: 5, profit: 1 } } };
  const next = { '2026-09-18': { BASE: { count: 9, turnover: 9, profit: 2 } } };
  const merged = mergeModeDays(previous, next);
  assert.deepEqual(Object.keys(merged).sort(), ['2026-09-17', '2026-09-18']);
  assert.equal(merged['2026-09-17'].BASE.count, 5);
  // With overlapping dates, next wins (precedence test)
  const previous2 = { '2026-09-17': { BASE: { count: 5, turnover: 5, profit: 1 } } };
  const next2 = { '2026-09-17': { BASE: { count: 99, turnover: 99, profit: 99 } } };
  const merged2 = mergeModeDays(previous2, next2);
  assert.equal(merged2['2026-09-17'].BASE.count, 99, 'newer reading wins for overlapping day');
});

test('a delta spanning a gap is credited to the day the poller came back', () => {
  const modeTrail = [
    sample('2026-09-16T12:00:00Z', { 'BASE:count': 10, 'BASE:turnover': 100, 'BASE:profit': 1 }),
    // The poller was down for the 17th entirely.
    sample('2026-09-18T12:00:00Z', { 'BASE:count': 90, 'BASE:turnover': 900, 'BASE:profit': 9 }),
  ];
  const days = rollupModeDays({ modeTrail, from: at('2026-09-16T00:00:00Z'), to: at('2026-09-19T00:00:00Z') });
  assert.equal(days['2026-09-17'], undefined, 'the unmeasured day stays absent');
  assert.equal(days['2026-09-18'].BASE.count, 80, "the gap's volume lands on the day of the resumption sample");
});

test('a month rollover puts the whole post-reset total on the first', () => {
  const modeTrail = [
    sample('2026-09-30T23:55:00Z', { 'BASE:count': 5000, 'BASE:turnover': 50000, 'BASE:profit': 500 }),
    // The month-to-date counters reset at the boundary.
    sample('2026-10-01T00:05:00Z', { 'BASE:count': 12, 'BASE:turnover': 120, 'BASE:profit': 2 }),
    sample('2026-10-01T23:55:00Z', { 'BASE:count': 300, 'BASE:turnover': 3000, 'BASE:profit': 30 }),
  ];
  const days = rollupModeDays({ modeTrail, from: at('2026-09-30T00:00:00Z'), to: at('2026-10-02T00:00:00Z') });
  assert.equal(days['2026-10-01'].BASE.count, 300, 'the reset reads as the new total, not as a huge negative');
  assert.ok(days['2026-10-01'].BASE.count > 0, 'a rollover never produces a negative day');
});
