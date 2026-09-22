/**
 * Wall-clock alignment.
 *
 * A fixed 60000ms interval drifts: each tick starts a little later than the
 * last because the work itself takes time, and after a few hours the samples
 * no longer line up with minute boundaries. Sleeping to the next boundary
 * instead keeps every sample on the minute, which is what makes per-minute
 * deltas comparable across games and across days.
 */

/**
 * Milliseconds until the next boundary of a `periodMinutes` grid.
 *
 * At five minutes the grid is :00, :05, :10 and so on - aligned to the hour,
 * not to whenever the process happened to start, so two runs of the poller
 * produce samples on the same timestamps and the trail stays comparable
 * across restarts. At 2.5 minutes it is :00:00, :02:30, :05:00 - any period
 * that divides the hour lands on the hour every hour.
 */
export function msToNextBoundary(now = Date.now(), periodMinutes = 1) {
  const period = periodMs(periodMinutes);
  const past = now % period;
  return past === 0 ? period : period - past;
}

/** The boundary a tick taken at `now` belongs to. */
export function boundaryFor(now, periodMinutes = 1) {
  const period = periodMs(periodMinutes);
  return Math.round(now / period) * period;
}

/**
 * The grid period in whole seconds, never under a minute. Fractional minutes
 * are kept: rounding them to whole minutes turned a 2.5-minute dial into a
 * three-minute poll.
 */
export function periodMs(periodMinutes = 1) {
  return Math.max(60, Math.round((Number(periodMinutes) || 1) * 60)) * 1000;
}

const EVERY_TICK = 1;

/** Which endpoints are due on a given tick. Not everything moves every minute. */
export class Cadence {
  /** @param {{ roster?: number, games?: number, gameStats?: number, graph?: number, lifetime?: number }} intervals */
  constructor(intervals = {}) {
    this.intervals = intervals;
  }

  due(tickIndex) {
    const isDue = (name) => tickIndex % (this.intervals[name] ?? EVERY_TICK) === 0;
    return {
      roster: isDue('roster'),
      games: isDue('games'),
      gameStats: isDue('gameStats'),
      graph: isDue('graph'),
      lifetime: isDue('lifetime'),
      balance: isDue('balance'),
      summary: isDue('summary'),
    };
  }
}

/** Sleep, resolving early if the signal aborts. */
export function sleep(ms, signal) {
  return new Promise((resolve) => {
    const timer = setTimeout(resolve, ms);
    signal?.addEventListener('abort', () => { clearTimeout(timer); resolve(); }, { once: true });
  });
}
