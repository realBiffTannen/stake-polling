import { test } from 'node:test';
import assert from 'node:assert/strict';
import { renderGamePage } from '../src/web/views/game.mjs';

const state = { meta: { team: 'acme-studios' }, stale: false, ageMs: 0, now: Date.parse('2026-09-19T12:00:00Z'),
  money: { unitsPerDollar: 1_000_000, profitShare: 0.1, expectedShare: 0.075 } };
const model = { games: [{ slug: 'pixel-geyser', name: 'Pixel Geyser', players: 40, newPlayers: 10, returningPlayers: 30, turnover: 900, profit: -12, count: 1000 }],
  daily: [{ date: '2026-09-18', players: 40, newPlayers: 10, returningPlayers: 30, turnover: 900, profit: -12, measured: true }],
  options: [{ slug: 'pixel-geyser', name: 'Pixel Geyser' }], from: '2026-09-18', to: '2026-09-19', game: 'pixel-geyser', totals: {} };
const math = { edge: 0.033, maxWin: 10000, version: 8, baseVolatility: 11.19, volatilityClass: 'MEDIUM', costLadder: [1, 35],
  modes: { BASE: { cost: 1, rtp: 0.967, sigma: 11.1874, zeroRate: 0.944, worstLossStreak: 120 } } };
const modeRows = [{ mode: 'BASE', count: 1000, turnover: 1000_000_000, profit: 3_300_000, rtp: 0.967, expectedReturn: 33_000_000, cost: 1, avgBet: 0.4 }];

test('the page states the captured math version and volatility', () => {
  const out = String(renderGamePage({ slug: 'pixel-geyser', model, state, math, modeRows, modeDays: {} }));
  assert.match(out, /Version 8/);
  assert.match(out, /MEDIUM/);
  assert.match(out, /11\.19/);
});

test('the page links to its bucket-cadence drilldown', () => {
  const out = String(renderGamePage({ slug: 'pixel-geyser', model, state, math, modeRows, modeDays: {} }));
  assert.match(out, /href="\/game\/pixel-geyser\/buckets/);
});

test('every mode links to its own drilldown', () => {
  const out = String(renderGamePage({ slug: 'pixel-geyser', model, state, math, modeRows, modeDays: {} }));
  assert.match(out, /href="\/game\/pixel-geyser\/mode\/BASE/);
});

test('a game with no captured math says so instead of showing a blank card', () => {
  const out = String(renderGamePage({ slug: 'lunar-blossom', model, state, math: null, modeRows, modeDays: {} }));
  assert.match(out, /No captured math model/i);
});

test('a loss renders red and a win green', () => {
  const out = String(renderGamePage({ slug: 'pixel-geyser', model, state, math, modeRows, modeDays: {} }));
  assert.match(out, /class="bad"/);
});

test('an untrusted mode name cannot inject markup', () => {
  const nasty = [{ mode: '<img src=x onerror=1>', count: 5, turnover: 5, profit: 1, rtp: 0.9, cost: 1 }];
  const out = String(renderGamePage({ slug: 'pixel-geyser', model, state, math, modeRows: nasty, modeDays: {} }));
  assert.doesNotMatch(out, /<img src=x/);
});

// Two modes, so the total row has something to add up. Profit is in
// micro-dollars at the 10% studio share: 3.3e6 -> $0.33, -13.3e6 -> -$1.33.
const twoModes = [
  { mode: 'BASE', count: 1000, turnover: 1000_000_000, profit: 3_300_000, rtp: 0.967, cost: 1, avgBet: 0.4 },
  { mode: 'BONUS0', count: 10, turnover: 350_000_000, profit: -13_300_000, rtp: 0.967, cost: 35, avgBet: 1 },
];

test('the bet-mode table is the first thing on the page, ahead of the math card', () => {
  const out = String(renderGamePage({ slug: 'pixel-geyser', model, state, math, modeRows: twoModes, modeDays: {} }));
  assert.ok(out.indexOf('Bet modes') > 0);
  assert.ok(out.indexOf('Bet modes') < out.indexOf('Captured math'), 'modes before math');
  assert.ok(out.indexOf('Bet modes') < out.indexOf('metric-grid'), 'modes before the player cards');
});

test('the bet-mode table ends in a total of bets, turnover and studio profit/loss', () => {
  const out = String(renderGamePage({ slug: 'pixel-geyser', model, state, math, modeRows: twoModes, modeDays: {} }));
  const foot = out.slice(out.indexOf('<tfoot>'), out.indexOf('</tfoot>'));
  assert.match(foot, /Total/);
  assert.match(foot, />1,010</, 'bets 1000 + 10');
  assert.match(foot, /\$1,350\.00/, 'turnover 1000 + 350');
  assert.match(foot, /<span class="bad">-\$1\.00<\/span>/, 'studio profit 0.33 - 1.33');
});

test('a total over modes that measured no profit is a dash, not $0.00', () => {
  const unmeasured = twoModes.map(r => ({ ...r, profit: null }));
  const out = String(renderGamePage({ slug: 'pixel-geyser', model, state, math, modeRows: unmeasured, modeDays: {} }));
  assert.ok(out.includes('<tfoot>'), 'the total row still renders - bets were measured');
  const foot = out.slice(out.indexOf('<tfoot>'), out.indexOf('</tfoot>'));
  assert.match(foot, />1,010</);
  assert.doesNotMatch(foot, /\$0\.00/);
});

test('the player-insights link goes to /insights, not the root', () => {
  const out = String(renderGamePage({ slug: 'pixel-geyser', model, state, math, modeRows, modeDays: {} }));
  assert.match(out, /href="\/insights\?game=pixel-geyser"/);
});

const notLive = { ...state, titles: [{ slug: 'metro-night-run', name: 'Metro Night Run', isLive: false, published: true, approval: 'new' }] };
const metroMath = { edge: 0.045, maxWin: 50000, version: 6, baseVolatility: 45.7, volatilityClass: 'EXTREME', costLadder: [1, 3],
  modes: { BASE: { cost: 1, rtp: 0.955 }, ANTE: { cost: 3, rtp: 0.955 } } };

test('a title that is not live yet says so, under its catalogue name', () => {
  const out = String(renderGamePage({ slug: 'metro-night-run', model, state: notLive, math: metroMath, modeRows: [], modeDays: {} }));
  assert.match(out, /Metro Night Run/);
  assert.match(out, /not live/i);
  assert.match(out, /no play data/i);
});

test('a title that is not live lists its captured modes, with no play figures and no drilldown links', () => {
  const out = String(renderGamePage({ slug: 'metro-night-run', model, state: notLive, math: metroMath, modeRows: [], modeDays: {} }));
  assert.match(out, /2 modes/);
  assert.match(out, />ANTE</);
  assert.match(out, />3x</);
  assert.match(out, /95\.50%/);
  assert.doesNotMatch(out, /\/mode\//, 'there is no per-mode response to drill into');
  assert.doesNotMatch(out, /<tfoot>/, 'nothing was played, so there is nothing to total');
});

test('a live game with an empty per-mode response is NOT padded out with captured modes', () => {
  const out = String(renderGamePage({ slug: 'pixel-geyser', model, state, math, modeRows: [], modeDays: {} }));
  assert.match(out, /0 modes/);
});

// ------------------------------------------------------ picker and charts
const nowT = Date.parse('2026-09-22T01:30:00Z');
const mid = Date.parse('2026-09-22T00:00:00Z');
const MIN = 60000;
const spanState = { ...state, now: nowT,
  // Every 10 minutes, as a live trail is (every 2.5): hour-apart samples read as collector outages.
  gameTrails: { 'pixel-geyser': Array.from({ length: 11 }, (_, i) => ({ ts: mid - 20 * MIN + i * 10 * MIN,
    fields: { count: 900 + i * 11, turnover: 900_000_000 + i * 45_000_000, profit: 30_000_000 - i * 4_000_000 } })) },
  modeTrails: { 'pixel-geyser': [
    { ts: mid - 20 * MIN, fields: { 'BASE:count': 900, 'BASE:turnover': 900_000_000, 'BASE:profit': 30_000_000 } },
    { ts: mid + 20 * MIN, fields: { 'BASE:count': 950, 'BASE:turnover': 950_000_000, 'BASE:profit': 20_000_000, 'BONUS0:count': 0, 'BONUS0:turnover': 0, 'BONUS0:profit': 0 } },
    { ts: mid + 80 * MIN, fields: { 'BASE:count': 1000, 'BASE:turnover': 1_000_000_000, 'BASE:profit': 3_300_000, 'BONUS0:count': 10, 'BONUS0:turnover': 350_000_000, 'BONUS0:profit': -13_300_000 } }] } };
const page = (span, over = {}) => String(renderGamePage({ slug: 'pixel-geyser', model, state: { ...spanState, ...over }, math, modeRows: twoModes, modeDays: {}, span }));

test('a live game page carries the this month / today / last 24h picker', () => {
  const out = page('today');
  assert.match(out, /href="\/game\/pixel-geyser\?span=month"/);
  assert.match(out, /href="\/game\/pixel-geyser\?span=today" class="selected"/);
  assert.match(out, /href="\/game\/pixel-geyser\?span=24h"/);
});

test('today re-scopes the mode table to the trail since 00:00:00Z', () => {
  const foot = (out) => out.slice(out.indexOf('<tfoot>'), out.indexOf('</tfoot>'));
  assert.match(foot(page('month')), />1,010</, 'month: the API figures');
  // since midnight: BASE 1000-900 = 100 bets; BONUS0 appears inside the span, 0 -> 10
  assert.match(foot(page('today')), />110</);
});

test('the mode charts each state a conclusion', () => {
  const out = page('month');
  assert.match(out, /moved it most/);
  assert.match(out, /of bets/);
  assert.match(out, /judged mode/);
  assert.match(out, /Busiest hour/);
  assert.ok((out.match(/class="conclusion"/g) ?? []).length >= 6);
  assert.doesNotMatch(out, /NaN/);
});

test('a title that is not live has no picker and no play charts', () => {
  const out = String(renderGamePage({ slug: 'metro-night-run', model, state: notLive, math: metroMath, modeRows: [], modeDays: {}, span: 'today' }));
  assert.doesNotMatch(out, /span=today/);
  assert.doesNotMatch(out, /class="conclusion"/);
});

test('a live game page links to its own raw trail and mode trail for today as CSV', () => {
  const out = page('month');
  assert.match(out, /href="\/export\/log.csv\?source=ts%3Apixel-geyser&amp;date=2026-09-22"/);
  assert.match(out, /href="\/export\/log.csv\?source=ts%3Apixel-geyser%3Amodes&amp;date=2026-09-22"/);
});

// ------------------------------------------------ derived data points
const withLadder = { raw: { perGame: { 'pixel-geyser': { ok: true, data: { betStats: [
  { costUSD: 0.1, betCount: 900, betTurnover: 90 }, { costUSD: 1, betCount: 100, betTurnover: 100 }] } } } } };

test('a live game page adds hold against theory, buy economics, the bet ladder, players and sessions, its tape and launch checks', () => {
  const out = page('month', withLadder);
  for (const h of ['Hold against theory, mode by mode', 'Buy economics', 'Bet-size ladder', 'Players and sessions', 'The tape', 'Launch checks']) {
    assert.match(out, new RegExp(`<h2>${h}</h2>`), h);
  }
  assert.match(out, /Lifetime, by base bet size/);
  assert.match(out, /ladder_stuck|Ladder/i);
  assert.doesNotMatch(out, /NaN|undefined/);
});

test('the mode table carries the API\'s effective and normalized RTP for the month', () => {
  const rows = twoModes.map(r => ({ ...r, effectiveRtp: 0.5, normalizedRtp: 0.8 }));
  const out = String(renderGamePage({ slug: 'pixel-geyser', model, state: { ...spanState, ...withLadder }, math, modeRows: rows, modeDays: {}, span: 'month' }));
  assert.match(out, /<th>Effective RTP<\/th>/);
  assert.match(out, /<th>Normalized RTP<\/th>/);
  assert.match(out, />50\.00%</);
  assert.match(out, />80\.00%</);
});

test('a game with no bet-size data says so rather than drawing an empty ladder', () => {
  assert.match(page('month'), /No bet-size data/);
});

test('a live game page ends with its trends: players online every 2.5 minutes and the daily charts', () => {
  const out = page('month');
  assert.match(out, /<h2>Players online in Pixel Geyser, every 2\.5 minutes<\/h2>/);
  assert.match(out, /<h2>Hour of the day<\/h2>/);
});
