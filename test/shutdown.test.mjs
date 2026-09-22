import { test, after } from 'node:test';
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { createServer } from 'node:http';
import { mkdtemp, writeFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { connect } from '../src/store/redis.mjs';
import { keys } from '../src/store/keys.mjs';

// The poller binary, driven for real: spawned, allowed to reach its polling
// loop, then signalled. This covers what unit tests structurally cannot - the
// binary's own startup ordering. The first version registered its signal
// handlers AFTER the endless polling loop, so they never registered at all and
// a Ctrl-C leaked the lock until its TTL expired.

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const DB = 11;
const k = keys('shutdown-test-team');

let client = null;
let skip = false;
try {
  client = await connect('redis://127.0.0.1:6379', { database: DB });
} catch {
  skip = 'redis unreachable on 127.0.0.1:6379 - start redis-server to run the shutdown test';
}
after(async () => { if (client) { await client.flushDb(); await client.quit(); } });

/** Minimal API stand-in: enough for the sid to validate. */
async function stubApi() {
  const server = createServer((req, res) => {
    res.writeHead(200, { 'content-type': 'application/json' });
    res.end(JSON.stringify([]));
  });
  await new Promise((r) => server.listen(0, '127.0.0.1', r));
  return { url: `http://127.0.0.1:${server.address().port}/api`, close: () => new Promise((r) => server.close(r)) };
}

/** Resolves once the binary logs that it has entered the polling loop. */
function waitForLine(child, needle, timeoutMs = 15000) {
  return new Promise((resolve, reject) => {
    let buffer = '';
    const timer = setTimeout(() => reject(new Error(`timed out waiting for "${needle}"; saw: ${buffer}`)), timeoutMs);
    const onData = (chunk) => {
      buffer += chunk;
      if (buffer.includes(needle)) {
        clearTimeout(timer);
        child.stdout.off('data', onData);
        resolve(buffer);
      }
    };
    child.stdout.on('data', onData);
    child.stderr.on('data', (c) => { buffer += c; });
  });
}

test('SIGTERM releases the poller lock instead of leaking it until the TTL', { skip }, async () => {
  await client.flushDb();
  const api = await stubApi();
  const dir = await mkdtemp(join(tmpdir(), 'stake-shutdown-'));
  const sidFile = join(dir, '.sid');
  await writeFile(sidFile, 'a-test-sid');
  after(async () => { await api.close(); await rm(dir, { recursive: true, force: true }); });

  const child = spawn(process.execPath, [join(ROOT, 'bin', 'stake-poller.mjs')], {
    env: {
      ...process.env,
      STAKE_TEAM: 'shutdown-test-team',
    STAKE_LIFETIME_START: '2026-07-24',
      STAKE_LIFETIME_START: '2026-07-24',
      STAKE_API_URL: api.url,
      STAKE_SID: 'a-test-sid',
      STAKE_SID_FILE: sidFile,
      REDIS_URL: `redis://127.0.0.1:6379/${DB}`,
    },
    stdio: ['ignore', 'pipe', 'pipe'],
  });
  after(() => { if (child.exitCode === null) child.kill('SIGKILL'); });

  await waitForLine(child, 'aligned to the clock');
  assert.equal(await client.exists(k.lock), 1, 'the poller should hold the lock while running');

  const exited = new Promise((resolve) => child.once('exit', (code, signal) => resolve({ code, signal })));
  child.kill('SIGTERM');
  await exited;

  assert.equal(await client.exists(k.lock), 0, 'a clean shutdown must release the lock, not wait for its TTL');
});

test('a second poller refuses to start while the first holds the lock', { skip }, async () => {
  await client.flushDb();
  const api = await stubApi();
  const dir = await mkdtemp(join(tmpdir(), 'stake-lock-'));
  after(async () => { await api.close(); await rm(dir, { recursive: true, force: true }); });

  const env = {
    ...process.env,
    STAKE_TEAM: 'shutdown-test-team',
    STAKE_LIFETIME_START: '2026-07-24',
    STAKE_API_URL: api.url,
    STAKE_SID: 'a-test-sid',
    STAKE_SID_FILE: join(dir, '.sid'),
    REDIS_URL: `redis://127.0.0.1:6379/${DB}`,
  };

  const first = spawn(process.execPath, [join(ROOT, 'bin', 'stake-poller.mjs')], { env, stdio: ['ignore', 'pipe', 'pipe'] });
  after(() => { if (first.exitCode === null) first.kill('SIGKILL'); });
  await waitForLine(first, 'aligned to the clock');

  const second = spawn(process.execPath, [join(ROOT, 'bin', 'stake-poller.mjs')], { env, stdio: ['ignore', 'pipe', 'pipe'] });
  let stderr = '';
  second.stderr.on('data', (c) => { stderr += c; });
  const result = await new Promise((resolve) => second.once('exit', (code) => resolve(code)));

  assert.equal(result, 1, 'the second poller must exit non-zero');
  assert.match(stderr, /already holds/);

  const exited = new Promise((resolve) => first.once('exit', resolve));
  first.kill('SIGTERM');
  await exited;
});
