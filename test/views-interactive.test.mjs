import { test } from 'node:test';
import assert from 'node:assert/strict';
import { renderAnalysis } from '../src/web/views/analysis.mjs';
import { renderTrends } from '../src/web/views/trends.mjs';
import { GAME_COLOURS } from '../src/web/charts/donut.mjs';

const money = { unitsPerDollar: 1_000_000, profitShare: 0.1, expectedShare: 0.075 };
const usd = (dollars) => dollars * 1_000_000;
const M = 60_000, H = 3_600_000, SLOT = 150_000;

/** The JSON a page carries for chart `id`, exactly as the browser will read it. */
function chartJson(page, id) {
  const found = String(page).match(new RegExp(`<script type="application/json" id="${id}-data">([\\s\\S]*?)</script>`));
  assert.ok(found, `no data element for ${id}`);
  return JSON.parse(found[1]);
}

const now = Date.parse('2026-09-23T12:01:00Z');
const rows = [
  { name: 'berry', label: 'Berry', count: 1000, turnoverUsd: 5000, profitUsd: 100 },
  { name: 'pixel-geyser', label: 'Pixel Geyser', count: 500, turnoverUsd: 2500, profitUsd: -40 },
];
const modeRows = {
  berry: [{ mode: 'BASE', cost: 1, count: 900, turnover: usd(3000), profit: usd(90), rtp: 0.965 }, { mode: 'BONUS', cost: 200, count: 10, turnover: usd(2000), profit: usd(10), rtp: 0.965 }],
  'pixel-geyser': [{ mode: 'BASE', cost: 1, count: 500, turnover: usd(2500), profit: -usd(40), rtp: 0.96 }],
};
const baseState = { meta: { team: 'acme-studios' }, stale: false, ageMs: 0, now, money, rows, modeRows, gameTrails: {}, modeTrails: {}, math: {}, pollMinutes: 2.5 };


test('the analysis page mounts the turnover treemap and flow, with each game in its donut colour', () => {
  const out = String(renderAnalysis({ state: baseState, model: { daily: [] }, span: 'month' }));
  assert.match(out, /<h2>Turnover by game and bet mode<\/h2>\s*<p class="conclusion">Berry takes 67% of turnover this month, and BASE is 60% of that\.<\/p>/);
  assert.match(out, /<h2>Where each game&#39;s turnover flows<\/h2>\s*<p class="conclusion">\$7,500\.00 of turnover this month: \$5,500\.00 \(73%\) base play, \$2,000\.00 \(27%\) feature buys\. Every buy was in Berry\.<\/p>/);
  const tree = chartJson(out, 'turnover-tree'), flow = chartJson(out, 'turnover-flow');
  // Berry leads every donut here, so it holds slot 0.
  assert.equal(tree.nodes.find((n) => n.name === 'Berry').colour, GAME_COLOURS[0]);
  assert.equal(flow.nodes.find((n) => n.id === 'game:berry').colour, GAME_COLOURS[0]);
  assert.equal(tree.nodes.find((n) => n.name === 'Pixel Geyser').colour, flow.nodes.find((n) => n.id === 'game:pixel-geyser').colour);
  assert.match(out, /The interactive chart needs JavaScript\./);
});

test('with nothing measured the analysis panels keep their conclusion and show an empty state, not a chart', () => {
  const out = String(renderAnalysis({ state: { ...baseState, modeRows: {} }, model: { daily: [] }, span: 'month' }));
  assert.doesNotMatch(out, /data-ichart="(treemap|sankey)"/);
  assert.match(out, /Turnover by game and bet mode<\/h2>\s*<p class="conclusion">Nothing measured in this period yet\.<\/p><\/div><\/div><div class="empty-state ichart-empty">/);
  for (const span of ['month', 'today', '3d']) assert.doesNotMatch(String(renderAnalysis({ state: { ...baseState, modeRows: {} }, model: { daily: [] }, span })), /NaN|undefined/, span);
});

test('the trends page mounts the hour-by-day heatmap and the zoomable daily trend', () => {
  const team = [];
  for (let t = now - 7 * 24 * H - 30 * M, c = 0; t <= now; t += SLOT) team.push({ ts: t, fields: { count: (c += 5) } });
  const days = { '2026-09-22': { rows: [{ slug: 'berry', name: 'Berry', stats: { turnover: usd(900), profit: usd(20), count: 100, unique: 5 } }] } };
  const state = { ...baseState, history: { team, online: [] }, dailySnapshot: { days } };
  const model = { daily: [], games: [], options: [], totals: {} };
  const out = String(renderTrends({ model, state, catalogue: {}, math: {} }));
  const grid = chartJson(out, 'hour-by-day');
  assert.equal(grid.days.length, 7);
  const closed = grid.cells.filter(([h, d]) => !(grid.filling && grid.filling[0] === h && grid.filling[1] === d));
  assert.ok(closed.every(([h, d, v]) => h >= 0 && h < 24 && d >= 0 && d < 7 && v === 120), 'a steady 120 bets an hour');
  assert.deepEqual(grid.filling, [12, 6], 'the hour now is flagged as still filling');
  assert.match(out, /<h2>Hour by day<\/h2>\s*<p class="conclusion">Busiest hour: /);
  const daily = chartJson(out, 'daily-zoom');
  assert.equal(daily.dates.length, 30, 'the same 30 days the daily panels chart');
  assert.deepEqual(daily.turnover.filter((v) => v !== null), [900]);
  assert.deepEqual(daily.profit.filter((v) => v !== null), [2], 'the studio\'s share of $20 gross');
  assert.match(out, /<h2>Turnover and studio P\/L, day by day<\/h2>\s*<p class="conclusion">1 of 30 days measured: \$900\.00 turnover and \+\$2\.00 studio P\/L\./);
  assert.ok(out.indexOf('Hour of the day') < out.indexOf('Hour by day'), 'the existing profile stays where it was');
});

test('trends with no trail and no sync show empty states and no NaN', () => {
  const out = String(renderTrends({ model: { daily: [], games: [], options: [], totals: {} }, state: { ...baseState, history: {}, dailySnapshot: {} }, catalogue: {}, math: {} }));
  assert.doesNotMatch(out, /data-ichart=/);
  assert.equal((out.match(/class="empty-state ichart-empty"/g) ?? []).length, 2);
  assert.doesNotMatch(out, /NaN|undefined/);
});
