import { test } from 'node:test';
import assert from 'node:assert/strict';
import { niceAxis, labelGutter } from '../src/web/charts/scale.mjs';
import { lineChart } from '../src/web/charts/line.mjs';
import { columns } from '../src/web/charts/columns.mjs';
import { stackedBars } from '../src/web/charts/bars.mjs';
import { timeLine } from '../src/web/charts/time.mjs';
import { scatterChart } from '../src/web/charts/scatter.mjs';
import { formatUsdSigned } from '../src/money.mjs';

// A 30-day running P/L that only ever loses: the shape that drew a -$10,000
// gridline under the date labels and clipped every minus sign off the axis.
const LOSING = [0, 50, -650, -470, -1800, -2000, -2050, -2350, -2300, -2000, -2050, -1500, -1300, -1250, -1150,
  -3900, -5300, -5600, -5650, -4950, -4900, -4700, -4750, -4800, -4400, -4700, -6600, -8900, -8750];

// Axis labels are 10px text. Six pixels a character is a floor on how wide a
// label is, not an estimate of it: a gutter narrower than this certainly clips.
const MIN_CHAR_PX = 6;

/** Every horizontal gridline with the right-anchored label drawn beside it. */
function yAxis(svg) {
  return [...String(svg).matchAll(/<line class="gridline"[^>]*y1="([^"]+)"[^>]*\/>\s*<text class="axis-label" x="([^"]+)" y="[^"]+" text-anchor="end">([^<]+)</g)]
    .map((m) => ({ y: Number(m[1]), x: Number(m[2]), label: m[3].replace(/&#39;/g, "'").replace(/&amp;/g, '&') }));
}

/** The baseline of the x-axis labels along the bottom edge. */
function xLabelBaseline(svg) {
  const ys = [...String(svg).matchAll(/<text class="axis-label" x="[^"]+" y="([^"]+)" text-anchor="middle">/g)].map((m) => Number(m[1]));
  return Math.max(...ys);
}

function assertAxisInside(svg, what) {
  const axis = yAxis(svg);
  assert.ok(axis.length >= 2, `${what}: draws a y axis`);
  const floor = xLabelBaseline(svg) - 12; // the date labels' cap height sits above their baseline
  for (const t of axis) {
    assert.ok(t.y >= 0 && t.y <= floor, `${what}: the ${t.label} gridline (y ${t.y}) must sit inside the plot, above the date labels (y <= ${floor})`);
    assert.ok(t.x - t.label.length * MIN_CHAR_PX >= 0, `${what}: the ${t.label} label (right edge x ${t.x}) is clipped at the left edge`);
  }
}

test('niceAxis widens the domain to reach its outer ticks, so no tick lands outside the plot', () => {
  const { ticks, domain } = niceAxis(-8900, 50, 4);
  assert.equal(ticks[0], -10000);
  assert.ok(domain[0] <= ticks[0] && domain[1] >= ticks.at(-1), `domain ${domain} covers ticks ${ticks}`);
  assert.ok(domain[0] <= -8900 && domain[1] >= 50, 'and still covers the data');
});

test('labelGutter grows with the widest label and never shrinks below the minimum', () => {
  assert.equal(labelGutter(['$0'], 56), 56);
  assert.ok(labelGutter(['-$10,000.00'], 56) >= 11 * MIN_CHAR_PX + 8);
});

test('a losing running P/L keeps every gridline inside the plot and every minus sign on the axis', () => {
  const svg = lineChart({ labels: LOSING.map((_, i) => `d${i}`), format: formatUsdSigned,
    series: [{ name: 'running studio P/L', colour: '#4a8ff5', values: LOSING }] });
  assertAxisInside(svg, 'line');
  const labels = yAxis(svg).map((t) => t.label);
  assert.ok(labels.includes('-$10,000.00'), `the floor tick is labelled as a loss: ${labels}`);
  assert.ok(labels.filter((l) => l !== '$0.00').every((l) => l.startsWith('-')), `every non-zero tick reads as a loss: ${labels}`);
  // The data still spans the plot: the lowest point sits at or above the lowest gridline.
  const ys = [...String(svg).matchAll(/[ML]-?[\d.]+,(-?[\d.]+)/g)].map((m) => Number(m[1]));
  assert.ok(Math.max(...ys) <= Math.max(...yAxis(svg).map((t) => t.y)) + 0.5, 'no point is drawn below the floor gridline');
});

test('a right-hand axis gets a gutter wide enough for its own labels', () => {
  const svg = String(lineChart({ labels: ['a', 'b', 'c'], format: formatUsdSigned,
    series: [{ name: 'l', colour: '#fff', values: [1, 2, 3] }, { name: 'r', colour: '#000', axis: 'right', values: [-120000, -80000, -95000] }] }));
  const right = [...svg.matchAll(/<text class="axis-label" x="([^"]+)" y="[^"]+" text-anchor="start">([^<]+)</g)].map((m) => ({ x: Number(m[1]), label: m[2] }));
  assert.ok(right.length >= 2);
  for (const t of right) assert.ok(t.x + t.label.length * MIN_CHAR_PX <= 900, `right label ${t.label} at x ${t.x} runs off the canvas`);
});

test('signed columns keep their axis inside the plot', () => {
  const svg = columns({ rows: LOSING.map((v, i) => ({ label: String(i), value: v - (LOSING[i - 1] ?? 0) - 1200 })), tone: 'sign', format: formatUsdSigned });
  assertAxisInside(svg, 'columns');
});

test('stacked bars keep their top tick inside the plot', () => {
  const svg = stackedBars({ rows: [{ a: 70000, b: 19000, c: 1000 }, { a: 5000 }], keys: ['a', 'b', 'c'], labels: ['x', 'y'],
    format: (v) => `$${Math.round(v / 1000)}k` });
  assertAxisInside(svg, 'stacked');
});

test('a time line keeps its top tick inside the plot', () => {
  const t0 = Date.parse('2026-09-22T00:00:00Z');
  const svg = timeLine({ points: [0, 1, 2, 3].map((i) => ({ ts: t0 + i * 3_600_000, value: [12, 37, 9, 21][i] })), format: String });
  assertAxisInside(svg, 'time');
});

test('a scatter chart keeps its x ticks on the canvas', () => {
  const svg = String(scatterChart({ points: [{ x: 1, y: 0.2 }, { x: 53.2, y: 0.9 }, { x: 90, y: 0.4 }], xLabel: 'vol', yLabel: 'share' }));
  const xs = [...svg.matchAll(/<text class="axis-label" x="([^"]+)" y="([^"]+)" text-anchor="middle">([^<]+)</g)]
    .filter((m) => !/[a-z]/.test(m[3])).map((m) => Number(m[1]));
  for (const x of xs) assert.ok(x >= 0 && x <= 620, `x tick at ${x} is off the 620-wide canvas`);
});
