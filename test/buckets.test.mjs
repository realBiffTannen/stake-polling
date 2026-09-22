import { test } from 'node:test';
import assert from 'node:assert/strict';
import { bucketStart, bucketSeries, profitTable, nextBucket, BUCKET_SIZES } from '../src/buckets.mjs';

const at = (iso) => Date.parse(iso);
const MIN = 60000;
const M5 = BUCKET_SIZES['5m'];
const H1 = BUCKET_SIZES['1h'];

/** Cumulative samples: `values` keyed by minute offset from `base`. */
const trailOf = (base, field, byMinute) =>
  Object.entries(byMinute).map(([m, v]) => ({ ts: base + Number(m) * MIN, fields: { [field]: v } }));

test('buckets are aligned to the wall clock, not to the first sample', () => {
  assert.equal(bucketStart(at('2026-09-16T14:42:37.123Z'), M5), at('2026-09-16T14:40:00Z'));
  assert.equal(bucketStart(at('2026-09-16T14:42:37.123Z'), H1), at('2026-09-16T14:00:00Z'));
  assert.equal(bucketStart(at('2026-09-16T14:00:00Z'), H1), at('2026-09-16T14:00:00Z'));
});

test('fifteen- and thirty-minute buckets are also aligned to the wall clock', () => {
  const M15 = BUCKET_SIZES['15m'], M30 = BUCKET_SIZES['30m'];
  assert.equal(M15, 15 * 60000);
  assert.equal(M30, 30 * 60000);
  assert.equal(bucketStart(at('2026-09-16T14:47:00Z'), M15), at('2026-09-16T14:45:00Z'));
  assert.equal(bucketStart(at('2026-09-16T14:47:00Z'), M30), at('2026-09-16T14:30:00Z'));
});

test('a delta belongs to the bucket of the interval it covers', () => {
  const base = at('2026-09-16T14:00:00Z');
  // Turnover climbing 100/min, sampled every 5 minutes at :00 :05 :10.
  const samples = trailOf(base, 'turnover', { 0: 1000, 5: 1500, 10: 2000 });
  const rows = bucketSeries(samples, 'turnover', { sizeMs: M5, from: base, to: base + 10 * MIN });

  // Newest first. Samples are stamped on the grid, and the step arriving at
  // 14:05:00.000 is the change over 14:00-14:05, so it fills the 14:00 bucket.
  // The 14:10 bucket is still open - its step arrives with the 14:15 sample.
  assert.deepEqual(rows.map((r) => r.from), [base + 10 * MIN, base + 5 * MIN, base]);
  assert.deepEqual(rows.map((r) => r.value), [null, 500, 500]);
});

test('a bucket the trail never covered is null, never zero', () => {
  const base = at('2026-09-16T14:00:00Z');
  // Nothing sampled between 14:05 and 14:20 - the poller was down.
  const samples = trailOf(base, 'profit', { 0: 100, 5: 200, 20: 500 });
  const rows = bucketSeries(samples, 'profit', { sizeMs: M5, from: base, to: base + 20 * MIN });

  const byFrom = new Map(rows.map((r) => [r.from, r.value]));
  assert.equal(byFrom.get(base + 5 * MIN), null, '$0.00 would claim a measured quiet period');
  assert.equal(byFrom.get(base + 10 * MIN), null);
  // The step spanning the gap arrives at 14:20 and is booked in the bucket it
  // closed, 14:15-14:20.
  assert.equal(byFrom.get(base + 15 * MIN), 300);
});

test('every bucket in the span is emitted, so a gap is visible rather than skipped', () => {
  const base = at('2026-09-16T14:00:00Z');
  const samples = trailOf(base, 'profit', { 0: 100, 20: 500 });
  const rows = bucketSeries(samples, 'profit', { sizeMs: M5, from: base, to: base + 20 * MIN });
  assert.equal(rows.length, 5, '14:00 14:05 14:10 14:15 14:20');
});

test('a counter reset inside a bucket contributes that period real volume', () => {
  const base = at('2026-09-16T14:00:00Z');
  // Month rollover between 14:05 and 14:10: 41,000,000 -> 900.
  const samples = trailOf(base, 'turnover', { 0: 40_000_000, 5: 41_000_000, 10: 900 });
  const rows = bucketSeries(samples, 'turnover', { sizeMs: M5, from: base, to: base + 10 * MIN });
  const byFrom = new Map(rows.map((r) => [r.from, r.value]));
  assert.equal(byFrom.get(base + 5 * MIN), 900, 'not -40,999,100');
});

test('a small downward correction is movement, not a reset', () => {
  const base = at('2026-09-16T14:00:00Z');
  const samples = trailOf(base, 'turnover', { 0: 154_869_581_036, 5: 154_868_656_683 });
  const rows = bucketSeries(samples, 'turnover', { sizeMs: M5, from: base, to: base });
  assert.equal(rows[0].value, 154_868_656_683 - 154_869_581_036);
});

test('several samples inside one bucket are summed into it', () => {
  const base = at('2026-09-16T14:00:00Z');
  // A one-minute poll: the five deltas arriving 14:01-14:05 cover 14:00-14:05,
  // and the one arriving at 14:06 opens the 14:05 bucket.
  const samples = trailOf(base, 'profit', { 0: 0, 1: 10, 2: 20, 3: 30, 4: 40, 5: 50, 6: 60 });
  const rows = bucketSeries(samples, 'profit', { sizeMs: M5, from: base, to: base + 5 * MIN });
  const byFrom = new Map(rows.map((r) => [r.from, r.value]));
  assert.equal(byFrom.get(base), 50);
  assert.equal(byFrom.get(base + 5 * MIN), 10);
});

test('hour buckets aggregate the same deltas the five-minute buckets do', () => {
  const base = at('2026-09-16T14:00:00Z');
  // The 15:05 sample's step covers 15:00-15:05, so it opens the 15:00 hour.
  const samples = trailOf(base, 'profit', { 0: 0, 5: 10, 10: 20, 65: 100 });
  const hours = bucketSeries(samples, 'profit', { sizeMs: H1, from: base, to: base + 60 * MIN });
  const byFrom = new Map(hours.map((r) => [r.from, r.value]));
  assert.equal(byFrom.get(base), 20, 'both five-minute deltas fall in the 14:00 hour');
  assert.equal(byFrom.get(base + 60 * MIN), 80);
});

test('a trail with fewer than two samples yields no measured bucket', () => {
  const base = at('2026-09-16T14:00:00Z');
  const rows = bucketSeries(trailOf(base, 'profit', { 0: 100 }), 'profit', { sizeMs: M5, from: base, to: base });
  assert.deepEqual(rows.map((r) => r.value), [null]);
  assert.deepEqual(bucketSeries([], 'profit', { sizeMs: M5, from: base, to: base }).map((r) => r.value), [null]);
});

test('deltas before the window still inform the first in-window delta', () => {
  const base = at('2026-09-16T14:00:00Z');
  const samples = trailOf(base, 'profit', { 0: 100, 5: 160, 10: 200, 15: 260 });
  // Window starts at 14:05. The step arriving AT 14:05 covers 14:00-14:05 and
  // stays out, but its reading is the baseline the first in-window delta
  // (arriving at 14:10) is measured from.
  const rows = bucketSeries(samples, 'profit', { sizeMs: M5, from: base + 5 * MIN, to: base + 10 * MIN });
  assert.deepEqual(rows.map((r) => r.value), [60, 40]);
});

// --- profitTable ---------------------------------------------------------

const modeTrail = (base, byMinute) =>
  Object.entries(byMinute).map(([m, fields]) => ({ ts: base + Number(m) * MIN, fields }));

test('profitTable puts the whole game beside each of its modes', () => {
  const base = at('2026-09-16T14:00:00Z');
  const trail = trailOf(base, 'profit', { 0: 0, 5: 100, 10: 250 });
  const modes = modeTrail(base, {
    0: { 'BASE:profit': 0, 'FREE_SPINS:profit': 0 },
    5: { 'BASE:profit': 70, 'FREE_SPINS:profit': 30 },
    10: { 'BASE:profit': 170, 'FREE_SPINS:profit': 80 },
  });

  const table = profitTable({ trail, modeTrail: modes, sizeMs: M5, from: base, to: base + 10 * MIN });
  assert.deepEqual(table.modes, ['BASE', 'FREE_SPINS']);
  // Newest first: 14:10 is still open, 14:05 took the step arriving at 14:10,
  // 14:00 the one arriving at 14:05.
  assert.deepEqual(table.rows.map((r) => r.total), [null, 150, 100]);
  assert.deepEqual(table.rows.map((r) => r.byMode.BASE), [null, 100, 70]);
  assert.deepEqual(table.rows.map((r) => r.byMode.FREE_SPINS), [null, 50, 30]);
});

test('BASE sorts first and the remaining modes alphabetically, so columns never shuffle', () => {
  const base = at('2026-09-16T14:00:00Z');
  const modes = modeTrail(base, {
    0: { 'FREE_SPINS:profit': 0, 'BASE:profit': 0, 'BONUS_BOOST:profit': 0 },
    5: { 'FREE_SPINS:profit': 1, 'BASE:profit': 1, 'BONUS_BOOST:profit': 1 },
  });
  const table = profitTable({ trail: [], modeTrail: modes, sizeMs: M5, from: base, to: base + 5 * MIN });
  assert.deepEqual(table.modes, ['BASE', 'BONUS_BOOST', 'FREE_SPINS']);
});

test('the total is the game trail, not the sum of the modes, so a disagreement shows', () => {
  const base = at('2026-09-16T14:00:00Z');
  const trail = trailOf(base, 'profit', { 0: 0, 5: 100 });
  const modes = modeTrail(base, { 0: { 'BASE:profit': 0 }, 5: { 'BASE:profit': 70 } });
  const table = profitTable({ trail, modeTrail: modes, sizeMs: M5, from: base, to: base });
  assert.equal(table.rows[0].total, 100);
  assert.equal(table.rows[0].byMode.BASE, 70);
  assert.equal(table.rows[0].modeTotal, 70);
});

test('with no mode trail yet the totals still read and every mode cell is absent', () => {
  const base = at('2026-09-16T14:00:00Z');
  const trail = trailOf(base, 'profit', { 0: 0, 5: 100 });
  const table = profitTable({ trail, modeTrail: [], sizeMs: M5, from: base, to: base });
  assert.deepEqual(table.modes, []);
  assert.equal(table.rows[0].total, 100);
  assert.equal(table.rows[0].modeTotal, null);
});

test('a mode that appears part-way through the trail gets a column and leading blanks', () => {
  const base = at('2026-09-16T14:00:00Z');
  const modes = [
    { ts: base, fields: { 'BASE:profit': 0 } },
    { ts: base + 5 * MIN, fields: { 'BASE:profit': 50 } },
    { ts: base + 10 * MIN, fields: { 'BASE:profit': 90, 'FREE_SPINS:profit': 0 } },
    { ts: base + 15 * MIN, fields: { 'BASE:profit': 120, 'FREE_SPINS:profit': 25 } },
  ];
  const table = profitTable({ trail: [], modeTrail: modes, sizeMs: M5, from: base, to: base + 15 * MIN });
  assert.deepEqual(table.modes, ['BASE', 'FREE_SPINS']);
  // FREE_SPINS' first step arrives at 14:15 and covers 14:10-14:15.
  assert.equal(table.rows.find((r) => r.from === base + 10 * MIN).byMode.FREE_SPINS, 25);
  // Before the mode existed there is nothing to report - not a zero result.
  assert.equal(table.rows.at(-1).byMode.FREE_SPINS, null);
});

test('one key steps five minutes, an hour, then off again', () => {
  assert.equal(nextBucket(null), '5m');
  assert.equal(nextBucket('5m'), '1h');
  assert.equal(nextBucket('1h'), null);
  assert.equal(nextBucket(undefined), '5m');
  assert.equal(nextBucket('nonsense'), '5m', 'an unknown value must not strand the view');
});

test('every granularity the cycle offers has a size', () => {
  for (let b = nextBucket(null); b; b = nextBucket(b)) {
    assert.ok(BUCKET_SIZES[b], `${b} is offered by the key but has no bucket size`);
  }
});

test('buckets older than the trail are dropped, but a gap inside it is not', () => {
  const base = at('2026-09-16T14:00:00Z');
  // The trail only starts at 14:20, and has a hole at 14:30.
  const trail = trailOf(base, 'profit', { 20: 100, 25: 200, 35: 400 });
  const table = profitTable({
    trail, modeTrail: [], sizeMs: M5, from: base, to: base + 35 * MIN, trimUnreached: true,
  });

  const labels = table.rows.map((r) => r.from);
  // 14:20 is the trail's first reading, a level rather than a change; the
  // first step arrives at 14:25 and covers 14:20-14:25, so that is the oldest
  // bucket worth a row. The next step arrives at 14:35 and closes 14:30,
  // leaving 14:25 as the hole.
  assert.equal(labels.at(-1), base + 20 * MIN, 'nothing before the trail measured anything is worth a row');
  assert.ok(labels.includes(base + 25 * MIN), 'a hole the trail surrounds must stay visible');
  assert.equal(table.rows.find((r) => r.from === base + 25 * MIN).value ?? null, null);
});

test('trimming an entirely empty table leaves nothing rather than throwing', () => {
  const base = at('2026-09-16T14:00:00Z');
  const table = profitTable({ trail: [], modeTrail: [], sizeMs: M5, from: base, to: base + 20 * MIN, trimUnreached: true });
  assert.deepEqual(table.rows, []);
});

test('without trimming every bucket in the span is still emitted', () => {
  const base = at('2026-09-16T14:00:00Z');
  const trail = trailOf(base, 'profit', { 20: 100, 25: 200 });
  const table = profitTable({ trail, modeTrail: [], sizeMs: M5, from: base, to: base + 25 * MIN });
  assert.equal(table.rows.length, 6);
});

test('the in-progress bucket is dropped until something lands in it', () => {
  const base = at('2026-09-16T14:00:00Z');
  const trail = trailOf(base, 'profit', { 0: 100, 5: 200 });
  // `to` sits in the 14:10 bucket. Neither 14:05 nor 14:10 has closed - their
  // steps arrive with the 14:10 and 14:15 samples, not yet written.
  const table = profitTable({
    trail, modeTrail: [], sizeMs: M5, from: base, to: base + 12 * MIN, trimUnreached: true,
  });
  assert.deepEqual(table.rows.map((r) => r.from), [base]);
});

test('an offset moves the bucket boundary off the epoch - a day that rolls at 12:00 UTC', () => {
  const DAY = 24 * 60 * MIN;
  const NOON = 12 * 60 * MIN;
  assert.equal(bucketStart(at('2026-09-17T08:05:00Z'), DAY, NOON), at('2026-09-16T12:00:00Z'), 'before noon belongs to yesterday noon');
  assert.equal(bucketStart(at('2026-09-17T12:00:00Z'), DAY, NOON), at('2026-09-17T12:00:00Z'), 'the boundary itself opens the new day');
  assert.equal(bucketStart(at('2026-09-17T11:59:59.999Z'), DAY, NOON), at('2026-09-16T12:00:00Z'));
  assert.equal(bucketStart(at('2026-09-17T08:05:00Z'), DAY), at('2026-09-17T00:00:00Z'), 'no offset is still the epoch-aligned bucket');
});

test('bucketSeries with an offset sums each 12:00-to-12:00 day separately', () => {
  const DAY = 24 * 60 * MIN;
  const NOON = 12 * 60 * MIN;
  const samples = [
    { ts: at('2026-09-15T11:55:00Z'), fields: { profit: 1000 } },
    { ts: at('2026-09-15T18:00:00Z'), fields: { profit: 1300 } },  // +300 -> day of 09-15 12:00
    { ts: at('2026-09-16T11:55:00Z'), fields: { profit: 1200 } },  // -100 -> day of 09-15 12:00
    { ts: at('2026-09-16T12:00:01Z'), fields: { profit: 1250 } },  // +50  -> day of 09-16 12:00
    { ts: at('2026-09-17T08:00:00Z'), fields: { profit: 900 } },   // -350 -> day of 09-16 12:00
  ];
  const rows = bucketSeries(samples, 'profit', {
    sizeMs: DAY, offsetMs: NOON, from: at('2026-09-15T12:00:00Z'), to: at('2026-09-17T08:05:00Z'),
  });
  assert.deepEqual(rows.map((r) => [r.from, r.to, r.value]), [
    [at('2026-09-16T12:00:00Z'), at('2026-09-17T12:00:00Z'), -300],
    [at('2026-09-15T12:00:00Z'), at('2026-09-16T12:00:00Z'), 200],
  ]);
});
