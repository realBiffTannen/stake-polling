import { test } from 'node:test';
import assert from 'node:assert/strict';
import { detect } from '../src/detect/rules.mjs';
import { loadConfig } from '../src/config.mjs';

// The studio a test runs as. Tests never read the developer's own
// config.local.json (`local: null`), so they pass the same on a fresh clone.
const TEST_ENV = { STAKE_TEAM: 'acme-studios', STAKE_LIFETIME_START: '2026-07-24' };

const cfg = loadConfig({ env: TEST_ENV, local: null }).detect;
const MIN = 60000;

// The API reports money in micro-dollars, and the detector's floors are
// written in config.json as dollars, so fixtures must use the real scale -
// a turnover of "1000" raw is a tenth of a cent, not a thousand dollars.
const USD = 1_000_000;

/** n minutes of perfectly steady cumulative traffic at `v` DOLLARS per minute. */
const steady = (n, v, perMinCount = 10) =>
  Array.from({ length: n }, (_, i) => ({
    ts: i * MIN,
    fields: {
      turnover: v * USD * (i + 1),
      count: perMinCount * (i + 1),
      profit: Math.round(v * 0.03) * USD * (i + 1),
    },
  }));

const withGames = (games, extra = {}) => ({ team: [], online: [], games, ...extra });

test('a clean 40x turnover spike fires crit', () => {
  const t = steady(70, 1000);
  const last = t.at(-1).fields;
  t.push({ ts: 70 * MIN, fields: { turnover: last.turnover + 40000 * USD, count: last.count + 20, profit: last.profit } });

  const alerts = detect({ now: 71 * MIN, trails: withGames({ 'pixel-geyser': t }), config: cfg })
    .filter((a) => a.kind === 'spike');

  assert.equal(alerts.length, 1);
  assert.equal(alerts[0].game, 'pixel-geyser');
  assert.equal(alerts[0].metric, 'turnover');
  assert.equal(alerts[0].severity, 'crit');
});

test('ordinary jitter does not fire anything', () => {
  const t = steady(70, 1000).map((s, i) => ({
    ...s,
    fields: { ...s.fields, turnover: s.fields.turnover + (i % 3) * 20 },
  }));
  assert.deepEqual(detect({ now: 71 * MIN, trails: withGames({ 'pixel-geyser': t }), config: cfg }), []);
});

test('fewer than warmupSamples produces no alerts', () => {
  assert.deepEqual(detect({ now: 6 * MIN, trails: withGames({ g: steady(5, 1000) }), config: cfg }), []);
});

test('a month rollover is not reported as a crash', () => {
  const t = steady(70, 1000);
  // At the month boundary the cumulative total resets: it stops being
  // "70,000 dollars so far" and becomes "990 dollars this month", which is
  // one ordinary minute's traffic. Without the reset rule the delta would be
  // -69,010 dollars and every rule would scream.
  t.push({ ts: 70 * MIN, fields: { turnover: 990 * USD, count: 9, profit: 29 * USD } });
  const alerts = detect({ now: 71 * MIN, trails: withGames({ g: t }), config: cfg });
  assert.deepEqual(alerts.filter((a) => a.kind === 'drop'), []);
});

test('share_shift fires when one game takes the traffic', () => {
  const a = steady(70, 1000);
  const b = steady(70, 1000);
  const la = a.at(-1).fields, lb = b.at(-1).fields;
  a.push({ ts: 70 * MIN, fields: { turnover: la.turnover + 1000 * USD, count: la.count + 10, profit: la.profit } });
  b.push({ ts: 70 * MIN, fields: { turnover: lb.turnover + 9000 * USD, count: lb.count + 90, profit: lb.profit } });

  const shifts = detect({ now: 71 * MIN, trails: withGames({ alpha: a, beta: b }), config: cfg })
    .filter((x) => x.kind === 'share_shift');

  assert.ok(shifts.some((s) => s.game === 'beta'), 'beta should be flagged as taking the traffic');
});

test('share_shift does not fire when the whole roster rises together', () => {
  const a = steady(70, 1000);
  const b = steady(70, 1000);
  const la = a.at(-1).fields, lb = b.at(-1).fields;
  a.push({ ts: 70 * MIN, fields: { turnover: la.turnover + 5000 * USD, count: la.count + 50, profit: la.profit } });
  b.push({ ts: 70 * MIN, fields: { turnover: lb.turnover + 5000 * USD, count: lb.count + 50, profit: lb.profit } });

  const shifts = detect({ now: 71 * MIN, trails: withGames({ alpha: a, beta: b }), config: cfg })
    .filter((x) => x.kind === 'share_shift');

  assert.deepEqual(shifts, []);
});

test('flat_line fires after the configured quiet period on a previously busy game', () => {
  const t = steady(60, 1000);
  const frozen = t.at(-1).fields;
  for (let i = 0; i < cfg.flatLineSamples; i++) {
    t.push({ ts: (60 + i) * MIN, fields: { ...frozen } });
  }
  const flat = detect({ now: 71 * MIN, trails: withGames({ g: t }), config: cfg })
    .filter((a) => a.kind === 'flat_line');

  assert.equal(flat.length, 1);
  assert.equal(flat[0].game, 'g');
});

test('flat_line does not fire one sample early', () => {
  const t = steady(60, 1000);
  const frozen = t.at(-1).fields;
  for (let i = 0; i < cfg.flatLineSamples - 1; i++) {
    t.push({ ts: (60 + i) * MIN, fields: { ...frozen } });
  }
  assert.deepEqual(
    detect({ now: 70 * MIN, trails: withGames({ g: t }), config: cfg }).filter((a) => a.kind === 'flat_line'),
    [],
  );
});

test('an online-player collapse is a drop, not a reset', () => {
  const online = Array.from({ length: 70 }, (_, i) => ({ ts: i * MIN, fields: { onlinePlayers: 300 + (i % 4) } }));
  online.push({ ts: 70 * MIN, fields: { onlinePlayers: 12 } });

  const alerts = detect({ now: 71 * MIN, trails: { team: [], online, games: {} }, config: cfg });
  const drop = alerts.find((a) => a.metric === 'onlinePlayers');

  assert.ok(drop, 'expected an onlinePlayers alert');
  assert.equal(drop.kind, 'drop');
  assert.equal(drop.game, 'team');
});

test('every alert carries the fields the store and the tui expect', () => {
  const t = steady(70, 1000);
  const last = t.at(-1).fields;
  t.push({ ts: 70 * MIN, fields: { turnover: last.turnover + 40000 * USD, count: last.count + 20, profit: last.profit } });
  for (const a of detect({ now: 71 * MIN, trails: withGames({ g: t }), config: cfg })) {
    for (const f of ['ts', 'severity', 'kind', 'game', 'metric', 'value', 'baseline', 'z', 'message']) {
      assert.ok(f in a, `alert missing ${f}: ${JSON.stringify(a)}`);
    }
    assert.ok(['warn', 'crit'].includes(a.severity));
    assert.equal(typeof a.message, 'string');
  }
});

test('a surge of concurrent players onto one game is flagged', () => {
  // Steady at ~4 players for over an hour, then twenty arrive at once.
  const t = Array.from({ length: 70 }, (_, i) => ({
    ts: i * MIN,
    fields: { turnover: 1000 * USD * (i + 1), count: 10 * (i + 1), onlinePlayers: 4 + (i % 2) },
  }));
  t.push({ ts: 70 * MIN, fields: { turnover: 71000 * USD, count: 710, onlinePlayers: 24 } });

  const hits = detect({ now: 71 * MIN, trails: withGames({ 'pixel-nest': t }), config: cfg })
    .filter((a) => a.metric === 'onlinePlayers' && a.game === 'pixel-nest');

  assert.equal(hits.length, 1, `expected one per-game online alert, got ${JSON.stringify(hits)}`);
  assert.equal(hits[0].kind, 'spike');
});

test('one extra player on a game is not an event', () => {
  const t = Array.from({ length: 70 }, (_, i) => ({
    ts: i * MIN,
    fields: { turnover: 1000 * USD * (i + 1), count: 10 * (i + 1), onlinePlayers: 4 + (i % 2) },
  }));
  t.push({ ts: 70 * MIN, fields: { turnover: 71000 * USD, count: 710, onlinePlayers: 6 } });

  const hits = detect({ now: 71 * MIN, trails: withGames({ g: t }), config: cfg })
    .filter((a) => a.metric === 'onlinePlayers');

  assert.deepEqual(hits, []);
});
