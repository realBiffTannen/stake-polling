import { randomUUID } from 'node:crypto';

/**
 * One poller per team per Redis.
 *
 * Two pollers would both append to the same streams every minute, which would
 * double every delta the detector computes - the anomaly rules would then fire
 * on the duplication rather than on the traffic. The lock makes that
 * impossible rather than merely unlikely.
 *
 * It carries an owner token so a second process can never release, or refresh,
 * a lock it does not hold.
 */
export class Lock {
  constructor(client, key, ttlSeconds = 90) {
    this.client = client;
    this.key = key;
    this.ttl = ttlSeconds;
    this.token = randomUUID();
    this.held = false;
  }

  async acquire() {
    const res = await this.client.set(this.key, this.token, { condition: 'NX', expiration: { type: 'EX', value: this.ttl } });
    this.held = res === 'OK';
    return this.held;
  }

  /** Extend the lease. Returns false if we lost the lock (expired, or stolen). */
  async refresh() {
    const ok = await this.client.eval(
      `if redis.call('get', KEYS[1]) == ARGV[1] then return redis.call('expire', KEYS[1], ARGV[2]) else return 0 end`,
      { keys: [this.key], arguments: [this.token, String(this.ttl)] },
    );
    this.held = ok === 1;
    return this.held;
  }

  async release() {
    await this.client.eval(
      `if redis.call('get', KEYS[1]) == ARGV[1] then return redis.call('del', KEYS[1]) else return 0 end`,
      { keys: [this.key], arguments: [this.token] },
    );
    this.held = false;
  }

  /** Who holds it, for a diagnostic message when acquire fails. */
  async holder() {
    return this.client.get(this.key);
  }
}
