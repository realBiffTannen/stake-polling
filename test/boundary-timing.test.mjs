/**
 * The poller samples on a fixed grid (2.5 minutes, so 00:00:00Z is always a
 * tick) and each sample now carries its grid boundary as its timestamp. The
 * change a sample reports is the change over the interval that ENDED at that
 * boundary - so the step arriving at exactly 00:00:00.000 is the last 2.5
 * minutes of yesterday, not the first of today.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { sumSince } from '../src/window.mjs';
import { bucketSeries, BUCKET_SIZES } from '../src/buckets.mjs';

const at = (iso) => Date.parse(iso);
const H1 = BUCKET_SIZES['1h'];
const s = (iso, fields) => ({ ts: at(iso), fields });

// --- sumSince --------------------------------------------------------------

test('sumSince leaves the step arriving exactly at the start in the previous window', () => {
  const samples = [
    s('2026-09-21T23:57:30Z', { turnover: 100 }),
    s('2026-09-22T00:00:00Z', { turnover: 150 }), // covers 23:57:30-00:00 - yesterday
    s('2026-09-22T00:02:30Z', { turnover: 170 }),
  ];
  assert.equal(sumSince(samples, 'turnover', at('2026-09-22T00:00:00Z')), 20);
});

test('sumSince still counts an off-grid arrival after the start', () => {
  const samples = [s('2026-09-21T23:57:30Z', { turnover: 100 }), s('2026-09-22T00:00:01.800Z', { turnover: 150 })];
  assert.equal(sumSince(samples, 'turnover', at('2026-09-22T00:00:00Z')), 50);
});

test('sumSince drops a sample missing the field instead of reading it as a zero', () => {
  // As a 0 reading, 1000 -> 0 -> 1100 is a "reset" followed by +1100.
  const samples = [s('2026-09-22T00:00:00Z', { turnover: 1000 }), s('2026-09-22T00:02:30Z', {}), s('2026-09-22T00:05:00Z', { turnover: 1100 })];
  assert.equal(sumSince(samples, 'turnover', at('2026-09-22T00:00:00Z')), 100);
});

test('sumSince drops a null or empty-string reading the same way', () => {
  const samples = [s('2026-09-22T00:00:00Z', { turnover: 1000 }), s('2026-09-22T00:02:30Z', { turnover: null }),
    s('2026-09-22T00:05:00Z', { turnover: '' }), s('2026-09-22T00:07:30Z', { turnover: 1100 })];
  assert.equal(sumSince(samples, 'turnover', at('2026-09-22T00:00:00Z')), 100);
});

test('sumSince keeps a genuine zero reading, and a measured flat window sums to 0, not null', () => {
  const rising = [s('2026-09-22T00:00:00Z', { turnover: 0 }), s('2026-09-22T00:02:30Z', { turnover: 0 }), s('2026-09-22T00:05:00Z', { turnover: 50 })];
  assert.equal(sumSince(rising, 'turnover', at('2026-09-22T00:00:00Z')), 50);
  const flat = [s('2026-09-22T00:00:00Z', { turnover: 10 }), s('2026-09-22T00:02:30Z', { turnover: 10 })];
  assert.equal(sumSince(flat, 'turnover', at('2026-09-22T00:00:00Z')), 0);
});

test('sumSince over samples that never carried the field is null, not a confident zero', () => {
  const samples = [s('2026-09-22T00:00:00Z', {}), s('2026-09-22T00:02:30Z', {})];
  assert.equal(sumSince(samples, 'turnover', at('2026-09-22T00:00:00Z')), null);
});

// --- bucketSeries ----------------------------------------------------------

test('a step arriving exactly on the hour belongs to the hour that just ended', () => {
  const samples = [
    s('2026-09-22T00:57:30Z', { profit: 100 }),
    s('2026-09-22T01:00:00Z', { profit: 160 }), // covers 00:57:30-01:00
    s('2026-09-22T01:02:30Z', { profit: 170 }),
  ];
  const rows = bucketSeries(samples, 'profit', { sizeMs: H1, from: at('2026-09-22T00:00:00Z'), to: at('2026-09-22T01:00:00Z') });
  const byFrom = new Map(rows.map((r) => [r.from, r.value]));
  assert.equal(byFrom.get(at('2026-09-22T00:00:00Z')), 60);
  assert.equal(byFrom.get(at('2026-09-22T01:00:00Z')), 10);
});

test('an off-grid arrival still lands in the bucket it arrived in', () => {
  const samples = [s('2026-09-22T00:57:30Z', { profit: 100 }), s('2026-09-22T01:00:01.800Z', { profit: 160 })];
  const rows = bucketSeries(samples, 'profit', { sizeMs: H1, from: at('2026-09-22T00:00:00Z'), to: at('2026-09-22T01:00:00Z') });
  const byFrom = new Map(rows.map((r) => [r.from, r.value]));
  assert.equal(byFrom.get(at('2026-09-22T00:00:00Z')), null);
  assert.equal(byFrom.get(at('2026-09-22T01:00:00Z')), 60);
});

test('the window check uses the same attributed bucket, so the boundary step stays out of a window starting there', () => {
  const samples = [s('2026-09-22T00:57:30Z', { profit: 100 }), s('2026-09-22T01:00:00Z', { profit: 160 }), s('2026-09-22T01:02:30Z', { profit: 170 })];
  const rows = bucketSeries(samples, 'profit', { sizeMs: H1, from: at('2026-09-22T01:00:00Z'), to: at('2026-09-22T01:00:00Z') });
  assert.deepEqual(rows.map((r) => r.value), [10]);
});
