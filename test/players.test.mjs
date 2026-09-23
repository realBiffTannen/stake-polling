import { test } from 'node:test';
import assert from 'node:assert/strict';
import { playersByGame, playerCorrelation, contribution, strength, playersHeadline, correlationHeadline, contributionHeadline } from '../src/insights/players.mjs';

const money = { unitsPerDollar: 1_000_000, profitShare: 0.1, expectedShare: 0.075 };
const P = 150_000; // 2.5 minutes
const t0 = Date.parse('2026-09-22T00:00:00Z');
/** A trail where turnover per interval is `perPlayer` dollars x players online. */
function trail(online, perPlayer, { unique0 = 100, betsPer = 2 } = {}) {
  let turnover = 1e9, count = 1000, unique = unique0;
  return online.map((n, i) => {
    if (i > 0) { turnover += n * perPlayer * 1e6; count += n * betsPer; unique += 1; }
    return { ts: t0 + i * P, fields: { onlinePlayers: n, turnover, count, profit: 0, unique } };
  });
}

test('players by game: average and peak online, first-time-this-month players, and the span\'s money', () => {
  const [berry] = playersByGame({ berry: trail([4, 6, 8, 10], 5) }, { from: t0, now: t0 + 3 * P, labels: { berry: 'Berry' }, money });
  assert.equal(berry.label, 'Berry');
  assert.equal(berry.avgOnline, 8, 'the three samples inside the span: 6, 8, 10');
  assert.equal(berry.peakOnline, 10);
  assert.equal(berry.newPlayers, 3);
  assert.equal(berry.turnoverUsd, (6 + 8 + 10) * 5);
  assert.equal(berry.bets, (6 + 8 + 10) * 2);
});

test('a game with no readings in the span is unmeasured, not zero', () => {
  const [g] = playersByGame({ quiet: [] }, { from: t0, now: t0 + P, money });
  assert.deepEqual([g.avgOnline, g.peakOnline, g.newPlayers, g.turnoverUsd, g.bets], [null, null, null, null, null]);
});

test('a span across the 1st does not report a month\'s restart as new players', () => {
  const eom = Date.parse('2026-09-30T23:57:30Z');
  const t = [{ ts: eom, fields: { onlinePlayers: 5, turnover: 9e9, count: 9e4, profit: 0, unique: 5000 } },
    { ts: eom + P, fields: { onlinePlayers: 5, turnover: 1e6, count: 10, profit: 0, unique: 12 } }];
  const [g] = playersByGame({ g: t }, { from: eom - 1, now: eom + P, money });
  assert.equal(g.newPlayers, null);
});

test('turnover that scales with players online correlates strongly, with the slope it scales by', () => {
  const online = [3, 9, 4, 12, 7, 15, 5, 11];
  const c = playerCorrelation({ a: trail(online, 5), b: trail(online.map((n) => n * 2), 5) }, { from: t0, now: t0 + 7 * P, money });
  assert.equal(c.points.length, 7, 'one point per interval, both games summed into it');
  assert.equal(c.points[0].online, 9 + 18);
  assert.ok(c.turnover.r > 0.999);
  assert.ok(Math.abs(c.slope - 5) < 1e-9, '$5 per player online per interval');
  assert.equal(strength(c.turnover.r), 'strong');
  assert.match(correlationHeadline(c), /^Strong positive link between players online and turnover: r = 1\.00 over 7 intervals\. Each extra player online goes with about \$5\.00 more turnover per poll\. Bets follow at r = 1\.00\./);
});

test('an interval spanning an outage is left out, not blamed on one head count', () => {
  const t = trail([5, 6, 7], 5);
  t.push({ ts: t0 + 2 * P + 60 * 60_000, fields: { onlinePlayers: 1, turnover: t.at(-1).fields.turnover + 999e6, count: t.at(-1).fields.count + 9999, profit: 0, unique: 200 } });
  const c = playerCorrelation({ g: t }, { from: t0, now: t0 + 3 * P + 60 * 60_000, money });
  assert.equal(c.points.length, 2, 'the hour-long step is gone');
});

test('with no variation to speak of, the headline says so rather than inventing a figure', () => {
  const c = playerCorrelation({ g: trail([5, 5, 5, 5], 5) }, { from: t0, now: t0 + 3 * P, money });
  assert.equal(c.turnover, null);
  assert.match(correlationHeadline(c), /Too little variation in 3 intervals/);
  assert.equal(correlationHeadline({ points: [] }), null);
});

test('contribution sets each game\'s share of turnover and bets against its share of players', () => {
  const rows = contribution([
    { label: 'Whale Bay', avgOnline: 10, turnoverUsd: 900, bets: 100 },
    { label: 'Crowd Park', avgOnline: 90, turnoverUsd: 100, bets: 900 },
    { label: 'Unmeasured', avgOnline: null, turnoverUsd: 50, bets: 5 },
  ]);
  assert.deepEqual(rows.map((r) => r.label), ['Whale Bay', 'Crowd Park'], 'unmeasured games are left out of every share');
  assert.equal(rows[0].playerShare, 0.1);
  assert.equal(rows[0].turnoverShare, 0.9);
  assert.equal(rows[0].index, 9);
  assert.equal(contributionHeadline(rows), 'Whale Bay carries 90% of turnover with 10% of the players online - 9.0x its share.');
  assert.match(playersHeadline(rows.map((r) => ({ ...r, newPlayers: 3 })), { words: 'in the last 3h' }), /^About 100 players online on average in the last 3h, most on Crowd Park \(90\)\. 6 players played for the first time this month\.$/);
});
