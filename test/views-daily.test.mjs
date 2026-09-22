import { test } from 'node:test';
import assert from 'node:assert/strict';
import { renderDaily, renderDailyPlain } from '../src/tui/views/daily.mjs';
import { renderFrame, renderPlain } from '../src/tui/render.mjs';
import { VIEWS } from '../src/tui/views/plain.mjs';
import { C } from '../src/tui/format.mjs';
import { boxer, visible } from '../src/tui/layout.mjs';
import { initialNav, LEVEL } from '../src/tui/nav.mjs';

const ESC = String.fromCharCode(27);
const strip = (s) => s.replace(new RegExp(`${ESC}\\[[0-9;]*m`, 'g'), '');
const at = (iso) => Date.parse(iso);
const WIDTH = 120;
const money = { unitsPerDollar: 1_000_000, profitShare: 0.1, expectedShare: 0.075 };

const day = (from, extra) => ({
  from: at(`${from}T12:00:00Z`), to: at(`${from}T12:00:00Z`) + 86400000,
  current: false, partial: false, ...extra,
});

// Raw API units, gross: -2,241,600,000 is -$2,241.60, of which the studio's
// 10% is the -$224.16 the accounting page shows.
const DAILY = {
  games: ['berry', 'neon-city-heist', 'lunar-blossom'],
  rows: [
    day('2026-09-16', { current: true, total: 412_000_000, byGame: { berry: 121_000_000, 'neon-city-heist': -34_000_000, 'lunar-blossom': 325_000_000 } }),
    day('2026-09-15', { total: -2_241_600_000, byGame: { berry: -1_341_500_000, 'neon-city-heist': -760_300_000, 'lunar-blossom': -139_800_000 } }),
    day('2026-09-14', { partial: true, total: 880_200_000, byGame: { berry: 880_200_000, 'neon-city-heist': null, 'lunar-blossom': null } }),
  ],
};

const stateWith = (daily = DAILY) => ({
  now: at('2026-09-17T08:05:00Z'),
  dayFrom: at('2026-09-16T12:00:00Z'),
  money,
  daily,
  rows: [], alerts: [], meta: {}, online: 0, ageMs: null, stale: false,
  nav: { ...initialNav(), level: LEVEL.DAILY },
});

const draw = (state = stateWith(), width = WIDTH, budget = 20) => renderDaily(state, boxer(width), width, budget);

test('every line is exactly the box width', () => {
  for (const line of draw()) assert.equal(visible(line), WIDTH, strip(line));
});

test('the header says which hour the day rolls at', () => {
  assert.match(strip(draw()[0]), /daily profit/i);
  assert.match(strip(draw()[0]), /12:00Z -> 12:00Z/);
});

test('each row names both dates its day spans, newest first', () => {
  const rows = draw().map(strip).filter((l) => /\d\d-\d\d -> \d\d-\d\d/.test(l));
  assert.match(rows[0], /09-16 -> 09-17 so far/);
  assert.match(rows[1], /09-15 -> 09-16/);
  assert.match(rows[2], /09-14 -> 09-15 partial/);
});

test('figures are the studio share in dollars, a losing day red and a winning one green', () => {
  const lines = draw();
  const lossDay = lines.find((l) => strip(l).includes('09-15 -> 09-16'));
  assert.ok(lossDay.includes(`${C.red}-$224.16${C.reset}`), 'TOTAL');
  assert.ok(lossDay.includes(`${C.red}-$134.15${C.reset}`), 'berry');
  assert.ok(lossDay.includes(`${C.red}-$76.03${C.reset}`), 'neon-city-heist');

  const today = lines.find((l) => strip(l).includes('so far'));
  assert.ok(today.includes(`${C.green}+$41.20${C.reset}`), 'TOTAL');
  assert.ok(today.includes(`${C.red}-$3.40${C.reset}`), 'one losing game on a winning day is still red');
});

test('a game nobody measured that day is a dash, never $0.00', () => {
  const partialDay = strip(draw().find((l) => strip(l).includes('partial')));
  const cells = partialDay.replace(/│/g, '').trim().split(/\s+/);
  assert.deepEqual(cells.slice(-3), ['+$88.02', '-', '-'], partialDay);
  assert.ok(!partialDay.includes('$0.00'), partialDay);
});

test('a narrow terminal sheds game columns from the right, never DAY or TOTAL', () => {
  const lines = draw(stateWith(), 64, 20).map(strip);
  for (const line of lines) assert.equal(line.length, 64, line);
  const titles = lines.find((l) => l.includes('TOTAL'));
  assert.match(titles, /DAY/);
  assert.match(titles, /berry/);
  assert.ok(!titles.includes('lunar-blossom'), titles);
});

test('more days than the screen holds are counted, not silently dropped', () => {
  const lines = draw(stateWith(), WIDTH, 4).map(strip);
  assert.ok(lines.some((l) => /09-16 -> 09-17/.test(l)));
  assert.ok(!lines.some((l) => /09-14 -> 09-15/.test(l)));
  assert.ok(lines.some((l) => /2 older days/.test(l)), lines.join('\n'));
  assert.ok(lines.length <= 4, 'the overflow line comes out of the budget, not on top of it');

  const two = { ...DAILY, rows: DAILY.rows.slice(0, 2) };
  assert.ok(draw(stateWith(two), WIDTH, 3).map(strip).some((l) => /1 older day\b/.test(l)));
});

test('an empty table explains itself', () => {
  // `null`, not `undefined`: a frame drawn before the first daily read has no table at all.
  for (const daily of [{ games: [], rows: [] }, null]) {
    const text = draw(stateWith(daily)).map(strip).join('\n');
    assert.match(text, /no daily trail yet/);
  }
});

test('renderFrame draws the daily view in place of the roster table', () => {
  const text = renderFrame(stateWith(), { cols: WIDTH, rows: 30 }).map(strip).join('\n');
  assert.match(text, /09-15 -> 09-16/);
  assert.ok(!text.includes('TURNOVER'), 'the roster table must not draw underneath');
});

test('the footer and the help overlay both name the key', () => {
  const frame = renderFrame({ ...stateWith(), nav: initialNav() }, { cols: 140, rows: 30 }).map(strip).join('\n');
  assert.match(frame, /d daily/);
  const help = renderFrame({ ...stateWith(), nav: { ...initialNav(), help: true } }, { cols: 140, rows: 40 }).map(strip).join('\n');
  assert.match(help, /^│ d\s+.*12:00/m);
});

test('the piped table carries the same days and figures with no escapes', () => {
  const lines = renderDailyPlain(stateWith());
  const text = lines.join('\n');
  assert.ok(!text.includes(ESC));
  assert.match(lines[0], /DAILY PROFIT/);
  assert.match(lines[0], /12:00Z -> 12:00Z/);
  assert.match(text, /09-16 -> 09-17 so far\s+\+\$41\.20\s+\+\$12\.10\s+-\$3\.40\s+\+\$32\.50/);
  assert.match(text, /09-15 -> 09-16\s+-\$224\.16\s+-\$134\.15\s+-\$76\.03\s+-\$13\.98/);
  assert.match(text, /09-14 -> 09-15 partial\s+\+\$88\.02\s+\+\$88\.02\s+-\s+-$/m);
});

test('the piped empty table explains itself too', () => {
  assert.match(renderDailyPlain(stateWith(null)).join('\n'), /no daily trail yet/);
});

test('--view daily is a reachable view, and renderPlain draws it instead of the roster', () => {
  assert.ok(VIEWS.includes('daily'));
  const state = { ...stateWith(), online: 0, team: null, carry: null, ageMs: null, stale: false, events: [], summaries: [], dayCoverage: {} };
  const text = renderPlain(state);
  assert.match(text, /DAILY PROFIT/);
  assert.match(text, /09-15 -> 09-16\s+-\$224\.16/);
  assert.ok(!text.includes('TURNOVER'), 'the roster table must not draw as well');
});

test('an 80-column terminal still shows both the daily key and the help key in the footer', () => {
  const footer = renderFrame({ ...stateWith(), nav: initialNav() }, { cols: 80, rows: 30 }).map(strip).at(-1);
  assert.equal(footer.length, 80);
  assert.match(footer, /d daily/);
  assert.match(footer, /\? help/, 'the one hint that leads to every other binding must not be the first thing clipped');
});

test('the help overlay names the configured boundary hour, not a hardcoded noon', () => {
  const midnight = { ...stateWith(), dayFrom: at('2026-09-17T00:00:00Z'), nav: { ...initialNav(), help: true } };
  const help = renderFrame(midnight, { cols: 140, rows: 40 }).map(strip).join('\n');
  assert.match(help, /^│ d\s+.*00:00Z-to-00:00Z/m);
});
