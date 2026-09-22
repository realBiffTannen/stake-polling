import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  pnlByGame, turnoverShare, buyShare, noiseBand, bandHeadline, hourlySeries, pnlTrend, betsTrend,
  onlineHourly, dailyPnl, pnlByMode, modeMix, BUY_COST,
} from '../src/insights/conclusions.mjs';

const money = { unitsPerDollar: 1_000_000, profitShare: 0.1, expectedShare: 0.075 };
const H = 3_600_000;
const now = Date.parse('2026-09-22T12:30:00Z');

// ---------------------------------------------------------------- P/L by game
const roster = [
  { name: 'berry', label: 'Berry', profitUsd: 178.23, turnoverUsd: 190000 },
  { name: 'nwo', label: 'Neon City Heist', profitUsd: -3267.85, turnoverUsd: 80000 },
  { name: 'hippo', label: 'Hippo Hustle', profitUsd: -2452.68, turnoverUsd: 59000 },
  { name: 'xmas', label: 'Pixel Carnivals', profitUsd: -2132.56, turnoverUsd: 43000 },
  { name: 'farm', label: 'Pixel Fort', profitUsd: -324.33, turnoverUsd: 8700 },
  { name: 'navy', label: 'Pixel Nest', pending: true, profitUsd: null, turnoverUsd: null },
];

test('pnlByGame orders winners above losers and leaves the unmeasured game out', () => {
  const { bars } = pnlByGame(roster);
  assert.deepEqual(bars.map(b => b.key), ['berry', 'farm', 'xmas', 'hippo', 'nwo']);
});

test('pnlByGame names the net, the split, the biggest loser and the top-3 share of losses', () => {
  const { headline } = pnlByGame(roster);
  assert.match(headline, /-\$7,999\.19/, 'net');
  assert.match(headline, /1 up, 4 down/);
  assert.match(headline, /Neon City Heist lost most \(-\$3,267\.85\)/);
  // (3267.85 + 2452.68 + 2132.56) / (3267.85 + 2452.68 + 2132.56 + 324.33) = 96%
  assert.match(headline, /3 biggest losers account for 96% of all losses/);
});

test('pnlByGame counts a measured zero as up, not as missing', () => {
  const { bars, headline } = pnlByGame([{ name: 'a', label: 'A', profitUsd: 0 }, { name: 'b', label: 'B', profitUsd: 5 }]);
  assert.equal(bars.length, 2);
  assert.match(headline, /every game is up/);
});

test('pnlByGame has no headline when nothing is measured', () => {
  assert.equal(pnlByGame([{ name: 'a', label: 'A', profitUsd: null }]).headline, null);
});

// ------------------------------------------------------- turnover concentration
test('turnoverShare states the leader and the top-3 share', () => {
  const { bars, headline } = turnoverShare(roster);
  assert.equal(bars[0].key, 'berry');
  assert.equal(Math.round(bars[0].value), 50, '190000 / 380700');
  assert.match(headline, /Berry takes 50% of turnover this month; the top 3 take 86%/);
  assert.match(turnoverShare(roster, { span: 'in the last 24h' }).headline, /50% of turnover in the last 24h/);
});

test('turnoverShare with no measured turnover has no headline', () => {
  assert.equal(turnoverShare([{ name: 'a', label: 'A', turnoverUsd: null }]).headline, null);
});

// ----------------------------------------------------------------- buy share
test('buyShare counts only modes costing more than BUY_COST as feature buys', () => {
  assert.equal(BUY_COST, 5);
  const { bars, headline } = buyShare({
    berry: [{ mode: 'BASE', cost: 1, turnover: 60 }, { mode: 'ANTE', cost: 3, turnover: 20 }, { mode: 'BONUS', cost: 200, turnover: 20 }],
    hippo: [{ mode: 'BASE', cost: 1, turnover: 10 }, { mode: 'BUY_MAX', cost: 500, turnover: 90 }],
  }, { berry: 'Berry', hippo: 'Hippo Hustle' });
  assert.deepEqual(bars.map(b => [b.key, Math.round(b.value)]), [['hippo', 90], ['berry', 20]]);
  assert.match(headline, /55% of studio turnover/, '(20 + 90) / 200');
  assert.match(headline, /Highest: Hippo Hustle \(90%\); lowest: Berry \(20%\)/);
});

test('buyShare skips a game with no measured turnover rather than calling it 0%', () => {
  const { bars } = buyShare({ a: [{ mode: 'BASE', cost: 1, turnover: null }] }, { a: 'A' });
  assert.deepEqual(bars, []);
});

// ---------------------------------------------------------------- noise band
test('noiseBand combines per-mode standard errors weighted by turnover share', () => {
  // Two modes, equal turnover. SE_i = sigma/sqrt(n): 10/100 = 0.1 and 2/10 = 0.2.
  // Var = 0.5^2 * 0.1^2 + 0.5^2 * 0.2^2 = 0.0125 -> SE = 0.1118
  const band = noiseBand({ profit: 20, turnover: 200, edge: 0.033,
    parts: [{ count: 10_000, turnover: 100, sigma: 10 }, { count: 100, turnover: 100, sigma: 2 }] });
  assert.ok(Math.abs(band.se - 0.1118) < 1e-4, String(band.se));
  assert.equal(band.margin, 0.1);
  assert.ok(Math.abs(band.lo - (0.033 - 2 * band.se)) < 1e-9);
  assert.equal(band.outside, false);
});

test('noiseBand flags a margin beyond two standard errors', () => {
  const band = noiseBand({ profit: -100, turnover: 100, edge: 0.033, parts: [{ count: 10_000, turnover: 100, sigma: 10 }] });
  assert.equal(band.outside, true, 'margin -100% vs SE 10%');
  assert.ok(band.z < -2);
});

test('noiseBand cannot judge without a captured sigma for every played mode', () => {
  const band = noiseBand({ profit: 5, turnover: 100, edge: 0.033, parts: [{ count: 10, turnover: 100, sigma: null }] });
  assert.equal(band.se, null);
  assert.equal(band.outside, null);
});

test('noiseBand with no edge or no profit reading is not judged, and a measured zero profit is', () => {
  assert.equal(noiseBand({ profit: 5, turnover: 100, edge: null, parts: [{ count: 10, turnover: 100, sigma: 1 }] }).outside, null);
  assert.equal(noiseBand({ profit: null, turnover: 100, edge: 0.03, parts: [{ count: 10, turnover: 100, sigma: 1 }] }).margin, null);
  assert.equal(noiseBand({ profit: 0, turnover: 100, edge: 0.03, parts: [{ count: 10, turnover: 100, sigma: 1 }] }).margin, 0);
});

test('bandHeadline says ordinary variance when every judged row is inside its band', () => {
  const h = bandHeadline([{ label: 'A', outside: false, z: 0.5 }, { label: 'B', outside: false, z: -1 }, { label: 'C', outside: null }], 'games');
  assert.match(h, /All 2 judged games sit inside/);
  assert.match(h, /ordinary variance/);
  assert.match(h, /1 game cannot be judged: no captured model, a mode missing its captured sigma, or no measured play/);
});

test('bandHeadline names the rows outside their band as a prompt, not a proof', () => {
  const h = bandHeadline([{ label: 'A', outside: true, z: -2.41 }, { label: 'B', outside: false, z: 0 }], 'modes');
  assert.match(h, /1 of 2 judged modes sit outside/);
  assert.match(h, /A \(z = -2\.4, paid out more than its band\)/);
  assert.match(h, /not proof/);
});

test('bandHeadline tells a low z (usually one big win) from a high z (the house keeping more than its edge)', () => {
  const low = bandHeadline([{ label: 'A', outside: true, z: -6.8 }], 'games');
  assert.match(low, /usually one big win/);
  const high = bandHeadline([{ label: 'B', outside: true, z: 3.1 }], 'games');
  assert.match(high, /B \(z = 3\.1, kept more than its band\)/);
  assert.match(high, /rarer and more telling/);
});

test('bandHeadline with nothing judged says so', () => {
  assert.match(bandHeadline([{ label: 'A', outside: null }], 'games'), /cannot be judged/);
});

// ------------------------------------------------------------ live, per hour
const trail = (points) => points.map(([hoursAgo, v]) => ({ ts: now - hoursAgo * H, fields: { profit: v, count: v } }));

test('hourlySeries sums each hour across trails, oldest first, with unmeasured hours null', () => {
  const a = trail([[3, 100], [2, 150], [1, 150]]);
  const b = trail([[3, 10], [2, 30], [1, 30]]);
  // Hour-apart samples: widen the outage threshold, or every step would count as spanning a gap.
  const series = hourlySeries([a, b], 'profit', { now, hours: 4, maxGapMs: 2 * H });
  assert.equal(series.length, 4);
  assert.deepEqual(series.map(s => s.value), [null, 70, 0, null], 'a +50 & b +20 at 2h ago; both flat 1h ago; nothing this hour');
  assert.ok(series[0].from < series[3].from);
});

test('pnlTrend converts to the studio share, accumulates across gaps and names the biggest hour', () => {
  const series = [{ from: Date.parse('2026-09-22T09:00:00Z'), value: 10_000_000 }, { from: Date.parse('2026-09-22T10:00:00Z'), value: null },
    { from: Date.parse('2026-09-22T11:00:00Z'), value: -50_000_000 }];
  const t = pnlTrend(series, money);
  assert.deepEqual(t.hourly, [1, null, -5]);
  assert.deepEqual(t.cumulative, [1, null, -4], 'a gap breaks the line, the total carries on after it');
  assert.match(t.headline, /-\$4\.00/);
  assert.match(t.headline, /11:00Z/);
});

test('pnlTrend over hours that measured nothing has no headline', () => {
  assert.equal(pnlTrend([{ from: 0, value: null }], money).headline, null);
});

test('betsTrend names the busiest hour and how many hours were measured', () => {
  const t = betsTrend([{ from: Date.parse('2026-09-22T09:00:00Z'), value: 40 }, { from: Date.parse('2026-09-22T10:00:00Z'), value: null },
    { from: Date.parse('2026-09-22T11:00:00Z'), value: 90 }]);
  assert.match(t.headline, /Busiest hour: 11:00Z \(90 bets\)/);
  assert.match(t.headline, /130 bets/);
  assert.match(t.headline, /2 of 3 hours measured/);
});

test('onlineHourly takes each hour\'s peak level, and a missing reading is not a zero', () => {
  const samples = [
    { ts: now - 2 * H, fields: { onlinePlayers: 5 } }, { ts: now - 2 * H + 60000, fields: { onlinePlayers: 9 } },
    { ts: now - 1 * H, fields: {} }, { ts: now, fields: { onlinePlayers: 0 } },
  ];
  const { series, headline } = onlineHourly(samples, { now, hours: 3 });
  assert.deepEqual(series.map(s => s.value), [9, null, 0]);
  assert.match(headline, /Peak: 9 players online/);
  assert.match(headline, /Now: 0/);
});

// --------------------------------------------------------------- daily P/L
test('dailyPnl counts days at or above zero, and names the best and worst', () => {
  const t = dailyPnl([{ date: '2026-09-01', profit: 10, measured: true }, { date: '2026-09-02', profit: -30, measured: true },
    { date: '2026-09-03', profit: 0, measured: true }, { date: '2026-09-04', profit: null, measured: false }]);
  assert.match(t.headline, /2 of 3 measured days ended at or above zero/);
  assert.match(t.headline, /Best: Sep 1 \(\+\$10\.00\)/);
  assert.match(t.headline, /Worst: Sep 2 \(-\$30\.00\)/);
});

// --------------------------------------------------------------- per mode
const xmas = [
  { mode: 'BASE', cost: 1, count: 11634, turnover: 5_901_290_000, profit: -1_269_100_000 },
  { mode: 'BONUS_BOOST', cost: 3, count: 3774, turnover: 2_569_520_000, profit: 438_000_000 },
  { mode: 'NEITHER_OR_NONE', cost: 250, count: 1083, turnover: 27_708_350_000, profit: -24_594_300_000 },
  { mode: 'FREE_SPINS', cost: 50, count: 160, turnover: 3_937_750_000, profit: 2_418_900_000 },
];

test('pnlByMode names the mode that moved the game most, and says when it outweighs the whole net', () => {
  const { bars, headline } = pnlByMode(xmas, money);
  assert.equal(bars.length, 4);
  assert.match(headline, /Net -\$2,300\.65/);
  assert.match(headline, /NEITHER_OR_NONE moved it most \(-\$2,459\.43\)/);
  assert.match(headline, /more than the whole net, so the other modes together were up/);
});

test('pnlByMode leaves out a mode with no profit reading, and keeps a measured zero', () => {
  const { bars } = pnlByMode([{ mode: 'A', profit: null }, { mode: 'B', profit: 0 }], money);
  assert.deepEqual(bars.map(b => [b.key, b.value]), [['B', 0]]);
});

test('modeMix contrasts the feature buys\' share of bets with their share of turnover', () => {
  const { rows, headline } = modeMix(xmas);
  assert.equal(rows.length, 4);
  // buys: NEITHER_OR_NONE + FREE_SPINS = 1243 of 16651 bets, 31646.1 of 40116.91 turnover
  assert.match(headline, /Feature buys are 7\.5% of bets but 78\.9% of turnover/);
});

test('modeMix with no buy modes describes the busiest mode instead', () => {
  const { headline } = modeMix([{ mode: 'BASE', cost: 1, count: 90, turnover: 90 }, { mode: 'ANTE', cost: 3, count: 10, turnover: 30 }]);
  assert.match(headline, /BASE is 90\.0% of bets and 75\.0% of turnover/);
});

// ------------------------------------------------------------------ donuts
import { donutSets } from '../src/insights/conclusions.mjs';

const nine = ['a', 'b', 'c', 'd', 'e', 'f', 'g', 'h', 'i'].map((k, i) => ({
  name: k, label: k.toUpperCase(), count: 100 - i * 10, turnoverUsd: 1000 - i * 100, profitUsd: i % 2 ? -(i + 1) * 10 : (i + 1) * 10,
}));

test('donutSets gives each of the seven most relevant games one colour slot, the same in all four donuts', () => {
  const sets = donutSets(nine);
  const slotOf = (set) => Object.fromEntries(set.slices.filter(s => s.slot !== null).map(s => [s.key, s.slot]));
  const bets = slotOf(sets.bets);
  assert.equal(Object.keys(bets).length, 7);
  for (const name of ['turnover', 'gains', 'losses']) {
    for (const [key, slot] of Object.entries(slotOf(sets[name]))) assert.equal(slot, bets[key] ?? slot, `${name}:${key}`);
  }
});

test('donutSets folds everything past seven into one Other slice, drawn last', () => {
  const { bets } = donutSets(nine);
  const other = bets.slices.at(-1);
  assert.equal(other.key, 'other');
  assert.equal(other.slot, null);
  assert.equal(bets.slices.length, 8);
  assert.equal(bets.slices.reduce((a, s) => a + s.value, 0), nine.reduce((a, r) => a + r.count, 0), 'nothing lost in the fold');
});

test('donutSets orders slices by colour slot, not by size', () => {
  const { turnover } = donutSets(nine);
  const slots = turnover.slices.filter(s => s.slot !== null).map(s => s.slot);
  assert.deepEqual(slots, [...slots].sort((x, y) => x - y));
});

test('donutSets splits profit into gains and losses, and a measured zero is in neither', () => {
  const sets = donutSets([{ name: 'up', label: 'Up', count: 1, turnoverUsd: 1, profitUsd: 30 }, { name: 'down', label: 'Down', count: 1, turnoverUsd: 1, profitUsd: -20 },
    { name: 'flat', label: 'Flat', count: 1, turnoverUsd: 1, profitUsd: 0 }, { name: 'none', label: 'None', count: null, turnoverUsd: null, profitUsd: null }]);
  assert.deepEqual(sets.gains.slices.map(s => [s.key, s.value]), [['up', 30]]);
  assert.deepEqual(sets.losses.slices.map(s => [s.key, s.value]), [['down', 20]]);
  assert.equal(sets.bets.slices.length, 3, 'the unmeasured game is not a slice');
  assert.match(sets.gains.headline, /Gains total \+\$30\.00 from 1 game; Up is 100%/);
  assert.match(sets.losses.headline, /Losses total -\$20\.00 from 1 game; Down is 100%/);
});

test('donutSets headlines name the biggest share, and are null when nothing was measured', () => {
  const sets = donutSets(nine, { span: 'today' });
  assert.match(sets.bets.headline, /A has 19% of bets today/);
  const empty = donutSets([]);
  for (const key of ['bets', 'turnover', 'gains', 'losses']) assert.equal(empty[key].headline, null, key);
});

// ------------------------------------------------------- bands from mode rows
import { gameBands, modeBands } from '../src/insights/conclusions.mjs';

const galaxyMath = { edge: 0.033, modes: { BASE: { rtp: 0.967, sigma: 11.19 }, BONUS0: { rtp: 0.967, sigma: 2 } } };

test('gameBands builds one band per game from its mode rows and captured sigmas', () => {
  const rows = gameBands({ 'pixel-geyser': [{ mode: 'BASE', count: 10_000, turnover: 1000, profit: 30 }, { mode: 'BONUS0', count: 100, turnover: 1000, profit: 40 }] },
    { 'pixel-geyser': galaxyMath }, { 'pixel-geyser': 'Pixel Geyser' });
  assert.equal(rows.length, 1);
  assert.equal(rows[0].label, 'Pixel Geyser');
  assert.equal(rows[0].value, 0.035, '(30 + 40) / 2000');
  assert.equal(rows[0].ref, 0.033);
  assert.equal(rows[0].outside, false);
});

test('gameBands keeps a game with no captured math as an unjudged row, and skips one with no play', () => {
  const rows = gameBands({ a: [{ mode: 'BASE', count: 5, turnover: 100, profit: 3 }], b: [{ mode: 'BASE', count: null, turnover: null, profit: null }] }, {}, {});
  assert.deepEqual(rows.map(r => [r.key, r.outside, r.ref]), [['a', null, null]]);
});

test('modeBands judges each mode against its own captured RTP', () => {
  const rows = modeBands([{ mode: 'BASE', count: 10_000, turnover: 1000, profit: 30 }, { mode: 'GONE', count: 5, turnover: 50, profit: 1 }], galaxyMath);
  assert.equal(rows[0].ref.toFixed(3), '0.033');
  assert.equal(rows[0].outside, false);
  assert.equal(rows[1].outside, null, 'a mode the capture does not know is not judged');
});

test('pnlTrend also sums up the hours themselves: how many were up, and the worst one', () => {
  const t = pnlTrend([{ from: Date.parse('2026-09-22T09:00:00Z'), value: 10_000_000 }, { from: Date.parse('2026-09-22T10:00:00Z'), value: 0 },
    { from: Date.parse('2026-09-22T11:00:00Z'), value: -50_000_000 }, { from: Date.parse('2026-09-22T12:00:00Z'), value: null }], money);
  assert.match(t.hourHeadline, /2 of 3 measured hours ended at or above zero/);
  assert.match(t.hourHeadline, /worst: -\$5\.00 in the hour from 11:00Z/);
  assert.equal(pnlTrend([{ from: 0, value: null }], money).hourHeadline, null);
});

test('hourlySeries never pins a step that spans a collector outage on one hour', () => {
  const t0 = Date.parse('2026-09-22T06:00:00Z');
  const trail = [
    { ts: t0, fields: { count: 100 } }, { ts: t0 + 10 * 60_000, fields: { count: 110 } },
    // collector down five hours; the first sample back carries the whole gap
    { ts: t0 + 5 * H + 10 * 60_000, fields: { count: 5110 } }, { ts: t0 + 5 * H + 20 * 60_000, fields: { count: 5120 } },
  ];
  const series = hourlySeries([trail], 'count', { now: t0 + 5 * H + 30 * 60_000, hours: 6 });
  assert.deepEqual(series.map(s => s.value), [10, null, null, null, null, 10], 'the 5,000-bet outage step is dropped, not dumped on 11:00');
});
