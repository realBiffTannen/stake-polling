import { test } from 'node:test';
import assert from 'node:assert/strict';
import { studioTrendPanels, gameTrendPanels, ONLINE_RANGES } from '../src/web/views/trend-panels.mjs';

const money = { unitsPerDollar: 1_000_000, profitShare: 0.1, expectedShare: 0.075 };
const now = Date.parse('2026-09-22T12:01:00Z');
const H = 3_600_000;
const row = (slug, i) => ({ slug, name: slug.toUpperCase(), stats: { count: 100 + i, turnover: (1000 + i * 10) * 1e6, profit: (i % 3 - 1) * 50e6, unique: 20 + i, expectedProfit: 30e6 } });
const days = {};
for (let i = 0; i < 20; i++) {
  const date = new Date(now - (19 - i) * 86_400_000).toISOString().slice(0, 10);
  days[date] = { rows: [row('berry', i), row('pixel-geyser', i)], fetchedAt: now };
}
const dailySnapshot = { trackingStart: '2026-07-24', days, cumulative: {} };
const online = Array.from({ length: 24 * 24 + 1 }, (_, i) => ({ ts: now - 24 * H + i * 150_000, fields: { onlinePlayers: 5 + (i % 7), count: 1000 + i * 3 } }));
const modeRows = { berry: [{ mode: 'BASE', cost: 1, count: 10, turnover: 100, profit: 3, rtp: 0.965 }] };
const state = { meta: { team: 'acme-studios' }, stale: false, ageMs: 0, now, money, dailySnapshot, modeRows,
  history: { online, team: online, game: online } };

test('the studio trends lead with players online every 2.5 minutes, 24 hours by default', () => {
  const out = String(studioTrendPanels({ state }));
  assert.match(out, /<h2>Players online, every 2\.5 minutes<\/h2>/);
  assert.match(out, /href="\/trends\?online=24h" class="selected"/);
  for (const r of Object.keys(ONLINE_RANGES)) assert.match(out, new RegExp(`online=${r}`));
  assert.match(out, /Peak \d+ online at/);
});

test('the studio trends chart every daily statistic over 30 days, each with its conclusion', () => {
  const out = String(studioTrendPanels({ state }));
  for (const h of ['Bets per day', 'Turnover per day', 'Studio P/L per day', 'Running studio P/L', 'Players per day', 'Average bet per day', 'Observed RTP per day', 'Turnover by game', 'Hour of the day']) {
    assert.match(out, new RegExp(`<h2>${h}</h2>`), h);
  }
  assert.ok((out.match(/class="conclusion"/g) ?? []).length >= 10);
  assert.match(out, /averaged .* a day over the last 7 complete days/);
  assert.doesNotMatch(out, /NaN|undefined/);
});

test('a longer range is thinned to 15-minute peaks and the picker marks it', () => {
  const out = String(studioTrendPanels({ state, online: '7d' }));
  assert.match(out, /href="\/trends\?online=7d" class="selected"/);
  assert.match(out, /peak/, 'hover reports the peak of each band');
});

test('a game\'s trends chart its own players online and daily statistics, keeping the span in the picker links', () => {
  const out = String(gameTrendPanels({ slug: 'berry', name: 'Berry', state, modeRows: modeRows.berry, span: 'today' }));
  assert.match(out, /<h2>Players online in Berry, every 2\.5 minutes<\/h2>/);
  assert.match(out, /href="\/game\/berry\?span=today&amp;online=24h" class="selected"/);
  for (const h of ['Bets per day', 'Turnover per day', 'Studio P/L per day', 'Running studio P/L', 'Players per day', 'Observed RTP per day', 'Hour of the day']) {
    assert.match(out, new RegExp(`<h2>${h}</h2>`), h);
  }
  assert.doesNotMatch(out, /NaN|undefined/);
});

test('with no history and no daily snapshot the panels say nothing was measured, never zero', () => {
  const out = String(studioTrendPanels({ state: { ...state, history: {}, dailySnapshot: {} } }));
  assert.match(out, /Nothing measured/);
  assert.doesNotMatch(out, /NaN|undefined/);
});

// Nine games, so two of them fall into Other and the legend must still offer them.
const manyDays = {};
for (let i = 0; i < 5; i++) {
  const date = new Date(now - (4 - i) * 86_400_000).toISOString().slice(0, 10);
  manyDays[date] = { rows: Array.from({ length: 9 }, (_, g) => ({ slug: `game-${g}`, name: `Game ${g}`, stats: { turnover: (900 - g * 100) * 1e6 } })), fetchedAt: now };
}
const manyState = { ...state, dailySnapshot: { trackingStart: '2026-07-24', days: manyDays, cumulative: {} } };
const turnoverPanel = (out) => String(out).match(/<section class="panel chart-panel" id="turnover-by-game">[\s\S]*?<\/section>/)?.[0] ?? '';

test('the turnover-by-game legend offers every game, not only the seven with a layer', () => {
  const panel = turnoverPanel(studioTrendPanels({ state: manyState }));
  assert.ok(panel, 'the panel carries an anchor the legend links back to');
  for (let g = 0; g < 9; g++) assert.match(panel, new RegExp(`href="/trends\\?turnover=game-${g}#turnover-by-game"[^>]*>[\\s\\S]*?Game ${g}`), `game-${g}`);
  assert.match(panel, /<a href="\/trends#turnover-by-game" class="selected" aria-current="true">[\s\S]*?All games/);
  assert.doesNotMatch(panel, /<rect x="[^"]+" y="2" width="10" height="10"/, 'no second, clipped legend inside the SVG');
  assert.doesNotMatch(panel, /style=/, 'the page CSP forbids inline styles: swatches are SVG fills');
});

test('picking a game from the legend draws that game alone and marks it selected', () => {
  const out = String(studioTrendPanels({ state: manyState, turnover: 'game-8' }));
  const panel = turnoverPanel(out);
  assert.match(panel, /<a href="\/trends\?turnover=game-8#turnover-by-game" class="selected" aria-current="true">/);
  assert.match(panel, /Game 8 took \$[\d,.]+ of turnover over these 5 days/);
  assert.doesNotMatch(panel, /Game 0 [$-]/, 'the other games are not in the chart');
  assert.match(out, /href="\/trends\?online=7d&amp;turnover=game-8"/, 'the players-online picker keeps the picked game');
});

test('the legend keeps the players-online range, and an unknown game falls back to all games', () => {
  const panel = turnoverPanel(studioTrendPanels({ state: manyState, online: '7d', turnover: 'no-such-game' }));
  assert.match(panel, /href="\/trends\?online=7d&amp;turnover=game-3#turnover-by-game"/);
  assert.match(panel, /<a href="\/trends\?online=7d#turnover-by-game" class="selected" aria-current="true">/);
});

test('the players-online picker offers 30m, 1h and 3h before 6h, shortest first, and a short range labels its axis by the minute', () => {
  assert.deepEqual(Object.keys(ONLINE_RANGES), ['30m', '1h', '3h', '6h', '24h', '3d', '7d']);
  const out = String(studioTrendPanels({ state, online: '30m' }));
  assert.match(out, /href="\/trends\?online=30m" class="selected"/);
  assert.match(out, /One point per 2\.5-minute poll/);
  assert.match(out, /Peak \d+ online at/);
  assert.match(out, />11:40Z</);
  assert.match(out, />11:50Z</);
  assert.doesNotMatch(out, />10:00Z</, 'nothing older than the range is drawn');
});

test('a game page offers the same short ranges', () => {
  const out = String(gameTrendPanels({ slug: 'berry', name: 'Berry', state, span: 'today', online: '1h' }));
  assert.match(out, /href="\/game\/berry\?span=today&amp;online=1h" class="selected"/);
  assert.match(out, /online=30m/);
});
