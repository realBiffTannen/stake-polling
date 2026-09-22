import { test } from 'node:test';
import assert from 'node:assert/strict';
import { buildRollups } from '../src/insights/rollup.mjs';

const at = (iso) => Date.parse(iso);
const trails = { modes: { berry: [
  { ts: at('2026-09-18T00:05:00Z'), fields: { 'BASE:count': 10, 'BASE:turnover': 100, 'BASE:profit': 5 } },
  { ts: at('2026-09-18T23:55:00Z'), fields: { 'BASE:count': 50, 'BASE:turnover': 500, 'BASE:profit': 9 } },
] } };
const listing = [{ slug: 'berry', isLive: true }, { slug: 'aliens', isLive: false }];
const snapshot = { days: { '2026-09-16': { rows: [{ slug: 'berry', stats: { count: 3 } }] } } };

test('the rollup covers whole days and keeps what was already recorded', () => {
  const previous = { modes: { version: 1, games: { berry: { '2026-09-17': { BASE: { count: 1 } } } } }, catalogue: {} };
  const out = buildRollups({ previous, trails, listing, snapshot, now: at('2026-09-19T06:00:00Z') });
  assert.equal(out.modes.games.berry['2026-09-17'].BASE.count, 1, 'earlier day survives');
  assert.equal(out.modes.games.berry['2026-09-18'].BASE.count, 40);
});

test('the catalogue records today and seeds first-seen from the daily snapshot', () => {
  const out = buildRollups({ previous: { modes: {}, catalogue: {} }, trails, listing, snapshot, now: at('2026-09-19T06:00:00Z') });
  assert.deepEqual(out.catalogue.days['2026-09-19'], { live: ['berry'], released: 1 });
  assert.equal(out.catalogue.firstSeen.berry, '2026-09-16', 'first activity wins over today');
});

test('today is still filling and is never written as a whole day', () => {
  const now = at('2026-09-19T06:00:00Z');
  const trails = { modes: { berry: [
    // A closing reading for the 17th, so the 18th has a baseline to diff
    // against - without it, no delta can land in the 18th's bucket at all,
    // whole day or not, since the very first sample in a trail is only ever
    // a baseline and never produces a value for its own day.
    { ts: at('2026-09-17T23:55:00Z'), fields: { 'BASE:count': 60, 'BASE:turnover': 600, 'BASE:profit': 6 } },
    { ts: at('2026-09-18T23:55:00Z'), fields: { 'BASE:count': 100, 'BASE:turnover': 1000, 'BASE:profit': 10 } },
    // Today, mid-morning: real samples, but the day is not over.
    { ts: at('2026-09-19T05:55:00Z'), fields: { 'BASE:count': 140, 'BASE:turnover': 1400, 'BASE:profit': 14 } },
  ] } };
  const out = buildRollups({ previous: { modes: {}, catalogue: {} }, trails, listing: [{ slug: 'berry', isLive: true }], snapshot: {}, now });
  assert.equal(out.modes.games.berry['2026-09-19'], undefined,
    "today's partial total must not be persisted as a day");
  assert.equal(out.modes.games.berry['2026-09-18'].BASE.count, 40, 'yesterday is complete and is written');
});
