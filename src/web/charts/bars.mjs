import { html } from '../html.mjs';
import { linearScale, niceAxis, labelGutter, valid } from './scale.mjs';
import { MODE_COLOURS } from '../svg.mjs';

/**
 * Stacked bars, one stack per label, one layer per key.
 *
 * The ROWS define the chart: one stack per row, and the y axis is scaled to
 * the rows actually drawn. `labels` is decoration aligned by index onto those
 * rows, not a second source of truth for how many bars there are - a row with
 * no matching label still draws, inside the canvas, just unlabelled. This is
 * the opposite contract to lineChart, where the labels array defines the x
 * domain and an out-of-range value is dropped; don't "fix" one into the other.
 *
 * Assumes non-negative values (turnover, counts) - a negative value in a
 * stack would push the bar's accumulated offset past its neighbours and
 * overflow the canvas. Not for signed data such as profit/loss.
 */
export function stackedBars({ rows = [], keys = [], labels = [], colours = MODE_COLOURS,
  width = 900, height = 260, title = '', format = (v) => String(Math.round(v)), legend = true } = {}) {
  const totals = rows.map(r => keys.reduce((a, k) => a + (valid(r[k]) ? Number(r[k]) : 0), 0));
  const max = Math.max(1, ...totals);
  const axis = niceAxis(0, max, 4);
  const pad = { left: labelGutter(axis.ticks.map(format), 56), right: 16, top: 16, bottom: 34 };
  const plotW = width - pad.left - pad.right, plotH = height - pad.top - pad.bottom;
  const ys = linearScale({ domain: axis.domain, range: [pad.top + plotH, pad.top] });
  const step = plotW / Math.max(1, rows.length);
  const bar = Math.min(38, step * 0.62);
  const every = Math.max(1, Math.ceil(rows.length / 10));
  return html`<svg class="chart" viewBox="0 0 ${width} ${height}" role="img" aria-label="${title}"><title>${title}</title>
    ${axis.ticks.map(t => html`<g><line class="gridline" x1="${pad.left}" x2="${pad.left + plotW}" y1="${ys(t)}" y2="${ys(t)}"/>
      <text class="axis-label" x="${pad.left - 8}" y="${ys(t) + 4}" text-anchor="end">${format(t)}</text></g>`)}
    ${rows.map((row, i) => {
      const x = pad.left + step * (i + 0.5) - bar / 2;
      let acc = 0;
      return html`<g><title>${labels[i]}: ${keys.map(k => `${k} ${valid(row[k]) ? format(row[k]) : '-'}`).join(', ')}</title>
        ${keys.map((k, j) => {
          const v = valid(row[k]) ? Number(row[k]) : 0;
          const y = ys(acc + v), h = Math.max(0, ys(acc) - ys(acc + v));
          acc += v;
          return v ? html`<rect x="${x}" y="${y}" width="${bar}" height="${h}" fill="${colours[j % colours.length]}" rx="2"/>` : null;
        })}
        ${i % every === 0 || i === rows.length - 1 ? html`<text class="axis-label" x="${x + bar / 2}" y="${height - 10}" text-anchor="middle">${labels[i]}</text>` : null}</g>`;
    })}
    ${legend ? keys.map((k, j) => html`<g><rect x="${pad.left + j * 120}" y="2" width="10" height="10" rx="2" fill="${colours[j % colours.length]}"/>
      <text class="axis-label" x="${pad.left + 16 + j * 120}" y="11">${k}</text></g>`) : null}
  </svg>`;
}
