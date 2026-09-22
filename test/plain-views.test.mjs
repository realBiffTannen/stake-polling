import { test } from 'node:test';
import assert from 'node:assert/strict';
import { renderPlain, VIEWS } from '../src/tui/views/plain.mjs';
import { buildModeRows } from '../src/tui/mode-rows.mjs';
import { loadMathModel } from '../src/tui/math.mjs';
import { initialNav, LEVEL } from '../src/tui/nav.mjs';
import { DashboardApp } from '../src/tui/app.mjs';
import { metroGameStats, gameStats } from './fixtures/live.mjs';

const ESC = String.fromCharCode(27);
const NOW = Date.parse('2026-09-16T15:00:00Z');
const config = { money: { unitsPerDollar: 1_000_000, profitShare: 0.1, expectedShare: 0.075 }, dayBoundaryUtcHour: 12 };
const mathModel = loadMathModel(new URL('./fixtures/math.json', import.meta.url).pathname);

const modeRows = buildModeRows({
  snapshot: { ok: true, data: metroGameStats }, modeTrail: [],
  gameRow: { turnover: 19_042_500_000, count: 55_462, profit: -103_087_500 },
  now: NOW, config, mathModel, slug: 'metro-night-run',
});

const state = {
  now: NOW, money: config.money, rows: [], alerts: [], events: [], summaries: [],
  meta: {}, dayFrom: Date.parse('2026-09-16T12:00:00Z'), dayCoverage: {},
  gameTrails: {}, modeTrails: {}, perGame: {}, modeRows, mathModel, config,
  nav: { ...initialNav(), level: LEVEL.GAME, game: 'metro-night-run', tab: 'health' },
};

test('VIEWS names every reachable view', () => {
  assert.deepEqual(VIEWS, ['roster', 'health', 'live', 'today', 'buckets', 'mode', 'compare', 'daily']);
});

test('plain output carries no escape codes at all', () => {
  assert.doesNotMatch(renderPlain(state), new RegExp(`${ESC}\\[`));
});

test('the health view prints every mode', () => {
  const out = renderPlain(state);
  for (const mode of ['BASE', 'ANTE', 'VIPER_VAULT', 'COASTAL_CRUISER', 'ICY_SPINOUT']) {
    assert.match(out, new RegExp(mode));
  }
});

// --- the HEALTH money VALUE, pinned - the plain equivalent of the same gap
// pinned in test/views-game.test.mjs (review finding #9): nothing previously
// asserted a HEALTH money VALUE for the piped renderer either. BASE's raw
// turnover in the fixture is 12_000_000_000 (micro-dollars) = $12,000.00
// exactly - a re-division by `unitsPerDollar` would silently produce $0.01.
test('the health view prints the already-converted turnover as-is, not divided again', () => {
  const out = renderPlain(state);
  assert.match(out, /\$12,000\.00/, 'BASE turnover must read $12,000.00, not $0.01 (re-divided by 1,000,000)');
});

test('the health view shows the EDGE_API column the spec calls for', () => {
  const out = renderPlain(state);
  assert.match(out, /EDGE_API/);
});

// --- plain compare, end to end (review finding #10) ------------------------
//
// `--view compare --mode ANTE` is advertised in both the design spec and the
// README, but `renderPlain` at `LEVEL.COMPARE` had ZERO tests before this -
// `renderComparePlain`'s only exercise was the hand-rolled `compareModeRows`
// it used to carry, which duplicated `views/compare.mjs`'s `matchingRows` and
// was itself untested. metro-night-run runs ANTE; pixel-carnivals (`gameStats`)
// does not, so this also exercises the "omitted, not shown blank" contract.
const comparePerGame = {
  'metro-night-run': { ok: true, data: metroGameStats },
  'pixel-carnivals': { ok: true, data: gameStats },
};

const compareState = {
  now: NOW, money: config.money, alerts: [], events: [], summaries: [],
  meta: {}, dayFrom: Date.parse('2026-09-16T12:00:00Z'), dayCoverage: {},
  gameTrails: {}, modeTrails: {}, perGame: comparePerGame, mathModel, config,
  rows: [
    { name: 'metro-night-run', turnover: 19_042_500_000, count: 55_462, profit: -103_087_500 },
    { name: 'pixel-carnivals', turnover: 11_375_810_600, count: 13_714, profit: 1_152_644_275 },
  ],
  nav: { ...initialNav(), level: LEVEL.COMPARE, compareMode: 'ANTE' },
};

test('plain compare renders end to end: the mode, the running game, and converted dollar values', () => {
  const out = renderPlain(compareState);
  assert.match(out, /compare\s+mode\s+ANTE/);
  assert.match(out, /metro-night-run/);
  // ANTE: turnover 4_560_000_000 raw = $4,560.00; profit 205_200_000 raw x
  // the 10% studio share = +$20.52 - both already-converted dollar figures,
  // not the raw micro-dollar numbers.
  assert.match(out, /\$4,560\.00/);
  assert.match(out, /\+\$20\.52/);
});

test('plain compare omits a game that does not run the mode, rather than showing it blank', () => {
  const out = renderPlain(compareState);
  assert.doesNotMatch(out, /pixel-carnivals/, 'pixel-carnivals has no ANTE mode in this fixture');
});

test('plain compare says so when no game runs the mode at all', () => {
  const out = renderPlain({ ...compareState, nav: { ...compareState.nav, compareMode: 'NOBODY_RUNS_THIS' } });
  assert.match(out, /no game is running this bet mode/);
});

test('the mode view prints one mode in full', () => {
  const out = renderPlain({ ...state, nav: { ...state.nav, level: LEVEL.MODE, mode: 'VIPER_VAULT' } });
  assert.match(out, /VIPER_VAULT/);
  assert.match(out, /n=812|812/);
});

// --- money units: the trap named in the task-13 brief ---------------------
//
// `dTurnover`/`dProfit`/`dayTurnover`/`dayProfit` on a mode row are RAW
// micro-dollars and must be divided by `unitsPerDollar`; `turnoverUsd` etc.
// are already dollars and must not be divided again. Getting this backwards
// scales a figure by 1,000,000x while it still looks like a plausible number,
// so this asserts the actual converted value, not just its presence.
test('the live tab converts raw per-poll deltas, not the already-converted totals', () => {
  const withTrail = buildModeRows({
    snapshot: { ok: true, data: metroGameStats },
    modeTrail: [
      { ts: NOW - 5 * 60000, fields: { 'BASE:turnover': 12_000_000_000, 'BASE:profit': -420_000_000, 'BASE:count': 48000 } },
      { ts: NOW, fields: { 'BASE:turnover': 12_005_000_000, 'BASE:profit': -419_500_000, 'BASE:count': 48210 } },
    ],
    gameRow: { turnover: 19_042_500_000, count: 55_462, profit: -103_087_500 },
    now: NOW, config, mathModel, slug: 'metro-night-run',
  });
  const out = renderPlain({
    ...state,
    modeRows: withTrail,
    nav: { ...state.nav, tab: 'live' },
  });
  const line = out.split('\n').find((l) => l.startsWith('BASE'));
  assert.ok(line, `expected a BASE row, got:\n${out}`);
  // dTurnover raw delta is 5,000,000 micro-dollars = $5.00, not $5,000,000.00.
  assert.match(line, /\+\$5\.00\b/, line);
  assert.ok(!line.includes('5,000,000'), `raw micro-dollars leaked through unconverted: ${line}`);
});

// --- setView: the nav.level regression named in the task-13 brief ---------
//
// A regression was fixed where `set focus`/`set bucket` moved the game but
// left `nav.level` at ROSTER, so `needsModeTrail()` (which gates purely on
// level) never asked for the per-mode trail. `setView` must not reintroduce
// that shape of bug for the flag path.
const appConfig = { detect: { window: 36 }, pollMinutes: 5 };

test('setView raises nav.level to GAME, not just the game slug', () => {
  const app = new DashboardApp({ client: null, keys: {}, config: appConfig });
  assert.equal(app.needsModeTrail(), false, 'a fresh app has not requested anything yet');

  app.setView({ view: 'health', game: 'x' });

  assert.equal(app.nav.level, LEVEL.GAME);
  assert.equal(app.nav.tab, 'health');
  assert.equal(app.nav.game, 'x');
  assert.equal(app.needsModeTrail(), true);
});

test('setView reaches the mode and compare levels, and back to the roster', () => {
  const app = new DashboardApp({ client: null, keys: {}, config: appConfig });

  app.setView({ view: 'mode', game: 'x', mode: 'BASE' });
  assert.equal(app.nav.level, LEVEL.MODE);
  assert.equal(app.nav.game, 'x');
  assert.equal(app.nav.mode, 'BASE');
  assert.equal(app.needsModeTrail(), true);

  app.setView({ view: 'compare', mode: 'BASE' });
  assert.equal(app.nav.level, LEVEL.COMPARE);
  assert.equal(app.nav.compareMode, 'BASE');

  app.setView({ view: 'roster' });
  assert.equal(app.nav.level, LEVEL.ROSTER);
});

test('setView reproduces the old --bucket/--game flag path exactly', () => {
  const app = new DashboardApp({ client: null, keys: {}, config: appConfig });
  app.bucket = '1h';
  app.setView({ view: 'buckets', game: 'pixel-carnivals', mode: null });

  assert.equal(app.nav.level, LEVEL.GAME);
  assert.equal(app.nav.tab, 'buckets');
  assert.equal(app.nav.game, 'pixel-carnivals');
  assert.equal(app.nav.bucket, '1h');
});

// --- unknown --game/--mode vs. a known one with no data yet (Ruling 22) ---
//
// --game/--mode deliberately never hard-exit: `metro-night-run` is a real
// catalogue slug that is `isLive:false`, so it is legitimately absent from
// the live roster and `state.perGame` - validating against either would
// reject that real case. Only the MESSAGE has to tell a typo apart from a
// known game/mode that simply has no data yet.
const knownGames = ['berry', 'metro-night-run', 'pixel-carnivals'];

test('a --game slug found nowhere in the data says so and lists what is available', () => {
  const typo = {
    ...state, modeRows: [], perGame: {}, knownGames,
    nav: { ...initialNav(), level: LEVEL.GAME, game: 'pixel-carnaval', tab: 'health' },
  };
  const out = renderPlain(typo);
  assert.match(out, /unknown game "pixel-carnaval"/);
  assert.match(out, /berry/);
  assert.match(out, /metro-night-run/);
  assert.match(out, /pixel-carnivals/);
});

test('a --game slug that IS known but has no per-mode data keeps the old wording', () => {
  const darkGame = {
    ...state, modeRows: [], perGame: {}, knownGames,
    nav: { ...initialNav(), level: LEVEL.GAME, game: 'metro-night-run', tab: 'health' },
  };
  const out = renderPlain(darkGame);
  assert.match(out, /no per-mode data for this game yet/);
  assert.doesNotMatch(out, /unknown (game|bet mode)/i);
});

test('without state.knownGames the old wording is kept, never a false "unknown"', () => {
  const noEvidence = {
    ...state, modeRows: [], perGame: {},
    nav: { ...initialNav(), level: LEVEL.GAME, game: 'anything-at-all', tab: 'health' },
  };
  const out = renderPlain(noEvidence);
  assert.match(out, /no per-mode data for this game yet/);
  assert.doesNotMatch(out, /unknown (game|bet mode)/i);
});

test('a --mode name absent from the captured math model says so and lists the real modes', () => {
  const typoMode = {
    ...state, knownGames,
    nav: { ...initialNav(), level: LEVEL.MODE, game: 'metro-night-run', mode: 'NOT_A_REAL_MODE' },
  };
  const out = renderPlain(typoMode);
  assert.match(out, /unknown bet mode "NOT_A_REAL_MODE"/);
  assert.match(out, /BASE/);
  assert.match(out, /ANTE/);
});

test('a real captured --mode this state has no row for keeps the old wording, not "unknown"', () => {
  const withoutAnte = {
    ...state, knownGames, modeRows: modeRows.filter((r) => r.mode !== 'ANTE'),
    nav: { ...initialNav(), level: LEVEL.MODE, game: 'metro-night-run', mode: 'ANTE' },
  };
  const out = renderPlain(withoutAnte);
  assert.match(out, /no data for this bet mode yet/);
  assert.doesNotMatch(out, /unknown (game|bet mode)/i);
});

test('a --mode request against an unknown game reports the game as unknown, not the mode', () => {
  const unknownGame = {
    ...state, knownGames, modeRows: [],
    nav: { ...initialNav(), level: LEVEL.MODE, game: 'pixel-carnaval', mode: 'BASE' },
  };
  const out = renderPlain(unknownGame);
  assert.match(out, /unknown game "pixel-carnaval"/);
  assert.doesNotMatch(out, /unknown bet mode/);
});
