/**
 * The nightly archive: at 00:00:00Z, the UTC day that just ended - every
 * stream the poller wrote, as the poll log's long CSV - gzipped into one file
 * and handed to a store (S3, or a local directory; see stores.mjs).
 *
 * The file is exactly what /export/log.csv?source=all&date=<day> serves,
 * compressed: raw micro-dollars, gross profit, nothing derived. It is the
 * evidence, kept past the thirty days Redis holds it for.
 *
 * Catch-up: a machine asleep at midnight, or an upload that failed, leaves a
 * day missing. Every run looks back `catchUpDays` and archives any day the
 * store does not already hold, oldest first - so a missed night is filled the
 * next time the archiver runs, as long as Redis still holds that day.
 *
 * None of this runs in the poller. It is its own process (bin/stake-archive.mjs),
 * so a slow upload, a dead network or a misconfigured bucket can never delay
 * a poll tick.
 */

import { Readable } from 'node:stream';
import { pipeline } from 'node:stream/promises';
import { createGzip } from 'node:zlib';
import { longCsv, dayBounds } from '../store/export.mjs';
import { logSources } from '../store/log.mjs';

const DAY_MS = 86_400_000;

export const ARCHIVE_NAME = /^stake-all-(\d{4}-\d{2}-\d{2})\.csv\.gz$/;

export const archiveName = (date) => `stake-all-${date}.csv.gz`;

/** The UTC day a millisecond falls in, YYYY-MM-DD. */
export const utcDay = (ms) => new Date(ms).toISOString().slice(0, 10);

/** The next 00:00:00.000Z strictly after `now`. */
export function nextMidnight(now) {
  return (Math.floor(now / DAY_MS) + 1) * DAY_MS;
}

/**
 * The finished days the store is missing, oldest first: yesterday and the
 * `catchUpDays - 1` before it. Today is never one - it has not ended.
 */
export function pendingDays({ now, have, catchUpDays = 7 }) {
  const today = Math.floor(now / DAY_MS) * DAY_MS;
  const out = [];
  for (let i = catchUpDays; i >= 1; i--) {
    const date = utcDay(today - i * DAY_MS);
    if (!have.has(date)) out.push(date);
  }
  return out;
}

/**
 * One day of every stream, gzipped, or null when Redis holds nothing for it -
 * a day before the poller ran, or one already aged out. An empty file would
 * claim a day was archived when there was nothing to keep.
 *
 * @returns {Promise<{ name: string, date: string, body: Buffer, entries: number } | null>}
 */
export async function buildArchive(client, k, date) {
  const bounds = dayBounds(date);
  if (!bounds) throw new Error(`not a UTC day: ${JSON.stringify(date)}`);
  const sources = await logSources(client, k);
  // longCsv yields its header, then one chunk per stream entry.
  let entries = -1;
  const counted = (async function* () {
    for await (const chunk of longCsv(client, sources, bounds)) {
      entries++;
      yield chunk;
    }
  })();
  const parts = [];
  await pipeline(Readable.from(counted), createGzip(), async (gz) => {
    for await (const part of gz) parts.push(part);
  });
  return entries > 0 ? { name: archiveName(date), date, body: Buffer.concat(parts), entries } : null;
}

/**
 * Archive every pending day into `store`. One day failing does not stop the
 * rest; each outcome is returned, and the caller records them.
 *
 * @param {{ client: object, k: object, store: object, now: number, catchUpDays?: number, dates?: string[] }} opts
 *   `dates` archives exactly those days, held or not - a manual re-run.
 */
export async function archivePending({ client, k, store, now, catchUpDays = 7, dates = null }) {
  const todo = dates ?? pendingDays({ now, have: new Set((await store.list()).map((f) => f.date)), catchUpDays });
  const results = [];
  for (const date of todo) {
    try {
      const built = await buildArchive(client, k, date);
      if (!built) { results.push({ date, outcome: 'empty' }); continue; }
      await store.put(built.name, built.body);
      results.push({ date, outcome: 'stored', name: built.name, bytes: built.body.length, entries: built.entries });
    } catch (err) {
      results.push({ date, outcome: 'failed', error: String(err?.message ?? err) });
    }
  }
  return results;
}

/** The last run, as the archive page shows it. Never holds a credential. */
export function statusOf({ now, store, results, error = null }) {
  const stored = results.filter((r) => r.outcome === 'stored');
  const failed = results.filter((r) => r.outcome === 'failed');
  return {
    ranAt: now,
    destination: store?.where ?? null,
    stored: stored.map((r) => ({ date: r.date, name: r.name, bytes: r.bytes, entries: r.entries })),
    failed: failed.map((r) => ({ date: r.date, error: r.error })),
    error,
  };
}
