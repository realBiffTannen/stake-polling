import { test } from 'node:test';
import assert from 'node:assert/strict';
import { renderGames } from '../src/web/views/games.mjs';
import { renderHome } from '../src/web/views/home.mjs';

const money = { unitsPerDollar: 1_000_000, profitShare: 0.1, expectedShare: 0.075 };
const berry = { name: 'berry', label: 'Berry', count: 100, turnoverUsd: 500, profitUsd: -12.5, dayProfitUsd: 3, online: 4, rate: 1000 };
const titles = [
  { slug: 'berry', name: 'Berry', isLive: true, published: true, approval: 'responded', rating: 60 },
  { slug: 'metro-night-run', name: 'Metro Night Run', isLive: false, published: true, approval: 'new', rating: 30 },
];
const math = { 'metro-night-run': { edge: 0.045, maxWin: 50000, version: 6, modes: { BASE: {}, ANTE: {} } } };
const state = { meta: { team: 'acme-studios' }, stale: false, ageMs: 0, now: Date.parse('2026-09-24T00:30:00Z'), money, math, titles, rows: [berry] };

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

test('the Games page and the Overview draw the catalogue from the same code, so they cannot drift', () => {
  const games = String(renderGames(state));
  const home = String(renderHome(state));
  const table = (out) => out.slice(out.indexOf('<table data-sortable="catalogue">'), out.indexOf('</table>', out.indexOf('<table data-sortable="catalogue">')));
  assert.equal(table(games), table(home));
});

test('an empty catalogue says so on the Games page rather than rendering bare tables', () => {
  const out = String(renderGames({ ...state, titles: [] }));
  assert.match(out, /No titles in the catalogue yet/);
  assert.match(out, /No titles waiting to go live/);
});
