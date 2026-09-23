import { test } from 'node:test';
import assert from 'node:assert/strict';
import { spanOf, spanStart, SPANS, GAME_SPANS, gameRowsOver, modeRowsOver } from '../src/insights/span.mjs';

const money = { unitsPerDollar: 1_000_000, profitShare: 0.1, expectedShare: 0.075 };
const M = 60000;

test('spanOf accepts every span and defaults to the month', () => {
  assert.deepEqual(Object.keys(SPANS), ['10m', '1h', '3h', '6h', '24h', '3d', 'today', 'month'], 'shortest first');
  for (const span of Object.keys(SPANS)) assert.equal(spanOf(span), span);
  assert.equal(spanOf('nonsense'), 'month');
  assert.equal(spanOf(null), 'month');
  assert.equal(spanOf('hasOwnProperty'), 'month');
});

test('spanOf narrowed to the game page\'s spans turns anything longer back to the month', () => {
  assert.deepEqual(GAME_SPANS, ['24h', 'today', 'month']);
  assert.equal(spanOf('24h', GAME_SPANS), '24h');
  assert.equal(spanOf('3d', GAME_SPANS), 'month');
  assert.equal(spanOf('1h', GAME_SPANS), 'month');
});

test('every rolling span starts exactly its hours back', () => {
  const now = Date.parse('2026-09-22T01:00:00Z');
  assert.equal(spanStart('10m', now), Date.parse('2026-09-22T00:50:00Z'));
  assert.equal(spanStart('1h', now), Date.parse('2026-09-22T00:00:00Z'));
  assert.equal(spanStart('3h', now), Date.parse('2026-09-21T22:00:00Z'));
  assert.equal(spanStart('6h', now), Date.parse('2026-09-21T19:00:00Z'));
  assert.equal(spanStart('3d', now), Date.parse('2026-09-19T01:00:00Z'));
});

test('Today starts at 00:00:00Z whatever the time, and Last 24h is exactly 24 hours back', () => {
  const now = Date.parse('2026-09-22T01:00:00Z');
  assert.equal(spanStart('today', now), Date.parse('2026-09-22T00:00:00Z'), 'one hour of data at 01:00Z');
  assert.equal(spanStart('24h', now), Date.parse('2026-09-21T01:00:00Z'));
  assert.equal(spanStart('month', now), null, 'the month comes from the API, not the trail');
});

// Off the 2.5-minute grid on purpose: which side of the boundary a step lands
// on at exactly 00:00:00.000 is window.mjs's concern and tested there.
const now = Date.parse('2026-09-22T01:00:00Z');
const from = Date.parse('2026-09-22T00:00:00Z');
const trail = [
  { ts: from - 10 * M, fields: { count: 100, turnover: 1_000_000_000, profit: 50_000_000 } },
  { ts: from + 10 * M, fields: { count: 110, turnover: 1_100_000_000, profit: 40_000_000 } },
  { ts: from + 40 * M, fields: { count: 130, turnover: 1_300_000_000, profit: 60_000_000 } },
];

test('gameRowsOver turns a trail into a roster-shaped row for the span, in studio-share USD', () => {
  const [row] = gameRowsOver([{ name: 'berry', label: 'Berry' }], { berry: trail }, from, money);
  assert.equal(row.name, 'berry');
  assert.equal(row.label, 'Berry');
  assert.equal(row.count, 30);
  assert.equal(row.turnover, 300_000_000);
  assert.equal(row.turnoverUsd, 300);
  assert.equal(row.profit, 10_000_000, 'raw gross');
  assert.equal(row.profitUsd, 1, '$10 gross -> $1 studio share');
});

test('gameRowsOver leaves a game with no trail unmeasured, not zero', () => {
  const [row] = gameRowsOver([{ name: 'navy', label: 'Pixel Nest' }], {}, from, money);
  assert.equal(row.count, null);
  assert.equal(row.profitUsd, null);
});

test('modeRowsOver builds per-mode rows from the mode trail, taking each mode\'s cost from the month response', () => {
  const modeTrail = [
    { ts: from - 10 * M, fields: { 'BASE:count': 10, 'BASE:turnover': 100, 'BASE:profit': 5 } },
    { ts: from + 10 * M, fields: { 'BASE:count': 15, 'BASE:turnover': 150, 'BASE:profit': 4, 'BONUS:count': 1, 'BONUS:turnover': 200, 'BONUS:profit': -50 } },
    { ts: from + 40 * M, fields: { 'BASE:count': 25, 'BASE:turnover': 250, 'BASE:profit': 9, 'BONUS:count': 3, 'BONUS:turnover': 600, 'BONUS:profit': 100 } },
  ];
  const rows = modeRowsOver(modeTrail, from, [{ mode: 'BASE', cost: 1, rtp: 0.965 }, { mode: 'BONUS', cost: 100, rtp: 0.965 }]);
  const base = rows.find(r => r.mode === 'BASE');
  const bonus = rows.find(r => r.mode === 'BONUS');
  assert.deepEqual([base.count, base.turnover, base.profit, base.cost], [15, 150, 4, 1]);
  // BONUS first appears inside the span: its first reading is a baseline, not a jump from zero.
  assert.deepEqual([bonus.count, bonus.turnover, bonus.profit, bonus.cost], [2, 400, 150, 100]);
});

test('modeRowsOver carries each mode\'s deployed RTP - configuration, not a period figure - and null when unlisted', () => {
  const trail = [{ ts: from - 10 * M, fields: { 'BASE:count': 1, 'BASE:turnover': 1, 'BASE:profit': 1, 'GONE:count': 1, 'GONE:turnover': 1, 'GONE:profit': 1 } },
    { ts: from + 10 * M, fields: { 'BASE:count': 2, 'BASE:turnover': 2, 'BASE:profit': 2, 'GONE:count': 2, 'GONE:turnover': 2, 'GONE:profit': 2 } }];
  const rows = modeRowsOver(trail, from, [{ mode: 'BASE', cost: 1, rtp: 0.965 }]);
  assert.equal(rows.find(r => r.mode === 'BASE').rtp, 0.965);
  assert.equal(rows.find(r => r.mode === 'GONE').rtp, null);
});

test('modeRowsOver on an empty trail has no rows', () => {
  assert.deepEqual(modeRowsOver([], from, []), []);
  assert.deepEqual(modeRowsOver(undefined, from, []), []);
});
