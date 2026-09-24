/**
 * Vertical columns over an ordered axis (hours, days), signed or not.
 *
 * Signed values stand either side of a drawn zero line, so a loss reads as a
 * loss by position before colour. A slot nobody measured draws no column and
 * its hover says '-', never a zero-height bar.
 */

import { html } from '../html.mjs';
import { linearScale, niceAxis, labelGutter, valid } from './scale.mjs';

/**
 * `futureFrom`, when given, is the index of the first slot that has not
 * happened yet (the rest of a day being drawn on its full clock): those slots
 * are shaded, so an empty one reads as "not yet" rather than "nothing".
 */
export function columns({ rows = [], tone = 'neutral', format = String, title = '', width = 900, height = 220, futureFrom = null } = {}) {
  const vals = rows.map((r) => r.value).filter(valid).map(Number);
  let lo = Math.min(0, ...vals), hi = Math.max(0, ...vals);
  if (hi === lo) hi = lo + 1;
  const axis = niceAxis(lo, hi, 4);
  const pad = { left: labelGutter(axis.ticks.map(format), 60), right: 16, top: 14, bottom: 30 };
  const plotW = width - pad.left - pad.right, plotH = height - pad.top - pad.bottom;
  const ys = linearScale({ domain: axis.domain, range: [pad.top + plotH, pad.top] });
  const zero = ys(0);
  const step = plotW / Math.max(1, rows.length), bar = Math.min(28, step * 0.62);
  const every = Math.max(1, Math.ceil(rows.length / 12));
  const colour = { pos: '#7fdec1', neg: '#ff8796', neutral: '#4a8ff5' };
  return html`<svg class="chart" viewBox="0 0 ${width} ${height}" role="img" aria-label="${title}"><title>${title}</title>
    ${axis.ticks.map((t) => html`<g><line class="gridline" x1="${pad.left}" x2="${pad.left + plotW}" y1="${ys(t)}" y2="${ys(t)}"/>
      <text class="axis-label" x="${pad.left - 8}" y="${ys(t) + 4}" text-anchor="end">${format(t)}</text></g>`)}
    ${futureFrom !== null && futureFrom < rows.length ? html`<rect class="future-zone" x="${pad.left + step * futureFrom}" y="${pad.top}" width="${step * (rows.length - futureFrom)}" height="${plotH}"/>` : null}
    <line class="zero" x1="${pad.left}" x2="${pad.left + plotW}" y1="${zero}" y2="${zero}"/>
    ${rows.map((r, i) => {
      const x = pad.left + step * (i + 0.5), v = valid(r.value) ? Number(r.value) : null;
      const kind = tone === 'sign' ? (v < 0 ? 'neg' : 'pos') : 'neutral';
      const tip = JSON.stringify({ label: String(r.tipLabel ?? r.label), rows: [{ name: title, value: v === null ? '-' : String(format(v)), colour: colour[kind] }] });
      return html`<g class="hit" data-tip="${tip}"><rect x="${x - step / 2}" y="${pad.top}" width="${step}" height="${plotH}" fill="transparent"/>
        ${v === null ? null : html`<rect class="bar-${kind}" x="${x - bar / 2}" y="${Math.min(ys(v), zero)}" width="${bar}" height="${Math.max(1, Math.abs(ys(v) - zero))}" rx="2"/>`}
        ${i % every === 0 || i === rows.length - 1 ? html`<text class="axis-label" x="${x}" y="${height - 10}" text-anchor="middle">${r.label}</text>` : null}</g>`;
    })}</svg>`;
}
