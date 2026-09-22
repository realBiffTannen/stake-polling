import { test } from 'node:test';
import assert from 'node:assert/strict';
import { renderHome } from '../src/web/views/home.mjs';

const money = { unitsPerDollar: 1_000_000, profitShare: 0.1, expectedShare: 0.075 };
const berry = { name: 'berry', label: 'Berry', count: 100, turnoverUsd: 500, profitUsd: -12.5, dayProfitUsd: 3, online: 4 };
const galaxy = { name: 'pixel-geyser', label: 'Pixel Geyser', count: 50, turnoverUsd: 250, profitUsd: 20, dayProfitUsd: -1, online: 0 };
// Live in the catalogue, nothing on the roster yet - every figure unmeasured.
const pending = { name: 'pixel-nest', label: 'Pixel Nest', pending: true, count: null, turnoverUsd: null, profitUsd: null, dayProfitUsd: null, online: 1 };
const titles = [
  { slug: 'berry', name: 'Berry', isLive: true, published: true, approval: 'responded' },
  { slug: 'metro-night-run', name: 'Metro Night Run', isLive: false, published: true, approval: 'new' },
  { slug: 'baseline', name: 'Base Line', isLive: false, published: false, approval: null },
];
const math = { 'metro-night-run': { edge: 0.045, maxWin: 50000, version: 6, modes: { BASE: {}, ANTE: {}, VIPER_VAULT: {} } } };
const base = { meta: { team: 'acme-studios' }, stale: false, ageMs: 0, now: Date.parse('2026-09-22T12:00:00Z'), money, math, titles };
const render = (over = {}) => String(renderHome({ ...base, rows: [berry, galaxy, pending], ...over }));
const section = (out, heading) => out.slice(out.indexOf(heading));

test('every game on the roster links to its own game page', () => {
  const out = render();
  for (const slug of ['berry', 'pixel-geyser', 'pixel-nest']) assert.match(out, new RegExp(`href="/game/${slug}"`), slug);
});

test('each live game shows its bets, turnover and studio profit/loss', () => {
  const out = render();
  assert.match(out, /Berry/);
  assert.match(out, />100</);
  assert.match(out, /\$500\.00/);
  assert.match(out, /<span class="bad">-\$12\.50<\/span>/, 'a loss renders red');
  assert.match(out, /<span class="good">\+\$20\.00<\/span>/, 'a win renders green');
});

test('the total row sums the measured games and ignores the unmeasured one', () => {
  const total = section(render(), 'Total');
  assert.match(total, />150</, 'bets 100 + 50');
  assert.match(total, /\$750\.00/, 'turnover 500 + 250');
  assert.match(total, /\+\$7\.50/, 'profit -12.50 + 20');
});

test('a roster of nothing but unmeasured games totals to a dash, not a confident zero', () => {
  const out = render({ rows: [pending] });
  assert.doesNotMatch(out, /\$0\.00/);
});

test('a measured zero profit still renders as $0.00, not as a dash', () => {
  const out = render({ rows: [{ ...berry, profitUsd: 0, dayProfitUsd: 0 }] });
  assert.match(out, /<span class="good">\$0\.00<\/span>/, 'zero is green by the standing ruling');
});

test('titles not yet live are listed with their status and approval stage, and link to a game page', () => {
  const out = section(render(), 'Not yet live');
  assert.match(out, /href="\/game\/metro-night-run"/);
  assert.match(out, /Metro Night Run/);
  assert.match(out, /Published · not live/);
  assert.match(out, />new</);
  assert.match(out, /Base Line/);
  assert.match(out, /Unpublished/);
});

test('a live title is not repeated in the not-yet-live table', () => {
  assert.doesNotMatch(section(render(), 'Not yet live'), /href="\/game\/berry"/);
});

test('a not-yet-live title shows its captured math summary, or a dash when none was captured', () => {
  const out = section(render(), 'Not yet live');
  assert.match(out, /95\.50%/, 'RTP = 1 - edge');
  assert.match(out, />3</, 'three captured modes');
  assert.match(out, /50,000x/);
  const baseline = out.slice(out.indexOf('Base Line'));
  assert.doesNotMatch(baseline.slice(0, baseline.indexOf('</tr>')), /%/, 'no RTP invented for a title with no math');
});

test('an empty catalogue says there is nothing unreleased rather than rendering a bare table', () => {
  assert.match(render({ titles: undefined }), /No titles waiting/i);
});

test('the overview carries no per-mode drilldown', () => {
  assert.doesNotMatch(render(), /\/mode\//);
});

test('untrusted game names from the API cannot inject markup', () => {
  const out = render({ rows: [{ ...berry, label: '<img src=x onerror=1>' }],
    titles: [{ slug: 'evil', name: '<script>x</script>', isLive: false, published: true, approval: '<i onmouseover=1>' }] });
  assert.doesNotMatch(out, /<img src=x/);
  assert.doesNotMatch(out, /<script>x/);
  assert.doesNotMatch(out, /<i onmouseover/);
});
