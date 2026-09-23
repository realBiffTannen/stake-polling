import { test, after } from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { connect } from '../src/store/redis.mjs';
import { keys } from '../src/store/keys.mjs';
import { createAuth, hashPassword, verifyPassword, credentialProblem, MAX_FAILURES, FAILURE_WINDOW_MS, SESSION_SHORT_S, SESSION_LONG_S } from '../src/web/auth.mjs';

const DB = 6;
const k = keys('auth-test-team');
let client = null;
let skip = false;
try { client = await connect('redis://127.0.0.1:6379', { database: DB }); } catch { skip = 'redis unreachable on 127.0.0.1:6379'; }
after(async () => { if (client) { await client.flushDb(); await client.quit(); } });
const fresh = async (opts = {}) => { await client.flushDb(); return createAuth({ client, k, ...opts }); };
const PW = 'correct horse battery';

test('a password is kept only as a salted scrypt hash, and only the right one verifies', async () => {
  const a = await hashPassword(PW);
  const b = await hashPassword(PW);
  assert.notEqual(a.salt, b.salt);
  assert.notEqual(a.hash, b.hash, 'the same password never hashes the same twice');
  assert.ok(!JSON.stringify(a).includes(PW));
  assert.equal(await verifyPassword(PW, a), true);
  assert.equal(await verifyPassword('correct horse batterx', a), false);
  assert.equal(await verifyPassword(PW, null), false);
});

test('credentials are checked: a plain username, at least 10 characters, and a matching confirmation', () => {
  assert.equal(credentialProblem({ username: 'ops', password: PW, confirm: PW }), null);
  assert.equal(credentialProblem({ username: 'has space', password: PW }), 'username');
  assert.equal(credentialProblem({ username: '', password: PW }), 'username');
  assert.equal(credentialProblem({ username: 'ops', password: 'short' }), 'password-short');
  assert.equal(credentialProblem({ username: 'ops', password: PW, confirm: 'other thing!' }), 'password-mismatch');
});

test('sign-in is off until turned on, and turning it on signs that browser in', { skip }, async () => {
  const auth = await fresh();
  assert.deepEqual(await auth.status(), { enabled: false, username: null });
  const on = await auth.enable({ username: 'ops', password: PW, confirm: PW });
  assert.ok(on.token);
  assert.equal(await auth.sessionUser(on.token), 'ops');
  assert.deepEqual(await auth.status(), { enabled: true, username: 'ops' });
  assert.deepEqual(await auth.enable({ username: 'x', password: PW, confirm: PW }), { error: 'already-on' }, 'cannot be taken over by turning it on again');
  const stored = await client.get(k.auth);
  assert.ok(!stored.includes(PW), 'the password is not in Redis');
  assert.ok(!(await client.keys('*')).some((key) => key.includes(on.token)), 'nor is the session token');
});

test('signing in: the right pair gets a session, a wrong name and a wrong password get the same answer', { skip }, async () => {
  const auth = await fresh();
  await auth.enable({ username: 'ops', password: PW, confirm: PW });
  const ok = await auth.login({ username: 'ops', password: PW, ip: 'a' });
  assert.equal(await auth.sessionUser(ok.token), 'ops');
  assert.equal(ok.maxAge, null, 'a browser session unless kept');
  assert.deepEqual(await auth.login({ username: 'ops', password: 'wrong wrong wrong', ip: 'a' }), { error: 'invalid' });
  assert.deepEqual(await auth.login({ username: 'nobody', password: PW, ip: 'a' }), { error: 'invalid' });
  const kept = await auth.login({ username: 'ops', password: PW, keep: true, ip: 'a' });
  assert.equal(kept.maxAge, SESSION_LONG_S);
  const ttlOf = async (token) => client.ttl(k.session(createHash('sha256').update(token).digest('hex')));
  assert.ok((await ttlOf(kept.token)) > SESSION_SHORT_S, 'kept: a month');
  assert.ok((await ttlOf(ok.token)) <= SESSION_SHORT_S, 'not kept: hours');
  assert.equal(await auth.sessionUser('forged-token'), null);
  assert.equal(await auth.sessionUser(''), null);
  assert.equal(await auth.sessionUser('x'.repeat(500)), null);
  assert.ok(SESSION_SHORT_S < SESSION_LONG_S);
});

test('an address that keeps failing is made to wait, and the wait ends', { skip }, async () => {
  let t = 1_000_000;
  const auth = await fresh({ now: () => t });
  await auth.enable({ username: 'ops', password: PW, confirm: PW });
  for (let i = 0; i < MAX_FAILURES; i++) assert.equal((await auth.login({ username: 'ops', password: 'nope nope nope', ip: 'b' })).error, 'invalid');
  const blocked = await auth.login({ username: 'ops', password: PW, ip: 'b' });
  assert.equal(blocked.error, 'rate', 'even the right password waits');
  assert.ok(blocked.retryAfterMs > 0 && blocked.retryAfterMs <= FAILURE_WINDOW_MS);
  assert.ok((await auth.login({ username: 'ops', password: PW, ip: 'c' })).token, 'another address is unaffected');
  t += FAILURE_WINDOW_MS;
  assert.ok((await auth.login({ username: 'ops', password: PW, ip: 'b' })).token, 'after the window');
});

test('changing credentials needs the current password and signs every other session out', { skip }, async () => {
  const auth = await fresh();
  const mine = await auth.enable({ username: 'ops', password: PW, confirm: PW });
  const other = await auth.login({ username: 'ops', password: PW });
  assert.deepEqual(await auth.change({ current: 'not it at all', username: 'ops2', password: 'new password 1', confirm: 'new password 1' }), { error: 'current' });
  assert.deepEqual(await auth.change({ current: PW, password: 'new password 1', confirm: 'different one' }), { error: 'password-mismatch' });
  const changed = await auth.change({ current: PW, username: 'ops2', password: 'new password 1', confirm: 'new password 1' });
  assert.equal(await auth.sessionUser(changed.token), 'ops2', 'the browser that changed it stays signed in');
  assert.equal(await auth.sessionUser(mine.token), null);
  assert.equal(await auth.sessionUser(other.token), null);
  assert.equal((await auth.login({ username: 'ops2', password: PW })).error, 'invalid', 'the old password is gone');
  assert.ok((await auth.login({ username: 'ops2', password: 'new password 1' })).token);
});

test('sign out everywhere ends every session; logging out ends one', { skip }, async () => {
  const auth = await fresh();
  const a = await auth.enable({ username: 'ops', password: PW, confirm: PW });
  const b = await auth.login({ username: 'ops', password: PW });
  await auth.logout(b.token);
  assert.equal(await auth.sessionUser(b.token), null);
  assert.equal(await auth.sessionUser(a.token), 'ops');
  assert.deepEqual(await auth.signOutEverywhere({ current: 'wrong wrong wrong' }), { error: 'current' });
  assert.deepEqual(await auth.signOutEverywhere({ current: PW }), { ok: true });
  assert.equal(await auth.sessionUser(a.token), null);
});

test('turning sign-in off needs the password, and a session from before can never come back', { skip }, async () => {
  const auth = await fresh();
  const before = await auth.enable({ username: 'ops', password: PW, confirm: PW });
  assert.deepEqual(await auth.disable({ current: 'wrong wrong wrong' }), { error: 'current' });
  assert.deepEqual(await auth.disable({ current: PW }), { ok: true });
  assert.deepEqual(await auth.status(), { enabled: false, username: null });
  await auth.enable({ username: 'ops', password: PW, confirm: PW });
  assert.equal(await auth.sessionUser(before.token), null, 'same name, same password - still a dead session');
});

test('guessing the current password on the settings actions is rate-limited too', { skip }, async () => {
  const auth = await fresh();
  await auth.enable({ username: 'ops', password: PW, confirm: PW });
  for (let i = 0; i < MAX_FAILURES; i++) await auth.disable({ current: 'guess guess guess', ip: 'd' });
  assert.equal((await auth.disable({ current: PW, ip: 'd' })).error, 'rate');
  assert.deepEqual(await auth.status(), { enabled: true, username: 'ops' });
});
