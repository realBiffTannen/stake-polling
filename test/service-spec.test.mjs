import { test } from 'node:test';
import assert from 'node:assert/strict';
import { buildServiceSpec, DEFAULT_LABEL } from '../src/service/spec.mjs';

const base = {
  root: '/Users/alice/code/stake_polling',
  home: '/Users/alice',
  execPath: '/opt/homebrew/Cellar/node/22.16.0/bin/node',
};

test('it runs stake-up out of this checkout, with the node that installed it', () => {
  const spec = buildServiceSpec(base);
  assert.equal(spec.label, DEFAULT_LABEL);
  // Not "node": launchd's PATH is not a login shell's, and a bare `node`
  // resolves to whatever /usr/bin holds, or to nothing at all.
  assert.equal(spec.program[0], base.execPath);
  assert.equal(spec.program[1], '/Users/alice/code/stake_polling/bin/stake-up.mjs');
  assert.equal(spec.workingDirectory, base.root);
});

test('host and port travel as arguments, so the service matches what you tested', () => {
  const spec = buildServiceSpec({ ...base, host: '127.0.0.1', port: 3010 });
  assert.deepEqual(spec.program.slice(2), ['--host', '127.0.0.1', '--port', '3010']);
});

test('logs land in the user log directory, one file per stream', () => {
  const spec = buildServiceSpec(base);
  assert.equal(spec.stdout, '/Users/alice/Library/Logs/stake-polling/out.log');
  assert.equal(spec.stderr, '/Users/alice/Library/Logs/stake-polling/err.log');
});

test('the service waits for Redis instead of dying at boot', () => {
  // At login launchd starts this before brew has started redis-server. The
  // wait is what keeps that ordering gap from becoming a crash loop.
  assert.equal(buildServiceSpec(base).env.STAKE_WAIT_FOR_REDIS_MS, '180000');
  assert.equal(buildServiceSpec({ ...base, waitForRedisMs: 60000 }).env.STAKE_WAIT_FOR_REDIS_MS, '60000');
});

test('a second checkout can run its own agent under its own label', () => {
  const spec = buildServiceSpec({ ...base, label: `${DEFAULT_LABEL}.staging` });
  assert.equal(spec.label, 'local.stake-polling.staging');
  assert.equal(spec.stdout, '/Users/alice/Library/Logs/stake-polling.staging/out.log');
});

test('the default label names no studio', () => {
  assert.equal(DEFAULT_LABEL, 'local.stake-polling');
});

test('a studio\'s own reverse-DNS label keeps the plain log directory', () => {
  // An install made under an organisation's prefix must not move its logs
  // when that prefix stops being the default.
  const spec = buildServiceSpec({ ...base, label: 'com.example.stake-polling' });
  assert.equal(spec.label, 'com.example.stake-polling');
  assert.equal(spec.stdout, '/Users/alice/Library/Logs/stake-polling/out.log');
  assert.equal(buildServiceSpec({ ...base, label: 'com.example.stake-polling.staging' }).stdout, '/Users/alice/Library/Logs/stake-polling.staging/out.log');
  assert.equal(buildServiceSpec({ ...base, label: 'my-poller' }).stdout, '/Users/alice/Library/Logs/my-poller/out.log');
});
