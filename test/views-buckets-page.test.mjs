import { test } from 'node:test';
import assert from 'node:assert/strict';
import { renderBucketsPage, CADENCES } from '../src/web/views/buckets.mjs';

const MIN = 60000;
const now = Date.parse('2026-09-22T15:00:00Z');
const state = { meta: { team: 'acme-studios' }, stale: false, ageMs: 0, now,
  money: { unitsPerDollar: 1_000_000, profitShare: 0.1, expectedShare: 0.075 } };
const model = { options: [{ slug: 'pixel-geyser', name: 'Pixel Geyser' }], daily: [], games: [] };

const gameTrail = (byMinute) => Object.entries(byMinute).map(([m, fields]) => ({ ts: now - 60 * MIN + Number(m) * MIN, fields }));
// Deltas: 14:30 bucket = 10 bets / $1.00 turnover / $8 gross profit ($0.80 studio share).
//         15:00 bucket = 15 bets / $2.00 turnover / $12 gross profit ($1.20 studio share).
// Visible-span sums: 25 bets, $3.00 turnover, $20 gross profit ($2.00 studio share).
const trail = gameTrail({ 0: { count: 0, turnover: 0, profit: 0 }, 30: { count: 10, turnover: 1_000_000, profit: 8_000_000 }, 60: { count: 25, turnover: 3_000_000, profit: 20_000_000 } });
const modeTrail = gameTrail({
  0: { 'BASE:count': 0, 'BASE:turnover': 0, 'BASE:profit': 0, 'FREE_SPINS:count': 0, 'FREE_SPINS:turnover': 0, 'FREE_SPINS:profit': 0 },
  30: { 'BASE:count': 8, 'BASE:turnover': 800_000, 'BASE:profit': 6_000_000, 'FREE_SPINS:count': 2, 'FREE_SPINS:turnover': 200_000, 'FREE_SPINS:profit': 2_000_000 },
  60: { 'BASE:count': 20, 'BASE:turnover': 2_000_000, 'BASE:profit': 15_000_000, 'FREE_SPINS:count': 5, 'FREE_SPINS:turnover': 1_000_000, 'FREE_SPINS:profit': 5_000_000 },
});

test('every offered cadence links from the page', () => {
  const out = String(renderBucketsPage({ slug: 'pixel-geyser', model, state, cadence: '1h', gameTrail: trail, modeTrail }));
  for (const c of CADENCES) assert.match(out, new RegExp(`href="\\?cadence=${c}"`), `${c} tab missing`);
});

test('an invalid or missing cadence falls back to 1h rather than throwing', () => {
  const out = String(renderBucketsPage({ slug: 'pixel-geyser', model, state, cadence: 'nonsense', gameTrail: trail, modeTrail }));
  assert.match(out, /class="[^"]*\bactive\b[^"]*"[^>]*>1h</);
});

test('the visible span is summed into tiles - overall bets, turnover and studio profit', () => {
  const out = String(renderBucketsPage({ slug: 'pixel-geyser', model, state, cadence: '30m', gameTrail: trail, modeTrail }));
  assert.match(out, /25/, 'summed bets across the two 30-minute buckets');
  assert.match(out, /\$3\.00/, 'summed turnover');
  assert.match(out, /\$2\.00/, 'summed studio profit (10% share of $20 gross)');
});

test('the totals table reports bets, turnover and profit deltas per bucket', () => {
  const out = String(renderBucketsPage({ slug: 'pixel-geyser', model, state, cadence: '30m', gameTrail: trail, modeTrail }));
  assert.match(out, /\$1\.00/, 'first bucket turnover delta');
  assert.match(out, /\$0\.80/, 'first bucket studio profit delta (10% of $8)');
});

test('the per-mode table breaks profit down by bet mode', () => {
  const out = String(renderBucketsPage({ slug: 'pixel-geyser', model, state, cadence: '30m', gameTrail: trail, modeTrail }));
  assert.match(out, /BASE/);
  assert.match(out, /FREE_SPINS/);
});

test('with no per-mode trail yet the page still renders, saying so rather than a blank table', () => {
  const out = String(renderBucketsPage({ slug: 'pixel-geyser', model, state, cadence: '1h', gameTrail: trail, modeTrail: [] }));
  assert.match(out, /no per-mode trail yet/i);
});

test('an untrusted mode name cannot inject markup', () => {
  const nasty = gameTrail({ 0: { '<img src=x onerror=1>:profit': 0 }, 30: { '<img src=x onerror=1>:profit': 5 } });
  const out = String(renderBucketsPage({ slug: 'pixel-geyser', model, state, cadence: '30m', gameTrail: trail, modeTrail: nasty }));
  assert.doesNotMatch(out, /<img src=x/);
});
