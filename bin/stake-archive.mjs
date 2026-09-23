#!/usr/bin/env node
/**
 * The nightly archive, in its own process.
 *
 * At every 00:00:00Z it gzips the UTC day that just ended and stores it - to
 * S3_BUCKET when that is set, else to ./stake-polling-logrotate-data - then
 * sleeps until the next midnight. On start it catches up any of the last seven
 * days the store is missing (see src/archive/archive.mjs).
 *
 * Separate from the poller on purpose: an upload can take as long as it likes,
 * or fail, and the poller never waits on it or even knows. A failed run is
 * retried in 15 minutes; this process does not exit on one.
 *
 *   npm run archive                     run on the nightly schedule
 *   npm run archive -- --once           catch up now, then exit
 *   npm run archive -- --date 2026-09-22   (re)archive one day now, then exit
 */
import { loadConfig } from '../src/config.mjs';
import { connect } from '../src/store/redis.mjs';
import { keys } from '../src/store/keys.mjs';
import { Lock } from '../src/poll/lock.mjs';
import { dayBounds } from '../src/store/export.mjs';
import { archivePending, statusOf, nextMidnight } from '../src/archive/archive.mjs';
import { storeFor } from '../src/archive/stores.mjs';

const RETRY_MS = 15 * 60_000;
// Wake at least this often to compare the wall clock with the next run. One
// long timer runs on the monotonic clock, which stops while a Mac sleeps, so
// it would fire hours late after a night asleep.
const CHECK_MS = 60_000;
// Longer than any run should take: a run holds the lock throughout so a
// second archiver (an orphan, a manual --once) never uploads the same day twice.
const LOCK_TTL_S = 30 * 60;

const config = loadConfig();
const k = keys(config.team);
const log = (...parts) => console.log(`[${new Date().toISOString().slice(11, 19)}] archive:`, ...parts);

const argv = process.argv.slice(2);
const at = argv.indexOf('--date');
const date = at === -1 ? null : argv[at + 1] ?? '';
if (date !== null && !dayBounds(date)) { console.error('--date takes a UTC day, YYYY-MM-DD.'); process.exit(1); }
const once = argv.includes('--once') || date !== null;

let timer = null;
let due = null;
let client = null;
let stopping = false;
async function shutdown(code = 0) {
  stopping = true;
  clearTimeout(timer);
  await client?.quit().catch(() => {});
  // Exit explicitly: an idle SDK socket or Redis handle must not keep this
  // process alive after its parent asked it to stop.
  process.exit(code);
}
process.on('SIGINT', () => shutdown(0));
process.on('SIGTERM', () => shutdown(0));

client = await connect(config.redisUrl, { onError: (err) => log('redis:', err?.message ?? err) });
let store;
try {
  store = await storeFor(config);
} catch (err) {
  console.error(`archive: cannot set up the store: ${err?.message ?? err}`);
  await shutdown(1);
}
log(`storing to ${store.where}`);

/** One run: every pending day (or `--date`'s), under the lock. True when nothing failed. */
async function run() {
  const now = Date.now();
  const lock = new Lock(client, k.lockArchive, LOCK_TTL_S);
  if (!(await lock.acquire())) { log(`another archiver holds ${k.lockArchive}; skipping this run`); return true; }
  let results = [];
  let error = null;
  try {
    results = await archivePending({ client, k, store, now, catchUpDays: config.archive.catchUpDays, dates: date ? [date] : null });
  } catch (err) {
    error = String(err?.message ?? err);
  } finally {
    await lock.release().catch(() => {});
  }
  for (const r of results) {
    if (r.outcome === 'stored') log(`${r.date}: stored ${r.name} (${r.bytes} bytes, ${r.entries} entries)`);
    else if (r.outcome === 'failed') log(`${r.date}: FAILED - ${r.error}`);
  }
  // One line, not one per day: a fresh install has a week of them every run.
  const empty = results.filter((r) => r.outcome === 'empty').map((r) => r.date);
  if (empty.length) log(`nothing in Redis for ${empty.join(', ')}; skipped`);
  if (error) log(`run FAILED - ${error}`);
  if (!results.length && !error) log('nothing pending');
  await client.set(k.archiveStatus, JSON.stringify(statusOf({ now, store, results, error }))).catch(() => {});
  return !error && !results.some((r) => r.outcome === 'failed');
}

async function loop() {
  if (stopping) return;
  // Not due yet - including a wall clock stepped back (NTP) before midnight,
  // when the day has not ended and must not be archived early.
  if (due !== null && Date.now() < due) { timer = setTimeout(loop, Math.min(due - Date.now(), CHECK_MS)); return; }
  const ok = await run().catch((err) => { log(`run FAILED - ${err?.message ?? err}`); return false; });
  if (stopping) return;
  const now = Date.now();
  // Recomputed every time rather than a fixed 24h interval, so the schedule
  // never drifts off midnight.
  due = ok ? nextMidnight(now) : Math.min(nextMidnight(now), now + RETRY_MS);
  log(`next run ${new Date(due).toISOString()}`);
  timer = setTimeout(loop, Math.min(due - now, CHECK_MS));
}

if (once) await shutdown((await run()) ? 0 : 1);
else loop();
