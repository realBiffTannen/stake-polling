import { test } from 'node:test';
import assert from 'node:assert/strict';
import { renderAnalysis } from '../src/web/views/analysis.mjs';

const money = { unitsPerDollar: 1_000_000, profitShare: 0.1, expectedShare: 0.075 };
const now = Date.parse('2026-09-22T01:30:00Z');
const M = 60000;
const midnight = Date.parse('2026-09-22T00:00:00Z');
// Month-to-date says berry is UP; the trail since midnight says it is DOWN.
const rows = [
  { name: 'berry', label: 'Berry', count: 1000, turnoverUsd: 5000, profitUsd: 100, online: 3 },
  { name: 'pixel-geyser', label: 'Pixel Geyser', count: 500, turnoverUsd: 2500, profitUsd: -40, online: 1 },
];
const gameTrails = {
  berry: [
    { ts: midnight - 20 * M, fields: { count: 900, turnover: 4_000_000_000, profit: 2_000_000_000 } },
    { ts: midnight + 20 * M, fields: { count: 950, turnover: 4_500_000_000, profit: 1_500_000_000 } },
    { ts: midnight + 80 * M, fields: { count: 1000, turnover: 5_000_000_000, profit: 1_000_000_000 } },
  ],
};
const modeRows = { berry: [{ mode: 'BASE', cost: 1, count: 900, turnover: 3_000_000_000, profit: 900_000_000, rtp: 0.965 },
  { mode: 'BONUS', cost: 200, count: 100, turnover: 2_000_000_000, profit: 100_000_000, rtp: 0.965 }] };
const math = { berry: { edge: 0.035, modes: { BASE: { rtp: 0.965, sigma: 9.58 }, BONUS: { rtp: 0.965, sigma: 1.2 } } } };
const onlineTrail = [{ ts: midnight + 20 * M, fields: { onlinePlayers: 4 } }, { ts: midnight + 80 * M, fields: { onlinePlayers: 7 } }];
const model = { daily: [{ date: '2026-09-21', profit: 12, measured: true }, { date: '2026-09-22', profit: -3, measured: true, current: true }] };
const state = { meta: { team: 'acme-studios' }, stale: false, ageMs: 0, now, money, rows, gameTrails, modeRows, modeTrails: {}, math, onlineTrail };
const render = (span, over = {}) => String(renderAnalysis({ state: { ...state, ...over }, model, span }));

test('the picker offers this month, today and every rolling window, and marks the one in use', () => {
  const out = render('today');
  assert.match(out, /href="\/analysis\?span=today" class="selected"/);
  const labels = [...out.matchAll(/href="\/analysis\?span=([^"]+)"[^>]*>([^<]+)</g)].map(([, key, label]) => `${key}:${label}`);
  assert.deepEqual(labels, ['month:This month', 'today:Today', '1h:Last 1h', '3h:Last 3h', '6h:Last 6h', '24h:Last 24h', '3d:Last 3 days']);
});

test('last 1h reads the trail from an hour back, and its hourly charts name the clock hour they start at', () => {
  // now 01:30Z, so the window opens at 00:30Z: only the 01:20Z step is inside it.
  const out = render('1h');
  assert.match(out, /Net -\$50\.00 across 1 game/);
  assert.match(out, /The rolling hour to 01:30/);
  assert.match(out, /Since 00:00Z: running studio P\/L/);
  assert.match(out, /the chart starts at 00:00Z/);
});

test('last 3 days reads the span\'s own deeper trail, not the shared 24-hour one', () => {
  const deep = { berry: [{ ts: now - 80 * 3_600_000, fields: { count: 0, turnover: 0, profit: 0 } }, ...gameTrails.berry] };
  const out = render('3d', { spanTrails: { games: deep, modes: {}, online: onlineTrail } });
  // berry over the deeper trail: profit 0 -> 1e9 gross = +$1,000 gross = +$100 studio
  assert.match(out, /Net \+\$100\.00 across 1 game/);
  assert.match(out, /The rolling 3 days to/);
  assert.doesNotMatch(out, /trail only reaches back to/i);
  assert.match(render('3d'), /trail only reaches back to/i, 'without it, the 24-hour trail is called out as short');
});

test('four donuts break the period down by game: bets, turnover, profit gains and profit losses', () => {
  const out = render('month');
  for (const h of ['Share of bets', 'Share of turnover', 'Profit gains', 'Profit losses']) assert.match(out, new RegExp(`<h2>${h}</h2>`), h);
  assert.ok((out.match(/class="chart donut"/g) ?? []).length === 4);
});

test('every chart states its conclusion in words', () => {
  const out = render('month');
  assert.ok((out.match(/class="conclusion"/g) ?? []).length >= 10, String((out.match(/class="conclusion"/g) ?? []).length));
});

test('this month reads the API month-to-date figures', () => {
  assert.match(render('month'), /Net \+\$60\.00 across 2 games/);
});

test('today reads the trail from 00:00:00Z, not the month-to-date figures', () => {
  const out = render('today');
  // berry since midnight: profit 2e9 -> 1e9 gross = -$1,000 gross = -$100 studio
  assert.match(out, /Net -\$100\.00 across 1 game/);
  assert.match(out, /since 00:00:00Z/);
});

test('a span the trail only partly covers says so', () => {
  const short = { berry: gameTrails.berry.slice(1) };
  assert.match(render('24h', { gameTrails: short }), /trail only reaches back to/i);
});

test('the daily P/L chart stays on the month whatever span is picked', () => {
  assert.match(render('today'), /1 of 2 measured days ended at or above zero/);
});

test('nothing measured reads as nothing measured, never as zero', () => {
  const out = render('today', { gameTrails: {}, onlineTrail: [] });
  assert.match(out, /Nothing measured in this period yet/);
  assert.doesNotMatch(out, /NaN/);
});

test('the analysis page renders without NaN for any span', () => {
  for (const span of ['month', 'today', '1h', '3h', '6h', '24h', '3d']) assert.doesNotMatch(render(span), /NaN|undefined/, span);
});

// ------------------------------------------------ derived data points
test('analysis adds hold against theory, buy economics and player worth by game, quiet share, unusual days and the tape', () => {
  const out = render('month');
  for (const h of ['Realised against theoretical hold', 'Buy economics by game', 'Player worth by game', 'Quiet share', 'Unusual days', 'The tape']) {
    assert.match(out, new RegExp(`<h2>${h}</h2>`), h);
  }
  assert.match(out, /house kept/, 'hold headline');
  assert.doesNotMatch(out, /NaN|undefined/);
});

test('player worth stays on the month - players are only counted month-to-date', () => {
  assert.match(render('today'), /Player worth by game[\s\S]*month-to-date/);
});
