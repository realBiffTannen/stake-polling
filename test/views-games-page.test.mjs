import { test } from 'node:test';
import assert from 'node:assert/strict';
import { renderGames } from '../src/web/views/games.mjs';
import { renderHome } from '../src/web/views/home.mjs';

const money = { unitsPerDollar: 1_000_000, profitShare: 0.1, expectedShare: 0.075 };
const berry = { name: 'berry', label: 'Berry', count: 100, turnoverUsd: 500, profitUsd: -12.5, dayProfitUsd: 3, online: 4, unique: 9, rate: 1000 };
const titles = [
  { slug: 'berry', name: 'Berry', isLive: true, published: true, approval: 'responded', rating: 60 },
  { slug: 'metro-night-run', name: 'Metro Night Run', isLive: false, published: true, approval: 'new', rating: 30 },
];
const math = { 'metro-night-run': { edge: 0.045, maxWin: 50000, version: 6, modes: { BASE: { cost: 1 }, ANTE: { cost: 1.25 } } } };
const modeRows = { berry: [{ mode: 'BASE', cost: 1 }, { mode: 'BONUS', cost: 200 }] };
const lifetimeGames = { berry: { count: 12000, unique: 350, turnoverUsd: 9000, profitUsd: 40 } };
const state = { meta: { team: 'acme-studios' }, stale: false, ageMs: 0, now: Date.parse('2026-09-24T00:30:00Z'), money, math, modeRows, titles, rows: [berry],
  lifetimeGames, lifetime: { from: '2026-07-25' } };
const catalogue = (out) => out.slice(out.indexOf('<table data-sortable="catalogue">'), out.indexOf('</table>', out.indexOf('<table data-sortable="catalogue">')));
const row = (out, name) => { const a = out.indexOf(name); return out.slice(a, out.indexOf('</tr>', a)); };
const details = (out, slug) => { const a = out.indexOf(`data-details-for="${slug}"`); return out.slice(a, out.indexOf('</tr>', a)); };

test('the Games page carries the catalogue and the not-yet-live tables, both sortable', () => {
  const out = String(renderGames(state));
  assert.match(out, /<h1>Games<span>\.<\/span><\/h1>/);
  assert.match(out, /<table data-sortable="catalogue">/);
  assert.match(out, /<table data-sortable="waiting">/);
  assert.match(out, /href="\/game\/metro-night-run"/);
  assert.match(out, /href="https:\/\/studio\.engine\.io\/teams\/acme-studios\/games\/berry"/);
  assert.match(out, /10% revenue share/);
});

test('the Games page is the active nav entry', () => {
  const out = String(renderGames(state));
  assert.match(out, /<a class="active" href="\/games" aria-current="page">/);
  assert.equal((out.match(/class="active"/g) ?? []).length, 1);
});

test('the catalogue lives on the Games page alone: the Overview is today\'s charts', () => {
  assert.match(catalogue(String(renderGames(state))), /Berry/);
  assert.equal(catalogue(String(renderHome(state))), '');
});

test('an empty catalogue says so on the Games page rather than rendering bare tables', () => {
  const out = String(renderGames({ ...state, titles: [] }));
  assert.match(out, /No titles in the catalogue yet/);
  assert.match(out, /No titles waiting to go live/);
});

test('the catalogue has no Status column: a live title shows Live where its approval stage goes, a dark one its stage', () => {
  const table = catalogue(String(renderGames(state)));
  const heads = [...table.matchAll(/<th(?: data-sort="[a-z]+")?>([^<]+)<\/th>/g)].map((m) => m[1]);
  assert.deepEqual(heads, ['Game', 'Rating', 'Approval stage', 'Revenue model', 'Lifetime bets', 'Lifetime players', 'Lifetime turnover', 'Lifetime P/L', 'Engine']);
  assert.match(row(table, 'Berry'), /<td><span class="pill live">Live<\/span><\/td>/);
  assert.doesNotMatch(row(table, 'Berry'), />responded</);
  assert.match(row(table, 'Metro Night Run'), /<td>new<\/td>/);
});

test('each title carries its lifetime bets, players, turnover and studio P/L, with dashes where the snapshot has none', () => {
  const out = String(renderGames(state));
  const berryRow = row(catalogue(out), 'Berry');
  assert.match(berryRow, /<td data-value="12000">12,000<\/td>/);
  assert.match(berryRow, /<td data-value="350">350<\/td>/);
  assert.match(berryRow, /<td data-value="9000">\$9,000\.00<\/td>/);
  assert.match(berryRow, /<td data-value="40"><span class="good">\+\$40\.00<\/span><\/td>/);
  const metroRow = row(catalogue(out), 'Metro Night Run');
  assert.equal((metroRow.match(/<td>-<\/td>/g) ?? []).length, 4, 'four lifetime dashes');
  assert.doesNotMatch(metroRow, /data-value="(?:0|null|NaN)"/);
  assert.match(out, /Lifetime figures run from 2026-07-25/);
});

test('each title has an expand button that names its details row', () => {
  const table = catalogue(String(renderGames(state)));
  assert.match(table, /<td><button type="button" class="expand" data-expand="berry" aria-expanded="false" aria-controls="details-berry" aria-label="Show details for Berry"><span aria-hidden="true">▸<\/span><\/button><a class="game-link" href="\/game\/berry">Berry<\/a><\/td>/);
  assert.match(table, /<tr class="game-details" id="details-berry" data-details-for="berry"><td colspan="9">/);
  assert.ok(table.indexOf('data-expand="berry"') < table.indexOf('data-details-for="berry"'), 'the details row follows its game row');
});

test('the details row shows this month, the catalogue facts, captured math, bet modes and the links', () => {
  const out = String(renderGames(state));
  const b = details(out, 'berry');
  assert.match(b, /This month/);
  assert.match(b, /<dt>Bets<\/dt><dd>100<\/dd>/);
  assert.match(b, /<dt>Turnover<\/dt><dd>\$500\.00<\/dd>/);
  assert.match(b, /<dt>Studio P\/L<\/dt><dd><span class="bad">-\$12\.50<\/span><\/dd>/);
  assert.match(b, /<dt>Players<\/dt><dd>9<\/dd>/);
  assert.match(b, /<dt>Status<\/dt><dd>Live<\/dd>/);
  assert.match(b, /<dt>Approval stage<\/dt><dd>responded<\/dd>/);
  assert.match(b, /<dt>Rating<\/dt><dd>2\.00 of 3<\/dd>/);
  assert.match(b, /No captured math/);
  assert.match(b, /BASE 1x/);
  assert.match(b, /BONUS 200x/);
  assert.match(b, /href="\/game\/berry"/);
  assert.match(b, /Open on Engine/);
  const m = details(out, 'metro-night-run');
  assert.match(m, /<dt>Status<\/dt><dd>Published · not live<\/dd>/);
  assert.match(m, /<dt>RTP<\/dt><dd>95\.50%<\/dd>/);
  assert.match(m, /<dt>Max win<\/dt><dd>50,000x<\/dd>/);
  assert.match(m, /<dt>Version<\/dt><dd>6<\/dd>/);
  assert.match(m, /ANTE 1\.25x/);
  assert.match(m, /<dt>Bets<\/dt><dd>-<\/dd>/, 'not on the roster: dashes, not zeros');
});

test('an untrusted title name cannot break out of the expand button', () => {
  const out = String(renderGames({ ...state, titles: [{ slug: 'x', name: '"><script>1</script>', isLive: true, rating: 60 }] }));
  assert.doesNotMatch(out, /<script>1/);
});
