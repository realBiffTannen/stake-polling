import { test } from 'node:test';
import assert from 'node:assert/strict';
import { median, mad, robustZ, deltas } from '../src/detect/baseline.mjs';

test('median handles even and odd lengths', () => {
  assert.equal(median([3, 1, 2]), 2);
  assert.equal(median([4, 1, 2, 3]), 2.5);
});

test('median of an empty series is 0', () => {
  assert.equal(median([]), 0);
});

test('mad is unaffected by a single huge outlier', () => {
  const calm = [10, 10, 11, 9, 10, 10];
  assert.equal(mad(calm), mad([...calm, 100000]));
});

test('robustZ returns 0 rather than Infinity on a flat series', () => {
  assert.equal(robustZ(50, [10, 10, 10, 10]), 0);
});

test('robustZ scales with deviation', () => {
  const s = [10, 12, 8, 11, 9, 10, 10, 12];
  const small = Math.abs(robustZ(13, s));
  const large = Math.abs(robustZ(80, s));
  assert.ok(large > small);
  assert.ok(Number.isFinite(large));
});

test('deltas differences consecutive samples', () => {
  assert.deepEqual(deltas([100, 300, 900]), [200, 600]);
});

test('deltas treats a cumulative reset as a fresh count, not a negative', () => {
  // month boundary: the API total drops from 900 back to 12
  assert.deepEqual(deltas([100, 300, 900, 12, 40]), [200, 600, 12, 28]);
});

test('deltas of a series shorter than two is empty', () => {
  assert.deepEqual(deltas([5]), []);
  assert.deepEqual(deltas([]), []);
});

test('non-numeric samples are treated as zero rather than producing NaN', () => {
  assert.deepEqual(deltas([10, undefined, 30]), [0, 30]);
});

test('a small backward correction is not mistaken for a counter reset', () => {
  // Observed live: a $154,869.58 counter edged down by 92 cents, and the
  // reset rule turned it into a $154,868.66 delta.
  const series = [154869581036, 154868656683, 154868700000];
  const [correction, recovery] = deltas(series);

  assert.equal(correction, 154868656683 - 154869581036, 'a correction is a small negative step');
  assert.ok(Math.abs(correction) < 1e7, `expected a tiny step, got ${correction}`);
  assert.equal(recovery, 154868700000 - 154868656683);
});

test('a genuine reset to near zero is still treated as a reset', () => {
  assert.deepEqual(deltas([70000000000, 990000000]), [990000000]);
  assert.deepEqual(deltas([900, 12]), [12]);
});

test('only a collapse towards zero counts as a reset', () => {
  // A large but ordinary fall is still ordinary movement.
  assert.equal(deltas([1000, 400])[0], -600);
  // Shedding almost everything is a rollover.
  assert.equal(deltas([1000, 20])[0], 20);
});

test('a signed profit series running further into the red is not a reset', () => {
  // Observed live: this read every step deeper into loss as a rollover, and
  // reported a whole month of losses as one minute's.
  const series = [-12363000000, -12367000000, -12371000000];
  assert.deepEqual(deltas(series), [-4000000, -4000000]);
});

test('profit collapsing towards zero at a month boundary is still a reset', () => {
  assert.deepEqual(deltas([-22431353806, -30000000]), [-30000000]);
});
