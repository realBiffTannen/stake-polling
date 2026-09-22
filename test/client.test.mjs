import { test, after } from 'node:test';
import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { ApiClient } from '../src/api/client.mjs';

const SID = 'ZJbA6-test-sid-value-not-the-real-one==';

/** Spin up a stub API. `handler(req, res, hits)` decides each response. */
async function stub(handler) {
  let hits = 0;
  const server = createServer((req, res) => handler(req, res, ++hits));
  await new Promise((r) => server.listen(0, '127.0.0.1', r));
  const { port } = server.address();
  return {
    url: `http://127.0.0.1:${port}/api`,
    hits: () => hits,
    close: () => new Promise((r) => server.close(r)),
  };
}

const json = (res, code, body) => {
  res.writeHead(code, { 'content-type': 'application/json' });
  res.end(JSON.stringify(body));
};

test('sends the sid as a cookie and parses the roster', async () => {
  let cookie = null;
  const s = await stub((req, res) => {
    cookie = req.headers.cookie;
    json(res, 200, { games: [{ name: 'pixel-geyser', turnover: 412880 }] });
  });
  after(() => s.close());

  const api = new ApiClient({ apiUrl: s.url, team: 'acme-studios', sid: SID, timeoutMs: 2000 });
  const out = await api.teamStats();

  assert.equal(cookie, `sid=${SID}`);
  assert.equal(out.ok, true);
  assert.equal(out.data.games[0].name, 'pixel-geyser');
});

test('builds the documented paths', async () => {
  const seen = [];
  const s = await stub((req, res) => { seen.push(req.url); json(res, 200, {}); });
  after(() => s.close());

  const api = new ApiClient({ apiUrl: s.url, team: 'acme-studios', sid: SID, timeoutMs: 2000 });
  await api.teamStats();
  await api.teamGames();
  await api.gameStats('pixel-geyser');
  await api.graph();
  await api.teamStats({ start: '2026-07-24', end: '2026-09-15' });

  assert.deepEqual(seen, [
    '/api/teams/acme-studios/stats',
    '/api/teams/acme-studios/games',
    '/api/teams/acme-studios/games/pixel-geyser/stats',
    '/api/teams/acme-studios/graph',
    `/api/teams/acme-studios/stats?start=${Math.floor(Date.parse('2026-07-24T00:00:00.000Z') / 1000)}&end=${Math.floor(Date.parse('2026-09-15T00:00:00.000Z') / 1000)}`,
  ]);
});

test('a 401 resolves with code AUTH and is not retried', async () => {
  const s = await stub((req, res) => json(res, 401, { error: 'unauthorized' }));
  after(() => s.close());

  const api = new ApiClient({ apiUrl: s.url, team: 'acme-studios', sid: SID, timeoutMs: 2000 });
  const out = await api.teamGames();

  assert.equal(out.ok, false);
  assert.equal(out.status, 401);
  assert.equal(out.error.code, 'AUTH');
  assert.equal(s.hits(), 1, 'an expired sid must not be retried');
});

test('a 500 is retried once and then succeeds', async () => {
  const s = await stub((req, res, hits) => (hits === 1 ? json(res, 500, { error: 'boom' }) : json(res, 200, { ok: 1 })));
  after(() => s.close());

  const api = new ApiClient({ apiUrl: s.url, team: 'acme-studios', sid: SID, timeoutMs: 2000, retryDelayMs: 1 });
  const out = await api.teamGames();

  assert.equal(out.ok, true);
  assert.equal(s.hits(), 2);
});

test('a timeout resolves rather than throwing', async () => {
  const s = await stub(() => { /* never responds */ });
  after(() => s.close());

  const api = new ApiClient({ apiUrl: s.url, team: 'acme-studios', sid: SID, timeoutMs: 60, retryDelayMs: 1 });
  const out = await api.teamGames();

  assert.equal(out.ok, false);
  assert.equal(out.error.code, 'NETWORK');
});

test('the sid never appears in a result, however the request failed', async () => {
  const s = await stub((req, res) => json(res, 500, { error: `context included ${SID}` }));
  after(() => s.close());

  const api = new ApiClient({ apiUrl: s.url, team: 'acme-studios', sid: SID, timeoutMs: 2000, retryDelayMs: 1 });
  const out = await api.teamGames();

  assert.equal(out.ok, false);
  assert.ok(!JSON.stringify(out.error).includes(SID), 'the sid leaked into the error');
});

test('setSid swaps the credential without rebuilding the client', async () => {
  const cookies = [];
  const s = await stub((req, res) => { cookies.push(req.headers.cookie); json(res, 200, {}); });
  after(() => s.close());

  const api = new ApiClient({ apiUrl: s.url, team: 'acme-studios', sid: SID, timeoutMs: 2000 });
  await api.teamGames();
  api.setSid('a-new-sid');
  await api.teamGames();

  assert.deepEqual(cookies, [`sid=${SID}`, 'sid=a-new-sid']);
});

test('non-JSON body is reported as a PARSE failure, not a crash', async () => {
  const s = await stub((req, res) => { res.writeHead(200, { 'content-type': 'text/html' }); res.end('<html>login</html>'); });
  after(() => s.close());

  const api = new ApiClient({ apiUrl: s.url, team: 'acme-studios', sid: SID, timeoutMs: 2000, retryDelayMs: 1 });
  const out = await api.teamGames();

  assert.equal(out.ok, false);
  assert.equal(out.error.code, 'PARSE');
});

test('the windowed roster query is sent as epoch seconds', async () => {
  // ISO dates return 400 and epoch milliseconds return 500 from the real API;
  // seconds is the only format it accepts.
  const seen = [];
  const s = await stub((req, res) => { seen.push(req.url); json(res, 200, []); });
  after(() => s.close());

  const api = new ApiClient({ apiUrl: s.url, team: 'acme-studios', sid: SID, timeoutMs: 2000 });
  await api.teamStats({ start: '2026-07-24', end: 1789525020000 });

  const query = new URL(`http://x${seen[0]}`).searchParams;
  assert.equal(query.get('start'), String(Math.floor(Date.parse('2026-07-24T00:00:00.000Z') / 1000)));
  assert.equal(query.get('end'), String(Math.floor(1789525020000 / 1000)));
});

test('the balance endpoint is available', async () => {
  const seen = [];
  const s = await stub((req, res) => { seen.push(req.url); json(res, 200, { position: -1, expectedProfit: -2, carry: -3 }); });
  after(() => s.close());

  const api = new ApiClient({ apiUrl: s.url, team: 'acme-studios', sid: SID, timeoutMs: 2000 });
  const out = await api.balance();

  assert.equal(seen[0], '/api/teams/acme-studios/balance');
  assert.equal(out.data.position, -1);
});

test('game stats are requested by slug without over-encoding it', async () => {
  const seen = [];
  const s = await stub((req, res) => { seen.push(req.url); json(res, 200, {}); });
  after(() => s.close());

  const api = new ApiClient({ apiUrl: s.url, team: 'acme-studios', sid: SID, timeoutMs: 2000 });
  await api.gameStats('pixel-nest');

  assert.equal(seen[0], '/api/teams/acme-studios/games/pixel-nest/stats');
});
