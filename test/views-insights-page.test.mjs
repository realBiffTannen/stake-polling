import { test } from 'node:test';
import assert from 'node:assert/strict';
import { renderInsights } from '../src/web/views/insights.mjs';
import { buildInsights } from '../src/insights/model.mjs';

const now = Date.parse('2026-09-17T14:00:00Z');
const row = { slug: 'berry', name: 'Berry', stats: { unique: 10, count: 20, turnover: 100e6, profit: -10e6, expectedProfit: 3e6 } };
const snapshot = { trackingStart: '2026-07-24', days: { '2026-09-17': { rows: [row], fetchedAt: now } }, cumulative: { '2026-09-16': [], '2026-09-17': [row] } };
const state = { meta: { team: 'acme-studios' }, now, ageMs: 0, money: { unitsPerDollar: 1e6, profitShare: 0.1, expectedShare: 0.075 } };
const out = String(renderInsights(buildInsights({ snapshot, now, query: new URLSearchParams() }), state));

// The root is the overview now. Every link the insights page builds back to
// itself must name /insights, or a filter change silently lands the reader
// on a different page.
test('the filter form submits to /insights', () => {
  assert.match(out, /<form class="filters" method="get" action="\/insights">/);
});

test('the quick ranges and sort headers stay on /insights', () => {
  assert.match(out, /href="\/insights\?days=7/);
  assert.match(out, /href="\/insights\?from=/);
  assert.doesNotMatch(out, /href="\/\?/, 'nothing links back to the root with insights parameters');
});
