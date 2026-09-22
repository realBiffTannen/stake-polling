import { bucketSeries } from '../buckets.mjs';
import { parseModeField, MODE_FIELDS } from '../modes.mjs';
import { recordCatalogue, firstSeenFromSnapshot } from './catalogue.mjs';

/**
 * Per-mode daily totals, accumulated forward.
 *
 * The per-game endpoint takes no date range, so a mode's history cannot be
 * refetched for a past date - it exists only in the five-minute trail, which
 * is retained for thirty days. This rolls that trail up into days before it
 * ages out.
 *
 * Days are UTC calendar days, so they nest inside the calendar months the
 * dashboard reports. A day nobody sampled is ABSENT from the result rather
 * than present as zero: the poller being down is not a quiet day.
 *
 * **Attribution of deltas spanning a gap:** `bucketSeries` credits every delta
 * to the bucket of the LATER sample. When the poller is down, the next sample
 * after it comes back carries the entire accumulated delta, so the day of that
 * resumption sample includes the volume from the unmeasured outage gap.
 *
 * **Month rollover:** The API counters are month-to-date and reset to zero at
 * the month boundary (UTC midnight on the 1st). A delta spanning the reset
 * reads as a huge drop and is misclassified as a counter reset by `deltas()`,
 * which corrects it to just the post-reset total. This total lands entirely on
 * the 1st, which is correct only while the counter reset and the UTC day
 * boundary coincide.
 */

const DAY_MS = 86400000;

export function rollupModeDays({ modeTrail = [], from, to }) {
  const modes = new Set();
  for (const sample of modeTrail) {
    for (const key of Object.keys(sample?.fields ?? {})) {
      const parsed = parseModeField(key);
      if (parsed) modes.add(parsed.mode);
    }
  }
  const out = {};
  for (const mode of modes) {
    for (const field of MODE_FIELDS) {
      const series = bucketSeries(modeTrail, `${mode}:${field}`, { sizeMs: DAY_MS, from, to });
      for (const bucket of series) {
        if (bucket.value === null || bucket.value === undefined) continue;
        // bucketSeries returns { from, to, value } - `from` is the bucket's
        // start instant, and with sizeMs = one day that is the date itself.
        const date = new Date(bucket.from).toISOString().slice(0, 10);
        out[date] ??= {};
        out[date][mode] ??= {};
        out[date][mode][field] = bucket.value;
      }
    }
  }
  // A mode that produced only some of its three fields in a day is kept, with
  // the unmeasured fields left undefined - the reader's null discipline then
  // prints a dash rather than a zero it was never told.
  return out;
}

/** Later readings win for a day; earlier days are never dropped. */
export function mergeModeDays(previous = {}, next = {}) {
  const out = { ...previous };
  for (const [date, modes] of Object.entries(next)) out[date] = { ...(out[date] ?? {}), ...modes };
  return out;
}

/**
 * One pass over the trails, producing both forward-only stores.
 *
 * Only whole days are rolled up. Today is still filling, and a partial day
 * written now would be indistinguishable later from a quiet one.
 */
export function buildRollups({ previous = {}, trails = {}, listing = [], snapshot = {}, now }) {
  const today = new Date(now).toISOString().slice(0, 10);
  const startOfToday = Date.parse(`${today}T00:00:00Z`);
  // spanOf() (src/buckets.mjs) is INCLUSIVE of bucketStart(to), so passing
  // start-of-today as `to` would make today's own bucket the last one in the
  // span - a partial day masquerading as a whole one. Anchoring `to` on
  // start-of-YESTERDAY instead makes yesterday the last bucket spanOf emits,
  // so today's bucket is never enumerated - and so never persisted - no
  // matter how much of today the trail already carries.
  const to = startOfToday - DAY_MS;
  const from = to - 30 * DAY_MS;
  const games = { ...(previous.modes?.games ?? {}) };
  for (const [slug, modeTrail] of Object.entries(trails.modes ?? {})) {
    games[slug] = mergeModeDays(games[slug] ?? {}, rollupModeDays({ modeTrail, from, to }));
  }
  const seeded = { ...previous.catalogue, firstSeen: { ...firstSeenFromSnapshot(snapshot), ...(previous.catalogue?.firstSeen ?? {}) } };
  // The snapshot's first-activity date is the older evidence, so it wins over
  // a first-seen date recorded on the day this rollup started running.
  for (const [slug, date] of Object.entries(firstSeenFromSnapshot(snapshot))) {
    if (!seeded.firstSeen[slug] || date < seeded.firstSeen[slug]) seeded.firstSeen[slug] = date;
  }
  return {
    modes: { version: 1, games },
    catalogue: recordCatalogue({ previous: seeded, listing, date: today }),
  };
}
