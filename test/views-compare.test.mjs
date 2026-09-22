import { test } from 'node:test';
import assert from 'node:assert/strict';
import { renderCompare, compareModes } from '../src/tui/views/compare.mjs';
import { boxer } from '../src/tui/layout.mjs';
import { initialNav, LEVEL } from '../src/tui/nav.mjs';
import { metroGameStats, gameStats } from './fixtures/live.mjs';

const ESC = String.fromCharCode(27);
const strip = (s) => s.replace(new RegExp(`${ESC}\\[[0-9;]*m`, 'g'), '');
const WIDTH = 110;
const config = { money: { unitsPerDollar: 1_000_000, profitShare: 0.1, expectedShare: 0.075 }, dayBoundaryUtcHour: 12 };

const perGame = {
  'metro-night-run': { ok: true, data: metroGameStats },
  'pixel-carnivals': { ok: true, data: gameStats },
};

const stateFor = (mode) => ({
  now: Date.parse('2026-09-16T15:00:00Z'),
  money: config.money,
  perGame,
  modeTrails: {},
  mathModel: {},
  config,
  rows: [
    { name: 'metro-night-run', turnover: 19_042_500_000, count: 55_462, profit: -103_087_500 },
    { name: 'pixel-carnivals', turnover: 11_375_810_600, count: 13_714, profit: 1_152_644_275 },
  ],
  nav: { ...initialNav(), level: LEVEL.COMPARE, compareMode: mode },
});

test('compareModes is the union of every game modes, in canonical order', () => {
  const modes = compareModes(perGame);
  assert.equal(modes[0], 'BASE', 'BASE always leads');
  assert.ok(modes.includes('ANTE'));
  assert.ok(modes.includes('FREE_SPINS'), 'a mode only one game runs is still comparable');
  assert.deepEqual(modes, [...new Set(modes)], 'no duplicates across games');
});

test('every line is exactly the box width', () => {
  const lines = renderCompare(stateFor('BASE'), boxer(WIDTH), WIDTH, 20).map(strip);
  for (const line of lines) assert.equal(line.length, WIDTH, line);
});

test('the header names the mode being compared', () => {
  const head = renderCompare(stateFor('BASE'), boxer(WIDTH), WIDTH, 20).map(strip)[0];
  assert.match(head, /BASE/);
});

test('both games appear for a mode they both run', () => {
  const body = renderCompare(stateFor('BASE'), boxer(WIDTH), WIDTH, 20).map(strip).join('\n');
  assert.match(body, /metro-night-run/);
  assert.match(body, /pixel-carnivals/);
});

// --- a money VALUE, pinned (review finding #10) -----------------------
//
// No test here previously asserted a money VALUE - every check above is a
// presence/absence check on a game name. `turnoverUsd`/`profitUsd` on a
// compare row are ALREADY dollars (`buildModeRows` converts them); a future
// edit that routed them back through a raw-micro-dollars conversion would
// have passed every existing test in this file.
test('turnover and profit render as actual converted dollars, not raw micro-dollars', () => {
  const body = renderCompare(stateFor('BASE'), boxer(WIDTH), WIDTH, 20).map(strip).join('\n');
  // metro-night-run BASE: turnover 12_000_000_000 raw = $12,000.00;
  // profit -420_000_000 raw x the 10% studio share = -$42.00.
  assert.match(body, /\$12,000\.00/, 'turnover must be $12,000.00, not a raw-units figure');
  assert.match(body, /-\$42\.00/, 'profit must be -$42.00, not a raw-units figure');
});

test('a game that does not run the mode is omitted, not shown blank', () => {
  const body = renderCompare(stateFor('VIPER_VAULT'), boxer(WIDTH), WIDTH, 20).map(strip).join('\n');
  assert.match(body, /metro-night-run/);
  assert.doesNotMatch(body, /pixel-carnivals/, 'an empty row would read as "this game ran it and took nothing"');
});

test('a mode no game runs says so', () => {
  const body = renderCompare(stateFor('NOBODY_RUNS_THIS'), boxer(WIDTH), WIDTH, 20).map(strip).join('\n');
  assert.match(body, /no game/i);
});
