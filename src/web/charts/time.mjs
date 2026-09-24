/**
 * A dense time series - one point per poll slot - as a single line.
 *
 * lineChart gives every label its own hover band, which is right for thirty
 * days and far too heavy for 576 slots. Here the line is one path (broken
 * wherever a slot was not measured) and the hover layer is capped at
 * `maxHits` bands, each reporting the peak inside it, so a day of slots costs
 * a few kilobytes rather than a hundred.
 */

import { html, raw } from '../html.mjs';
import { linearScale, niceAxis, labelGutter, valid } from './scale.mjs';

const hm = (ts) => `${new Date(ts).toISOString().slice(11, 16)}Z`;
const md = (ts) => new Date(ts).toISOString().slice(5, 10);

export function timeLine({ points = [], title = '', format = String, colour = '#2fa88f', width = 900, height = 240, maxHits = 96 } = {}) {
  const got = points.filter((p) => valid(p.value));
  if (!got.length) {
    return html`<svg class="chart" viewBox="0 0 ${width} 60" role="img" aria-label="${title}"><title>${title}</title>
      <text class="axis-label" x="${width / 2}" y="34" text-anchor="middle">Nothing measured in this range</text></svg>`;
  }
  const hi = Math.max(1, ...got.map((p) => Number(p.value)));
  const axis = niceAxis(0, hi, 4);
  const pad = { left: labelGutter(axis.ticks.map(format), 52), right: 16, top: 14, bottom: 30 };
  const plotW = width - pad.left - pad.right, plotH = height - pad.top - pad.bottom;
  const t0 = points[0].ts, t1 = points.at(-1).ts;
  const xs = linearScale({ domain: [t0, t1 === t0 ? t0 + 1 : t1], range: [pad.left, pad.left + plotW] });
  const ys = linearScale({ domain: axis.domain, range: [pad.top + plotH, pad.top] });

  const runs = [];
  let run = [];
  for (const p of points) {
    if (valid(p.value)) run.push(`${xs(p.ts).toFixed(1)},${ys(Number(p.value)).toFixed(1)}`);
    else if (run.length) { runs.push(run); run = []; }
  }
  if (run.length) runs.push(run);

  // Axis labels on round clock times, spaced to about eight across: every
  // ten minutes for an hour or less, up to every two days for a week. In
  // minutes, so a step is an exact number of milliseconds.
  const spanMin = (t1 - t0) / 60_000;
  const stepMin = [10, 15, 30, 60, 120, 180, 360, 720, 1440, 2880].find((m) => spanMin / m <= 8) ?? 2880;
  const stepMs = stepMin * 60_000;
  const ticks = [];
  for (let t = Math.ceil(t0 / stepMs) * stepMs; t <= t1; t += stepMs) ticks.push(t);

  const per = Math.max(1, Math.ceil(points.length / maxHits));
  const bands = [];
  for (let i = 0; i < points.length; i += per) {
    const slice = points.slice(i, i + per);
    const inBand = slice.filter((p) => valid(p.value));
    const peak = inBand.length ? inBand.reduce((a, b) => (Number(b.value) > Number(a.value) ? b : a)) : null;
    const x0 = xs(slice[0].ts), x1 = xs(slice.at(-1).ts);
    bands.push({ x0, w: Math.max(2, x1 - x0 + plotW / points.length), peak, from: slice[0].ts, to: slice.at(-1).ts });
  }

  return html`<svg class="chart" viewBox="0 0 ${width} ${height}" role="img" aria-label="${title}"><title>${title}</title>
    ${axis.ticks.map((t) => html`<g><line class="gridline" x1="${pad.left}" x2="${pad.left + plotW}" y1="${ys(t)}" y2="${ys(t)}"/>
      <text class="axis-label" x="${pad.left - 8}" y="${ys(t) + 4}" text-anchor="end">${format(t)}</text></g>`)}
    ${ticks.map((t) => html`<text class="axis-label" x="${xs(t)}" y="${height - 10}" text-anchor="middle">${stepMin >= 1440 ? md(t) : hm(t)}</text>`)}
    ${runs.map((r) => html`<path class="series" fill="none" stroke="${colour}" stroke-width="2" d="${raw(r.length === 1 ? `M${r[0]} L${r[0]}` : `M${r.join(' L')}`)}"/>`)}
    ${bands.map((b) => {
      const tip = JSON.stringify({ label: per === 1 ? hm(b.from) : `${hm(b.from)} - ${hm(b.to)}`,
        rows: [{ name: per === 1 ? title : `${title} (peak)`, value: b.peak ? String(format(Number(b.peak.value))) : '-', colour }] });
      return html`<g class="hit" data-tip="${tip}"><rect x="${b.x0}" y="${pad.top}" width="${b.w}" height="${plotH}" fill="transparent"/>
        ${b.peak ? html`<circle class="focus-dot" cx="${xs(b.peak.ts)}" cy="${ys(Number(b.peak.value))}" r="4" fill="${colour}"/>` : null}</g>`;
    })}
  </svg>`;
}
