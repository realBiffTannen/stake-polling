import { test } from 'node:test';
import assert from 'node:assert/strict';
import { renderGame } from '../src/tui/views/game.mjs';
import { boxer } from '../src/tui/layout.mjs';
import { buildModeRows } from '../src/tui/mode-rows.mjs';
import { loadMathModel } from '../src/tui/math.mjs';
import { initialNav, LEVEL } from '../src/tui/nav.mjs';
import { metroGameStats } from './fixtures/live.mjs';

const ESC = String.fromCharCode(27);
const strip = (s) => s.replace(new RegExp(`${ESC}\\[[0-9;]*m`, 'g'), '');
const NOW = Date.parse('2026-09-16T15:00:00Z');
const WIDTH = 120;
const config = {
  money: { unitsPerDollar: 1_000_000, profitShare: 0.1, expectedShare: 0.075 },
  dayBoundaryUtcHour: 12,
  pollMinutes: 5,
};

const modeRows = buildModeRows({
  snapshot: { ok: true, data: metroGameStats },
  modeTrail: [],
  gameRow: { name: 'metro-night-run', turnover: 19_042_500_000, count: 55_462, profit: -103_087_500 },
  now: NOW,
  config,
  mathModel: loadMathModel(new URL('./fixtures/math.json', import.meta.url).pathname),
  slug: 'metro-night-run',
});

const stateFor = (tab) => ({
  now: NOW,
  money: config.money,
  pollMinutes: 5,
  rateLabel: '/5m',
  dayFrom: Date.parse('2026-09-16T12:00:00Z'),
  gameTrails: {}, modeTrails: {},
  modeRows,
  nav: { ...initialNav(), level: LEVEL.GAME, game: 'metro-night-run', tab },
});

const draw = (tab) => renderGame(stateFor(tab), boxer(WIDTH), WIDTH, 20).map(strip);

test('every line is exactly the box width, whatever the tab', () => {
  for (const tab of ['health', 'live', 'today', 'buckets']) {
    for (const line of draw(tab)) assert.equal(line.length, WIDTH, `${tab}: ${line}`);
  }
});

test('the header names the game and marks the active tab', () => {
  const head = draw('health')[0];
  assert.match(head, /metro-night-run/);
  const tabs = draw('health')[1];
  assert.match(tabs, /HEALTH/);
  assert.match(tabs, /LIVE/);
  assert.match(tabs, /TODAY/);
  assert.match(tabs, /BUCKETS/);
});

test('HEALTH renders on the first frame with no trail at all', () => {
  const lines = draw('health').join('\n');
  // Snapshot-fed figures must all be present with an empty modeTrail.
  for (const mode of ['BASE', 'ANTE', 'VIPER_VAULT', 'COASTAL_CRUISER', 'ICY_SPINOUT']) {
    assert.match(lines, new RegExp(mode));
  }
  assert.match(lines, /95\.50/, 'RTP is shown as a percentage, not a fraction');
});

test('HEALTH shows the fields the old pane discarded', () => {
  const lines = draw('health').join('\n');
  assert.match(lines, /AVGBET/);
  assert.match(lines, /NORM/);
  assert.match(lines, /TURNOVER/);
});

// --- the HEALTH money VALUE, pinned (review finding #9) --------------------
//
// Nothing previously asserted a HEALTH money VALUE at a render site: deleting
// the `true` from `usd(r.turnoverUsd, state, true)` in `views/game.mjs` - so
// TURNOVER, already dollars, gets divided by `unitsPerDollar` a SECOND time -
// left the whole 390-test suite green. BASE's raw turnover in the fixture is
// 12_000_000_000 (micro-dollars) = $12,000.00 exactly; the bug this guards
// against would print $0.01 instead.
test('HEALTH prints the already-converted turnover as-is, not divided again', () => {
  const body = draw('health').join('\n');
  assert.match(body, /\$12,000\.00/, 'BASE turnover must read $12,000.00, not $0.01 (re-divided by 1,000,000)');
});

test('HEALTH shows the EDGE_API column the spec calls for, given room', () => {
  // All 11 HEALTH columns need more than this file's usual 120-wide box - at
  // that width EDGE_API is (correctly) the first one `fit()` sheds, being
  // the lowest-priority column. A wider box proves the column exists at all.
  const WIDE = 140;
  const body = renderGame(stateFor('health'), boxer(WIDE), WIDE, 20).map(strip).join('\n');
  assert.match(body, /EDGE_API/);
});

test('modes appear in canonical BASE-first order on every tab', () => {
  for (const tab of ['health', 'live', 'today']) {
    const body = draw(tab).join('\n');
    const order = ['BASE', 'ANTE', 'COASTAL_CRUISER', 'ICY_SPINOUT', 'VIPER_VAULT']
      .map((m) => body.indexOf(m));
    const sorted = [...order].sort((a, b) => a - b);
    assert.deepEqual(order, sorted, `${tab} must not reorder the modes`);
  }
});

test('LIVE shows dashes for a mode with no trail rather than zeros', () => {
  const body = draw('live').join('\n');
  assert.doesNotMatch(body, /\$0\.00/, 'a zero here would claim a measured quiet interval');
  assert.match(body, /-/);
});

test('a narrow terminal sheds columns instead of overflowing', () => {
  const narrow = renderGame(stateFor('health'), boxer(60), 60, 20).map(strip);
  for (const line of narrow) assert.equal(line.length, 60);
  assert.match(narrow.join('\n'), /BASE/, 'the mode name is never the column that gets dropped');
});

test('BASE margin is labelled noise, never presented as a verdict', () => {
  const body = draw('health').join('\n');
  assert.match(body, /noise/i);
});

test('an empty mode list says so rather than drawing an empty table', () => {
  const empty = { ...stateFor('health'), modeRows: [] };
  const lines = renderGame(empty, boxer(WIDTH), WIDTH, 20).map(strip);
  assert.match(lines.join('\n'), /no per-mode data/i);
});

test('LIVE and TODAY convert raw micro-dollars once, and apply the profit share only to profit', () => {
  const MIN = 60000;
  // Two samples five minutes apart: turnover +500,000,000 raw = +$500.00,
  // profit -10,000,000 raw = -$1.00 after the studio's 10% share, count +2,210.
  const trail = [
    { ts: NOW - 5 * MIN, fields: { 'BASE:turnover': 11_500_000_000, 'BASE:profit': -410_000_000, 'BASE:count': 46_000 } },
    { ts: NOW,           fields: { 'BASE:turnover': 12_000_000_000, 'BASE:profit': -420_000_000, 'BASE:count': 48_210 } },
  ];
  const rows = buildModeRows({
    snapshot: { ok: true, data: metroGameStats },
    modeTrail: trail,
    gameRow: { name: 'metro-night-run', turnover: 19_042_500_000, count: 55_462, profit: -103_087_500 },
    now: NOW,
    config,
    mathModel: loadMathModel(new URL('./fixtures/math.json', import.meta.url).pathname),
    slug: 'metro-night-run',
  });

  const live = renderGame({ ...stateFor('live'), modeRows: rows }, boxer(WIDTH), WIDTH, 20).map(strip).join('\n');
  // A missing conversion would read $500,000,000.00; a double conversion $0.00.
  assert.match(live, /\+\$500\.00/, 'turnover delta converts exactly once');
  // A missing share would read -$10.00; applying the share twice, -$0.10.
  assert.match(live, /-\$1\.00/, 'profit delta converts once AND takes the 10% share');
  assert.match(live, /\+2,210/, 'spin delta is a plain count, never converted');

  const today = renderGame({ ...stateFor('today'), modeRows: rows }, boxer(WIDTH), WIDTH, 20).map(strip).join('\n');
  assert.match(today, /\$500\.00/);
  assert.match(today, /-\$1\.00/);
  assert.match(today, /2,210/);
});
