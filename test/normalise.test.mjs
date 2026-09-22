import { test } from 'node:test';
import assert from 'node:assert/strict';
import { normalise, gameIds, liveGameIds } from '../src/poll/poller.mjs';
import { roster, games, balance } from './fixtures/live.mjs';

test('games are keyed by slug, because the API paths are keyed by slug', () => {
  const out = normalise({ roster, games, balance });
  assert.deepEqual(Object.keys(out.games).sort(), ['neon-city-heist', 'pixel-carnivals', 'pixel-nest']);
  assert.ok(!('Pixel Nest' in out.games), 'the display name must never be used as an id');
});

test('gameIds returns slugs, not display names', () => {
  assert.deepEqual(gameIds(roster), ['neon-city-heist', 'pixel-carnivals', 'pixel-nest']);
});

test('per-game metrics are read from the nested stats object', () => {
  const out = normalise({ roster, games, balance });
  assert.deepEqual(out.games['pixel-carnivals'], {
    count: 14822,
    turnover: 41446150864,
    profit: -22431353806,
    unique: 538,
    expectedProfit: 1367722978,
    onlinePlayers: 1,
  });
});

test('a game absent from the catalogue keeps its roster metrics and omits what is unknown', () => {
  const out = normalise({ roster, games, balance });
  assert.equal(out.games['neon-city-heist'].turnover, 70222880714);
  // Writing 0 here would be a fabricated reading, and a fabricated collapse to
  // zero is exactly what the drop rule is built to alert on.
  assert.equal(out.games['neon-city-heist'].onlinePlayers, undefined);
});

test('onlinePlayers is summed across the catalogue, not read from the top level', () => {
  const out = normalise({ roster, games, balance });
  assert.equal(out.online.onlinePlayers, 5, '4 on berry + 1 on pixel-carnivals');
});

test('day and month totals are summed across the catalogue', () => {
  const out = normalise({ roster, games, balance });
  assert.equal(out.online.dayTurnover, 65962890 + 2000000);
  assert.equal(out.online.dayProfit, -31992062 + -50000);
  assert.equal(out.online.monthTurnover, 154846643418 + 41446150864);
});

test('the team sample carries the balance endpoint and the roster totals', () => {
  const out = normalise({ roster, games, balance });
  assert.equal(out.team.position, -4474893261);
  assert.equal(out.team.carry, -2184064350);
  assert.equal(out.team.turnover, 70222880714 + 41446150864 + 1200000);
  assert.equal(out.team.count, 44243 + 14822 + 900);
});

test('a missing balance payload does not remove the roster totals', () => {
  const out = normalise({ roster, games, balance: null });
  assert.equal(out.team.turnover, 70222880714 + 41446150864 + 1200000);
  assert.equal(out.team.position, undefined);
});

test('an empty roster produces no game samples rather than a junk entry', () => {
  const out = normalise({ roster: null, games, balance });
  assert.deepEqual(out.games, {});
});

// --- discovering games that go live mid-run ------------------------------

test('liveGameIds returns only the catalogue entries actually live', () => {
  assert.deepEqual(liveGameIds(games), ['berry', 'pixel-carnivals']);
  // `published` is not `isLive`: every unreleased title in the live catalogue
  // carries published:true, so trusting it would poll 15 games that 404.
  assert.ok(games.some((g) => g.published && !g.isLive), 'fixture must cover the published-but-dark case');
});

test('liveGameIds tolerates an empty or malformed catalogue', () => {
  assert.deepEqual(liveGameIds(null), []);
  assert.deepEqual(liveGameIds([]), []);
  assert.deepEqual(liveGameIds({ games: [{ slug: 'x', isLive: true }] }), ['x']);
  assert.deepEqual(liveGameIds([{ isLive: true }]), [], 'no slug means nothing to request');
});

test('a live game the roster has not listed yet is still discovered', () => {
  // The launch case: /games flips isLive before /stats grows a row for it.
  const catalogue = [...games, { name: 'Hippo Hustle', slug: 'hippo-hustle', published: true, isLive: true, stats: null, onlinePlayers: 3 }];
  assert.ok(liveGameIds(catalogue).includes('hippo-hustle'));
  assert.ok(!gameIds(roster).includes('hippo-hustle'), 'precisely the gap this closes');
});
