import { test } from 'node:test';
import assert from 'node:assert/strict';
import { dailyTable, dailyReadFrom } from '../src/daily.mjs';

const at = (iso) => Date.parse(iso);
const NOW = at('2026-09-17T08:05:00Z');

/** Cumulative profit samples, `[iso, value]` pairs, oldest first. */
const trailOf = (...points) => points.map(([iso, profit]) => ({ ts: at(iso), fields: { profit } }));

// Two full accounting days and the one in progress, sampled either side of
// every 12:00 UTC boundary.
const BERRY = trailOf(
  ['2026-09-14T11:55:00Z', 1000],
  ['2026-09-14T12:00:01Z', 1010],   // +10  -> 09-14 day
  ['2026-09-15T11:55:00Z', 1500],   // +490 -> 09-14 day
  ['2026-09-15T12:00:01Z', 1490],   // -10  -> 09-15 day
  ['2026-09-16T11:55:00Z', 1200],   // -290 -> 09-15 day
  ['2026-09-16T12:00:01Z', 1250],   // +50  -> 09-16 day (in progress)
  ['2026-09-17T08:00:00Z', 1400],   // +150 -> 09-16 day (in progress)
);

test('each row is one accounting day, 12:00 UTC to 12:00 UTC, newest first', () => {
  const table = dailyTable({ trails: { berry: BERRY }, games: ['berry'], now: NOW });
  assert.deepEqual(table.rows.map((r) => [r.from, r.to]), [
    [at('2026-09-16T12:00:00Z'), at('2026-09-17T12:00:00Z')],
    [at('2026-09-15T12:00:00Z'), at('2026-09-16T12:00:00Z')],
    [at('2026-09-14T12:00:00Z'), at('2026-09-15T12:00:00Z')],
  ]);
  assert.deepEqual(table.rows.map((r) => r.byGame.berry), [200, -300, 500]);
});

test('only the day still being filled is marked current', () => {
  const table = dailyTable({ trails: { berry: BERRY }, games: ['berry'], now: NOW });
  assert.deepEqual(table.rows.map((r) => r.current), [true, false, false]);
});

test('the total is the sum of the games that were measured that day', () => {
  const lantern = trailOf(
    ['2026-09-15T11:55:00Z', 0],
    ['2026-09-15T18:00:00Z', -40],    // -40 -> 09-15 day
    ['2026-09-16T12:00:01Z', -15],    // +25 -> 09-16 day
  );
  const table = dailyTable({ trails: { berry: BERRY, lantern }, games: ['berry', 'lantern'], now: NOW });
  assert.deepEqual(table.games, ['berry', 'lantern']);
  assert.deepEqual(table.rows.map((r) => r.total), [225, -340, 500]);
  assert.equal(table.rows[2].byGame.lantern, null, 'a game with no reading that day is unmeasured, not $0.00');
});

test('a day nothing was measured in keeps its row, with a null total rather than zero', () => {
  // The poller was down for the whole of the 09-15 day... and the reading
  // that finally arrives lands in the 09-16 day, which is where it is counted.
  const trail = trailOf(
    ['2026-09-14T11:55:00Z', 100],
    ['2026-09-14T13:00:00Z', 150],
    ['2026-09-16T13:00:00Z', 400],
  );
  const table = dailyTable({ trails: { berry: trail }, games: ['berry'], now: NOW });
  assert.deepEqual(table.rows.map((r) => r.total), [250, null, 50]);
});

test('days older than the trail reaches are dropped, and the day it starts inside is partial', () => {
  const trail = trailOf(
    ['2026-09-15T20:00:00Z', 100],    // the poller's first ever sample, 8h into the day
    ['2026-09-15T20:05:00Z', 130],
    ['2026-09-16T12:00:01Z', 100],
    ['2026-09-17T08:00:00Z', 90],
  );
  const table = dailyTable({ trails: { berry: trail }, games: ['berry'], now: NOW, days: 30 });
  assert.deepEqual(table.rows.map((r) => [r.total, r.partial]), [
    [-40, false],
    [30, true],
  ]);
});

test('a day the trail straddles from before the boundary is whole, not partial', () => {
  const table = dailyTable({ trails: { berry: BERRY }, games: ['berry'], now: NOW });
  assert.deepEqual(table.rows.map((r) => r.partial), [false, false, false]);
});

test('`days` caps how far back the table reaches', () => {
  const table = dailyTable({ trails: { berry: BERRY }, games: ['berry'], now: NOW, days: 2 });
  assert.deepEqual(table.rows.map((r) => r.from), [at('2026-09-16T12:00:00Z'), at('2026-09-15T12:00:00Z')]);
});

test('the boundary hour is configurable - 0 is a midnight day', () => {
  const table = dailyTable({ trails: { berry: BERRY }, games: ['berry'], now: NOW, boundaryHourUtc: 0 });
  assert.equal(table.rows[0].from, at('2026-09-17T00:00:00Z'));
  assert.equal(table.rows[0].to, at('2026-09-18T00:00:00Z'));
});

test('no trail at all is an empty table, not a throw', () => {
  assert.deepEqual(dailyTable({ trails: {}, games: ['berry'], now: NOW }).rows, []);
  assert.deepEqual(dailyTable({ trails: undefined, games: [], now: NOW }).rows, []);
});

test('the read reaches one day further back than the oldest row, for the reading its first delta needs', () => {
  assert.equal(dailyReadFrom(NOW, { days: 3 }), at('2026-09-13T12:00:00Z'));
  assert.equal(dailyReadFrom(NOW, { days: 1, boundaryHourUtc: 0 }), at('2026-09-16T00:00:00Z'));
});
