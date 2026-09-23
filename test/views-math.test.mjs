import { test } from 'node:test';
import assert from 'node:assert/strict';
import { renderMath } from '../src/web/views/math.mjs';
import { loadMathModel } from '../src/math/checks.mjs';

const state = { meta: { team: 'acme-studios' }, stale: false, ageMs: 0, now: 0 };
const math = {
  'pixel-geyser': { version: 8, edge: 0.033, maxWin: 10000, baseVolatility: 11.19, volatilityClass: 'MEDIUM', starLevel: 2, released: true,
    costLadder: [1, 35], compliance: { passes2Star: true, passes3Star: true, bindingConstraint: 'rtp', failures: [] },
    modes: { BASE: { cost: 1, rtp: 0.967, sigma: 11.1874, zeroRate: 0.944 } } },
  'pixel-embers': { version: 7, edge: 0.075, maxWin: 250000, baseVolatility: 81.33, volatilityClass: 'EXTREME', starLevel: null, released: false,
    costLadder: [1, 3], compliance: { passes2Star: false, passes3Star: false, bindingConstraint: 'volatility', failures: ['Max exposure', 'Base volatility'] },
    modes: { BASE: { cost: 1, rtp: 0.925, sigma: 81.33, zeroRate: 0.9 } } },
};

test('every captured game is listed with its version and volatility', () => {
  const out = String(renderMath({ model: { options: [] }, state, math, live: ['pixel-geyser', 'lunar-blossom'] }));
  assert.match(out, /Pixel Geyser|pixel-geyser/);
  assert.match(out, /81\.33/);
});

test('a live game with no captured model is called out', () => {
  const out = String(renderMath({ model: { options: [{ slug: 'lunar-blossom', name: 'Lunar Blossom' }] }, state, math, live: ['pixel-geyser', 'lunar-blossom'] }));
  assert.match(out, /lunar-blossom/);
  assert.match(out, /no captured model/i);
});

test('a failing compliance row is marked, not hidden', () => {
  const out = String(renderMath({ model: { options: [] }, state, math, live: [] }));
  assert.match(out, /FAILS/);
});

test('a genuinely uncaptured figure renders as a dash, not a confident zero', () => {
  const model = loadMathModel(new URL('./fixtures/math.json', import.meta.url).pathname);
  const live = ['neon-city-heist', 'metro-night-run'];
  const out = String(renderMath({ model: { options: [] }, state, math: model, live }));

  // neon-city-heist has no captured version; PROMO_PASS has no sigma, zero rate
  // or worst-loss streak; metro-night-run has no star level. Each must read as
  // "not captured", never as 0, 0.00%, undefined or an empty cell.
  assert.doesNotMatch(out, />\s*undefined\s*</);
  assert.doesNotMatch(out, />\s*NaN\s*</);
  assert.doesNotMatch(out, />\s*null\s*</);

  // neon-city-heist version cell must be dash (1st cell after game name link)
  const nwoRow = out.match(/neon-city-heist<\/a><\/td>([\s\S]{0,400}?)<\/tr>/);
  assert.ok(nwoRow, 'neon-city-heist summary row renders');
  const nwoCells = [...nwoRow[1].matchAll(/<td>([^<]*)<\/td>/g)].map(m => m[1].trim());
  assert.equal(nwoCells[0], '-', 'neon-city-heist version cell should be dash');

  // metro-night-run star level cell must be dash (3rd extractable cell: version, rtp, starLevel)
  // Note: Base volatility cell contains a span tag and is not matched by the regex
  const mrtRow = out.match(/metro-night-run<\/a><\/td>([\s\S]{0,400}?)<\/tr>/);
  assert.ok(mrtRow, 'metro-night-run summary row renders');
  const mrtCells = [...mrtRow[1].matchAll(/<td>([^<]*)<\/td>/g)].map(m => m[1].trim());
  assert.equal(mrtCells[2], '-', 'metro-night-run star level cell should be dash');

  // PROMO_PASS mode row: cost, rtp, sigma, zero rate, hit rate, break-even rate, worst loss streak
  const ppRow = out.match(/PROMO_PASS[\s\S]{0,400}?<\/tr>/);
  assert.ok(ppRow, 'PROMO_PASS mode row renders');
  const ppCells = [...ppRow[0].matchAll(/<td>([^<]*)<\/td>/g)].map(m => m[1].trim());
  assert.deepEqual(ppCells, ['50x', '96.70%', '-', '-', '100.00%', '13.10%', '-'],
    'PROMO_PASS cells: cost, rtp, sigma, zero rate, hit rate, break-even rate, worst loss streak');
});

test('a game whose deployed math no longer matches math.json is flagged for recapture', () => {
  const drifted = { ...state, modeRows: { 'pixel-geyser': [{ mode: 'BASE', cost: 1, rtp: 0.955 }, { mode: 'BONUS9', cost: 50, rtp: 0.967 }] } };
  const out = String(renderMath({ model: { options: [] }, state: drifted, math, live: ['pixel-geyser'] }));
  assert.match(out, /deployed math differs from math\.json/i);
  assert.match(out, /BONUS9 is deployed but not in math\.json/);
  assert.match(out, /BASE states 95\.50% deployed, 96\.70% captured/);
  const clean = String(renderMath({ model: { options: [] }, state: { ...state, modeRows: { 'pixel-geyser': [{ mode: 'BASE', cost: 1, rtp: 0.967 }] } }, math, live: ['pixel-geyser'] }));
  assert.doesNotMatch(clean, /deployed math differs/i);
});

test('the drift and no-captured-model warnings can be dismissed, keyed to what they say', () => {
  const page = (rows, live = ['pixel-geyser']) => String(renderMath({ model: { options: [] }, state: { ...state, modeRows: { 'pixel-geyser': rows } }, math, live }));
  const keyOf = (out, id) => out.match(new RegExp(`data-dismiss-key="(${id}:[0-9a-f]{12})"`))?.[1];
  const one = page([{ mode: 'BASE', cost: 1, rtp: 0.955 }]);
  assert.match(one, /<div class="notice warning dismissible" data-dismiss-key="math-drift:[0-9a-f]{12}">/);
  assert.match(one, /<form method="post" action="\/dismiss" class="dismiss-form" data-dismiss-form><!--fill:csrf-input--><!--\/fill:csrf-input--><input type="hidden" name="key" value="math-drift:[0-9a-f]{12}"><input type="hidden" name="back" value="\/math"><button type="submit" class="dismiss"/);
  assert.equal(keyOf(page([{ mode: 'BASE', cost: 1, rtp: 0.955 }]), 'math-drift'), keyOf(one, 'math-drift'), 'the same drift keeps its key across renders');
  const more = page([{ mode: 'BASE', cost: 1, rtp: 0.955 }, { mode: 'BONUS9', cost: 50, rtp: 0.967 }]);
  assert.notEqual(keyOf(more, 'math-drift'), keyOf(one, 'math-drift'), 'a new drift shows again after a dismissal');
  assert.ok(keyOf(page([], ['pixel-geyser', 'lunar-blossom']), 'math-uncaptured'), 'the no-captured-model warning is dismissible too');
});

test('a warning dismissed for everyone is not rendered at all, and a changed one is', () => {
  const rows = [{ mode: 'BASE', cost: 1, rtp: 0.955 }];
  const render = (dismissed) => String(renderMath({ model: { options: [] }, state: { ...state, modeRows: { 'pixel-geyser': rows }, dismissed }, math, live: ['pixel-geyser'] }));
  const key = render(new Set()).match(/data-dismiss-key="(math-drift:[0-9a-f]{12})"/)[1];
  assert.doesNotMatch(render(new Set([key])), /Deployed math differs/);
  assert.match(render(new Set(['math-drift:000000000000'])), /Deployed math differs/, 'another key hides nothing');
});
