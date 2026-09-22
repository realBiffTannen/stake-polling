import { test } from 'node:test';
import assert from 'node:assert/strict';
import { correlations } from '../src/insights/verdicts.mjs';

const model = {
  a: { edge: 0.033, baseVolatility: 11.19, volatilityClass: 'MEDIUM', costLadder: [1, 35], modes: {} },
  b: { edge: 0.035, baseVolatility: 25.81, volatilityClass: 'EXTREME', costLadder: [1, 100], modes: {} },
  c: { edge: 0.045, baseVolatility: 45.70, volatilityClass: 'EXTREME', costLadder: [1, 75], modes: {} },
  d: { edge: 0.035, baseVolatility: 9.58, volatilityClass: 'LOW', costLadder: [1, 200], modes: {} },
};
const games = [
  { slug: 'a', players: 100, returningPlayers: 60 },
  { slug: 'b', players: 100, returningPlayers: 40 },
  { slug: 'c', players: 100, returningPlayers: 30 },
  { slug: 'd', players: 100, returningPlayers: 70 },
];

test('returning rate is correlated against base volatility, with n stated', () => {
  const found = correlations({ games, model });
  const vol = found.find(c => c.label.includes('base volatility'));
  assert.equal(vol.n, 4);
  assert.ok(vol.r < 0, 'more volatile games retain fewer, in this fixture');
});

test('a game with no captured model is left out of the correlation, not defaulted', () => {
  const found = correlations({ games: [...games, { slug: 'unknown', players: 50, returningPlayers: 50 }], model });
  assert.equal(found.find(c => c.label.includes('base volatility')).n, 4);
});

test('fewer than three usable games yields no correlation at all', () => {
  assert.deepEqual(correlations({ games: games.slice(0, 2), model }), []);
});

test('a dimension missing from one game lowers that row n, not the others', () => {
  const partial = {
    ...model,
    e: { edge: 0.04, baseVolatility: 20, volatilityClass: 'HIGH', modes: {} }, // no costLadder
  };
  const withE = [...games, { slug: 'e', players: 100, returningPlayers: 50 }];
  const found = correlations({ games: withE, model: partial });
  const vol = found.find(c => c.label.includes('base volatility'));
  const cost = found.find(c => c.label.includes('bonus cost'));
  assert.equal(vol.n, 5, 'every game has a base volatility');
  assert.equal(cost.n, 4, 'the game with no cost ladder is excluded from that row only');
});

test('a correlation note describes the dimension and never asserts a direction', () => {
  const found = correlations({ games, model });
  for (const c of found) {
    assert.ok(c.note && c.note.length, `${c.label} has a note`);
    assert.doesNotMatch(c.note, /\b(more|fewer|higher.*lower|lower.*higher|increase|decrease)\b/i,
      `${c.label}: the note states a direction the sign of r may contradict: "${c.note}"`);
  }
});

test('a game with players but no measured returning count is excluded', () => {
  const found = correlations({
    games: [...games, { slug: 'e', players: 100, returningPlayers: null }],
    model: {
      ...model,
      e: { edge: 0.04, baseVolatility: 20, volatilityClass: 'HIGH', modes: {} },
    },
  });
  assert.equal(found.find(c => c.label.includes('base volatility')).n, 4,
    'an unmeasured returning count is not a returning rate of zero');
});
