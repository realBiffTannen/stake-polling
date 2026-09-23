import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { dirname, join } from 'node:path';
import { scriptJson } from '../src/web/html.mjs';
import { interactiveChart, emptyChart, heatmapData, treemapData, sankeyData, dailyData, liveData, latestReading, CHART_KINDS } from '../src/web/charts/interactive.mjs';
import { turnoverTree, turnoverFlow } from '../src/insights/conclusions.mjs';
import { dailyTrend } from '../src/insights/series.mjs';
import { documentFor } from '../src/web/views/shell.mjs';
import { STATIC, assetUrl } from '../src/web/static.mjs';
import { createWebServer } from '../src/web/server.mjs';
import { buildInsights } from '../src/insights/model.mjs';

const money = { unitsPerDollar: 1_000_000, profitShare: 0.1, expectedShare: 0.075 };
const usd = (dollars) => dollars * 1_000_000;
const H = 3_600_000, SLOT = 150_000;

/** The JSON a page carries for chart `id`, exactly as the browser will read it. */
function chartJson(page, id) {
  const found = String(page).match(new RegExp(`<script type="application/json" id="${id}-data">([\\s\\S]*?)</script>`));
  assert.ok(found, `no data element for ${id}`);
  return JSON.parse(found[1]);
}

// ------------------------------------------------------------ JSON in HTML

test('chart JSON cannot close its script element, open a comment, or carry a raw line separator', () => {
  const hostile = { name: '</script><script>alert(1)</script>', note: '<!-- x --> & </SCRIPT >', sep: 'a\u2028b\u2029c', quote: '"\'' };
  const out = String(scriptJson(hostile));
  assert.doesNotMatch(out, /[<>&\u2028\u2029]/);
  assert.deepEqual(JSON.parse(out), hostile, 'the escapes are JSON\'s own, so the data reads back unchanged');
  assert.equal(String(scriptJson(undefined)), 'null');
});

test('a hostile mode name inside a whole chart mount still reads back as data, and ends the element exactly once', () => {
  const data = { nodes: [{ name: 'BASE</script><img src=x onerror=alert(1)>', value: 1 }] };
  const out = String(interactiveChart({ id: 'turnover-tree', kind: 'treemap', title: 'a "title" <b>', data }));
  assert.equal((out.match(/<\/script>/g) ?? []).length, 1);
  assert.deepEqual(chartJson(out, 'turnover-tree'), data);
  assert.match(out, /aria-label="a &quot;title&quot; &lt;b&gt;"/, 'the title is escaped like any interpolation');
});

test('a mount is a container, a note that stands without JavaScript, and inert JSON', () => {
  const out = String(interactiveChart({ id: 'hour-by-day', kind: 'heatmap', title: 'Bets', data: { a: 1 } }));
  assert.match(out, /<div class="ichart ichart-heatmap" id="hour-by-day" data-ichart="heatmap"><div class="ichart-plot" role="img" aria-label="Bets"><\/div><p class="ichart-note">The interactive chart needs JavaScript\.<\/p><\/div>/);
  assert.match(out, /<script type="application\/json" id="hour-by-day-data">\{"a":1\}<\/script>/);
  assert.match(String(interactiveChart({ id: 'live-bets', kind: 'live', title: 'Bets', data: {} })), /<canvas class="ichart-plot"/);
  assert.throws(() => interactiveChart({ id: 'x', kind: 'pie', data: {} }), /Unknown chart kind/);
  assert.deepEqual(Object.keys(CHART_KINDS).sort(), ['daily', 'heatmap', 'live', 'sankey', 'treemap']);
  assert.match(String(emptyChart('<why>')), /class="empty-state ichart-empty"><b>Nothing to chart yet<\/b><span>&lt;why&gt;<\/span>/);
});

// ------------------------------------------------------------ payloads

test('heatmap cells: measured, missed and still-filling hours are three different things', () => {
  const data = heatmapData({ dates: ['2026-09-22', '2026-09-23'], cells: [
    { day: 0, hour: 0, value: 12, inProgress: false }, { day: 0, hour: 1, value: null, inProgress: false },
    { day: 0, hour: 2, value: 0, inProgress: false }, { day: 1, hour: 0, value: 3, inProgress: true },
  ] });
  assert.deepEqual(data.cells, [[0, 0, 12], [2, 0, 0], [0, 1, 3]], 'a measured zero is drawn');
  assert.deepEqual(data.unmeasured, [[1, 0]]);
  assert.deepEqual(data.filling, [0, 1]);
  assert.deepEqual(data.days, ['Sep 22', 'Sep 23']);
  assert.equal(data.dayNames[0], 'Tue, Sep 22');
  assert.equal(data.hours.length, 24);
  assert.equal(data.max, 12);
  assert.equal(heatmapData({ dates: [], cells: [{ day: 0, hour: 5, value: null, inProgress: true }] }).unmeasured.length, 0, 'an hour still filling is not a missed one');
  assert.equal(heatmapData(null).max, null);
});

test('treemap nodes carry each game\'s colour and a formatted readout for every tile', () => {
  const tree = turnoverTree({ berry: [{ mode: 'BASE', cost: 1, turnover: usd(300) }, { mode: 'BONUS', cost: 100, turnover: usd(100) }],
    'pixel-geyser': [{ mode: 'BASE', cost: 1, turnover: usd(100) }] }, { berry: 'Berry', 'pixel-geyser': 'Pixel Geyser' }, money);
  const data = treemapData(tree, (slug) => (slug === 'berry' ? '#111111' : '#222222'));
  assert.deepEqual(data.nodes.map((n) => [n.name, n.value, n.colour, n.children.length]), [['Berry', 400, '#111111', 2], ['Pixel Geyser', 100, '#222222', 1]]);
  const bonus = data.nodes[0].children[1];
  assert.equal(bonus.tip.head, 'Berry · BONUS');
  assert.deepEqual(bonus.tip.rows.map((r) => r.value), ['$100.00', '25.0%', '20.0%']);
  assert.equal(bonus.tip.note, 'A feature buy.');
  assert.deepEqual(treemapData(turnoverTree({}, {}, money)), { nodes: [] });
});

test('sankey ids are namespaced, so a game named like a side of the split cannot be confused with it', () => {
  const flow = turnoverFlow({ 'base-play': [{ mode: 'BASE', cost: 1, turnover: usd(90) }, { mode: 'BONUS', cost: 100, turnover: usd(10) }],
    berry: [{ mode: 'BASE', cost: 1, turnover: usd(50) }] }, { 'base-play': 'Base play', berry: 'Berry' }, money);
  const data = sankeyData(flow, () => '#123456');
  assert.deepEqual(data.nodes.map((n) => n.id), ['studio', 'game:base-play', 'game:berry', 'base', 'buys']);
  assert.deepEqual(data.links.map((l) => `${l.source}>${l.target}:${l.value}`),
    ['studio>game:base-play:100', 'game:base-play>base:90', 'game:base-play>buys:10', 'studio>game:berry:50', 'game:berry>base:50'],
    'berry bought nothing, so it has no link to buys - a zero is not a flow');
  assert.equal(data.links[2].tip.head, 'Base play → Feature buys');
  const noBuys = sankeyData(turnoverFlow({ berry: [{ mode: 'BASE', cost: 1, turnover: usd(5) }] }, {}, money));
  assert.ok(!noBuys.nodes.some((n) => n.id === 'buys'), 'no buys node when nothing was bought');
  assert.deepEqual(sankeyData(turnoverFlow({}, {}, money)), { nodes: [], links: [] });
});

test('the daily payload keeps a missed day null and says so in its readout', () => {
  const data = dailyData(dailyTrend([{ date: '2026-09-21', measured: true, turnover: 100, profit: -2 }, { date: '2026-09-22', measured: false },
    { date: '2026-09-23', measured: true, turnover: 50, profit: 1, current: true }]));
  assert.deepEqual(data.dates, ['09-21', '09-22', '09-23']);
  assert.deepEqual(data.turnover, [100, null, 50]);
  assert.deepEqual(data.profit, [-2, null, 1]);
  assert.deepEqual(data.tips[0].rows.map((r) => r.value), ['$100.00', '-$2.00']);
  assert.deepEqual(data.tips[1].rows.map((r) => r.value), ['-', '-'], 'a dash, never $0.00');
  assert.match(data.tips[1].note, /left empty, not zero/);
  assert.match(data.tips[2].head, /still filling/);
});

test('a live strip is [time, value] pairs with its window, and its latest reading skips a trailing gap', () => {
  const points = [{ ts: 1, value: 4 }, { ts: 2, value: null }, { ts: 3, value: 1234.4 }];
  assert.deepEqual(liveData(points, { label: 'Bets', colour: '#4a8ff5', slotMs: SLOT, hours: 3 }),
    { label: 'Bets', colour: '#4a8ff5', slotMs: SLOT, windowMs: 3 * H, points: [[1, 4], [2, null], [3, 1234.4]] });
  assert.equal(latestReading(points), '1,234');
  assert.equal(latestReading([{ ts: 1, value: 3 }, { ts: 2, value: null }]), '3');
  assert.equal(latestReading([]), null);
});

// ------------------------------------------------------------ shell and static

test('every page links the charts stylesheet and script, under content-hash URLs, deferred', () => {
  const out = documentFor({ body: 'x' });
  assert.match(out, /<link rel="stylesheet" href="\/charts\.css\?v=[0-9a-f]{16}">/);
  assert.match(out, /<script src="\/charts\.js\?v=[0-9a-f]{16}" defer><\/script>/);
  assert.doesNotMatch(out, /echarts|smoothie/i, 'the libraries themselves are loaded only by a page that needs them');
});

test('the libraries are served byte for byte from node_modules, and charts.js names them by their hashed URLs', () => {
  const require = createRequire(import.meta.url);
  const echarts = readFileSync(join(dirname(require.resolve('echarts')), 'echarts.min.js'));
  const smoothie = readFileSync(require.resolve('smoothie'));
  assert.ok(Buffer.from(STATIC['/vendor/echarts.min.js'].body).equals(echarts));
  assert.ok(Buffer.from(STATIC['/vendor/smoothie.js'].body).equals(smoothie));
  const client = String(STATIC['/charts.js'].body);
  assert.ok(client.includes(JSON.stringify(assetUrl('/vendor/echarts.min.js'))));
  assert.ok(client.includes(JSON.stringify(assetUrl('/vendor/smoothie.js'))));
  assert.doesNotThrow(() => new Function(client), 'charts.js parses');
});

test('the server hands out the chart files with the right types, cached under their hashes, gzipped on request', async (t) => {
  const T0 = Date.parse('2026-09-22T12:00:00Z');
  const server = createWebServer({ read: async (query) => ({ model: buildInsights({ snapshot: {}, now: T0, query }),
    state: { now: T0, lastOk: T0, ageMs: 0, pollMinutes: 2.5, dataVersion: 1, meta: {}, money, rows: [] } }), version: () => 1, now: () => T0 });
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
  t.after(() => new Promise((resolve) => { server.close(resolve); server.closeAllConnections(); }));
  const base = `http://127.0.0.1:${server.address().port}`;
  const types = { '/charts.js': /^text\/javascript/, '/charts.css': /^text\/css/, '/vendor/echarts.min.js': /^text\/javascript/, '/vendor/smoothie.js': /^text\/javascript/ };
  for (const [path, type] of Object.entries(types)) {
    const res = await fetch(base + assetUrl(path), { headers: { 'accept-encoding': 'gzip' } });
    assert.equal(res.status, 200, path);
    assert.match(res.headers.get('content-type'), type, path);
    assert.match(res.headers.get('cache-control'), /max-age=86400, immutable/, path);
    assert.equal(res.headers.get('content-encoding'), 'gzip', path);
    assert.match(res.headers.get('content-security-policy'), /script-src 'self'/, path);
    assert.equal((await res.arrayBuffer()).byteLength > 0, true);
  }
  const page = await (await fetch(base + '/')).text();
  assert.match(page, /\/charts\.js\?v=/);
});

test('the chart stylesheet keeps a plot hidden until its chart is drawn, and the note up until then', () => {
  const css = String(STATIC['/charts.css'].body);
  assert.match(css, /\.ichart-plot\{display:none/);
  assert.match(css, /\.ichart\.is-ready \.ichart-plot\{display:block\}/);
  assert.match(css, /\.ichart\.is-ready \.ichart-note\{display:none\}/);
  assert.doesNotMatch(css, /@import|url\(/, 'nothing fetched from anywhere else');
});
