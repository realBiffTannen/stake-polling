import { createClient } from 'redis';

/**
 * Connect to Redis. No credentials by design - this expects a local instance
 * on a trusted machine, which is what the whole system is scoped to.
 *
 * @param {string} url
 * @param {{ database?: number }} [opts]
 */
export async function connect(url, opts = {}) {
  const client = createClient({ url, database: opts.database, socket: { reconnectStrategy: (n) => Math.min(n * 250, 5000) } });
  // Without a listener, a connection blip becomes an unhandled 'error' event
  // and takes the process down.
  client.on('error', (err) => opts.onError?.(err));
  await client.connect();
  await client.ping();
  return client;
}

/** Is AOF persistence on? A 30-day trail without it lives only until restart. */
export async function appendOnlyEnabled(client) {
  try {
    const cfg = await client.configGet('appendonly');
    return cfg?.appendonly === 'yes';
  } catch {
    return null; // CONFIG may be disabled; unknown is not the same as off.
  }
}
