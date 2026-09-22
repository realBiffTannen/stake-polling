import { deltas } from './detect/baseline.mjs';

/**
 * The accounting day.
 *
 * The day rolls at a configured UTC hour - `dayBoundaryUtcHour`, which this
 * deployment sets to 0, so "today's profit" means "since the most recent
 * 00:00 UTC". The hour is a parameter rather than a constant because it has
 * been moved before (it ran at 12:00 UTC until 2026-09-20) and the argument
 * default here is still 12 for the callers that pass nothing.
 */

/** Epoch ms of the most recent boundary at or before `now`. */
export function dayStart(now, boundaryHourUtc = 12) {
  const d = new Date(now);
  const boundary = Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate(), boundaryHourUtc, 0, 0, 0);
  return boundary <= now ? boundary : boundary - 86400000;
}

/** Whole minutes elapsed since the boundary - how much trail the window needs. */
export function minutesSince(now, boundaryHourUtc = 12) {
  return Math.ceil((now - dayStart(now, boundaryHourUtc)) / 60000);
}

/**
 * Sum one metric's per-minute deltas over the window.
 *
 * Built from deltas rather than from (last - first) so that a month rollover
 * inside the window contributes that minute's real volume instead of a large
 * negative step.
 *
 * A step counts only when the sample it arrives at is STRICTLY after `from`.
 * Samples are stamped with their grid boundary, and the change a sample
 * reports is the change over the interval that ENDED there - so the step
 * arriving at exactly 00:00:00.000 is the last 2.5 minutes of yesterday, and
 * the 00:00 sample is today's baseline, not today's first delta.
 *
 * A sample missing the field (absent, null, '' or non-numeric) drops out of
 * the series, the way bucketSeries treats it: read as a 0 it would look like
 * a counter reset, and deltas() would book the whole next reading as volume.
 * A genuine 0 reading is kept.
 *
 * Returns null when the trail holds nothing inside the window - a figure of 0
 * would claim a measured quiet period rather than an absence of measurement.
 */
export function sumSince(samples, field, from) {
  if (!Array.isArray(samples)) return null;
  const present = samples.filter((s) => measured(s?.fields?.[field]));
  if (present.length < 2) return null;

  const steps = deltas(present.map((s) => Number(s.fields[field])));

  let total = 0;
  let counted = 0;
  // steps[i] is the change arriving at present[i + 1].
  for (let i = 0; i < steps.length; i++) {
    if (!(Number(present[i + 1]?.ts) > from)) continue;
    total += steps[i];
    counted++;
  }
  return counted ? total : null;
}

function measured(v) {
  return v !== null && v !== undefined && v !== '' && Number.isFinite(Number(v));
}

/**
 * How much of the window the trail actually covers.
 *
 * A poller started ten minutes ago cannot report a twelve-hour day, and a
 * partial figure presented as a whole one is worse than no figure. Callers
 * label anything below full coverage.
 */
export function coverage(samples, from, now) {
  const span = Math.max(1, now - from);
  if (!Array.isArray(samples) || !samples.length) return { ratio: 0, fromTs: null, partial: true };

  const inWindow = samples.filter((s) => Number(s.ts) >= from);
  if (!inWindow.length) return { ratio: 0, fromTs: null, partial: true };

  const earliest = Math.min(...inWindow.map((s) => Number(s.ts)));
  const ratio = Math.min(1, (now - earliest) / span);
  return { ratio, fromTs: earliest, partial: ratio < 0.98 };
}
