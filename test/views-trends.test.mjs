import { test } from 'node:test';
import assert from 'node:assert/strict';
import { renderTrends } from '../src/web/views/trends.mjs';

const state = { meta: { team: 'acme-studios' }, stale: false, ageMs: 0, now: Date.parse('2026-09-19T12:00:00Z'),
  money: { unitsPerDollar: 1_000_000, profitShare: 0.1, expectedShare: 0.075 } };
const model = {
  daily: [
    { date: '2026-09-17', players: 100, newPlayers: 40, returningPlayers: 60, measured: true },
    { date: '2026-09-18', players: 120, newPlayers: 30, returningPlayers: 90, measured: true },
  ],
  games: [{ slug: 'pixel-geyser', name: 'Pixel Geyser', players: 100, returningPlayers: 60 }],
  options: [], from: '2026-09-17', to: '2026-09-18', totals: {},
};
const catalogue = { firstSeen: { 'pixel-geyser': '2026-09-17', berry: '2026-09-18' }, days: {} };
const math = { 'pixel-geyser': { edge: 0.033, baseVolatility: 11.19, volatilityClass: 'MEDIUM', costLadder: [1, 35], modes: {} } };

test('the headline metric is average returning players per released game', () => {
  const out = String(renderTrends({ model, state, catalogue, math }));
  assert.match(out, /Average returning players per released game/i);
});

test('both series are named on the dual-axis chart', () => {
  const out = String(renderTrends({ model, state, catalogue, math }));
  assert.match(out, /avg returning per game/i);
  assert.match(out, /games released/i);
});

test('reconstructed history is flagged rather than passed off as recorded', () => {
  const out = String(renderTrends({ model, state, catalogue, math }));
  assert.match(out, /reconstructed/i);
});

test('the rolling tallies are shown for new and returning players', () => {
  const out = String(renderTrends({ model, state, catalogue, math }));
  assert.match(out, /7-day/);
  assert.match(out, /28-day/);
});

// The correlation row's direction is stated in prose derived from `r` at
// render time (src/web/views/trends.mjs), never as a fixed sentence baked
// into the dimension (src/insights/verdicts.mjs) - a fixed sentence would
// assert a direction the actual number can contradict. These two fixtures
// are built as a perfect line (r = 1 or r = -1) so the sign is unambiguous,
// not a marginal case that could flip with rounding.
const positiveGames = [
  { slug: 'a', name: 'A', players: 100, returningPlayers: 30 },
  { slug: 'b', name: 'B', players: 100, returningPlayers: 50 },
  { slug: 'c', name: 'C', players: 100, returningPlayers: 70 },
  { slug: 'd', name: 'D', players: 100, returningPlayers: 90 },
];
const negativeGames = [
  { slug: 'a', name: 'A', players: 100, returningPlayers: 90 },
  { slug: 'b', name: 'B', players: 100, returningPlayers: 70 },
  { slug: 'c', name: 'C', players: 100, returningPlayers: 50 },
  { slug: 'd', name: 'D', players: 100, returningPlayers: 30 },
];
// Only baseVolatility is captured (no edge, no costLadder) so exactly one
// correlation row is produced - the other two dimensions have nothing to
// pick and are excluded, keeping each fixture's assertion unambiguous.
const volatilityOnlyMath = {
  a: { baseVolatility: 10, modes: {} }, b: { baseVolatility: 20, modes: {} },
  c: { baseVolatility: 30, modes: {} }, d: { baseVolatility: 40, modes: {} },
};

test('a clearly positive correlation reads as a positive association, never a negative one', () => {
  const out = String(renderTrends({ model: { ...model, games: positiveGames }, state, catalogue, math: volatilityOnlyMath }));
  assert.match(out, /positive association/i);
  assert.doesNotMatch(out, /negative association/i);
});

test('a clearly negative correlation reads as a negative association, never a positive one', () => {
  const out = String(renderTrends({ model: { ...model, games: negativeGames }, state, catalogue, math: volatilityOnlyMath }));
  assert.match(out, /negative association/i);
  assert.doesNotMatch(out, /positive association/i);
});

test('the trends page leads with the over-time charts, players online first, and keeps the retention metric below', () => {
  const out = String(renderTrends({ model, state: { ...state, history: {}, dailySnapshot: {} }, catalogue, math }));
  assert.ok(out.indexOf('Players online, every 2.5 minutes') > 0);
  assert.ok(out.indexOf('Players online, every 2.5 minutes') < out.indexOf('Average returning players per released game'));
  assert.match(out, /<h2>Bets per day<\/h2>/);
});
