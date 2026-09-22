import { test } from 'node:test';
import assert from 'node:assert/strict';
import { firstSeenFromSnapshot, recordCatalogue, releasedSeries } from '../src/insights/catalogue.mjs';

const snapshot = {
  days: {
    '2026-09-16': { rows: [{ slug: 'berry', stats: { count: 10 } }, { slug: 'pixel-fort', stats: { count: 0 } }] },
    '2026-09-17': { rows: [{ slug: 'berry', stats: { count: 4 } }, { slug: 'pixel-fort', stats: { count: 7 } }] },
  },
};

test('a game is first seen on the first date it took a bet', () => {
  assert.deepEqual(firstSeenFromSnapshot(snapshot), { berry: '2026-09-16', 'pixel-fort': '2026-09-17' });
});

test('recording a day keeps the live list and the earliest first-seen date', () => {
  const first = recordCatalogue({ previous: {}, listing: [{ slug: 'berry', isLive: true }, { slug: 'aliens', isLive: false }], date: '2026-09-18' });
  assert.deepEqual(first.days['2026-09-18'], { live: ['berry'], released: 1 });
  assert.equal(first.firstSeen.berry, '2026-09-18');
  const second = recordCatalogue({ previous: first, listing: [{ slug: 'berry', isLive: true }, { slug: 'aliens', isLive: true }], date: '2026-09-19' });
  assert.equal(second.firstSeen.berry, '2026-09-18', 'an earlier first-seen date is never overwritten');
  assert.equal(second.days['2026-09-19'].released, 2);
});

test('a released series marks reconstructed days apart from recorded ones', () => {
  const catalogue = { firstSeen: { berry: '2026-09-16', 'pixel-fort': '2026-09-17' }, days: { '2026-09-18': { live: ['berry', 'pixel-fort'], released: 2 } } };
  const series = releasedSeries({ catalogue, dates: ['2026-09-16', '2026-09-17', '2026-09-18'] });
  assert.deepEqual(series, [
    { date: '2026-09-16', released: 1, reconstructed: true },
    { date: '2026-09-17', released: 2, reconstructed: true },
    { date: '2026-09-18', released: 2, reconstructed: false },
  ]);
});

test('an unmeasured bet count is not evidence that a game was played', () => {
  const snapshot = { days: {
    '2026-09-16': { rows: [
      { slug: 'nulled', stats: { count: null } },
      { slug: 'no-stats' },
      { slug: 'zero', stats: { count: 0 } },
      { slug: 'played', stats: { count: 1 } },
    ] },
  } };
  // Number(null) is 0 and finite, and a missing stats object is not a quiet day.
  assert.deepEqual(firstSeenFromSnapshot(snapshot), { played: '2026-09-16' });
});

test('a later recording never pushes a first-seen date forward', () => {
  const later = recordCatalogue({ previous: {}, listing: [{ slug: 'berry', isLive: true }], date: '2026-09-19' });
  const earlier = recordCatalogue({ previous: later, listing: [{ slug: 'berry', isLive: true }], date: '2026-09-18' });
  assert.equal(earlier.firstSeen.berry, '2026-09-18', 'better evidence moves a release earlier, never later');
  assert.equal(earlier.days['2026-09-19'].released, 1, 'the earlier write does not drop the later day');
});

test('a day before any game existed is reconstructed as zero, not omitted', () => {
  const series = releasedSeries({ catalogue: { firstSeen: { berry: '2026-09-16' }, days: {} }, dates: ['2026-09-14'] });
  assert.deepEqual(series, [{ date: '2026-09-14', released: 0, reconstructed: true }]);
});

test('a recorded day with nothing live is recorded as zero, not treated as unrecorded', () => {
  const catalogue = { firstSeen: { berry: '2026-09-16' }, days: { '2026-09-17': { live: [], released: 0 } } };
  const series = releasedSeries({ catalogue, dates: ['2026-09-17'] });
  // A recorded zero is evidence. Falling through to reconstruction here would
  // invent a released game on a day the catalogue says had none.
  assert.deepEqual(series, [{ date: '2026-09-17', released: 0, reconstructed: false }]);
});
