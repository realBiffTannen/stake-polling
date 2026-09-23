/**
 * Optional sign-in for the dashboard: one username and password, off until
 * someone turns it on from Settings.
 *
 * What is stored, in Redis next to everything else:
 *   k.auth                     { username, salt, hash, scrypt params, version }
 *                              - never the password, only its scrypt hash
 *   k.session(sha256(token))   { username, version } with a TTL - never the
 *                              token itself, so a Redis dump cannot be replayed
 *                              as a cookie
 *
 * `version` comes from k.authEpoch, a counter that only ever goes up (INCR,
 * never deleted). It moves whenever the credentials change, sign-in is turned
 * off, or everyone is signed out, and every session carries the version it
 * was issued under - so those end every other session at once, and a session
 * from before sign-in was last turned off can never come back to life when it
 * is turned on again.
 *
 * Recovery from a forgotten password is `npm run auth -- disable` on the
 * machine itself (scripts/auth.mjs): whoever holds the shell holds Redis
 * anyway.
 */

import { randomBytes, scrypt as scryptCb, timingSafeEqual, createHash } from 'node:crypto';
import { promisify } from 'node:util';

const scrypt = promisify(scryptCb);

export const PASSWORD_MIN = 10;
export const PASSWORD_MAX = 1024;
export const USERNAME_RE = /^[A-Za-z0-9._@-]{1,64}$/;
// A browser session unless "keep me signed in" was ticked.
export const SESSION_SHORT_S = 12 * 3600;
export const SESSION_LONG_S = 30 * 86400;
// Failed sign-ins allowed per address before it waits out the window.
export const MAX_FAILURES = 5;
export const FAILURE_WINDOW_MS = 15 * 60_000;

const SCRYPT = { N: 16384, r: 8, p: 1, keylen: 64 };
const sha256 = (s) => createHash('sha256').update(String(s)).digest('hex');

export async function hashPassword(password, params = SCRYPT) {
  const salt = randomBytes(16).toString('hex');
  const hash = await scrypt(String(password).normalize('NFKC'), salt, params.keylen, { N: params.N, r: params.r, p: params.p, maxmem: 64 * 1024 * 1024 });
  return { salt, hash: hash.toString('hex'), ...params };
}

export async function verifyPassword(password, record) {
  if (!record?.salt || !record?.hash) return false;
  const expected = Buffer.from(record.hash, 'hex');
  const actual = await scrypt(String(password).normalize('NFKC'), record.salt, expected.length,
    { N: record.N, r: record.r, p: record.p, maxmem: 64 * 1024 * 1024 });
  return actual.length === expected.length && timingSafeEqual(actual, expected);
}

/** Why a username/password pair cannot be used, or null when it can. */
export function credentialProblem({ username, password, confirm }) {
  if (!USERNAME_RE.test(String(username ?? ''))) return 'username';
  const p = String(password ?? '');
  if (p.length < PASSWORD_MIN) return 'password-short';
  if (p.length > PASSWORD_MAX) return 'password-long';
  if (confirm !== undefined && p !== String(confirm)) return 'password-mismatch';
  return null;
}

/**
 * @param {{ client: object, k: object, now?: () => number }} opts
 */
export function createAuth({ client, k, now = Date.now }) {
  // Checked against when the username is unknown, so a wrong name costs as
  // long as a wrong password and the timing does not say which it was.
  const decoy = hashPassword(randomBytes(16).toString('hex'));
  const failures = new Map();

  async function record() {
    const raw = await client.get(k.auth);
    if (!raw) return null;
    try { return JSON.parse(raw); } catch { return null; }
  }

  async function issue(rec, keep) {
    const token = randomBytes(32).toString('base64url');
    const ttl = keep ? SESSION_LONG_S : SESSION_SHORT_S;
    await client.set(k.session(sha256(token)), JSON.stringify({ username: rec.username, version: rec.version, at: now() }), { expiration: { type: 'EX', value: ttl } });
    return { token, maxAge: keep ? ttl : null };
  }

  const nextVersion = () => client.incr(k.authEpoch);

  async function store({ username, password }) {
    const rec = { username, ...(await hashPassword(password)), version: await nextVersion(), updatedAt: now() };
    await client.set(k.auth, JSON.stringify(rec));
    return rec;
  }

  function limited(ip) {
    const f = failures.get(ip);
    if (!f) return 0;
    if (now() >= f.until) { failures.delete(ip); return 0; }
    return f.count >= MAX_FAILURES ? f.until - now() : 0;
  }

  function fail(ip) {
    const f = failures.get(ip);
    if (!f || now() >= f.until) failures.set(ip, { count: 1, until: now() + FAILURE_WINDOW_MS });
    else f.count++;
    // Bounded: a flood of addresses must not grow this without limit.
    if (failures.size > 10_000) failures.delete(failures.keys().next().value);
  }

  // The current password, checked under the same per-address limit as
  // signing in: a borrowed session must not become a way to guess it.
  async function proven(rec, current, ip) {
    const wait = limited(ip);
    if (wait) return { error: 'rate', retryAfterMs: wait };
    if (await verifyPassword(current, rec)) { failures.delete(ip); return null; }
    fail(ip);
    return { error: 'current' };
  }

  return {
    async status() {
      const rec = await record();
      return rec ? { enabled: true, username: rec.username } : { enabled: false, username: null };
    },

    /** The signed-in username for a session token, or null. */
    async sessionUser(token) {
      if (!token || typeof token !== 'string' || token.length > 200) return null;
      const [raw, rec] = await Promise.all([client.get(k.session(sha256(token))), record()]);
      if (!raw || !rec) return null;
      let s;
      try { s = JSON.parse(raw); } catch { return null; }
      return s.username === rec.username && s.version === rec.version ? s.username : null;
    },

    /** { token, maxAge } on success; { error: 'invalid' } or { error: 'rate', retryAfterMs }. */
    async login({ username, password, keep = false, ip = '?' }) {
      const wait = limited(ip);
      if (wait) return { error: 'rate', retryAfterMs: wait };
      const rec = await record();
      const match = rec && String(username) === rec.username;
      const ok = await verifyPassword(password, match ? rec : await decoy);
      if (!match || !ok) { fail(ip); return { error: 'invalid' }; }
      failures.delete(ip);
      return issue(rec, keep);
    },

    async logout(token) {
      if (token && typeof token === 'string') await client.del(k.session(sha256(token)));
    },

    /** Turn sign-in on. Refused if it is already on. Returns a session for the browser that did it. */
    async enable({ username, password, confirm }) {
      if (await record()) return { error: 'already-on' };
      const problem = credentialProblem({ username, password, confirm });
      if (problem) return { error: problem };
      const rec = await store({ username, password });
      return issue(rec, false);
    },

    /** New username and/or password, proven with the current one. Ends every other session. */
    async change({ current, username, password, confirm, keep = false, ip = '?' }) {
      const rec = await record();
      if (!rec) return { error: 'not-on' };
      const denied = await proven(rec, current, ip);
      if (denied) return denied;
      const next = { username: username || rec.username, password: password || current, confirm: password ? confirm : undefined };
      const problem = credentialProblem(next);
      if (problem) return { error: problem };
      const updated = await store(next);
      return issue(updated, keep);
    },

    /** Sign every session out, this one included, keeping the credentials. */
    async signOutEverywhere({ current, ip = '?' }) {
      const rec = await record();
      if (!rec) return { error: 'not-on' };
      const denied = await proven(rec, current, ip);
      if (denied) return denied;
      await client.set(k.auth, JSON.stringify({ ...rec, version: await nextVersion(), updatedAt: now() }));
      return { ok: true };
    },

    /** Turn sign-in off, proven with the current password. */
    async disable({ current, ip = '?' }) {
      const rec = await record();
      if (!rec) return { ok: true };
      const denied = await proven(rec, current, ip);
      if (denied) return denied;
      await client.del(k.auth);
      await nextVersion();
      return { ok: true };
    },
  };
}
