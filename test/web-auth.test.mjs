import { test, after } from 'node:test';
import assert from 'node:assert/strict';
import { createWebServer } from '../src/web/server.mjs';
import { buildInsights } from '../src/insights/model.mjs';
import { createAuth } from '../src/web/auth.mjs';
import { connect } from '../src/store/redis.mjs';
import { keys } from '../src/store/keys.mjs';

const DB = 5;
const k = keys('web-auth-test-team');
let client = null;
let skip = false;
try { client = await connect('redis://127.0.0.1:6379', { database: DB }); } catch { skip = 'redis unreachable on 127.0.0.1:6379'; }
after(async () => { if (client) { await client.flushDb(); await client.quit(); } });

const now = Date.parse('2026-09-23T08:00:00Z');
const PW = 'correct horse battery';
const snapshot = { trackingStart: '2026-07-24', days: {}, cumulative: {} };

async function setup(t) {
  await client.flushDb();
  const auth = createAuth({ client, k });
  const dismissals = { list: () => client.sMembers(k.dismissed), add: (key) => client.sAdd(k.dismissed, key), clear: () => client.del(k.dismissed) };
  const server = createWebServer({ auth, dismissals, read: async (query) => ({ model: buildInsights({ snapshot, now, query }),
    state: { now, meta: { team: 'acme-studios' }, rows: [{ name: 'berry', label: 'Berry' }], ageMs: 1000, lastOk: now - 1000, pollMinutes: 2.5 } }),
    exporter: async () => ({ filename: 'x.csv', chunks: ['a,b\r\n'] }) });
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
  t.after(() => new Promise((resolve) => { server.close(resolve); server.closeAllConnections(); }));
  const base = `http://127.0.0.1:${server.address().port}`;
  const jar = {};
  const remember = (res) => { for (const c of res.headers.getSetCookie()) { const [pair] = c.split(';'); const [n, v] = pair.split('='); if (/Max-Age=0/.test(c)) delete jar[n]; else jar[n] = v; } return res; };
  const cookieHeader = () => Object.entries(jar).map(([n, v]) => `${n}=${v}`).join('; ');
  const get = async (path, headers = {}) => remember(await fetch(base + path, { redirect: 'manual', headers: { cookie: cookieHeader(), ...headers } }));
  const post = async (path, fields, headers = {}) => remember(await fetch(base + path, { method: 'POST', redirect: 'manual',
    headers: { 'content-type': 'application/x-www-form-urlencoded', origin: base, cookie: cookieHeader(), ...headers },
    body: new URLSearchParams({ csrf: decodeURIComponent(jar.sp_csrf ?? ''), ...fields }) }));
  return { base, auth, jar, get, post };
}

test('with sign-in off, pages are open, the header says so, and every page hands out a strict CSRF cookie', { skip }, async (t) => {
  const { get } = await setup(t);
  const res = await get('/insights');
  assert.equal(res.status, 200);
  const body = await res.text();
  assert.match(body, /class="signin-off" href="\/settings\?tab=security"/);
  const csrf = res.headers.getSetCookie().find((c) => c.startsWith('sp_csrf='));
  assert.match(csrf, /HttpOnly/);
  assert.match(csrf, /SameSite=Strict/);
  assert.match(csrf, /Path=\//);
  assert.equal((await get('/login')).headers.get('location'), '/', 'nothing to sign in to');
  assert.equal((await get('/settings')).status, 200);
});

test('turning sign-in on needs this page\'s CSRF token and this origin - another site cannot lock the owner out', { skip }, async (t) => {
  const { get, post, auth, jar } = await setup(t);
  await get('/settings');
  const fields = { action: 'enable', username: 'ops', password: PW, confirm: PW };
  assert.match((await post('/settings/auth', { ...fields, csrf: 'forged-forged-forged' })).headers.get('location'), /error=csrf/);
  assert.match((await post('/settings/auth', fields, { origin: 'http://evil.example' })).headers.get('location'), /error=csrf/);
  assert.match((await post('/settings/auth', fields, { origin: 'null' })).headers.get('location'), /error=csrf/);
  const saved = jar.sp_csrf; delete jar.sp_csrf;
  assert.match((await post('/settings/auth', { ...fields, csrf: decodeURIComponent(saved) })).headers.get('location'), /error=csrf/, 'no cookie, no entry');
  assert.deepEqual(await auth.status(), { enabled: false, username: null });
});

test('turning sign-in on signs this browser in; everything but health and static files then needs a session', { skip }, async (t) => {
  const { get, post, jar, base } = await setup(t);
  await get('/settings');
  const on = await post('/settings/auth', { action: 'enable', username: 'ops', password: PW, confirm: PW });
  assert.equal(on.headers.get('location'), '/settings?tab=security&ok=enabled');
  const session = on.headers.getSetCookie().find((c) => c.startsWith('sp_session='));
  assert.match(session, /HttpOnly/); assert.match(session, /SameSite=Strict/);
  assert.doesNotMatch(session, /Max-Age/, 'a browser-session cookie unless kept');
  assert.match(await (await get('/insights')).text(), /class="account"[\s\S]*Signed in as <b>ops<\/b>/);

  const anon = async (path) => fetch(base + path, { redirect: 'manual' });
  assert.equal((await anon('/insights?game=berry')).headers.get('location'), '/login?next=%2Finsights%3Fgame%3Dberry');
  assert.equal((await anon('/insights?fragment=1')).status, 401, 'a live refresh is refused, not redirected');
  assert.equal((await anon('/export/log.csv')).status, 401);
  assert.equal((await anon('/export.csv')).status, 401);
  assert.equal((await anon('/archive/file/stake-all-2026-09-22.csv.gz')).status, 401);
  assert.equal((await anon('/settings')).status, 303);
  assert.equal((await anon('/healthz')).status, 200, 'monitors still see health');
  assert.equal((await anon('/app.css')).status, 200, 'the sign-in page needs its stylesheet');
  assert.equal((await anon('/login')).status, 200);
  assert.ok(jar.sp_session);
});

test('signing in: wrong answers go back with an error, the right one lands where it was going, never on another host', { skip }, async (t) => {
  const { auth, base } = await setup(t);
  await auth.enable({ username: 'ops', password: PW, confirm: PW });
  const browser = async () => { const res = await fetch(base + '/login?next=%2Ftrends', { redirect: 'manual' }); return res.headers.getSetCookie()[0].split(';')[0]; };
  const csrfCookie = await browser();
  const csrf = decodeURIComponent(csrfCookie.split('=')[1]);
  const signIn = (fields) => fetch(base + '/login', { method: 'POST', redirect: 'manual', headers: { 'content-type': 'application/x-www-form-urlencoded', origin: base, cookie: csrfCookie },
    body: new URLSearchParams({ csrf, ...fields }) });
  assert.equal((await signIn({ username: 'ops', password: 'wrong wrong wrong', next: '/trends' })).headers.get('location'), '/login?error=invalid&next=%2Ftrends');
  const ok = await signIn({ username: 'ops', password: PW, next: '/trends', keep: '1' });
  assert.equal(ok.headers.get('location'), '/trends');
  assert.match(ok.headers.getSetCookie().find((c) => c.startsWith('sp_session=')), /Max-Age=2592000/, 'kept for 30 days');
  for (const next of ['//evil.example/x', 'https://evil.example', '/\\evil.example', 'javascript:alert(1)', '/login']) {
    assert.equal((await signIn({ username: 'ops', password: PW, next })).headers.get('location'), '/', next);
  }
  const login = await (await fetch(base + '/login?error=invalid&next=%22%3E%3Cscript%3E', { headers: { cookie: csrfCookie } })).text();
  assert.match(login, /That username and password do not match/);
  assert.doesNotMatch(login, /<script>/, 'next is escaped and made safe');
});

test('signing out ends the session; changing the password ends every other one', { skip }, async (t) => {
  const { get, post, jar, base, auth } = await setup(t);
  await get('/settings');
  await post('/settings/auth', { action: 'enable', username: 'ops', password: PW, confirm: PW });
  const first = jar.sp_session;
  const other = (await auth.login({ username: 'ops', password: PW })).token;
  const changed = await post('/settings/auth', { action: 'change', username: 'ops', password: 'new password 12', confirm: 'new password 12', current: PW });
  assert.equal(changed.headers.get('location'), '/settings?tab=security&ok=changed');
  assert.notEqual(jar.sp_session, first, 'this browser got a new session');
  assert.equal((await fetch(base + '/insights', { redirect: 'manual', headers: { cookie: `sp_session=${other}` } })).status, 303, 'the other session is over');
  assert.equal((await get('/insights')).status, 200);
  const out = await post('/logout', {});
  assert.equal(out.headers.get('location'), '/login');
  assert.ok(!jar.sp_session, 'the cookie is cleared');
  assert.equal((await get('/insights')).status, 303);
});

test('turning sign-in off needs the current password, and opens the dashboard again', { skip }, async (t) => {
  const { get, post, auth } = await setup(t);
  await get('/settings');
  await post('/settings/auth', { action: 'enable', username: 'ops', password: PW, confirm: PW });
  assert.equal((await post('/settings/auth', { action: 'disable', current: 'wrong wrong wrong' })).headers.get('location'), '/settings?tab=security&error=current&form=disable');
  assert.equal((await auth.status()).enabled, true);
  assert.equal((await post('/settings/auth', { action: 'disable', current: PW })).headers.get('location'), '/settings?tab=security&ok=disabled');
  assert.equal((await auth.status()).enabled, false);
  assert.equal((await get('/insights')).status, 200);
});

test('only the sign-in routes take a POST, and a form body is bounded', { skip }, async (t) => {
  const { base, get, jar } = await setup(t);
  await get('/settings');
  for (const path of ['/', '/analysis', '/settings', '/export/log.csv']) assert.equal((await fetch(base + path, { method: 'POST' })).status, 405, path);
  const big = await fetch(base + '/settings/auth', { method: 'POST', headers: { 'content-type': 'application/x-www-form-urlencoded', cookie: `sp_csrf=${jar.sp_csrf}` }, body: 'a='.padEnd(20_000, 'x') });
  assert.equal(big.status, 400);
  const json = await fetch(base + '/settings/auth', { method: 'POST', headers: { 'content-type': 'application/json' }, body: '{}' });
  assert.equal(json.status, 400);
});

test('with Redis unreadable the sign-in check fails closed', async (t) => {
  const auth = { status: async () => { throw new Error('ECONNREFUSED'); }, sessionUser: async () => null };
  const server = createWebServer({ auth, read: async () => { throw new Error('unreachable'); } });
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
  t.after(() => new Promise((resolve) => { server.close(resolve); server.closeAllConnections(); }));
  const base = `http://127.0.0.1:${server.address().port}`;
  assert.equal((await fetch(base + '/analysis')).status, 503);
  assert.equal((await fetch(base + '/app.css')).status, 200, 'static files never depend on it');
});

test('a warning is dismissed for everyone only with this page\'s token, and while sign-in is on only by someone signed in', { skip }, async (t) => {
  const { get, post, base, auth } = await setup(t);
  await get('/insights');
  const key = 'math-drift:0123456789ab';
  assert.equal((await post('/dismiss', { key, back: '/math' })).headers.get('location'), '/math');
  assert.deepEqual(await client.sMembers(k.dismissed), [key]);
  const quiet = await post('/dismiss', { key: 'math-uncaptured:0123456789ab' }, { accept: 'application/json' });
  assert.equal(quiet.status, 204, 'the in-place path gets no redirect');
  assert.equal((await post('/dismiss', { key, csrf: 'forged-forged-forged' })).status, 403);
  assert.equal((await post('/dismiss', { key: 'bogus key <script>' })).status, 400);
  assert.equal((await post('/dismiss', { restore: 'all', back: '/settings?tab=system' })).headers.get('location'), '/settings?tab=system');
  assert.deepEqual(await client.sMembers(k.dismissed), [], 'shown again for everyone');
  await auth.enable({ username: 'ops', password: PW, confirm: PW });
  const anon = await fetch(base + '/dismiss', { method: 'POST', redirect: 'manual', headers: { 'content-type': 'application/x-www-form-urlencoded', origin: base }, body: new URLSearchParams({ key }) });
  assert.equal(anon.status, 401);
});

test('the referrer policy lets a same-origin form POST carry its origin, and still sends nothing to other sites', async (t) => {
  // Under "no-referrer" browsers send "Origin: null" on form submissions,
  // which the CSRF check refuses - every real sign-in form would fail.
  const server = createWebServer({ read: async () => ({ model: buildInsights({ snapshot, now, query: new URLSearchParams() }), state: { now, meta: {}, rows: [], ageMs: 1 } }) });
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
  t.after(() => new Promise((resolve) => { server.close(resolve); server.closeAllConnections(); }));
  const res = await fetch(`http://127.0.0.1:${server.address().port}/insights`);
  assert.equal(res.headers.get('referrer-policy'), 'same-origin');
});
