/**
 * Horizontal bar charts: one row per entity, the label on the left and the
 * exact value in a fixed column on the right.
 *
 * The value column is the secondary encoding - a bar's colour is never the
 * only way to read its sign or size - and it doubles as the table view: every
 * number the bar draws is also printed. A row nobody measured keeps its label
 * and prints '-', with no bar at all; a zero-width bar would claim a zero.
 */

import { html } from '../html.mjs';
import { linearScale, valid } from './scale.mjs';

const ROW = 26;
const BAR = 16;
const TONE = { pos: '#7fdec1', neg: '#ff8796', neutral: '#4a8ff5' };
// Validated as a categorical pair on the dark panel (#131a26): lightness band,
// CVD separation and contrast all pass. See the dataviz palette validator.
export const PAIR_COLOURS = ['#4a8ff5', '#cc7d22'];

const numberOrNull = (v) => (valid(v) ? Number(v) : null);

function domainOf(values) {
  const vals = values.filter(valid).map(Number);
  const lo = Math.min(0, ...vals), hi = Math.max(0, ...vals);
  return hi === lo ? [lo, lo + 1] : [lo, hi];
}

/**
 * @param {{ rows: { key?: string, label: string, value: number|null }[], tone?: 'sign'|'neutral',
 *   format?: (v: number) => string, title?: string }} opts
 */
export function hbars({ rows = [], tone = 'sign', format = String, title = '', width = 900, labelWidth = 180, valueWidth = 110 } = {}) {
  const top = 6, height = top * 2 + Math.max(1, rows.length) * ROW;
  const xs = linearScale({ domain: domainOf(rows.map((r) => r.value)), range: [labelWidth + 10, width - valueWidth - 10] });
  const zero = xs(0);
  return html`<svg class="chart hbars" viewBox="0 0 ${width} ${height}" role="img" aria-label="${title}"><title>${title}</title>
    <line class="zero" x1="${zero}" x2="${zero}" y1="${top}" y2="${height - top}"/>
    ${rows.map((r, i) => {
      const y = top + i * ROW, v = numberOrNull(r.value);
      const kind = tone === 'neutral' ? 'neutral' : v < 0 ? 'neg' : 'pos';
      const shown = v === null ? '-' : format(v);
      const tip = JSON.stringify({ label: String(r.label), rows: [{ name: title, value: String(shown), colour: TONE[kind] }] });
      return html`<g class="hit" data-tip="${tip}"><rect x="0" y="${y}" width="${width}" height="${ROW}" fill="transparent"/>
        <text class="axis-label bar-label" x="${labelWidth}" y="${y + ROW / 2 + 4}" text-anchor="end">${r.label}</text>
        ${v === null ? null : html`<rect class="bar-${kind}" x="${Math.min(zero, xs(v))}" y="${y + (ROW - BAR) / 2}" width="${Math.max(1, Math.abs(xs(v) - zero))}" height="${BAR}" rx="3"/>`}
        <text class="axis-label bar-value" x="${width - 4}" y="${y + ROW / 2 + 4}" text-anchor="end">${shown}</text></g>`;
    })}</svg>`;
}

/**
 * Two measures per row on ONE scale - e.g. share of bets beside share of
 * turnover, both percentages. Two measures of different units belong in two
 * charts, never here.
 */
export function pairedBars({ rows = [], names = ['a', 'b'], colours = PAIR_COLOURS, format = String, title = '', width = 900, labelWidth = 180, valueWidth = 150 } = {}) {
  const ROWP = 30, THIN = 10, legend = 22;
  const height = legend + 8 + Math.max(1, rows.length) * ROWP;
  const xs = linearScale({ domain: domainOf(rows.flatMap((r) => [r.a, r.b])), range: [labelWidth + 10, width - valueWidth - 10] });
  const zero = xs(0);
  return html`<svg class="chart hbars" viewBox="0 0 ${width} ${height}" role="img" aria-label="${title}"><title>${title}</title>
    ${names.map((n, j) => html`<g><rect class="legend-swatch" x="${labelWidth + 10 + j * 150}" y="4" width="10" height="10" rx="2" fill="${colours[j]}"/>
      <text class="axis-label" x="${labelWidth + 26 + j * 150}" y="13">${n}</text></g>`)}
    ${rows.map((r, i) => {
      const y = legend + 8 + i * ROWP, a = numberOrNull(r.a), b = numberOrNull(r.b);
      const fa = a === null ? '-' : format(a), fb = b === null ? '-' : format(b);
      const tip = JSON.stringify({ label: String(r.label), rows: [{ name: names[0], value: String(fa), colour: colours[0] }, { name: names[1], value: String(fb), colour: colours[1] }] });
      return html`<g class="hit" data-tip="${tip}"><rect x="0" y="${y}" width="${width}" height="${ROWP}" fill="transparent"/>
        <text class="axis-label bar-label" x="${labelWidth}" y="${y + ROWP / 2 + 4}" text-anchor="end">${r.label}</text>
        ${a === null ? null : html`<rect class="pair-a" x="${zero}" y="${y + 4}" width="${Math.max(1, xs(a) - zero)}" height="${THIN}" rx="2" fill="${colours[0]}"/>`}
        ${b === null ? null : html`<rect class="pair-b" x="${zero}" y="${y + 6 + THIN}" width="${Math.max(1, xs(b) - zero)}" height="${THIN}" rx="2" fill="${colours[1]}"/>`}
        <text class="axis-label bar-value" x="${width - 4}" y="${y + ROWP / 2 + 4}" text-anchor="end">${fa} / ${fb}</text></g>`;
    })}</svg>`;
}

/**
 * Observed value against a reference and its noise band, one row each.
 * Rows: { label, value, lo, hi, ref, outside, z? } - lo/hi/ref null when no
 * row cannot be judged, in which case only the observed dot is drawn and
 * the value column says so.
 */
export function bandChart({ rows = [], format = String, title = '', width = 900, labelWidth = 180, valueWidth = 170 } = {}) {
  const top = 6, height = top * 2 + Math.max(1, rows.length) * ROW;
  const [d0, d1] = domainOf(rows.flatMap((r) => [r.value, r.lo, r.hi, r.ref]));
  const padBy = (d1 - d0) * 0.04;
  const xs = linearScale({ domain: [d0 - padBy, d1 + padBy], range: [labelWidth + 10, width - valueWidth - 10] });
  return html`<svg class="chart hbars" viewBox="0 0 ${width} ${height}" role="img" aria-label="${title}"><title>${title}</title>
    <line class="zero" x1="${xs(0)}" x2="${xs(0)}" y1="${top}" y2="${height - top}"/>
    ${rows.map((r, i) => {
      const y = top + i * ROW, mid = y + ROW / 2, v = numberOrNull(r.value);
      const lo = numberOrNull(r.lo), hi = numberOrNull(r.hi), ref = numberOrNull(r.ref);
      const banded = lo !== null && hi !== null;
      const dot = r.outside === true ? 'dot-out' : r.outside === false ? 'dot-in' : 'dot-na';
      const shown = v === null ? '-' : format(v);
      const tip = JSON.stringify({ label: String(r.label), rows: [
        { name: 'observed', value: String(shown), colour: '#86e1c4' },
        { name: 'captured edge', value: ref === null ? '-' : String(format(ref)), colour: '#8d9bb0' },
        { name: '±2 SE band', value: banded ? `${format(lo)} to ${format(hi)}` : 'not judged', colour: '#26324a' },
        { name: 'z', value: valid(r.z) ? Number(r.z).toFixed(1) : '-', colour: '#6b778a' }] });
      return html`<g class="hit" data-tip="${tip}"><rect x="0" y="${y}" width="${width}" height="${ROW}" fill="transparent"/>
        <text class="axis-label bar-label" x="${labelWidth}" y="${mid + 4}" text-anchor="end">${r.label}</text>
        ${banded ? html`<rect class="band" x="${xs(lo)}" y="${mid - 7}" width="${Math.max(1, xs(hi) - xs(lo))}" height="14" rx="3"/>` : null}
        ${ref === null ? null : html`<line class="band-ref" x1="${xs(ref)}" x2="${xs(ref)}" y1="${mid - 9}" y2="${mid + 9}"/>`}
        ${v === null ? null : html`<circle class="${dot}" cx="${xs(v)}" cy="${mid}" r="5"/>`}
        <text class="axis-label bar-value" x="${width - 4}" y="${mid + 4}" text-anchor="end">${shown}${banded ? '' : ' · not judged'}</text></g>`;
    })}</svg>`;
}
