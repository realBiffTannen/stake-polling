import { test } from 'node:test';
import assert from 'node:assert/strict';
import { turnoverTree, turnoverFlow, isFeatureBuy, summedSeries, hourlySeries, buyShare, BUY_COST } from '../src/insights/conclusions.mjs';
import { buyEconomics } from '../src/insights/economics.mjs';
import { hourByDay, liveStream, dailyTrend } from '../src/insights/series.mjs';

const money = { unitsPerDollar: 1_000_000, profitShare: 0.1, expectedShare: 0.075 };
const M = 60_000, H = 3_600_000, SLOT = 150_000;
const usd = (dollars) => dollars * 1_000_000;
const clean = (s) => assert.doesNotMatch(String(s), /NaN|undefined|Infinity/, s);

// ------------------------------------------------------------ feature buys

test('a feature buy is a mode costing more than BUY_COST base bets, and a cost nobody read is not one', () => {
  assert.equal(isFeatureBuy({ cost: BUY_COST }), false, 'at the threshold is still base play');
  assert.equal(isFeatureBuy({ cost: BUY_COST + 0.01 }), true);
  assert.equal(isFeatureBuy({ cost: '200' }), true);
  assert.equal(isFeatureBuy({ cost: 1.25 }), false, 'an ANTE is base play');
  for (const cost of [null, undefined, '', 'n/a']) assert.equal(isFeatureBuy({ cost }), false, String(cost));
  assert.equal(isFeatureBuy(null), false);
});

test('buyShare and buyEconomics split buys from base play by the same definition', () => {
  const rows = [{ mode: 'BASE', cost: 1, count: 90, turnover: usd(90) }, { mode: 'ANTE', cost: 5, count: 10, turnover: usd(50) },
    { mode: 'BONUS', cost: 100, count: 1, turnover: usd(100) }];
  assert.equal(Math.round(buyShare({ berry: rows }).bars[0].value), Math.round(buyEconomics(rows, money).buyTurnoverShare * 100));
  assert.equal(turnoverFlow({ berry: rows }, {}, money).buys, 100);
});

// ------------------------------------------------------------ treemap

const modeRows = {
  berry: [{ mode: 'BASE', cost: 1, turnover: usd(3000) }, { mode: 'BONUS', cost: 200, turnover: usd(2000) }, { mode: 'ANTE', cost: 1.25, turnover: null }],
  'pixel-geyser': [{ mode: 'BASE', cost: 1, turnover: usd(2500) }, { mode: 'SUPER', cost: 500, turnover: 0 }],
  'tin-comet': [{ mode: 'BASE', cost: 1, turnover: null }],
};
const labels = { berry: 'Berry', 'pixel-geyser': 'Pixel Geyser', 'tin-comet': 'Tin Comet' };

test('the turnover tree is games biggest first, each with its measured modes biggest first, in dollars', () => {
  const tree = turnoverTree(modeRows, labels, money);
  assert.deepEqual(tree.games.map((g) => [g.key, g.value, g.modes.map((m) => [m.mode, m.value, m.buy])]), [
    ['berry', 5000, [['BASE', 3000, false], ['BONUS', 2000, true]]],
    ['pixel-geyser', 2500, [['BASE', 2500, false]]],
  ]);
  assert.equal(tree.total, 7500);
  assert.equal(tree.headline, 'Berry takes 67% of turnover this month, and BASE is 60% of that.');
});

test('a mode nobody measured, or that took nothing, is left out rather than drawn as a zero tile', () => {
  const tree = turnoverTree(modeRows, labels, money);
  assert.ok(!tree.games.some((g) => g.key === 'tin-comet'), 'a game with no measured mode is absent');
  assert.ok(!tree.games.flatMap((g) => g.modes).some((m) => m.mode === 'ANTE' || m.mode === 'SUPER'));
});

test('the tree headline names the biggest single slice when it sits outside the biggest game', () => {
  const tree = turnoverTree({
    berry: ['A', 'B', 'C', 'D'].map((mode) => ({ mode, cost: 1, turnover: usd(25) })),
    'pixel-geyser': [{ mode: 'BASE', cost: 1, turnover: usd(80) }],
  }, labels, money, { span: 'today' });
  assert.equal(tree.headline, 'Berry takes 56% of turnover today, and A is 25% of that. The single biggest slice is Pixel Geyser BASE, at 44%.');
  assert.match(turnoverTree({ berry: [{ mode: 'BASE', cost: 1, turnover: usd(5) }] }, labels, money).headline, /all of it in BASE\.$/);
});

test('a tree over nothing measured has no total and no headline - never a $0 total', () => {
  for (const input of [{}, { berry: [] }, { berry: null }, { berry: [{ mode: 'BASE', turnover: null }] }, null]) {
    assert.deepEqual(turnoverTree(input, labels, money), { games: [], total: null, headline: null });
  }
});

// ------------------------------------------------------------ flow

test('the flow splits each game into base play and feature buys, and names where the buys went', () => {
  const flow = turnoverFlow({
    berry: [{ mode: 'BASE', cost: 1, turnover: usd(600) }, { mode: 'BONUS', cost: 100, turnover: usd(300) }, { mode: 'MYSTERY', cost: null, turnover: usd(100) }],
    'pixel-geyser': [{ mode: 'BASE', cost: 1, turnover: usd(400) }, { mode: 'BUY', cost: 50, turnover: usd(100) }],
  }, labels, money, { span: 'in the last 24h' });
  assert.deepEqual(flow.games, [
    { key: 'berry', label: 'Berry', base: 700, buys: 300, total: 1000 },
    { key: 'pixel-geyser', label: 'Pixel Geyser', base: 400, buys: 100, total: 500 },
  ]);
  assert.equal(flow.headline, '$1,500.00 of turnover in the last 24h: $1,100.00 (73%) base play, $400.00 (27%) feature buys. Berry sends the most into buys: $300.00, 75% of all of them.');
});

test('a flow with no buys says so plainly, and one buying game is named alone', () => {
  const none = turnoverFlow({ berry: [{ mode: 'BASE', cost: 1, turnover: usd(10) }] }, labels, money);
  assert.equal(none.headline, '$10.00 of turnover this month, all of it base play: no mode played was a feature buy.');
  assert.equal(none.buys, 0, 'a measured zero is a zero');
  const one = turnoverFlow({ berry: [{ mode: 'BONUS', cost: 100, turnover: usd(10) }], 'pixel-geyser': [{ mode: 'BASE', cost: 1, turnover: usd(30) }] }, labels, money);
  assert.match(one.headline, /Every buy was in Berry\.$/);
});

test('a flow over nothing measured is all nulls', () => {
  assert.deepEqual(turnoverFlow({ 'tin-comet': modeRows['tin-comet'] }, labels, money), { games: [], base: null, buys: null, total: null, headline: null });
});

// ------------------------------------------------------------ bucketed sums

test('summedSeries in hours is hourlySeries, and at poll size a missed poll is dropped rather than doubled', () => {
  const now = Date.parse('2026-09-23T12:00:00Z');
  const trail = [];
  for (let t = now - 3 * H; t <= now; t += 20 * M) trail.push({ ts: t, fields: { count: (t - now + 3 * H) / M } });
  assert.deepEqual(summedSeries([trail], 'count', { now, sizeMs: H, count: 3 }), hourlySeries([trail], 'count', { now, hours: 3 }));

  const polls = [];
  for (let i = 0; i <= 8; i++) if (i !== 4) polls.push({ ts: now - (8 - i) * SLOT, fields: { count: 100 + i * 7 } });
  const slots = summedSeries([polls], 'count', { now, sizeMs: SLOT, from: now - 8 * SLOT, maxGapMs: SLOT * 1.5 });
  const values = slots.map((s) => s.value);
  assert.ok(values.every((v) => v === null || v === 7), `every measured poll took 7 bets: ${values}`);
  assert.equal(values.filter((v) => v === null).length, 3, 'the gap spans two intervals, and the last is still open');
});

// ------------------------------------------------------------ hour by day

// Every 10 minutes from 23:30Z on Sep 16: 10 bets a sample, 50 in the 20:00Z hour.
function teamTrail(now, { skip = () => false } = {}) {
  const trail = [];
  let count = 0;
  for (let t = Date.parse('2026-09-16T23:30:00Z'); t <= now; t += 10 * M) {
    count += new Date(t - 1).getUTCHours() === 20 ? 50 : 10;
    if (!skip(t)) trail.push({ ts: t, fields: { count } });
  }
  return trail;
}

test('the hour-by-day grid covers the last 7 UTC days up to the hour now, and not an hour beyond', () => {
  const now = Date.parse('2026-09-23T10:40:00Z');
  const grid = hourByDay(teamTrail(now), 'count', { now });
  assert.deepEqual(grid.dates, ['2026-09-17', '2026-09-18', '2026-09-19', '2026-09-20', '2026-09-21', '2026-09-22', '2026-09-23']);
  assert.equal(grid.cells.length, 6 * 24 + 11, 'today stops at 10:00Z');
  assert.deepEqual(grid.cells.at(-1), { day: 6, hour: 10, value: 40, inProgress: true });
  assert.ok(grid.cells.filter((c) => !c.inProgress).every((c) => c.value === (c.hour === 20 ? 300 : 60)), 'six samples an hour');
  assert.equal(grid.headline, 'Busiest hour: Sep 17 at 20:00Z (300 bets). The day\'s peak fell at 20:00Z on 6 of 6 full days.');
});

test('an hour the collector missed is null, not zero, and the headline counts what was measured', () => {
  const now = Date.parse('2026-09-23T10:40:00Z');
  const from = Date.parse('2026-09-20T05:00:00Z'), to = Date.parse('2026-09-20T08:00:00Z');
  const grid = hourByDay(teamTrail(now, { skip: (t) => t > from && t < to }), 'count', { now });
  const sep20 = grid.cells.filter((c) => c.day === 3);
  assert.deepEqual(sep20.filter((c) => c.value === null).map((c) => c.hour), [5, 6, 7]);
  assert.ok(!grid.cells.some((c) => c.value === 0), 'no fabricated zero');
  assert.match(grid.headline, /151 of 154 hours were measured; the rest are left empty, not zero\.$/);
  clean(grid.headline);
});

test('the hour still filling never wins, and a day of mostly outage does not vote for a peak hour', () => {
  const now = Date.parse('2026-09-23T20:40:00Z');
  const grid = hourByDay(teamTrail(now, { skip: (t) => t > Date.parse('2026-09-21T00:00:00Z') && t < Date.parse('2026-09-21T19:00:00Z') }), 'count', { now });
  assert.ok(grid.cells.at(-1).inProgress);
  assert.match(grid.headline, /on 5 of 5 full days/, 'the outage day is not a full day');
});

test('when no hour leads twice the headline says the peak moves', () => {
  const now = Date.parse('2026-09-21T00:10:00Z');
  const trail = [];
  let count = 0;
  for (let t = Date.parse('2026-09-14T23:00:00Z'); t <= now; t += 10 * M) {
    const at = new Date(t - 1);
    count += at.getUTCHours() === at.getUTCDate() - 10 ? 90 : 10;
    trail.push({ ts: t, fields: { count } });
  }
  assert.match(hourByDay(trail, 'count', { now }).headline, /The day's peak moves: no one hour led on more than 1 of 6 full days\./);
});

test('an empty trail gives an empty grid and no headline', () => {
  const now = Date.parse('2026-09-23T02:10:00Z');
  const grid = hourByDay([], 'count', { now });
  assert.equal(grid.headline, null);
  assert.ok(grid.cells.every((c) => c.value === null));
});

// ------------------------------------------------------------ live stream

function liveTrails(now, { missing = [] } = {}) {
  const online = [], games = { berry: [], 'pixel-geyser': [] };
  for (let t = now - 4 * H; t <= now; t += SLOT) {
    const i = (t - (now - 4 * H)) / SLOT;
    if (missing.includes(t)) continue;
    online.push({ ts: t, fields: { onlinePlayers: 10 + (i % 5) } });
    games.berry.push({ ts: t, fields: { count: 1000 + i * 5 } });
    games['pixel-geyser'].push({ ts: t, fields: { count: 40 + i * 2 } });
  }
  return { online, games };
}

test('the live stream is one point per poll: players read at the poll, bets over the interval it closed', () => {
  const now = Date.parse('2026-09-23T12:01:00Z'), grid = Date.parse('2026-09-23T12:00:00Z');
  const { online, bets, headline } = liveStream({ ...liveTrails(grid), now, hours: 3 });
  assert.equal(online.at(-1).ts, grid);
  assert.equal(bets.at(-1).ts, grid, 'stamped at the end of its interval - the unfinished one is not drawn');
  assert.ok(bets.every((p) => p.value === 7), 'berry 5 + pixel-geyser 2 a poll');
  assert.ok(online[0].ts >= now - 3 * H - SLOT && bets[0].value !== null, 'three hours back, nothing unmeasured at the ends');
  assert.equal(headline, `Last 3h, per poll: ${online.at(-1).value} players online at 12:00Z, peak 14 at ${new Date(online.find((p) => p.value === 14).ts).toISOString().slice(11, 16)}Z; the poll to 12:00Z took 7 bets, against a median of 7 over ${bets.length} measured polls.`);
});

test('a missed poll breaks both strips - a null inside, and no doubled bets after it', () => {
  const grid = Date.parse('2026-09-23T12:00:00Z'), gap = grid - 20 * SLOT;
  const { online, bets } = liveStream({ ...liveTrails(grid, { missing: [gap] }), now: grid + M, hours: 3 });
  assert.equal(online.find((p) => p.ts === gap).value, null);
  assert.deepEqual(bets.filter((p) => p.value === null).map((p) => p.ts), [gap, gap + SLOT]);
  assert.ok(bets.every((p) => p.value === null || p.value === 7), 'no spike after the gap');
});

test('a live stream with nothing read says nothing, and one without bets leaves them out of the headline', () => {
  const now = Date.parse('2026-09-23T12:01:00Z');
  assert.deepEqual(liveStream({ now }), { online: [], bets: [], headline: null });
  const onlineOnly = liveStream({ online: liveTrails(now).online, games: {}, now });
  assert.doesNotMatch(onlineOnly.headline, /bets/);
  clean(onlineOnly.headline);
});

// ------------------------------------------------------------ daily trend

test('the daily trend keeps a missed day null in both series and sums only what was measured', () => {
  const trend = dailyTrend([
    { date: '2026-09-20', measured: true, turnover: 1000, profit: -12.5 },
    { date: '2026-09-21', measured: false, turnover: null, profit: null },
    { date: '2026-09-22', measured: true, turnover: 3000, profit: 0 },
    { date: '2026-09-23', measured: true, turnover: 500, profit: 20, current: true },
  ]);
  assert.deepEqual(trend.rows.map((r) => [r.turnover, r.profit]), [[1000, -12.5], [null, null], [3000, 0], [500, 20]]);
  assert.equal(trend.headline, '3 of 4 days measured: $4,500.00 turnover and +$7.50 studio P/L. Busiest: Sep 22 ($3,000.00). Studio P/L ran from -$12.50 (Sep 20) to +$20.00 (Sep 23). Today is still filling.');
});

test('an unsynced day is null even if a figure leaked into it, and nothing measured is no headline', () => {
  assert.deepEqual(dailyTrend([{ date: '2026-09-20', measured: false, turnover: 0, profit: 0 }]), {
    rows: [{ date: '2026-09-20', turnover: null, profit: null, current: false }], headline: null });
  assert.equal(dailyTrend().headline, null);
});
