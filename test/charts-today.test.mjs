import { test } from 'node:test';
import assert from 'node:assert/strict';
import { dayCurve } from '../src/web/charts/day.mjs';
import { heatGrid, rampColour } from '../src/web/charts/grid.mjs';
import { columns } from '../src/web/charts/columns.mjs';
import { stackedBars } from '../src/web/charts/bars.mjs';

const H = 3_600_000;
const FROM = Date.parse('2026-09-24T00:00:00Z');
const NOW = FROM + 4 * H;
const fmt = (v) => `$${Number(v).toFixed(2)}`;
const tips = (out) => [...out.matchAll(/data-tip="([^"]+)"/g)].map((m) => JSON.parse(m[1].replaceAll('&quot;', '"').replaceAll('&amp;', '&').replaceAll('&#39;', "'")));

const today = { name: 'Today', colour: '#4a8ff5', area: true, points: [{ ts: FROM, value: 0 }, { ts: FROM + H, value: 5 }, { ts: FROM + 2 * H, value: -3 }, { ts: NOW, value: 2 }] };
const yesterday = { name: 'Yesterday', colour: '#6b778a', ghost: true, points: [{ ts: FROM, value: 0 }, { ts: FROM + 12 * H, value: 8 }, { ts: FROM + 24 * H, value: 4 }] };
const curve = (over = {}) => String(dayCurve({ id: 'pnl', from: FROM, now: NOW, series: [today, yesterday], format: fmt, title: 'Running studio P/L', polarity: true, ...over }));

// ------------------------------------------------------------ dayCurve
test('the day curve spans the whole UTC day, labelled every three hours, 00:00 to 24:00', () => {
  const out = curve();
  for (const h of ['00:00', '03:00', '12:00', '21:00', '24:00']) assert.match(out, new RegExp(`>${h}<`), h);
  assert.match(out, /aria-label="Running studio P\/L"/);
});

test('the hours still to come are shaded, from now to midnight', () => {
  assert.match(curve(), /class="future-zone"/);
  assert.doesNotMatch(curve({ now: FROM + 24 * H }), /class="future-zone"/, 'nothing left of a finished day');
});

test('a ghost series is dashed and two series get a legend naming both', () => {
  const out = curve();
  assert.match(out, /class="series ghost"[^>]*stroke-dasharray/);
  assert.match(out, />Today</);
  assert.match(out, />Yesterday</);
  assert.doesNotMatch(curve({ series: [today] }), /class="legend"/, 'one series, no legend box');
});

test('polarity splits the area at zero into a gain and a loss fill, with a zero line', () => {
  const out = curve();
  assert.match(out, /class="area-gain"/);
  assert.match(out, /class="area-loss"/);
  assert.match(out, /class="zero-line"/);
  assert.match(out, /<clipPath id="pnl-above">/);
});

test('an unmeasured point breaks the path rather than bridging it', () => {
  const broken = { ...today, points: [{ ts: FROM, value: 0 }, { ts: FROM + H, value: 5 }, { ts: FROM + H + 1, value: null }, { ts: FROM + 3 * H, value: 7 }] };
  const out = curve({ series: [broken] });
  assert.equal((out.match(/<path class="series"/g) ?? []).length, 2);
});

test('the newest reading is marked and labelled with its value', () => {
  const out = curve();
  assert.match(out, /class="now-dot"/);
  assert.match(out, /class="now-value"[^>]*>\$2\.00</);
});

test('every quarter hour has a hover band naming the time and each series\' value, a dash where there is none', () => {
  const all = tips(curve());
  assert.equal(all.length, 96);
  assert.equal(all[0].label, '00:00-00:15Z');
  const late = all.find((t) => t.label === '12:00-12:15Z');
  assert.equal(late.rows.find((r) => r.name === 'Today').value, '-', 'the future is not a zero');
  assert.equal(late.rows.find((r) => r.name === 'Yesterday').value, '$8.00');
});

test('an empty day draws the empty axis and says there is nothing yet', () => {
  const out = String(dayCurve({ id: 'x', from: FROM, now: FROM + 60_000, series: [{ ...today, points: [] }], format: fmt, title: 't' }));
  assert.match(out, /Nothing measured yet today/);
});

test('hostile series names cannot inject markup', () => {
  const out = curve({ series: [{ ...today, name: '<img src=x>' }] });
  assert.doesNotMatch(out, /<img src=x/);
});

// ------------------------------------------------------------ heatGrid
const cells = (values) => values.map((v) => (v === undefined ? { state: 'future' } : v === null ? { state: 'missed', value: null } : { state: 'measured', value: v, tip: `${v}` }));
const grid = (over = {}) => String(heatGrid({
  columns: ['00', '01', '02', '03'],
  rows: [
    { label: 'Berry', href: '/game/berry', cells: cells([0, 50, 100, undefined]) },
    { label: 'Pixel Geyser', cells: cells([10, null, 0, undefined]) },
  ],
  max: 100, format: fmt, title: 'Turnover by game and hour', ...over }));

test('the grid has one cell per measured game-hour, painted from the ramp', () => {
  const out = grid();
  assert.equal((out.match(/class="cell"/g) ?? []).length, 5);
  assert.match(out, new RegExp(`fill="${rampColour(1)}"`), 'the largest cell takes the top of the ramp');
});

test('a missed hour is an outline, not a colour; a future hour has no cell at all', () => {
  const out = grid();
  assert.equal((out.match(/class="cell-missed"/g) ?? []).length, 1);
  assert.equal((out.match(/class="cell-future"/g) ?? []).length, 2);
});

test('the ramp runs dark to light and is square-root scaled, so a small hour still shows', () => {
  assert.notEqual(rampColour(0), rampColour(1));
  assert.notEqual(rampColour(0.04), rampColour(0), 'a 4% hour is visibly off the floor');
});

test('each row label links to its game where a link is given', () => {
  const out = grid();
  assert.match(out, /<a href="\/game\/berry"[^>]*>[\s\S]*?Berry/);
  assert.match(out, /Pixel Geyser/);
});

test('the grid carries a scale legend from zero to its maximum', () => {
  const out = grid();
  assert.match(out, /<linearGradient id="[^"]+"/);
  assert.match(out, />\$0\.00</);
  assert.match(out, />\$100\.00</);
});

test('an empty grid says so', () => {
  assert.match(String(heatGrid({ columns: ['00'], rows: [], max: 0, title: 't' })), /No game has taken a bet today yet/);
});

// ------------------------------------------------------------ the day ahead on column charts
test('columns and stacked bars shade the slots still to come', () => {
  const rows = [{ label: '00', value: 1 }, { label: '01', value: null }, { label: '02', value: null }];
  assert.match(String(columns({ rows, futureFrom: 1 })), /class="future-zone"/);
  assert.doesNotMatch(String(columns({ rows })), /class="future-zone"/);
  const stack = String(stackedBars({ rows: [{ a: 1 }, {}, {}], keys: ['a'], labels: ['00', '01', '02'], futureFrom: 1 }));
  assert.match(stack, /class="future-zone"/);
});

test('stacked bars given tips carry a hover readout per stack', () => {
  const out = String(stackedBars({ rows: [{ a: 1, b: 2 }], keys: ['a', 'b'], labels: ['00'], tips: [{ label: '00:00Z', rows: [{ name: 'a', value: '1' }] }] }));
  assert.equal(tips(out).length, 1);
  assert.equal(tips(out)[0].label, '00:00Z');
});
