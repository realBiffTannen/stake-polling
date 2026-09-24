import { test } from 'node:test';
import assert from 'node:assert/strict';
import { html, raw, escape } from '../src/web/html.mjs';
import { usd, usdSigned, int, intSigned, pct, utcClock, utcHm, humanAge, DASH } from '../src/web/format.mjs';
import { sparkline, barChart, colourFor, MODE_COLOURS } from '../src/web/svg.mjs';
import { page, fragment } from '../src/web/views/layout.mjs';
import { banner, tiles, dataTable, findingsList, eventsList, actionLog } from '../src/web/views/parts.mjs';
import { DEFAULT_MONEY } from '../src/money.mjs';
import { renderOverview, SORTS, countdownLabel } from '../src/web/views/overview.mjs';

test('html escapes every interpolation', () => {
  const label = '<script>alert(1)</script>';
  const out = String(html`<td>${label}</td>`);
  assert.equal(out, '<td>&lt;script&gt;alert(1)&lt;/script&gt;</td>');
  assert.ok(!out.includes('<script>'));
});

test('html escapes quotes so an attribute cannot be broken out of', () => {
  const slug = '" onload="steal()';
  const out = String(html`<a href="/game/${slug}">x</a>`);
  // Equality pins every character, which is the whole property: the quotes
  // became &quot;, nothing else changed, and no new attribute was created. The
  // literal text `onload=` survives inside the href value, and should -
  // stripping it would mean mangling content rather than escaping it.
  assert.equal(out, '<a href="/game/&quot; onload=&quot;steal()">x</a>');
});

test('html nests fragments without double-escaping', () => {
  const inner = html`<b>${'a & b'}</b>`;
  const out = String(html`<p>${inner}</p>`);
  assert.equal(out, '<p><b>a &amp; b</b></p>');
});

test('html renders arrays, and drops null/undefined/false', () => {
  const cells = [html`<td>1</td>`, html`<td>2</td>`];
  assert.equal(String(html`<tr>${cells}</tr>`), '<tr><td>1</td><td>2</td></tr>');
  assert.equal(String(html`<p>${null}${undefined}${false}</p>`), '<p></p>');
  // Arrays of untrusted strings must be escaped element-by-element and concatenated without separator
  assert.equal(String(html`<p>${['a<b', 'c&d']}</p>`), '<p>a&lt;bc&amp;d</p>');
});

test('raw is the only way to emit markup', () => {
  assert.equal(String(html`<p>${raw('<br>')}</p>`), '<p><br></p>');
  assert.equal(escape('a<b'), 'a&lt;b');
});

test('null is a dash and zero is a measurement', () => {
  assert.equal(usd(null), DASH);
  assert.equal(usd(0), '$0.00');
  assert.equal(usdSigned(null), DASH);
  assert.equal(usdSigned(12.5), '+$12.50');
  assert.equal(int(null), DASH);
  assert.equal(int(0), '0');
  assert.equal(int(1204), '1,204');
  assert.equal(intSigned(12), '+12');
  assert.equal(intSigned(-12), '-12');
  assert.equal(pct(null), DASH);
  assert.equal(pct(96.7), '96.70%');
});

test('clocks are UTC and ages are human', () => {
  const t = Date.UTC(2026, 8, 16, 14, 5, 9);
  assert.equal(utcClock(t), '14:05:09Z');
  assert.equal(utcHm(t), '14:05Z');
  assert.equal(humanAge(42_000), '42s');
  assert.equal(humanAge(7 * 60_000), '7m');
  assert.equal(humanAge(3 * 3_600_000 + 12 * 60_000), '3h12m');
  assert.equal(utcClock(null), DASH);
  assert.equal(utcClock(undefined), DASH);
  assert.equal(utcHm(null), DASH);
  assert.equal(utcHm(undefined), DASH);
  assert.equal(humanAge(null), DASH);
  assert.equal(humanAge(undefined), DASH);
});

const noNaN = (s) => assert.ok(!String(s).includes('NaN'), `NaN in svg: ${s}`);

test('sparkline survives every degenerate series without emitting NaN', () => {
  assert.equal(String(sparkline([])), '');
  noNaN(sparkline([7]));
  noNaN(sparkline([5, 5, 5, 5]));
  noNaN(sparkline([-3, 4, -1, 9]));
  noNaN(sparkline([0, 0]));
  noNaN(sparkline([1, null, 3]));
});

test('sparkline draws a dot for one sample and a line for many', () => {
  assert.match(String(sparkline([7])), /<circle/);
  assert.match(String(sparkline([1, 2, 3])), /<polyline/);
});

test('a signed sparkline puts the zero rule inside the box', () => {
  const out = String(sparkline([-5, 5], { width: 100, height: 20, pad: 0 }));
  const y = Number(/data-zero="([0-9.]+)"/.exec(out)[1]);
  assert.ok(y > 0 && y < 20, `zero rule outside the box: ${y}`);
});

test('barChart returns nothing when every bucket is unmeasured', () => {
  const rows = [{ from: 0, to: 300000, total: null, byMode: { BASE: null }, modeTotal: null }];
  assert.equal(String(barChart(rows, ['BASE'])), '');
});

test('barChart draws no bar for a null bucket but keeps its axis tick', () => {
  const rows = [
    { from: 600000, to: 900000, total: 4.5, byMode: { BASE: 3.1 }, modeTotal: 3.1 },
    { from: 300000, to: 600000, total: null, byMode: { BASE: null }, modeTotal: null },
  ];
  const out = String(barChart(rows, ['BASE']));
  noNaN(out);
  assert.equal((out.match(/class="bar"/g) ?? []).length, 1);
  assert.match(out, /class="tick-empty"/);
});

test('barChart handles a loss without drawing it as a win', () => {
  const rows = [{ from: 0, to: 300000, total: -82, byMode: { BASE: -82 }, modeTotal: -82 }];
  const out = String(barChart(rows, ['BASE'], { width: 200, height: 100 }));
  noNaN(out);
  const zero = Number(/data-zero="([0-9.]+)"/.exec(out)[1]);
  const barY = Number(/class="bar"[^>]*\sy="([0-9.]+)"/.exec(out)[1]);
  // A negative bar hangs BELOW the zero rule; y grows downwards in SVG.
  assert.ok(barY >= zero - 0.001, `negative bar drawn above zero: y=${barY} zero=${zero}`);
});

test('mode colours are assigned by position so the legend matches the table', () => {
  assert.equal(colourFor(['BASE', 'FREE_SPINS'], 'BASE'), MODE_COLOURS[0]);
  assert.equal(colourFor(['BASE', 'FREE_SPINS'], 'FREE_SPINS'), MODE_COLOURS[1]);
  assert.equal(colourFor(['BASE'], 'UNKNOWN'), MODE_COLOURS[MODE_COLOURS.length - 1]);
});

test('barChart escapes untrusted mode names to prevent injection', () => {
  const rows = [{from:0,to:300000,total:5,byMode:{'</title><script>alert(1)</script>':5},modeTotal:5}];
  const out = String(barChart(rows, ['</title><script>alert(1)</script>']));
  noNaN(out);
  assert.ok(!out.includes('<script>'), 'markup should not appear unescaped');
  assert.ok(out.includes('&lt;/title&gt;'), 'mode name should be escaped');
});

test('sparkline coerces non-finite width/height/pad to defaults', () => {
  noNaN(sparkline([1, 2, 3], { width: NaN }));
  noNaN(sparkline([1, 2, 3], { height: NaN }));
  noNaN(sparkline([1, 2, 3], { pad: NaN }));
  noNaN(sparkline([1, 2, 3], { width: Infinity }));
});

test('barChart coerces non-finite width/height/pad to defaults', () => {
  const rows = [{ from: 0, to: 300000, total: 5, byMode: { BASE: 5 }, modeTotal: 5 }];
  noNaN(barChart(rows, ['BASE'], { width: NaN }));
  noNaN(barChart(rows, ['BASE'], { height: NaN }));
  noNaN(barChart(rows, ['BASE'], { pad: NaN }));
  noNaN(barChart(rows, ['BASE'], { height: Infinity }));
});

test('colourFor degrades gracefully when modes is not an array', () => {
  const colour = colourFor(undefined, 'BASE');
  assert.equal(colour, MODE_COLOURS[MODE_COLOURS.length - 1], 'should return last colour for unknown mode');
  assert.equal(typeof colour, 'string', 'should not throw');
});

const baseState = (over = {}) => ({
  now: Date.UTC(2026, 8, 16, 14, 5, 0),
  meta: { team: 'acme-studios', auth_state: 'ok', persistence: 'aof' },
  ageMs: 30_000, stale: false, online: 412, carry: -2184.06, team: -4474.89,
  rows: [], alerts: [], events: [], summaries: [], money: DEFAULT_MONEY,
  dayFrom: Date.UTC(2026, 8, 16, 12, 0, 0), dayCoverage: { partial: false },
  pollMinutes: 5, rateLabel: '/5m', ...over,
});

test('page is a whole document and fragment is not', () => {
  const doc = page({ title: 'roster', state: baseState(), body: raw('<p>x</p>'), active: 'overview' });
  assert.match(doc, /^<!doctype html>/i);
  assert.match(doc, /<main[^>]*>/);
  assert.match(doc, /\/app\.css/);
  assert.match(doc, /\/app\.js/);
  const frag = fragment(baseState(), raw('<p>x</p>'));
  assert.ok(!frag.includes('<html'), frag);
  assert.ok(!frag.includes('<main'), frag);
  assert.equal(frag, '<p>x</p>');
});

test('the banner lives inside the swap boundary, so an open tab learns of it', () => {
  const expired = baseState({ meta: { auth_state: 'expired' } });
  // A banner rendered in the shell would never reach a tab that was already
  // open - which is the only moment SID EXPIRED matters.
  assert.match(fragment(expired, raw('<p>x</p>')), /SID EXPIRED/);
  assert.match(page({ title: 'roster', state: expired, body: raw('<p>x</p>'), active: 'overview' }), /SID EXPIRED/);
});

test('the banner says STALE, SID EXPIRED and aof off, and otherwise says nothing', () => {
  assert.equal(String(banner(baseState())), '');
  assert.match(String(banner(baseState({ stale: true }))), /STALE/);
  assert.match(String(banner(baseState({ meta: { auth_state: 'expired' } }))), /SID EXPIRED/);
  assert.match(String(banner(baseState({ meta: { persistence: 'off' } }))), /aof off/);
});

test('tiles render a dash for null and $0.00 for zero', () => {
  const out = String(tiles([{ label: 'day profit', value: usd(null) }, { label: 'profit', value: usd(0) }]));
  assert.match(out, /day profit/);
  assert.match(out, new RegExp(DASH));
  assert.match(out, /\$0\.00/);
});

test('dataTable escapes a hostile cell value', () => {
  const out = String(dataTable({
    columns: [{ key: 'name', title: 'GAME', cell: (r) => r.name }],
    rows: [{ name: '<img src=x onerror=1>' }],
  }));
  assert.ok(!out.includes('<img'), out);
  assert.match(out, /&lt;img/);
});

test('empty panes say they are empty rather than rendering nothing', () => {
  assert.match(String(findingsList([])), /no findings/i);
  assert.match(String(eventsList([])), /nothing/i);
  assert.match(String(actionLog([], DEFAULT_MONEY)), /no running action/i);
});

test('the action log converts raw units to dollars', () => {
  // 154,868,660,000 micro-dollars is $154,868.66; profit carries the 10% share.
  const out = String(actionLog([{
    from: Date.UTC(2026, 8, 16, 14, 0, 0), to: Date.UTC(2026, 8, 16, 14, 5, 0), minutes: 5,
    turnover: 154_868_660_000, profit: 1_000_000_000, count: 1204, activeGames: 7,
    topMover: 'berry', topMoverTurnover: 90_000_000_000, alerts: 1, crits: 0, warns: 1,
  }], DEFAULT_MONEY));
  assert.match(out, /\$154,868\.66/);
  assert.match(out, /\$100\.00/);   // 1,000,000,000 / 1e6 * 0.10
  assert.match(out, /berry/);
});

// --- Hostile-input coverage beyond the brief's dataTable case ---------------
//
// A prior task shipped a live <script> injection through an unescaped
// bet-mode name that had hand-built markup and returned raw(). Every string
// these views render that comes from the upstream API - alert messages,
// game names, event titles/descriptions, finding messages, the topMover slug
// - is untrusted and must go through html`` rather than around it.

test('findingsList escapes a hostile alert message and game name', () => {
  const out = String(findingsList([{
    message: '</td><script>alert(1)</script>',
    game: '"><img src=x onerror=alert(1)>',
    severity: 'crit',
    ts: Date.UTC(2026, 8, 16, 14, 0, 0),
  }]));
  assert.ok(!out.includes('<script>'), out);
  assert.ok(!out.includes('<img'), out);
  assert.match(out, /&lt;script&gt;/);
  assert.match(out, /&lt;img/);
});

test('eventsList escapes a hostile title, description and finding message', () => {
  const out = String(eventsList([{
    title: '<script>alert(1)</script>',
    description: '"><img src=x onerror=alert(1)>',
    severity: 'warn',
    confidence: 'high',
    findings: [{ message: '</li><script>alert(2)</script>' }],
  }]));
  assert.ok(!out.includes('<script>'), out);
  assert.ok(!out.includes('<img'), out);
  assert.match(out, /&lt;script&gt;/);
  assert.match(out, /&lt;img/);
});

test('actionLog escapes a hostile topMover slug', () => {
  const out = String(actionLog([{
    from: Date.UTC(2026, 8, 16, 14, 0, 0), to: Date.UTC(2026, 8, 16, 14, 5, 0), minutes: 5,
    turnover: 1_000_000, profit: 100_000, count: 1, activeGames: 1,
    topMover: '"><script>alert(1)</script>', topMoverTurnover: 1_000_000, alerts: 0, crits: 0, warns: 0,
  }], DEFAULT_MONEY));
  assert.ok(!out.includes('<script>'), out);
  assert.match(out, /&lt;script&gt;/);
});

// --- Fix round 1 -------------------------------------------------------
//
// tiles() and dataTable() were the two panes that rendered nothing rather
// than saying they were empty; dataTable() also had no error boundary around
// a caller-supplied cell() accessor.

test('tiles says it is empty rather than rendering a bare grid', () => {
  const out = String(tiles([]));
  assert.ok(!out.includes('class="tiles"'), out);
  assert.match(out, /no figures/i);
});

test('dataTable keeps its header and says it is empty rather than rendering a bare body', () => {
  const out = String(dataTable({
    columns: [{ key: 'name', title: 'GAME', cell: (r) => r.name }, { key: 'n', title: 'N', cell: (r) => r.n }],
    rows: [],
  }));
  assert.match(out, /<th>GAME<\/th>/);
  assert.match(out, /<th>N<\/th>/);
  assert.match(out, /no rows/i);
  // one placeholder cell spans every column rather than leaving a blank body
  assert.match(out, /colspan="2"/);
});

test('dataTable survives a cell() that throws, rendering an error cell instead of losing the page', () => {
  const out = String(dataTable({
    columns: [
      { key: 'ok', title: 'OK', cell: (r) => r.ok },
      { key: 'boom', title: 'BOOM', cell: () => { throw new Error('bad accessor'); } },
    ],
    rows: [{ ok: 'fine' }],
  }));
  assert.match(out, /fine/);
  assert.match(out, /<td class="bad">error<\/td>/);
});

test('actionLog treats an empty-string topMover as absent, not as a gap', () => {
  const out = String(actionLog([{
    from: Date.UTC(2026, 8, 16, 14, 0, 0), to: Date.UTC(2026, 8, 16, 14, 5, 0), minutes: 5,
    turnover: 1_000_000, profit: 100_000, count: 1, activeGames: 1,
    topMover: '', topMoverTurnover: 1_000_000, alerts: 0, crits: 0, warns: 0,
  }], DEFAULT_MONEY));
  assert.ok(!out.includes('top mover  $'), out); // no double space where the slug would have been
  assert.match(out, new RegExp(`top mover ${DASH} `));
});

// --- Task 4: the overview page ------------------------------------------

const rowFor = (over = {}) => ({
  name: 'berry', label: 'Berry', count: 1204, turnover: 154_868_660_000, profit: 1_125_000_000,
  unique: 88, expectedProfit: 5_420_000_000, online: 118, rtp: 96.5,
  dCount: 12, dTurnover: 40_000_000, dProfit: -2_000_000, spark: [1, 4, 2, 9],
  turnoverUsd: 154868.66, profitUsd: 112.5, expectedUsd: 406.53,
  dTurnoverUsd: 40, dProfitUsd: -0.2, dayTurnoverUsd: 900.5, dayProfitUsd: -12.25, dayCount: 400,
  ...over,
});

test('the overview shows every roster column and links each game', () => {
  const out = String(renderOverview(baseState({ rows: [rowFor()] })));
  assert.match(out, /href="\/game\/berry"/);
  assert.match(out, /\$154,868\.66/);
  assert.match(out, /96\.50%/);
  assert.match(out, /TURN\/5m/);          // the rate column names its period
  assert.match(out, /-\$12\.25/);         // day profit, signed
});

test('a live game with no roster row shows its player count and dashes, never $0.00', () => {
  const pending = {
    name: 'metro-night-run', label: 'Metro Night Run', pending: true, online: 6,
    count: null, turnover: null, profit: null, unique: null, expectedProfit: null, rtp: null,
    dCount: null, dTurnover: null, dProfit: null, spark: [],
    turnoverUsd: null, profitUsd: null, expectedUsd: null, dTurnoverUsd: null, dProfitUsd: null,
    dayTurnoverUsd: null, dayProfitUsd: null, dayCount: null,
  };
  const out = String(renderOverview(baseState({ rows: [pending] })));
  assert.match(out, /metro-night-run/);
  assert.match(out, /live, nothing yet/);
  assert.match(out, />6</);
  assert.ok(!out.includes('$0.00'), 'a pending row must not claim a measured zero');
});

// --- Fix round 1: the roster/day profit TILES, not just the table cells ----
//
// rosterTotals()/dayTotals() return profit: null when no row holds a
// reading. `null < 0` is false, so a tone computed with a bare `< 0 ? 'bad'
// : 'good'` ternary resolves to 'good' for a figure nobody measured - a dash
// painted green. The tone must come from an explicit measured check, the
// same way the shared money() helper already treats null as "no colour".

test('an unmeasured roster/day profit tile carries no colour tone at all', () => {
  const pending = {
    name: 'metro-night-run', label: 'Metro Night Run', pending: true, online: 6,
    count: null, turnover: null, profit: null, unique: null, expectedProfit: null, rtp: null,
    dCount: null, dTurnover: null, dProfit: null, spark: [],
    turnoverUsd: null, profitUsd: null, expectedUsd: null, dTurnoverUsd: null, dProfitUsd: null,
    dayTurnoverUsd: null, dayProfitUsd: null, dayCount: null,
  };
  const out = String(renderOverview(baseState({ rows: [pending] })));
  assert.ok(!out.includes('class="value good"'), out);
  assert.ok(!out.includes('class="value bad"'), out);
});

test('a measured roster profit tile is green and a measured day loss tile is red', () => {
  // rowFor()'s profitUsd (112.5) sums to a positive roster total; its
  // dayProfitUsd (-12.25) sums to a negative day total - one row exercises
  // both tones at once.
  const out = String(renderOverview(baseState({ rows: [rowFor()] })));
  assert.match(out, /class="value good"/);
  assert.match(out, /class="value bad"/);
});

test('sort reorders the table and an unknown sort falls back rather than throwing', () => {
  const rows = [rowFor({ name: 'a', turnover: 1, turnoverUsd: 1 }), rowFor({ name: 'b', turnover: 9, turnoverUsd: 9 })];
  const byTurnover = String(renderOverview(baseState({ rows }), { sort: 'turnover' }));
  assert.ok(byTurnover.indexOf('/game/b') < byTurnover.indexOf('/game/a'));
  const byName = String(renderOverview(baseState({ rows }), { sort: 'name' }));
  assert.ok(byName.indexOf('/game/a') < byName.indexOf('/game/b'));
  assert.doesNotThrow(() => renderOverview(baseState({ rows }), { sort: 'nonsense' }));
  assert.ok(SORTS.includes('turnover'));
});

test('panes=false hides events, action and findings but keeps the table', () => {
  const state = baseState({ rows: [rowFor()], alerts: [{ ts: Date.now(), severity: 'crit', message: 'x' }] });
  const off = String(renderOverview(state, { panes: false }));
  assert.match(off, /\$154,868\.66/);
  assert.ok(!/FINDINGS/i.test(off), off);
});

test('the roll-over line names the hour the state was actually built with', () => {
  // The boundary is configuration (`dayBoundaryUtcHour`), so this sentence
  // cannot be a constant: a deployment that rolls at midnight and a page that
  // says noon disagree about which figures the tiles above it are showing.
  const midnight = String(renderOverview(baseState({ dayFrom: Date.UTC(2026, 8, 16, 0, 0, 0) })));
  assert.match(midnight, /rolls at 00:00Z/);
  assert.ok(!midnight.includes('rolls at 12:00Z'), midnight);

  const noon = String(renderOverview(baseState()));
  assert.match(noon, /rolls at 12:00Z/);
});

test('a partial day window says so instead of implying a full one', () => {
  const state = baseState({
    rows: [rowFor()],
    dayCoverage: { partial: true, from: Date.UTC(2026, 8, 16, 13, 30, 0) },
  });
  assert.match(String(renderOverview(state)), /partial/i);
});

// --- Hostile-input coverage beyond the brief's own tests ------------------
//
// The GAME column is the first place any earlier task put an untrusted value
// inside an ATTRIBUTE (`href="/game/${r.name}"`) rather than only element
// text. A prior task shipped a live <script> injection through an unescaped
// value, caught only because someone tried hostile input - so this page gets
// its own attribute-context coverage rather than trusting the element-text
// coverage tasks 1-3 already have.
//
// Note: the row's `label` field (distinct from its `name` slug) is not
// rendered anywhere on this page - the GAME column shows `r.name` for both
// the href and the visible text, matching the terminal dashboard's own
// `columnsFor()` (src/tui/views/roster.mjs), which also displays `r.name`
// rather than `r.label`. So the "visible cell text" hostile-input case below
// targets `r.name`, the only value this page actually puts there; `label` is
// carried on `rowFor()` only because a later task's tests depend on the
// fixture shape.

test('an attribute-breaking slug cannot escape the href attribute', () => {
  const slug = '" onmouseover="alert(1)';
  const out = String(renderOverview(baseState({ rows: [rowFor({ name: slug })] })));
  // Same property html.mjs's own test pins (test/web.test.mjs:17-25): the
  // quotes become &quot;, and the literal text `onmouseover=` survives as
  // inert text INSIDE the href value rather than being stripped. Checking
  // this with a regex like /<a[^>]*\son[a-z]+=/ is a trap - it cannot tell
  // "onmouseover=" sitting inside a quoted attribute value apart from a real
  // second attribute, and would flag this correct, escaped output as if it
  // were the injection it prevents. An exact-substring match on the whole
  // opening tag proves there is exactly one attribute and nothing after it
  // but the closing `>`.
  assert.ok(
    out.includes('<a href="/game/&quot; onmouseover=&quot;alert(1)">'),
    `unexpected anchor markup: ${out}`,
  );
  assert.ok(!out.includes('" onmouseover="'), 'the raw quote must not survive to break out of the attribute');
});

test('markup in a slug is escaped in the visible cell text, not just the href', () => {
  const hostile = '"><img src=x onerror=alert(1)>';
  const out = String(renderOverview(baseState({ rows: [rowFor({ name: hostile })] })));
  assert.ok(!out.includes('<img'), 'no live element was produced: ' + out);
  assert.ok(!out.includes('<script'), out);
  // The escaped text appears verbatim as the anchor's visible content.
  assert.match(out, />&quot;&gt;&lt;img src=x onerror=alert\(1\)&gt;<\/a>/);
});

test('a path-traversal slug is HTML-escaped but not URL-encoded (route-level validation is a later task)', () => {
  const slug = '../admin';
  const out = String(renderOverview(baseState({ rows: [rowFor({ name: slug })] })));
  // "../admin" has no HTML-special characters, so nothing gets entity-escaped
  // and the traversal segment passes straight through into the href. This is
  // observed, not fixed, here - slug validation is a route-layer concern for
  // a later task, per the task-4 dispatch.
  assert.match(out, /href="\/game\/\.\.\/admin"/);
});

// --- Lifetime turnover, and the poll countdown ---------------------------

test('the lifetime turnover tile names the date it counts from', () => {
  const state = baseState({ rows: [rowFor()], lifetime: { turnover: 1_250_400.5, from: '2026-07-24', ts: Date.UTC(2026, 8, 16, 14, 4, 0), games: 3 } });
  const out = String(renderOverview(state));
  assert.match(out, /lifetime turnover since 2026-07-24/);
  assert.match(out, /\$1,250,400\.50/);
  // The month-to-date tiles say so, now that a wider horizon sits beside them.
  assert.match(out, /turnover this month/);
  assert.match(out, /profit this month/);
});

test('an unread lifetime snapshot is a dash on the tile, never $0.00', () => {
  // The lifetime range is fetched on its own hourly cadence, so a freshly
  // started collector has every other figure and not this one. A zero here
  // would read as "this studio has never taken a bet".
  const out = String(renderOverview(baseState({ rows: [rowFor()], lifetime: { turnover: null, from: '2026-07-24', ts: null, games: 0 } })));
  // The tile's own value cell, not merely "a dash appears somewhere": the
  // roster table below is full of dashes for other reasons.
  assert.match(out, /lifetime turnover since 2026-07-24<\/div>\s*<div class="value[^"]*">-<\/div>/);
  assert.ok(!/lifetime turnover since 2026-07-24<\/div>\s*<div class="value[^"]*">\$0\.00/.test(out), out);
  // And with no lifetime key on the state at all (an older cached state).
  const bare = String(renderOverview(baseState({ rows: [rowFor()] })));
  assert.match(bare, /lifetime turnover<\/div>\s*<div class="value[^"]*">-<\/div>/);
});

test('the roster table carries a lifetime turnover column, dashed where unread', () => {
  const rows = [rowFor({ name: 'berry', lifetimeTurnover: 9_000_000_000, lifetimeTurnoverUsd: 9000 }),
    rowFor({ name: 'pixel-nest', lifetimeTurnover: null, lifetimeTurnoverUsd: null })];
  const out = String(renderOverview(baseState({ rows })));
  assert.match(out, /LIFETIME TURN/);
  assert.match(out, /\$9,000\.00/);
  assert.ok(SORTS.includes('lifetimeTurnover'));
  // Sorting by it puts the measured game above the unread one rather than
  // treating the missing reading as a zero that outranks nothing.
  const sorted = String(renderOverview(baseState({ rows }), { sort: 'lifetimeTurnover' }));
  assert.ok(sorted.indexOf('/game/berry') < sorted.indexOf('/game/pixel-nest'), sorted);
});

test('the countdown says when the next poll lands, as a duration from render time', () => {
  // 14:05:00 exactly, one-minute period: the next boundary is 60s away, and
  // the countdown must be a DURATION - a browser clock an hour out would
  // render an absolute timestamp as an hour-wrong countdown.
  const out = String(renderOverview(baseState({ pollMinutes: 1, rateLabel: '/m' })));
  assert.match(out, /data-next-poll-ms="60000"/);
  assert.match(out, /data-period-ms="60000"/);
  assert.match(out, /next poll in <b>1:00<\/b>/);
  assert.match(out, /the collector polls every minute, on the clock/);
});

test('the countdown counts to the poller own boundary grid, not to a flat period', () => {
  // 14:05:00 on a five-minute grid is a boundary, so the next one is a whole
  // period away; 14:03:20 is 100s short of 14:05:00. Both come from the
  // poller's msToNextBoundary, which is what the poller actually sleeps to.
  const onBoundary = String(renderOverview(baseState({ pollMinutes: 5 })));
  assert.match(onBoundary, /data-next-poll-ms="300000"/);
  assert.match(onBoundary, /next poll in <b>5:00<\/b>/);
  assert.match(onBoundary, /the collector polls every 5 minutes, on the clock/);

  const offBoundary = String(renderOverview(baseState({ now: Date.UTC(2026, 8, 16, 14, 3, 20), pollMinutes: 5 })));
  assert.match(offBoundary, /data-next-poll-ms="100000"/);
  assert.match(offBoundary, /next poll in <b>1:40<\/b>/);
});

test('a 2.5-minute period counts down to :02:30 and says so, not "every 3 minutes"', () => {
  // 14:05:00 is a boundary on the 2.5-minute grid, so the next is 14:07:30;
  // 14:03:20 is 100s short of 14:05:00.
  const onBoundary = String(renderOverview(baseState({ pollMinutes: 2.5 })));
  assert.match(onBoundary, /data-next-poll-ms="150000"/);
  assert.match(onBoundary, /data-period-ms="150000"/);
  assert.match(onBoundary, /next poll in <b>2:30<\/b>/);
  assert.match(onBoundary, /the collector polls every 2.5 minutes, on the clock/);

  const offBoundary = String(renderOverview(baseState({ now: Date.UTC(2026, 8, 16, 14, 3, 20), pollMinutes: 2.5 })));
  assert.match(offBoundary, /data-next-poll-ms="100000"/);
});

test('countdownLabel is m:ss and a dash for no reading', () => {
  assert.equal(countdownLabel(0), '0:00');
  assert.equal(countdownLabel(1), '0:01');
  assert.equal(countdownLabel(59_400), '1:00');
  assert.equal(countdownLabel(100_000), '1:40');
  assert.equal(countdownLabel(null), DASH);
  assert.equal(countdownLabel('nonsense'), DASH);
});

// --- Only the newest five, the rest behind a fold ---------------------------
const interval = (i) => ({
  from: Date.UTC(2026, 8, 16, 14, 5 * i, 0), to: Date.UTC(2026, 8, 16, 14, 5 * (i + 1), 0), minutes: 5,
  turnover: 1_000_000_000, profit: 0, count: 100 + i, activeGames: 3, topMover: `mover${i}`, topMoverTurnover: 500_000_000, alerts: 0, crits: 0, warns: 0,
});
const finding = (i) => ({ ts: Date.UTC(2026, 8, 16, 14, i, 0), severity: 'warn', message: `finding${i}`, game: 'berry' });
// The reader hands both lists newest first (xRevRange), and the views keep that order.
const newestFirst = (make, n) => Array.from({ length: n }, (_, i) => make(n - 1 - i));

test('the action log shows the five newest intervals and folds the older ones behind "more"', () => {
  const out = String(actionLog(newestFirst(interval, 8), DEFAULT_MONEY));
  const fold = out.indexOf('<details class="fold-more" id="running-action-more">');
  assert.ok(fold > 0, out);
  for (const i of [7, 6, 5, 4, 3]) assert.ok(out.indexOf(`mover${i}`) < fold, `mover${i} is shown`);
  for (const i of [2, 1, 0]) assert.ok(out.indexOf(`mover${i}`) > fold, `mover${i} is folded`);
  assert.match(out, /Show 3 more/);
  assert.doesNotMatch(out, /<details class="fold-more"[^>]*\sopen/, 'starts closed');
});

test('findings likewise: the five newest shown, the rest folded, still newest first inside the fold', () => {
  const out = String(findingsList(newestFirst(finding, 7)));
  const fold = out.indexOf('<details class="fold-more" id="findings-more">');
  assert.ok(fold > 0, out);
  for (const i of [6, 5, 4, 3, 2]) assert.ok(out.indexOf(`finding${i}`) < fold, `finding${i} is shown`);
  assert.ok(fold < out.indexOf('finding1') && out.indexOf('finding1') < out.indexOf('finding0'));
  assert.match(out, /Show 2 more/);
});

test('five or fewer entries need no fold at all', () => {
  assert.doesNotMatch(String(actionLog(newestFirst(interval, 5), DEFAULT_MONEY)), /fold-more/);
  assert.doesNotMatch(String(findingsList(newestFirst(finding, 1))), /fold-more/);
});
