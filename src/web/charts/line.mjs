import { html, raw } from '../html.mjs';
import { linearScale, niceAxis, labelGutter, extent, valid } from './scale.mjs';

/**
 * A multi-series line chart, optionally with a second axis on the right.
 *
 * A point nobody measured BREAKS the path. Drawing straight through a gap
 * would render an outage as a smooth trend, which is the one thing a trend
 * chart must never do.
 */
export function lineChart({ series = [], labels = [], width = 900, height = 280,
  format = (v) => String(Math.round(v * 100) / 100), title = '', tipLabels = labels } = {}) {
  // A series and its labels can come from different sources (dates from one
  // rollup, values from another) and disagree in length. A value beyond the
  // labels array has no x position to plot at, so it is dropped rather than
  // extrapolated off the canvas; a series shorter than its labels simply has
  // no more points to draw. Trimming here also keeps those dropped values out
  // of the y-domain, so an off-canvas point can't stretch the visible scale.
  const trimmed = (s) => s.values.slice(0, labels.length);
  const left = series.filter(s => (s.axis ?? 'left') === 'left');
  const right = series.filter(s => s.axis === 'right');
  const axes = { left: niceAxis(...extent(left.map(trimmed)), 4), right: niceAxis(...extent(right.map(trimmed)), 4) };
  const ticks = { left: axes.left.ticks, right: right.length ? axes.right.ticks : [] };
  const pad = { left: labelGutter(ticks.left.map(format), 56), right: right.length ? labelGutter(ticks.right.map(format), 56) : 28, top: 18, bottom: 34 };
  const plotW = width - pad.left - pad.right, plotH = height - pad.top - pad.bottom;
  const xs = linearScale({ domain: [0, Math.max(1, labels.length - 1)], range: [pad.left, pad.left + plotW] });
  const ys = {
    left: linearScale({ domain: axes.left.domain, range: [pad.top + plotH, pad.top] }),
    right: linearScale({ domain: axes.right.domain, range: [pad.top + plotH, pad.top] }),
  };
  const every = Math.max(1, Math.ceil(labels.length / 10));
  // A series that crosses zero gets a zero line the eye can rest on: the
  // gridlines are all alike, and "which side of nothing" is the one question
  // a P/L chart has to answer at a glance. An axis that starts or ends at zero
  // already has it as an edge, so none is drawn.
  const zero = axes.left.domain[0] < 0 && axes.left.domain[1] > 0 ? ys.left(0) : null;

  const paths = series.map((s) => {
    const scale = ys[s.axis === 'right' ? 'right' : 'left'];
    const segments = [];
    let run = [];
    trimmed(s).forEach((v, i) => {
      if (valid(v)) run.push(`${xs(i).toFixed(1)},${scale(v).toFixed(1)}`);
      else { if (run.length) segments.push(run); run = []; }
    });
    if (run.length) segments.push(run);
    return html`${segments.map(seg => html`<path class="series" fill="none" stroke="${s.colour}" stroke-width="2"
      d="${raw(seg.length === 1 ? `M${seg[0]} L${seg[0]}` : `M${seg.join(' L')}`)}"/>`)}`;
  });

  // The hover layer: one band per label, tiling the plot edge to edge at the
  // point spacing, so the pointer only has to find a date and never a 2px
  // line. Each band carries the values that drew its points as data - the
  // browser shows them, it never reads a number back off the geometry - and
  // an unmeasured point says '-' there for the same reason it breaks the path.
  const bandW = plotW / Math.max(1, labels.length - 1);
  const hits = labels.map((label, i) => {
    const tip = JSON.stringify({ label: String(tipLabels[i] ?? label),
      rows: series.map(s => ({ name: String(s.name), value: valid(s.values[i]) ? format(Number(s.values[i])) : '-', colour: s.colour })) });
    return html`<g class="hit" data-tip="${tip}"><rect class="hit-band" x="${xs(i) - bandW / 2}" y="${pad.top}" width="${bandW}" height="${plotH}" fill="transparent"/>
      <line class="crosshair" x1="${xs(i)}" x2="${xs(i)}" y1="${pad.top}" y2="${pad.top + plotH}"/>
      ${series.map(s => valid(s.values[i]) ? html`<circle class="focus-dot" cx="${xs(i)}" cy="${ys[s.axis === 'right' ? 'right' : 'left'](s.values[i])}" r="4" fill="${s.colour}"/>` : null)}</g>`;
  });

  return html`<svg class="chart" viewBox="0 0 ${width} ${height}" role="img" aria-label="${title}">
    ${ticks.left.map(t => html`<g><line class="gridline" x1="${pad.left}" x2="${pad.left + plotW}" y1="${ys.left(t)}" y2="${ys.left(t)}"/>
      <text class="axis-label" x="${pad.left - 8}" y="${ys.left(t) + 4}" text-anchor="end">${format(t)}</text></g>`)}
    ${ticks.right.map(t => html`<text class="axis-label" x="${pad.left + plotW + 8}" y="${ys.right(t) + 4}" text-anchor="start">${format(t)}</text>`)}
    ${zero === null ? null : html`<line class="zero-line" x1="${pad.left}" x2="${pad.left + plotW}" y1="${zero.toFixed(1)}" y2="${zero.toFixed(1)}"/>`}
    ${labels.map((label, i) => i % every === 0 || i === labels.length - 1
      ? html`<text class="axis-label" x="${xs(i)}" y="${height - 10}" text-anchor="middle">${label}</text>` : null)}
    ${paths}
    ${series.map((s, i) => html`<g><rect x="${pad.left + i * 170}" y="2" width="10" height="10" rx="2" fill="${s.colour}"/>
      <text class="axis-label" x="${pad.left + 16 + i * 170}" y="11">${s.name}</text></g>`)}
    ${hits}
  </svg>`;
}
