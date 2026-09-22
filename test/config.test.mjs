import { test } from 'node:test';
import assert from 'node:assert/strict';
import { loadConfig } from '../src/config.mjs';

// The studio a test runs as. Tests never read the developer's own
// config.local.json (`local: null`), so they pass the same on a fresh clone.
const TEST_ENV = { STAKE_TEAM: 'acme-studios', STAKE_LIFETIME_START: '2026-07-24' };

test('defaults come from config.json', () => {
  const cfg = loadConfig({ env: TEST_ENV, local: null });
  assert.equal(cfg.team, 'acme-studios');
  assert.equal(cfg.lifetimeStart, '2026-07-24');
  assert.equal(cfg.apiUrl, 'https://studio.engine.io/api');
  assert.equal(cfg.pollMinutes, 2.5);
  assert.equal(cfg.pollMs, 150000);
  assert.equal(cfg.rateLabel, '/2.5m');
});

test('endpoint cadences are configured in minutes and derived into ticks', () => {
  const cfg = loadConfig({ env: TEST_ENV, local: null });
  // 2.5-minute polling, on the clock: the roster, the catalogue, the
  // per-game breakdown and the balance are all due every tick, and the slow
  // endpoints keep their wall-clock cadence - graph every 15 minutes (6
  // ticks), lifetime every hour (24 ticks), the running log every 5 (2).
  assert.equal(cfg.intervals.roster, 1);
  assert.equal(cfg.intervals.games, 1);
  assert.equal(cfg.intervals.gameStats, 1);
  assert.equal(cfg.intervals.balance, 1);
  assert.equal(cfg.intervals.graph, 6);
  assert.equal(cfg.intervals.lifetime, 24);
  assert.equal(cfg.intervals.summary, 2);
  assert.equal(cfg.intervalMinutes.graph, 15);
});

test('the endpoints the live page reads are due on EVERY tick', () => {
  // The /live page promises a figure per poll and shows a countdown to the
  // next one. If the roster were due every Nth tick instead, the countdown
  // would run out N-1 times out of N with nothing new behind it - which is
  // what a pollMinutes of 3 against five-minute cadences silently did.
  const cfg = loadConfig({ env: TEST_ENV, local: null });
  for (const endpoint of ['roster', 'games', 'gameStats', 'balance']) {
    assert.equal(cfg.intervals[endpoint], 1, `${endpoint} must be due every tick`);
  }
});

test('the trail cap keeps meaning thirty days when the period changes', () => {
  assert.equal(loadConfig({ env: { ...TEST_ENV, STAKE_POLL_MINUTES: '5' }, local: null }).retention.trailMaxLen, 8640);
  assert.equal(loadConfig({ env: { ...TEST_ENV, STAKE_POLL_MINUTES: '1' }, local: null }).retention.trailMaxLen, 43200);
  assert.equal(loadConfig({ env: { ...TEST_ENV, STAKE_POLL_MINUTES: '10' }, local: null }).retention.trailMaxLen, 4320);
});

test('rate floors scale with the period but level floors do not', () => {
  const five = loadConfig({ env: { ...TEST_ENV, STAKE_POLL_MINUTES: '5' }, local: null }).detect.floors;
  const one = loadConfig({ env: { ...TEST_ENV, STAKE_POLL_MINUTES: '1' }, local: null }).detect.floors;

  // Five minutes of traffic is five times one minute of it.
  assert.equal(one.turnover, 50);
  assert.equal(five.turnover, 250);
  assert.equal(five.count, 125);
  // Twenty-five players online is twenty-five players however often it is read.
  assert.equal(one.onlinePlayers, 25);
  assert.equal(five.onlinePlayers, 25);
  assert.equal(five.gameOnlinePlayers, 5);
});

test('the flat-line tail is counted in samples, never fewer than two', () => {
  assert.equal(loadConfig({ env: { ...TEST_ENV, STAKE_POLL_MINUTES: '5' }, local: null }).detect.flatLineSamples, 3);
  assert.equal(loadConfig({ env: { ...TEST_ENV, STAKE_POLL_MINUTES: '1' }, local: null }).detect.flatLineSamples, 15);
  assert.equal(loadConfig({ env: { ...TEST_ENV, STAKE_POLL_MINUTES: '60' }, local: null }).detect.flatLineSamples, 2);
});

test('the rate label names the period so a column cannot be misread', () => {
  assert.equal(loadConfig({ env: { ...TEST_ENV, STAKE_POLL_MINUTES: '5' }, local: null }).rateLabel, '/5m');
  assert.equal(loadConfig({ env: { ...TEST_ENV, STAKE_POLL_MINUTES: '1' }, local: null }).rateLabel, '/m');
});

test('a window no longer than the warm-up is rejected rather than silently never alerting', async () => {
  const { mkdtemp, writeFile, rm } = await import('node:fs/promises');
  const { tmpdir } = await import('node:os');
  const { join } = await import('node:path');

  const dir = await mkdtemp(join(tmpdir(), 'stake-cfg-'));
  const base = JSON.parse((await import('node:fs')).readFileSync(new URL('../config.json', import.meta.url), 'utf8'));
  base.detect.windowSamples = 10;
  base.detect.warmupSamples = 10;
  await writeFile(join(dir, 'config.json'), JSON.stringify(base));

  // Nothing could ever accumulate the samples it needs, and the detector would
  // go permanently silent without saying so.
  assert.throws(() => loadConfig({ env: TEST_ENV, root: dir }), /must exceed/);
  await rm(dir, { recursive: true, force: true });
});

test('STAKE_API_URL overrides the configured api url', () => {
  const cfg = loadConfig({ env: { ...TEST_ENV, STAKE_API_URL: 'http://localhost:9999/api' }, local: null });
  assert.equal(cfg.apiUrl, 'http://localhost:9999/api');
});

test('trailing slashes are stripped from apiUrl', () => {
  const cfg = loadConfig({ env: { ...TEST_ENV, STAKE_API_URL: 'http://x/api/' }, local: null });
  assert.equal(cfg.apiUrl, 'http://x/api');
});

test('REDIS_URL and STAKE_TEAM are honoured', () => {
  const cfg = loadConfig({ env: { ...TEST_ENV, REDIS_URL: 'redis://1.2.3.4:6380', STAKE_TEAM: 'other' }, local: null });
  assert.equal(cfg.redisUrl, 'redis://1.2.3.4:6380');
  assert.equal(cfg.team, 'other');
});

test('the sid is never part of the config object', () => {
  const cfg = loadConfig({ env: { ...TEST_ENV, STAKE_SID: 'super-secret-sid' }, local: null });
  assert.ok(!JSON.stringify(cfg).includes('super-secret-sid'));
});

test('an invalid team is rejected', () => {
  assert.throws(() => loadConfig({ env: { ...TEST_ENV, STAKE_TEAM: 'bad team!' }, local: null }), /team/i);
});

// ------------------------------------------------------- per-studio settings
async function scratchRoot({ local } = {}) {
  const { mkdtemp, writeFile } = await import('node:fs/promises');
  const { tmpdir } = await import('node:os');
  const { join } = await import('node:path');
  const dir = await mkdtemp(join(tmpdir(), 'stake-cfg-'));
  const base = (await import('node:fs')).readFileSync(new URL('../config.json', import.meta.url), 'utf8');
  await writeFile(join(dir, 'config.json'), base);
  if (local) await writeFile(join(dir, 'config.local.json'), JSON.stringify(local));
  return dir;
}

test('the shipped config.json names no studio: team and start date belong to config.local.json', async () => {
  const base = JSON.parse((await import('node:fs')).readFileSync(new URL('../config.json', import.meta.url), 'utf8'));
  assert.equal(base.team, undefined);
  assert.equal(base.lifetimeStart, undefined);
  const example = JSON.parse((await import('node:fs')).readFileSync(new URL('../config.local.example.json', import.meta.url), 'utf8'));
  assert.ok(example.team && example.lifetimeStart, 'the example shows both settings a studio must make');
});

test('config.local.json overrides config.json, merging nested sections key by key', async () => {
  const dir = await scratchRoot({ local: { team: 'acme-studios', lifetimeStart: '2026-01-05', detect: { zWarn: 3 } } });
  const cfg = loadConfig({ env: {}, root: dir });
  assert.equal(cfg.team, 'acme-studios');
  assert.equal(cfg.lifetimeStart, '2026-01-05');
  assert.equal(cfg.detect.zWarn, 3, 'the local value wins');
  assert.equal(cfg.detect.zCrit, 6, 'and the rest of the section survives');
  assert.equal(cfg.pollMinutes, 2.5);
});

test('environment variables beat config.local.json', async () => {
  const dir = await scratchRoot({ local: { team: 'acme-studios', lifetimeStart: '2026-01-05' } });
  const cfg = loadConfig({ env: { STAKE_TEAM: 'other-studio', STAKE_LIFETIME_START: '2025-12-01' }, root: dir });
  assert.equal(cfg.team, 'other-studio');
  assert.equal(cfg.lifetimeStart, '2025-12-01');
});

test('with no team anywhere, the error says where to set one', async () => {
  const dir = await scratchRoot();
  assert.throws(() => loadConfig({ env: {}, root: dir }), (err) => /config\.local\.json/.test(err.message) && /STAKE_TEAM/.test(err.message));
});

test('lifetimeStart is required and must be a calendar date', async () => {
  const dir = await scratchRoot({ local: { team: 'acme-studios' } });
  assert.throws(() => loadConfig({ env: {}, root: dir }), /lifetimeStart/);
  assert.throws(() => loadConfig({ env: { ...TEST_ENV, STAKE_LIFETIME_START: 'last july' }, local: null }), /lifetimeStart/);
});
