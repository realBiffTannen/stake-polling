import { test } from 'node:test';
import assert from 'node:assert/strict';
import { renderMode } from '../src/tui/views/mode.mjs';
import { boxer } from '../src/tui/layout.mjs';
import { buildModeRows } from '../src/tui/mode-rows.mjs';
import { loadMathModel } from '../src/tui/math.mjs';
import { initialNav, LEVEL } from '../src/tui/nav.mjs';
import { metroGameStats } from './fixtures/live.mjs';

const ESC = String.fromCharCode(27);
const strip = (s) => s.replace(new RegExp(`${ESC}\\[[0-9;]*m`, 'g'), '');
const NOW = Date.parse('2026-09-16T15:00:00Z');
const WIDTH = 100;
const config = {
  money: { unitsPerDollar: 1_000_000, profitShare: 0.1, expectedShare: 0.075 },
  dayBoundaryUtcHour: 12,
  pollMinutes: 5,
};
const mathModel = loadMathModel(new URL('./fixtures/math.json', import.meta.url).pathname);

const modeRows = buildModeRows({
  snapshot: { ok: true, data: metroGameStats },
  modeTrail: [],
  gameRow: { name: 'metro-night-run', turnover: 19_042_500_000, count: 55_462, profit: -103_087_500 },
  now: NOW, config, mathModel, slug: 'metro-night-run',
});

const stateFor = (mode) => ({
  now: NOW, money: config.money, pollMinutes: 5, rateLabel: '/5m',
  modeRows, mathModel, gameTrails: {}, modeTrails: {},
  nav: { ...initialNav(), level: LEVEL.MODE, game: 'metro-night-run', mode, bucket: '1h' },
});

const draw = (mode) => renderMode(stateFor(mode), boxer(WIDTH), WIDTH, 20).map(strip);

test('every line is exactly the box width', () => {
  for (const line of draw('VIPER_VAULT')) assert.equal(line.length, WIDTH, line);
});

test('the card names the game and the mode', () => {
  const head = draw('VIPER_VAULT')[0];
  assert.match(head, /metro-night-run/);
  assert.match(head, /VIPER_VAULT/);
});

test('it shows every API field for that one mode', () => {
  const body = draw('BASE').join('\n');
  for (const label of ['cost', 'avgBet', 'spins', 'turnover', 'profit', 'rtp', 'eff', 'norm', 'expected']) {
    assert.match(body, new RegExp(label, 'i'), `missing ${label}`);
  }
});

test('it places the mode on the game cost ladder', () => {
  // Assert against the ladder line itself, not the whole card: the card is
  // full of other digits in ascending order (spin counts, turnover, n=812...)
  // so a whole-card regex still passes even if the ladder line is deleted
  // outright. Finding the one line labelled "ladder" and pinning its content
  // means deleting or scrambling it actually fails this test.
  const lines = draw('VIPER_VAULT');
  const ladderLine = lines.find((l) => l.includes('ladder'));
  assert.ok(ladderLine, 'expected a line labelled "ladder" in the card');
  assert.match(ladderLine, /ladder\s+1x · 3x · 75x · 100x · 150x/,
    'the ladder must show every rung, in order, with the 75x cost in context');
});

test('a mode with a known sigma states its standard error and sample size', () => {
  const body = draw('VIPER_VAULT').join('\n');
  assert.match(body, /n=812/);
  assert.match(body, /\+\/-|±/, 'the band must be stated, not implied');
});

test('BASE is stated as unreadable rather than given a verdict', () => {
  const body = draw('BASE').join('\n');
  assert.match(body, /noise/i);
});

test('a mode absent from math.json shows the sample size and no band', () => {
  const state = { ...stateFor('BASE'), mathModel: {} };
  const rows = buildModeRows({
    snapshot: { ok: true, data: metroGameStats }, modeTrail: [],
    gameRow: { turnover: 1, count: 1, profit: 1 },
    now: NOW, config, mathModel: {}, slug: 'metro-night-run',
  });
  const body = renderMode({ ...state, modeRows: rows }, boxer(WIDTH), WIDTH, 20).map(strip).join('\n');
  assert.match(body, /n=48,210|48210/);
  assert.doesNotMatch(body, /needs ~/, 'no model means no convergence claim at all');
});

test('an unknown mode renders a message rather than throwing', () => {
  const body = renderMode(stateFor('NO_SUCH_MODE'), boxer(WIDTH), WIDTH, 20).map(strip).join('\n');
  assert.match(body, /no data/i);
});
