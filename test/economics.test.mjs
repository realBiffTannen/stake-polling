import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  holdTable, holdHeadline, modeHold, buyEconomics, playerWorth, quietShare, stayEstimate, unusualDays, betLadder,
} from '../src/insights/economics.mjs';

const money = { unitsPerDollar: 1_000_000, profitShare: 0.1, expectedShare: 0.075 };
const near = (a, b, eps = 1e-9) => assert.ok(Math.abs(a - b) < eps, `${a} != ${b}`);
const MIN = 60_000;

// ------------------------------------------------------------------ hold
const xmas = [
  { mode: 'BASE', cost: 1, count: 1000, turnover: 1_000_000_000, profit: 50_000_000, rtp: 0.967 },
  { mode: 'BUY', cost: 250, count: 10, turnover: 1_000_000_000, profit: -200_000_000, rtp: 0.967 },
];

test('holdTable: realised = profit / turnover, theoretical = 1 - turnover-weighted deployed RTP', () => {
  const [row] = holdTable({ xmas }, { xmas: 'Pixel Carnivals' });
  assert.equal(row.key, 'xmas');
  assert.equal(row.label, 'Pixel Carnivals');
  near(row.realised, -0.075);
  near(row.theoretical, 0.033);
  near(row.deltaPp, -10.8);
  assert.equal(row.turnover, 2_000_000_000);
});

test('holdTable: a game with no play is left out, and a mode without an RTP leaves theory to the rest', () => {
  const rows = holdTable({
    idle: [{ mode: 'BASE', count: null, turnover: null, profit: null, rtp: 0.96 }],
    part: [{ mode: 'BASE', turnover: 100, profit: 4, rtp: 0.96 }, { mode: 'X', turnover: 100, profit: 0, rtp: null }],
  }, {});
  assert.deepEqual(rows.map((r) => r.key), ['part']);
  near(rows[0].theoretical, 0.04, 1e-12);
  near(rows[0].realised, 0.02);
});

test('holdTable: no RTP anywhere means no theory and no delta, not a zero', () => {
  const [row] = holdTable({ a: [{ mode: 'BASE', turnover: 100, profit: 5, rtp: null }] }, {});
  assert.equal(row.theoretical, null);
  assert.equal(row.deltaPp, null);
  near(row.realised, 0.05);
});

test('holdTable: a measured zero profit is a realised hold of exactly 0', () => {
  const [row] = holdTable({ a: [{ mode: 'BASE', turnover: 100, profit: 0, rtp: 0.97 }] }, {});
  assert.equal(row.realised, 0);
});

test('holdHeadline names the studio-wide hold and the game furthest from theory', () => {
  const rows = holdTable({ xmas, berry: [{ mode: 'BASE', turnover: 2_000_000_000, profit: 110_000_000, rtp: 0.965 }] },
    { xmas: 'Pixel Carnivals', berry: 'Berry' });
  const h = holdHeadline(rows);
  assert.match(h, /kept -1\.0% of turnover against a theoretical 3\.4%/);
  assert.match(h, /Furthest from theory: Pixel Carnivals \(-10\.8pp\)/);
  assert.equal(holdHeadline([]), null);
});

test('modeHold: contributions add up to the game\'s own delta, and the headline names the biggest', () => {
  const rows97 = xmas.map((r) => ({ ...r, rtp: 0.97 }));
  const { rows, headline } = modeHold(rows97);
  const [game] = holdTable({ g: rows97 }, {});
  near(rows.reduce((a, r) => a + r.contributionPp, 0), game.deltaPp);
  const buy = rows.find((r) => r.mode === 'BUY');
  near(buy.realised, -0.2);
  near(buy.theoretical, 0.03);
  near(buy.contributionPp, -11.5);
  near(rows.find((r) => r.mode === 'BASE').contributionPp, 1);
  assert.match(headline, /BUY accounts for -11\.5pp of the -10\.5pp gap/);
});

test('modeHold: an unplayed mode is not a row, and a missing RTP gives a null contribution', () => {
  const { rows } = modeHold([{ mode: 'A', turnover: 0, profit: 0, rtp: 0.97 }, { mode: 'B', turnover: 10, profit: 1, rtp: null }]);
  assert.deepEqual(rows.map((r) => [r.mode, r.contributionPp]), [['B', null]]);
  assert.equal(modeHold([]).headline, null);
});

// -------------------------------------------------------- buy economics
test('buyEconomics: conversion, buy share, average buy and average base bet', () => {
  const e = buyEconomics([
    { mode: 'BASE', cost: 1, count: 900, turnover: 450_000_000 },
    { mode: 'ANTE', cost: 3, count: 90, turnover: 135_000_000 },
    { mode: 'BONUS', cost: 200, count: 10, turnover: 1_000_000_000 },
  ], money);
  assert.equal(e.rounds, 1000);
  assert.equal(e.buyRounds, 10);
  near(e.conversion, 0.01);
  near(e.buyTurnoverShare, 1000 / 1585);
  near(e.avgBuyUsd, 100);
  // base bet = turnover / (count x cost) over non-buy modes: 585 / (900 + 270)
  near(e.avgBaseBetUsd, 585 / 1170);
  assert.deepEqual(e.tiers.map((t) => [t.mode, t.cost, t.priceUsd]), [['BASE', 1, 0.5], ['ANTE', 3, 1.5], ['BONUS', 200, 100]]);
  assert.match(e.headline, /Feature buys are 1\.0% of rounds and 63\.1% of turnover/);
  assert.match(e.headline, /average buy costs \$100\.00 against an average base bet of \$0\.50/);
});

test('buyEconomics: no buy modes is a measured zero conversion with no average buy', () => {
  const e = buyEconomics([{ mode: 'BASE', cost: 1, count: 10, turnover: 5_000_000 }], money);
  assert.equal(e.conversion, 0);
  assert.equal(e.avgBuyUsd, null);
  assert.match(e.headline, /No feature buys/);
});

test('buyEconomics: nothing measured has no figures and no headline', () => {
  const e = buyEconomics([{ mode: 'BASE', cost: 1, count: null, turnover: null }], money);
  assert.equal(e.rounds, null);
  assert.equal(e.conversion, null);
  assert.equal(e.headline, null);
  assert.equal(buyEconomics(undefined, money).headline, null);
});

// ---------------------------------------------------------- player worth
test('playerWorth divides the month by its players, in USD at the studio share', () => {
  const w = playerWorth({ count: 1000, turnover: 500_000_000, profit: 20_000_000, unique: 50 }, money);
  near(w.turnoverPerPlayer, 10);
  near(w.roundsPerPlayer, 20);
  near(w.studioPerPlayer, 0.04);
  near(w.studioPer1kRounds, 2);
  near(w.avgBet, 0.5);
  assert.match(w.headline, /staked \$10\.00 over 20 rounds/);
  assert.match(w.headline, /\+\$0\.04 per player/);
});

test('playerWorth with no player count has no per-player figures, but keeps what it can', () => {
  const w = playerWorth({ count: 1000, turnover: 500_000_000, profit: 20_000_000, unique: null }, money);
  assert.equal(w.turnoverPerPlayer, null);
  assert.equal(w.headline, null);
  near(w.avgBet, 0.5);
  const zero = playerWorth({ count: 0, turnover: 0, profit: 0, unique: 0 }, money);
  assert.equal(zero.turnoverPerPlayer, null, 'no players: nothing to divide by');
  assert.equal(zero.avgBet, null, 'no rounds: no average');
});

// ------------------------------------------------------------ quiet share
const sample = (ts, fields) => ({ ts, fields });
const t0 = Date.parse('2026-09-22T10:00:00Z');

test('quietShare: turnover that arrived while few players were online', () => {
  const q = quietShare([
    sample(t0, { count: 0, turnover: 0, onlinePlayers: 5 }),
    sample(t0 + MIN, { count: 10, turnover: 100, onlinePlayers: 1 }),
    sample(t0 + 2 * MIN, { count: 20, turnover: 400, onlinePlayers: 6 }),
    sample(t0 + 3 * MIN, { count: 25, turnover: 500, onlinePlayers: 2 }),
  ]);
  assert.equal(q.turnover, 500);
  assert.equal(q.quietTurnover, 200);
  near(q.share, 0.4);
  assert.match(q.headline, /40% of turnover arrived while 2 or fewer players were online/);
});

test('quietShare: a backwards counter (replica lag) and a month boundary are skipped, not read as resets', () => {
  const q = quietShare([
    sample(t0, { count: 100, turnover: 1000, onlinePlayers: 1 }),
    sample(t0 + MIN, { count: 98, turnover: 990, onlinePlayers: 1 }),
    sample(t0 + 2 * MIN, { count: 110, turnover: 1100, onlinePlayers: 9 }),
  ]);
  assert.equal(q.turnover, 100, 'the lagged 990 is dropped; 1100 is differenced against the 1000 high-water mark');
  assert.equal(q.quietTurnover, 0);
  const month = quietShare([
    sample(Date.parse('2026-09-30T23:59:00Z'), { count: 900, turnover: 9000, onlinePlayers: 1 }),
    sample(Date.parse('2026-10-01T00:01:00Z'), { count: 5, turnover: 50, onlinePlayers: 1 }),
  ]);
  assert.equal(month.share, null, 'nothing comparable was measured');
});

test('quietShare: a sample missing onlinePlayers is not quiet', () => {
  const q = quietShare([sample(t0, { count: 0, turnover: 0 }), sample(t0 + MIN, { count: 1, turnover: 10 })]);
  assert.equal(q.turnover, 10);
  assert.equal(q.quietTurnover, 0);
  assert.equal(q.share, 0);
  assert.equal(quietShare([]).share, null);
});

// ---------------------------------------------------------- stay estimate
test('stayEstimate: Little\'s law - mean online over new-player arrivals per minute', () => {
  // 60 minutes, unique 100 -> 130 (0.5/min), mean online 10 -> 20 minutes
  const trail = [0, 15, 30, 45, 60].map((m, i) => sample(t0 + m * MIN, { unique: [100, 104, 99, 120, 130][i], onlinePlayers: 10 }));
  const s = stayEstimate(trail);
  near(s.minutes, 20);
  assert.match(s.headline, /about 20 minutes/);
});

test('stayEstimate: no new players, too short a span or a month boundary give no estimate', () => {
  const flat = [0, 30, 60].map((m) => sample(t0 + m * MIN, { unique: 100, onlinePlayers: 5 }));
  assert.equal(stayEstimate(flat).minutes, null);
  assert.equal(stayEstimate([sample(t0, { unique: 1, onlinePlayers: 1 })]).minutes, null);
  const crossing = [
    sample(Date.parse('2026-09-30T23:00:00Z'), { unique: 500, onlinePlayers: 5 }),
    sample(Date.parse('2026-10-01T00:30:00Z'), { unique: 3, onlinePlayers: 5 }),
    sample(Date.parse('2026-10-01T01:30:00Z'), { unique: 33, onlinePlayers: 5 }),
  ];
  // only the October segment: 3 -> 33 over 60 min = 0.5/min, online 5 -> 10 minutes
  near(stayEstimate(crossing).minutes, 10);
});

// ----------------------------------------------------------- unusual days
function snap(days) {
  const out = { days: {} };
  for (const [date, rows] of Object.entries(days)) out.days[date] = { rows, fetchedAt: 0 };
  return out;
}
const day = (slug, turnoverUsd, count, unique) => ({ slug, name: slug.toUpperCase(), stats: { count, turnover: turnoverUsd * 1e6, profit: 0, unique } });

test('unusualDays: 3x the median of the prior active days, past the launch days, above the floors', () => {
  const days = {};
  const dates = Array.from({ length: 12 }, (_, i) => `2026-09-${String(i + 1).padStart(2, '0')}`);
  dates.forEach((d, i) => { days[d] = [day('berry', i === 10 ? 1500 : 400, 1000, 50)]; });
  const found = unusualDays(snap(days), { now: Date.parse('2026-09-12T12:00:00Z'), money });
  assert.equal(found.rows.length, 1);
  const [u] = found.rows;
  assert.equal(u.date, '2026-09-11');
  assert.equal(u.kind, 'stakes');
  near(u.ratio, 3.75);
  near(u.turnover, 1500);
  near(u.median, 400);
  assert.match(found.headline, /BERRY on 2026-09-11 \(3\.8x its usual turnover\)/);
});

test('unusualDays: today, the first three active days, thin history and small days are never flagged', () => {
  const days = {
    '2026-09-01': [day('a', 100, 100, 5)], '2026-09-02': [day('a', 100, 100, 5)], '2026-09-03': [day('a', 5000, 100, 5)],
    '2026-09-04': [day('a', 100, 100, 5)], '2026-09-05': [day('a', 100, 100, 5)], '2026-09-06': [day('a', 100, 100, 5)],
    '2026-09-07': [day('a', 100, 100, 5)], '2026-09-08': [day('a', 390, 100, 5)], '2026-09-09': [day('a', 5000, 100, 5)],
  };
  const found = unusualDays(snap(days), { now: Date.parse('2026-09-09T12:00:00Z'), money });
  // 09-03 is a launch day; 09-08 is 3.9x but under the $400 floor; 09-09 is today
  assert.deepEqual(found.rows, []);
  assert.match(found.headline, /No game had an unusual day/);
  assert.equal(unusualDays({ days: {} }, { now: 0, money }).headline, null);
});

test('unusualDays: a player surge counts too, and both at once is "both"', () => {
  const days = {};
  for (let i = 1; i <= 10; i++) days[`2026-09-${String(i).padStart(2, '0')}`] = [day('g', 500, 1000, i === 10 ? 90 : 20)];
  days['2026-09-09'] = [day('g', 2000, 1000, 80)];
  const found = unusualDays(snap(days), { now: Date.parse('2026-09-11T00:00:00Z'), money });
  const kinds = Object.fromEntries(found.rows.map((r) => [r.date, r.kind]));
  assert.equal(kinds['2026-09-09'], 'both');
  assert.equal(kinds['2026-09-10'], 'players');
});

// ------------------------------------------------------------- bet ladder
test('betLadder sorts by size, gives shares, and says it is lifetime and bucketed by base bet', () => {
  const l = betLadder([{ costUSD: 0.5, betCount: 100, betTurnover: 50 }, { costUSD: 0, betCount: 50, betTurnover: 0 },
    { costUSD: 0.1, betCount: 850, betTurnover: 85 }]);
  assert.deepEqual(l.rows.map((r) => r.costUSD), [0, 0.1, 0.5]);
  near(l.rows[1].betShare, 0.85);
  near(l.rows[2].turnoverShare, 50 / 135);
  assert.equal(l.stuck, false, '850 of 950 non-zero bets is 89.5%');
  assert.match(l.headline, /lifetime/i);
  assert.match(l.headline, /base bet/i);
});

test('betLadder calls the ladder stuck at 90%+ of paid bets on the cheapest size, and will not judge under 500', () => {
  assert.equal(betLadder([{ costUSD: 0.1, betCount: 950, betTurnover: 95 }, { costUSD: 1, betCount: 50, betTurnover: 50 }]).stuck, true);
  assert.equal(betLadder([{ costUSD: 0.1, betCount: 400, betTurnover: 40 }]).stuck, null);
  const empty = betLadder(null);
  assert.deepEqual(empty.rows, []);
  assert.equal(empty.headline, null);
});

// ------------------------------------------------------ studio aggregation
import { quietByGame } from '../src/insights/economics.mjs';

test('quietByGame ranks games by quiet share and states the studio-wide share from summed turnover', () => {
  const T = Date.parse('2026-09-22T10:00:00Z'), M = 60000;
  const s = (i, turnover, online) => ({ ts: T + i * 150000, fields: { count: i, turnover, profit: 0, onlinePlayers: online } });
  const quiet = [s(0, 0, 1), s(1, 100, 1), s(2, 200, 1)];           // all 200 quiet
  const busy = [s(0, 0, 9), s(1, 300, 9), s(2, 600, 1)];            // 300 of 600 quiet
  const { bars, headline } = quietByGame({ a: quiet, b: busy, c: [] }, { a: 'A', b: 'B', c: 'C' });
  assert.deepEqual(bars.map(b => [b.key, Math.round(b.value)]), [['a', 100], ['b', 50]]);
  assert.match(headline, /63% of studio turnover/, '(200 + 300) / 800');
  assert.match(headline, /A is the quietest \(100%\)/);
  assert.equal(quietByGame({}, {}).headline, null);
});
