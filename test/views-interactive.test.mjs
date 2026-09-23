import { test } from 'node:test';
import assert from 'node:assert/strict';
import { renderAnalysis } from '../src/web/views/analysis.mjs';
import { GAME_COLOURS } from '../src/web/charts/donut.mjs';

const money = { unitsPerDollar: 1_000_000, profitShare: 0.1, expectedShare: 0.075 };
const usd = (dollars) => dollars * 1_000_000;

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
