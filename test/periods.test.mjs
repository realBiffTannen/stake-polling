import { test } from 'node:test';
import assert from 'node:assert/strict';
import { monthKey, monthRange, monthLabel, monthsBetween, monthToDate,
  datesInMonth, monthOfDate } from '../src/insights/periods.mjs';

const at = (iso) => Date.parse(iso);

test('a month is keyed by its calendar year and month in UTC', () => {
  assert.equal(monthKey(at('2026-09-19T23:59:59Z')), '2026-09');
  assert.equal(monthKey(at('2026-09-01T00:00:00Z')), '2026-09');
});

test('a month range starts on the first at 00:00Z and is half-open', () => {
  const { from, to } = monthRange('2026-09');
  assert.equal(new Date(from).toISOString(), '2026-09-01T00:00:00.000Z');
  assert.equal(new Date(to).toISOString(), '2026-10-01T00:00:00.000Z');
});

test('december rolls into the next year', () => {
  const { to } = monthRange('2026-12');
  assert.equal(new Date(to).toISOString(), '2027-01-01T00:00:00.000Z');
});

test('month-to-date ends at now, not at the end of the month', () => {
  const now = at('2026-09-19T15:00:00Z');
  assert.deepEqual(monthToDate(now), { key: '2026-09', from: at('2026-09-01T00:00:00Z'), to: now });
});

test('months between is inclusive at both ends and ordered', () => {
  assert.deepEqual(monthsBetween('2026-07', '2026-10'), ['2026-07', '2026-08', '2026-09', '2026-10']);
  assert.deepEqual(monthsBetween('2026-09', '2026-09'), ['2026-09']);
  assert.deepEqual(monthsBetween('2026-10', '2026-09'), []);
});

test('the dates of a month stop at the through date', () => {
  assert.deepEqual(datesInMonth('2026-09', { through: '2026-09-03' }),
    ['2026-09-01', '2026-09-02', '2026-09-03']);
  assert.equal(datesInMonth('2026-08', { through: '2026-09-19' }).length, 31);
  assert.deepEqual(datesInMonth('2026-10', { through: '2026-09-19' }), []);
});

test('a date maps to its month, and the label reads in English', () => {
  assert.equal(monthOfDate('2026-09-19'), '2026-09');
  assert.equal(monthLabel('2026-09'), 'September 2026');
});

test('a null timestamp has no month, and is not the epoch', () => {
  assert.equal(monthKey(null), null);
  assert.equal(monthKey(undefined), null);
  assert.equal(monthKey(''), null);
  assert.equal(monthKey(NaN), null);
  assert.equal(monthToDate(null), null);
  assert.equal(monthToDate(NaN), null);
  // 0 is a real instant, not a missing one.
  assert.equal(monthKey(0), '1970-01');
});

test('a malformed month key yields null rather than a half-built range', () => {
  assert.equal(monthRange('2026-13'), null);
  assert.equal(monthRange('nonsense'), null);
  assert.equal(monthRange(null), null);
});
