import { test } from 'node:test';
import assert from 'node:assert/strict';
import { renderSettlement } from '../src/web/views/settlement.mjs';
import { settlement, dataHealth } from '../src/insights/settlement.mjs';

const money = { unitsPerDollar: 1_000_000, profitShare: 0.1, expectedShare: 0.075 };
const now = Date.parse('2026-09-22T12:00:00Z');
const state = { meta: { team: 'acme-studios' }, stale: false, ageMs: 0, now, money, pollMinutes: 2.5 };
const balance = { position: -8636768156, expectedProfit: -379487778, carry: -2184064350 };
const rows = [{ slug: 'berry', name: 'Berry', stats: { profit: -40000000000 } }, { slug: 'nwo', name: 'Neon City Heist', stats: { profit: -24527038060 } }];
const daily = [{ date: '2026-09-20', profit: -30, measured: true }, { date: '2026-09-21', profit: 20, measured: true }];
const s = settlement({ balance, rows, daily, money, now });
const h = dataHealth({ roster: rows, games: [{ slug: 'berry', stats: { month: { profit: -40000000000 } } }, { slug: 'nwo', stats: { month: { profit: -24000000000 } } }],
  perGame: {}, snapshots: { roster: now - 60000, balance: now - 20 * 60000, games: null }, now, pollMinutes: 2.5, money });
const render = (over = {}) => String(renderSettlement({ state, model: {}, settlement: s, health: h, ...over }));

test('the page is headed as settlement and marked active in the nav', () => {
  const out = render();
  assert.match(out, /WHAT GETS PAID/);
  assert.match(out, /<h1>Settlement<span>\.<\/span><\/h1>/);
});

test('the metric cards carry position, settled-now, the luck gap and carry', () => {
  const out = render();
  for (const label of ['Position', 'Settled if the month ended now', 'Luck gap', 'Carried forward']) assert.match(out, new RegExp(label), label);
  assert.match(out, /-\$8,636\.77/);
  assert.match(out, /-\$2,184\.06/);
});

test('every panel states its conclusion', () => {
  const out = render();
  assert.match(out, /luck gap of -\$8,257\.28/);
  assert.match(out, /Nothing would be paid; the deficit carries forward/);
  assert.match(out, /the month ends near/);
});

test('the reconciliation table names the game that differs, and says what it differs by', () => {
  const out = render();
  assert.match(out, /Neon City Heist/);
  assert.match(out, /\+\$527\.04/);
  assert.match(out, /differs/);
});

test('freshness lists every endpoint with its age, a stale one marked, and a never-read one marked as such', () => {
  const out = render();
  assert.match(out, /balance/);
  assert.match(out, /stale/);
  assert.match(out, /never read/);
});

test('with nothing measured the page renders dashes and plain statements, no NaN or undefined', () => {
  const empty = settlement({ balance: null, rows: [], money, now });
  const none = dataHealth({ roster: [], games: [], perGame: {}, snapshots: {}, now, pollMinutes: 2.5, money });
  const out = render({ settlement: empty, health: none });
  assert.doesNotMatch(out, /NaN|undefined|\$0\.00/);
  assert.match(out, /Nothing measured/);
  assert.match(out, /Nothing to reconcile yet/);
});

test('an untrusted game name cannot inject markup', () => {
  const evil = dataHealth({ roster: [{ slug: 'x', name: '<img src=x onerror=1>', stats: { profit: 1 } }], games: [{ slug: 'x', stats: { month: { profit: 2 } } }],
    perGame: {}, snapshots: {}, now, pollMinutes: 2.5, money });
  assert.doesNotMatch(render({ health: evil }), /<img src=x/);
});

test('the definitions explain settled against position, carry, the two rates and the luck gap', () => {
  const out = render();
  assert.match(out, /settles on/i);
  assert.match(out, /carry/i);
  assert.match(out, /7\.5%/);
  assert.match(out, /luck gap/i);
});
