import { test, beforeEach, after } from 'node:test';
import assert from 'node:assert/strict';
import { Poller } from '../src/poll/poller.mjs';
import { AlertGate } from '../src/detect/alerts.mjs';
import { connect } from '../src/store/redis.mjs';
import { readDashboard } from '../src/store/reader.mjs';
import { keys } from '../src/store/keys.mjs';
import { loadConfig } from '../src/config.mjs';

// The studio a test runs as. Tests never read the developer's own
// config.local.json (`local: null`), so they pass the same on a fresh clone.
const TEST_ENV = { STAKE_TEAM: 'acme-studios', STAKE_LIFETIME_START: '2026-07-24' };

const SID = 'a-live-sid-value-that-must-not-be-persisted';
const k = keys('test-poll-team');
const config = { ...loadConfig({ env: TEST_ENV, local: null }), team: 'test-poll-team' };

let client = null;
let skip = false;
try {
  client = await connect('redis://127.0.0.1:6379', { database: 13 });
} catch {
  skip = 'redis unreachable on 127.0.0.1:6379 - start redis-server to run the poller tests';
}
beforeEach(async () => { if (client) await client.flushDb(); });
after(async () => { if (client) await client.quit(); });

// The live shape: an array, metrics nested under `stats`, keyed by slug.
const roster = [
  { name: 'Pixel Geyser', slug: 'pixel-geyser', stats: { count: 1204, turnover: 412880, profit: 12410, unique: 88, expectedProfit: 12000 } },
  { name: 'Pixel Carnivals', slug: 'pixel-carnivals', stats: { count: 980, turnover: 301004, profit: 9120, unique: 61, expectedProfit: 9000 } },
];

const catalogue = [
  { name: 'Pixel Geyser', slug: 'pixel-geyser', onlinePlayers: 200, stats: { month: { turnover: 412880, profit: 12410 }, day: { turnover: 40000, profit: 900 } } },
  { name: 'Pixel Carnivals', slug: 'pixel-carnivals', onlinePlayers: 141, stats: { month: { turnover: 301004, profit: 9120 }, day: { turnover: 20000, profit: 400 } } },
];

const okResult = (data, endpoint = '/stub') => ({ ok: true, status: 200, data, endpoint, error: null });
const failResult = (code, endpoint = '/stub') => ({ ok: false, status: code === 'AUTH' ? 401 : 500, data: null, endpoint, error: { code, message: `${endpoint} failed` } });

const stubApi = (over = {}) => ({
  teamStats: async () => okResult(roster, '/teams/test-poll-team/stats'),
  teamGames: async () => okResult(catalogue, '/teams/test-poll-team/games'),
  gameStats: async (g) => okResult({
    slug: g,
    stats: [
      { mode: 'BASE', rtp: 0.965, count: 900, turnover: 300000, profit: 9000 },
      { mode: 'FREE_SPINS', rtp: 0.967, count: 12, turnover: 112880, profit: 3410 },
    ],
  }, `/teams/test-poll-team/games/${g}/stats`),
  graph: async () => okResult({ profit: [], turnover: [], count: [] }, '/teams/test-poll-team/graph'),
  balance: async () => okResult({ position: -4474893261, expectedProfit: -1026457000, carry: -2184064350 }, '/teams/test-poll-team/balance'),
  setSid() {},
  ...over,
});

const makePoller = (api) => new Poller({ api, client, keys: k, config, gate: new AlertGate(config.detect) });

test('one tick writes every snapshot, appends one sample per game, and publishes', { skip }, async () => {
  const result = await makePoller(stubApi()).tick(1758000000000, 0);

  assert.equal(result.ok, true);
  assert.deepEqual(result.failures, []);
  assert.equal(await client.exists(k.roster), 1);
  assert.equal(await client.exists(k.games), 1);
  assert.equal(await client.exists(k.graph), 1);
  assert.equal(await client.exists(k.game('pixel-geyser')), 1);
  assert.equal(await client.exists(k.balance), 1);
  assert.equal(await client.xLen(k.tsGame('pixel-geyser')), 1);
  assert.equal(await client.xLen(k.tsGame('pixel-carnivals')), 1);
  assert.equal(await client.xLen(k.tsOnline), 1);
  assert.equal(await client.xLen(k.tsTeam), 1);
});

test('per-game samples carry the metrics the detector needs', { skip }, async () => {
  await makePoller(stubApi()).tick(1758000000000, 0);
  const row = (await client.xRange(k.tsGame('pixel-geyser'), '-', '+'))[0].message;
  assert.equal(row.turnover, '412880');
  assert.equal(row.count, '1204');
  assert.equal(row.profit, '12410');
  assert.equal(row.unique, '88');
  assert.equal(row.onlinePlayers, '200', 'per-game concurrency comes from the catalogue');
});

test('the graph and lifetime endpoints are skipped on ticks where they are not due', { skip }, async () => {
  let graphCalls = 0;
  const api = stubApi({ graph: async () => { graphCalls++; return okResult({ days: [] }); } });
  const poller = makePoller(api);
  await poller.tick(1758000000000, 0);
  await poller.tick(1758000060000, 1);
  await poller.tick(1758000120000, 2);
  assert.equal(graphCalls, 1, 'graph is configured for every 5th tick');
});

test('a partial failure keeps the previous snapshot and bumps consecutive_failures', { skip }, async () => {
  const poller = makePoller(stubApi());
  await poller.tick(1758000000000, 0);

  poller.api = stubApi({ gameStats: async () => failResult('SERVER') });
  const result = await poller.tick(1758000060000, 1);

  assert.equal(result.ok, false);
  assert.ok(result.failures.length > 0);
  const dash = await readDashboard(client, k);
  assert.equal(dash.perGame['pixel-geyser'].data.stats[0].mode, 'BASE', 'the last good per-mode snapshot survives');
  assert.equal(dash.meta.consecutive_failures, '1');
  assert.equal(await client.xLen(k.tsGame('pixel-geyser')), 2, 'the roster still produced a sample');
});

test('a clean tick resets consecutive_failures', { skip }, async () => {
  const poller = makePoller(stubApi({ gameStats: async () => failResult('SERVER') }));
  await poller.tick(1758000000000, 0);
  poller.api = stubApi();
  await poller.tick(1758000060000, 1);
  const dash = await readDashboard(client, k);
  assert.equal(dash.meta.consecutive_failures, '0');
});

test('an AUTH failure pauses polling and sets auth_state=expired', { skip }, async () => {
  const result = await makePoller(stubApi({ teamStats: async () => failResult('AUTH') })).tick(1758000000000, 0);

  assert.equal(result.authExpired, true);
  assert.equal(result.ok, false);
  const dash = await readDashboard(client, k);
  assert.equal(dash.meta.auth_state, 'expired');
  assert.equal(await client.xLen(k.tsGame('pixel-geyser')), 0, 'no samples are invented while unauthenticated');
  assert.ok(dash.alerts.some((a) => a.kind === 'auth'));
});

test('a detected anomaly is written to the alert stream', { skip }, async () => {
  const poller = makePoller(stubApi());
  // 70 steady minutes, then one minute at forty times the rate.
  const USD = 1_000_000;
  for (let i = 0; i < 70; i++) {
    roster[0].stats.turnover = 1000 * USD * (i + 1);
    roster[0].stats.count = 10 * (i + 1);
    await poller.tick(1758000000000 + i * 60000, i);
  }
  roster[0].stats.turnover += 40000 * USD;
  roster[0].stats.count += 20;
  await poller.tick(1758000000000 + 70 * 60000, 70);

  const dash = await readDashboard(client, k);
  assert.ok(dash.alerts.some((a) => a.kind === 'spike' && a.game === 'pixel-geyser'), `expected a spike, got ${JSON.stringify(dash.alerts)}`);
});

test('the sid is absent from every value written to redis', { skip }, async () => {
  const poller = new Poller({ api: stubApi(), client, keys: k, config, gate: new AlertGate(config.detect), sid: SID });
  await poller.tick(1758000000000, 0);

  const allKeys = await client.keys('stake:test-poll-team:*');
  for (const key of allKeys) {
    const type = await client.type(key);
    const dump = type === 'stream'
      ? JSON.stringify(await client.xRange(key, '-', '+'))
      : type === 'hash'
        ? JSON.stringify(await client.hGetAll(key))
        : JSON.stringify(await client.get(key));
    assert.ok(!dump.includes(SID), `the sid leaked into ${key}`);
  }
});

test('each tick reports the per-minute delta for bets, turnover and profit', { skip }, async () => {
  const USD = 1_000_000;
  const poller = makePoller(stubApi());

  roster[0].stats.turnover = 1000 * USD;
  roster[0].stats.profit = 30 * USD;
  roster[0].stats.count = 10;
  const first = await poller.tick(1758000000000, 0);
  assert.equal(first.deltas, null, 'the first tick has nothing to compare against');

  roster[0].stats.turnover = 1046 * USD;
  roster[0].stats.profit = 34.6 * USD;
  roster[0].stats.count = 36;
  const second = await poller.tick(1758000060000, 1);

  assert.equal(second.deltas.turnover, 46 * USD);
  assert.equal(Math.round(second.deltas.profit), Math.round(4.6 * USD));
  assert.equal(second.deltas.count, 26);
});

test('the tick delta sums the whole roster, not just one game', { skip }, async () => {
  const USD = 1_000_000;
  const poller = makePoller(stubApi());

  roster[0].stats.turnover = 1000 * USD;
  roster[1].stats.turnover = 500 * USD;
  await poller.tick(1758000000000, 0);

  roster[0].stats.turnover = 1010 * USD;
  roster[1].stats.turnover = 530 * USD;
  const second = await poller.tick(1758000060000, 1);

  assert.equal(second.deltas.turnover, 40 * USD, '10 from one game plus 30 from the other');
});

test('a month rollover does not report a hugely negative tick delta', { skip }, async () => {
  const USD = 1_000_000;
  const poller = makePoller(stubApi());

  roster[0].stats.turnover = 70000 * USD;
  roster[1].stats.turnover = 500 * USD;
  await poller.tick(1758000000000, 0);

  roster[0].stats.turnover = 990 * USD; // the month rolled over
  roster[1].stats.turnover = 530 * USD;
  const second = await poller.tick(1758000060000, 1);

  assert.ok(second.deltas.turnover > 0, `expected a positive delta, got ${second.deltas.turnover}`);
});

test('a running-log entry is written on the summary cadence, but never on the first tick', { skip }, async () => {
  const USD = 1_000_000;
  const every = config.intervals.summary;
  const poller = makePoller(stubApi());

  for (let i = 0; i <= 5; i++) {
    roster[0].stats.turnover = 1000 * USD * (i + 1);
    roster[0].stats.count = 10 * (i + 1);
    const result = await poller.tick(1758000000000 + i * config.pollMs, i);
    if (i === 0) assert.equal(result.summary, null, 'the first tick has no window to summarise');
    else if (i % every !== 0) assert.equal(result.summary, null, `tick ${i} is not a summary tick`);
  }

  const entries = await client.xRange(k.summary, '-', '+');
  const expected = [1, 2, 3, 4, 5].filter((i) => i % every === 0).length;
  assert.equal(entries.length, expected, `expected ${expected} summaries after six ticks`);

  const entry = entries[0].message;
  assert.equal(Number(entry.minutes), config.intervalMinutes.summary);
  assert.equal(entry.topMover, 'pixel-geyser');
  assert.ok(Number(entry.turnover) > 0);
});

test('the running log reports the alerts raised during its window', { skip }, async () => {
  const USD = 1_000_000;
  const poller = makePoller(stubApi());
  for (let i = 0; i <= 5; i++) {
    roster[0].stats.turnover = 1000 * USD * (i + 1);
    await poller.tick(1758000000000 + i * config.pollMs, i);
  }
  const entry = (await client.xRange(k.summary, '-', '+'))[0].message;
  assert.ok('alerts' in entry);
  assert.ok('crits' in entry);
  assert.equal(Number(entry.alerts) >= 0, true);
});

test('a tick appends a per-mode sample beside the per-game one', { skip }, async () => {
  await makePoller(stubApi()).tick(1758000000000, 0);
  const row = (await client.xRange(k.tsGameModes('pixel-geyser'), '-', '+'))[0].message;
  assert.equal(row['BASE:profit'], '9000');
  assert.equal(row['BASE:turnover'], '300000');
  assert.equal(row['FREE_SPINS:count'], '12');
  // The mode array is already fetched every tick for the snapshot; recording it
  // must not cost another request.
  assert.equal(row['BASE:rtp'], undefined, 'a ratio is not a counter and must not be differenced');
});

test('per-mode sampling costs no extra API call', { skip }, async () => {
  let calls = 0;
  const api = stubApi({
    gameStats: async (g) => {
      calls++;
      return okResult({ slug: g, stats: [{ mode: 'BASE', count: 1, turnover: 2, profit: 3 }] }, `/g/${g}`);
    },
  });
  await makePoller(api).tick(1758000000000, 0);
  assert.equal(calls, 2, 'one per game, exactly as before');
});

test('a game whose per-game fetch failed gets no per-mode sample', { skip }, async () => {
  const api = stubApi({
    gameStats: async (g) => (g === 'pixel-carnivals'
      ? failResult('HTTP', `/g/${g}`)
      : okResult({ slug: g, stats: [{ mode: 'BASE', count: 1, turnover: 2, profit: 3 }] }, `/g/${g}`)),
  });
  await makePoller(api).tick(1758000000000, 0);
  assert.equal(await client.xLen(k.tsGameModes('pixel-geyser')), 1);
  assert.equal(await client.xLen(k.tsGameModes('pixel-carnivals')), 0, 'a gap, not a row of zeros');
});

test('the detector still reads game totals only - per-mode trails are not in its window', { skip }, async () => {
  const poller = makePoller(stubApi());
  await poller.tick(1758000000000, 0);
  const result = await poller.tick(1758000300000, 1);
  assert.equal(result.ok, true);
  assert.ok(Array.isArray(result.alerts));
});

// --- games that go live mid-run ------------------------------------------

/** A catalogue entry, live or dark. */
const listing = (slug, isLive, over = {}) => ({
  name: slug, slug, published: true, isLive,
  stats: isLive ? { month: { turnover: 1000, profit: 100 }, day: { turnover: 10, profit: 1 } } : null,
  onlinePlayers: 0, ...over,
});

test('a game live in the catalogue but absent from /stats is still polled', { skip }, async () => {
  const asked = [];
  const api = stubApi({
    teamGames: async () => okResult([...catalogue, listing('hippo-hustle', true, { onlinePlayers: 3 })], '/games'),
    gameStats: async (g) => {
      asked.push(g);
      return okResult({ slug: g, stats: [{ mode: 'BASE', count: 1, turnover: 2, profit: 3 }] }, `/g/${g}`);
    },
  });
  await makePoller(api).tick(1758000000000, 0);

  assert.ok(asked.includes('hippo-hustle'), `a launch must not wait for its first bet, asked: ${asked}`);
  assert.equal(await client.exists(k.game('hippo-hustle')), 1);
});

test('a dark catalogue entry is never requested', { skip }, async () => {
  const asked = [];
  const api = stubApi({
    teamGames: async () => okResult([...catalogue, listing('tweaker-park', false)], '/games'),
    gameStats: async (g) => { asked.push(g); return okResult({ slug: g, stats: [] }, `/g/${g}`); },
  });
  await makePoller(api).tick(1758000000000, 0);
  assert.ok(!asked.includes('tweaker-park'), 'published is not live; requesting it 404s');
});

test('discovery survives the roster failing as long as the catalogue answers', { skip }, async () => {
  const asked = [];
  const api = stubApi({
    teamStats: async () => failResult('HTTP', '/stats'),
    teamGames: async () => okResult([listing('pixel-geyser', true)], '/games'),
    gameStats: async (g) => { asked.push(g); return okResult({ slug: g, stats: [] }, `/g/${g}`); },
  });
  await makePoller(api).tick(1758000000000, 0);
  assert.deepEqual(asked, ['pixel-geyser']);
});

test('a cold start does not announce the whole roster as new', { skip }, async () => {
  const result = await makePoller(stubApi()).tick(1758000000000, 0);
  assert.equal(result.alerts.filter((a) => a.kind === 'new_game').length, 0,
    'meeting the roster for the first time is a cold start, not ten launches');
});

test('a game that appears mid-run is announced exactly once', { skip }, async () => {
  let live = false;
  const api = stubApi({
    teamGames: async () => okResult(live ? [...catalogue, listing('hippo-hustle', true)] : catalogue, '/games'),
  });
  const poller = makePoller(api);

  await poller.tick(1758000000000, 0);
  live = true;
  const second = await poller.tick(1758000300000, 1);
  const third = await poller.tick(1758000600000, 2);

  const fired = second.alerts.filter((a) => a.kind === 'new_game');
  assert.equal(fired.length, 1, `expected one announcement, got ${JSON.stringify(second.alerts.map((a) => a.kind))}`);
  assert.equal(fired[0].game, 'hippo-hustle');
  assert.match(fired[0].message, /hippo-hustle/);
  assert.equal(third.alerts.filter((a) => a.kind === 'new_game').length, 0, 'a game is only new once');
});

test('the announcement reaches the alert stream and the running log', { skip }, async () => {
  let live = false;
  const api = stubApi({
    teamGames: async () => okResult(live ? [...catalogue, listing('hippo-hustle', true)] : catalogue, '/games'),
  });
  const poller = makePoller(api);
  await poller.tick(1758000000000, 0);
  live = true;
  const second = await poller.tick(1758000060000, 1);

  const dash = await readDashboard(client, k);
  assert.ok(dash.alerts.some((a) => a.kind === 'new_game'), 'it must be readable by the dashboard');

  // The running log is written every `intervals.summary` ticks, which is not
  // every tick once the poll period is shorter than the summary window. The
  // property that matters is that an announcement raised mid-window survives
  // until the entry covering that window is built - so tick on to whenever
  // that is rather than assuming it is the very next one.
  let summary = second.summary;
  for (let tick = 2; !summary && tick <= config.intervals.summary + 1; tick++) {
    summary = (await poller.tick(1758000000000 + tick * 60000, tick)).summary;
  }
  assert.ok(summary, 'a running-log entry must be written within one summary window');
  assert.ok(String(summary.kinds ?? '').includes('new_game'), 'and recorded in the window it happened in');
});

test('after a restart, a game that went live during the downtime is still announced', { skip }, async () => {
  // First run establishes what was known, then stops.
  await makePoller(stubApi()).tick(1758000000000, 0);

  // A fresh Poller object is a restart: its in-memory set starts empty and has
  // to be rebuilt from what the last run wrote, or every game reads as new.
  const api = stubApi({
    teamGames: async () => okResult([...catalogue, listing('hippo-hustle', true)], '/games'),
  });
  const result = await makePoller(api).tick(1758000300000, 0);

  const fired = result.alerts.filter((a) => a.kind === 'new_game');
  assert.deepEqual(fired.map((a) => a.game), ['hippo-hustle'],
    'the two games the previous run already knew must stay quiet');
});
