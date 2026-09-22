import { deltas } from './detect/baseline.mjs';
import { parseModeField, modeOrder } from './modes.mjs';

/**
 * Fixed wall-clock buckets.
 *
 * `window.mjs` answers "how much since the accounting boundary". This answers
 * "how much in each hour" and "how much in each five minutes", which is the
 * shape you need to see when a game turned, not just that it did.
 *
 * Buckets are aligned to the epoch, so a five-minute bucket always starts on
 * :00 :05 :10 and an hour bucket always starts on the hour. Aligning to the
 * first sample instead would move every boundary each time the poller
 * restarted, and two runs of the same day would disagree about what 14:40 was.
 *
 * Figures stay in raw API units, like everything else stored - display
 * converts.
 */

export const BUCKET_SIZES = { '5m': 5 * 60000, '15m': 15 * 60000, '30m': 30 * 60000, '1h': 60 * 60000 };

// What one press of `h` steps through. Finest first: the reason to open this
// view at all is usually that something just moved.
const BUCKET_CYCLE = [null, '5m', '1h'];

/** The next granularity, wrapping back to off. */
export function nextBucket(current) {
  const at = BUCKET_CYCLE.indexOf(current ?? null);
  // An unrecognised value steps into the view rather than out of it: falling
  // through to "off" would leave the key looking dead.
  if (at === -1) return BUCKET_CYCLE[1];
  return BUCKET_CYCLE[(at + 1) % BUCKET_CYCLE.length];
}

// A guard, not a feature: a caller that asks for five-minute buckets across a
// month would otherwise build a quarter of a million rows for a 24-line screen.
const MAX_BUCKETS = 2000;

/**
 * The start of the wall-clock bucket `ts` falls in.
 *
 * `offsetMs` shifts every boundary off the epoch by a fixed amount. It exists
 * for the accounting day, which rolls at a configured UTC hour: a one-day
 * bucket offset by that many hours is exactly that day. The offset is 0 while
 * the day rolls at midnight UTC, and was twelve hours when it rolled at noon.
 */
export function bucketStart(ts, sizeMs, offsetMs = 0) {
  return Math.floor((Number(ts) - offsetMs) / sizeMs) * sizeMs + offsetMs;
}

/**
 * Per-bucket sums of one cumulative field's deltas, newest bucket first.
 *
 * Every bucket in the span is emitted, including the ones nothing landed in.
 * Those carry `value: null` rather than 0: a poller that was down did not
 * measure a quiet five minutes, and "$0.00" is a claim it did. Skipping the
 * row entirely would be worse still - the gap would close up and the table
 * would read as an unbroken run of measurements.
 *
 * Samples from before `from` are still used: the first in-window delta needs
 * the reading that preceded it.
 *
 * A sample missing the field is not treated as a zero reading. It drops out of
 * the series, and the next delta simply spans the gap and is attributed to the
 * bucket it arrived in - the same way a missed poll is handled. This is what
 * lets a bet mode that only appears part-way through the trail report its
 * first real change instead of a fabricated jump up from zero.
 *
 * @param {{ ts: number, fields: Record<string, unknown> }[]} samples oldest-first
 * @param {string} field
 * @param {{ sizeMs: number, from: number, to: number, offsetMs?: number }} span
 * @returns {{ from: number, to: number, value: number | null }[]}
 */
export function bucketSeries(samples, field, { sizeMs, from, to, offsetMs = 0 }) {
  const totals = new Map();

  const present = (Array.isArray(samples) ? samples : []).filter((s) =>
    Number.isFinite(Number(s?.fields?.[field])) && s.fields[field] !== '');

  const steps = deltas(present.map((s) => Number(s.fields[field])));
  for (let i = 0; i < steps.length; i++) {
    // steps[i] is the change that arrived at present[i + 1], and it covers the
    // interval that ENDED there. `ts - 1` puts a step arriving exactly on a
    // boundary (a grid-stamped sample at 01:00:00.000) in the bucket that just
    // closed, 00:00-01:00; an off-grid arrival (01:00:01.8) still lands in the
    // bucket it arrived in. The window check below uses the same start.
    const start = bucketStart(Number(present[i + 1].ts) - 1, sizeMs, offsetMs);
    if (start < bucketStart(from, sizeMs, offsetMs) || start > bucketStart(to, sizeMs, offsetMs)) continue;
    totals.set(start, (totals.get(start) ?? 0) + steps[i]);
  }

  return spanOf(from, to, sizeMs, offsetMs).map((start) => ({
    from: start,
    to: start + sizeMs,
    value: totals.has(start) ? totals.get(start) : null,
  }));
}

/**
 * One game's profit per bucket, beside each of its bet modes.
 *
 * `total` comes from the GAME trail (the roster endpoint) and the mode columns
 * come from the per-game endpoint. They are two different responses, so they
 * are kept as two different numbers: `modeTotal` is what the modes add up to,
 * and a table that shows both makes a disagreement visible instead of hiding
 * it behind whichever one got picked.
 *
 * `trimUnreached` drops the empty buckets at each END of the span: the ones
 * older than the trail reaches, and the in-progress one the poller has not
 * written to yet. A hole the trail SURROUNDS is never dropped - "we were not
 * watching yet" and "we were watching and missed it" are different facts, and
 * only the second one is a symptom.
 *
 * @param {{ trail: object[], modeTrail: object[], sizeMs: number, from: number, to: number, field?: string, trimUnreached?: boolean }} opts
 */
export function profitTable({ trail, modeTrail, sizeMs, from, to, field = 'profit', trimUnreached = false }) {
  const modes = modeNames(modeTrail, field);
  const totals = bucketSeries(trail, field, { sizeMs, from, to });
  const perMode = new Map(
    modes.map((mode) => [mode, bucketSeries(modeTrail, `${mode}:${field}`, { sizeMs, from, to })]),
  );

  const rows = totals.map((bucket, i) => {
    const byMode = {};
    let modeTotal = null;
    for (const mode of modes) {
      const value = perMode.get(mode)[i]?.value ?? null;
      byMode[mode] = value;
      if (value !== null) modeTotal = (modeTotal ?? 0) + value;
    }
    return { from: bucket.from, to: bucket.to, total: bucket.value, byMode, modeTotal };
  });

  return { modes, rows: trimUnreached ? dropUnreached(rows) : rows };
}

/**
 * Trim empty rows from both ends, never from the middle.
 *
 * Rows are newest-first, so the head is the bucket still being filled and the
 * tail is whatever predates the trail. A dead row at the top of every frame is
 * noise, and the header already reports a poller that has stopped.
 */
function dropUnreached(rows) {
  const empty = (r) => r.total === null && r.modeTotal === null;
  let start = 0;
  let end = rows.length;
  while (start < end && empty(rows[start])) start++;
  while (end > start && empty(rows[end - 1])) end--;
  return rows.slice(start, end);
}

/**
 * Every mode the trail has ever carried a reading for, BASE first and the rest
 * alphabetical.
 *
 * Fixed order matters: a column set derived from "whatever the newest sample
 * happened to contain" reshuffles the table the moment a mode goes quiet, and
 * a reader comparing two frames would be comparing two different columns.
 */
export function modeNames(modeTrail, field = 'profit') {
  const seen = new Set();
  for (const sample of Array.isArray(modeTrail) ? modeTrail : []) {
    for (const key of Object.keys(sample?.fields ?? {})) {
      const parsed = parseModeField(key);
      if (parsed?.field === field) seen.add(parsed.mode);
    }
  }
  return modeOrder([...seen]);
}

/** Bucket starts from newest to oldest, inclusive of both ends. */
function spanOf(from, to, sizeMs, offsetMs = 0) {
  const first = bucketStart(from, sizeMs, offsetMs);
  const last = bucketStart(to, sizeMs, offsetMs);
  const out = [];
  for (let start = last; start >= first && out.length < MAX_BUCKETS; start -= sizeMs) out.push(start);
  return out;
}
