import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createWebServer } from '../src/web/server.mjs';
import { buildInsights } from '../src/insights/model.mjs';
import { runInNewContext } from 'node:vm';
import { INSIGHTS_JS } from '../src/web/insights-assets.mjs';
import { eventsList } from '../src/web/views/parts.mjs';

const now = Date.parse('2026-09-17T14:00:00Z');
const row = { slug: 'berry', name: '<script>Berry</script>', stats: { unique: 10, count: 20, turnover: 100e6, profit: -10e6, expectedProfit: 3e6 } };
const snapshot = { trackingStart: '2026-07-24', days: { '2026-09-17': { rows: [row], fetchedAt: now } }, cumulative: { '2026-09-16': [], '2026-09-17': [row] } };
async function setup(t, opts = {}) {
  const server = createWebServer({ read: async (query) => ({ model: buildInsights({ snapshot, now, query }), state: { now, meta: { team: 'acme-studios', sid_fingerprint: 'SECRET' }, rows: [], ageMs: 1000 } }), ...opts });
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  t.after(() => new Promise(resolve => { server.close(resolve); server.closeAllConnections(); }));
  return `http://127.0.0.1:${server.address().port}`;
}
test('dashboard renders measured daily players, filters and escaped game names', async t => {
  const base = await setup(t);
  const res = await fetch(base + '/insights?from=2026-09-17&to=2026-09-17&game=berry');
  const body = await res.text();
  assert.equal(res.status, 200);
  assert.match(body, /Player insights/);
  assert.match(body, /Daily players/);
  assert.match(body, /New to game/);
  assert.match(body, /name="game"/);
  assert.match(body, /&lt;script&gt;Berry/);
  assert.ok(!body.includes('<script>Berry'));
  assert.ok(!body.includes('SECRET'));
  assert.ok(!body.includes('sid_fingerprint'));
  assert.match(res.headers.get('content-security-policy'), /default-src 'none'/);
});
test('fragment, CSV, health, invalid routes and methods have correct HTTP behavior', async t => {
  const base = await setup(t);
  const frag = await (await fetch(base + '/?fragment=1')).text();
  assert.ok(!frag.includes('<html'));
  const csv = await fetch(base + '/export.csv?from=2026-09-17&to=2026-09-17&game=berry');
  assert.match(csv.headers.get('content-type'), /text\/csv/);
  assert.match(await csv.text(), /2026-09-17,berry,10,10,0/);
  const health = await fetch(base + '/healthz');
  assert.equal(health.status, 200);
  assert.match((await health.json()).version, /^\d+\.\d+\.\d+$/);
  assert.equal((await fetch(base + '/nope')).status, 404);
  assert.equal((await fetch(base + '/', { method: 'POST' })).status, 405);
  assert.equal((await (await fetch(base + '/', { method: 'HEAD' })).text()), '');
});
test('read errors produce a controlled 503 without raw error text', async t => {
  const base = await setup(t, { read: async () => { throw new Error('secret credentials'); } });
  const res = await fetch(base);
  assert.equal(res.status, 503);
  assert.ok(!(await res.text()).includes('secret credentials'));
});

test('browser reports refresh failures while preserving data and clears the notice on recovery', async () => {
  let refresh, ok = false;
  const main = { innerHTML: 'Cached figures', contains: () => false };
  const status = { hidden: true, textContent: '' };
  const document = { hidden: false, activeElement: {}, querySelector: s => s === 'main' ? main : null,
    querySelectorAll: () => [], getElementById: () => status, addEventListener() {} };
  // By delay, not by registration order: the script registers more than one
  // interval (the poll countdown runs on its own), and "whichever came last"
  // silently captured the wrong callback the moment a second one was added.
  runInNewContext(INSIGHTS_JS, { document, URL, location: { href: 'http://localhost/' }, AbortSignal, performance: { now: () => 0 },
    fetch: async () => ({ ok, text: async () => 'Fresh figures' }), setInterval: (fn, ms) => { if (ms === 30000) refresh = fn; } });
  await refresh();
  assert.equal(main.innerHTML, 'Cached figures');
  assert.equal(status.hidden, false);
  assert.match(status.textContent, /failed/i);
  ok = true; await refresh();
  assert.equal(main.innerHTML, 'Fresh figures');
  assert.equal(status.hidden, true);
});

test('a dismissed warning stays hidden in this browser, through a live refresh, and a different one does not', async () => {
  let refresh;
  const listeners = {};
  const notice = (key) => ({ hidden: false, dataset: { dismissKey: key } });
  let notices = [notice('math-drift:aaaaaaaaaaaa'), notice('math-uncaptured:bbbbbbbbbbbb')];
  const main = { contains: () => false, set innerHTML(_) { notices = [notice('math-drift:aaaaaaaaaaaa'), notice('math-uncaptured:bbbbbbbbbbbb')]; } };
  const document = { hidden: false, activeElement: {}, querySelector: s => s === 'main' ? main : null, getElementById: () => null,
    querySelectorAll: s => s === '[data-dismiss-key]' ? notices : [], addEventListener(type, fn) { (listeners[type] ??= []).push(fn); } };
  const store = new Map();
  const localStorage = { getItem: (k) => store.get(k) ?? null, setItem: (k, v) => store.set(k, String(v)) };
  runInNewContext(INSIGHTS_JS, { document, URL, location: { href: 'http://localhost/math' }, AbortSignal, performance: { now: () => 0 }, localStorage,
    fetch: async () => ({ ok: true, text: async () => 'fresh' }), setInterval: (fn, ms) => { if (ms === 30000) refresh = fn; } });
  const target = notices[0];
  const button = { closest: (s) => (s === '[data-dismiss]' ? button : s === '[data-dismiss-key]' ? target : null) };
  listeners.click.forEach((fn) => fn({ target: button }));
  assert.equal(target.hidden, true, 'hidden at once');
  assert.deepEqual(JSON.parse(store.get('stake-polling:dismissed')), ['math-drift:aaaaaaaaaaaa']);
  await refresh();
  assert.equal(notices[0].hidden, true, 'the refreshed copy of the same warning stays hidden');
  assert.equal(notices[1].hidden, false, 'a different warning is untouched');
});

test('with browser storage blocked, dismissing still hides the warning rather than throwing', () => {
  const listeners = {};
  const target = { hidden: false, dataset: { dismissKey: 'math-drift:aaaaaaaaaaaa' } };
  const document = { hidden: false, activeElement: {}, querySelector: s => (s === 'main' ? { contains: () => false } : null), getElementById: () => null,
    querySelectorAll: s => (s === '[data-dismiss-key]' ? [target] : []), addEventListener(type, fn) { (listeners[type] ??= []).push(fn); } };
  const localStorage = { getItem() { throw new Error('SecurityError'); }, setItem() { throw new Error('SecurityError'); } };
  runInNewContext(INSIGHTS_JS, { document, URL, location: { href: 'http://localhost/math' }, AbortSignal, performance: { now: () => 0 }, localStorage, fetch: async () => ({}), setInterval() {} });
  const button = { closest: (s) => (s === '[data-dismiss]' ? button : s === '[data-dismiss-key]' ? target : null) };
  assert.doesNotThrow(() => listeners.click.forEach((fn) => fn({ target: button })));
  assert.equal(target.hidden, true);
});

// A stand-in DOM just deep enough for the chart tooltip: it records text set
// through textContent and would throw on innerHTML, which the tooltip must
// never use - series names come from the upstream API.
function fakeTipDom() {
  const listeners = {};
  const el = (tag) => ({ tag, children: [], style: {}, hidden: false, className: '', textContent: '', offsetWidth: 100, offsetHeight: 50,
    set innerHTML(_) { throw new Error('tooltip must not use innerHTML'); },
    append(...kids) { this.children.push(...kids); }, replaceChildren(...kids) { this.children = kids; }, setAttribute() {} });
  const body = el('body');
  const document = { hidden: false, activeElement: {}, body, documentElement: { clientWidth: 1000, clientHeight: 800 },
    querySelector: s => s === 'main' ? { innerHTML: '', contains: () => false } : null, querySelectorAll: () => [], getElementById: () => null,
    createElement: el, addEventListener(type, fn) { (listeners[type] ??= []).push(fn); } };
  const fire = (type, event) => (listeners[type] ?? []).forEach(fn => fn(event));
  const text = (node) => [node.textContent, ...node.children.map(text)].join('|');
  return { document, body, fire, text };
}

test('hovering a chart band shows that point\'s label and every series value, as text', () => {
  const { document, body, fire, text } = fakeTipDom();
  runInNewContext(INSIGHTS_JS, { document, URL, location: { href: 'http://localhost/' }, AbortSignal, fetch: async () => ({}), setInterval() {} });
  const hit = { dataset: { tip: JSON.stringify({ label: '2026-09-11', rows: [{ name: '<b>players</b>', value: '1680', colour: '#38d6c4' }, { name: 'returning', value: '-', colour: '#7ddf64' }] }) } };
  fire('pointermove', { target: { closest: () => hit }, clientX: 300, clientY: 200 });
  assert.equal(body.children.length, 1, 'one tooltip, created on first use');
  const tip = body.children[0];
  assert.equal(tip.hidden, false);
  const shown = text(tip);
  for (const part of ['2026-09-11', '<b>players</b>', '1680', 'returning', '-']) assert.ok(shown.includes(part), `tooltip shows ${part}`);
  fire('pointermove', { target: { closest: () => null }, clientX: 0, clientY: 0 });
  assert.equal(tip.hidden, true, 'leaving the band hides it');
  assert.equal(body.children.length, 1);
});

test('the tooltip flips to stay inside the viewport at the right edge', () => {
  const { document, body, fire } = fakeTipDom();
  runInNewContext(INSIGHTS_JS, { document, URL, location: { href: 'http://localhost/' }, AbortSignal, fetch: async () => ({}), setInterval() {} });
  const hit = { dataset: { tip: JSON.stringify({ label: 'd', rows: [] }) } };
  fire('pointermove', { target: { closest: () => hit }, clientX: 980, clientY: 200 });
  assert.ok(parseFloat(body.children[0].style.left) + 100 <= 1000, 'right edge stays on screen');
});

test('a malformed data-tip hides the tooltip instead of throwing', () => {
  const { document, fire } = fakeTipDom();
  runInNewContext(INSIGHTS_JS, { document, URL, location: { href: 'http://localhost/' }, AbortSignal, fetch: async () => ({}), setInterval() {} });
  assert.doesNotThrow(() => fire('pointermove', { target: { closest: () => ({ dataset: { tip: '{nope' } }) }, clientX: 1, clientY: 1 }));
});

test('live synthesized events carry a finding count, not an array', () => {
  const markup = String(eventsList([{ title: 'Traffic shift', confidence: 'medium', findings: 3 }]));
  assert.match(markup, /3 findings/);
});

// The game/mode routes used to redirect to `/?game=<slug>` as a placeholder.
// No test in this file ever asserted that 302 - the redirect existed only in
// src/web/server.mjs itself - so there is no prior assertion to update here;
// this is new coverage for the real pages that replaced it.
const richMoney = { unitsPerDollar: 1_000_000, profitShare: 0.1, expectedShare: 0.075 };
async function setupGamePages(t, stateOverrides = {}) {
  const server = createWebServer({ read: async (query) => ({
    model: buildInsights({ snapshot, now, query }),
    state: {
      now, meta: { team: 'acme-studios' }, rows: [], ageMs: 1000, money: richMoney,
      math: { berry: { edge: 0.033, maxWin: 20000, version: 2, baseVolatility: 9.58, volatilityClass: 'LOW', costLadder: [1],
        modes: { BASE: { cost: 1, rtp: 0.967, sigma: 5, zeroRate: 0.5, worstLossStreak: 10 } } } },
      modeRows: { berry: [{ mode: 'BASE', count: 100, turnover: 100_000_000, profit: 3_300_000, rtp: 0.967, expectedReturn: 3_300_000, cost: 1, avgBet: 0.4 }] },
      modeDays: {},
      ...stateOverrides,
    },
  }) });
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  t.after(() => new Promise(resolve => { server.close(resolve); server.closeAllConnections(); }));
  return `http://127.0.0.1:${server.address().port}`;
}
test('a known game renders its own page rather than redirecting to the filter', async t => {
  const base = await setupGamePages(t);
  const res = await fetch(base + '/game/berry');
  assert.equal(res.status, 200);
  assert.notEqual(res.headers.get('location'), '/?game=berry');
  const body = await res.text();
  assert.match(body, /Version 2/);
  assert.match(body, /href="\/game\/berry\/mode\/BASE/);
});
test('a bet mode within a known game renders the drilldown', async t => {
  const base = await setupGamePages(t);
  const res = await fetch(base + '/game/berry/mode/BASE');
  assert.equal(res.status, 200);
  assert.match(await res.text(), /does not report player identity per bet mode/i);
});
test('an unknown game 404s and an unknown section under a known game 404s', async t => {
  const base = await setupGamePages(t);
  assert.equal((await fetch(base + '/game/nope')).status, 404);
  assert.equal((await fetch(base + '/game/berry/nope')).status, 404);
});
// Every other route here matches exactly; the game/mode routes must too - a
// trailing empty segment or a trailing extra segment is not "the same page".
test('a trailing slash on a game route 404s rather than rendering the page', async t => {
  const base = await setupGamePages(t);
  assert.equal((await fetch(base + '/game/berry/')).status, 404);
});
test('an extra segment past the mode value 404s rather than rendering the drilldown', async t => {
  const base = await setupGamePages(t);
  assert.equal((await fetch(base + '/game/berry/mode/BASE/extra')).status, 404);
});
// A malformed upstream payload (stats present but not an array) must not take
// the whole page down - the request handler's catch would turn that TypeError
// into an opaque 503 for a page that had everything else it needed.
test('a non-array stats payload renders the page with an empty mode table, not a 503', async t => {
  const base = await setupGamePages(t, { modeRows: { berry: { weird: 'shape' } } });
  const res = await fetch(base + '/game/berry');
  assert.equal(res.status, 200);
  const body = await res.text();
  assert.match(body, /0 modes/);
  assert.doesNotMatch(body, /Data temporarily unavailable/);
});
const MIN = 60000;
test('read() is told which game\'s bucket page is being requested, so it can fetch only that mode trail', async t => {
  let seenHint;
  const server = createWebServer({ read: async (query, hint) => {
    seenHint = hint;
    return { model: buildInsights({ snapshot, now, query }), state: { now, meta: {}, rows: [], ageMs: 1000, money: richMoney,
      math: {}, modeRows: { berry: [] }, modeDays: {} } };
  } });
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  t.after(() => new Promise(resolve => { server.close(resolve); server.closeAllConnections(); }));
  const base = `http://127.0.0.1:${server.address().port}`;
  await fetch(base + '/game/berry/buckets?cadence=15m');
  assert.equal(seenHint?.bucketsSlug, 'berry');
  await fetch(base + '/game/berry');
  assert.equal(seenHint?.bucketsSlug, null, 'the game page itself does not need a mode-trail fetch');
  await fetch(base + '/');
  assert.equal(seenHint?.bucketsSlug, null);
});
test('a game\'s bucket cadence page renders, defaulting to 1h', async t => {
  const base = await setupGamePages(t, {
    gameTrails: { berry: [{ ts: now - 60 * MIN, fields: { profit: 0 } }, { ts: now, fields: { profit: 90_000 } }] },
    modeTrails: { berry: [{ ts: now - 60 * MIN, fields: { 'BASE:profit': 0 } }, { ts: now, fields: { 'BASE:profit': 90_000 } }] },
    now,
  });
  const res = await fetch(base + '/game/berry/buckets');
  assert.equal(res.status, 200);
  const body = await res.text();
  assert.match(body, /Totals by 1h/);
  assert.match(body, /href="\?cadence=5m"/);
});
test('the cadence query switches granularity', async t => {
  const base = await setupGamePages(t, { now });
  const res = await fetch(base + '/game/berry/buckets?cadence=15m');
  assert.match(await res.text(), /Totals by 15m/);
});
test('a bucket page for an unknown game 404s, and a trailing segment past it 404s too', async t => {
  const base = await setupGamePages(t, { now });
  assert.equal((await fetch(base + '/game/nope/buckets')).status, 404);
  assert.equal((await fetch(base + '/game/berry/buckets/extra')).status, 404);
});
test('/math returns the game math corpus page with captured models', async t => {
  const base = await setupGamePages(t);
  const res = await fetch(base + '/math');
  assert.equal(res.status, 200);
  const body = await res.text();
  assert.match(body, /Game math/);
  assert.match(body, /CAPTURED MODELS/);
  assert.match(body, /Version/);
  assert.match(body, /Base volatility/);
});
test('/math/ and /math/anything both 404 rather than rendering the page', async t => {
  const base = await setupGamePages(t);
  assert.equal((await fetch(base + '/math/')).status, 404);
  assert.equal((await fetch(base + '/math/anything')).status, 404);
});

// --- The poll countdown, in the browser ----------------------------------
//
// The server sends a duration and app.js counts it down against
// performance.now(), so the readout survives a browser clock that disagrees
// with the server's. A fake clock here is what makes that testable: every
// assertion below moves time by hand rather than waiting for it.

function fakeCountdownDom({ nextPollMs = '60000', periodMs = '60000' } = {}) {
  const out = { textContent: '', tag: 'b' };
  const classes = new Set();
  const countdown = {
    dataset: { nextPollMs, periodMs },
    classList: { add: c => classes.add(c), remove: c => classes.delete(c), toggle: (c, on) => (on ? classes.add(c) : classes.delete(c)) },
    querySelector: s => (s === 'b' ? out : null),
  };
  const main = { innerHTML: 'Cached figures', contains: () => false };
  const document = {
    hidden: false, activeElement: {},
    querySelector: s => (s === 'main' ? main : s === '[data-next-poll-ms]' ? countdown : null),
    querySelectorAll: () => [], getElementById: () => null, addEventListener() {},
  };
  return { document, out, main, classes, countdown };
}

/** Run app.js against a fake DOM and clock; returns the registered intervals. */
function runApp(document, { clock, fetchImpl }) {
  const intervals = [];
  runInNewContext(INSIGHTS_JS, {
    document, URL, location: { href: 'http://localhost/live' }, AbortSignal,
    performance: { now: () => clock.now }, fetch: fetchImpl,
    setInterval: (fn, ms) => { intervals.push({ fn, ms }); },
  });
  return { tick: () => intervals.filter(i => i.ms === 250).forEach(i => i.fn()), intervals };
}

test('the countdown paints m:ss from the served duration and counts down on its own clock', () => {
  const clock = { now: 0 };
  const { document, out } = fakeCountdownDom({ nextPollMs: '47000' });
  const { tick } = runApp(document, { clock, fetchImpl: async () => ({ ok: true, text: async () => 'Fresh' }) });
  // Painted at startup, before any interval has fired.
  assert.equal(out.textContent, '0:47');
  clock.now = 20_000; tick();
  assert.equal(out.textContent, '0:27');
  clock.now = 46_500; tick();
  assert.equal(out.textContent, '0:01');
});

test('the refresh goes out just AFTER the boundary, not on it', async () => {
  // A request sent on the boundary itself races the tick that is still
  // fetching and writing, and would read back the previous minute's figures.
  const clock = { now: 0 };
  let fetches = 0;
  const { document, out, main, classes } = fakeCountdownDom({ nextPollMs: '1000' });
  const { tick } = runApp(document, { clock, fetchImpl: async () => { fetches++; return { ok: true, text: async () => 'Fresh figures' }; } });

  clock.now = 1000; tick();
  assert.equal(fetches, 0, 'nothing is fetched at the boundary itself');
  assert.equal(out.textContent, 'now');
  assert.ok(classes.has('due'));

  clock.now = 3600; tick();
  assert.equal(fetches, 1, 'and one refresh once the tick has had time to write');
  await new Promise(resolve => setImmediate(resolve));
  assert.equal(main.innerHTML, 'Fresh figures');
});

test('a failed refresh advances the countdown instead of hammering four times a second', async () => {
  const clock = { now: 0 };
  let fetches = 0;
  const { document } = fakeCountdownDom({ nextPollMs: '1000', periodMs: '60000' });
  const { tick } = runApp(document, { clock, fetchImpl: async () => { fetches++; throw new Error('offline'); } });

  clock.now = 4000; tick();
  assert.equal(fetches, 1);
  await new Promise(resolve => setImmediate(resolve));
  // Four more quarter-seconds: the deadline moved a whole period ahead, so
  // none of them retries.
  for (const at of [4250, 4500, 4750, 5000]) { clock.now = at; tick(); }
  assert.equal(fetches, 1, 'the countdown waits for the next period rather than retrying on every frame');
});

test('a page with no countdown element leaves the flat fallback in charge', () => {
  const clock = { now: 0 };
  const main = { innerHTML: '', contains: () => false };
  const document = { hidden: false, activeElement: {}, querySelector: s => (s === 'main' ? main : null),
    querySelectorAll: () => [], getElementById: () => null, addEventListener() {} };
  let fetches = 0;
  const { tick, intervals } = runApp(document, { clock, fetchImpl: async () => { fetches++; return { ok: true, text: async () => 'x' }; } });
  // The 250ms loop has nothing to count and must not fetch on its own.
  clock.now = 600_000; tick();
  assert.equal(fetches, 0);
  // The 30s fallback still refreshes, so a stale collector becomes visible.
  intervals.find(i => i.ms === 30000).fn();
  assert.equal(fetches, 1);
});

test('the root is the overview, not player insights', async t => {
  const base = await setupGamePages(t, { rows: [{ name: 'berry', label: 'Berry', count: 100, turnoverUsd: 500, profitUsd: 5, dayProfitUsd: 1, online: 2 }] });
  const res = await fetch(base + '/');
  assert.equal(res.status, 200);
  const body = await res.text();
  assert.match(body, /Overview/);
  assert.match(body, /href="\/game\/berry"/);
  assert.doesNotMatch(body, /class="filters"/, 'no insights filter form on the overview');
});
test('player insights is served at /insights, fragment included', async t => {
  const base = await setupGamePages(t);
  const res = await fetch(base + '/insights');
  assert.equal(res.status, 200);
  assert.match(await res.text(), /Player insights/);
  assert.ok(!(await (await fetch(base + '/insights?fragment=1')).text()).includes('<html'));
});
test('an old insights link at the root is redirected to /insights with its filters intact', async t => {
  const base = await setupGamePages(t);
  const res = await fetch(base + '/?game=berry&from=2026-09-17', { redirect: 'manual' });
  assert.equal(res.status, 302);
  assert.equal(res.headers.get('location'), '/insights?game=berry&from=2026-09-17');
  assert.equal((await fetch(base + '/?fragment=1', { redirect: 'manual' })).status, 200, 'the live refresh of the overview is not an insights link');
});
test('a catalogue title that is not live gets its own game page; an unknown slug still 404s', async t => {
  const base = await setupGamePages(t, { titles: [{ slug: 'metro-night-run', name: 'Metro Night Run', isLive: false, published: true, approval: 'new' }] });
  const res = await fetch(base + '/game/metro-night-run');
  assert.equal(res.status, 200);
  assert.match(await res.text(), /not live/i);
  assert.equal((await fetch(base + '/game/nope')).status, 404);
});
test('a game page reads insights scoped to that game, not the whole studio', async t => {
  let seen;
  const server = createWebServer({ read: async (query) => {
    seen = query.get('game');
    return { model: buildInsights({ snapshot, now, query }), state: { now, meta: {}, rows: [], ageMs: 1000, money: richMoney, math: {}, modeRows: { berry: [] }, modeDays: {} } };
  } });
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  t.after(() => new Promise(resolve => { server.close(resolve); server.closeAllConnections(); }));
  const base = `http://127.0.0.1:${server.address().port}`;
  await fetch(base + '/game/berry');
  assert.equal(seen, 'berry');
  await fetch(base + '/insights');
  assert.equal(seen, null, 'other pages are not scoped');
});

async function setupHinted(t, { log } = {}) {
  const hints = [];
  const server = createWebServer({ read: async (query, hint) => {
    hints.push(hint);
    return { model: buildInsights({ snapshot, now, query }), state: { now, meta: {}, rows: [{ name: 'berry', label: 'Berry', count: 1, turnoverUsd: 1, profitUsd: 1 }],
      ageMs: 1000, money: richMoney, math: {}, modeRows: { berry: [] }, modeDays: {}, gameTrails: {}, modeTrails: {} } };
  }, log });
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  t.after(() => new Promise(resolve => { server.close(resolve); server.closeAllConnections(); }));
  return { base: `http://127.0.0.1:${server.address().port}`, hints };
}

test('/analysis renders and asks read() for every game\'s mode trail - the tape reads the last 24h on any span', async t => {
  const { base, hints } = await setupHinted(t);
  const res = await fetch(base + '/analysis');
  assert.equal(res.status, 200);
  assert.match(await res.text(), /Analysis/);
  assert.equal(hints.at(-1).modesFor, 'all');
  await fetch(base + '/analysis?span=today');
  assert.equal(hints.at(-1).modesFor, 'all');
  await fetch(base + '/insights');
  assert.equal(hints.at(-1).modesFor, null, 'pages without a tape read no mode trails');
});

test('/analysis asks read() for a deeper trail only when the span outruns the shared 24 hours', async t => {
  const { base, hints } = await setupHinted(t);
  assert.equal((await fetch(base + '/analysis?span=3d')).status, 200);
  assert.equal(hints.at(-1).trailHours, 72);
  for (const span of ['month', 'today', '1h', '3h', '6h', '24h']) {
    await fetch(base + `/analysis?span=${span}`);
    assert.equal(hints.at(-1).trailHours, null, span);
  }
  await fetch(base + '/game/berry?span=3d');
  assert.equal(hints.at(-1).trailHours, null, 'a game page never reads past 24 hours');
});

test('a game page asks for that game\'s mode trail only', async t => {
  const { base, hints } = await setupHinted(t);
  assert.equal((await fetch(base + '/game/berry?span=24h')).status, 200);
  assert.equal(hints.at(-1).modesFor, 'berry');
  await fetch(base + '/game/berry');
  assert.equal(hints.at(-1).modesFor, 'berry');
  await fetch(base + '/game/berry/mode/BASE');
  assert.equal(hints.at(-1).modesFor, null, 'the mode drilldown has no tape');
});

test('only the settlement page asks for two days of the team trail', async t => {
  const { base, hints } = await setupHinted(t);
  await fetch(base + '/settlement');
  assert.equal(hints.at(-1).teamDays, 2);
  await fetch(base + '/analysis');
  assert.equal(hints.at(-1).teamDays, null);
});

test('/log serves a page of the poll log from the injected reader, passing the query through', async t => {
  let seen;
  const log = async (query) => {
    seen = Object.fromEntries(query);
    return { page: { entries: [{ id: '1790100900000-0', ts: 1790100900000, source: 'ts:team', fields: { count: '5' } }], newer: null, older: null, total: 1 },
      sources: [{ id: 'ts:team' }], source: 'all' };
  };
  const { base } = await setupHinted(t, { log });
  const res = await fetch(base + '/log?source=ts:team&before=1-0~0');
  assert.equal(res.status, 200);
  assert.match(await res.text(), /Poll log/);
  assert.deepEqual(seen, { source: 'ts:team', before: '1-0~0' });
});

test('/log without a log reader is a 404, not a crash', async t => {
  const { base } = await setupHinted(t);
  assert.equal((await fetch(base + '/log')).status, 404);
});

async function setupExport(t, exporter) {
  const server = createWebServer({ read: async (query) => ({ model: buildInsights({ snapshot, now, query }), state: { now, meta: {}, rows: [], ageMs: 1000, money: richMoney } }), exporter });
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  t.after(() => new Promise(resolve => { server.close(resolve); server.closeAllConnections(); }));
  return `http://127.0.0.1:${server.address().port}`;
}

test('/export/log.csv streams the exporter\'s CSV as a download', async t => {
  let seen;
  const base = await setupExport(t, async (query) => {
    seen = Object.fromEntries(query);
    return { filename: 'stake-ts_berry-2026-09-22.csv', chunks: (async function* () { yield 'time_utc,entry_id\r\n'; yield '2026-09-22T00:00:00.000Z,1-0\r\n'; })() };
  });
  const res = await fetch(base + '/export/log.csv?source=ts:berry&date=2026-09-22');
  assert.equal(res.status, 200);
  assert.match(res.headers.get('content-type'), /text\/csv/);
  assert.equal(res.headers.get('content-disposition'), 'attachment; filename="stake-ts_berry-2026-09-22.csv"');
  assert.equal(await res.text(), 'time_utc,entry_id\r\n2026-09-22T00:00:00.000Z,1-0\r\n');
  assert.deepEqual(seen, { source: 'ts:berry', date: '2026-09-22' });
});

test('/export/log.csv refuses a malformed date and 404s an unknown stream', async t => {
  const base = await setupExport(t, async () => null);
  assert.equal((await fetch(base + '/export/log.csv?date=2026-02-30')).status, 400);
  assert.equal((await fetch(base + '/export/log.csv?source=nope')).status, 404);
});

test('/export/log.csv without an exporter is a 404', async t => {
  const base = await setupExport(t, undefined);
  assert.equal((await fetch(base + '/export/log.csv')).status, 404);
});

test('the trends page asks for the studio\'s 7-day history, a game page for its own, and nothing else does', async t => {
  const { base, hints } = await setupHinted(t);
  await fetch(base + '/trends');
  assert.equal(hints.at(-1).history, 'studio');
  await fetch(base + '/game/berry');
  assert.equal(hints.at(-1).history, 'berry');
  await fetch(base + '/analysis');
  assert.equal(hints.at(-1).history, null);
});
