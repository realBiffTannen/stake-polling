import { html } from '../html.mjs';
import { linearScale, niceAxis, labelGutter, valid } from './scale.mjs';

/**
 * Points, with a least-squares line when there are enough of them.
 *
 * Two points always fit a line perfectly, which would dress an accident up as
 * a relationship, so the fit needs three.
 */
export function scatterChart({ points = [], xLabel = '', yLabel = '', fit = false,
  width = 620, height = 320, title = '' } = {}) {
  const usable = points.filter(p => valid(p.x) && valid(p.y));
  const xsVals = usable.map(p => Number(p.x)), ysVals = usable.map(p => Number(p.y));
  const xAxis = niceAxis(Math.min(...xsVals, 0), Math.max(...xsVals, 1), 4);
  const yAxis = niceAxis(Math.min(...ysVals, 0), Math.max(...ysVals, 1), 4);
  const xd = xAxis.domain, yd = yAxis.domain;
  const tickText = (t) => Math.round(t * 100) / 100;
  // The rotated y title sits in the gutter's outer 20px, left of the tick labels.
  const pad = { left: labelGutter(yAxis.ticks.map(tickText), 58, 20), right: 20, top: 18, bottom: 42 };
  const plotW = width - pad.left - pad.right, plotH = height - pad.top - pad.bottom;
  const xs = linearScale({ domain: xd, range: [pad.left, pad.left + plotW] });
  const ys = linearScale({ domain: yd, range: [pad.top + plotH, pad.top] });
  let line = null;
  if (fit && usable.length >= 3) {
    const n = usable.length;
    const mx = xsVals.reduce((a, b) => a + b, 0) / n, my = ysVals.reduce((a, b) => a + b, 0) / n;
    let sxy = 0, sxx = 0;
    usable.forEach((p, i) => { sxy += (xsVals[i] - mx) * (ysVals[i] - my); sxx += (xsVals[i] - mx) ** 2; });
    if (sxx > 0) {
      const slope = sxy / sxx, intercept = my - slope * mx;
      line = { x1: xs(xd[0]), y1: ys(slope * xd[0] + intercept), x2: xs(xd[1]), y2: ys(slope * xd[1] + intercept) };
    }
  }
  return html`<svg class="chart" viewBox="0 0 ${width} ${height}" role="img" aria-label="${title}">
    ${yAxis.ticks.map(t => html`<g><line class="gridline" x1="${pad.left}" x2="${pad.left + plotW}" y1="${ys(t)}" y2="${ys(t)}"/>
      <text class="axis-label" x="${pad.left - 8}" y="${ys(t) + 4}" text-anchor="end">${tickText(t)}</text></g>`)}
    ${xAxis.ticks.map(t => html`<text class="axis-label" x="${xs(t)}" y="${height - 20}" text-anchor="middle">${tickText(t)}</text>`)}
    ${line ? html`<line class="fit" x1="${line.x1}" y1="${line.y1}" x2="${line.x2}" y2="${line.y2}" stroke="#a69aff" stroke-width="1.5" stroke-dasharray="4 3"/>` : null}
    ${usable.map(p => html`<g class="hit" data-tip="${JSON.stringify({ label: String(p.label ?? ''), rows: [
        { name: String(xLabel), value: String(p.x) }, { name: String(yLabel), value: String(Math.round(Number(p.y) * 1000) / 1000) }] })}">
      <circle cx="${xs(p.x)}" cy="${ys(p.y)}" r="12" fill="transparent"/>
      <circle class="dot" cx="${xs(p.x)}" cy="${ys(p.y)}" r="5" fill="#86e1c4" fill-opacity="0.85"/></g>`)}
    <text class="axis-label" x="${pad.left + plotW / 2}" y="${height - 4}" text-anchor="middle">${xLabel}</text>
    <text class="axis-label" x="14" y="${pad.top + plotH / 2}" text-anchor="middle" transform="rotate(-90 14 ${pad.top + plotH / 2})">${yLabel}</text>
  </svg>`;
}
