/**
 * A heat grid: one row per entity, one cell per column (an hour of the day),
 * each painted from a single-hue sequential ramp by its value.
 *
 * Drawn on the server like every other SVG chart here, so its height follows
 * its row count and it needs no script. Three kinds of cell, never confused:
 *
 *   measured  a value, painted from the ramp - a measured zero takes the
 *             ramp's floor, which still reads as a cell;
 *   missed    the collector did not read it: an outline, no colour;
 *   future    it has not happened: the faintest of placeholders.
 *
 * The ramp is scaled by square root: turnover is heavy-tailed, and on a linear
 * scale one busy game would leave every other cell at the floor.
 */

import { html } from '../html.mjs';

// The same five steps as the interactive heatmap's ramp (chart-assets.mjs),
// dark to light on the dark panel.
export const RAMP = ['#1f3d3f', '#2d6a60', '#4aa38c', '#86e1c4', '#cdf6e8'];

const rgb = (hex) => [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16));
const hex2 = (n) => Math.round(n).toString(16).padStart(2, '0');

/** The ramp colour for `share` of the maximum (0..1), square-root scaled. */
export function rampColour(share) {
  const t = Math.sqrt(Math.min(1, Math.max(0, Number(share) || 0)));
  const pos = t * (RAMP.length - 1);
  const i = Math.min(RAMP.length - 2, Math.floor(pos));
  const [a, b] = [rgb(RAMP[i]), rgb(RAMP[i + 1])];
  const k = pos - i;
  return `#${a.map((c, j) => hex2(c + (b[j] - c) * k)).join('')}`;
}

const clip = (s, n) => (String(s).length > n ? `${String(s).slice(0, n - 1)}…` : String(s));

/**
 * @param {{ columns: string[], rows: { label: string, href?: string,
 *   cells: { state: 'measured'|'missed'|'future', value?: number|null, rows?: { name: string, value: string }[] }[] }[],
 *   max: number, format?: (v: number) => string, title?: string, noun?: string, width?: number }} opts
 *   `rows` on a cell is its hover readout; without one the readout is its value.
 */
export function heatGrid({ columns = [], rows = [], max = 0, format = String, title = '', width = 900, labelWidth = 150, rowHeight = 24, id = 'grid' } = {}) {
  if (!rows.length) {
    return html`<svg class="chart heat-grid" viewBox="0 0 ${width} 60" role="img" aria-label="${title}"><title>${title}</title>
      <text class="axis-label" x="${width / 2}" y="34" text-anchor="middle">No game has taken a bet today yet</text></svg>`;
  }
  const top = 4, gap = 2;
  const cellW = (width - labelWidth - 12) / Math.max(1, columns.length);
  const gridH = rows.length * rowHeight;
  const height = top + gridH + 22 + 34;
  const x0 = labelWidth + 12;
  const every = Math.max(1, Math.ceil(columns.length / 8));

  const body = rows.map((row, r) => {
    const y = top + r * rowHeight;
    const text = html`<text class="axis-label bar-label" x="${labelWidth}" y="${y + rowHeight / 2 + 4}" text-anchor="end">${clip(row.label, 24)}</text>`;
    const label = row.href ? html`<a href="${row.href}">${text}</a>` : text;
    const cells = row.cells.map((c, i) => {
      const x = x0 + i * cellW + gap / 2, w = cellW - gap, h = rowHeight - gap, cy = y + gap / 2;
      if (c.state === 'future') return html`<rect class="cell-future" x="${x.toFixed(1)}" y="${cy}" width="${w.toFixed(1)}" height="${h}" rx="3"/>`;
      const tip = JSON.stringify({ label: `${row.label} · ${columns[i]}`,
        rows: c.state === 'missed' ? [{ name: title, value: '-' }] : c.rows ?? [{ name: title, value: String(format(Number(c.value))) }],
        ...(c.state === 'missed' ? { note: 'Not measured: left empty, not zero.' } : c.note ? { note: c.note } : {}) });
      const mark = c.state === 'missed'
        ? html`<rect class="cell-missed" x="${(x + 0.5).toFixed(1)}" y="${cy + 0.5}" width="${(w - 1).toFixed(1)}" height="${h - 1}" rx="3"/>`
        : html`<rect class="cell" x="${x.toFixed(1)}" y="${cy}" width="${w.toFixed(1)}" height="${h}" rx="3" fill="${rampColour(max > 0 ? Number(c.value) / max : 0)}"/>`;
      return html`<g class="hit" data-tip="${tip}">${mark}</g>`;
    });
    return html`<g>${label}${cells}</g>`;
  });

  const axisY = top + gridH + 16;
  const legendY = axisY + 14, legendX = x0, legendW = 180;
  return html`<svg class="chart heat-grid" viewBox="0 0 ${width} ${height}" role="img" aria-label="${title}"><title>${title}</title>
    <defs><linearGradient id="${id}-ramp" x1="0" x2="1" y1="0" y2="0">${RAMP.map((c, i) => html`<stop offset="${(i / (RAMP.length - 1)).toFixed(2)}" stop-color="${c}"/>`)}</linearGradient></defs>
    ${body}
    ${columns.map((c, i) => (i % every === 0 ? html`<text class="axis-label" x="${(x0 + (i + 0.5) * cellW).toFixed(1)}" y="${axisY}" text-anchor="middle">${c}</text>` : null))}
    <rect x="${legendX}" y="${legendY}" width="${legendW}" height="8" rx="2" fill="url(#${id}-ramp)"/>
    <text class="axis-label" x="${legendX - 6}" y="${legendY + 8}" text-anchor="end">${format(0)}</text>
    <text class="axis-label" x="${legendX + legendW + 6}" y="${legendY + 8}">${format(max)}</text>
    <text class="axis-label" x="${legendX + legendW + 22 + String(format(max)).length * 6.5}" y="${legendY + 8}">square-root scale · dashed = not measured</text>
  </svg>`;
}
