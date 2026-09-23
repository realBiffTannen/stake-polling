import { test } from 'node:test';
import assert from 'node:assert/strict';
import { parseSize, humanBytes, parseMemoryInfo, readRedisMemory, memoryStatus } from '../src/store/memory.mjs';
import { loadConfig } from '../src/config.mjs';
import { banner } from '../src/web/views/parts.mjs';
import { shell } from '../src/web/views/shell.mjs';
import { renderFrame, renderPlain, buildState } from '../src/tui/render.mjs';
import { initialNav } from '../src/tui/nav.mjs';

const G = 1024 ** 3;
const TEST_ENV = { STAKE_TEAM: 'acme-studios', STAKE_LIFETIME_START: '2026-07-24' };

// What `redis-cli INFO memory` actually returns, CRLF line ends included.
const INFO = '# Memory\r\nused_memory:2362232012\r\nused_memory_human:2.20G\r\nused_memory_rss:2400000000\r\n';

test('sizes are binary, the way redis-cli prints them, so "2GB" is its "2.00G"', () => {
  assert.equal(parseSize('2GB'), 2 * G);
  assert.equal(parseSize('2G'), 2 * G);
  assert.equal(parseSize('2gib'), 2 * G);
  assert.equal(parseSize(' 512 MB '), 512 * 1024 ** 2);
  assert.equal(parseSize('1.5G'), 1.5 * G);
  assert.equal(parseSize('1048576'), 1048576);
  assert.equal(humanBytes(2 * G), '2.00G');
  assert.equal(humanBytes(1023), '1023B');
});

test('a size that is not one reads as null, not as zero or a default', () => {
  for (const bad of ['', 'lots', '2 XB', '-1GB', '0', null, undefined]) assert.equal(parseSize(bad), null, String(bad));
});

test('the INFO reply gives used_memory in bytes and used_memory_human as printed', () => {
  assert.deepEqual(parseMemoryInfo(INFO), { usedBytes: 2362232012, human: '2.20G' });
  assert.equal(parseMemoryInfo('# Memory\r\nused_memory_rss:1\r\n'), null, 'used_memory_rss is not used_memory');
  assert.equal(parseMemoryInfo(''), null);
});

test('a failed INFO reads back as no reading, never as an empty database', async () => {
  assert.deepEqual(await readRedisMemory({ info: async () => INFO }), { usedBytes: 2362232012, human: '2.20G' });
  assert.equal(await readRedisMemory({ info: async () => { throw new Error('NOPERM'); } }), null);
  assert.equal(await readRedisMemory({}), null, 'a client without INFO');
});

test('over means strictly past the limit, and no reading is no status', () => {
  assert.equal(memoryStatus({ usedBytes: 2 * G, human: '2.00G' }, 2 * G).over, false);
  const over = memoryStatus({ usedBytes: 2 * G + 1, human: '2.00G' }, 2 * G);
  assert.equal(over.over, true);
  assert.equal(over.limitHuman, '2.00G');
  assert.equal(memoryStatus(null, 2 * G), null);
  assert.equal(memoryStatus({ usedBytes: 3 * G }, undefined).limitBytes, 2 * G, 'the 2GB default when no limit is configured');
});

test('the limit is 2GB unless REDIS_DB_SIZE says otherwise, and a bad one fails loudly at start-up', () => {
  assert.equal(loadConfig({ env: TEST_ENV, local: null }).redisMemoryLimitBytes, 2 * G);
  assert.equal(loadConfig({ env: { ...TEST_ENV, REDIS_DB_SIZE: '512MB' }, local: null }).redisMemoryLimitBytes, 512 * 1024 ** 2);
  assert.throws(() => loadConfig({ env: { ...TEST_ENV, REDIS_DB_SIZE: 'plenty' }, local: null }), /invalid REDIS_DB_SIZE/);
});

const overState = { meta: { team: 'acme-studios' }, stale: false, ageMs: 1000, now: Date.parse('2026-09-19T12:00:00Z'),
  redisMemory: memoryStatus({ usedBytes: 2362232012, human: '2.20G' }, 2 * G) };

test('over the limit, every web page carries a sticky alert at the top', () => {
  const out = String(shell({ state: overState, body: 'x', active: 'analysis', title: 'Analysis' }));
  assert.match(out, /<div class="banner bad sticky" role="alert">REDIS MEMORY 2\.20G - over the 2\.00G limit \(REDIS_DB_SIZE\)/);
  assert.ok(out.indexOf('banner bad sticky') < out.indexOf('class="content"'), 'above the page body');
});

test('under the limit, or with no reading, there is no alert', () => {
  const under = { ...overState, redisMemory: memoryStatus({ usedBytes: G, human: '1.00G' }, 2 * G) };
  assert.doesNotMatch(String(banner(under)), /REDIS MEMORY/);
  assert.doesNotMatch(String(banner({ ...overState, redisMemory: null })), /REDIS MEMORY/);
});

test('the terminal dashboard carries the same alert in its header, and so does the plain view', () => {
  const dashboard = { meta: { auth_state: 'ok', last_ok: String(Date.now()) }, roster: { ok: true, data: [] }, games: { ok: true, data: [] },
    perGame: {}, alerts: [], redisMemory: { usedBytes: 2362232012, human: '2.20G' } };
  const state = { ...buildState(dashboard, { games: {}, online: [] }, Date.now(), { redisMemoryLimitBytes: 2 * G }), nav: initialNav() };
  const frame = renderFrame(state, { cols: 120, rows: 30 }).join('\n');
  assert.match(frame, /REDIS MEMORY 2\.20G over the 2\.00G limit/);
  const header = frame.split('\n').findIndex((l) => l.includes('REDIS MEMORY'));
  assert.ok(header > 0 && header < 8, `in the header block, line ${header}`);
  assert.match(renderPlain(state), /REDIS MEMORY 2\.20G over the 2\.00G limit/);
  const calm = { ...buildState({ ...dashboard, redisMemory: { usedBytes: 1, human: '1B' } }, { games: {}, online: [] }, Date.now(), {}), nav: initialNav() };
  assert.doesNotMatch(renderFrame(calm, { cols: 120, rows: 30 }).join('\n'), /REDIS MEMORY/);
});
