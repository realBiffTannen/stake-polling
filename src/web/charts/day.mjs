/**
 * One UTC day on a fixed clock: 00:00 to 24:00, whatever time it is now.
 *
 * The x axis is the whole day, not the part of it that has happened, so the
 * line stopping short of the right edge IS the reading "the day is a sixth
 * gone". The hours still to come are shaded. A ghost series - yesterday, laid
 * on today's clock - runs the full width behind, dashed, as the reference
 * the day is heading against.
 *
 * With `polarity`, the area under the first solid series is filled green
 * above zero and red below, split by two clip paths at the zero line, so a
 * loss reads as a loss by position first and colour second.
 *
 * An unmeasured point (value null) breaks the path. The hover layer is one
 * band per quarter hour: each names its time and every series' value at the
 * end of it, and a series with nothing there yet says '-', never zero.
 */

import { html, raw } from '../html.mjs';
import { linearScale, niceAxis, labelGutter, valid } from './scale.mjs';

const HOUR_MS = 3_600_000;
const DAY_MS = 86_400_000;
const hm = (ts) => new Date(ts).toISOString().slice(11, 16);
const f1 = (n) => Number(n).toFixed(1);
const GHOST = '#6b778a';

/** Points to runs of `x,y` pairs, split wherever a value is missing. */
function runsOf(points, xs, ys) {
  const runs = [];
  let run = [];
  for (const p of points) {
    if (valid(p.value)) run.push([xs(p.ts), ys(Number(p.value))]);
    else if (run.length) { runs.push(run); run = []; }
  }
  if (run.length) runs.push(run);
  return runs;
}

const pathOf = (run) => (run.length === 1 ? `M${f1(run[0][0])},${f1(run[0][1])} l0.1,0` : `M${run.map(([x, y]) => `${f1(x)},${f1(y)}`).join(' L')}`);

/** The series' latest reading before `end`, or null once the series has ended or where it is broken. */
function readingAt(points, start, end) {
  if (!points.length || start > points.at(-1).ts) return null;
  let found = null;
  for (const p of points) {
    if (p.ts >= end) break;
    found = p;
  }
  return found && valid(found.value) ? { ts: found.ts, value: Number(found.value) } : null;
}

/**
 * @param {{ id: string, from: number, now: number,
 *   series: { name: string, colour: string, points: { ts: number, value: number|null }[], ghost?: boolean, area?: boolean }[],
 *   format?: (v: number) => string, title?: string, polarity?: boolean, width?: number, height?: number }} opts
 *   `id` must be unique on the page: the clip paths are named after it.
 */
export function dayCurve({ id, from, now, series = [], format = String, title = '', polarity = false, width = 900, height = 280, bandMinutes = 15 }) {
  const to = from + DAY_MS;
  const values = series.flatMap((s) => s.points.map((p) => p.value)).filter(valid).map(Number);
  const empty = !values.length;
  const lo = Math.min(0, ...values), hi = Math.max(0, ...values);
  const axis = niceAxis(lo, hi === lo ? lo + 1 : hi, 4);
  const legend = series.length > 1;
  const pad = { left: labelGutter(axis.ticks.map(format), 56), right: 18, top: legend ? 30 : 14, bottom: 30 };
  const plotW = width - pad.left - pad.right, plotH = height - pad.top - pad.bottom;
  const xs = linearScale({ domain: [from, to], range: [pad.left, pad.left + plotW] });
  const ys = linearScale({ domain: axis.domain, range: [pad.top + plotH, pad.top] });
  const zero = ys(0);
  const nowX = xs(Math.min(Math.max(now, from), to));

  const hours = Array.from({ length: 9 }, (_, i) => i * 3);
  const main = series.find((s) => !s.ghost) ?? null;

  const lines = series.map((s) => {
    const runs = runsOf(s.points, xs, ys);
    const fills = s.area && !s.ghost ? runs.filter((r) => r.length > 1).map((r) => `${pathOf(r)} L${f1(r.at(-1)[0])},${f1(zero)} L${f1(r[0][0])},${f1(zero)} Z`) : [];
    const area = fills.map((d) => (polarity
      ? html`<path class="area-gain" d="${raw(d)}" clip-path="url(#${id}-above)"/><path class="area-loss" d="${raw(d)}" clip-path="url(#${id}-below)"/>`
      : html`<path class="area" d="${raw(d)}" fill="${s.colour}" fill-opacity="0.14"/>`));
    const stroke = s.ghost ? GHOST : s.colour;
    return html`${area}${runs.map((r) => (s.ghost
      ? html`<path class="series ghost" fill="none" stroke="${stroke}" stroke-width="1.5" stroke-dasharray="5 4" d="${raw(pathOf(r))}"/>`
      : html`<path class="series" fill="none" stroke="${stroke}" stroke-width="2" d="${raw(pathOf(r))}"/>`))}`;
  });

  // The newest reading of the main series, marked and labelled directly.
  const last = main ? [...main.points].reverse().find((p) => valid(p.value)) : null;
  const mark = last ? (() => {
    const x = xs(last.ts), y = ys(Number(last.value));
    const right = x < pad.left + plotW - 90;
    return html`<circle class="now-dot" cx="${f1(x)}" cy="${f1(y)}" r="4.5" fill="${main.colour}"/>
      <text class="now-value" x="${f1(right ? x + 9 : x - 9)}" y="${f1(Math.max(pad.top + 10, y - 9))}" text-anchor="${right ? 'start' : 'end'}">${format(Number(last.value))}</text>`;
  })() : null;

  const bandMs = bandMinutes * 60_000;
  const bandW = xs(from + bandMs) - xs(from);
  const bands = [];
  for (let start = from; start < to; start += bandMs) {
    const end = start + bandMs;
    const readings = series.map((s) => ({ s, r: readingAt(s.points, start, end) }));
    const tip = JSON.stringify({ label: `${hm(start)}-${end >= to ? '24:00' : hm(end)}Z`,
      rows: readings.map(({ s, r }) => ({ name: String(s.name), value: r === null ? '-' : String(format(r.value)), colour: s.ghost ? GHOST : s.colour })) });
    const cross = readings.find(({ r }) => r !== null)?.r;
    bands.push(html`<g class="hit" data-tip="${tip}"><rect x="${f1(xs(start))}" y="${pad.top}" width="${f1(bandW)}" height="${plotH}" fill="transparent"/>
      ${cross ? html`<line class="crosshair" x1="${f1(xs(cross.ts))}" x2="${f1(xs(cross.ts))}" y1="${pad.top}" y2="${pad.top + plotH}"/>` : null}
      ${readings.map(({ s, r }) => (r === null ? null : html`<circle class="focus-dot" cx="${f1(xs(r.ts))}" cy="${f1(ys(r.value))}" r="3.5" fill="${s.ghost ? GHOST : s.colour}"/>`))}</g>`);
  }

  let lx = pad.left;
  const key = legend ? html`<g class="legend">${series.map((s) => {
    const x = lx;
    lx += 34 + String(s.name).length * 6.5;
    return html`<line x1="${x}" x2="${x + 16}" y1="10" y2="10" stroke="${s.ghost ? GHOST : s.colour}" stroke-width="2"${s.ghost ? raw(' stroke-dasharray="4 3"') : null}/>
      <text class="axis-label" x="${x + 22}" y="14">${s.name}</text>`;
  })}</g>` : null;

  return html`<svg class="chart day-curve" viewBox="0 0 ${width} ${height}" role="img" aria-label="${title}"><title>${title}</title>
    ${polarity ? html`<defs><clipPath id="${id}-above"><rect x="${pad.left}" y="${pad.top}" width="${plotW}" height="${f1(Math.max(0, zero - pad.top))}"/></clipPath>
      <clipPath id="${id}-below"><rect x="${pad.left}" y="${f1(zero)}" width="${plotW}" height="${f1(Math.max(0, pad.top + plotH - zero))}"/></clipPath></defs>` : null}
    ${now < to ? html`<rect class="future-zone" x="${f1(nowX)}" y="${pad.top}" width="${f1(pad.left + plotW - nowX)}" height="${plotH}"/>` : null}
    ${axis.ticks.map((t) => html`<g><line class="gridline" x1="${pad.left}" x2="${pad.left + plotW}" y1="${f1(ys(t))}" y2="${f1(ys(t))}"/>
      <text class="axis-label" x="${pad.left - 8}" y="${f1(ys(t) + 4)}" text-anchor="end">${format(t)}</text></g>`)}
    ${hours.map((h) => html`<text class="axis-label" x="${f1(xs(from + h * HOUR_MS))}" y="${height - 10}" text-anchor="${h === 0 ? 'start' : h === 24 ? 'end' : 'middle'}">${String(h).padStart(2, '0')}:00</text>`)}
    ${axis.domain[0] < 0 && axis.domain[1] > 0 ? html`<line class="zero-line" x1="${pad.left}" x2="${pad.left + plotW}" y1="${f1(zero)}" y2="${f1(zero)}"/>` : null}
    ${now > from && now < to ? html`<line class="now-line" x1="${f1(nowX)}" x2="${f1(nowX)}" y1="${pad.top}" y2="${pad.top + plotH}"/>` : null}
    ${lines}
    ${mark}
    ${empty ? html`<text class="axis-label empty-note" x="${pad.left + plotW / 2}" y="${pad.top + plotH / 2}" text-anchor="middle">Nothing measured yet today</text>` : null}
    ${key}
    ${bands}
  </svg>`;
}
