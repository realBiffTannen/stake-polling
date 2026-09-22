import { test } from 'node:test';
import assert from 'node:assert/strict';
import { dayStart, minutesSince, sumSince, coverage } from '../src/window.mjs';

const at = (iso) => Date.parse(iso);
const MIN = 60000;

test('the day rolls at 12:00 UTC, not midnight', () => {
  assert.equal(dayStart(at('2026-09-16T14:30:00Z'), 12), at('2026-09-16T12:00:00Z'));
  assert.equal(dayStart(at('2026-09-16T12:00:00Z'), 12), at('2026-09-16T12:00:00Z'));
});

test('before 12:00 UTC the day started yesterday', () => {
  assert.equal(dayStart(at('2026-09-16T02:35:00Z'), 12), at('2026-09-15T12:00:00Z'));
  assert.equal(dayStart(at('2026-09-16T11:59:59Z'), 12), at('2026-09-15T12:00:00Z'));
});

test('the boundary hour is configurable', () => {
  assert.equal(dayStart(at('2026-09-16T02:35:00Z'), 0), at('2026-09-16T00:00:00Z'));
});

test('minutesSince measures the window the trail has to cover', () => {
  assert.equal(minutesSince(at('2026-09-16T12:30:00Z'), 12), 30);
  assert.equal(minutesSince(at('2026-09-16T11:00:00Z'), 12), 23 * 60);
});

test('sumSince adds only the deltas that land inside the window', () => {
  const from = 10 * MIN;
  // Cumulative turnover climbing by 100/min from minute 8 to minute 13.
  const samples = [8, 9, 10, 11, 12, 13].map((m) => ({ ts: m * MIN, fields: { turnover: 100 * m } }));
  // Deltas arriving at minutes 11, 12 and 13 are inside the window: 3 x 100.
  // The one arriving AT minute 10 covers 9-10, before the window opened.
  assert.equal(sumSince(samples, 'turnover', from), 300);
});

test('sumSince survives a counter reset inside the window', () => {
  const from = 0;
  const samples = [
    { ts: 0, fields: { turnover: 900 } },
    { ts: MIN, fields: { turnover: 1000 } },
    { ts: 2 * MIN, fields: { turnover: 40 } },   // month rollover
    { ts: 3 * MIN, fields: { turnover: 140 } },
  ];
  // 100 + 40 + 100, never a negative step.
  assert.equal(sumSince(samples, 'turnover', from), 240);
});

test('sumSince returns null rather than a confident zero when the window is empty', () => {
  const samples = [{ ts: 0, fields: { turnover: 100 } }, { ts: MIN, fields: { turnover: 200 } }];
  assert.equal(sumSince(samples, 'turnover', 99 * MIN), null);
  assert.equal(sumSince([], 'turnover', 0), null);
  assert.equal(sumSince([{ ts: 0, fields: { turnover: 1 } }], 'turnover', 0), null);
});

test('coverage reports a freshly started poller as partial', () => {
  const now = at('2026-09-16T14:00:00Z');
  const from = at('2026-09-16T12:00:00Z');          // a two-hour window
  const samples = [10, 9, 8].map((m) => ({ ts: now - m * MIN, fields: {} }));
  const c = coverage(samples, from, now);
  assert.ok(c.partial, 'ten minutes of trail is not two hours of day');
  assert.ok(c.ratio < 0.1);
  assert.equal(c.fromTs, now - 10 * MIN);
});

test('coverage reports a full window as complete', () => {
  const now = at('2026-09-16T14:00:00Z');
  const from = at('2026-09-16T12:00:00Z');
  const samples = Array.from({ length: 121 }, (_, i) => ({ ts: from + i * MIN, fields: {} }));
  assert.equal(coverage(samples, from, now).partial, false);
});
