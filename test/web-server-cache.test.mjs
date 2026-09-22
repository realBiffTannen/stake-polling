import { test } from 'node:test';
import assert from 'node:assert/strict';
import { gunzipSync } from 'node:zlib';
import { createWebServer } from '../src/web/server.mjs';
import { buildInsights } from '../src/insights/model.mjs';
import { assetUrl } from '../src/web/static.mjs';

const T0 = Date.parse('2026-09-22T12:00:00Z');
const money = { unitsPerDollar: 1_000_000, profitShare: 0.1, expectedShare: 0.075 };
const snapshot = { trackingStart: '2026-07-24', days: {}, cumulative: {} };

async function setup(t, { version = () => 1 } = {}) {
  let clock = T0 + 1000, reads = 0;
  const read = async (query) => {
    reads++;
    return { model: buildInsights({ snapshot, now: clock, query }),
      state: { now: clock, lastOk: T0, ageMs: clock - T0, pollMinutes: 2.5, dataVersion: version(), meta: { team: 'acme-studios' }, money,
        rows: [{ name: 'berry', label: 'Berry', count: 1, turnoverUsd: 1, profitUsd: 1 }] } };
  };
  const server = createWebServer({ read, version, now: () => clock });
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  t.after(() => new Promise(resolve => { server.close(resolve); server.closeAllConnections(); }));
  return { base: `http://127.0.0.1:${server.address().port}`, server, reads: () => reads, tick: (ms) => { clock += ms; } };
}

test('a page is rendered once per data version and then served from the cache', async t => {
  const s = await setup(t);
  assert.equal((await fetch(s.base + '/')).status, 200);
  await fetch(s.base + '/');
  await fetch(s.base + '/?fragment=1');
  assert.equal(s.reads(), 2, 'the page and its fragment are two renders, each once');
});

test('a new data version renders the page afresh', async t => {
  let v = 1;
  const s = await setup(t, { version: () => v });
  await fetch(s.base + '/');
  v = 2;
  await fetch(s.base + '/');
  assert.equal(s.reads(), 2);
});

test('with no fresh data version nothing is served from the cache', async t => {
  const s = await setup(t, { version: () => null });
  await fetch(s.base + '/');
  await fetch(s.base + '/');
  assert.equal(s.reads(), 2);
});

test('a cached page still says how long ago the collector polled, as of the moment it is served', async t => {
  const s = await setup(t);
  assert.match(await (await fetch(s.base + '/')).text(), /Polled 1s ago/);
  s.tick(60_000);
  const later = await (await fetch(s.base + '/')).text();
  assert.equal(s.reads(), 1, 'served from the cache');
  assert.match(later, /Polled 1m ago/);
  assert.doesNotMatch(later, /<!--fill:/, 'markers never reach the browser');
});

test('the live page countdown is recomputed on every serve', async t => {
  const s = await setup(t);
  const first = await (await fetch(s.base + '/live')).text();
  s.tick(30_000);
  const second = await (await fetch(s.base + '/live')).text();
  const ms = (html) => Number(html.match(/data-next-poll-ms="(\d+)"/)[1]);
  assert.equal(ms(first) - ms(second), 30_000);
});

test('health checks and exports are never cached', async t => {
  const s = await setup(t);
  await fetch(s.base + '/healthz');
  await fetch(s.base + '/healthz');
  assert.equal(s.reads(), 2);
});

test('warm() renders pages ahead of the first visitor', async t => {
  const s = await setup(t);
  await s.server.warm(['/', '/analysis']);
  assert.equal(s.reads(), 2);
  await fetch(s.base + '/');
  await fetch(s.base + '/analysis');
  assert.equal(s.reads(), 2, 'both served from what warm() rendered');
});

test('pages are gzipped for a browser that accepts it', async t => {
  const s = await setup(t);
  const res = await fetch(s.base + '/', { headers: { 'accept-encoding': 'gzip' } });
  assert.equal(res.headers.get('content-encoding'), 'gzip');
  assert.match(res.headers.get('vary') ?? '', /accept-encoding/i);
  assert.match(await res.text(), /Overview/, 'fetch decompresses it transparently');
  const raw = await fetch(s.base + '/', { headers: { 'accept-encoding': 'identity' } });
  assert.equal(raw.headers.get('content-encoding'), null);
});

test('static assets are cached for a day under a content-hash URL, and revalidate to 304', async t => {
  const s = await setup(t);
  for (const path of ['/app.css', '/app.js', '/brand/logo.svg', '/brand/favicon.svg']) {
    const res = await fetch(s.base + assetUrl(path));
    assert.equal(res.status, 200, path);
    assert.match(res.headers.get('cache-control'), /max-age=86400/, path);
    const etag = res.headers.get('etag');
    assert.ok(etag, path);
    assert.equal((await fetch(s.base + assetUrl(path), { headers: { 'if-none-match': etag } })).status, 304, path);
  }
  assert.match((await fetch(s.base + '/brand/logo.svg')).headers.get('content-type'), /image\/svg\+xml/);
});

test('a gzipped static asset decompresses to the original bytes', async t => {
  const s = await setup(t);
  const res = await fetch(s.base + assetUrl('/app.css'), { headers: { 'accept-encoding': 'gzip' } });
  assert.equal(res.headers.get('content-encoding'), 'gzip');
  assert.ok((await res.text()).length > 1000);
  assert.ok(gunzipSync);
});

import { STATIC } from '../src/web/static.mjs';

test('the served logo is a standalone SVG file: namespaced, and no attribute repeated on its root', () => {
  const root = String(STATIC['/brand/logo.svg'].body).match(/<svg[^>]*>/)[0];
  assert.match(root, /xmlns="http:\/\/www\.w3\.org\/2000\/svg"/);
  const names = [...root.matchAll(/\s([a-zA-Z:-]+)=/g)].map(m => m[1]);
  assert.deepEqual(names, [...new Set(names)], `duplicate attributes in ${root}`);
});
