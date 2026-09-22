/**
 * Rendered pages, per URL and per data version.
 *
 * A page is a pure function of the tick's data and its URL, apart from the
 * few request-time values marked with fills (see fills.mjs), so an entry is
 * good for exactly as long as the data it was rendered from. Least recently
 * used entries are evicted past `max` - game and mode pages multiply by span -
 * and any entry older than `ttlMs` is a miss whatever its version.
 */

export function createPageCache({ max = 200, ttlMs = Infinity, now = Date.now } = {}) {
  const entries = new Map(); // key -> { version, value, at }

  return {
    get(key, version) {
      const hit = entries.get(key);
      if (!hit || version === null || version === undefined || hit.version !== version) return null;
      // A version that never changes - a collector whose polls all fail keeps
      // the same last_ok - must not pin a page forever: it also ages out.
      if (now() - hit.at >= ttlMs) { entries.delete(key); return null; }
      entries.delete(key);
      entries.set(key, hit); // most recently used last
      return hit.value;
    },
    set(key, version, value) {
      entries.delete(key);
      entries.set(key, { version, value, at: now() });
      while (entries.size > max) entries.delete(entries.keys().next().value);
    },
    clear() { entries.clear(); },
    get size() { return entries.size; },
    /** Path plus query, with parameters in a stable order. */
    keyOf(url) {
      const params = [...url.searchParams.entries()].sort(([a, x], [b, y]) => (a === b ? (x < y ? -1 : x > y ? 1 : 0) : a < b ? -1 : 1));
      return `${url.pathname}?${new URLSearchParams(params)}`;
    },
  };
}
