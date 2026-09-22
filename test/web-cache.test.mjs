import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createDataCache } from '../src/web/data-cache.mjs';
import { createPageCache } from '../src/web/page-cache.mjs';
import { fill, refill } from '../src/web/fills.mjs';

// ------------------------------------------------------------- data cache
test('the data cache loads once and shares the result until it is invalidated', async () => {
  let loads = 0;
  const cache = createDataCache({ load: async () => ({ n: ++loads }), ttlMs: 60_000, now: () => 0 });
  assert.equal((await cache.get()).n, 1);
  assert.equal((await cache.get()).n, 1);
  cache.invalidate();
  assert.equal((await cache.get()).n, 2);
});

test('concurrent readers share one load in flight', async () => {
  let loads = 0, release;
  const cache = createDataCache({ load: () => new Promise((r) => { loads++; release = () => r({ n: loads }); }), ttlMs: 60_000, now: () => 0 });
  const a = cache.get(), b = cache.get();
  release();
  assert.deepEqual(await Promise.all([a, b]), [{ n: 1 }, { n: 1 }]);
  assert.equal(loads, 1);
});

test('the data cache expires on its own after the TTL, so a dead collector still surfaces as stale', async () => {
  let t = 0, loads = 0;
  const cache = createDataCache({ load: async () => ++loads, ttlMs: 150_000, now: () => t });
  await cache.get();
  t = 149_999; await cache.get();
  assert.equal(loads, 1);
  t = 150_000; await cache.get();
  assert.equal(loads, 2);
});

test('a failed load is not cached', async () => {
  let fail = true;
  const cache = createDataCache({ load: async () => { if (fail) throw new Error('redis down'); return 'ok'; }, ttlMs: 60_000, now: () => 0 });
  await assert.rejects(cache.get(), /redis down/);
  fail = false;
  assert.equal(await cache.get(), 'ok');
});

test('version() is the cached data\'s version while fresh, and null once invalidated or expired', async () => {
  let t = 0;
  const cache = createDataCache({ load: async () => ({ v: 7 }), ttlMs: 1000, now: () => t, versionOf: (d) => d.v });
  assert.equal(cache.version(), null, 'nothing loaded yet');
  await cache.get();
  assert.equal(cache.version(), 7);
  t = 1000;
  assert.equal(cache.version(), null);
  await cache.get();
  cache.invalidate();
  assert.equal(cache.version(), null);
});

// ------------------------------------------------------------- page cache
test('the page cache returns an entry only for the version it was rendered from', () => {
  const pages = createPageCache({ max: 10 });
  pages.set('/a', 1, { body: 'one' });
  assert.equal(pages.get('/a', 1).body, 'one');
  assert.equal(pages.get('/a', 2), null, 'a new tick means a new render');
  assert.equal(pages.get('/b', 1), null);
});

test('the page cache evicts the least recently used entry past its cap', () => {
  const pages = createPageCache({ max: 2 });
  pages.set('/a', 1, { body: 'a' });
  pages.set('/b', 1, { body: 'b' });
  pages.get('/a', 1);
  pages.set('/c', 1, { body: 'c' });
  assert.equal(pages.get('/b', 1), null, 'b was least recently used');
  assert.ok(pages.get('/a', 1));
  assert.ok(pages.get('/c', 1));
  assert.equal(pages.size, 2);
});

test('the page cache key ignores query-parameter order', () => {
  const pages = createPageCache();
  const key = pages.keyOf(new URL('http://x/analysis?span=today&fragment=1'));
  assert.equal(key, pages.keyOf(new URL('http://x/analysis?fragment=1&span=today')));
  assert.notEqual(key, pages.keyOf(new URL('http://x/analysis?span=today')));
});

// ------------------------------------------------------------------ fills
test('a fill marks a region that refill replaces with a value computed at serve time', () => {
  const body = `<p>${fill('age', 'Polled 3s ago')}</p><p>${fill('age', 'Polled 3s ago')}</p>`;
  assert.equal(refill(body, { age: () => 'Polled 90s ago' }), '<p>Polled 90s ago</p><p>Polled 90s ago</p>');
});

test('refill leaves unknown regions and plain text alone', () => {
  const body = `x${fill('countdown', '0:47')}y`;
  assert.equal(refill(body, {}), 'x0:47y', 'no value given: the rendered content stays, markers go');
  assert.equal(refill('plain', { age: () => 'z' }), 'plain');
});

test('a page-cache entry also expires by age, so a stuck collector cannot pin a "connected" page forever', () => {
  let t = 0;
  const pages = createPageCache({ ttlMs: 150_000, now: () => t });
  pages.set('/a', 1, { body: 'a' });
  t = 149_999;
  assert.ok(pages.get('/a', 1));
  t = 150_000;
  assert.equal(pages.get('/a', 1), null);
});
