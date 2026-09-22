import { test } from 'node:test';
import assert from 'node:assert/strict';
import { settlement, dataHealth } from '../src/insights/settlement.mjs';

const money = { unitsPerDollar: 1_000_000, profitShare: 0.1, expectedShare: 0.075 };
const now = Date.parse('2026-09-22T12:00:00Z');
const H = 3_600_000;

// Live figures, 2026-09-22: 0.1 x sum(profit) + carry == position to the cent.
const balance = { position: -8636768156, expectedProfit: -379487778, carry: -2184064350 };
const rows = [
  { slug: 'a', name: 'A', stats: { profit: -40000000000 } },
  { slug: 'b', name: 'B', stats: { profit: -24527038060 } },
];

const close = (a, b, eps = 0.005) => assert.ok(Math.abs(a - b) < eps, `${a} vs ${b}`);

// ------------------------------------------------------------- the month
test('position, carry and the expected month come off the balance endpoint in USD', () => {
  const s = settlement({ balance, rows, money, now });
  close(s.position, -8636.768156);
  close(s.carry, -2184.06435);
  close(s.expectedMonth, -379.487778 + 2184.06435, 1e-6);
});

test('the luck gap is position against the balance endpoint\'s own expectation', () => {
  const s = settlement({ balance, rows, money, now });
  close(s.gap, -8636.768156 - -379.487778, 1e-6);
  assert.match(s.headlines.gap, /luck gap of -\$8,257\.28/);
  assert.match(s.headlines.gap, /players running hot/);
});

test('settled-now is rate x summed roster profit plus carry, with the rate derived and snapped to 10%', () => {
  const s = settlement({ balance, rows, money, now });
  assert.equal(s.rate, 0.1);
  assert.equal(s.rateSource, 'derived');
  close(s.studioMonth, -6452.703806, 1e-6);
  close(s.settledNow, -6452.703806 + -2184.06435, 1e-6);
  close(s.residual, 0, 0.01);
  assert.equal(s.paidIfSettled, 0, 'a negative position pays nothing and carries forward');
  assert.match(s.headlines.settled, /Nothing would be paid/);
});

test('a derived rate outside the guard falls back to the configured share', () => {
  const tiny = [{ slug: 'a', stats: { profit: 500_000_000 } }]; // $500 gross: under the $1,000 guard
  const s = settlement({ balance: { position: 1_000_000_000, carry: 0, expectedProfit: 0 }, rows: tiny, money, now });
  assert.equal(s.rate, 0.1);
  assert.equal(s.rateSource, 'configured');
});

test('a positive position is paid in full', () => {
  const s = settlement({ balance: { position: 25_000_000, carry: 0, expectedProfit: 10_000_000 }, rows: [{ slug: 'a', stats: { profit: 250_000_000 } }], money, now });
  assert.equal(s.paidIfSettled, 25);
  assert.match(s.headlines.settled, /\$25\.00 would be paid/);
});

test('with no balance reading, position, carry, gap and settled are null - not zero - and the roster share still shows', () => {
  const s = settlement({ balance: null, rows, money, now });
  for (const key of ['position', 'carry', 'expectedMonth', 'gap', 'settledNow', 'paidIfSettled']) assert.equal(s[key], null, key);
  close(s.studioMonth, -6452.703806, 1e-6);
  assert.equal(s.headlines.gap, null);
});

test('with no roster reading, the month figures are null', () => {
  const s = settlement({ balance, rows: [{ slug: 'a', stats: null }], money, now });
  assert.equal(s.studioMonth, null);
  assert.equal(s.settledNow, null);
});

test('a measured zero month still counts as a reading', () => {
  const s = settlement({ balance: { position: 0, carry: 0, expectedProfit: 0 }, rows: [{ slug: 'a', stats: { profit: 0 } }], money, now });
  assert.equal(s.studioMonth, 0);
  assert.equal(s.settledNow, 0);
  assert.equal(s.gap, 0);
});

// ---------------------------------------------------------- the projection
const daily = [
  { date: '2026-08-31', profit: 999, measured: true },           // last month: ignored
  { date: '2026-09-19', profit: 10, measured: true },
  { date: '2026-09-20', profit: -30, measured: true },
  { date: '2026-09-21', profit: 20, measured: true },
  { date: '2026-09-18', profit: null, measured: false },           // not synced: ignored
  { date: '2026-09-22', profit: 500, measured: true, current: true }, // today: ignored
];

test('the projection adds the median complete day for every full day left in the month', () => {
  const s = settlement({ balance, rows, daily, money, now });
  assert.equal(s.projection.medianDay, 10);
  assert.equal(s.projection.daysLeft, 8, 'Sep 23..30');
  close(s.projection.studioMonthEnd, -6452.703806 + 80, 1e-6);
  close(s.projection.settledMonthEnd, -6452.703806 + 80 - 2184.06435, 1e-6);
  assert.match(s.headlines.projection, /8 full days left/);
});

test('no complete day this month means no projection', () => {
  assert.equal(settlement({ balance, rows, daily: [{ date: '2026-09-22', profit: 5, measured: true, current: true }], money, now }).projection, null);
});

// ------------------------------------------------- today against yesterday
const sample = (ts, count, turnover, profit) => ({ ts, fields: { count, turnover, profit } });
const mid = Date.parse('2026-09-22T00:00:00Z');
const yMid = mid - 24 * H;

test('today sums studio P/L since 00:00Z, yesterday the same elapsed hours', () => {
  const trail = [
    sample(yMid, 100, 1000e6, 0),
    sample(yMid + 6 * H, 110, 1100e6, 50e6),         // yesterday 00-06
    sample(yMid + 18 * H, 120, 1200e6, 900e6),       // yesterday after 12:00: outside the slice
    sample(mid, 130, 1300e6, 1000e6),
    sample(mid + 6 * H, 140, 1400e6, 800e6),          // today -200e6 gross
    sample(mid + 11 * H, 150, 1500e6, 700e6),         // today -100e6 gross
  ];
  const s = settlement({ balance, rows, teamTrail: trail, money, now });
  close(s.today, -30, 1e-9);
  close(s.yesterdaySlice, 5, 1e-9);
  assert.match(s.headlines.today, /Today so far -\$30\.00, against \+\$5\.00 over the same hours yesterday/);
});

test('a reading below the counters\' high-water mark is replica lag and is dropped, not differenced', () => {
  // The latest read comes from a lagging replica: fewer bets and less turnover
  // than the read before it. Differencing to it would report $0.50 today; the
  // true figure is the last good reading's $2.00.
  const trail = [
    sample(mid - 60000, 100, 1000e6, 0),
    sample(mid + 1 * H, 110, 1100e6, 20e6),
    sample(mid + 2 * H, 108, 1090e6, 5e6),
  ];
  const s = settlement({ balance, rows, teamTrail: trail, money, now });
  close(s.today, 2, 1e-9);
});

test('an interval that crosses the month boundary is skipped', () => {
  const first = Date.parse('2026-10-01T00:00:00Z');
  const trail = [sample(first - 150000, 5000, 9e9, 3e9), sample(first + 150000, 10, 10e6, 1e6), sample(first + 300000, 20, 20e6, 3e6)];
  const s = settlement({ balance, rows, teamTrail: trail, money, now: first + 600000 });
  close(s.today, 0.2, 1e-9);
});

test('a slice the trail does not reach back to is null, not a partial figure', () => {
  const trail = [sample(mid + H, 100, 1000e6, 0), sample(mid + 2 * H, 110, 1100e6, 10e6)];
  const s = settlement({ balance, rows, teamTrail: trail, money, now });
  assert.equal(s.today, null, 'no baseline at or before 00:00Z');
  assert.equal(s.yesterdaySlice, null);
});

// ---------------------------------------------------------------- data health
const roster = [
  { slug: 'berry', name: 'Berry', stats: { profit: 1_000_000 } },
  { slug: 'nwo', name: 'Neon City Heist', stats: { profit: -5_000_000 } },
  { slug: 'navy', name: 'Pixel Nest', stats: null },
];
const games = [
  { slug: 'berry', stats: { month: { profit: 1_000_000 } } },
  { slug: 'nwo', stats: { month: { profit: -4_000_000 } } },
];
const perGame = {
  berry: { ok: true, data: { stats: [{ mode: 'BASE', profit: 600_000 }, { mode: 'BONUS', profit: 400_000 }] } },
  nwo: { ok: true, data: { stats: [{ mode: 'BASE', profit: -5_000_000 }] } },
};

test('dataHealth reconciles /stats, /games and the per-mode sums to the cent', () => {
  const h = dataHealth({ roster, games, perGame, snapshots: {}, now, pollMinutes: 2.5, money });
  const berry = h.rows.find(r => r.slug === 'berry');
  assert.equal(berry.ok, true);
  assert.equal(berry.diffUsd, 0);
  assert.equal(berry.modesDiffUsd, 0);
  const nwo = h.rows.find(r => r.slug === 'nwo');
  assert.equal(nwo.ok, false);
  assert.equal(nwo.diffUsd, 1, '/games -$4 vs /stats -$5');
  assert.match(h.headline, /1 of 2 checkable games reconcile/);
  assert.match(h.headline, /Neon City Heist/);
});

test('a game with nothing to compare is unverifiable (null), not a pass', () => {
  const h = dataHealth({ roster, games, perGame, snapshots: {}, now, pollMinutes: 2.5, money });
  const navy = h.rows.find(r => r.slug === 'navy');
  assert.equal(navy.ok, null);
  assert.equal(navy.rosterProfit, null);
});

test('freshness flags an endpoint older than three polls, honouring a slower cadence', () => {
  const snapshots = { roster: now - 5 * 60000, graph: now - 30 * 60000, lifetime: now - 50 * 60000, balance: now - 9 * 60000, games: null };
  const h = dataHealth({ roster, games, perGame, snapshots, now, pollMinutes: 2.5, money, cadence: { graph: 15, lifetime: 60 } });
  const f = Object.fromEntries(h.freshness.map(x => [x.endpoint, x]));
  assert.equal(f.roster.stale, false);
  assert.equal(f.balance.stale, true, '9 min > 7.5 min');
  assert.equal(f.graph.stale, false, '30 min inside 3 x 15 x 2.5 min');
  assert.equal(f.lifetime.stale, false);
  assert.equal(f.games.stale, null, 'never read is unknown, not fresh');
  assert.equal(f.games.ageMs, null);
  assert.match(h.headline, /balance/);
});
