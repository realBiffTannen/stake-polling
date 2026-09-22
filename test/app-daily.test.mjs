import { test, beforeEach, after } from 'node:test';
import assert from 'node:assert/strict';
import { connect } from '../src/store/redis.mjs';
import { writeTick } from '../src/store/writer.mjs';
import { readGameTrailsSince } from '../src/store/reader.mjs';
import { keys } from '../src/store/keys.mjs';
import { DashboardApp } from '../src/tui/app.mjs';
import { LEVEL } from '../src/tui/nav.mjs';
import { dayStart } from '../src/window.mjs';

const k = keys('test-team');
const retention = { trailMaxLen: 100, alertMaxLen: 50 };
const config = { detect: { window: 36 }, pollMinutes: 5, dayBoundaryUtcHour: 12, retention: { trailDays: 30 } };
const DAY = 86400000;

// Its own database: node:test runs files in parallel, and the other suites
// flush theirs (11, 12, 13, 15) between tests.
let client = null;
let skip = false;
try {
  client = await connect('redis://127.0.0.1:6379', { database: 14 });
} catch {
  skip = 'redis unreachable on 127.0.0.1:6379 - start redis-server to run the daily tests';
}

beforeEach(async () => { if (client) await client.flushDb(); });
after(async () => { if (client) await client.quit(); });

const backdate = async (slug, points) => {
  for (const [ms, profit] of points) await client.xAdd(k.tsGame(slug), `${Math.round(ms)}-0`, { profit: String(profit) });
};

const tickNow = (profit) => ({
  ts: Date.now(),
  snapshots: {
    roster: { ok: true, data: [{ slug: 'berry', stats: { count: 10, turnover: 9_000_000_000, profit } }] },
    games: { ok: true, data: [{ slug: 'berry', isLive: true, onlinePlayers: 1 }] },
  },
  samples: { online: { onlinePlayers: 1 }, games: { berry: { profit, turnover: 9_000_000_000, count: 10 } } },
  alerts: [],
  meta: { auth_state: 'ok' },
});

test('a trail can be read by time rather than by count, oldest first, with numeric fields', { skip }, async () => {
  await backdate('berry', [[1000, 1], [2000, 2], [3000, 3]]);
  const trails = await readGameTrailsSince(client, k, ['berry', 'nobody'], 2000);
  assert.deepEqual(trails.berry, [{ ts: 2000, fields: { profit: 2 } }, { ts: 3000, fields: { profit: 3 } }]);
  assert.deepEqual(trails.nobody, [], 'a game with no trail is an empty trail, not a missing key');
});

test('--view daily raises the level, the way every other --view does', () => {
  const app = new DashboardApp({ client: null, keys: {}, config });
  app.setView({ view: 'daily' });
  assert.equal(app.nav.level, LEVEL.DAILY);
});

test('the daily snapshot reaches back past the accounting day, one row per 12:00Z day', { skip }, async () => {
  const today = dayStart(Date.now(), 12);
  await backdate('berry', [
    [today - 1.5 * DAY, 1_000_000_000],
    [today - 1.2 * DAY, 1_300_000_000],   // +$30.00 share, two days ago
    [today - 0.5 * DAY, 1_200_000_000],   // -$10.00 share, yesterday
  ]);
  await writeTick(client, k, tickNow(1_250_000_000), retention);   // +$5.00 share, so far today

  const app = new DashboardApp({ client, keys: k, config });
  app.setView({ view: 'daily' });
  const text = await app.snapshot();

  assert.match(text, /DAILY PROFIT {2}12:00Z -> 12:00Z/);
  const rows = text.split('\n').filter((l) => /^\d\d-\d\d -> \d\d-\d\d/.test(l));
  assert.equal(rows.length, 3, text);
  assert.match(rows[0], /so far\s+\+\$5\.00\s+\+\$5\.00$/);
  assert.match(rows[1], /\s-\$10\.00\s+-\$10\.00$/);
  assert.match(rows[2], /partial\s+\+\$30\.00\s+\+\$30\.00$/, 'the trail began part-way through its oldest day');
});

test('the roster snapshot does not pay for the month-deep read', { skip }, async () => {
  await writeTick(client, k, tickNow(1_250_000_000), retention);
  const app = new DashboardApp({ client, keys: k, config });
  let ranged = 0;
  const counting = new Proxy(client, {
    get: (target, prop) => (prop === 'xRange'
      ? (...args) => { ranged++; return target.xRange(...args); }
      : typeof target[prop] === 'function' ? target[prop].bind(target) : target[prop]),
  });
  app.client = counting;
  await app.snapshot();
  assert.equal(ranged, 0, 'only the daily view reads the trail by time range');
});

test('the month-deep read happens once per poll, not once per repaint', { skip }, async () => {
  await writeTick(client, k, tickNow(1_250_000_000), retention);
  const app = new DashboardApp({ client, keys: k, config });
  let ranged = 0;
  app.client = new Proxy(client, {
    get: (target, prop) => (prop === 'xRange'
      ? (...args) => { ranged++; return target.xRange(...args); }
      : typeof target[prop] === 'function' ? target[prop].bind(target) : target[prop]),
  });
  app.setView({ view: 'daily' });

  await app.snapshot();
  await app.snapshot();
  assert.equal(ranged, 1, 'one game, one ranged read - the second frame reuses it');

  await writeTick(client, k, { ...tickNow(1_260_000_000), ts: Date.now() + 1 }, retention);
  await app.snapshot();
  assert.equal(ranged, 2, 'a new poll is new data, and is read');
});
