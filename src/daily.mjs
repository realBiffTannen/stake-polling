import { bucketSeries } from './buckets.mjs';
import { dayStart, coverage } from './window.mjs';

/**
 * Profit per accounting day.
 *
 * `window.mjs` answers "how much since the most recent boundary" - one figure,
 * for the day still being filled. This answers the same question for every day
 * the trail reaches: one row per day, each running from the boundary hour
 * (`dayBoundaryUtcHour`, 00:00 UTC in this deployment) to the same hour the
 * next day.
 *
 * It is `bucketSeries` with a one-day bucket offset to the boundary hour, so a
 * delta is attributed, a counter reset survived and an unmeasured day kept
 * null in exactly the way the 5m/1h bucket view already does it - and the row
 * for the day in progress agrees with the header's "day since" figure, which
 * attributes a delta to the sample it arrived on in the same way.
 *
 * Figures stay in raw API units, like everything else stored - display
 * converts.
 */

const DAY_MS = 86400000;
const DEFAULT_DAYS = 30;

/**
 * How far back the trail has to be read to draw `days` rows: one day further
 * than the oldest row, because that row's first delta needs the reading that
 * preceded it.
 */
export function dailyReadFrom(now, { boundaryHourUtc = 12, days = DEFAULT_DAYS } = {}) {
  return dayStart(now, boundaryHourUtc) - days * DAY_MS;
}

/**
 * @param {{ trails: Record<string, object[]>, games: string[], now: number, boundaryHourUtc?: number, days?: number, field?: string }} opts
 *   `games` fixes the column order; `trails[slug]` is that game's oldest-first trail.
 * @returns {{ games: string[], rows: { from: number, to: number, current: boolean, partial: boolean, total: number | null, byGame: Record<string, number | null> }[] }}
 */
export function dailyTable({ trails, games, now, boundaryHourUtc = 12, days = DEFAULT_DAYS, field = 'profit' }) {
  const today = dayStart(now, boundaryHourUtc);
  const span = { sizeMs: DAY_MS, offsetMs: boundaryHourUtc * 3600000, from: today - (days - 1) * DAY_MS, to: now };
  const names = games ?? [];
  const perGame = new Map(names.map((slug) => [slug, bucketSeries(trails?.[slug] ?? [], field, span)]));

  // Every series covers the same span, so row i is the same day in all of them.
  const rows = bucketSeries([], field, span).map((day, i) => {
    const byGame = {};
    let total = null;
    for (const slug of names) {
      const value = perGame.get(slug)[i]?.value ?? null;
      byGame[slug] = value;
      if (value !== null) total = (total ?? 0) + value;
    }
    return {
      from: day.from,
      to: day.to,
      current: day.from === today,
      partial: coverage(firstReadings(trails, names, day), day.from, Math.min(day.to, now)).partial,
      total,
      byGame,
    };
  });

  return { games: names, rows: dropUnreached(rows) };
}

/**
 * Each game's first reading inside the day - all `coverage()` needs to tell a
 * day the trail was already running for from one it started part-way through.
 * Handing it every sample instead would spread a month of them into Math.min.
 */
function firstReadings(trails, names, day) {
  return names
    .map((slug) => (trails?.[slug] ?? []).find((s) => Number(s.ts) >= day.from && Number(s.ts) < day.to))
    .filter(Boolean);
}

/**
 * Trim unmeasured days from both ends, never from the middle - the same rule,
 * for the same reason, as the bucket table: "we were not watching yet" is not
 * worth a row, "we were watching and missed a day" is.
 */
function dropUnreached(rows) {
  let start = 0;
  let end = rows.length;
  while (start < end && rows[start].total === null) start++;
  while (end > start && rows[end - 1].total === null) end--;
  return rows.slice(start, end);
}
