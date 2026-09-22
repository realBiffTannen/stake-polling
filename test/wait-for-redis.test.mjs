import { test } from 'node:test';
import assert from 'node:assert/strict';
import { waitForRedis } from '../src/store/wait-for-redis.mjs';

/** A probe that fails the first `failures` times, then succeeds. */
function flaky(failures) {
  let seen = 0;
  return { probe: async () => { if (seen++ < failures) throw new Error('ECONNREFUSED'); }, attempts: () => seen };
}

test('a reachable Redis is used immediately', async () => {
  const { probe, attempts } = flaky(0);
  assert.equal(await waitForRedis({ probe, retryMs: 1, timeoutMs: 1000 }), true);
  assert.equal(attempts(), 1);
});

test('it keeps trying while Redis is still starting', async () => {
  // At boot launchd wins the race against brew's redis every time. Exiting on
  // the first refused connection would turn that into a throttled crash loop.
  const { probe, attempts } = flaky(3);
  assert.equal(await waitForRedis({ probe, retryMs: 1, timeoutMs: 1000 }), true);
  assert.equal(attempts(), 4);
});

test('it gives up rather than waiting forever', async () => {
  const probe = async () => { throw new Error('ECONNREFUSED'); };
  assert.equal(await waitForRedis({ probe, retryMs: 1, timeoutMs: 25 }), false);
});

test('each attempt is reported, so the log says what it is waiting for', async () => {
  const seen = [];
  const { probe } = flaky(2);
  await waitForRedis({ probe, retryMs: 1, timeoutMs: 1000, onRetry: (err, n) => seen.push([n, err.message]) });
  assert.deepEqual(seen, [[1, 'ECONNREFUSED'], [2, 'ECONNREFUSED']]);
});

test('a shutdown signal stops the wait without throwing', async () => {
  const controller = new AbortController();
  const probe = async () => { controller.abort(); throw new Error('ECONNREFUSED'); };
  assert.equal(await waitForRedis({ probe, retryMs: 50000, timeoutMs: 60000, signal: controller.signal }), false);
});
