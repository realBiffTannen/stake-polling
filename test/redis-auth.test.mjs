import { test } from 'node:test';
import assert from 'node:assert/strict';
import { redisOptions, redactUrl } from '../src/store/redis.mjs';

test('no credentials by default: the URL alone, exactly as configured', () => {
  assert.deepEqual(redisOptions('redis://127.0.0.1:6379', {}), { url: 'redis://127.0.0.1:6379' });
  assert.deepEqual(redisOptions('redis://127.0.0.1:6379/15', { REDIS_PASSWORD: '' }), { url: 'redis://127.0.0.1:6379/15' }, 'an empty password is no password');
});

test('REDIS_PASSWORD and REDIS_USERNAME authenticate, and win over any in the URL', () => {
  assert.deepEqual(redisOptions('redis://127.0.0.1:6379', { REDIS_PASSWORD: 's3cret' }), { url: 'redis://127.0.0.1:6379', password: 's3cret' });
  assert.deepEqual(redisOptions('rediss://old:stale@cache.example:6380/2', { REDIS_USERNAME: 'poller', REDIS_PASSWORD: 's3cret' }),
    { url: 'rediss://cache.example:6380/2', username: 'poller', password: 's3cret' });
});

test('credentials in the URL are left for node-redis to use when the environment has none', () => {
  assert.deepEqual(redisOptions('redis://poller:s3cret@127.0.0.1:6379', {}), { url: 'redis://poller:s3cret@127.0.0.1:6379' });
});

test('a URL printed to a log or the terminal never shows its password', () => {
  assert.equal(redactUrl('redis://poller:s3cret@127.0.0.1:6379/0'), 'redis://poller:***@127.0.0.1:6379/0');
  assert.equal(redactUrl('redis://:s3cret@127.0.0.1:6379'), 'redis://:***@127.0.0.1:6379');
  assert.equal(redactUrl('redis://127.0.0.1:6379'), 'redis://127.0.0.1:6379', 'untouched without one');
});
