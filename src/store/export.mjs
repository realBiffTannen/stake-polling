/**
 * Raw CSV exports of the poll log - every entry exactly as stored.
 *
 * Nothing is converted: money stays in raw micro-dollars and a trail's
 * `profit` stays the GROSS house win. An export is the evidence, not a
 * report, so it carries what Redis holds and nothing the dashboard derived.
 *
 * A day is the UTC calendar day: [00:00:00.000Z, next 00:00:00.000Z). Trail
 * samples are stamped on their grid slot, so the 00:00 sample belongs to the
 * day it opens, and the next midnight's to the next.
 */

const DAY_MS = 86_400_000;
const NUMERIC = /^-?\d+(\.\d+)?(e[+-]?\d+)?$/i;

/**
 * One CSV cell. A number - negative included - passes through untouched;
 * any other text that a spreadsheet would read as a formula gets a leading
 * apostrophe, and a separator or quote forces quoting.
 */
export function csvCell(value) {
  if (value === null || value === undefined) return '';
  let s = String(value);
  if (!NUMERIC.test(s) && /^[=+\-@\t\r]/.test(s)) s = `'${s}`;
  return /[",\r\n]/.test(s) ? `"${s.replaceAll('"', '""')}"` : s;
}

/** A YYYY-MM-DD UTC day as `{ from, to }` milliseconds, or null for anything else. */
export function dayBounds(date) {
  if (typeof date !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(date)) return null;
  const from = Date.parse(`${date}T00:00:00Z`);
  if (!Number.isFinite(from) || new Date(from).toISOString().slice(0, 10) !== date) return null;
  return { from, to: from + DAY_MS };
}

const line = (cells) => `${cells.map(csvCell).join(',')}\r\n`;
const idMs = (id) => Number(String(id).split('-')[0]);

/**
 * Every entry of one stream inside the bounds (or all of it), oldest first,
 * fetched in batches. The end bound is `to - 1` as an incomplete ID, which
 * Redis reads as that millisecond's LAST sequence - so everything before `to`
 * and nothing at it. (`(to` would exclude only `to-0`'s upper sequence range.)
 */
async function* entries(client, key, bounds, batch) {
  let start = bounds ? String(bounds.from) : '-';
  const end = bounds ? String(bounds.to - 1) : '+';
  for (;;) {
    const rows = await client.xRange(key, start, end, { COUNT: batch });
    for (const row of rows ?? []) yield row;
    if (!rows || rows.length < batch) return;
    start = `(${rows.at(-1).id}`;
  }
}

/**
 * One stream, one row per entry: `time_utc, entry_id`, then a column for
 * every field that appears, in the order first seen. Held in memory to learn
 * the columns first - one stream is at most a few thousand entries a day.
 */
export async function* wideCsv(client, source, bounds, { batch = 2000 } = {}) {
  const rows = [];
  const columns = [];
  const seen = new Set();
  for await (const row of entries(client, source.key, bounds, batch)) {
    rows.push(row);
    for (const field of Object.keys(row.message ?? {})) if (!seen.has(field)) { seen.add(field); columns.push(field); }
  }
  yield line(['time_utc', 'entry_id', ...columns]);
  for (const row of rows) {
    yield line([new Date(idMs(row.id)).toISOString(), row.id, ...columns.map((c) => row.message?.[c] ?? null)]);
  }
}

/**
 * Every stream, one row per data point: `time_utc, entry_id, stream, field,
 * value`. Streamed batch by batch, so a whole day of every stream never sits
 * in memory at once.
 */
export async function* longCsv(client, sources, bounds, { batch = 2000 } = {}) {
  yield line(['time_utc', 'entry_id', 'stream', 'field', 'value']);
  for (const source of sources) {
    for await (const row of entries(client, source.key, bounds, batch)) {
      const time = new Date(idMs(row.id)).toISOString();
      let chunk = '';
      for (const [field, value] of Object.entries(row.message ?? {})) chunk += line([time, row.id, source.id, field, value]);
      if (chunk) yield chunk;
    }
  }
}
