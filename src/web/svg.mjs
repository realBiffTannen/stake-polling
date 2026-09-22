/**
 * Charts, drawn by hand.
 *
 * A charting library would be the project's second dependency and its first
 * CDN, for two shapes. These are those two shapes.
 *
 * The whole risk here is degenerate input. A single NaN in a `points` or `y`
 * attribute blanks the entire SVG element silently, and a blank chart looks
 * exactly like a quiet game - the one reading it must never produce. Every
 * division below is guarded, and the tests assert on the absence of `NaN` in
 * the output rather than on the geometry.
 *
 * Escaping is this module's own responsibility: we return `raw()`, so we are
 * the last place an untrusted value can be escaped. The bet-mode names that
 * appear in bar titles come from the upstream API and are escaped here.
 */

import { raw, escape } from './html.mjs';

// Fixed palette, indexed by the mode's position in `modeNames()` - BASE first,
// the rest alphabetical. Hashing the name instead would reshuffle the legend
// against the table columns the moment a mode went quiet.
export const MODE_COLOURS = ['#4f9cff', '#ffb347', '#7ddf64', '#ff6b6b', '#c792ea', '#38d6c4', '#f4d35e', '#9aa5b1'];

export function colourFor(modes, mode) {
  const list = Array.isArray(modes) ? modes : [];
  const at = list.indexOf(mode);
  // An unknown mode takes the last colour rather than colour 0, which belongs
  // to BASE and would make the two indistinguishable.
  if (at === -1) return MODE_COLOURS[MODE_COLOURS.length - 1];
  return MODE_COLOURS[at % MODE_COLOURS.length];
}

const finite = (v) => v !== null && v !== undefined && Number.isFinite(Number(v));
const round = (n) => Math.round(Number(n) * 100) / 100;

export function sparkline(series, { width = 140, height = 30, pad = 2 } = {}) {
  // Coerce non-finite options to defaults so they don't propagate into SVG attributes.
  if (!Number.isFinite(width)) width = 140;
  if (!Number.isFinite(height)) height = 30;
  if (!Number.isFinite(pad)) pad = 2;

  const values = (Array.isArray(series) ? series : []).filter(finite).map(Number);
  if (!values.length) return raw('');

  // 0 is always in the domain: a signed series whose zero rule fell outside
  // the box would draw every loss as a smaller win.
  const lo = Math.min(0, ...values);
  const hi = Math.max(0, ...values);
  const span = hi - lo || 1;
  const inner = { w: Math.max(1, width - pad * 2), h: Math.max(1, height - pad * 2) };
  const x = (i) => round(values.length === 1 ? pad + inner.w / 2 : pad + (i * inner.w) / (values.length - 1));
  const y = (v) => round(pad + inner.h * (1 - (v - lo) / span));
  const zero = y(0);

  const body = values.length === 1
    ? `<circle cx="${x(0)}" cy="${y(values[0])}" r="2" class="spark-dot"/>`
    : `<polyline class="spark-line" fill="none" points="${values.map((v, i) => `${x(i)},${y(v)}`).join(' ')}"/>`;

  return raw(
    `<svg class="spark" role="img" viewBox="0 0 ${width} ${height}" width="${width}" height="${height}" preserveAspectRatio="none" data-zero="${zero}">` +
    `<title>recent trend</title>` +
    `<line class="zero" x1="0" y1="${zero}" x2="${width}" y2="${zero}"/>${body}</svg>`,
  );
}

/**
 * Grouped bars: one group per bucket, one bar per bet mode, plus the game
 * TOTAL as an outline so the reconciliation is visible rather than asserted.
 *
 * `rows` arrive newest-first from profitTable and are drawn oldest-left, which
 * is the direction a reader expects time to run.
 */
export function barChart(rows, modes, { width = 760, height = 200, pad = 24 } = {}) {
  // Coerce non-finite options to defaults so they don't propagate into SVG attributes.
  if (!Number.isFinite(width)) width = 760;
  if (!Number.isFinite(height)) height = 200;
  if (!Number.isFinite(pad)) pad = 24;

  const ordered = [...(Array.isArray(rows) ? rows : [])].reverse();
  const names = Array.isArray(modes) ? modes : [];

  const values = [];
  for (const r of ordered) {
    if (finite(r?.total)) values.push(Number(r.total));
    for (const mode of names) if (finite(r?.byMode?.[mode])) values.push(Number(r.byMode[mode]));
  }
  if (!values.length) return raw('');

  const lo = Math.min(0, ...values);
  const hi = Math.max(0, ...values);
  const span = hi - lo || 1;
  const inner = { w: Math.max(1, width - pad * 2), h: Math.max(1, height - pad * 2) };
  const y = (v) => round(pad + inner.h * (1 - (v - lo) / span));
  const zero = y(0);

  const groupW = inner.w / Math.max(1, ordered.length);
  // The TOTAL outline takes a slot of its own so it never hides a mode bar.
  const slots = Math.max(1, names.length + 1);
  const barW = Math.max(1, round((groupW * 0.8) / slots));

  const parts = [];
  ordered.forEach((r, g) => {
    const left = pad + g * groupW + groupW * 0.1;
    const measured = finite(r?.total) || names.some((m) => finite(r?.byMode?.[m]));
    if (!measured) {
      // No bar at all. A zero-height bar is a measured zero, and this bucket
      // was never measured; the tick says "we have nothing here" out loud.
      parts.push(`<rect class="tick-empty" x="${round(left)}" y="${round(zero - 1)}" width="${round(groupW * 0.8)}" height="2"/>`);
      return;
    }
    names.forEach((mode, i) => {
      const v = r?.byMode?.[mode];
      if (!finite(v)) return;
      const top = Math.min(y(Number(v)), zero);
      parts.push(
        `<rect class="bar" x="${round(left + i * barW)}" y="${round(top)}" width="${barW}" ` +
        `height="${round(Math.abs(zero - y(Number(v))))}" fill="${colourFor(names, mode)}"><title>${escape(mode)}</title></rect>`,
      );
    });
    if (finite(r?.total)) {
      const top = Math.min(y(Number(r.total)), zero);
      parts.push(
        `<rect class="bar bar-total" x="${round(left + names.length * barW)}" y="${round(top)}" width="${barW}" ` +
        `height="${round(Math.abs(zero - y(Number(r.total))))}" fill="none"><title>TOTAL</title></rect>`,
      );
    }
  });

  return raw(
    `<svg class="bars" role="img" viewBox="0 0 ${width} ${height}" preserveAspectRatio="none" data-zero="${zero}">` +
    `<title>profit per bucket, by bet mode</title>` +
    `<line class="zero" x1="${pad}" y1="${zero}" x2="${width - pad}" y2="${zero}"/>${parts.join('')}</svg>`,
  );
}
