import { test, beforeEach, after } from 'node:test';
import assert from 'node:assert/strict';
import { connect } from '../src/store/redis.mjs';
import { keys } from '../src/store/keys.mjs';
import { logSources, readLog } from '../src/store/log.mjs';

const k = keys('test-team');

// Resolved before any test is registered, so `skip` is known at registration
// time - node:test reads the options object when the test is declared.
let client = null;
let skip = false;
try {
  // Its own database: node --test runs files concurrently, and every Redis-backed
  // suite flushes its db before each test - sharing one would wipe another
  // file's fixtures mid-run (store.test.mjs owns 15, app-daily 14, poller 13,
  // schedule 12, shutdown 11).
  client = await connect('redis://127.0.0.1:6379', { database: 10 });
} catch {
  skip = 'redis unreachable on 127.0.0.1:6379 - start redis-server to run the log reader tests';
}

beforeEach(async () => { if (client) await client.flushDb(); });
after(async () => { if (client) await client.quit(); });

const T0 = 1_790_000_000_000;
const STEP = 150_000;

/**
 * Five ticks, every tick writing the same stream id into four streams - the
 * shape the poller produces - plus one alert sharing a tick id and one on
 * its own id.
 */
async function seed() {
  for (let i = 0; i < 5; i++) {
    const id = `${T0 + i * STEP}-0`;
    await client.xAdd(k.tsTeam, id, { count: String(i) });
    await client.xAdd(k.tsOnline, id, { onlinePlayers: String(10 + i) });
    await client.xAdd(k.tsGame('berry'), id, { profit: String(i * 100) });
    await client.xAdd(k.tsGameModes('berry'), id, { 'BASE:profit': String(i) });
  }
  await client.xAdd(k.alerts, `${T0 + 2 * STEP}-0`, { message: 'alert on a tick' });
  await client.xAdd(k.alerts, `${T0 + 2 * STEP + 5}-0`, { message: 'alert off the tick' });
  // Not a stream, and must never be listed.
  await client.hSet(k.meta, { auth_state: 'ok' });
  await client.set(`${k.ns}:ts:not-a-stream`, 'x');
}

const idsOf = (page) => page.entries.map((e) => `${e.id}|${e.source}`);

test('logSources lists every trail stream in a fixed order, and alerts/summary last', { skip }, async () => {
  await seed();
  await client.xAdd(k.tsGame('alpha'), '*', { count: '1' });
  await client.xAdd(k.summary, '*', { minutes: '5' });
  const sources = await logSources(client, k);
  assert.deepEqual(sources.map((s) => s.id), [
    'ts:team', 'ts:online', 'ts:alpha', 'ts:berry', 'ts:berry:modes', 'alerts', 'summary',
  ]);
  assert.equal(sources[0].key, k.tsTeam);
  assert.ok(!sources.some((s) => s.key === k.meta), 'meta is a hash and is never a source');
  assert.ok(!sources.some((s) => s.id === 'ts:not-a-stream'), 'a non-stream under ts: is skipped');
});

test('logSources omits alerts and summary when they do not exist yet', { skip }, async () => {
  await client.xAdd(k.tsTeam, '*', { count: '1' });
  assert.deepEqual((await logSources(client, k)).map((s) => s.id), ['ts:team']);
});

test('the newest page is newest-first, ties broken by source order, with a total of every entry', { skip }, async () => {
  await seed();
  const sources = await logSources(client, k);
  const page = await readLog(client, sources, { count: 6 });
  assert.equal(page.total, 22, '5 ticks x 4 streams + 2 alerts');
  assert.deepEqual(idsOf(page), [
    `${T0 + 4 * STEP}-0|ts:team`, `${T0 + 4 * STEP}-0|ts:online`, `${T0 + 4 * STEP}-0|ts:berry`, `${T0 + 4 * STEP}-0|ts:berry:modes`,
    `${T0 + 3 * STEP}-0|ts:team`, `${T0 + 3 * STEP}-0|ts:online`,
  ]);
  assert.equal(page.newer, null, 'nothing is newer than the newest page');
  assert.equal(page.older, `${T0 + 3 * STEP}-0~1`);
  assert.equal(page.entries[0].ts, T0 + 4 * STEP);
  assert.deepEqual(page.entries[0].fields, { count: '4' }, 'fields are the raw stored strings');
});

test('walking older then newer through mid-tick page boundaries loses and duplicates nothing', { skip }, async () => {
  await seed();
  const sources = await logSources(client, k);
  const everything = idsOf(await readLog(client, sources, { count: 1000 }));
  assert.equal(everything.length, 22);

  const pages = [];
  let page = await readLog(client, sources, { count: 5 });
  pages.push(page);
  while (page.older) {
    page = await readLog(client, sources, { before: page.older, count: 5 });
    pages.push(page);
  }
  assert.deepEqual(pages.flatMap(idsOf), everything, 'older walk');
  assert.equal(pages.at(-1).older, null, 'nothing is older than the oldest page');

  // And back up again from the oldest page, through `newer`.
  const back = [pages.at(-1)];
  let up = pages.at(-1);
  while (up.newer) {
    up = await readLog(client, sources, { after: up.newer, count: 5 });
    back.unshift(up);
  }
  assert.deepEqual(back.flatMap(idsOf), everything, 'newer walk');
});

test('an alert sharing a tick id sorts after the trail streams of that tick', { skip }, async () => {
  await seed();
  const all = idsOf(await readLog(client, await logSources(client, k), { count: 1000 }));
  const onTick = all.indexOf(`${T0 + 2 * STEP}-0|alerts`);
  assert.equal(all[onTick - 1], `${T0 + 2 * STEP}-0|ts:berry:modes`);
  assert.ok(all.indexOf(`${T0 + 2 * STEP + 5}-0|alerts`) < all.indexOf(`${T0 + 2 * STEP}-0|ts:team`), 'a later id sorts first');
});

test('the oldest page holds the oldest entries, newest first, with no older page', { skip }, async () => {
  await seed();
  const page = await readLog(client, await logSources(client, k), { oldest: true, count: 5 });
  // The last five of the full newest-first order: ties within a tick stay in
  // source order, so the page starts on the last stream of the second tick.
  assert.deepEqual(idsOf(page), [
    `${T0 + STEP}-0|ts:berry:modes`,
    `${T0}-0|ts:team`, `${T0}-0|ts:online`, `${T0}-0|ts:berry`, `${T0}-0|ts:berry:modes`,
  ]);
  assert.equal(page.older, null);
  assert.equal(page.newer, `${T0 + STEP}-0~3`);
});

test('ids compare numerically, not as strings', { skip }, async () => {
  // As strings '999-0' > '1000-0'; as ids it is older.
  await client.xAdd(k.tsTeam, '999-0', { v: 'old' });
  await client.xAdd(k.tsTeam, '1000-0', { v: 'new' });
  await client.xAdd(k.tsOnline, '1000-1', { v: 'newest' });
  const page = await readLog(client, await logSources(client, k), { count: 10 });
  assert.deepEqual(page.entries.map((e) => e.fields.v), ['newest', 'new', 'old']);
});

test('a malformed cursor is ignored and the newest page is served', { skip }, async () => {
  await seed();
  const sources = await logSources(client, k);
  const newest = idsOf(await readLog(client, sources, { count: 3 }));
  for (const bad of ['nope', '123', '1-0~', '1-0~x', '(1-0~0', '1-0~0; DEL x']) {
    assert.deepEqual(idsOf(await readLog(client, sources, { before: bad, count: 3 })), newest, bad);
    assert.deepEqual(idsOf(await readLog(client, sources, { after: bad, count: 3 })), newest, bad);
  }
});

test('empty and missing streams read as an empty log, not an error', { skip }, async () => {
  const page = await readLog(client, [{ id: 'ts:team', key: k.tsTeam }], { count: 10 });
  assert.deepEqual(page, { entries: [], newer: null, older: null, total: 0 });
  assert.deepEqual(await readLog(client, [], { count: 10 }), { entries: [], newer: null, older: null, total: 0 });
});
