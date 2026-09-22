/**
 * The poll log: every entry the poller has written, one page at a time.
 *
 * Read-only, and strictly streams. The meta hash is never a source - it is the
 * one key that has ever held anything sid-adjacent, and a log that listed
 * "every key" would publish it.
 *
 * Paging is by cursor, not by page number, because a Redis stream cannot seek
 * to an offset: page 400 of a numbered log would cost reading the 399 before
 * it, on every refresh, and the trail grows for thirty days. A cursor is an
 * O(log N) range read however deep it sits.
 *
 * The cursor is composite, `<stream id>~<source index>`. Every trail stream
 * gets the same stream id on a tick, so an id alone cannot say where inside a
 * tick a page ended - a page boundary landing mid-tick would silently drop or
 * repeat the rest of that tick's streams.
 */

const CURSOR = /^(\d+)-(\d+)~(\d+)$/;
const MAX_COUNT = 1000;

/**
 * Every stream the poller writes, in a fixed display order: the team and
 * online trails, then each game followed by its per-mode trail, then alerts
 * and summaries.
 *
 * Discovered by SCAN rather than built from the roster, so a game that has
 * left the roster still shows the trail it wrote while it was on it.
 *
 * @returns {Promise<{ id: string, key: string }[]>}
 */
export async function logSources(client, k) {
  const found = new Set();
  for await (const batch of client.scanIterator({ MATCH: `${k.ns}:ts:*`, TYPE: 'stream', COUNT: 200 })) {
    for (const key of Array.isArray(batch) ? batch : [batch]) found.add(String(key));
  }
  const prefix = `${k.ns}:`;
  const trails = [...found].map((key) => ({ id: key.slice(prefix.length), key })).sort((a, b) => compareRank(rank(a.id), rank(b.id)));

  const tail = [];
  for (const [id, key] of [['alerts', k.alerts], ['summary', k.summary]]) {
    if ((await client.type(key)) === 'stream') tail.push({ id, key });
  }
  return [...trails, ...tail];
}

function rank(id) {
  if (id === 'ts:team') return [0, '', 0];
  if (id === 'ts:online') return [1, '', 0];
  const modes = id.endsWith(':modes');
  return [2, id.slice(3, modes ? -6 : undefined), modes ? 1 : 0];
}

function compareRank(a, b) {
  return a[0] - b[0] || (a[1] < b[1] ? -1 : a[1] > b[1] ? 1 : 0) || a[2] - b[2];
}

/**
 * One page of the log, newest first.
 *
 * Order is (stream id descending, source index ascending). `before` pages
 * towards older entries, `after` towards newer ones, `oldest` jumps to the
 * far end; with none of them this is the newest page. A cursor that does not
 * parse is treated as absent rather than passed to Redis.
 *
 * @param {{ id: string, key: string }[]} sources
 * @param {{ before?: string|null, after?: string|null, oldest?: boolean, count?: number }} opts
 * @returns {Promise<{ entries: { id: string, ts: number, source: string, fields: Record<string, string> }[], newer: string|null, older: string|null, total: number }>}
 */
export async function readLog(client, sources, { before = null, after = null, oldest = false, count = 100 } = {}) {
  const n = Math.min(MAX_COUNT, Math.max(1, Math.floor(Number(count)) || 100));
  const list = Array.isArray(sources) ? sources : [];
  const total = (await Promise.all(list.map((s) => client.xLen(s.key)))).reduce((a, b) => a + Number(b || 0), 0);

  const olderCursor = parseCursor(before);
  const newerCursor = olderCursor ? null : parseCursor(after);

  if (newerCursor || oldest) {
    // Read ascending from the cursor (or from the very start), keep the n
    // entries nearest it, and turn them round for display.
    const rows = await Promise.all(list.map((s, idx) => {
      if (oldest) return client.xRange(s.key, '-', '+', { COUNT: n + 1 });
      const start = idx < newerCursor.idx ? newerCursor.id : `(${newerCursor.id}`;
      return client.xRange(s.key, start, '+', { COUNT: n + 1 });
    }));
    const merged = tag(rows, list).sort((a, b) => -compareEntries(a, b));
    const page = merged.slice(0, n).reverse();
    const more = merged.length > n;
    return {
      entries: page.map(present),
      newer: more && page.length ? cursorOf(page[0]) : null,
      // Something older always exists past an `after` cursor: the cursor's own entry.
      older: !oldest && page.length ? cursorOf(page.at(-1)) : null,
      total,
    };
  }

  const rows = await Promise.all(list.map((s, idx) => {
    if (!olderCursor) return client.xRevRange(s.key, '+', '-', { COUNT: n + 1 });
    const end = idx > olderCursor.idx ? olderCursor.id : `(${olderCursor.id}`;
    return client.xRevRange(s.key, end, '-', { COUNT: n + 1 });
  }));
  const merged = tag(rows, list).sort(compareEntries);
  const page = merged.slice(0, n);
  return {
    entries: page.map(present),
    // Past a `before` cursor the cursor's own entry is always newer.
    newer: olderCursor && page.length ? cursorOf(page[0]) : null,
    older: merged.length > n ? cursorOf(page.at(-1)) : null,
    total,
  };
}

function parseCursor(value) {
  const m = CURSOR.exec(String(value ?? ''));
  return m ? { id: `${m[1]}-${m[2]}`, idx: Number(m[3]) } : null;
}

function tag(rows, sources) {
  return rows.flatMap((entries, idx) => (entries ?? []).map((e) => ({ id: String(e.id), idx, source: sources[idx].id, fields: e.message ?? {} })));
}

/** Newest first; within one stream id, sources in their listed order. */
function compareEntries(a, b) {
  return compareId(b.id, a.id) || a.idx - b.idx;
}

/** Stream ids compared as numbers - as strings, '999-0' sorts after '1000-0'. */
function compareId(a, b) {
  const [am, as] = a.split('-').map(Number);
  const [bm, bs] = b.split('-').map(Number);
  return am - bm || as - bs;
}

function cursorOf(entry) {
  return `${entry.id}~${entry.idx}`;
}

function present(entry) {
  return { id: entry.id, ts: Number(entry.id.split('-')[0]), source: entry.source, fields: { ...entry.fields } };
}
