import { test } from 'node:test';
import assert from 'node:assert/strict';
import { running, onlineDay, todayModel, utcMidnight, DAY_MS, HOUR_MS } from '../src/insights/today.mjs';

const money = { unitsPerDollar: 1_000_000, profitShare: 0.1, expectedShare: 0.075 };
const MIN = 60_000;
const at = (iso) => Date.parse(iso);
const NOW = at('2026-09-24T04:00:00Z');
const MIDNIGHT = at('2026-09-24T00:00:00Z');
const sample = (ts, fields) => ({ ts, fields });
const close = (a, b, eps = 1e-6) => assert.ok(Math.abs(a - b) < eps, `${a} vs ${b}`);

// ------------------------------------------------------------ the UTC day
test('the day starts at 00:00:00Z whatever the clock reads', () => {
  assert.equal(utcMidnight(NOW), MIDNIGHT);
  assert.equal(utcMidnight(MIDNIGHT), MIDNIGHT, 'midnight itself is the start of its own day');
  assert.equal(utcMidnight(MIDNIGHT - 1), MIDNIGHT - DAY_MS);
});

// ------------------------------------------------------------ running()
test('a running change starts at zero on the midnight reading and counts only steps after it', () => {
  const trail = [
    sample(MIDNIGHT - 15 * MIN, { profit: 100 }),
    sample(MIDNIGHT, { profit: 110 }), // the step arriving at 00:00:00 is yesterday's last interval
    sample(MIDNIGHT + 15 * MIN, { profit: 130 }),
    sample(MIDNIGHT + 30 * MIN, { profit: 120 }),
  ];
  const r = running(trail, 'profit', { from: MIDNIGHT, to: NOW });
  assert.deepEqual(r.points, [
    { ts: MIDNIGHT, value: 0 },
    { ts: MIDNIGHT + 15 * MIN, value: 20 },
    { ts: MIDNIGHT + 30 * MIN, value: 10 },
  ]);
  assert.equal(r.total, 10);
  assert.equal(r.partial, null);
});

test('a missed stretch breaks the line, but its step still counts, so the running total stays exact', () => {
  const trail = [
    sample(MIDNIGHT, { profit: 0 }),
    sample(MIDNIGHT + 15 * MIN, { profit: 10 }),
    sample(MIDNIGHT + 90 * MIN, { profit: 40 }),
  ];
  const r = running(trail, 'profit', { from: MIDNIGHT, to: NOW, maxGapMs: 20 * MIN });
  assert.deepEqual(r.points.map((p) => p.value), [0, 10, null, 40]);
  assert.equal(r.total, 40);
});

test('a lagging replica reading is dropped rather than booked as a loss and a recovery', () => {
  const trail = [
    sample(MIDNIGHT, { count: 100, turnover: 1000, profit: 50 }),
    sample(MIDNIGHT + 15 * MIN, { count: 90, turnover: 900, profit: 10 }), // behind the high-water mark
    sample(MIDNIGHT + 30 * MIN, { count: 120, turnover: 1200, profit: 60 }),
  ];
  const r = running(trail, 'profit', { from: MIDNIGHT, to: NOW, maxGapMs: HOUR_MS });
  assert.deepEqual(r.points.map((p) => p.value), [0, 10]);
  assert.equal(r.total, 10);
});

test('the month reset at 00:00Z on the 1st is not play', () => {
  const first = at('2026-10-01T00:00:00Z');
  const trail = [
    sample(first - 15 * MIN, { count: 900, profit: 1000 }),
    sample(first, { count: 0, profit: 0 }),
    sample(first + 15 * MIN, { count: 10, profit: 5 }),
  ];
  const r = running(trail, 'profit', { from: first, to: first + HOUR_MS });
  assert.equal(r.total, 5);
  assert.deepEqual(r.points.map((p) => p.value), [0, 5]);
});

test('a trail that starts after midnight is partial, and says from when', () => {
  const trail = [sample(MIDNIGHT + HOUR_MS, { profit: 0 }), sample(MIDNIGHT + HOUR_MS + 15 * MIN, { profit: 7 })];
  const r = running(trail, 'profit', { from: MIDNIGHT, to: NOW });
  assert.equal(r.partial, MIDNIGHT + HOUR_MS);
  assert.deepEqual(r.points, [{ ts: MIDNIGHT + HOUR_MS, value: 0 }, { ts: MIDNIGHT + HOUR_MS + 15 * MIN, value: 7 }]);
  assert.equal(r.total, 7);
});

test('nothing measured in the window is a null total, never a zero', () => {
  assert.equal(running([], 'profit', { from: MIDNIGHT, to: NOW }).total, null);
  assert.equal(running([sample(MIDNIGHT, { profit: 3 })], 'profit', { from: MIDNIGHT, to: NOW }).total, null);
  assert.equal(running(undefined, 'profit', { from: MIDNIGHT, to: NOW }).total, null);
});

test('steps after `to` are left out, so yesterday can be cut at the same elapsed time', () => {
  const trail = [sample(MIDNIGHT, { profit: 0 }), sample(MIDNIGHT + HOUR_MS, { profit: 5 }), sample(MIDNIGHT + 2 * HOUR_MS, { profit: 9 })];
  assert.equal(running(trail, 'profit', { from: MIDNIGHT, to: MIDNIGHT + HOUR_MS }).total, 5);
});

// ------------------------------------------------------------ onlineDay()
test('players online is a level read at each poll, and a missed stretch breaks the line', () => {
  const trail = [
    sample(MIDNIGHT - 5 * MIN, { onlinePlayers: 3 }),
    sample(MIDNIGHT, { onlinePlayers: 4 }),
    sample(MIDNIGHT + 10 * MIN, { onlinePlayers: 6 }),
    sample(MIDNIGHT + 60 * MIN, { onlinePlayers: 2 }),
    sample(MIDNIGHT + 70 * MIN, { onlinePlayers: '' }),
  ];
  const points = onlineDay(trail, { from: MIDNIGHT, to: NOW, maxGapMs: 20 * MIN });
  assert.deepEqual(points.map((p) => p.value), [4, 6, null, 2]);
});

// ------------------------------------------------------------ todayModel()
const gameTrail = (steps) => {
  // steps: [hourOffset, count, turnover, profit] cumulative readings.
  return steps.map(([h, count, turnover, profit]) => sample(MIDNIGHT + h * HOUR_MS, { count, turnover, profit }));
};
// Every 15 minutes from 23:45 yesterday to 04:00 today, 5 bets, $50 turnover, $2 gross profit each step.
function steady({ from = MIDNIGHT - DAY_MS - 15 * MIN, to = NOW, bets = 5, turnover = 50_000_000, profit = 2_000_000 } = {}) {
  const out = [];
  let c = 1000, t = 10_000_000_000, p = 100_000_000;
  for (let ts = from; ts <= to; ts += 15 * MIN) {
    out.push(sample(ts, { count: c, turnover: t, profit: p }));
    c += bets; t += turnover; p += profit;
  }
  return out;
}
// Readings every 15 minutes from 23:45 yesterday to now, moving only at the listed instants.
function stepped(changes) {
  const out = [];
  let c = 0, t = 0, p = 0;
  for (let ts = MIDNIGHT - 15 * MIN; ts <= NOW; ts += 15 * MIN) {
    const [dc, dt, dp] = changes[ts] ?? [0, 0, 0];
    c += dc; t += dt; p += dp;
    out.push(sample(ts, { count: c, turnover: t, profit: p }));
  }
  return out;
}
const online = (from, to, value = (ts) => 5) => {
  const out = [];
  for (let ts = from; ts <= to; ts += 5 * MIN) out.push(sample(ts, { onlinePlayers: value(ts) }));
  return out;
};
const rows = [
  { name: 'berry', label: 'Berry', online: 3 },
  { name: 'pixel-geyser', label: 'Pixel Geyser', online: 1 },
  { name: 'pixel-nest', label: 'Pixel Nest', pending: true, online: 0 },
];
const model = (over = {}) => todayModel({
  now: NOW, money, rows, online: 4,
  teamTrail: steady(),
  onlineTrail: online(MIDNIGHT - DAY_MS - 30 * MIN, NOW),
  gameTrails: {
    berry: steady({ from: MIDNIGHT - 15 * MIN }),
    // Polled every 15 minutes, quiet but for two steps: 01:30 (10 bets, $100, -$30 gross) and 03:30 (2, $20, -$1).
    'pixel-geyser': stepped({ [MIDNIGHT + 1.5 * HOUR_MS]: [10, 100_000_000, -30_000_000], [MIDNIGHT + 3.5 * HOUR_MS]: [2, 20_000_000, -1_000_000] }),
  },
  ...over,
});

test('today\'s KPIs are the team trail since 00:00Z: studio share of profit, turnover, bets and gross RTP', () => {
  const m = model();
  // 16 steps of 15 minutes from 00:00 to 04:00.
  close(m.kpis.profit.value, 16 * 2 * 0.1);
  close(m.kpis.turnover.value, 16 * 50);
  assert.equal(m.kpis.bets.value, 16 * 5);
  close(m.kpis.rtp.value, (1 - 2 / 50) * 100);
  assert.equal(m.kpis.online.value, 4, 'online now is the live reading');
});

test('each KPI carries the same elapsed slice of yesterday, for the comparison', () => {
  const m = model();
  close(m.kpis.profit.yesterday, 16 * 2 * 0.1);
  close(m.kpis.turnover.yesterday, 16 * 50);
  assert.equal(m.kpis.bets.yesterday, 16 * 5);
  close(m.kpis.rtp.yesterday, 96);
  assert.equal(m.kpis.online.yesterday, 5, 'the reading nearest this time yesterday');
});

test('without a reading at yesterday\'s midnight there is no comparison, not a zero', () => {
  const m = model({ teamTrail: steady({ from: MIDNIGHT - 2 * HOUR_MS }), onlineTrail: online(MIDNIGHT, NOW) });
  assert.equal(m.kpis.profit.yesterday, null);
  assert.equal(m.kpis.bets.yesterday, null);
  assert.equal(m.kpis.online.yesterday, null);
  close(m.kpis.profit.value, 3.2);
});

test('the curve runs today in studio dollars, with yesterday\'s whole day laid on today\'s clock', () => {
  const m = model();
  assert.equal(m.curve.today[0].ts, MIDNIGHT);
  assert.equal(m.curve.today[0].value, 0);
  close(m.curve.today.at(-1).value, 3.2);
  assert.equal(m.curve.today.at(-1).ts, NOW);
  // Yesterday ends at today's midnight + one day, shifted onto today.
  assert.equal(m.curve.yesterday[0].ts, MIDNIGHT);
  assert.equal(m.curve.yesterday.at(-1).ts, MIDNIGHT + DAY_MS);
  close(m.curve.yesterday.at(-1).value, 96 * 2 * 0.1);
});

test('a trail that starts after midnight marks the day partial', () => {
  const m = model({ teamTrail: steady({ from: MIDNIGHT + HOUR_MS }) });
  assert.equal(m.partial, MIDNIGHT + HOUR_MS);
  assert.equal(model().partial, null);
});

test('the day has 24 hour slots: past, the one filling, and the ones still to come', () => {
  const m = model();
  assert.equal(m.hours.length, 24);
  assert.equal(m.hours[0].from, MIDNIGHT);
  assert.deepEqual(m.hours.slice(0, 5).map((h) => h.state), ['closed', 'closed', 'closed', 'closed', 'filling']);
  assert.ok(m.hours.slice(5).every((h) => h.state === 'future' && h.turnoverUsd === null && h.profitUsd === null));
});

test('an hour sums its games, in dollars, the studio share for profit', () => {
  const m = model();
  // 00:00-01:00: berry 4 steps of $50 / $2 gross; pixel-geyser nothing.
  close(m.hours[0].turnoverUsd, 200);
  close(m.hours[0].profitUsd, 0.8);
  assert.equal(m.hours[0].bets, 20);
  // 01:00-02:00: berry $200 plus pixel-geyser's $100 arriving at 01:30.
  close(m.hours[1].turnoverUsd, 300);
  close(m.hours[1].profitUsd, 0.8 - 3);
  close(m.hours[1].byGame['pixel-geyser'].turnoverUsd, 100);
  assert.equal(m.hours[0].byGame['pixel-geyser'].turnoverUsd, 0, 'a watched hour with no play is a measured zero');
});

test('an hour no game measured is null, not a quiet zero', () => {
  const m = model({ gameTrails: { berry: gameTrail([[0, 0, 0, 0], [0.25, 1, 1_000_000, 0], [2.5, 3, 3_000_000, 0]]) } });
  // The 00:15 -> 02:30 step spans the outage: dropped, so hour 1 is unmeasured.
  assert.equal(m.hours[1].turnoverUsd, null);
  assert.equal(m.hours[1].byGame.berry.turnoverUsd, null);
});

test('games are ranked by today\'s turnover, and a game with no reading stays null', () => {
  const m = model();
  assert.deepEqual(m.games.map((g) => g.slug), ['berry', 'pixel-geyser', 'pixel-nest']);
  close(m.games[0].turnoverUsd, 800);
  close(m.games[1].profitUsd, -3.1);
  assert.equal(m.games[2].turnoverUsd, null);
  assert.equal(m.games[0].label, 'Berry');
});

test('players online today, with yesterday laid on today\'s clock', () => {
  const m = model({ onlineTrail: online(MIDNIGHT - DAY_MS - 30 * MIN, NOW, (ts) => (ts >= MIDNIGHT ? 9 : 5)) });
  assert.equal(m.online.today[0].ts, MIDNIGHT);
  assert.ok(m.online.today.every((p) => p.value === 9));
  assert.equal(m.online.yesterday[0].ts, MIDNIGHT);
  assert.ok(m.online.yesterday.every((p) => p.value === 5), 'the 00:00 reading is today\'s, not yesterday\'s');
  assert.equal(m.online.yesterday.at(-1).ts, MIDNIGHT + DAY_MS - 5 * MIN);
});

test('an empty collector yields an empty day, every figure null', () => {
  const m = todayModel({ now: NOW, money, rows: [], online: null, teamTrail: [], onlineTrail: [], gameTrails: {} });
  for (const k of ['profit', 'turnover', 'bets', 'rtp', 'online']) assert.equal(m.kpis[k].value, null, k);
  assert.deepEqual(m.curve.today, []);
  assert.equal(m.hours.length, 24);
  assert.ok(m.hours.every((h) => h.turnoverUsd === null));
});

test('an overnight outage breaks the line at midnight, never before it, and its step still counts', () => {
  const trail = [sample(MIDNIGHT - 2 * HOUR_MS, { profit: 0 }), sample(MIDNIGHT + HOUR_MS, { profit: 30 }), sample(MIDNIGHT + HOUR_MS + 10 * MIN, { profit: 35 })];
  const r = running(trail, 'profit', { from: MIDNIGHT, to: NOW });
  assert.ok(r.points.every((p) => p.ts >= MIDNIGHT));
  assert.deepEqual(r.points.map((p) => p.value), [0, null, 30, 35]);
  assert.equal(r.total, 35);
});
