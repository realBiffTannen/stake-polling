import { test } from 'node:test';
import assert from 'node:assert/strict';
import { linearScale, niceTicks } from '../src/web/charts/scale.mjs';
import { lineChart } from '../src/web/charts/line.mjs';
import { stackedBars } from '../src/web/charts/bars.mjs';
import { scatterChart } from '../src/web/charts/scatter.mjs';

function pointsOf(pathD) {
  return [...pathD.matchAll(/(-?\d+(?:\.\d+)?),(-?\d+(?:\.\d+)?)/g)].map(m => [Number(m[1]), Number(m[2])]);
}

test('a linear scale maps the domain onto the range', () => {
  const s = linearScale({ domain: [0, 10], range: [100, 0] });
  assert.equal(s(0), 100);
  assert.equal(s(10), 0);
  assert.equal(s(5), 50);
});

test('a flat domain does not divide by zero', () => {
  const s = linearScale({ domain: [5, 5], range: [0, 100] });
  assert.ok(Number.isFinite(s(5)));
});

test('ticks are round numbers that cover the range', () => {
  const ticks = niceTicks(0, 97, 5);
  assert.ok(ticks.length >= 2 && ticks.length <= 8);
  assert.ok(ticks.at(-1) >= 97);
  assert.ok(ticks.every(Number.isFinite));
});

test('a line chart breaks its path at an unmeasured point instead of drawing through it', () => {
  const out = String(lineChart({ series: [{ name: 'a', colour: '#fff', values: [1, null, 3] }], labels: ['d1', 'd2', 'd3'] }));
  const segments = [...out.matchAll(/d="M([^"]+)"/g)].map(m => m[1]);
  assert.equal(segments.length, 2, 'two segments, not one line across the gap');
  const [seg1, seg2] = segments.map(pointsOf);
  const allX = [...seg1, ...seg2].map(([x]) => x);
  assert.equal(new Set(allX).size, 2, 'only the two measured points are plotted; the gap index is in neither segment');
  assert.ok(Math.max(...seg1.map(p => p[0])) < Math.min(...seg2.map(p => p[0])), 'the two segments do not overlap in x');
});

test('a series longer than its labels is trimmed, not plotted off the canvas', () => {
  const out = String(lineChart({ series: [{ name: 'a', colour: '#fff', values: [1, 2, 3, 4, 5] }], labels: ['a', 'b'], width: 900 }));
  const xs = [...out.matchAll(/[ML](-?\d+(?:\.\d+)?),/g)].map(m => Number(m[1]));
  assert.ok(xs.length > 0, 'something is still drawn');
  for (const x of xs) assert.ok(x >= 0 && x <= 900, `x ${x} is outside the 900-wide canvas`);
});

test('a series shorter than its labels stops rather than inventing points', () => {
  const out = String(lineChart({ series: [{ name: 'a', colour: '#fff', values: [1, 2] }], labels: ['a', 'b', 'c', 'd'] }));
  assert.doesNotMatch(out, /NaN/);
});

test('a dual-axis line chart scales each axis independently, not from one shared domain', () => {
  const out = String(lineChart({
    series: [{ name: 'avg returning', colour: '#86e1c4', values: [1, 2, 3], axis: 'left' },
             { name: 'games released', colour: '#a69aff', values: [1000, 2000, 3000], axis: 'right' }],
    labels: ['d1', 'd2', 'd3'],
  }));
  assert.match(out, /avg returning/);
  assert.match(out, /games released/);
  const leftTicks = [...out.matchAll(/text-anchor="end">([^<]+)<\/text>/g)].map(m => Number(m[1]));
  const rightTicks = [...out.matchAll(/text-anchor="start">([^<]+)<\/text>/g)].map(m => Number(m[1]));
  assert.ok(rightTicks.some(t => t >= 1000), 'the right axis should carry a four-digit tick from the 1000-3000 series');
  assert.ok(leftTicks.every(t => t < 1000), 'the left axis must not be stretched by the right series\' scale');
});

test('a chart escapes an untrusted series name', () => {
  const out = String(lineChart({ series: [{ name: '<script>x</script>', colour: '#fff', values: [1, 2] }], labels: ['a', 'b'] }));
  assert.doesNotMatch(out, /<script>/);
});

test('stacked bars stack their keys and label the axis', () => {
  const out = String(stackedBars({ rows: [{ BASE: 4, BONUS: 6 }], keys: ['BASE', 'BONUS'], labels: ['2026-09-18'] }));
  assert.equal((out.match(/<rect/g) ?? []).length >= 2, true);
  assert.match(out, /2026-09-18/);
});

test('rows define a bar chart; a row with no label still draws, inside the canvas', () => {
  const out = String(stackedBars({
    rows: [{ BASE: 4 }, { BASE: 6 }, { BASE: 8 }],
    keys: ['BASE'], labels: ['a'], width: 900, height: 260,
  }));
  // Scope to the per-row groups (one <g><title>...</g> per row); the keys
  // legend at the bottom of the chart is its own <rect> with the same
  // "height > 0" shape and would otherwise be miscounted as a fourth bar.
  const rowGroups = [...out.matchAll(/<g><title>[\s\S]*?<\/g>/g)].map(m => m[0]);
  assert.equal(rowGroups.length, 3, 'one group per row, labelled or not');
  const rects = rowGroups.flatMap(g => [...g.matchAll(/<rect x="(-?\d+(?:\.\d+)?)"[^>]*height="(-?\d+(?:\.\d+)?)"/g)]);
  const bars = rects.filter(m => Number(m[2]) > 0);
  assert.equal(bars.length, 3, 'every row draws, labelled or not');
  for (const m of bars) {
    const x = Number(m[1]);
    assert.ok(x >= 0 && x <= 900, `bar x ${x} is outside the canvas`);
  }
  assert.doesNotMatch(out, /NaN|undefined/);
});

test('stacked bars escape an untrusted key and label', () => {
  const out = String(stackedBars({
    rows: [{ '<script>k</script>': 4 }],
    keys: ['<script>k</script>'],
    labels: ['<script>l</script>'],
  }));
  assert.doesNotMatch(out, /<script>/);
});

test('a scatter chart fits a line only when there are three or more points', () => {
  const few = String(scatterChart({ points: [{ x: 1, y: 1 }, { x: 2, y: 2 }], xLabel: 'x', yLabel: 'y', fit: true }));
  assert.doesNotMatch(few, /class="fit"/);
  const many = String(scatterChart({ points: [{ x: 1, y: 1 }, { x: 2, y: 2 }, { x: 3, y: 3.1 }], xLabel: 'x', yLabel: 'y', fit: true }));
  assert.match(many, /class="fit"/);
});

test('a scatter chart escapes an untrusted point label and axis label', () => {
  const out = String(scatterChart({
    points: [{ x: 1, y: 1, label: '<script>p</script>' }],
    xLabel: '<script>x</script>',
    yLabel: '<script>y</script>',
  }));
  assert.doesNotMatch(out, /<script>/);
});

// The hover layer. Each x position carries the numbers that drew it, so the
// browser only has to show them - it never recomputes a value from geometry.
const unescapeAttr = (s) => s.replace(/&quot;/g, '"').replace(/&#39;/g, "'").replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&amp;/g, '&');
const tipsOf = (out) => [...String(out).matchAll(/data-tip="([^"]*)"/g)].map(m => JSON.parse(unescapeAttr(m[1])));

test('a line chart carries one hover readout per label, listing every series at that x', () => {
  const tips = tipsOf(lineChart({ labels: ['09-10', '09-11'], tipLabels: ['2026-09-10', '2026-09-11'],
    series: [{ name: 'players', colour: '#38d6c4', values: [372, 1680] }, { name: 'new', colour: '#c792ea', values: [330, 1641] }] }));
  assert.equal(tips.length, 2);
  assert.deepEqual(tips[1], { label: '2026-09-11', rows: [
    { name: 'players', value: '1680', colour: '#38d6c4' }, { name: 'new', value: '1641', colour: '#c792ea' }] });
});

test('an unmeasured point reads as a dash in the hover readout, never as zero, and gets no marker', () => {
  const out = String(lineChart({ labels: ['d1', 'd2'], series: [{ name: 'a', colour: '#fff', values: [5, null] }] }));
  const tips = tipsOf(out);
  assert.equal(tips[1].rows[0].value, '-');
  assert.equal((out.match(/class="focus-dot"/g) ?? []).length, 1, 'only the measured point has a marker');
  assert.doesNotMatch(out, /NaN/);
});

test('hover bands are as wide as the point spacing, so no x position falls between two bands', () => {
  const out = String(lineChart({ labels: ['a', 'b', 'c'], series: [{ name: 's', colour: '#fff', values: [1, 2, 3] }], width: 900 }));
  const bands = [...out.matchAll(/<rect class="hit-band" x="([^"]+)" y="[^"]+" width="([^"]+)"/g)].map(m => [Number(m[1]), Number(m[2])]);
  assert.equal(bands.length, 3);
  for (let i = 1; i < bands.length; i++) assert.ok(Math.abs(bands[i - 1][0] + bands[i - 1][1] - bands[i][0]) < 0.01, 'bands tile edge to edge');
});

test('a scatter point carries its label and both coordinates for hover', () => {
  const tips = tipsOf(scatterChart({ points: [{ x: 11.19, y: 0.12345, label: 'Pixel Geyser' }], xLabel: 'vol', yLabel: 'share' }));
  assert.deepEqual(tips, [{ label: 'Pixel Geyser', rows: [{ name: 'vol', value: '11.19' }, { name: 'share', value: '0.123' }] }]);
});

test('stacked bars can leave their legend to the page', () => {
  const out = String(stackedBars({ rows: [{ a: 1 }], keys: ['a'], labels: ['x'], legend: false }));
  assert.doesNotMatch(out, /y="2" width="10" height="10"/);
  assert.match(String(stackedBars({ rows: [{ a: 1 }], keys: ['a'], labels: ['x'] })), /y="2" width="10" height="10"/, 'drawn by default');
});

test('a line chart whose values cross zero draws a solid zero line exactly where the 0 tick sits', () => {
  const out = String(lineChart({ series: [{ name: 'p/l', colour: '#fff', values: [10, 450, -900, 90] }], labels: ['01', '07', '19', '00'] }));
  const zero = /<line class="zero-line"[^>]*y1="(-?\d+(?:\.\d+)?)"[^>]*y2="(-?\d+(?:\.\d+)?)"/.exec(out);
  assert.ok(zero, 'a zero line is drawn');
  assert.equal(zero[1], zero[2], 'it is horizontal');
  const gridAtZero = /<line class="gridline"[^>]*y1="([^"]+)"[^>]*\/>\s*<text class="axis-label"[^>]*>0<\/text>/.exec(out);
  assert.ok(gridAtZero, 'the 0 tick is labelled');
  assert.equal(Number(zero[1]), Number(gridAtZero[1]), 'the zero line sits on the 0 tick');
});

test('a line chart that never crosses zero draws no zero line', () => {
  for (const values of [[1, 2, 3], [-3, -2, -1], [0, 2, 4]]) {
    const out = String(lineChart({ series: [{ name: 'a', colour: '#fff', values }], labels: ['a', 'b', 'c'] }));
    assert.doesNotMatch(out, /zero-line/, JSON.stringify(values));
  }
});
