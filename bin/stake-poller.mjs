#!/usr/bin/env node
import { loadConfig } from '../src/config.mjs';
import { connect, appendOnlyEnabled } from '../src/store/redis.mjs';
import { writeMeta } from '../src/store/writer.mjs';
import { keys } from '../src/store/keys.mjs';
import { ApiClient } from '../src/api/client.mjs';
import { Poller } from '../src/poll/poller.mjs';
import { Lock } from '../src/poll/lock.mjs';
import { waitForLock } from '../src/poll/wait-for-lock.mjs';
import { AlertGate } from '../src/detect/alerts.mjs';
import { msToNextBoundary, boundaryFor, sleep } from '../src/poll/schedule.mjs';
import { resolveSid, readSidFile, fingerprint } from '../src/sid/index.mjs';
import { readChromeSid } from '../src/sid/chrome-cookies.mjs';
import { toUsd, toShareUsd, formatUsdSigned } from '../src/money.mjs';

const CHROME_RETRY_MS = 10 * 60 * 1000;
// The lease must outlive a tick comfortably, or a slow poll looks like a dead
// poller to the next process that tries to start.
const LOCK_TTL_MULTIPLE = 3;

const config = loadConfig();
const k = keys(config.team);
const stopping = new AbortController();

const log = (...parts) => console.log(`[${new Date().toISOString().slice(11, 19)}]`, ...parts);

// Register signal handlers immediately to make the wait interruptible.
// They only reference stopping (created above) and shutdown (defined below),
// and call lock.release() and client.quit() with .catch() if not yet initialised.
for (const signal of ['SIGINT', 'SIGTERM']) {
  process.on(signal, () => {
    log('shutting down');
    shutdown(0);
  });
}

const client = await connect(config.redisUrl, { onError: (err) => log('redis:', err?.message ?? err) });
const lock = new Lock(client, k.lock, Math.max(90, config.pollMinutes * 60 * LOCK_TTL_MULTIPLE));

const waitForHolder = process.argv.includes('--wait-for-lock');
if (!(await lock.acquire())) {
  if (!waitForHolder) {
    console.error(`another poller already holds ${k.lock} (pid ${await lock.holder()}). Only one may run per team.`);
    await client.quit();
    process.exit(1);
  }
  log(`another poller holds ${k.lock} (${await lock.holder()}); following until its lease expires`);
  const got = await waitForLock(lock, { retryMs: 30000, signal: stopping.signal,
    onWait: (holder) => log(`still following ${holder ?? 'the current holder'}`) });
  if (!got) { await client.quit(); process.exit(0); }
  log('took the poller lock');
}

const aof = await appendOnlyEnabled(client);
if (aof === false) {
  log('warning: redis AOF persistence is off - the 30-day trail will not survive a restart.');
  log('         run `npm run enable-persistence` to turn it on.');
}
await writeMeta(client, k, { persistence: aof === null ? 'unknown' : aof ? 'aof' : 'off', started_at: String(Date.now()) });

// --- credential ----------------------------------------------------------

const api = new ApiClient({ apiUrl: config.apiUrl, team: config.team, sid: '', timeoutMs: config.timeoutMs });

/** A sid is only accepted once the live API has answered a real request with it. */
async function validate(sid) {
  api.setSid(sid);
  const res = await api.teamGames();
  if (res.ok) return true;
  if (res.error.code === 'AUTH') return false;
  // A network problem says nothing about the credential - do not discard a
  // possibly-good sid because the wifi dropped.
  log(`could not validate the sid (${res.error.code}); keeping it and retrying`);
  return true;
}

const resolved = await resolveSid({ env: process.env, file: config.sidFile, validate });
if (!resolved.sid) {
  console.error('no usable sid. Set STAKE_SID, write one to .sid, or run this in a terminal to be prompted.');
  await shutdown(1);
}

api.setSid(resolved.sid);
log(`sid accepted from ${resolved.source} (${fingerprint(resolved.sid)})`);

const poller = new Poller({ api, client, keys: k, config, gate: new AlertGate(config.detect), sid: resolved.sid });
poller.sidSource = resolved.source;

// --- loop ----------------------------------------------------------------

let tickIndex = 0;
let paused = false;
let lastChromeAttempt = 0;
let lastSidFileValue = await readSidFile(config.sidFile);

log(`polling ${config.apiUrl}/teams/${config.team} into ${config.redisUrl} every ${config.pollMinutes} minute${config.pollMinutes === 1 ? '' : 's'}, aligned to the clock`);

while (!stopping.signal.aborted) {
  await sleep(msToNextBoundary(Date.now(), config.pollMinutes), stopping.signal);
  if (stopping.signal.aborted) break;

  const now = Date.now();
  const boundary = boundaryFor(now, config.pollMinutes);

  if (!(await lock.refresh())) {
    console.error('lost the poller lock - another instance has taken over. Exiting.');
    await shutdown(1);
  }

  if (paused) {
    if (await tryRecoverSid()) {
      paused = false;
      log('a working sid was recovered - polling resumes');
      await writeMeta(client, k, { auth_state: 'ok' });
    } else {
      tickIndex++;
      continue;
    }
  }

  try {
    const result = await poller.tick(boundary, tickIndex++);
    if (result.authExpired) {
      paused = true;
      log('the sid was rejected - polling is paused');
      if (!(await tryRecoverSid())) {
        log('put a fresh sid in .sid (or restart in a terminal to be prompted); polling resumes automatically');
      } else {
        paused = false;
      }
    } else {
      log(`tick ${tickIndex} ${describe(result.deltas)}`);
      for (const alert of result.alerts) log(`  ${alert.severity.toUpperCase()} ${alert.message}`);
    }
    if (result.failures.length) log(`  ${result.failures.length} endpoint failure(s): ${result.failures.at(-1).message}`);
  } catch (err) {
    log('tick failed:', err?.message ?? err);
  }
}

/**
 * Try to get polling going again without human help: first a changed .sid
 * file, then Chrome (at most once every ten minutes - it can trigger a
 * Keychain prompt and there is no point asking every sixty seconds).
 */
async function tryRecoverSid() {
  const fromFile = await readSidFile(config.sidFile);
  if (fromFile && fromFile !== lastSidFileValue) {
    lastSidFileValue = fromFile;
    if (await validate(fromFile)) {
      poller.setSid(fromFile, 'file');
      return true;
    }
  }

  if (Date.now() - lastChromeAttempt < CHROME_RETRY_MS) return false;
  lastChromeAttempt = Date.now();

  const fromChrome = await readChromeSid({});
  if (fromChrome && (await validate(fromChrome))) {
    poller.setSid(fromChrome, 'chrome');
    return true;
  }
  return false;
}

/**
 * What this minute changed, across the roster. Null on the first tick - there
 * is nothing to difference against yet, and printing zeroes would claim a
 * quiet minute that was never measured.
 */
function describe(deltas) {
  if (!deltas) return 'first sample, no delta yet';
  const bets = Math.round(deltas.count);
  return [
    `bets ${bets > 0 ? `+${bets.toLocaleString('en-US')}` : bets.toLocaleString('en-US')}`,
    `turnover ${formatUsdSigned(toUsd(deltas.turnover, config.money))}`,
    `profit ${formatUsdSigned(toShareUsd(deltas.profit, config.money.profitShare, config.money))}`,
    `(${config.rateWords})`,
  ].join(' | ');
}

async function shutdown(code = 0) {
  stopping.abort();
  await lock.release().catch(() => {});
  await client.quit().catch(() => {});
  process.exit(code);
}
