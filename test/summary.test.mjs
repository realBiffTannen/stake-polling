import { test } from 'node:test';
import assert from 'node:assert/strict';
import { buildSummary } from '../src/summary.mjs';

const MIN = 60000;
const USD = 1_000_000;
const T0 = Date.parse('2026-09-16T14:00:00Z');

/** `perMin` dollars of turnover a minute, for `n` minutes from T0. */
const trail = (n, perMin, perMinCount = 10, perMinProfit = 3) =>
  Array.from({ length: n }, (_, i) => ({
    ts: T0 + i * MIN,
    fields: { turnover: perMin * USD * i, count: perMinCount * i, profit: perMinProfit * USD * i },
  }));

test('the summary totals the window across the roster', () => {
  const trails = { online: [], team: [], games: { alpha: trail(6, 100), beta: trail(6, 50) } };
  const s = buildSummary(trails, [], { from: T0, to: T0 + 5 * MIN });

  assert.equal(s.turnover, 150 * USD * 5, 'five minutes of 100 + 50 dollars a minute');
  assert.equal(s.count, 100);
  assert.equal(s.minutes, 5);
  assert.equal(s.activeGames, 2);
});

test('the top mover is the game that moved the most turnover', () => {
  const trails = { online: [], team: [], games: { quiet: trail(6, 10), loud: trail(6, 900) } };
  const s = buildSummary(trails, [], { from: T0, to: T0 + 5 * MIN });
  assert.equal(s.topMover, 'loud');
  assert.equal(s.topMoverTurnover, 900 * USD * 5);
});

test('alerts raised in the window are counted by severity and kind', () => {
  const alerts = [
    { severity: 'crit', kind: 'spike' },
    { severity: 'warn', kind: 'spike' },
    { severity: 'warn', kind: 'share_shift' },
  ];
  const s = buildSummary({ games: {} }, alerts, { from: T0, to: T0 + 5 * MIN });
  assert.equal(s.alerts, 3);
  assert.equal(s.crits, 1);
  assert.equal(s.warns, 2);
  assert.equal(s.kinds, 'spike,share_shift');
});

test('samples outside the window are excluded', () => {
  const trails = { online: [], team: [], games: { alpha: trail(20, 100) } };
  const s = buildSummary(trails, [], { from: T0 + 10 * MIN, to: T0 + 15 * MIN });
  assert.equal(s.turnover, 100 * USD * 5, 'only the five minutes inside the window');
});

test('a game that did nothing is not counted as active', () => {
  const flat = Array.from({ length: 6 }, (_, i) => ({ ts: T0 + i * MIN, fields: { turnover: 500 * USD, count: 7, profit: 0 } }));
  const trails = { online: [], team: [], games: { busy: trail(6, 100), idle: flat } };
  const s = buildSummary(trails, [], { from: T0, to: T0 + 5 * MIN });
  assert.equal(s.activeGames, 1);
  assert.equal(s.topMover, 'busy');
});

test('online players is the latest reading, not a sum', () => {
  const online = [
    { ts: T0, fields: { onlinePlayers: 10 } },
    { ts: T0 + MIN, fields: { onlinePlayers: 14 } },
  ];
  const s = buildSummary({ online, games: {} }, [], { from: T0, to: T0 + 5 * MIN });
  assert.equal(s.onlinePlayers, 14);
});

test('an empty window summarises to zeroes rather than throwing', () => {
  const s = buildSummary({ games: {} }, [], { from: T0, to: T0 + 5 * MIN });
  assert.equal(s.turnover, 0);
  assert.equal(s.topMover, null);
  assert.equal(s.activeGames, 0);
});
