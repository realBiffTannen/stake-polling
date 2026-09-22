/**
 * Wait for Redis to come up, rather than exiting when it has not yet.
 *
 * Started by hand, Redis is always already running and a missing server means
 * a mistake worth reporting at once. Started by launchd at login, the opposite
 * is true: this process routinely wins the race against brew's redis, and
 * exiting immediately turns a two-second ordering gap into a throttled crash
 * loop that reads as "the poller is broken".
 */

import { createClient } from 'redis';

/**
 * @param {{
 *   probe: () => Promise<unknown>,
 *   retryMs?: number,
 *   timeoutMs?: number,
 *   signal?: AbortSignal,
 *   onRetry?: (err: Error, attempt: number) => void,
 * }} opts
 * @returns {Promise<boolean>} true once a probe succeeded, false on timeout or abort
 */
export async function waitForRedis({ probe, retryMs = 2000, timeoutMs = 120000, signal, onRetry }) {
  const deadline = Date.now() + timeoutMs;
  for (let attempt = 1; ; attempt++) {
    if (signal?.aborted) return false;
    try {
      await probe();
      return true;
    } catch (err) {
      if (signal?.aborted) return false;
      onRetry?.(err instanceof Error ? err : new Error(String(err)), attempt);
      if (Date.now() + retryMs > deadline) return false;
      await sleep(retryMs, signal);
    }
  }
}

/** A single connect-ping-quit against a real server. The default probe. */
export function redisProbe(url, { connectTimeout = 5000 } = {}) {
  return async () => {
    const client = createClient({ url, socket: { connectTimeout, reconnectStrategy: () => false } });
    client.on('error', () => {});
    try {
      await client.connect();
      await client.ping();
    } finally {
      await client.quit().catch(() => {});
    }
  };
}

function sleep(ms, signal) {
  return new Promise((resolve) => {
    let timer;
    const done = () => { clearTimeout(timer); signal?.removeEventListener('abort', done); resolve(); };
    timer = setTimeout(done, ms);
    signal?.addEventListener('abort', done, { once: true });
  });
}
