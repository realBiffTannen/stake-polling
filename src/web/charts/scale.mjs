/**
 * The arithmetic every chart shares.
 *
 * Kept apart from the drawing so that the awkward cases - a flat series, a
 * single point, a domain of nulls - are tested once rather than in each chart.
 */

export function linearScale({ domain: [d0, d1], range: [r0, r1] }) {
  const span = d1 - d0;
  if (!Number.isFinite(span) || span === 0) return () => (r0 + r1) / 2;
  return (v) => r0 + ((Number(v) - d0) / span) * (r1 - r0);
}

export function niceTicks(min, max, count = 5) {
  if (!Number.isFinite(min) || !Number.isFinite(max)) return [];
  if (min === max) return [min];
  const raw = (max - min) / Math.max(1, count);
  const mag = 10 ** Math.floor(Math.log10(raw));
  const step = [1, 2, 2.5, 5, 10].map(m => m * mag).find(s => s >= raw) ?? mag * 10;
  const out = [];
  for (let t = Math.floor(min / step) * step; t <= max + step / 2; t += step) out.push(Number(t.toFixed(10)));
  return out;
}

/**
 * The value axis a chart actually draws: round ticks, and a domain widened to
 * reach them. Scaling to the data's own extent while drawing niceTicks put the
 * outer ticks past the plot - a losing month's -$10,000 gridline landed below
 * the plot floor, printed over the date labels.
 */
export function niceAxis(min, max, count = 4) {
  const ticks = niceTicks(min, max, count);
  if (!ticks.length) return { ticks, domain: [min, max] };
  return { ticks, domain: [Math.min(min, ticks[0]), Math.max(max, ticks.at(-1))] };
}

// Axis labels are 10px text (.chart .axis-label). This is a wide character's
// width, so a gutter errs roomy rather than clipping.
const LABEL_CHAR_PX = 6.5;

/**
 * How wide a gutter a column of axis labels needs: the widest label, the 8px
 * gap to the plot, and a little air - never less than `min`. A fixed gutter
 * clipped "-$10,000.00" to "10,000.00", which reads as a gain.
 */
export function labelGutter(labels, min, extra = 0) {
  const widest = Math.max(0, ...labels.map((l) => String(l).length));
  return Math.max(min, Math.ceil(widest * LABEL_CHAR_PX) + 12 + extra);
}

export const valid = (v) => v !== null && v !== undefined && v !== '' && Number.isFinite(Number(v));

/** The domain of several series at once, ignoring the points nobody measured. */
export function extent(valuesList) {
  const all = valuesList.flat().filter(valid).map(Number);
  if (!all.length) return [0, 1];
  const min = Math.min(0, ...all), max = Math.max(...all);
  return min === max ? [min, min + 1] : [min, max];
}
