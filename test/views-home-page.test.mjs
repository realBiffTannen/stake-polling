import { test } from 'node:test';
import assert from 'node:assert/strict';
import { renderHome } from '../src/web/views/home.mjs';

const money = { unitsPerDollar: 1_000_000, profitShare: 0.1, expectedShare: 0.075 };
const MIN = 60_000, H = 3_600_000, DAY = 86_400_000;
const NOW = Date.parse('2026-09-24T04:10:00Z');
const MIDNIGHT = Date.parse('2026-09-24T00:00:00Z');
const sample = (ts, fields) => ({ ts, fields });

// Cumulative readings every 15 minutes, 23:45 the day before yesterday's
// midnight to now. Each step adds 5 bets, $50 turnover and $2 gross, unless
// `today` or `yesterday` says otherwise for the steps on that side of 00:00Z.
function twoDay({ today = {}, yesterday = {}, from = MIDNIGHT - DAY - 15 * MIN } = {}) {
  const rate = (ts) => ({ bets: 5, turnover: 50_000_000, profit: 2_000_000, ...(ts > MIDNIGHT ? today : yesterday) });
  const out = [];
  let c = 0, t = 0, p = 0;
  for (let ts = MIDNIGHT - DAY - 15 * MIN; ts <= NOW; ts += 15 * MIN) {
    if (out.length) { const r = rate(ts); c += r.bets; t += r.turnover; p += r.profit; }
    if (ts >= from) out.push(sample(ts, { count: c, turnover: t, profit: p }));
  }
  return out;
}
const online = (from = MIDNIGHT - DAY - 30 * MIN) => {
  const out = [];
  for (let ts = from; ts <= NOW; ts += 5 * MIN) out.push(sample(ts, { onlinePlayers: ts >= MIDNIGHT ? 7 : 5 }));
  return out;
};

const berry = { name: 'berry', label: 'Berry', count: 100, turnoverUsd: 500, profitUsd: -12.5, online: 4 };
const geyser = { name: 'pixel-geyser', label: 'Pixel Geyser', count: 50, turnoverUsd: 250, profitUsd: 20, online: 0 };
const pending = { name: 'pixel-nest', label: 'Pixel Nest', pending: true, count: null, turnoverUsd: null, profitUsd: null, online: 1 };
const base = {
  meta: { team: 'acme-studios' }, stale: false, ageMs: 0, now: NOW, money, pollMinutes: 2.5, online: 5,
  rows: [berry, geyser, pending],
  teamTrail: twoDay(),
  onlineSince: online(),
  gameTrails: {
    berry: twoDay({ from: MIDNIGHT - 15 * MIN }),
    'pixel-geyser': twoDay({ from: MIDNIGHT - 15 * MIN, today: { bets: 1, turnover: 10_000_000, profit: -4_000_000 } }),
  },
};
const render = (over = {}) => String(renderHome({ ...base, ...over }));
const between = (out, from, to) => { const a = out.indexOf(from); return a === -1 ? '' : out.slice(a, out.indexOf(to, a + from.length)); };
const kpi = (out, label) => between(out, `<div class="kpi-label">${label}</div>`, '</article>');

test('the landing is about today, since 00:00:00 UTC, and says how much of it has passed', () => {
  const out = render();
  assert.match(out, /<h1>Today<span>\.<\/span><\/h1>/);
  assert.match(out, /since 00:00:00 UTC/i);
  assert.match(out, /Thursday 24 September/);
  assert.match(out, /4h 10m of play/);
});

test('five KPI tiles lead the page: studio P/L, turnover, bets, players online and RTP', () => {
  const out = render();
  const labels = [...out.matchAll(/<div class="kpi-label">([^<]+)<\/div>/g)].map((m) => m[1]);
  assert.deepEqual(labels, ['Studio P/L today', 'Turnover today', 'Bets today', 'Players online', 'RTP today']);
  // 16 steps of 15 minutes, 00:15 to 04:00.
  assert.match(kpi(out, 'Studio P/L today'), /<div class="kpi-value good">\+\$3\.20<\/div>/);
  assert.match(kpi(out, 'Turnover today'), /\$800\.00/);
  assert.match(kpi(out, 'Bets today'), />80</);
  assert.match(kpi(out, 'Players online'), />5</);
  assert.match(kpi(out, 'RTP today'), /96\.00%/);
});

test('each KPI compares against the same hours of yesterday, with an arrow and words, not colour alone', () => {
  const level = render();
  assert.match(kpi(level, 'Studio P/L today'), /class="kpi-delta flat">= level <span>vs yesterday<\/span>/);
  assert.match(kpi(level, 'Players online'), /class="kpi-delta flat">= level <span>vs yesterday<\/span>/);
  const busier = render({ teamTrail: twoDay({ today: { turnover: 100_000_000, profit: -1_000_000 } }) });
  assert.match(kpi(busier, 'Turnover today'), /class="kpi-delta up">▲ 100% <span>vs yesterday<\/span>/);
  assert.match(kpi(busier, 'Studio P/L today'), /class="kpi-delta down">▼ -\$4\.80 <span>vs yesterday<\/span>/);
  assert.match(kpi(busier, 'RTP today'), /class="kpi-delta flat">▲ 5\.00pp <span>vs yesterday<\/span>/, 'RTP moves are not called good or bad');
});

test('with no yesterday in the trail, the tiles say there is nothing to compare, rather than inventing a change', () => {
  const out = render({ teamTrail: twoDay({ from: MIDNIGHT - 30 * MIN }), onlineSince: online(MIDNIGHT) });
  for (const label of ['Studio P/L today', 'Turnover today', 'Bets today', 'Players online']) {
    assert.match(kpi(out, label), /no yesterday to compare/, label);
    assert.doesNotMatch(kpi(out, label), /[▲▼]/, label);
  }
});

test('the hero is the running studio P/L across the whole day, today against yesterday', () => {
  const panel = between(render(), 'id="p-running-studio-p-l"', '</section>');
  assert.match(panel, /<h2>Running studio P\/L<\/h2>/);
  assert.match(panel, /class="chart day-curve"/);
  assert.match(panel, />Today</);
  assert.match(panel, />Yesterday</);
  assert.match(panel, /class="area-gain"/);
});

test('turnover and P/L are drawn hour by hour, with the hours still to come shaded', () => {
  const out = render();
  const turnover = between(out, 'id="p-turnover-by-hour"', '</section>');
  assert.match(turnover, /class="future-zone"/);
  assert.match(turnover, /class="today-legend"/);
  assert.match(turnover, /Berry/);
  const pnl = between(out, 'id="p-studio-p-l-by-hour"', '</section>');
  assert.match(pnl, /class="future-zone"/);
  assert.match(pnl, /class="bar-neg"/, 'Pixel Geyser\'s losses outweigh Berry\'s gains each hour');
});

test('the heat grid puts every game that played today against the hours, each row linking to its game', () => {
  const grid = between(render(), 'id="p-turnover-by-game-and-hour"', '</section>');
  assert.match(grid, /<a href="\/game\/berry">/);
  assert.match(grid, /<a href="\/game\/pixel-geyser">/);
  assert.doesNotMatch(grid, /Pixel Nest/, 'a game with nothing today has no row');
});

test('in the grid, hours before a game joined the roster are blank, while an hour its trail missed is an outline', () => {
  const late = twoDay({ from: MIDNIGHT + 2 * H + 25 * MIN });
  const gappy = twoDay({ from: MIDNIGHT - 15 * MIN }).filter((s) => s.ts <= MIDNIGHT + 15 * MIN || s.ts >= MIDNIGHT + 2 * H);
  const grid = between(render({ gameTrails: { berry: late, 'pixel-geyser': gappy } }), 'id="p-turnover-by-game-and-hour"', '</section>');
  const row = (slug) => between(grid, `<a href="/game/${slug}">`, '</g><g>') || grid.slice(grid.indexOf(`<a href="/game/${slug}">`));
  assert.doesNotMatch(row('berry'), /cell-missed/, 'not watching yet is not a miss');
  assert.match(row('pixel-geyser'), /cell-missed/, 'a gap in a watched trail is');
});

test('games today: P/L by game and each game\'s share of turnover', () => {
  const out = render();
  const bars = between(out, 'id="p-studio-p-l-by-game"', '</section>');
  assert.match(bars, /class="bar-pos"/);
  assert.match(bars, /class="bar-neg"/, 'Pixel Geyser lost today');
  const ring = between(out, 'id="p-share-of-turnover"', '</section>');
  assert.match(ring, /class="chart donut"/);
  assert.match(ring, /<span class="chart-stat"><b>Berry<\/b> 83%<\/span>/, 'the headline names the largest slice, whatever its colour slot');
  const many = Array.from({ length: 12 }, (_, i) => ({ name: `g${i}`, label: `Game ${i}` }));
  const trails = Object.fromEntries(many.map((g, i) => [g.name, twoDay({ from: MIDNIGHT - 15 * MIN, today: { turnover: (i + 1) * 1_000_000 } })]));
  const crowded = between(render({ rows: many, gameTrails: trails }), 'id="p-share-of-turnover"', '</section>');
  assert.match(crowded, /<span class="chart-stat"><b>Game \d+<\/b>/, 'never "Other", even when Other is the biggest slice');
});

test('players online runs across the day too, against yesterday', () => {
  const panel = between(render(), 'id="p-players-online"', '</section>');
  assert.match(panel, /class="chart day-curve"/);
  assert.match(panel, /peak <b>7<\/b> at 00:00Z</);
});

test('month-to-date shrinks to one strip at the foot, pointing to the Games page', () => {
  const strip = between(render(), 'class="panel month-strip"', '</section>');
  assert.match(strip, /This month/);
  assert.match(strip, /\+\$7\.50/, 'studio P/L -12.50 + 20');
  assert.match(strip, /\$750\.00/);
  assert.match(strip, />150</);
  assert.match(strip, /href="\/games"/);
});

test('the landing carries no tables: the catalogue and the month table live on the Games page', () => {
  const out = render();
  assert.doesNotMatch(out, /<table/);
  assert.doesNotMatch(out, /<h2>Not yet live<\/h2>/);
});

test('a trail that starts after midnight is flagged, with the time it starts', () => {
  const out = render({ teamTrail: twoDay({ from: MIDNIGHT + H }) });
  assert.match(out, /class="notice warning">[^<]*01:00Z/);
});

test('an empty collector draws the empty day, with dashes rather than confident zeros', () => {
  const out = render({ rows: [], teamTrail: [], onlineSince: [], gameTrails: {}, online: null });
  assert.match(out, /Nothing measured yet today/);
  assert.doesNotMatch(between(out, 'class="kpi-grid"', 'id="p-running-studio-p-l"'), /\$0\.00|>0</);
  assert.match(out, /No game has taken a bet today yet/);
});

test('untrusted game names from the API cannot inject markup', () => {
  const out = render({ rows: [{ ...berry, label: '<img src=x onerror=1>' }, geyser] });
  assert.doesNotMatch(out, /<img src=x/);
});

test('the landing is the active Overview entry', () => {
  assert.match(render(), /<a class="active" href="\/" aria-current="page">/);
});
