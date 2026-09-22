import { test } from 'node:test';
import assert from 'node:assert/strict';
import { sparkline } from '../src/tui/sparkline.mjs';
import { renderFrame, renderPlain, buildState } from '../src/tui/render.mjs';
import { buildState as buildStateDirect, modeList } from '../src/tui/state.mjs';
import { buildModeRows } from '../src/tui/mode-rows.mjs';
import { initialNav, LEVEL } from '../src/tui/nav.mjs';

const ESC = String.fromCharCode(27);
const ANSI = new RegExp(`${ESC}\\[[0-9;]*m`, 'g');
const stripAnsi = (s) => s.replace(ANSI, '');
const hasAnsi = (s) => new RegExp(`${ESC}\\[`).test(s);
// `renderFrame` reads `state.nav` - production always sets it (`app.mjs`'s
// `#read`); a hand-built test state has to attach one itself now that
// render.mjs no longer derives a nav from `state.focus`/`state.bucket` on its
// own. Mechanical scaffolding only - every assertion below is unchanged.
const withNav = (state, nav = {}) => ({ ...state, nav: { ...initialNav(), ...nav } });

// The live shape: roster is an array with nested stats, and onlinePlayers is
// per game in the catalogue rather than a team-level field.
const dashboard = {
  meta: { auth_state: 'ok', last_ok: String(Date.now()), sid_source: 'chrome', sid_fingerprint: 'a91f2c00', persistence: 'aof' },
  roster: {
    ts: Date.now(),
    ok: true,
    data: [
      { name: 'Pixel Geyser', slug: 'pixel-geyser', stats: { count: 1204, turnover: 412880, profit: 12410, unique: 88, expectedProfit: 12000 } },
      { name: 'Pixel Carnivals', slug: 'pixel-carnivals', stats: { count: 980, turnover: 301004, profit: 9120, unique: 61, expectedProfit: 9000 } },
    ],
  },
  games: {
    ts: Date.now(),
    ok: true,
    data: [
      { name: 'Pixel Geyser', slug: 'pixel-geyser', onlinePlayers: 200, stats: null },
      { name: 'Pixel Carnivals', slug: 'pixel-carnivals', onlinePlayers: 141, stats: null },
    ],
  },
  balance: { ts: Date.now(), ok: true, data: { position: 84120, expectedProfit: 1000, carry: -50 } },
  perGame: {},
  alerts: [{
    ts: Date.now(), severity: 'crit', kind: 'spike', game: 'pixel-geyser', metric: 'turnover',
    value: 41000, baseline: 1000, z: 7.1,
    message: 'pixel-geyser turnover spike 41,000/min vs 1,000 baseline',
  }],
  gameNames: ['pixel-geyser', 'pixel-carnivals'],
};
const trails = { team: [], online: [], games: { 'pixel-geyser': [], 'pixel-carnivals': [] } };

test('sparkline never exceeds the requested width and survives a flat series', () => {
  assert.ok([...sparkline([5, 5, 5, 5], 10)].length <= 10);
  assert.equal(sparkline([], 10).trim(), '');
  assert.ok([...sparkline([1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12], 4)].length <= 4);
});

test('sparkline handles a single sample and negative values', () => {
  assert.ok([...sparkline([7], 5)].length <= 5);
  assert.ok([...sparkline([-3, 4, -1, 9], 8)].length <= 8);
});

test('renderFrame fits the terminal width', () => {
  const lines = renderFrame(withNav(buildState(dashboard, trails)), { cols: 80, rows: 24 });
  for (const line of lines) {
    assert.ok(stripAnsi(line).length <= 80, `line too wide (${stripAnsi(line).length}): ${stripAnsi(line)}`);
  }
  assert.ok(lines.length <= 24);
});

test('renderFrame fits an unusually narrow terminal', () => {
  const lines = renderFrame(withNav(buildState(dashboard, trails)), { cols: 40, rows: 12 });
  for (const line of lines) assert.ok(stripAnsi(line).length <= 40);
  assert.ok(lines.length <= 12);
});

test('renderFrame shows the expired banner when the sid has died', () => {
  const expired = { ...dashboard, meta: { ...dashboard.meta, auth_state: 'expired' } };
  const text = stripAnsi(renderFrame(withNav(buildState(expired, trails)), { cols: 80, rows: 24 }).join('\n'));
  assert.ok(text.includes('SID EXPIRED'), text);
});

test('renderFrame lists the roster and the latest alert', () => {
  const text = stripAnsi(renderFrame(withNav(buildState(dashboard, trails)), { cols: 100, rows: 30 }).join('\n'));
  assert.ok(text.includes('pixel-geyser'));
  assert.ok(text.includes('pixel-carnivals'));
  assert.ok(text.includes('341'), 'online players is the sum across the catalogue (200 + 141)');
  assert.ok(text.toLowerCase().includes('spike'));
});

test('renderFrame shows a visible prompt while the filter is open, so it never looks hung', () => {
  const text = stripAnsi(renderFrame(withNav(buildState(dashboard, trails), { filtering: true, filter: 'gal' }), { cols: 80, rows: 24 }).join('\n'));
  assert.match(text, /filter:\s*gal/i, text);
  assert.match(text, /enter applies/i, text);
  assert.match(text, /esc cancels/i, text);
});

test('an applied filter narrows the roster table and says how many games it is hiding', () => {
  const text = stripAnsi(renderFrame(withNav(buildState(dashboard, trails), { filter: 'geyser' }), { cols: 100, rows: 30 }).join('\n'));
  assert.match(text, /pixel-geyser/);
  assert.doesNotMatch(text, /pixel-carnivals/, 'a filtered-out game must not still be drawn');
  assert.match(text, /1 hidden/i, 'an applied filter must never be mistaken for a short roster');
});

test('an applied filter that matches nothing says so rather than drawing an empty table', () => {
  const text = stripAnsi(renderFrame(withNav(buildState(dashboard, trails), { filter: 'zzz-no-such-game' }), { cols: 100, rows: 30 }).join('\n'));
  assert.match(text, /no games match/i);
  assert.match(text, /2 hidden/i);
});

test('renderFrame reports a stale poll rather than pretending the data is live', () => {
  const stale = { ...dashboard, meta: { ...dashboard.meta, last_ok: String(Date.now() - 15 * 60000) } };
  const text = stripAnsi(renderFrame(withNav(buildState(stale, trails)), { cols: 100, rows: 30 }).join('\n'));
  assert.ok(/STALE|15m/.test(text), text);
});

test('renderFrame survives an empty database', () => {
  const empty = { meta: {}, roster: null, games: null, perGame: {}, alerts: [], gameNames: [] };
  const lines = renderFrame(withNav(buildState(empty, { team: [], online: [], games: {} })), { cols: 80, rows: 24 });
  assert.ok(lines.length > 0);
  assert.ok(stripAnsi(lines.join('\n')).toLowerCase().includes('waiting'));
});

test('the game drill-down shows the per-mode breakdown', () => {
  const withModes = {
    ...dashboard,
    perGame: {
      'pixel-geyser': {
        ts: Date.now(),
        ok: true,
        data: {
          modes: [
            { mode: 'BASE', cost: 1, rtp: 96.5, effectiveRtp: 96.4 },
            { mode: 'ANTE', cost: 1.5, rtp: 96.8, effectiveRtp: 96.7 },
          ],
        },
      },
    },
  };
  const built = buildState(withModes, trails);
  const modeRows = buildModeRows({
    snapshot: withModes.perGame['pixel-geyser'],
    modeTrail: [],
    gameRow: built.rows.find((r) => r.name === 'pixel-geyser'),
    now: built.now,
    config: {},
    mathModel: {},
    slug: 'pixel-geyser',
  });
  const state = { ...built, focus: 'pixel-geyser', modeRows, nav: { ...initialNav(), level: LEVEL.GAME, game: 'pixel-geyser', tab: 'health' } };
  const text = stripAnsi(renderFrame(state, { cols: 100, rows: 30 }).join('\n'));
  assert.ok(text.includes('BASE'));
  assert.ok(text.includes('ANTE'));
  assert.ok(text.includes('96.5'));
});

test('renderPlain prints a snapshot with no ANSI escapes', () => {
  const out = renderPlain(buildState(dashboard, trails));
  assert.ok(!hasAnsi(out));
  assert.ok(out.includes('pixel-geyser'));
});

// --- real payload shapes -------------------------------------------------

test('the roster table reads the live payload shape', async () => {
  const { roster, games, gameStats, balance } = await import('./fixtures/live.mjs');
  const live = {
    meta: { auth_state: 'ok', last_ok: String(Date.now()), sid_source: 'chrome', sid_fingerprint: 'cae3be59', persistence: 'off' },
    roster: { ts: Date.now(), ok: true, data: roster },
    games: { ts: Date.now(), ok: true, data: games },
    balance: { ts: Date.now(), ok: true, data: balance },
    perGame: { 'pixel-carnivals': { ts: Date.now(), ok: true, data: gameStats } },
    alerts: [],
    gameNames: ['neon-city-heist', 'pixel-carnivals', 'pixel-nest'],
  };
  const state = buildState(live, { team: [], online: [], games: {} });

  // `berry` is isLive in the captured catalogue but absent from the captured
  // roster - the launch case, appended after the roster's own rows.
  assert.deepEqual(state.rows.map((r) => r.name), ['neon-city-heist', 'pixel-carnivals', 'pixel-nest', 'berry']);
  assert.equal(state.rows.find((r) => r.name === 'berry').pending, true);
  assert.equal(state.rows.find((r) => r.name === 'berry').turnoverUsd, null);
  const christmas = state.rows.find((r) => r.name === 'pixel-carnivals');
  assert.equal(christmas.turnover, 41446150864, 'metrics come from the nested stats object');
  assert.equal(christmas.count, 14822);
  assert.equal(state.online, 5, 'online players is the sum across the catalogue');

  const text = stripAnsi(renderFrame(withNav(state), { cols: 100, rows: 30 }).join('\n'));
  assert.ok(text.includes('pixel-carnivals'));
  assert.ok(!text.includes('NaN'));
});

test('the drill-down reads the per-mode array and shows RTP as a percentage', async () => {
  const { roster, games, gameStats } = await import('./fixtures/live.mjs');
  const live = {
    meta: {}, roster: { ok: true, data: roster }, games: { ok: true, data: games },
    perGame: { 'pixel-carnivals': { ts: Date.now(), ok: true, data: gameStats } },
    alerts: [], gameNames: [],
  };
  const built = buildState(live, { team: [], online: [], games: {} });
  const modeRows = buildModeRows({
    snapshot: live.perGame['pixel-carnivals'],
    modeTrail: [],
    gameRow: built.rows.find((r) => r.name === 'pixel-carnivals'),
    now: built.now,
    config: {},
    mathModel: {},
    slug: 'pixel-carnivals',
  });
  const state = { ...built, focus: 'pixel-carnivals', modeRows, nav: { ...initialNav(), level: LEVEL.GAME, game: 'pixel-carnivals', tab: 'health' } };
  const text = stripAnsi(renderFrame(state, { cols: 100, rows: 30 }).join('\n'));

  assert.ok(text.includes('BASE'), text);
  assert.ok(text.includes('BONUS_BOOST'), text);
  // rtp arrives as 0.96699..., which is 96.70% - not "0.97".
  assert.ok(text.includes('96.70'), text);
  assert.ok(!text.includes('NaN'));
});

test('large real-world figures do not collide between columns', async () => {
  const { roster, games, balance } = await import('./fixtures/live.mjs');
  const live = {
    meta: { last_ok: String(Date.now()) },
    roster: { ok: true, data: roster },
    games: { ok: true, data: games },
    balance: { ok: true, data: balance },
    perGame: {}, alerts: [], gameNames: [],
  };
  const state = buildState(live, { team: [], online: [], games: {} });

  // Turnover here is 41,446,150,864 raw micro-dollars - $41,446.15. Printed
  // raw it ran into the neighbouring column and read as one wrong number.
  const slugs = roster.map((g) => g.slug);
  for (const line of renderPlain(state).split('\n')) {
    if (!slugs.some((slug) => line.startsWith(slug))) continue;
    const fields = line.trim().split(/\s+/);
    assert.equal(fields.length, 13, `column collision in: "${line}"`);
  }

  const frame = renderFrame(withNav(state), { cols: 120, rows: 30 }).map(stripAnsi).join('\n');
  assert.ok(frame.includes('$41,446.15'), frame);
  assert.ok(!frame.includes('41446150864'), 'raw micro-dollar figures should never reach the table');
});

test('the roster table reports the same money the accounting page does', async () => {
  const { roster, games, balance } = await import('./fixtures/live.mjs');
  const live = {
    meta: { last_ok: String(Date.now()) },
    roster: { ok: true, data: roster },
    games: { ok: true, data: games },
    balance: { ok: true, data: balance },
    perGame: {}, alerts: [], gameNames: [],
  };
  const state = buildState(live, { team: [], online: [], games: {} });
  const christmas = state.rows.find((r) => r.name === 'pixel-carnivals');

  // Page, for this game: turnover $41,434.89 profit -$2,241.02 expected $102.55.
  // Our capture is a slightly later snapshot, hence the small differences.
  assert.equal(christmas.turnoverUsd.toFixed(2), '41446.15');
  assert.equal(christmas.profitUsd.toFixed(2), '-2243.14');
  assert.equal(christmas.expectedUsd.toFixed(2), '102.58');

  const text = stripAnsi(renderFrame(withNav(state), { cols: 170, rows: 30 }).join('\n'));
  assert.ok(text.includes('-$2,243.14'), text);
  assert.ok(text.includes('$102.58'), text);
  assert.ok(text.includes('position'), 'the header should show the balance position');
});

test('RTP stays computed from the gross figures, not the studio share', () => {
  const state = buildState(dashboard, trails);
  const galaxy = state.rows.find((r) => r.name === 'pixel-geyser');
  // gross: 1 - 12410/412880 = 96.99%. Using the 10% share would give 99.70%.
  assert.equal(galaxy.rtp.toFixed(2), '96.99');
});

test('the table carries a per-minute delta for both turnover and profit', () => {
  const MIN = 60000;
  const t0 = Date.now() - 2 * MIN;
  // Two consecutive minute samples: turnover +$46.00, profit +$4.60 gross.
  const trail = [
    { ts: t0, fields: { turnover: 412880e6, profit: 12410e6, count: 1204 } },
    { ts: t0 + MIN, fields: { turnover: 412926e6, profit: 12414.6e6, count: 1230 } },
  ];
  const state = buildState(dashboard, { team: [], online: [], games: { 'pixel-geyser': trail } });
  const galaxy = state.rows.find((r) => r.name === 'pixel-geyser');

  assert.equal(galaxy.dTurnoverUsd.toFixed(2), '46.00');
  // The profit delta takes the same 10% share the PROFIT column does.
  assert.equal(galaxy.dProfitUsd.toFixed(2), '0.46');
  assert.equal(galaxy.dCount, 26);

  const text = stripAnsi(renderFrame(withNav(state), { cols: 140, rows: 30 }).join('\n'));
  assert.ok(text.includes('TURN/m'), text);
  assert.ok(text.includes('PROFIT/m'), text);
  assert.ok(text.includes('BETS/m'), text);
  assert.ok(text.includes('+$46.00'), text);
  assert.ok(text.includes('+$0.46'), text);
  assert.ok(text.includes('+26'), text);
});

test('the plain snapshot carries both deltas too', () => {
  const MIN = 60000;
  const t0 = Date.now() - 2 * MIN;
  const trail = [
    { ts: t0, fields: { turnover: 412880e6, profit: 12410e6, count: 1204 } },
    { ts: t0 + MIN, fields: { turnover: 412926e6, profit: 12414.6e6, count: 1230 } },
  ];
  const out = renderPlain(buildState(dashboard, { team: [], online: [], games: { 'pixel-geyser': trail } }));
  assert.ok(out.includes('TURN/m'));
  assert.ok(out.includes('PROFIT/m'));
  assert.ok(out.includes('BETS/m'));
  assert.ok(out.includes('+$46.00'));
  assert.ok(out.includes('+$0.46'));
  assert.ok(out.includes('+26'));
});

test('a game with only one sample shows no delta rather than a fake zero', () => {
  const trail = [{ ts: Date.now(), fields: { turnover: 412880e6, profit: 12410e6, count: 1204 } }];
  const state = buildState(dashboard, { team: [], online: [], games: { 'pixel-geyser': trail } });
  const galaxy = state.rows.find((r) => r.name === 'pixel-geyser');
  assert.equal(galaxy.dTurnoverUsd, null);
  assert.equal(galaxy.dProfitUsd, null);
  assert.equal(galaxy.dCount, null);
  const text = stripAnsi(renderFrame(withNav(state), { cols: 140, rows: 30 }).join('\n'));
  assert.ok(!text.includes('NaN'));
});

test('the day line reports no reading rather than zero before the trail covers the window', () => {
  const state = buildState(dashboard, { team: [], online: [], games: {} });
  const text = stripAnsi(renderFrame(withNav(state), { cols: 140, rows: 30 }).join('\n'));
  assert.ok(text.includes('day since 12:00Z'), text);
  assert.ok(/day since 12:00Z\s+bets -\s+turnover -\s+profit -/.test(text), text);
  assert.ok(text.includes('no trail in this window yet'), text);
});

test('the day figures accumulate from the 12:00 UTC boundary', () => {
  const noon = Date.UTC(2026, 8, 16, 12, 0, 0);
  const now = noon + 5 * 60000;
  // One sample before the boundary and five after it.
  const trail = [-1, 0, 1, 2, 3, 4, 5].map((m) => ({
    ts: noon + m * 60000,
    fields: { turnover: (100 + m) * 1e6 * 10, profit: (10 + m) * 1e6, count: 100 + m * 10 },
  }));
  const state = buildState(dashboard, { team: [], online: trail, games: { 'pixel-geyser': trail } }, now);
  const galaxy = state.rows.find((r) => r.name === 'pixel-geyser');

  // Five deltas of ten bets land at minutes 1..5. The sample at minute -1 has
  // no predecessor, and the step arriving AT minute 0 covers 11:59-12:00 -
  // the day before - so the noon sample is the day's baseline, not its first
  // delta.
  assert.ok(galaxy.dayTurnoverUsd > 0, 'day turnover should accumulate');
  assert.equal(galaxy.dayCount, 50, 'five minutes of ten bets');
  assert.equal(state.dayFrom, noon);
});

test('the events pane names what might be happening', () => {
  const now = Date.now();
  const withEvents = {
    ...dashboard,
    alerts: [
      { ts: now - 60000, severity: 'crit', kind: 'spike', game: 'pixel-nest', metric: 'onlinePlayers', z: 7, message: '20 players arrived' },
      { ts: now - 60000, severity: 'warn', kind: 'spike', game: 'pixel-nest', metric: 'turnover', z: 5, message: 'turnover +$46.00/min' },
    ],
  };
  const text = stripAnsi(renderFrame(withNav(buildState(withEvents, trails)), { cols: 140, rows: 40 }).join('\n'));
  assert.ok(text.includes('POSSIBLE EVENTS'), text);
  assert.ok(text.includes('TRAFFIC SURGE'), text);
  assert.ok(text.includes('pixel-nest'), text);
  assert.ok(text.includes('FINDINGS'), 'the raw findings stay visible below the interpretation');
});

test('the running action log shows recent five-minute windows', () => {
  const now = Date.now();
  const withLog = {
    ...dashboard,
    summaries: [
      { from: now - 5 * 60000, to: now, minutes: 5, turnover: 4600e6, profit: 460e6, count: 130, activeGames: 3, topMover: 'berry', alerts: 1, crits: 0, warns: 1 },
      { from: now - 10 * 60000, to: now - 5 * 60000, minutes: 5, turnover: 3000e6, profit: 300e6, count: 90, activeGames: 2, topMover: 'pixel-geyser', alerts: 0, crits: 0, warns: 0 },
    ],
  };
  const text = stripAnsi(renderFrame(withNav(buildState(withLog, trails)), { cols: 140, rows: 40 }).join('\n'));
  assert.ok(text.includes('RUNNING ACTION (5 min)'), text);
  assert.ok(text.includes('+$4,600.00'), text);
  assert.ok(text.includes('berry'), text);
  assert.ok(text.includes('3 active'), text);
});

// --- profit by hour / by five minutes ------------------------------------

const BUCKET_NOW = Date.parse('2026-09-16T14:42:30Z');
const M = 60000;

/** Cumulative trail: `byMinute` maps minutes-before-now to the running total. */
const bucketTrail = (byMinute, field = 'profit') =>
  Object.entries(byMinute)
    .map(([back, v]) => ({ ts: BUCKET_NOW - Number(back) * M, fields: { [field]: v } }))
    .sort((a, b) => a.ts - b.ts);

const bucketModeTrail = (byMinute) =>
  Object.entries(byMinute)
    .map(([back, fields]) => ({ ts: BUCKET_NOW - Number(back) * M, fields }))
    .sort((a, b) => a.ts - b.ts);

const bucketDashboard = {
  ...dashboard,
  meta: { ...dashboard.meta, last_ok: String(BUCKET_NOW) },
  alerts: [],
};

// pixel-geyser gross profit climbing; 10% of it is what the studio shows.
const bucketTrails = {
  team: [],
  online: [],
  games: {
    // A hole at 14:35: sampled at 14:25 and 14:30, nothing until 14:40.
    'pixel-geyser': bucketTrail({ 17: 0, 12: 1_000_000, 2: 3_000_000 }),
    'pixel-carnivals': [],
  },
  modes: {
    'pixel-geyser': bucketModeTrail({
      17: { 'BASE:profit': 0, 'FREE_SPINS:profit': 0 },
      12: { 'BASE:profit': 700_000, 'FREE_SPINS:profit': 300_000 },
      2: { 'BASE:profit': 1_800_000, 'FREE_SPINS:profit': 1_200_000 },
    }),
    'pixel-carnivals': [],
  },
};

const bucketState = (over = {}) => {
  const state = buildState(bucketDashboard, bucketTrails, BUCKET_NOW, { pollMinutes: 5 });
  const focus = 'focus' in over ? over.focus : 'pixel-geyser';
  const bucket = 'bucket' in over ? over.bucket : '5m';
  const nav = focus && bucket
    ? { ...initialNav(), level: LEVEL.GAME, game: focus, tab: 'buckets', bucket }
    : { ...initialNav() };
  return Object.assign(state, { focus, bucket, nav }, over);
};

test('the bucket view names the game, the granularity and the timezone it labels in', () => {
  const text = stripAnsi(renderFrame(bucketState(), { cols: 140, rows: 30 }).join('\n'));
  assert.ok(text.includes('pixel-geyser'), text);
  assert.ok(/profit by 5m/i.test(text), text);
  assert.ok(/UTC/.test(text), 'an hour bucket aligned to UTC must not be labelled in local time');
});

test('the bucket view puts the whole game beside each of its bet modes', () => {
  const text = stripAnsi(renderFrame(bucketState(), { cols: 140, rows: 30 }).join('\n'));
  assert.ok(text.includes('TOTAL'), text);
  assert.ok(text.includes('BASE'), text);
  assert.ok(text.includes('FREE_SPINS'), text);
  assert.ok(text.indexOf('BASE') < text.indexOf('FREE_SPINS'), 'BASE sorts first');
});

test('bucket profit is the studio share, matching the roster PROFIT column', () => {
  const text = stripAnsi(renderFrame(bucketState(), { cols: 140, rows: 30 }).join('\n'));
  // 2,000,000 raw units over the 14:40 bucket -> $2.00 gross -> $0.20 at 10%.
  assert.ok(text.includes('+$0.20'), `expected the 10% share, got:\n${text}`);
  assert.ok(!text.includes('+$2.00'), 'the gross figure would overstate the studio position tenfold');
});

test('a bucket the trail skipped reads as a dash, not as zero', () => {
  const text = stripAnsi(renderFrame(bucketState(), { cols: 140, rows: 30 }).join('\n'));
  // The game view's own tab strip literally reads "4 BUCKETS" - an EARLIER
  // occurrence of the substring "BUCKET" than the table's own column header -
  // so `split('BUCKET')[1]` (the segment between the first and second
  // occurrence) no longer isolates the table. `lastIndexOf` finds the real
  // column header instead; the assertions below are unchanged.
  const body = text.slice(text.lastIndexOf('BUCKET'));
  const gap = body.split('\n').find((l) => l.includes('14:35'));
  assert.ok(gap, `the skipped bucket must still get a row, got:\n${body}`);
  assert.ok(/-\s+-\s+-/.test(gap), `an unmeasured bucket must be blank, got: ${gap}`);
  assert.ok(!body.includes('$0.00'), 'a measured quiet period and an absent one are different claims');
});

test('buckets from before the trail began are dropped rather than padding the table', () => {
  const text = stripAnsi(renderFrame(bucketState(), { cols: 140, rows: 30 }).join('\n'));
  assert.ok(!text.includes('13:'), `nothing was measured before 14:25, so no 13:xx row belongs here:\n${text}`);
});

test('hour granularity is offered as well as five minutes', () => {
  const text = stripAnsi(renderFrame(bucketState({ bucket: '1h' }), { cols: 140, rows: 30 }).join('\n'));
  assert.ok(/profit by 1h/i.test(text), text);
});

test('with no per-mode trail the totals still read and the gap is explained', () => {
  const trailsNoModes = { ...bucketTrails, modes: { 'pixel-geyser': [], 'pixel-carnivals': [] } };
  const state = buildState(bucketDashboard, trailsNoModes, BUCKET_NOW, { pollMinutes: 5 });
  Object.assign(state, { focus: 'pixel-geyser', bucket: '5m', nav: { ...initialNav(), level: LEVEL.GAME, game: 'pixel-geyser', tab: 'buckets', bucket: '5m' } });
  const text = stripAnsi(renderFrame(state, { cols: 140, rows: 30 }).join('\n'));
  assert.ok(text.includes('TOTAL'), 'the whole-game figures do not depend on per-mode recording');
  assert.ok(/no per-mode trail yet/i.test(text), `the reader must be told why the columns are missing:\n${text}`);
});

test('the bucket view fits a narrow terminal by dropping mode columns, not by overflowing', () => {
  for (const cols of [40, 60, 80, 140]) {
    const lines = renderFrame(bucketState(), { cols, rows: 24 });
    for (const line of lines) {
      assert.ok(stripAnsi(line).length <= cols, `line too wide at cols=${cols}: ${stripAnsi(line)}`);
    }
  }
});

test('renderPlain carries the bucket table so it can be piped', () => {
  const text = renderPlain(bucketState());
  assert.ok(/PROFIT BY 5M/i.test(text), text);
  assert.ok(text.includes('FREE_SPINS'), text);
  assert.ok(text.includes('pixel-geyser'), text);
});

test('the bucket view replaces the roster table rather than being appended to it', () => {
  const text = stripAnsi(renderFrame(bucketState(), { cols: 140, rows: 30 }).join('\n'));
  assert.ok(!text.includes('TURNOVER'), 'the roster table would push the buckets off the screen');
});

test('without a bucket granularity selected nothing changes about the frame', () => {
  const text = stripAnsi(renderFrame(bucketState({ bucket: null, focus: null }), { cols: 140, rows: 30 }).join('\n'));
  assert.ok(text.includes('TURNOVER'), 'the roster table is still the default view');
  assert.ok(!/profit by/i.test(text));
});

// --- games that go live mid-run ------------------------------------------

const withLiveNewcomer = {
  ...dashboard,
  games: {
    ts: Date.now(),
    ok: true,
    data: [
      { name: 'Pixel Geyser', slug: 'pixel-geyser', isLive: true, onlinePlayers: 200, stats: null },
      { name: 'Pixel Carnivals', slug: 'pixel-carnivals', isLive: true, onlinePlayers: 141, stats: null },
      // Live, but /stats has not grown a row for it yet.
      { name: 'Hippo Hustle', slug: 'hippo-hustle', isLive: true, onlinePlayers: 3, stats: null },
      { name: 'Tweaker Park', slug: 'tweaker-park', isLive: false, onlinePlayers: 0, stats: null },
    ],
  },
};

test('a live game missing from the roster still gets a row', () => {
  const state = buildState(withLiveNewcomer, trails);
  const names = state.rows.map((r) => r.name);
  assert.ok(names.includes('hippo-hustle'), `expected a row for the newcomer, got ${names}`);
  assert.ok(!names.includes('tweaker-park'), 'a dark title is not on the roster');
});

test('the newcomer reports dashes, never zeros, for figures nobody has measured', () => {
  const row = buildState(withLiveNewcomer, trails).rows.find((r) => r.name === 'hippo-hustle');
  for (const field of ['turnoverUsd', 'profitUsd', 'dayTurnoverUsd', 'dayProfitUsd', 'count', 'unique', 'rtp']) {
    assert.equal(row[field], null, `${field} must be null - $0.00 would claim a measurement`);
  }
  assert.equal(row.online, 3, 'concurrency is real and comes from the catalogue');
  assert.equal(row.pending, true);
});

test('the newcomer renders as dashes in the roster table', () => {
  const state = buildState(withLiveNewcomer, trails);
  const line = stripAnsi(renderFrame(withNav(state), { cols: 170, rows: 30 }).join('\n'))
    .split('\n').find((l) => l.includes('hippo-hustle'));
  assert.ok(line, 'the row must reach the screen');
  assert.ok(!line.includes('$0.00'), `a launch with no bets is not a measured zero: ${line}`);
  assert.ok(line.includes('3'), `its concurrent players are known: ${line}`);
});

test('the newcomer does not drag the roster totals towards zero', () => {
  const before = buildState(dashboard, trails);
  const after = buildState(withLiveNewcomer, trails);
  const sum = (s) => s.rows.reduce((a, r) => a + (r.turnoverUsd ?? 0), 0);
  assert.equal(sum(after), sum(before), 'an unmeasured row must contribute nothing, not zero-weight the average');
});

test('a catalogue with no isLive flags at all still shows the roster', () => {
  const legacy = { ...dashboard, games: { ts: Date.now(), ok: true, data: [{ slug: 'pixel-geyser', onlinePlayers: 200 }] } };
  const names = buildState(legacy, trails).rows.map((r) => r.name);
  assert.deepEqual(names, ['pixel-geyser', 'pixel-carnivals'], 'absent isLive must not invent or drop rows');
});

test('the plain snapshot also refuses to invent zeros for the newcomer', () => {
  const line = renderPlain(buildState(withLiveNewcomer, trails))
    .split('\n').find((l) => l.includes('hippo-hustle'));
  assert.ok(line, 'the row must survive into the piped output');
  assert.ok(!/\s0\s/.test(line), `no counted zero belongs on an unmeasured game: ${line}`);
  assert.ok(!line.includes('$0.00'), line);
});

test('a mode name longer than the column does not collide with its neighbour', () => {
  const base = Date.parse('2026-09-16T14:00:00Z');
  const long = [
    { ts: base, fields: { 'FREE_SPINS:profit': 0, 'NEITHER_OR_NONE:profit': 0 } },
    { ts: base + 5 * 60000, fields: { 'FREE_SPINS:profit': 10, 'NEITHER_OR_NONE:profit': 20 } },
  ];
  const state = buildState(bucketDashboard, { ...bucketTrails, modes: { 'pixel-geyser': long } }, base + 5 * 60000, { pollMinutes: 5 });
  Object.assign(state, { focus: 'pixel-geyser', bucket: '5m' });

  const header = renderPlain(state).split('\n').find((l) => l.includes('NEITHER_OR_NONE'));
  assert.ok(header, 'the long mode must appear');
  assert.ok(!header.includes('FREE_SPINSNEITHER_OR_NONE'), `columns ran together: ${header}`);
  assert.match(header, /FREE_SPINS\s+NEITHER_OR_NONE/);
});

// --- state.mjs split ------------------------------------------------------

test('buildState is importable from state.mjs and agrees with the render.mjs re-export', () => {
  const a = buildState(dashboard, trails);
  const b = buildStateDirect(dashboard, trails);
  assert.deepEqual(a.rows.map((r) => r.name), b.rows.map((r) => r.name));
});

test('modeList finds the per-mode array wherever the response nests it', () => {
  const modes = [{ mode: 'BASE' }];
  assert.deepEqual(modeList({ stats: modes }), modes);
  assert.deepEqual(modeList({ modes }), modes);
  assert.deepEqual(modeList(modes), modes);
  assert.deepEqual(modeList(null), []);
});
