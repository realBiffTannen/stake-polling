import { test, beforeEach, after } from 'node:test';
import assert from 'node:assert/strict';
import { msToNextBoundary, boundaryFor, periodMs, Cadence } from '../src/poll/schedule.mjs';
import { Lock } from '../src/poll/lock.mjs';
import { connect } from '../src/store/redis.mjs';
import { keys } from '../src/store/keys.mjs';

test('msToNextBoundary lands exactly on the next minute', () => {
  assert.equal(msToNextBoundary(Date.parse('2026-09-15T21:52:04.250Z'), 1), 55750);
  assert.equal(msToNextBoundary(Date.parse('2026-09-15T21:52:59.999Z'), 1), 1);
});

test('a time already on the boundary waits a whole period rather than firing twice', () => {
  assert.equal(msToNextBoundary(Date.parse('2026-09-15T21:52:00.000Z'), 1), 60000);
  assert.equal(msToNextBoundary(Date.parse('2026-09-15T21:55:00.000Z'), 5), 5 * 60000);
});

test('a five-minute period aligns to :00 :05 :10, not to when the process started', () => {
  // 21:52:04 -> 21:55:00 is 2m56s away, whatever time the poller booted.
  assert.equal(msToNextBoundary(Date.parse('2026-09-15T21:52:04.000Z'), 5), 176000);
  assert.equal(msToNextBoundary(Date.parse('2026-09-15T21:58:30.000Z'), 5), 90000);
  assert.equal(msToNextBoundary(Date.parse('2026-09-15T21:00:01.000Z'), 5), 299000);
});

test('a 2.5-minute period lands on :00:00 :02:30 :05:00, not rounded to three minutes', () => {
  assert.equal(msToNextBoundary(Date.parse('2026-09-15T21:00:00.000Z'), 2.5), 150000);
  assert.equal(msToNextBoundary(Date.parse('2026-09-15T21:01:00.000Z'), 2.5), 90000);
  assert.equal(msToNextBoundary(Date.parse('2026-09-15T21:02:30.000Z'), 2.5), 150000);
  assert.equal(msToNextBoundary(Date.parse('2026-09-15T21:04:59.000Z'), 2.5), 1000);
  // The last slot of every hour ends on the hour: 24 slots divide it exactly.
  assert.equal(msToNextBoundary(Date.parse('2026-09-15T21:57:30.000Z'), 2.5), 150000);
  assert.equal(boundaryFor(Date.parse('2026-09-15T21:02:30.300Z'), 2.5), Date.parse('2026-09-15T21:02:30Z'));
  assert.equal(boundaryFor(Date.parse('2026-09-15T21:04:59.700Z'), 2.5), Date.parse('2026-09-15T21:05:00Z'));
});

test('periodMs keeps fractional minutes and never drops under one minute', () => {
  assert.equal(periodMs(2.5), 150000);
  assert.equal(periodMs(1), 60000);
  assert.equal(periodMs(5), 300000);
  assert.equal(periodMs(0.5), 60000);
  assert.equal(periodMs(undefined), 60000);
});

test('boundaryFor snaps a tick to the grid it belongs to', () => {
  assert.equal(boundaryFor(Date.parse('2026-09-15T21:55:00.400Z'), 5), Date.parse('2026-09-15T21:55:00Z'));
  assert.equal(boundaryFor(Date.parse('2026-09-15T21:54:59.600Z'), 5), Date.parse('2026-09-15T21:55:00Z'));
  assert.equal(boundaryFor(Date.parse('2026-09-15T21:52:04.000Z'), 1), Date.parse('2026-09-15T21:52:00Z'));
});

test('two runs started at different times produce the same boundaries', () => {
  const a = Date.parse('2026-09-15T21:52:04.000Z');
  const b = Date.parse('2026-09-15T21:53:47.000Z');
  assert.equal(a + msToNextBoundary(a, 5), b + msToNextBoundary(b, 5));
});

test('graph is due every 5 ticks and lifetime every 15', () => {
  const c = new Cadence({ graph: 5, lifetime: 15 });
  assert.equal(c.due(0).graph, true);
  assert.equal(c.due(3).graph, false);
  assert.equal(c.due(5).graph, true);
  assert.equal(c.due(15).lifetime, true);
  assert.equal(c.due(14).lifetime, false);
});

test('endpoints with no configured interval run every tick', () => {
  const c = new Cadence({ graph: 5 });
  assert.equal(c.due(7).roster, true);
  assert.equal(c.due(7).gameStats, true);
});

// --- lock ---------------------------------------------------------------

const k = keys('test-lock-team');
let client = null;
let skip = false;
try {
  client = await connect('redis://127.0.0.1:6379', { database: 12 });
} catch {
  skip = 'redis unreachable on 127.0.0.1:6379 - start redis-server to run the lock tests';
}
beforeEach(async () => { if (client) await client.del(k.lock); });
after(async () => { if (client) await client.quit(); });

test('a second lock acquire fails while the first is held', { skip }, async () => {
  const a = new Lock(client, k.lock, 90);
  const b = new Lock(client, k.lock, 90);
  assert.equal(await a.acquire(), true);
  assert.equal(await b.acquire(), false);
  await a.release();
  assert.equal(await b.acquire(), true);
  await b.release();
});

test('release only clears a lock this holder owns', { skip }, async () => {
  const a = new Lock(client, k.lock, 90);
  const b = new Lock(client, k.lock, 90);
  await a.acquire();
  await b.release();                       // b never held it
  assert.equal(await b.acquire(), false, 'a stranger must not be able to release the lock');
  await a.release();
});

test('refresh extends the ttl of a held lock', { skip }, async () => {
  const a = new Lock(client, k.lock, 2);
  await a.acquire();
  assert.equal(await a.refresh(), true);
  const ttl = await client.ttl(k.lock);
  assert.ok(ttl > 0 && ttl <= 2, `ttl should be reset, got ${ttl}`);
  await a.release();
});
