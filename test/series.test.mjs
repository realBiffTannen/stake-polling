import { test } from 'node:test';
import assert from 'node:assert/strict';
import { onlineSlots, thinMax, onlineHeadline, movingAverage, cumulative, weekOnWeek, hourOfDay, turnoverByGame } from '../src/insights/series.mjs';

const SLOT = 150_000, H = 3_600_000;
const now = Date.parse('2026-09-22T12:01:00Z');
const at = (iso, online) => ({ ts: Date.parse(iso), fields: online === undefined ? {} : { onlinePlayers: online } });

// ------------------------------------------------------------ online slots
test('onlineSlots gives one point per 2.5-minute grid slot, oldest first, ending at the slot holding now', () => {
  const points = onlineSlots([], { now, hours: 1 });
  assert.equal(points.length, 24 + 1, 'an hour of slots plus the one in progress');
  assert.equal(points.at(-1).ts, Date.parse('2026-09-22T12:00:00Z'));
  assert.equal(points[0].ts, Date.parse('2026-09-22T11:00:00Z'));
  assert.ok(points.every(p => p.value === null), 'no samples: every slot unmeasured, never zero');
});

test('a slot takes the last reading inside it; a missing reading is skipped and a measured zero kept', () => {
  const samples = [at('2026-09-22T11:55:00Z', 4), at('2026-09-22T11:56:10Z', 6), at('2026-09-22T11:57:30Z'), at('2026-09-22T12:00:00Z', 0)];
  const points = onlineSlots(samples, { now, hours: 0.1 });
  const byTime = Object.fromEntries(points.map(p => [new Date(p.ts).toISOString().slice(11, 19), p.value]));
  assert.equal(byTime['11:55:00'], 6, 'two readings, the later one wins');
  assert.equal(byTime['11:57:30'], null, 'a sample without the field is not a zero');
  assert.equal(byTime['12:00:00'], 0);
});

test('thinMax folds points into wider buckets by their peak, so a long range keeps its highs', () => {
  const points = [0, 1, 2, 3, 4, 5].map(i => ({ ts: i * SLOT, value: [1, 9, null, null, 2, null][i] }));
  assert.deepEqual(thinMax(points, 3 * SLOT).map(p => p.value), [9, 2]);
  assert.deepEqual(thinMax([{ ts: 0, value: null }], SLOT).map(p => p.value), [null]);
});

test('onlineHeadline names the peak, the low, now, and now against the same time yesterday', () => {
  const points = [
    { ts: now - 24 * H - 60_000, value: 12 }, { ts: now - 10 * H, value: 26 }, { ts: now - 2 * H, value: 1 }, { ts: now - 60_000, value: 7 },
  ];
  const h = onlineHeadline(points, { now });
  assert.match(h, /Peak 26 online at 02:01Z/);
  assert.match(h, /low 1 at 10:01Z/);
  assert.match(h, /7 online now, against 12 at this time yesterday/);
  assert.equal(onlineHeadline([{ ts: now, value: null }], { now }), null);
});

// --------------------------------------------------------- daily helpers
test('movingAverage is a trailing mean over measured days, null until enough of the window is measured', () => {
  assert.deepEqual(movingAverage([1, 2, 3, null, 5], 3, 2), [null, 1.5, 2, 2.5, 4]);
  assert.deepEqual(movingAverage([0, 0], 2, 1), [0, 0], 'measured zeros are averaged, not skipped');
});

test('cumulative runs a total that a gap breaks but does not reset', () => {
  assert.deepEqual(cumulative([1, null, -3, 0]), [1, null, -2, -2]);
});

test('weekOnWeek compares the last 7 complete days with the 7 before, leaving today out', () => {
  const days = Array.from({ length: 15 }, (_, i) => ({ date: `2026-09-${String(i + 8).padStart(2, '0')}`, turnover: i < 7 ? 100 : 150, measured: true, current: i === 14 }));
  assert.match(weekOnWeek(days, 'turnover', { noun: 'Turnover', fmt: (v) => `$${v}` }), /Turnover averaged \$150 a day over the last 7 complete days, up 50% on the 7 before/);
  assert.match(weekOnWeek(days.slice(10), 'turnover', { noun: 'Turnover', fmt: String }), /not enough for a week-on-week comparison/);
});

// --------------------------------------------------------- hour of day
test('hourOfDay averages each UTC hour of the day across the trail, and names the busiest and quietest', () => {
  const base = Date.parse('2026-09-20T00:00:00Z');
  const trail = [];
  let count = 0;
  for (let i = 0; i <= 48 * 4; i++) {
    const ts = base + i * 15 * 60_000;
    count += new Date(ts - 1).getUTCHours() === 3 ? 30 : 1; // the step arriving at ts covers the interval ending at ts
    trail.push({ ts, fields: { count } });
  }
  const { rows, headline } = hourOfDay(trail, 'count', { now: base + 48 * H, days: 2 });
  assert.equal(rows.length, 24);
  assert.equal(rows[3].value, 4 * 30, 'four 15-minute steps of 30 in hour 03');
  assert.match(headline, /Busiest hour of the day: 03:00Z/);
});

// --------------------------------------------------------- by game, daily
test('turnoverByGame stacks the seven biggest games by day and folds the rest into Other', () => {
  const day = (rows) => ({ rows: rows.map(([slug, t]) => ({ slug, name: slug.toUpperCase(), stats: { turnover: t * 1e6 } })) });
  const snapshot = { days: { '2026-09-20': day([['a', 10], ['b', 5], ['c', 1], ['d', 1], ['e', 1], ['f', 1], ['g', 1], ['h', 1], ['i', 1]]), '2026-09-21': day([['a', 20]]) } };
  const out = turnoverByGame(snapshot, { from: '2026-09-20', to: '2026-09-21', money: { unitsPerDollar: 1e6 } });
  assert.deepEqual(out.dates, ['2026-09-20', '2026-09-21']);
  assert.equal(out.keys.length, 8, 'seven games plus Other');
  assert.equal(out.keys.at(-1), 'Other');
  assert.equal(out.rows[0].A, 10);
  assert.equal(out.rows[0].Other, 2, 'two one-dollar games folded');
  assert.equal(out.rows[1].B, null, 'a game absent from a synced day is unmeasured, not zero');
  assert.match(out.headline, /A took the most turnover/);
});

test('turnoverByGame lists every game in the window, biggest first, for a legend to pick from', () => {
  const day = (rows) => ({ rows: rows.map(([slug, t]) => ({ slug, name: slug.toUpperCase(), stats: { turnover: t * 1e6 } })) });
  const snapshot = { days: { '2026-09-20': day([['a', 10], ['b', 5], ['c', 1], ['d', 1], ['e', 1], ['f', 1], ['g', 1], ['h', 3], ['i', 1]]), '2026-09-21': day([['a', 20], ['i', 2]]) } };
  const out = turnoverByGame(snapshot, { from: '2026-09-20', to: '2026-09-21', money: { unitsPerDollar: 1e6 } });
  assert.equal(out.games.length, 9, 'all nine games, not just the seven with a layer');
  assert.deepEqual(out.games.slice(0, 3).map((g) => g.slug), ['a', 'b', 'h']);
  assert.deepEqual(out.games[0], { slug: 'a', name: 'A', total: 30, share: 30 / 46 });
  assert.equal(out.focus, null);
});

test('turnoverByGame focused on one game draws that game alone, even one folded into Other', () => {
  const day = (rows) => ({ rows: rows.map(([slug, t]) => ({ slug, name: slug.toUpperCase(), stats: { turnover: t * 1e6 } })) });
  const snapshot = { days: { '2026-09-20': day([['a', 10], ['b', 5], ['c', 1], ['d', 1], ['e', 1], ['f', 1], ['g', 1], ['h', 1], ['i', 1]]), '2026-09-21': day([['a', 20]]) } };
  const out = turnoverByGame(snapshot, { from: '2026-09-20', to: '2026-09-21', money: { unitsPerDollar: 1e6 }, focus: 'i' });
  assert.equal(out.focus, 'i');
  assert.deepEqual(out.keys, ['I']);
  assert.deepEqual(out.rows, [{ I: 1 }, { I: null }], 'a day the game was absent stays unmeasured');
  assert.match(out.headline, /^I took \$1\.00 of turnover over these 2 days, 2\.4% of all games' turnover\.$/);
  assert.equal(out.games.length, 9, 'the legend still lists every game');
});

test('turnoverByGame ignores a focus on a game with no turnover in the window', () => {
  const snapshot = { days: { '2026-09-20': { rows: [{ slug: 'a', name: 'A', stats: { turnover: 5e6 } }] } } };
  const out = turnoverByGame(snapshot, { from: '2026-09-20', to: '2026-09-20', money: { unitsPerDollar: 1e6 }, focus: 'nope' });
  assert.equal(out.focus, null);
  assert.deepEqual(out.keys, ['A']);
});
