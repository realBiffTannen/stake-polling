import { test } from 'node:test';
import assert from 'node:assert/strict';
import { C } from '../src/tui/format.mjs';
import { boxer, fit, visible } from '../src/tui/layout.mjs';
import { buildState, rosterTotals, dayTotals, totalsOf } from '../src/tui/state.mjs';
import { initialNav } from '../src/tui/nav.mjs';
import { renderRoster, columnsFor, totalLabel } from '../src/tui/views/roster.mjs';
import { renderFrame, renderPlain } from '../src/tui/render.mjs';
import { DashboardApp } from '../src/tui/app.mjs';

// The roster's TOTAL row: every game's figures added up, under the table.
// Every figure below is raw API units (micro-dollars, gross), so each
// expected cell is worked out by hand from them - never read back from the
// code under test.

const ESC = String.fromCharCode(27);
const strip = (s) => s.replace(new RegExp(`${ESC}\\[[0-9;]*m`, 'g'), '');
const at = (iso) => Date.parse(iso);
const NOW = at('2026-09-16T15:00:00Z');
const config = {
  money: { unitsPerDollar: 1_000_000, profitShare: 0.1, expectedShare: 0.075 },
  dayBoundaryUtcHour: 12,
  pollMinutes: 5,
};
const red = (text) => `${C.red}${text}${C.reset}`;
const green = (text) => `${C.green}${text}${C.reset}`;

// berry       $150,000.00 turnover, -$100.00 profit, $300.00 expected
// nwo          $70,000.00 turnover, -$1,200.00 profit, $150.00 expected
// lantern      $40,000.00 turnover, +$400.00 profit, $75.00 expected
// hippo-hustle live in the catalogue, not on the roster yet: every figure null
//
// Sums: 2,000 bets, $260,000.00 turnover, -$900.00 profit, $525.00 expected.
// RTP from the gross figures: 1 - (-9,000 / 260,000) = 103.46%. Averaging
// the three per-game RTPs (100.67%, 117.14%, 90.00%) would give 102.60%.
const ROSTER = [
  { slug: 'berry', stats: { count: 1000, turnover: 150_000_000_000, profit: -1_000_000_000, unique: 500, expectedProfit: 4_000_000_000 } },
  { slug: 'neon-city-heist', stats: { count: 400, turnover: 70_000_000_000, profit: -12_000_000_000, unique: 300, expectedProfit: 2_000_000_000 } },
  { slug: 'lunar-blossom', stats: { count: 600, turnover: 40_000_000_000, profit: 4_000_000_000, unique: 200, expectedProfit: 1_000_000_000 } },
];
const CATALOGUE = [
  { slug: 'berry', isLive: true, onlinePlayers: 3 },
  { slug: 'neon-city-heist', isLive: true, onlinePlayers: 2 },
  { slug: 'lunar-blossom', isLive: true, onlinePlayers: 0 },
  { slug: 'hippo-hustle', isLive: true, onlinePlayers: 4 },
];

// Per poll:  berry  +20 bets, +$300.00, -$10.00   (last step 14:50 -> 14:55)
//            nwo    +10 bets, +$200.00, -$5.00
//            lantern +10 bets, +$100.00, +$5.00
//            sums   +40 bets, +$600.00, -$10.00
// Since 12:00Z: berry 100 bets, $1,500.00, -$30.00 (two steps)
//               nwo 10 bets, $200.00, -$5.00; lantern 10 bets, $100.00, +$5.00
//               sums 120 bets, $1,800.00, -$30.00
const TRAILS = {
  online: [],
  games: {
    berry: [
      { ts: at('2026-09-16T12:30:00Z'), fields: { count: 900, turnover: 148_500_000_000, profit: -700_000_000 } },
      { ts: at('2026-09-16T14:50:00Z'), fields: { count: 980, turnover: 149_700_000_000, profit: -900_000_000 } },
      { ts: at('2026-09-16T14:55:00Z'), fields: { count: 1000, turnover: 150_000_000_000, profit: -1_000_000_000 } },
    ],
    'neon-city-heist': [
      { ts: at('2026-09-16T14:50:00Z'), fields: { count: 390, turnover: 69_800_000_000, profit: -11_950_000_000 } },
      { ts: at('2026-09-16T14:55:00Z'), fields: { count: 400, turnover: 70_000_000_000, profit: -12_000_000_000 } },
    ],
    'lunar-blossom': [
      { ts: at('2026-09-16T13:00:00Z'), fields: { count: 590, turnover: 39_900_000_000, profit: 3_950_000_000 } },
      { ts: at('2026-09-16T14:55:00Z'), fields: { count: 600, turnover: 40_000_000_000, profit: 4_000_000_000 } },
    ],
  },
};

const dashboardOf = ({ roster = ROSTER, catalogue = CATALOGUE, alerts = [] } = {}) => ({
  meta: { last_ok: String(NOW) },
  roster: { ok: true, data: roster },
  games: { ok: true, data: catalogue },
  alerts,
});

const stateOf = ({ trails = TRAILS, nav = {}, ...over } = {}) => ({
  ...buildState(dashboardOf(over), trails, NOW, config),
  nav: { ...initialNav(), ...nav },
});

/** Each cell of a drawn roster line, keyed by column title, cut where the header's columns fall. */
const cellsOf = (line, state, width) => {
  const text = strip(line).slice(2, -2);
  const out = {};
  let offset = 0;
  for (const c of fit(columnsFor(state), width - 4)) {
    out[c.title] = text.slice(offset, offset + c.width).trim();
    offset += c.width + 1;
  }
  return out;
};

const totalLine = (lines) => lines.find((l) => strip(l).startsWith('│ TOTAL'));
const dollars = (text) => (text === '-' ? null : Number(text.replace(/[$,+]/g, '')));

test('the TOTAL row adds up every additive column, and leaves PLAYERS and the sparkline blank', () => {
  const state = stateOf();
  const lines = renderRoster(state, boxer(160), 160, 20);
  const header = cellsOf(lines[0], state, 160);
  assert.deepEqual(Object.keys(header), Object.values(header), 'the cell cutter lines up with the header');

  assert.equal(totalLine(lines), lines.at(-1), 'TOTAL is the last line of the table');
  assert.deepEqual(cellsOf(lines.at(-1), state, 160), {
    GAME: 'TOTAL (4 games)',
    NOW: '9',
    BETS: '2,000',
    'BETS/5m': '+40',
    // One player on two games counts in both, so no sum of this column is true.
    PLAYERS: '',
    TURNOVER: '$260,000.00',
    'TURN/5m': '+$600.00',
    PROFIT: '-$900.00',
    'PROFIT/5m': '-$10.00',
    'DAY PROFIT': '-$30.00',
    'DAY TURN': '$1,800.00',
    EXPECTED: '$525.00',
    RTP: '103.46%',
    '60m': '',
  });
});

test('totalsOf sums what was measured and computes RTP from the gross figures', () => {
  const t = totalsOf(stateOf().rows);
  assert.equal(t.count, 2000);
  assert.equal(t.dCount, 40);
  assert.equal(t.online, 9);
  assert.equal(t.turnoverUsd.toFixed(2), '260000.00');
  assert.equal(t.profitUsd.toFixed(2), '-900.00');
  assert.equal(t.expectedUsd.toFixed(2), '525.00');
  assert.equal(t.dTurnoverUsd.toFixed(2), '600.00');
  assert.equal(t.dProfitUsd.toFixed(2), '-10.00');
  assert.equal(t.dayTurnoverUsd.toFixed(2), '1800.00');
  assert.equal(t.dayProfitUsd.toFixed(2), '-30.00');
  assert.equal(t.dayCount, 120);
  assert.equal(t.rtp.toFixed(2), '103.46', 'Σprofit / Σturnover, not the mean of per-game RTPs (102.60)');
});

test('a pending game adds nothing to any total, and moves nothing towards zero', () => {
  const withPending = stateOf();
  const without = stateOf({ catalogue: CATALOGUE.filter((g) => g.slug !== 'hippo-hustle') });
  const a = cellsOf(totalLine(renderRoster(withPending, boxer(160), 160, 20)), withPending, 160);
  const b = cellsOf(totalLine(renderRoster(without, boxer(160), 160, 20)), without, 160);

  assert.equal(a.GAME, 'TOTAL (4 games)', 'the pending game is still a row the table represents');
  assert.equal(b.GAME, 'TOTAL (3 games)');
  assert.equal(a.NOW, '9', 'its concurrency IS measured, and counts');
  assert.equal(b.NOW, '5');
  for (const title of Object.keys(a).filter((k) => !['GAME', 'NOW'].includes(k))) {
    assert.equal(a[title], b[title], `${title} moved when an unmeasured game joined the roster`);
  }
});

test('a column no game has measured yet totals to a dash, never $0.00', () => {
  // Month-to-date figures, but no trail at all: every rate and day figure is
  // unmeasured on every game, and the pending game has nothing either.
  const state = stateOf({ trails: { online: [], games: {} } });
  const cells = cellsOf(totalLine(renderRoster(state, boxer(160), 160, 20)), state, 160);
  assert.equal(cells.TURNOVER, '$260,000.00');
  for (const title of ['BETS/5m', 'TURN/5m', 'PROFIT/5m', 'DAY PROFIT', 'DAY TURN']) {
    assert.equal(cells[title], '-', `${title} was never measured by any game`);
  }

  // No catalogue read: no game knows its concurrency, so neither does the total.
  const blind = stateOf({ catalogue: [] });
  assert.equal(cellsOf(totalLine(renderRoster(blind, boxer(160), 160, 20)), blind, 160).NOW, '-');
});

test('an all-pending roster totals to dashes, in the table and in the header above it', () => {
  const state = stateOf({ roster: [], trails: { online: [], games: {} } });
  assert.ok(state.rows.every((r) => r.pending), 'fixture: nothing on the roster has figures yet');

  const cells = cellsOf(totalLine(renderRoster(state, boxer(160), 160, 20)), state, 160);
  assert.equal(cells.NOW, '9', 'players online is the one thing a launch does know');
  for (const title of ['BETS', 'BETS/5m', 'TURNOVER', 'TURN/5m', 'PROFIT', 'PROFIT/5m', 'DAY PROFIT', 'DAY TURN', 'EXPECTED', 'RTP']) {
    assert.equal(cells[title], '-', `${title}: nothing was measured, so nothing was summed`);
  }
  assert.equal(cells.PLAYERS, '', 'blank means "not additive", which is still true with no data');

  assert.deepEqual(rosterTotals(state), { turnover: null, profit: null });
  const frame = renderFrame(state, { cols: 160, rows: 30 }).map(strip);
  const head = frame.find((l) => l.startsWith('│ online'));
  assert.match(head, /turnover -\s+profit -\s/, head);
  assert.ok(!frame.join('\n').includes('$0.00'), 'no line of this frame measured a zero');
});

test('a losing total is red, a winning one green, a break-even one green, and the label bold', () => {
  const losing = totalLine(renderRoster(stateOf(), boxer(160), 160, 20));
  assert.ok(losing.includes(red('-$900.00')), 'PROFIT');
  assert.ok(losing.includes(red('-$10.00')), 'PROFIT/rate');
  assert.ok(losing.includes(red('-$30.00')), 'DAY PROFIT');
  assert.ok(losing.includes(`${C.bold}TOTAL (4 games)${C.reset}`));

  const winning = totalLine(renderRoster(stateOf({ nav: { filter: 'blossom' } }), boxer(160), 160, 20));
  assert.ok(winning.includes(green('$400.00')));
  assert.ok(winning.includes(green('+$5.00')));
  assert.ok(!winning.includes(C.red), 'nothing about a roster in profit is red');

  const even = stateOf({
    roster: [
      { slug: 'berry', stats: { count: 1, turnover: 5_000_000_000, profit: 1_000_000_000 } },
      { slug: 'lunar-blossom', stats: { count: 1, turnover: 5_000_000_000, profit: -1_000_000_000 } },
    ],
    catalogue: [],
    trails: { online: [], games: {} },
  });
  assert.ok(totalLine(renderRoster(even, boxer(160), 160, 20)).includes(green('$0.00')), 'a measured zero is green');
});

test('the label counts games, singular for one, and names the whole roster when filtered', () => {
  assert.equal(totalLabel(10), 'TOTAL (10 games)');
  assert.equal(totalLabel(1), 'TOTAL (1 game)');
  assert.equal(totalLabel(1, 10), 'TOTAL (1 of 10 games)');
  assert.equal(totalLabel(1, 1), 'TOTAL (1 of 1 game)');
  // The terminal's GAME column is 18 wide: a label that does not fit loses
  // the noun before it loses the "of", which is the part that matters.
  assert.equal(totalLabel(1, 10, 18), 'TOTAL (1 of 10)');
  assert.equal(totalLabel(10, null, 18), 'TOTAL (10 games)');
});

test('a filter narrows what the TOTAL row adds up, and its label says so', () => {
  const state = stateOf({ nav: { filter: 'blossom' } });
  const cells = cellsOf(totalLine(renderRoster(state, boxer(160), 160, 20)), state, 160);
  assert.equal(cells.GAME, 'TOTAL (1 of 4)');
  assert.equal(cells.TURNOVER, '$40,000.00');
  assert.equal(cells.PROFIT, '$400.00');
  assert.equal(cells.NOW, '0');
  assert.equal(cells.RTP, '90.00%');

  const several = stateOf({ nav: { filter: 'S' } });
  const wider = cellsOf(totalLine(renderRoster(several, boxer(160), 160, 20)), several, 160);
  assert.equal(wider.GAME, 'TOTAL (3 of 4)', 'neon-city-heist, lunar-blossom, hippo-hustle');
  assert.equal(wider.TURNOVER, '$110,000.00');
});

test('a filter that matches nothing, and an empty roster, draw no TOTAL row', () => {
  const none = renderRoster(stateOf({ nav: { filter: 'zzz' } }), boxer(160), 160, 20).map(strip);
  assert.ok(none.some((l) => l.includes('no games match')));
  assert.ok(!none.some((l) => l.includes('TOTAL')));

  const empty = stateOf({ roster: [], catalogue: [], trails: { online: [], games: {} } });
  assert.ok(!renderRoster(empty, boxer(160), 160, 20).some((l) => strip(l).includes('TOTAL')));
  const frame = renderFrame(empty, { cols: 160, rows: 30 }).map(strip).join('\n');
  assert.match(frame, /waiting for the first poll/);
  assert.ok(!frame.includes('TOTAL'));
});

test('TOTAL takes one line of the budget and outlasts the games cut into "... N more"', () => {
  const state = stateOf();
  const fits = renderRoster(state, boxer(160), 160, 5).map(strip);
  assert.equal(fits.length, 6, 'titles, four games, TOTAL');
  assert.ok(!fits.some((l) => l.includes('more')));

  const short = renderRoster(state, boxer(160), 160, 4).map(strip);
  assert.equal(short.length, 6, 'titles, three games, "... 1 more", TOTAL - one more game cut than before');
  assert.match(short.at(-2), /\.\.\. 1 more/);
  assert.ok(short.at(-1).startsWith('│ TOTAL (4 games)'));

  const tiny = renderRoster(state, boxer(160), 160, 3);
  assert.match(strip(tiny.at(-2)), /\.\.\. 2 more/);
  assert.equal(cellsOf(tiny.at(-1), state, 160).TURNOVER, '$260,000.00', 'the cut games are still in the sum');
});

// Ten games, so a short terminal has to cut some of them: $1.00 to $10.00
// turnover each, $55.00 in all.
const TEN = Array.from({ length: 10 }, (_, i) => ({
  slug: `game-${String(i + 1).padStart(2, '0')}`,
  stats: { count: 10, turnover: (10 - i) * 1_000_000, profit: 100_000 },
}));

test('on a short terminal the frame cuts games, then "... N more", but never the TOTAL line', () => {
  const alerts = [{ ts: NOW, severity: 'warn', kind: 'spike', game: 'game-01', metric: 'turnover', z: 5, message: 'turnover spike' }];
  for (const filter of ['', 'game']) {
    for (const withAlerts of [false, true]) {
      for (let rows = 9 + (filter ? 1 : 0); rows <= 30; rows++) {
        const state = stateOf({ roster: TEN, catalogue: [], trails: { online: [], games: {} }, alerts: withAlerts ? alerts : [], nav: { filter } });
        const frame = renderFrame(state, { cols: 120, rows });
        const where = `rows=${rows} filter="${filter}" alerts=${withAlerts}\n${frame.map(strip).join('\n')}`;
        assert.ok(frame.length <= rows, where);
        const total = frame.findIndex((l) => strip(l).startsWith('│ TOTAL'));
        assert.ok(total !== -1, `the TOTAL line was cut: ${where}`);
        assert.equal(cellsOf(frame[total], state, 120).TURNOVER, '$55.00', where);
        assert.ok(!/│ game-\d\d /.test(strip(frame[total + 1] ?? '')), `a game row drawn under TOTAL: ${where}`);
      }
    }
  }
});

test('every TOTAL line is exactly the box width, and drops the same columns as the header', () => {
  const state = stateOf();
  for (const width of [160, 80, 40]) {
    const lines = renderRoster(state, boxer(width), width, 20);
    for (const line of lines) assert.equal(visible(line), width, `${width}: ${strip(line)}`);
    const header = cellsOf(lines[0], state, width);
    assert.deepEqual(Object.keys(header), Object.values(header), `${width}: the header is cut where its columns fall`);
  }

  const at80 = stateOf();
  assert.deepEqual(cellsOf(totalLine(renderRoster(at80, boxer(80), 80, 20)), at80, 80), {
    GAME: 'TOTAL (4 games)', NOW: '9', TURNOVER: '$260,000.00', 'TURN/5m': '+$600.00', PROFIT: '-$900.00', 'DAY PROFIT': '-$30.00',
  });

  const narrow = renderRoster(stateOf(), boxer(40), 40, 20);
  assert.deepEqual(cellsOf(totalLine(narrow), stateOf(), 40), { GAME: 'TOTAL (4 games)', NOW: '9', TURNOVER: '$260,000.00' });
  assert.ok(!strip(totalLine(narrow)).includes('$900.00'), 'PROFIT was dropped from the header, so from TOTAL too');

  const frame = renderFrame(stateOf(), { cols: 40, rows: 24 });
  assert.equal(visible(totalLine(frame)), 40);
});

// The piped table's own fixed widths, in its own column order.
const PLAIN = [
  ['GAME', 20], ['NOW', 5], ['BETS', 9], ['BETS/5m', 9], ['PLAYERS', 9], ['TURNOVER', 14], ['TURN/5m', 13],
  ['PROFIT', 13], ['PROFIT/5m', 13], ['DAY TURN', 13], ['DAY PROFIT', 13], ['EXPECTED', 12], ['RTP', 9],
];
const plainCells = (line) => {
  const out = {};
  let offset = 0;
  for (const [title, width] of PLAIN) {
    out[title] = line.slice(offset, offset + width).trim();
    offset += width;
  }
  return out;
};

test('the piped roster ends with the same TOTAL line, with no escapes', () => {
  const out = renderPlain(stateOf());
  assert.ok(!out.includes(ESC), 'a redirect gets no escapes, ever');

  const lines = out.split('\n');
  const header = lines.findIndex((l) => l.startsWith('GAME'));
  assert.deepEqual(Object.keys(plainCells(lines[header])), Object.values(plainCells(lines[header])));
  const total = lines.findIndex((l) => l.startsWith('TOTAL'));
  assert.equal(total, header + 5, 'after all four games');
  assert.deepEqual(plainCells(lines[total]), {
    GAME: 'TOTAL (4 games)', NOW: '9', BETS: '2,000', 'BETS/5m': '+40', PLAYERS: '',
    TURNOVER: '$260,000.00', 'TURN/5m': '+$600.00', PROFIT: '-$900.00', 'PROFIT/5m': '-$10.00',
    'DAY TURN': '$1,800.00', 'DAY PROFIT': '-$30.00', EXPECTED: '$525.00', RTP: '103.46%',
  });
  assert.equal(lines[total + 1] ?? '', '', 'nothing of the table follows it');
});

test('the piped TOTAL line of an all-pending roster is dashes, not zeros', () => {
  const lines = renderPlain(stateOf({ roster: [], trails: { online: [], games: {} } })).split('\n');
  const cells = plainCells(lines.find((l) => l.startsWith('TOTAL')));
  assert.equal(cells.NOW, '9');
  assert.equal(cells.PLAYERS, '');
  for (const title of ['BETS', 'BETS/5m', 'TURNOVER', 'TURN/5m', 'PROFIT', 'PROFIT/5m', 'DAY TURN', 'DAY PROFIT', 'EXPECTED', 'RTP']) {
    assert.equal(cells[title], '-', title);
  }
});

test('the TOTAL row and the header lines above it report the same roster', () => {
  const state = stateOf();
  const t = totalsOf(state.rows);
  assert.deepEqual(rosterTotals(state), { turnover: t.turnoverUsd, profit: t.profitUsd });
  assert.deepEqual(dayTotals(state), { turnover: t.dayTurnoverUsd, profit: t.dayProfitUsd, count: t.dayCount });

  const frame = renderFrame(state, { cols: 160, rows: 30 }).map(strip);
  const cells = cellsOf(frame.find((l) => l.startsWith('│ TOTAL')), state, 160);
  const [, online, turnover, profit] = frame.find((l) => l.startsWith('│ online')).match(/online (\S+)\s+turnover (\S+)\s+profit (\S+)/);
  const [, dayTurnover, dayProfit] = frame.find((l) => l.startsWith('│ day since')).match(/turnover (\S+)\s+profit (\S+)/);
  assert.equal(cells.NOW, online);
  assert.equal(dollars(cells.TURNOVER), dollars(turnover));
  assert.equal(dollars(cells.PROFIT), dollars(profit));
  assert.equal(dollars(cells['DAY TURN']), dollars(dayTurnover));
  assert.equal(dollars(cells['DAY PROFIT']), dollars(dayProfit));

  const plain = renderPlain(state).split('\n');
  const piped = plainCells(plain.find((l) => l.startsWith('TOTAL')));
  const [, pipedDayTurnover, pipedDayProfit] = plain.find((l) => l.startsWith('day since')).match(/turnover (\S+)\s+profit (\S+)/);
  assert.equal(dollars(piped['DAY TURN']), dollars(pipedDayTurnover));
  assert.equal(dollars(piped['DAY PROFIT']), dollars(pipedDayProfit));
});

test('NOW sums the rows it totals, so a dark title with players is in the header online and not the table', () => {
  // The header's "online" is every catalogue title's players; the table only
  // has rows for live ones. A dark title reporting players is the one case
  // the two part company - and the TOTAL row has to match the column above it.
  const state = stateOf({ catalogue: [...CATALOGUE, { slug: 'tweaker-park', isLive: false, onlinePlayers: 2 }] });
  assert.equal(state.online, 11);
  assert.equal(cellsOf(totalLine(renderRoster(state, boxer(160), 160, 20)), state, 160).NOW, '9');
});

test('the TOTAL row is not a game: the cursor never lands on it', () => {
  const state = stateOf();
  renderRoster(state, boxer(160), 160, 20);
  assert.equal(state.rows.length, 4, 'drawing the total must not add it to the rows');
  const app = new DashboardApp({ client: null, keys: {}, config: { detect: { window: 36 }, pollMinutes: 5 } });
  app.state = state;
  assert.deepEqual(app.gameNames(), ['berry', 'neon-city-heist', 'lunar-blossom', 'hippo-hustle']);
});

// --- Lifetime turnover ----------------------------------------------------
//
// The `lifetime` snapshot is the same roster endpoint read over
// `lifetimeStart`..today, on its own hourly cadence. That cadence is the whole
// reason the null discipline matters here: every OTHER figure on a row is
// refreshed every tick, so "missing" can only mean the game is new, while a
// lifetime figure can be missing on a game that has traded for months.
//
// berry   $9,000.00 lifetime, nwo $3,000.00, lunar-blossom absent from the
// snapshot, and `retired-title` present in it but gone from the roster.
// Snapshot sum: $9,000 + $3,000 + $500 = $12,500. Roster column sum, which is
// a different question: $9,000 + $3,000 = $12,000.
const LIFETIME = [
  { slug: 'berry', stats: { turnover: 9_000_000_000 } },
  { slug: 'neon-city-heist', stats: { turnover: 3_000_000_000 } },
  { slug: 'retired-title', stats: { turnover: 500_000_000 } },
];
const withLifetime = (data, over = {}) => ({ ...dashboardOf(over), lifetime: data === null ? null : { ok: true, ts: NOW, data } });

test('lifetime turnover is attached per slug, and absent where the snapshot does not list it', () => {
  const state = buildState(withLifetime(LIFETIME), TRAILS, NOW, { ...config, lifetimeStart: '2026-07-24' });
  const by = Object.fromEntries(state.rows.map((r) => [r.name, r]));
  assert.equal(by.berry.lifetimeTurnoverUsd, 9000);
  assert.equal(by.berry.lifetimeTurnover, 9_000_000_000);
  assert.equal(by['neon-city-heist'].lifetimeTurnoverUsd, 3000);
  // Listed on the roster, missing from the lifetime snapshot: null, because
  // Number(undefined) would put $0.00 beside a $40,000 month-to-date figure.
  assert.equal(by['lunar-blossom'].lifetimeTurnoverUsd, null);
  assert.equal(by['lunar-blossom'].lifetimeTurnover, null);
});

test('a live game with no roster row still shows the turnover it took in an earlier month', () => {
  // hippo-hustle is live, has taken nothing THIS month (so the month-to-date
  // roster omits it), and took $750.00 before that. Every other figure on the
  // row stays null; this one is measured.
  const data = [...LIFETIME, { slug: 'hippo-hustle', stats: { turnover: 750_000_000 } }];
  const pending = buildState(withLifetime(data), TRAILS, NOW, config).rows.find((r) => r.name === 'hippo-hustle');
  assert.equal(pending.pending, true);
  assert.equal(pending.turnoverUsd, null);
  assert.equal(pending.dayTurnoverUsd, null);
  assert.equal(pending.lifetimeTurnoverUsd, 750);
});

test('a pending game the lifetime snapshot does not list keeps every figure null', () => {
  const pending = buildState(withLifetime(LIFETIME), TRAILS, NOW, config).rows.find((r) => r.name === 'hippo-hustle');
  assert.equal(pending.lifetimeTurnoverUsd, null);
  assert.equal(pending.lifetimeTurnover, null);
});

test('the team lifetime figure comes from the snapshot, so a delisted title still counts', () => {
  const state = buildState(withLifetime(LIFETIME), TRAILS, NOW, { ...config, lifetimeStart: '2026-07-24' });
  // $12,500: the snapshot's three rows, including retired-title, which has no
  // roster row at all. The COLUMN sums to $12,000 - a different question
  // (what the current roster took) with a different, also-correct answer.
  assert.equal(state.lifetime.turnover, 12_500);
  assert.equal(totalsOf(state.rows).lifetimeTurnoverUsd, 12_000);
  assert.equal(state.lifetime.from, '2026-07-24');
  assert.equal(state.lifetime.ts, NOW);
  assert.equal(state.lifetime.games, 3);
});

test('no lifetime snapshot is null, not zero, on the total and on every row', () => {
  for (const snapshot of [null, [], undefined]) {
    const state = buildState(withLifetime(snapshot ?? null), TRAILS, NOW, config);
    assert.equal(state.lifetime.turnover, null, `snapshot ${JSON.stringify(snapshot)}`);
    assert.equal(state.lifetime.games, 0);
    assert.equal(totalsOf(state.rows).lifetimeTurnoverUsd, null);
    for (const row of state.rows) assert.equal(row.lifetimeTurnoverUsd, null, row.name);
  }
});

test('a lifetime row whose turnover is null or empty is unmeasured, not a zero', () => {
  // The API has been observed returning a present-but-null metric, and
  // Number(null) === 0 - the coercion that has already produced confident
  // zeros elsewhere in this project.
  const data = [{ slug: 'berry', stats: { turnover: null } }, { slug: 'neon-city-heist', stats: { turnover: '' } },
    { slug: 'lunar-blossom', stats: { turnover: 40_000_000 } }];
  const state = buildState(withLifetime(data), TRAILS, NOW, config);
  const by = Object.fromEntries(state.rows.map((r) => [r.name, r]));
  assert.equal(by.berry.lifetimeTurnoverUsd, null);
  assert.equal(by['neon-city-heist'].lifetimeTurnoverUsd, null);
  assert.equal(by['lunar-blossom'].lifetimeTurnoverUsd, 40);
  // Only the one measured row reaches the total.
  assert.equal(state.lifetime.turnover, 40);
  assert.equal(state.lifetime.games, 1);
});

test('a measured lifetime turnover of zero stays a zero', () => {
  const state = buildState(withLifetime([{ slug: 'berry', stats: { turnover: 0 } }]), TRAILS, NOW, config);
  assert.equal(state.rows.find((r) => r.name === 'berry').lifetimeTurnoverUsd, 0);
  assert.equal(state.lifetime.turnover, 0);
  assert.equal(state.lifetime.games, 1);
});

test('each row carries the roster\'s revenue rate in basis points, and a roster that reports none reads as unknown, not 0%', () => {
  const roster = [
    { name: 'Berry', slug: 'berry', stats: { count: 1, turnover: 1_000_000, profit: 0, expectedProfit: 0, unique: 1, rate: 1000, revenueShare: 0 } },
    { name: 'Neon City Heist', slug: 'neon-city-heist', stats: { count: 1, turnover: 1_000_000, profit: 0, expectedProfit: 0, unique: 1, rate: 500, revenueShare: 0 } },
    { name: 'Lunar Blossom', slug: 'lunar-blossom', stats: { count: 1, turnover: 1_000_000, profit: 0, expectedProfit: 0, unique: 1 } },
  ];
  const by = Object.fromEntries(stateOf({ roster }).rows.map((r) => [r.name, r]));
  assert.equal(by.berry.rate, 1000);
  assert.equal(by['neon-city-heist'].rate, 500);
  assert.equal(by['lunar-blossom'].rate, null, 'absent is not zero');
  const pending = stateOf({ roster, catalogue: [...CATALOGUE, { name: 'Hippo Hustle', slug: 'hippo-hustle', isLive: true, published: true, stats: null, onlinePlayers: 0 }] }).rows.find((r) => r.name === 'hippo-hustle');
  assert.equal(pending?.rate, null, 'a pending row has no rate');
});
