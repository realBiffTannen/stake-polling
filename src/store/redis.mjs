import { createClient } from 'redis';

/**
 * Options every Redis client in the system is created from.
 *
 * No credentials by default - a local instance on a trusted machine is what
 * the system is scoped to. An authenticated server takes REDIS_USERNAME and
 * REDIS_PASSWORD from the environment, or user:password in the URL
 * (redis://user:password@host:6379, rediss:// for TLS). node-redis lets
 * credentials in the URL override explicit ones; the environment is the more
 * deliberate setting, so here it wins and the URL's are dropped.
 *
 * Read from the environment here, not carried on the config object, for the
 * reason the sid is not: a config that ends up in a log must not carry them.
 *
 * @param {string} url
 * @param {NodeJS.ProcessEnv} [env]
 */
export function redisOptions(url, env = process.env) {
  const username = env.REDIS_USERNAME || undefined;
  const password = env.REDIS_PASSWORD || undefined;
  if (!username && !password) return { url };
  const bare = new URL(url);
  bare.username = '';
  bare.password = '';
  return { url: bare.toString(), ...(username && { username }), ...(password && { password }) };
}

/** The URL fit to print: any password in it masked. */
export function redactUrl(url) {
  let parsed;
  try { parsed = new URL(url); } catch { return String(url); }
  if (!parsed.password) return String(url);
  parsed.password = '***';
  return parsed.toString();
}

/**
 * Connect to Redis, with credentials only if redisOptions() finds some.
 *
 * @param {string} url
 * @param {{ database?: number, env?: NodeJS.ProcessEnv, onError?: (err: unknown) => void }} [opts]
 */
export async function connect(url, opts = {}) {
  const client = createClient({ ...redisOptions(url, opts.env), database: opts.database, socket: { reconnectStrategy: (n) => Math.min(n * 250, 5000) } });
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
