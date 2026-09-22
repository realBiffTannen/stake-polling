import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, writeFile, stat, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fingerprint, resolveSid, saveSid, readSidFile } from '../src/sid/index.mjs';
import { readChromeSid } from '../src/sid/chrome-cookies.mjs';

const dir = await mkdtemp(join(tmpdir(), 'stake-sid-'));
const sidPath = join(dir, '.sid');
const accept = async () => true;

test('fingerprint is stable and is not the sid', () => {
  assert.equal(fingerprint('abc').length, 8);
  assert.equal(fingerprint('abc'), fingerprint('abc'));
  assert.notEqual(fingerprint('abc'), 'abc');
  assert.notEqual(fingerprint('abc'), fingerprint('abd'));
});

test('env wins over file', async () => {
  await writeFile(sidPath, 'from-file');
  const out = await resolveSid({ env: { STAKE_SID: 'from-env' }, file: sidPath, allowChrome: false, allowPrompt: false, validate: accept });
  assert.equal(out.sid, 'from-env');
  assert.equal(out.source, 'env');
});

test('an invalid env sid falls through to the file', async () => {
  await writeFile(sidPath, 'good-one');
  const out = await resolveSid({
    env: { STAKE_SID: 'stale' },
    file: sidPath,
    allowChrome: false,
    allowPrompt: false,
    validate: async (sid) => sid === 'good-one',
  });
  assert.equal(out.sid, 'good-one');
  assert.equal(out.source, 'file');
});

test('chrome is tried after the file and before the prompt', async () => {
  await writeFile(sidPath, 'stale-file');
  const out = await resolveSid({
    env: {},
    file: sidPath,
    allowChrome: true,
    allowPrompt: true,
    chromeReader: async () => 'from-chrome',
    prompt: async () => 'from-prompt',
    validate: async (sid) => sid !== 'stale-file',
  });
  assert.equal(out.sid, 'from-chrome');
  assert.equal(out.source, 'chrome');
});

test('the prompt is the last resort and its answer is persisted', async () => {
  const p = join(dir, 'prompted.sid');
  const out = await resolveSid({
    env: {},
    file: p,
    allowChrome: true,
    allowPrompt: true,
    chromeReader: async () => null,
    prompt: async () => 'typed-by-hand',
    validate: accept,
  });
  assert.equal(out.sid, 'typed-by-hand');
  assert.equal(out.source, 'prompt');
  assert.equal((await readFile(p, 'utf8')).trim(), 'typed-by-hand');
});

test('resolveSid reports failure instead of throwing when every source is exhausted', async () => {
  const out = await resolveSid({
    env: {},
    file: join(dir, 'missing.sid'),
    allowChrome: false,
    allowPrompt: false,
    validate: async () => false,
  });
  assert.equal(out.sid, null);
  assert.equal(out.source, null);
  assert.ok(Array.isArray(out.tried));
});

test('saveSid writes mode 600', async () => {
  const p = join(dir, 'perm.sid');
  await saveSid(p, 'secret');
  assert.equal((await stat(p)).mode & 0o777, 0o600);
  assert.equal(await readSidFile(p), 'secret');
});

test('readSidFile trims whitespace and returns null when absent', async () => {
  const p = join(dir, 'ws.sid');
  await writeFile(p, '  padded-sid\n\n');
  assert.equal(await readSidFile(p), 'padded-sid');
  assert.equal(await readSidFile(join(dir, 'nope.sid')), null);
});

test('readChromeSid returns null when the profile path does not exist', async () => {
  assert.equal(await readChromeSid({ profileDir: join(dir, 'no-such-chrome') }), null);
});

test('readChromeSid never throws, whatever the environment', async () => {
  await assert.doesNotReject(() => readChromeSid({ profileDir: '/dev/null' }));
});

test('cleanup', async () => { await rm(dir, { recursive: true, force: true }); });
