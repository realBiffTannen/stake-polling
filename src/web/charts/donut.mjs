/**
 * A donut of shares, with its legend beside it.
 *
 * Slices are drawn in the order given, NOT sorted by size: callers pass them
 * in palette order, so ring neighbours are always palette neighbours - the
 * only pairs the palette is validated to separate (the all-pairs check fails
 * for seven hues under deuteranopia, as it must for any seven). The legend
 * prints every share, so identity never rests on colour alone.
 */

import { html, raw } from '../html.mjs';
import { valid } from './scale.mjs';

// Seven hues validated on the dark panel (#131a26), adjacent pairs, with the
// dataviz palette validator: lightness band, chroma, CVD separation, normal-
// vision floor and contrast all pass. An eighth entity folds into Other.
export const GAME_COLOURS = ['#4a8ff5', '#cc7d22', '#2fa88f', '#a077e0', '#d0587a', '#8f9a2c', '#359bba'];
export const OTHER_COLOUR = '#6b778a';

const f = (n) => n.toFixed(2);

function sector(cx, cy, R, r, a0, a1) {
  const p = (rad, ang) => [cx + rad * Math.cos(ang), cy + rad * Math.sin(ang)];
  const large = a1 - a0 > Math.PI ? 1 : 0;
  const [x0, y0] = p(R, a0), [x1, y1] = p(R, a1), [x2, y2] = p(r, a1), [x3, y3] = p(r, a0);
  return `M${f(x0)},${f(y0)} A${R},${R} 0 ${large} 1 ${f(x1)},${f(y1)} L${f(x2)},${f(y2)} A${r},${r} 0 ${large} 0 ${f(x3)},${f(y3)} Z`;
}

function ring(cx, cy, R, r) {
  return `M${cx},${cy - R} A${R},${R} 0 1 1 ${cx},${cy + R} A${R},${R} 0 1 1 ${cx},${cy - R} Z `
    + `M${cx},${cy - r} A${r},${r} 0 1 0 ${cx},${cy + r} A${r},${r} 0 1 0 ${cx},${cy - r} Z`;
}

/**
 * @param {{ slices: { key: string, label: string, value: number|null, colour: string }[],
 *   title?: string, format?: (v: number) => string, centre?: string }} opts
 */
export function donut({ slices = [], title = '', format = String, centre = '', width = 420, height = 220 } = {}) {
  const shown = slices.filter((s) => valid(s.value) && Number(s.value) > 0);
  const total = shown.reduce((a, s) => a + Number(s.value), 0);
  if (!shown.length || total <= 0) {
    return html`<svg class="chart donut" viewBox="0 0 ${width} ${height}" role="img" aria-label="${title}"><title>${title}</title>
      <text class="axis-label" x="${width / 2}" y="${height / 2}" text-anchor="middle">Nothing measured in this period</text></svg>`;
  }
  const cx = 110, cy = height / 2, R = 92, r = 58;
  let angle = -Math.PI / 2;
  const arcs = shown.map((s) => {
    const share = Number(s.value) / total, a0 = angle, a1 = angle + share * 2 * Math.PI;
    angle = a1;
    const tip = JSON.stringify({ label: title, rows: [{ name: String(s.label), value: `${format(Number(s.value))} (${(share * 100).toFixed(1)}%)`, colour: s.colour }] });
    const d = shown.length === 1 ? ring(cx, cy, R, r) : sector(cx, cy, R, r, a0, a1);
    return html`<g class="hit" data-tip="${tip}"><path class="slice" d="${raw(d)}" fill="${s.colour}" fill-rule="evenodd" stroke="#131a26" stroke-width="2"/></g>`;
  });
  const legendTop = Math.max(12, cy - (shown.length * 22) / 2 + 8);
  return html`<svg class="chart donut" viewBox="0 0 ${width} ${height}" role="img" aria-label="${title}"><title>${title}</title>
    ${arcs}
    <text class="donut-centre" x="${cx}" y="${cy + 2}" text-anchor="middle">${centre}</text>
    <text class="axis-label" x="${cx}" y="${cy + 18}" text-anchor="middle">total</text>
    ${shown.map((s, i) => html`<g><rect x="232" y="${legendTop + i * 22 - 9}" width="10" height="10" rx="2" fill="${s.colour}"/>
      <text class="axis-label donut-name" x="248" y="${legendTop + i * 22}">${s.label}</text>
      <text class="axis-label" x="${width - 4}" y="${legendTop + i * 22}" text-anchor="end">${(Number(s.value) / total * 100).toFixed(1)}%</text></g>`)}
  </svg>`;
}
