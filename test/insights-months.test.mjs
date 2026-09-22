import { test } from 'node:test';
import assert from 'node:assert/strict';
import { buildInsights } from '../src/insights/model.mjs';

const snapshot = { trackingStart: '2026-08-30', days: {
  '2026-08-30': { rows: [{ slug: 'berry', name: 'Berry', stats: { unique: 10, count: 100, turnover: 1_000_000, profit: 100_000, expectedProfit: 0 } }], fetchedAt: 1, through: Date.parse('2026-08-31T00:00:00Z') },
  '2026-08-31': { rows: [{ slug: 'berry', name: 'Berry', stats: { unique: 20, count: 200, turnover: 2_000_000, profit: 200_000, expectedProfit: 0 } }], fetchedAt: 1, through: Date.parse('2026-09-01T00:00:00Z') },
  '2026-09-01': { rows: [{ slug: 'berry', name: 'Berry', stats: { unique: 5, count: 50, turnover: 500_000, profit: 50_000, expectedProfit: 0 } }], fetchedAt: 1, through: Date.parse('2026-09-02T00:00:00Z') },
  // A September day well before the 18th, real figures - used by the
  // month-to-date test below to prove month-to-date reaches back past
  // whatever from/to window the page happens to be filtered to.
  '2026-09-10': { rows: [{ slug: 'berry', name: 'Berry', stats: { unique: 15, count: 150, turnover: 1_500_000, profit: 150_000, expectedProfit: 0 } }], fetchedAt: 1, through: Date.parse('2026-09-11T00:00:00Z') },
  '2026-09-18': { rows: [{ slug: 'berry', name: 'Berry', stats: { unique: 3, count: 30, turnover: 300_000, profit: 30_000, expectedProfit: 0 } }], fetchedAt: 1, through: Date.parse('2026-09-19T00:00:00Z') },
} };
const now = Date.parse('2026-09-02T06:00:00Z');
const query = new URLSearchParams({ from: '2026-08-30', to: '2026-09-02' });

test('months are grouped by calendar month, starting on the first', () => {
  const model = buildInsights({ snapshot, now, query });
  const keys = model.months.map(m => m.key);
  assert.deepEqual(keys, ['2026-08', '2026-09']);
  assert.equal(model.months[0].players, 30, 'august holds the 30th and 31st only');
  assert.equal(model.months[1].players, 5, 'september starts on the 1st');
});

test('a month label reads in English and the current month is marked incomplete', () => {
  const model = buildInsights({ snapshot, now, query });
  assert.equal(model.months[0].label, 'August 2026');
  assert.equal(model.months[0].complete, true);
  assert.equal(model.months[1].complete, false);
});

test('month to date covers the 1st at 00:00Z to now', () => {
  const model = buildInsights({ snapshot, now, query });
  assert.equal(model.monthToDate.key, '2026-09');
  assert.equal(model.monthToDate.players, 5);
});

test('month to date covers the whole month, not just the selected window', () => {
  const now = Date.parse('2026-09-19T06:00:00Z');
  const query = new URLSearchParams({ from: '2026-09-18', to: '2026-09-19' });
  const model = buildInsights({ snapshot, now, query });
  // The window starts on the 18th; month-to-date must still count the 1st,
  // the 10th and the 18th, since those are the measured September days
  // through today. `months`, by contrast, only reflects the selected window.
  assert.equal(model.monthToDate.key, '2026-09');
  assert.equal(model.monthToDate.players, 5 + 15 + 3, 'sums the 1st, 10th and 18th');
  assert.ok(model.monthToDate.players > model.months.at(-1).players,
    'month-to-date reaches back past the selected window');
});

test('a year boundary keeps month keys in order', () => {
  const yearEndSnapshot = { trackingStart: '2025-12-30', days: {
    '2025-12-30': { rows: [{ slug: 'berry', name: 'Berry', stats: { unique: 7, count: 70, turnover: 700_000, profit: 70_000, expectedProfit: 0 } }], fetchedAt: 1, through: Date.parse('2025-12-31T00:00:00Z') },
    '2025-12-31': { rows: [{ slug: 'berry', name: 'Berry', stats: { unique: 8, count: 80, turnover: 800_000, profit: 80_000, expectedProfit: 0 } }], fetchedAt: 1, through: Date.parse('2026-01-01T00:00:00Z') },
    '2026-01-01': { rows: [{ slug: 'berry', name: 'Berry', stats: { unique: 9, count: 90, turnover: 900_000, profit: 90_000, expectedProfit: 0 } }], fetchedAt: 1, through: Date.parse('2026-01-02T00:00:00Z') },
  } };
  const yearEndNow = Date.parse('2026-01-02T06:00:00Z');
  const yearEndQuery = new URLSearchParams({ from: '2025-12-30', to: '2026-01-01' });
  const model = buildInsights({ snapshot: yearEndSnapshot, now: yearEndNow, query: yearEndQuery });
  // String sort on zero-padded YYYY-MM keys must not misorder a year rollover.
  assert.deepEqual(model.months.map(m => m.key), ['2025-12', '2026-01']);
  assert.equal(model.months[0].players, 15, 'december holds the 30th and 31st');
  assert.equal(model.months[1].players, 9, 'january starts on the 1st');
});

test('a month with no measured days at all is absent, not present with zeros', () => {
  // October has no entries anywhere in the shared snapshot fixture: every
  // day in this window is unmeasured, so the month must not appear at all.
  // A present-with-zeros row would misreport a real month as a genuinely
  // zero-turnover one, which is a different (and false) claim.
  const octoberNow = Date.parse('2026-10-05T12:00:00Z');
  const octoberQuery = new URLSearchParams({ from: '2026-10-01', to: '2026-10-05' });
  const model = buildInsights({ snapshot, now: octoberNow, query: octoberQuery });
  assert.deepEqual(model.months, []);
});
