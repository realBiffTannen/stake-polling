/**
 * One copy of the dashboard's data per poll tick.
 *
 * The collector writes once every poll period, so every request inside that
 * period reads the same Redis state. Loading it once and sharing it saves the
 * reads, and concurrent requests wait on the same load rather than each
 * starting their own.
 *
 * Invalidated two ways: by the poller's tick announcement (the web server
 * subscribes to it), and by a TTL of one poll period. The TTL is the safety
 * net - if the announcement is missed, or the collector has died, the next
 * request still reads Redis afresh, and a dead collector shows as stale.
 * A failed load is never cached.
 */

export function createDataCache({ load, ttlMs, now = Date.now, versionOf = () => null }) {
  let entry = null;      // { data, at }
  let inFlight = null;

  const fresh = () => entry !== null && now() - entry.at < ttlMs;

  return {
    async get() {
      if (fresh()) return entry.data;
      if (inFlight) return inFlight;
      inFlight = (async () => {
        const data = await load();
        entry = { data, at: now() };
        return data;
      })().finally(() => { inFlight = null; });
      return inFlight;
    },
    invalidate() { entry = null; },
    /** The fresh entry's version, or null when there is nothing fresh to serve from. */
    version() { return fresh() ? versionOf(entry.data) : null; },
  };
}
