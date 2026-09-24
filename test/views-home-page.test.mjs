import { test } from 'node:test';
import assert from 'node:assert/strict';
import { renderHome } from '../src/web/views/home.mjs';

const money = { unitsPerDollar: 1_000_000, profitShare: 0.1, expectedShare: 0.075 };
const berry = { name: 'berry', label: 'Berry', count: 100, turnoverUsd: 500, profitUsd: -12.5, dayProfitUsd: 3, online: 4 };
const galaxy = { name: 'pixel-geyser', label: 'Pixel Geyser', count: 50, turnoverUsd: 250, profitUsd: 20, dayProfitUsd: -1, online: 0 };
// Live in the catalogue, nothing on the roster yet - every figure unmeasured.
const pending = { name: 'pixel-nest', label: 'Pixel Nest', pending: true, count: null, turnoverUsd: null, profitUsd: null, dayProfitUsd: null, online: 1 };
const titles = [
  { slug: 'berry', name: 'Berry', isLive: true, published: true, approval: 'responded', rating: 60 },
  { slug: 'metro-night-run', name: 'Metro Night Run', isLive: false, published: true, approval: 'new', rating: 30 },
  { slug: 'baseline', name: 'Base Line', isLive: false, published: false, approval: null, rating: null },
];
const math = { 'metro-night-run': { edge: 0.045, maxWin: 50000, version: 6, modes: { BASE: {}, ANTE: {}, VIPER_VAULT: {} } } };
const base = { meta: { team: 'acme-studios' }, stale: false, ageMs: 0, now: Date.parse('2026-09-22T12:00:00Z'), money, math, titles };
const render = (over = {}) => String(renderHome({ ...base, rows: [berry, galaxy, pending], ...over }));
const section = (out, heading) => out.slice(out.indexOf(heading));
const between = (out, from, to) => { const a = out.indexOf(from); return out.slice(a, out.indexOf(to, a)); };
const games = (out) => between(out, '<h2>Games</h2>', '<h2>Not yet live</h2>');

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

// ------------------------------------------------------------ Games section
test('the Games section lists every catalogue title, live first, with a link to its own page', () => {
  const out = games(render());
  assert.match(out, /3 titles/);
  for (const slug of ['berry', 'metro-night-run', 'baseline']) assert.match(out, new RegExp(`href="/game/${slug}"`), slug);
  assert.ok(out.indexOf('Berry') < out.indexOf('Base Line'), 'live before dark');
  assert.ok(out.indexOf('Base Line') < out.indexOf('Metro Night Run'), 'then by name');
});

test('each title shows the studio dashboard star rating out of three, or Unrated', () => {
  const out = games(render());
  const row = (name) => { const a = out.indexOf(name); return out.slice(a, out.indexOf('</tr>', a)); };
  assert.match(row('Berry'), /aria-label="2 of 3 stars"/);
  assert.match(row('Metro Night Run'), /aria-label="1 of 3 stars"/);
  assert.match(row('Base Line'), /Unrated/);
  assert.doesNotMatch(row('Base Line'), /stars"/, 'no stars invented for an unrated title');
});

test('a live title shows Live where its approval stage goes; a dark one shows its stage, and its status in the details', () => {
  const out = games(render());
  const row = (name) => { const a = out.indexOf(name); return out.slice(a, out.indexOf('</tr>', a)); };
  const details = (slug) => { const a = out.indexOf(`data-details-for="${slug}"`); return out.slice(a, out.indexOf('</tr>', a)); };
  assert.doesNotMatch(out, /<th[^>]*>Status<\/th>/, 'no Status column');
  assert.match(row('Berry'), /<span class="pill live">Live<\/span>/);
  assert.doesNotMatch(row('Berry'), />responded</);
  assert.match(details('berry'), />responded</);
  assert.match(row('Metro Night Run'), /<td>new<\/td>/);
  assert.match(details('metro-night-run'), />Published · not live</);
  assert.match(details('baseline'), />Unpublished</);
});

test('each title links to its page on the Engine studio, in a new tab, and the link goes when no team is known', () => {
  const out = games(render());
  assert.match(out, /<a class="engine-link" href="https:\/\/studio\.engine\.io\/teams\/acme-studios\/games\/berry" target="_blank" rel="noopener noreferrer">/);
  assert.match(out, /studio\.engine\.io\/teams\/acme-studios\/games\/metro-night-run"/);
  assert.doesNotMatch(games(render({ meta: {} })), /studio\.engine\.io/);
});

test('the Engine link encodes a hostile slug and team rather than trusting them', () => {
  const out = games(render({ meta: { team: 'a"b' }, titles: [{ slug: 'x/y?z', name: 'X', isLive: true, rating: 60 }] }));
  assert.doesNotMatch(out, /teams\/a"b/);
  assert.match(out, /teams\/a%22b\/games\/x%2Fy%3Fz/);
});

test('the money table is titled as the live games this month, so the two tables cannot be confused', () => {
  const out = render();
  assert.match(out, /<h2>Live games this month<\/h2>/);
  assert.equal((out.match(/<h2>Games<\/h2>/g) ?? []).length, 1);
});

test('a missing catalogue still renders the Games section, empty', () => {
  assert.match(games(render({ titles: undefined })), /No titles in the catalogue/);
});

test('the Games section names each roster game\'s revenue model from its rate, and a dash for a title with none', () => {
  const geyser = { slug: 'pixel-geyser', name: 'Pixel Geyser', isLive: true, published: true, approval: 'responded', rating: 60 };
  const out = games(render({ rows: [{ ...berry, rate: 1000 }, { ...galaxy, rate: 500 }, pending], titles: [...titles, geyser] }));
  const row = (name) => { const a = out.indexOf(name); return out.slice(a, out.indexOf('</tr>', a)); };
  assert.match(row('Berry'), /<span class="model">10% revenue share<\/span>/);
  assert.match(row('Pixel Geyser'), /<span class="model split">5% GGR, split across providers<\/span>/);
  assert.doesNotMatch(row('Metro Night Run'), /%/, 'not on the roster: no rate to report');
  assert.match(row('Metro Night Run'), /reports a revenue rate only for a game on the roster/);
  assert.match(out, /<th data-sort="text">Revenue model<\/th>/);
});

test('a roster row without a rate shows a dash, never 0%', () => {
  const out = games(render({ rows: [{ ...berry, rate: null }, { ...galaxy }] }));
  const row = (name) => { const a = out.indexOf(name); return out.slice(a, out.indexOf('</tr>', a)); };
  assert.doesNotMatch(row('Berry'), /GGR|revenue share/);
  assert.match(row('Berry'), /reports a revenue rate only for a game on the roster/);
});

const live = (out) => between(out, '<h2>Live games this month</h2>', '<h2>Games</h2>');

test('the live games table is sortable: each heading says how it sorts and each figure carries its raw value', () => {
  const out = live(render());
  assert.match(out, /<table data-sortable="live-games">/);
  assert.match(out, /<th data-sort="text">Game<\/th>/);
  for (const col of ['Bets', 'Turnover', 'Studio P/L', 'P/L today', 'Online now']) assert.ok(out.includes(`<th data-sort="number">${col}</th>`), col);
  assert.match(out, /<td data-value="500">\$500\.00<\/td>/, 'turnover carries the unformatted number');
  assert.match(out, /<td data-value="-12.5"><span class="bad">-\$12\.50<\/span><\/td>/, 'a loss carries its sign');
  assert.match(out, /<td data-value="100">100<\/td>/, 'bets carry the count');
});

test('an unmeasured figure carries no sort value, so it sorts last rather than as a zero', () => {
  const row = between(live(render()), 'pixel-nest', '</tr>');
  assert.doesNotMatch(row, /data-value="(?:|0|null|undefined|NaN)"/);
  assert.match(row, /<td data-value="1">1<\/td>/, 'the one measured figure (online) still carries its value');
});

test('the total row stays in the footer, outside what sorting reorders', () => {
  const out = live(render());
  assert.match(out, /<tfoot><tr><td>Total<\/td>/);
  assert.doesNotMatch(between(out, '<tfoot>', '</tfoot>'), /data-value/);
});

test('the Games and Not-yet-live tables sort too, with the rating and captured math as numbers', () => {
  const out = render();
  assert.match(games(out), /<table data-sortable="catalogue">/);
  assert.match(games(out), /<th data-sort="number">Rating<\/th>/);
  assert.match(games(out), /<td data-value="60">/, 'the raw rating, not the star count');
  assert.match(games(out), /<th>Engine<\/th>/, 'a column of identical links does not sort');
  const waiting = section(out, '<h2>Not yet live</h2>');
  assert.match(waiting, /<table data-sortable="waiting">/);
  assert.match(waiting, /<td data-value="50000">50,000x<\/td>/);
  assert.match(waiting, /<td data-value="3">3<\/td>/);
});
