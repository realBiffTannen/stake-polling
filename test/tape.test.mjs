import { test } from 'node:test';
import assert from 'node:assert/strict';
import { intervals, tape, tapeHeadline, launchChecks } from '../src/insights/tape.mjs';

const U = 1_000_000;              // micro-dollars per dollar
const STEP = 150_000;             // the 2.5-minute grid
const MIN = 60_000;
const t0 = Date.parse('2026-09-22T12:00:00Z');
const now = t0 + 20 * STEP;
const at = (i) => t0 + i * STEP;
// Cumulative game samples from [count, turnoverUsd, profitUsd] triples.
const game = (rows, extra = () => ({})) => rows.map(([c, t, p], i) => ({ ts: at(i), fields: { count: c, turnover: t * U, profit: p * U, ...extra(i) } }));
const mode = (name, rows) => rows.map(([c, t, p], i) => ({ ts: at(i), fields: { [`${name}:count`]: c, [`${name}:turnover`]: t * U, [`${name}:profit`]: p * U } }));

// --------------------------------------------------------------- intervals
test('intervals differences consecutive readings', () => {
  const out = intervals(game([[10, 100, 5], [15, 160, 3]]));
  assert.deepEqual(out, [{ from: at(0), to: at(1), dCount: 5, dTurnover: 60 * U, dProfit: -2 * U }]);
});

test('intervals skips a replica reading below the high-water mark instead of fabricating a jump', () => {
  // 289 -> 286 -> 289 -> 295: the 286 is a lagging replica, not a reset.
  const out = intervals(game([[289, 1000, 10], [286, 990, 10], [289, 1000, 10], [295, 1060, 12]]));
  assert.deepEqual(out.map(i => [i.from, i.to, i.dCount]), [[at(0), at(2), 0], [at(2), at(3), 6]]);
  assert.ok(out.every(i => i.dCount >= 0 && i.dTurnover >= 0), 'nothing negative');
  assert.ok(out.every(i => i.dCount < 100), 'no jump of a whole counter');
});

test('intervals treats a turnover that runs backwards alone as replica lag too', () => {
  const out = intervals(game([[10, 100, 0], [10, 90, 0], [12, 120, 0]]));
  assert.deepEqual(out.map(i => [i.dCount, i.dTurnover]), [[2, 20 * U]]);
});

test('intervals lets profit fall - the house losing is not a counter running backwards', () => {
  const [i] = intervals(game([[10, 100, 50], [11, 110, -500]]));
  assert.equal(i.dProfit, -550 * U);
});

test('intervals never differences across a UTC month boundary', () => {
  const samples = [
    { ts: Date.parse('2026-09-30T23:57:30Z'), fields: { count: 1000, turnover: 5000, profit: 10 } },
    { ts: Date.parse('2026-10-01T00:00:00Z'), fields: { count: 5, turnover: 50, profit: 1 } },
    { ts: Date.parse('2026-10-01T00:02:30Z'), fields: { count: 9, turnover: 80, profit: 2 } },
  ];
  assert.deepEqual(intervals(samples).map(i => [i.dCount, i.dTurnover]), [[4, 30]]);
});

test('intervals skips a sample missing a field rather than reading it as zero, and keeps a genuine zero step', () => {
  const samples = [
    { ts: at(0), fields: { count: 10, turnover: 100, profit: 1 } },
    { ts: at(1), fields: { turnover: 100, profit: 1 } },
    { ts: at(2), fields: { count: null, turnover: 100, profit: 1 } },
    { ts: at(3), fields: { count: 15, turnover: 150, profit: 1 } },
    { ts: at(4), fields: { count: 15, turnover: 150, profit: 1 } },
  ];
  const out = intervals(samples);
  assert.deepEqual(out.map(i => [i.from, i.to, i.dCount]), [[at(0), at(3), 5], [at(3), at(4), 0]]);
});

test('intervals reads prefixed mode fields', () => {
  const out = intervals(mode('BONUS', [[1, 100, 10], [3, 300, -40]]), 'BONUS:');
  assert.deepEqual(out.map(i => [i.dCount, i.dTurnover, i.dProfit]), [[2, 200 * U, -50 * U]]);
});

test('intervals of nothing is nothing', () => {
  assert.deepEqual(intervals(undefined), []);
  assert.deepEqual(intervals([]), []);
  assert.deepEqual(intervals([{ ts: at(0), fields: { count: 1, turnover: 1, profit: 1 } }]), []);
});

// -------------------------------------------------------------------- tape
const run = (gameTrails = {}, modeTrails = {}, over = {}) => tape({ gameTrails, modeTrails, labels: { berry: 'Berry' }, now, ...over });
const kinds = (events) => events.map(e => e.kind);

test('big_stake fires at $500 in a window at $10 a spin, and not a cent under either line', () => {
  assert.deepEqual(kinds(run({ berry: game([[0, 0, 0], [50, 500, 0]]) })), ['big_stake']);
  assert.deepEqual(kinds(run({ berry: game([[0, 0, 0], [50, 499.99, 0]]) })), [], 'turnover under $500');
  assert.deepEqual(kinds(run({ berry: game([[0, 0, 0], [51, 509.99, 0]]) })), [], 'under $10 a spin');
  const [e] = run({ berry: game([[0, 0, 0], [50, 500, 20]]) });
  assert.equal(e.label, 'Berry');
  assert.equal(e.mode, null);
  assert.equal(e.perSpinUsd, 10);
  assert.equal(e.paidUsd, 480);
  assert.match(e.message, /Berry/);
});

test('payout_spike needs players up $250 AND a payout of at least 5x the average stake', () => {
  // 10 bets, $100 staked (avg $10), house -$250: paid $350 >= 5 x $10
  const spike = run({}, { berry: mode('BONUS', [[0, 0, 0], [10, 100, -250]]) });
  assert.deepEqual(kinds(spike), ['payout_spike']);
  assert.equal(spike[0].paidUsd, 350);
  assert.equal(spike[0].mode, 'BONUS');
  assert.equal(spike[0].multiple, 35, 'paid over the average stake');
  assert.deepEqual(kinds(run({}, { berry: mode('BONUS', [[0, 0, 0], [10, 100, -249.99]]) })), [], 'players up a cent under $250');
  // players up $300, but on $2,000 of $1,000 stakes: paid $2,300 < 5 x $1,000
  assert.deepEqual(kinds(run({}, { berry: mode('BONUS', [[0, 0, 0], [2, 2000, -300]]) })), []);
});

test('house_take fires when a mode keeps $250 in a window, and not at $249.99', () => {
  assert.deepEqual(kinds(run({}, { berry: mode('SUPERBONUS', [[0, 0, 0], [5, 600, 250]]) })), ['house_take']);
  assert.deepEqual(kinds(run({}, { berry: mode('SUPERBONUS', [[0, 0, 0], [5, 600, 249.99]]) })), []);
});

test('exact_stake recovers a single buy exactly, with what it paid as a multiple', () => {
  const [e] = run({}, { berry: mode('BONUS', [[4, 400, 10], [5, 500, -40]]) });
  assert.equal(e.kind, 'exact_stake');
  assert.equal(e.dCount, 1);
  assert.equal(e.turnoverUsd, 100);
  assert.equal(e.paidUsd, 150);
  assert.equal(e.multiple, 1.5);
  assert.match(e.message, /exactly \$100\.00/);
});

test('a lagging replica in a mode trail raises nothing on the tape', () => {
  // 10 -> 9 -> 10: were the dip read as a reset, 10 whole bets would appear at once.
  const events = run({}, { berry: mode('BONUS', [[10, 1000, 0], [9, 900, 0], [10, 1000, 0]]) });
  assert.deepEqual(events, []);
});

test('the tape only covers its window and lists the newest first', () => {
  const trail = game([[0, 0, 0], [50, 500, 0], [100, 1000, 0], [150, 1500, 0]]);
  const events = run({ berry: trail });
  assert.equal(events.length, 3);
  assert.ok(events[0].ts > events[1].ts && events[1].ts > events[2].ts);
  assert.equal(run({ berry: trail }, {}, { now: at(3) + 24 * 3_600_000 + 1 }).length, 0, 'all older than 24h');
});

test('the tape of no trails is empty', () => {
  assert.deepEqual(tape({ now }), []);
  assert.deepEqual(run({ berry: [] }, { berry: undefined }), []);
});

test('tapeHeadline counts each kind and names the biggest payout', () => {
  const events = [
    ...run({ berry: game([[0, 0, 0], [50, 500, 0]]) }),
    ...run({}, { berry: mode('BONUS', [[0, 0, 0], [10, 100, -250]]) }),
    ...run({}, { berry: mode('BONUS', [[4, 400, 10], [5, 500, -40]]) }),
  ];
  const h = tapeHeadline(events);
  assert.match(h, /1 big stake, 1 payout spike, 1 exact buy stake/);
  assert.match(h, /Biggest payout: Berry BONUS paid \$350\.00/);
});

test('tapeHeadline says a quiet tape is quiet, and says nothing over nothing measured', () => {
  assert.match(tapeHeadline([]), /Nothing crossed/);
  assert.equal(tapeHeadline([], { measured: false }), null);
});

// ---------------------------------------------------------- launch checks
const check = (out, name) => out.find(c => c.check === name);
const ladder = (cheap, rest) => [{ costUSD: 0, betCount: 99999, betTurnover: 1 }, { costUSD: 0.1, betCount: cheap, betTurnover: cheap * 0.1 }, { costUSD: 1, betCount: rest, betTurnover: rest }];

test('ladder_stuck flags 90% of bets at the cheapest non-zero size, from 500 bets', () => {
  assert.equal(check(launchChecks({ betStats: ladder(450, 50) }), 'ladder_stuck').status, 'flag');
  assert.equal(check(launchChecks({ betStats: ladder(449, 51) }), 'ladder_stuck').status, 'ok');
  assert.equal(check(launchChecks({ betStats: ladder(449, 50) }), 'ladder_stuck').status, 'unknown', '499 bets');
  assert.equal(check(launchChecks({}), 'ladder_stuck').status, 'unknown', 'no betStats');
});

const rows = (base, buys) => [{ mode: 'BASE', cost: 1, count: base, turnover: base * U }, { mode: 'BONUS', cost: 100, count: buys, turnover: (buys ?? 0) * 100 * U }];

test('no_buys flags 800 base rounds with no buy at all', () => {
  assert.equal(check(launchChecks({ modeRows: rows(800, 0) }), 'no_buys').status, 'flag');
  assert.equal(check(launchChecks({ modeRows: rows(800, 1) }), 'no_buys').status, 'ok');
  assert.equal(check(launchChecks({ modeRows: rows(799, 0) }), 'no_buys').status, 'unknown', 'too few base rounds to say');
  assert.equal(check(launchChecks({ modeRows: rows(900, null) }), 'no_buys').status, 'unknown', 'an unmeasured buy count is not zero buys');
  assert.equal(check(launchChecks({}), 'no_buys').status, 'unknown');
});

test('avg_stake_low flags a game staking under half the studio average', () => {
  const r = [{ mode: 'BASE', cost: 1, count: 300, turnover: 300 * 0.49 * U }];
  assert.equal(check(launchChecks({ modeRows: r, studioAvgBetUsd: 1, studioTurnoverUsd: 1000 }), 'avg_stake_low').status, 'flag');
  const half = [{ mode: 'BASE', cost: 1, count: 300, turnover: 300 * 0.5 * U }];
  assert.equal(check(launchChecks({ modeRows: half, studioAvgBetUsd: 1, studioTurnoverUsd: 1000 }), 'avg_stake_low').status, 'ok', 'exactly half is not under half');
  const few = [{ mode: 'BASE', cost: 1, count: 299, turnover: 1 * U }];
  assert.equal(check(launchChecks({ modeRows: few, studioAvgBetUsd: 1 }), 'avg_stake_low').status, 'unknown');
  assert.equal(check(launchChecks({ modeRows: r, studioAvgBetUsd: null }), 'avg_stake_low').status, 'unknown');
  assert.equal(check(launchChecks({ modeRows: r, studioAvgBetUsd: 1, studioTurnoverUsd: 199 }), 'avg_stake_low').status, 'unknown', 'baseline too thin');
});

// Steady 100 bets a minute (250 a 2.5-min tick) with 20 online, then a cliff.
function cliffTrail({ lastPerTick = 25, lastOnline = 5, ticks = 12 } = {}) {
  const samples = [];
  let count = 0;
  for (let i = 0; i <= ticks; i++) {
    const last = i >= ticks - 1;
    if (i > 0) count += last ? lastPerTick : 250;
    samples.push({ ts: at(i), fields: { count, turnover: count * U, profit: 0, onlinePlayers: last ? lastOnline : 20 } });
  }
  return samples;
}

test('traffic_cliff flags a collapse in bet rate that the online count confirms', () => {
  const trail = cliffTrail();
  assert.equal(check(launchChecks({ gameTrail: trail, now: trail.at(-1).ts }), 'traffic_cliff').status, 'flag');
});

test('traffic_cliff stays ok when players are still online - rounds arrive in batches', () => {
  const trail = cliffTrail({ lastOnline: 18 });
  assert.equal(check(launchChecks({ gameTrail: trail, now: trail.at(-1).ts }), 'traffic_cliff').status, 'ok');
});

test('traffic_cliff cannot judge thin traffic, a short trail, or a stale one', () => {
  const thin = cliffTrail().map(s => ({ ...s, fields: { ...s.fields, count: Math.floor(s.fields.count / 10) } }));
  assert.equal(check(launchChecks({ gameTrail: thin, now: thin.at(-1).ts }), 'traffic_cliff').status, 'unknown');
  const short = cliffTrail({ ticks: 6 });
  assert.equal(check(launchChecks({ gameTrail: short, now: short.at(-1).ts }), 'traffic_cliff').status, 'unknown');
  const trail = cliffTrail();
  assert.equal(check(launchChecks({ gameTrail: trail, now: trail.at(-1).ts + 60 * MIN }), 'traffic_cliff').status, 'unknown');
});

test('launchChecks always answers all four checks', () => {
  assert.deepEqual(launchChecks({}).map(c => c.check), ['ladder_stuck', 'no_buys', 'avg_stake_low', 'traffic_cliff']);
  assert.ok(launchChecks({}).every(c => c.status === 'unknown' && c.message));
});

// ------------------------------------------------------ view helpers
import { notable, checksHeadline } from '../src/insights/tape.mjs';

test('notable keeps every big stake, spike and take, but exact stakes only in feature-buy modes', () => {
  const ev = [{ kind: 'exact_stake', slug: 'berry', mode: 'BASE' }, { kind: 'exact_stake', slug: 'berry', mode: 'SUPERBONUS' },
    { kind: 'exact_stake', slug: 'berry', mode: 'UNKNOWN' }, { kind: 'house_take', slug: 'berry', mode: 'BASE' }, { kind: 'big_stake', slug: 'berry', mode: null }];
  const costOf = (slug, mode) => ({ BASE: 1, SUPERBONUS: 500 })[mode] ?? null;
  assert.deepEqual(notable(ev, costOf).map(e => `${e.kind}:${e.mode}`), ['exact_stake:SUPERBONUS', 'house_take:BASE', 'big_stake:null']);
});

test('checksHeadline names the flagged checks, and says so when none can be judged', () => {
  assert.match(checksHeadline([{ check: 'no_buys', status: 'flag', message: 'm' }, { check: 'ladder_stuck', status: 'ok', message: 'm' }]), /1 of 2 launch checks flag: no buys/);
  assert.match(checksHeadline([{ check: 'no_buys', status: 'ok' }, { check: 'traffic_cliff', status: 'unknown' }]), /No launch check flags; 1 cannot be judged yet/);
  assert.equal(checksHeadline([]), null);
});
