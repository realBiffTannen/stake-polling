import { test, beforeEach, after } from 'node:test';
import assert from 'node:assert/strict';
import { connect } from '../src/store/redis.mjs';
import { writeTick } from '../src/store/writer.mjs';
import { readDashboard, readTrails, readModeTrail, readTeamTrailSince, readSince } from '../src/store/reader.mjs';
import { keys } from '../src/store/keys.mjs';

const k = keys('test-team');
const retention = { trailMaxLen: 100, alertMaxLen: 50 };

// Resolved before any test is registered, so `skip` is known at registration
// time - node:test reads the options object when the test is declared, not
// when it runs.
let client = null;
let skip = false;
try {
  client = await connect('redis://127.0.0.1:6379', { database: 15 });
} catch {
  skip = 'redis unreachable on 127.0.0.1:6379 - start redis-server to run the store tests';
}

beforeEach(async () => { if (client) await client.flushDb(); });
after(async () => { if (client) await client.quit(); });

const tick = (over = {}) => ({
  ts: 1758000000000,
  snapshots: {
    roster: { ok: true, endpoint: '/teams/test-team/stats', data: { games: [{ name: 'pixel-geyser' }], balance: 84120 } },
    games: { ok: true, endpoint: '/teams/test-team/games', data: { onlinePlayers: 341 } },
    perGame: { 'pixel-geyser': { ok: true, endpoint: '/teams/test-team/games/pixel-geyser/stats', data: { modes: [] } } },
  },
  samples: {
    team: { balance: 84120, turnover: 900000, profit: 30000 },
    online: { onlinePlayers: 341 },
    games: { 'pixel-geyser': { turnover: 412880, profit: 12410, count: 1204 } },
    modes: { 'pixel-geyser': { 'BASE:profit': 9000, 'BASE:turnover': 300000, 'FREE_SPINS:profit': 3410 } },
  },
  alerts: [],
  meta: { auth_state: 'ok' },
  ...over,
});

test('a tick round-trips and the trail is readable in detector shape', { skip }, async () => {
  await writeTick(client, k, tick(), retention);
  const trails = await readTrails(client, k, ['pixel-geyser'], 60);
  assert.equal(trails.games['pixel-geyser'].at(-1).fields.turnover, 412880);
  assert.equal(typeof trails.games['pixel-geyser'].at(-1).fields.turnover, 'number');
  assert.equal(trails.online.at(-1).fields.onlinePlayers, 341);
  assert.equal(trails.team.at(-1).fields.balance, 84120);
});

test('snapshots come back as envelopes with a fetch timestamp', { skip }, async () => {
  await writeTick(client, k, tick(), retention);
  const dash = await readDashboard(client, k);
  assert.equal(dash.roster.ok, true);
  assert.equal(dash.roster.ts, 1758000000000);
  assert.equal(dash.roster.data.balance, 84120);
  assert.equal(dash.perGame['pixel-geyser'].data.modes.length, 0);
  assert.equal(dash.meta.auth_state, 'ok');
});

test('a failed endpoint leaves the previous snapshot in place', { skip }, async () => {
  await writeTick(client, k, tick(), retention);

  const failed = tick({ ts: 1758000060000 });
  failed.snapshots.roster = { ok: false, endpoint: '/teams/test-team/stats', error: 'timeout' };
  await writeTick(client, k, failed, retention);

  const dash = await readDashboard(client, k);
  assert.equal(dash.roster.ok, true);
  assert.equal(dash.roster.data.balance, 84120);
  assert.equal(dash.roster.ts, 1758000000000, 'the stale snapshot keeps its original fetch time');
});

test('trails are trimmed towards the retention cap', { skip }, async () => {
  for (let i = 0; i < 120; i++) {
    const t = tick({ ts: 1758000000000 + i * 60000 });
    t.samples.games['pixel-geyser'].turnover = 1000 * (i + 1);
    await writeTick(client, k, t, { trailMaxLen: 10, alertMaxLen: 50 });
  }
  const len = await client.xLen(k.tsGame('pixel-geyser'));
  assert.ok(len <= 120, `approximate trimming should bound the stream, got ${len}`);
  const trails = await readTrails(client, k, ['pixel-geyser'], 5);
  assert.equal(trails.games['pixel-geyser'].at(-1).fields.turnover, 120000);
});

test('alerts are appended and read back newest-first', { skip }, async () => {
  const t = tick();
  t.alerts = [
    { ts: t.ts, severity: 'warn', kind: 'spike', game: 'pixel-geyser', metric: 'turnover', value: 41000, baseline: 1000, z: 7.1, message: 'first' },
    { ts: t.ts, severity: 'crit', kind: 'flat_line', game: 'pixel-carnivals', metric: 'turnover', value: 0, baseline: 900, z: 0, message: 'second' },
  ];
  await writeTick(client, k, t, retention);
  const dash = await readDashboard(client, k);
  assert.equal(dash.alerts.length, 2);
  assert.equal(dash.alerts[0].message, 'second');
  assert.equal(dash.alerts[0].severity, 'crit');
  assert.equal(typeof dash.alerts[0].z, 'number');
});

test('a tick publishes on the tick channel', { skip }, async () => {
  const sub = client.duplicate();
  await sub.connect();
  const seen = new Promise((resolve) => sub.subscribe(k.chTick, resolve));
  await new Promise((r) => setTimeout(r, 50));
  await writeTick(client, k, tick(), retention);
  const msg = await seen;
  assert.equal(JSON.parse(msg).ts, 1758000000000);
  await sub.quit();
});

test('reading an empty database does not throw', { skip }, async () => {
  const dash = await readDashboard(client, k);
  assert.equal(dash.roster, null);
  assert.deepEqual(dash.alerts, []);
  assert.deepEqual(dash.perGame, {});
});

test('per-mode samples land in their own stream and are opt-in to read', { skip }, async () => {
  await writeTick(client, k, tick(), retention);

  const without = await readTrails(client, k, ['pixel-geyser'], 60);
  assert.equal(without.modes, undefined, 'the poller pays for one read per game and needs none of this');

  const withModes = await readTrails(client, k, ['pixel-geyser'], 60, { modes: true });
  const sample = withModes.modes['pixel-geyser'].at(-1);
  assert.equal(sample.fields['BASE:profit'], 9000);
  assert.equal(sample.fields['FREE_SPINS:profit'], 3410);
  assert.equal(typeof sample.fields['BASE:turnover'], 'number');
});

test('a game with no per-mode reading this tick gets no per-mode sample', { skip }, async () => {
  await writeTick(client, k, tick({
    samples: { team: {}, online: {}, games: { 'pixel-geyser': { turnover: 1 } }, modes: {} },
  }), retention);
  const trails = await readTrails(client, k, ['pixel-geyser'], 60, { modes: true });
  assert.deepEqual(trails.modes['pixel-geyser'], [], 'a gap must not be written as a row of zeros');
});

test('the per-mode stream is trimmed like every other trail', { skip }, async () => {
  for (let i = 0; i < 5; i++) await writeTick(client, k, tick(), { ...retention, trailMaxLen: 2 });
  const len = await client.xLen(k.tsGameModes('pixel-geyser'));
  assert.ok(len <= 5, `approximate MAXLEN trimming should bound the stream, got ${len}`);
});

test('readModeTrail reads one game\'s per-mode trail without reading every game', { skip }, async () => {
  await writeTick(client, k, tick(), retention);
  const trail = await readModeTrail(client, k, 'pixel-geyser', 60);
  const sample = trail.at(-1);
  assert.equal(sample.fields['BASE:profit'], 9000);
  assert.equal(sample.fields['FREE_SPINS:profit'], 3410);
  assert.equal(typeof sample.fields['BASE:turnover'], 'number');
});

test('a live game the roster has not listed yet is still named for the dashboard', { skip }, async () => {
  await writeTick(client, k, tick({
    snapshots: {
      roster: { ok: true, endpoint: '/stats', data: [{ name: 'Pixel Geyser', slug: 'pixel-geyser', stats: { turnover: 1 } }] },
      games: {
        ok: true,
        endpoint: '/games',
        data: [
          { name: 'Pixel Geyser', slug: 'pixel-geyser', isLive: true, published: true, stats: null, onlinePlayers: 2 },
          { name: 'Hippo Hustle', slug: 'hippo-hustle', isLive: true, published: true, stats: null, onlinePlayers: 3 },
          { name: 'Tweaker Park', slug: 'tweaker-park', isLive: false, published: true, stats: null, onlinePlayers: 0 },
        ],
      },
      perGame: {},
    },
  }), retention);

  const dash = await readDashboard(client, k);
  assert.ok(dash.gameNames.includes('hippo-hustle'), 'live but unlisted must still be read');
  assert.ok(!dash.gameNames.includes('tweaker-park'), 'dark titles would 404 on every per-game read');
  assert.equal(new Set(dash.gameNames).size, dash.gameNames.length, 'no slug may be named twice');
});

// Trail samples carry their grid boundary as their stream ID, so a reader
// sees the 00:00:00Z tick at exactly 00:00:00.000 rather than at whenever the
// MULTI happened to land a second or two later.
test('trail samples are stamped with the tick boundary as their stream ID', { skip }, async () => {
  const t = tick();
  await writeTick(client, k, t, retention);
  for (const key of [k.tsTeam, k.tsOnline, k.tsGame('pixel-geyser'), k.tsGameModes('pixel-geyser')]) {
    const [entry] = await client.xRevRange(key, '+', '-', { COUNT: 1 });
    assert.ok(entry.id.startsWith(`${t.ts}-`), `${key} got ${entry.id}`);
  }
  const trails = await readTrails(client, k, ['pixel-geyser'], 60, { modes: true });
  assert.equal(trails.games['pixel-geyser'].at(-1).ts, t.ts);
  assert.equal(trails.modes['pixel-geyser'].at(-1).ts, t.ts);
});

test('alerts and summaries keep their auto IDs - they are events, not grid samples', { skip }, async () => {
  const t = tick({ summary: { from: 1, to: 2, minutes: 5 } });
  t.alerts = [{ ts: t.ts, severity: 'warn', kind: 'spike', message: 'x' }];
  await writeTick(client, k, t, retention);
  const [alert] = await client.xRevRange(k.alerts, '+', '-', { COUNT: 1 });
  const [summary] = await client.xRevRange(k.summary, '+', '-', { COUNT: 1 });
  assert.ok(!alert.id.startsWith(`${t.ts}-`));
  assert.ok(!summary.id.startsWith(`${t.ts}-`));
});

test('a second write for the same boundary takes the next sequence rather than failing', { skip }, async () => {
  await writeTick(client, k, tick(), retention);
  await writeTick(client, k, tick(), retention);
  const ids = (await client.xRange(k.tsGame('pixel-geyser'), '-', '+')).map((e) => e.id);
  assert.deepEqual(ids, ['1758000000000-0', '1758000000000-1']);
});

test('a tick with no usable boundary falls back to an auto ID', { skip }, async () => {
  for (const ts of [undefined, Number.NaN]) {
    await client.flushDb();
    const before = Date.now();
    await writeTick(client, k, tick({ ts }), retention);
    const [entry] = await client.xRevRange(k.tsGame('pixel-geyser'), '+', '-', { COUNT: 1 });
    assert.ok(Number(entry.id.split('-')[0]) >= before, `${ts} -> ${entry.id}`);
  }
});

test('readTeamTrailSince reads by time, not by count - sample density has not always been uniform', { skip }, async () => {
  // Dense samples first (a faster poll), then the 2.5-minute grid.
  const at = [0, 30000, 60000, 90000, 240000, 390000];
  for (const [i, dt] of at.entries()) {
    const t = tick({ ts: 1758000000000 + dt });
    t.samples.team.profit = i;
    await writeTick(client, k, t, retention);
  }
  const trail = await readTeamTrailSince(client, k, 1758000060000);
  assert.deepEqual(trail.map(s => s.fields.profit), [2, 3, 4, 5], 'everything from the given instant on, oldest first');
  assert.equal(trail[0].ts, 1758000060000);
});

test('readSince reads any trail stream by time, oldest first', { skip }, async () => {
  for (const [i, dt] of [0, 150000, 300000].entries()) {
    const t = tick({ ts: 1758000000000 + dt });
    t.samples.online.onlinePlayers = 10 + i;
    await writeTick(client, k, t, retention);
  }
  const trail = await readSince(client, k.tsOnline, 1758000150000);
  assert.deepEqual(trail.map(s => s.fields.onlinePlayers), [11, 12]);
});
