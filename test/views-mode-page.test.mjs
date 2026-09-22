import { test } from 'node:test';
import assert from 'node:assert/strict';
import { renderModePage } from '../src/web/views/mode.mjs';

const state = { meta: { team: 'acme-studios' }, stale: false, ageMs: 0, now: Date.parse('2026-09-19T12:00:00Z'),
  money: { unitsPerDollar: 1_000_000, profitShare: 0.1, expectedShare: 0.075 } };
const model = { options: [{ slug: 'pixel-geyser', name: 'Pixel Geyser' }], daily: [], games: [], from: '2026-09-18', to: '2026-09-19' };
const math = { edge: 0.033, maxWin: 10000, costLadder: [1, 35],
  modes: { BASE: { cost: 1, rtp: 0.967, sigma: 11.1874, zeroRate: 0.944, hitRate: 0.056, worstLossStreak: 120, mean: 0.97 } } };
const modeRows = [
  { mode: 'BASE', count: 1000, turnover: 1000_000_000, profit: 3_300_000, rtp: 0.967, expectedReturn: 33_000_000, cost: 1, avgBet: 0.4 },
  { mode: 'BONUS0', count: 20, turnover: 700_000_000, profit: -50_000_000, rtp: 0.967, expectedReturn: 23_100_000, cost: 35, avgBet: 1 },
];
const modeDays = { '2026-09-18': { BASE: { count: 400, turnover: 400_000_000, profit: 1_000_000 } } };

test('the drilldown says plainly that per-mode player counts do not exist upstream', () => {
  const out = String(renderModePage({ slug: 'pixel-geyser', mode: 'BASE', model, state, math, modeRows, modeDays }));
  assert.match(out, /does not report player identity per bet mode/i);
});

test('the page links to the game\'s bucket-cadence drilldown', () => {
  const out = String(renderModePage({ slug: 'pixel-geyser', mode: 'BASE', model, state, math, modeRows, modeDays }));
  assert.match(out, /href="\/game\/pixel-geyser\/buckets/);
});

test('it shows the captured mode row beside the observed one', () => {
  const out = String(renderModePage({ slug: 'pixel-geyser', mode: 'BASE', model, state, math, modeRows, modeDays }));
  assert.match(out, /11\.1874/, 'captured sigma');
  assert.match(out, /94\.40%/, 'captured zero rate');
});

test('it states the share of the game this mode is', () => {
  const out = String(renderModePage({ slug: 'pixel-geyser', mode: 'BONUS0', model, state, math, modeRows, modeDays }));
  assert.match(out, /Share of bets/);
});

test('an unknown mode renders a not-found panel rather than an empty page', () => {
  const out = String(renderModePage({ slug: 'pixel-geyser', mode: 'NOPE', model, state, math, modeRows, modeDays }));
  assert.match(out, /not present/i);
});

test('an untrusted mode name cannot inject markup', () => {
  const out = String(renderModePage({ slug: 'pixel-geyser', mode: '<img src=x onerror=1>', model, state, math, modeRows, modeDays }));
  assert.doesNotMatch(out, /<img src=x/);
});
