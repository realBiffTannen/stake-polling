import { test } from 'node:test';
import assert from 'node:assert/strict';
import { C } from '../src/tui/format.mjs';
import { boxer, visible } from '../src/tui/layout.mjs';
import { buildState } from '../src/tui/state.mjs';
import { buildModeRows } from '../src/tui/mode-rows.mjs';
import { initialNav, LEVEL } from '../src/tui/nav.mjs';
import { renderRoster } from '../src/tui/views/roster.mjs';
import { renderGame } from '../src/tui/views/game.mjs';
import { renderMode } from '../src/tui/views/mode.mjs';
import { renderCompare } from '../src/tui/views/compare.mjs';
import { renderBuckets } from '../src/tui/views/buckets.mjs';
import { metroGameStats } from './fixtures/live.mjs';

// A loss has to be findable at a glance in a table of a dozen games: every
// PROFIT cell the terminal draws is red below zero, in every view.

const WIDTH = 160;
const NOW = Date.parse('2026-09-16T15:00:00Z');
const at = (iso) => Date.parse(iso);
const config = {
  money: { unitsPerDollar: 1_000_000, profitShare: 0.1, expectedShare: 0.075 },
  dayBoundaryUtcHour: 12,
  pollMinutes: 5,
};
const red = (text) => `${C.red}${text}${C.reset}`;
const green = (text) => `${C.green}${text}${C.reset}`;
const fitsBox = (lines) => { for (const line of lines) assert.equal(visible(line), WIDTH, line); };

test('the roster paints a losing PROFIT, PROFIT/rate and DAY PROFIT red, and a winning one green', () => {
  const dashboard = {
    meta: { last_ok: String(NOW) },
    roster: { ok: true, data: [
      { slug: 'berry', stats: { count: 10, turnover: 9_000_000_000, profit: -500_000_000 } },
      { slug: 'lunar-blossom', stats: { count: 10, turnover: 8_000_000_000, profit: 300_000_000 } },
    ] },
  };
  const trails = { online: [], games: {
    berry: [
      { ts: at('2026-09-16T12:30:00Z'), fields: { profit: -100_000_000 } },
      { ts: at('2026-09-16T14:50:00Z'), fields: { profit: -300_000_000 } },
      { ts: at('2026-09-16T14:55:00Z'), fields: { profit: -500_000_000 } },
    ],
    'lunar-blossom': [
      { ts: at('2026-09-16T14:50:00Z'), fields: { profit: 250_000_000 } },
      { ts: at('2026-09-16T14:55:00Z'), fields: { profit: 300_000_000 } },
    ],
  } };
  const state = { ...buildState(dashboard, trails, NOW, config), nav: initialNav() };
  const lines = renderRoster(state, boxer(WIDTH), WIDTH, 20);
  fitsBox(lines);

  const berry = lines.find((l) => l.includes('berry'));
  assert.ok(berry.includes(red('-$50.00')), 'month-to-date PROFIT');
  assert.ok(berry.includes(red('-$20.00')), 'PROFIT per poll');
  assert.ok(berry.includes(red('-$40.00')), 'DAY PROFIT');

  const lantern = lines.find((l) => l.includes('lunar-blossom'));
  assert.ok(lantern.includes(green('$30.00')));
  assert.ok(lantern.includes(green('+$5.00')));
  assert.ok(!lantern.includes(C.red), 'nothing about a game in profit is red');
});

const metroRows = buildModeRows({
  snapshot: { ok: true, data: metroGameStats },
  modeTrail: [],
  gameRow: { name: 'metro-night-run', turnover: 19_042_500_000, count: 55_462, profit: -103_087_500 },
  now: NOW, config, mathModel: {}, slug: 'metro-night-run',
});

const gameState = (tab, modeRows = metroRows) => ({
  now: NOW, money: config.money, pollMinutes: 5, rateLabel: '/5m',
  gameTrails: {}, modeTrails: {}, mathModel: {}, modeRows,
  nav: { ...initialNav(), level: LEVEL.GAME, game: 'metro-night-run', tab },
});

test('the HEALTH tab paints a losing mode red', () => {
  const lines = renderGame(gameState('health'), boxer(WIDTH), WIDTH, 20);
  fitsBox(lines);
  assert.ok(lines.find((l) => l.includes('BASE')).includes(red('-$42.00')));
  assert.ok(lines.find((l) => l.includes('ANTE')).includes(green('+$20.52')));
});

test('the LIVE and TODAY tabs paint a losing mode red', () => {
  const rows = [{ ...metroRows[0], dProfit: -2_000_000, dayProfit: -30_000_000 }];
  const live = renderGame(gameState('live', rows), boxer(WIDTH), WIDTH, 20);
  const today = renderGame(gameState('today', rows), boxer(WIDTH), WIDTH, 20);
  fitsBox(live);
  fitsBox(today);
  assert.ok(live.find((l) => l.includes('BASE')).includes(red('-$0.20')));
  assert.ok(today.find((l) => l.includes('BASE')).includes(red('-$3.00')));
});

test('the bet-mode card paints every losing profit figure red', () => {
  const rows = [{ ...metroRows[0], dProfit: -2_000_000, dayProfit: -30_000_000 }];
  const state = { ...gameState('health', rows), nav: { ...initialNav(), level: LEVEL.MODE, game: 'metro-night-run', mode: 'BASE', bucket: '1h' } };
  const text = renderMode(state, boxer(WIDTH), WIDTH, 20).join('\n');
  assert.ok(text.includes(red('-$42.00')), 'month-to-date profit');
  assert.ok(text.includes(red('-$0.20')), 'profit per poll');
  assert.ok(text.includes(red('-$3.00')), 'today profit');
});

test('the compare screen paints a losing game red', () => {
  const state = {
    now: NOW, money: config.money, config, modeTrails: {}, mathModel: {},
    perGame: { 'metro-night-run': { ok: true, data: metroGameStats } },
    rows: [{ name: 'metro-night-run', turnover: 19_042_500_000, count: 55_462, profit: -103_087_500 }],
    nav: { ...initialNav(), level: LEVEL.COMPARE, compareMode: 'BASE' },
  };
  const lines = renderCompare(state, boxer(WIDTH), WIDTH, 20);
  fitsBox(lines);
  assert.ok(lines.find((l) => l.includes('metro-night-run')).includes(red('-$42.00')));
});

test('the bucket table paints a losing bucket red', () => {
  const base = at('2026-09-16T14:00:00Z');
  const state = {
    now: base + 12 * 60000, money: config.money, focus: 'berry', bucket: '5m', modeTrails: {},
    gameTrails: { berry: [
      { ts: base, fields: { profit: 1_000_000_000 } },
      { ts: base + 5 * 60000, fields: { profit: 900_000_000 } },
      { ts: base + 10 * 60000, fields: { profit: 950_000_000 } },
    ] },
  };
  const lines = renderBuckets(state, boxer(WIDTH), WIDTH, 12);
  fitsBox(lines);
  // The header carries the span ("14:05-14:12 UTC") - match the bucket rows only.
  const bucketRow = (label) => lines.find((l) => l.startsWith(`│ ${label} `));
  // Grid-stamped samples: the step arriving at 14:05 covers 14:00-14:05, the
  // one arriving at 14:10 covers 14:05-14:10.
  assert.ok(bucketRow('14:00').includes(red('-$10.00')));
  assert.ok(bucketRow('14:05').includes(green('+$5.00')));
});
