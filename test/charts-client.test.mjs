import { test } from 'node:test';
import assert from 'node:assert/strict';
import { runInNewContext } from 'node:vm';
import { chartsJs } from '../src/web/chart-assets.mjs';
import { heatmapData, treemapData, sankeyData, dailyData, liveData } from '../src/web/charts/interactive.mjs';
import { turnoverTree, turnoverFlow } from '../src/insights/conclusions.mjs';
import { dailyTrend } from '../src/insights/series.mjs';

// --- A fake page ----------------------------------------------------------
//
// Just enough DOM for charts.js: elements in a tree, lookup by id and by
// data-ichart, replaceWith, classList, and a <head> that "loads" a library
// script by defining its global - or fails it, on request.

class El {
  constructor(tag, { id = '', className = '', dataset = {}, text = '' } = {}) {
    Object.assign(this, { tagName: tag.toUpperCase(), id, className, dataset, textContent: text, children: [], parent: null, style: {}, hidden: false, clientWidth: 640 });
    const classes = new Set(className.split(' ').filter(Boolean));
    this.classList = { add: (c) => classes.add(c), remove: (c) => classes.delete(c), contains: (c) => classes.has(c) };
  }
  appendChild(child) { child.parent = this; this.children.push(child); return child; }
  replaceWith(other) {
    const at = this.parent.children.indexOf(this);
    this.parent.children[at] = other;
    other.parent = this.parent;
    this.parent = null;
  }
  querySelector(selector) {
    const cls = selector.slice(1);
    return this.children.find((c) => c.className.split(' ').includes(cls)) ?? null;
  }
  *walk() { yield this; for (const c of this.children) yield* c.walk(); }
}

function fakePage({ failLoads = false, reduced = false } = {}) {
  const root = new El('html'), head = root.appendChild(new El('head')), main = root.appendChild(new El('main'));
  const listeners = {}, loaded = [], charts = [], strips = [];
  const connected = (el) => { let n = el; while (n.parent) n = n.parent; return n === root; };
  Object.defineProperty(El.prototype, 'isConnected', { configurable: true, get() { return connected(this); } });
  const document = {
    head,
    createElement: (tag) => new El(tag),
    getElementById: (id) => [...root.walk()].find((el) => el.id === id) ?? null,
    querySelectorAll: (selector) => { assert.equal(selector, '[data-ichart]'); return [...main.walk()].filter((el) => el.dataset.ichart); },
    addEventListener: (type, fn) => { (listeners[type] ??= []).push(fn); },
  };
  const echarts = {
    init(plot) {
      const chart = { plot, options: [], disposed: false, resized: 0,
        setOption(o) { chart.options.push(o); }, resize() { chart.resized++; }, dispose() { chart.disposed = true; },
        getOption: () => ({ dataZoom: [{ start: 40, end: 90 }] }) };
      charts.push(chart);
      return chart;
    },
  };
  class TimeSeries {
    constructor(options) { this.options = options; this.data = []; this.bounds = 0; }
    append(ts, v) { this.data.push([ts, v]); }
    resetBounds() { this.bounds++; }
  }
  class SmoothieChart {
    constructor(options) { this.options = options; this.series = []; this.running = false; this.painted = 0; strips.push(this); }
    addTimeSeries(ts) { this.series.push(ts); }
    removeTimeSeries(ts) { this.series = this.series.filter((s) => s !== ts); }
    streamTo(canvas) { this.canvas = canvas; this.running = true; }
    stop() { this.running = false; }
    // Like the real one, which measures `this.canvas` before it draws.
    render() { if (!this.canvas) throw new TypeError('no canvas'); this.painted++; }
  }
  const observers = [];
  const window = {
    matchMedia: () => ({ matches: reduced }),
    requestAnimationFrame: () => 1, cancelAnimationFrame() {},
    ResizeObserver: class { constructor() { this.on = new Set(); observers.push(this); } observe(el) { this.on.add(el); } disconnect() { this.on.clear(); } },
    document,
  };
  head.appendChild = (script) => {
    loaded.push(script.src);
    queueMicrotask(() => {
      if (failLoads) return script.onerror();
      if (script.src.includes('echarts')) window.echarts = echarts;
      else Object.assign(window, { SmoothieChart, TimeSeries });
      script.onload();
    });
    return script;
  };
  window.window = window;

  /** Replace <main> with these charts, as a fragment refresh does. */
  function render(list) {
    for (const child of main.children) child.parent = null;
    main.children = [];
    for (const { id, kind, data } of list) {
      const box = main.appendChild(new El('div', { id, className: `ichart ichart-${kind}`, dataset: { ichart: kind } }));
      box.appendChild(new El(kind === 'live' ? 'canvas' : 'div', { className: 'ichart-plot' }));
      box.appendChild(new El('p', { className: 'ichart-note', text: 'The interactive chart needs JavaScript.' }));
      main.appendChild(new El('script', { id: `${id}-data`, text: JSON.stringify(data) }));
    }
  }
  const refresh = (list) => { render(list); for (const fn of listeners['stake:refreshed'] ?? []) fn(); };
  const run = () => runInNewContext(chartsJs({ echarts: '/vendor/echarts.min.js?v=e', smoothie: '/vendor/smoothie.js?v=s' }), window);
  const settle = () => new Promise((resolve) => setImmediate(resolve));
  const box = (id) => document.getElementById(id);
  return { render, refresh, run, settle, box, loaded, charts, strips, observers, main };
}

const money = { unitsPerDollar: 1_000_000, profitShare: 0.1, expectedShare: 0.075 };
const usd = (d) => d * 1_000_000;
const tree = treemapData(turnoverTree({ berry: [{ mode: 'BASE', cost: 1, turnover: usd(5) }, { mode: 'BONUS', cost: 100, turnover: usd(3) }] }, { berry: 'Berry' }, money), () => '#4a8ff5');
const flow = sankeyData(turnoverFlow({ berry: [{ mode: 'BASE', cost: 1, turnover: usd(5) }, { mode: 'BONUS', cost: 100, turnover: usd(3) }] }, { berry: 'Berry' }, money), () => '#4a8ff5');
const heat = heatmapData({ dates: ['2026-09-22', '2026-09-23'], cells: [{ day: 0, hour: 0, value: 4, inProgress: false }, { day: 0, hour: 1, value: null, inProgress: false }, { day: 1, hour: 0, value: 2, inProgress: true }] });
const daily = dailyData(dailyTrend([{ date: '2026-09-22', measured: true, turnover: 10, profit: -1 }, { date: '2026-09-23', measured: false }]));
const SLOT = 150_000, T = Date.parse('2026-09-23T12:00:00Z');
const live = (points) => liveData(points.map(([i, value]) => ({ ts: T + i * SLOT, value })), { label: 'Bets', colour: '#4a8ff5', slotMs: SLOT, hours: 3 });

test('a page without interactive charts loads no library at all', async () => {
  const page = fakePage();
  page.render([]);
  page.run();
  await page.settle();
  assert.deepEqual(page.loaded, []);
});

test('ECharts is loaded once for every ECharts chart on the page, and Smoothie only for a strip', async () => {
  const page = fakePage();
  page.render([{ id: 'turnover-tree', kind: 'treemap', data: tree }, { id: 'turnover-flow', kind: 'sankey', data: flow },
    { id: 'hour-by-day', kind: 'heatmap', data: heat }, { id: 'daily-zoom', kind: 'daily', data: daily }]);
  page.run();
  await page.settle();
  assert.deepEqual(page.loaded, ['/vendor/echarts.min.js?v=e']);
  assert.equal(page.charts.length, 4, 'every builder produced an option ECharts accepted');
  for (const id of ['turnover-tree', 'turnover-flow', 'hour-by-day', 'daily-zoom']) assert.ok(page.box(id).classList.contains('is-ready'), id);
  // The heatmap's missed hours have their own, invisible colour map: ECharts
  // refuses a heatmap series without one.
  const heatmap = page.charts.find((c) => c.plot.parent.id === 'hour-by-day').options[0];
  assert.deepEqual(Array.from(heatmap.visualMap, (v) => v.seriesIndex), [0, 1]);
  assert.equal(heatmap.series[1].data.length, 1);
});

test('tooltips are built as nodes - the CSP forbids the markup ECharts would otherwise write', async () => {
  const page = fakePage();
  page.render([{ id: 'turnover-tree', kind: 'treemap', data: tree }]);
  page.run();
  await page.settle();
  const option = page.charts[0].options[0];
  assert.equal(option.tooltip.confine, true, 'confined, so ECharts draws no arrow markup');
  const card = option.tooltip.formatter({ data: option.series[0].data[0] });
  assert.equal(card.className, 'ichart-tipbody');
  assert.equal(card.children[0].textContent, 'Berry');
  assert.equal(card.children[1].children[2].textContent, '$8.00');
});

test('a refresh that brings the same data keeps the chart on screen, zoom and all', async () => {
  const page = fakePage();
  const list = [{ id: 'daily-zoom', kind: 'daily', data: daily }];
  page.render(list);
  page.run();
  await page.settle();
  const first = page.box('daily-zoom');
  page.refresh(list);
  await page.settle();
  assert.equal(page.charts.length, 1, 'not rebuilt');
  assert.equal(page.box('daily-zoom'), first, 'the drawn chart is put back in the new page');
  assert.equal(page.charts[0].disposed, false);
});

test('new data goes onto the chart already drawn, keeping the reader\'s zoom', async () => {
  const page = fakePage();
  page.render([{ id: 'daily-zoom', kind: 'daily', data: daily }]);
  page.run();
  await page.settle();
  const first = page.box('daily-zoom');
  page.refresh([{ id: 'daily-zoom', kind: 'daily', data: { ...daily, turnover: [11, null] } }]);
  await page.settle();
  assert.equal(page.charts.length, 1, 'no second instance');
  assert.equal(page.charts[0].disposed, false);
  assert.equal(page.box('daily-zoom'), first);
  const [, next] = page.charts[0].options;
  assert.deepEqual(Array.from(next.series[0].data), [11, '-']);
  assert.deepEqual([next.dataZoom[0].start, next.dataZoom[0].end], [40, 90]);
});

test('new data with nothing left to draw rebuilds the chart as an empty state, and lets the old one go', async () => {
  const page = fakePage();
  page.render([{ id: 'turnover-tree', kind: 'treemap', data: tree }]);
  page.run();
  await page.settle();
  page.refresh([{ id: 'turnover-tree', kind: 'treemap', data: { nodes: [] } }]);
  await page.settle();
  assert.equal(page.charts[0].disposed, true);
  assert.equal(page.observers[0].on.size, 0, 'its resize observer is disconnected');
  assert.equal(page.box('turnover-tree').querySelector('.ichart-note').textContent, 'Nothing to chart yet.');
});

test('a chart whose container is gone after a refresh is disposed', async () => {
  const page = fakePage();
  page.render([{ id: 'turnover-tree', kind: 'treemap', data: tree }]);
  page.run();
  await page.settle();
  page.refresh([]);
  assert.equal(page.charts[0].disposed, true);
});

test('a live strip is fed the polls it has not seen, and a missed poll starts a new line', async () => {
  const page = fakePage();
  page.render([{ id: 'live-bets', kind: 'live', data: live([[0, 5], [1, 6], [2, 7]]) }]);
  page.run();
  await page.settle();
  assert.deepEqual(page.loaded, ['/vendor/smoothie.js?v=s']);
  const [strip] = page.strips;
  assert.equal(strip.running, true);
  assert.equal(strip.options.tooltip, false, 'Smoothie\'s own tooltip writes styled markup; it stays off');
  assert.equal(strip.series.length, 1);
  assert.equal(strip.series[0].options.resetBounds, false, 'no per-series timer');
  const canvas = page.box('live-bets');

  page.refresh([{ id: 'live-bets', kind: 'live', data: live([[1, 6], [2, 7], [3, null], [4, 9], [5, 9]]) }]);
  await page.settle();
  assert.equal(page.strips.length, 1, 'the same strip, still scrolling');
  assert.equal(page.box('live-bets'), canvas);
  assert.deepEqual(strip.series.map((s) => s.data.map(([ts, v]) => [(ts - T) / SLOT, v])), [[[0, 5], [1, 6], [2, 7]], [[4, 9], [5, 9]]],
    'nothing appended twice, and the gap at poll 3 is a break, not a line through it');
});

test('a strip that leaves the page is stopped and let go - no animation or series left running', async () => {
  const page = fakePage();
  page.render([{ id: 'live-online', kind: 'live', data: live([[0, 5], [1, 6]]) }]);
  page.run();
  await page.settle();
  page.refresh([]);
  assert.equal(page.strips[0].running, false);
  assert.equal(page.strips[0].series.length, 0);
});

test('a library that cannot load leaves the note standing, saying so, and nothing drawn', async () => {
  const page = fakePage({ failLoads: true });
  page.render([{ id: 'turnover-tree', kind: 'treemap', data: tree }]);
  page.run();
  await page.settle();
  const box = page.box('turnover-tree');
  assert.equal(box.classList.contains('is-ready'), false);
  assert.equal(box.querySelector('.ichart-note').textContent, 'The interactive chart could not load.');
  page.refresh([{ id: 'turnover-tree', kind: 'treemap', data: tree }]);
  await page.settle();
  assert.equal(page.loaded.length, 1, 'a failed load is not retried on every refresh');
});

test('unreadable or empty chart data is an empty state, never an exception', async () => {
  const page = fakePage();
  page.render([{ id: 'turnover-tree', kind: 'treemap', data: { nodes: [] } }, { id: 'hour-by-day', kind: 'heatmap', data: 'nonsense' }]);
  page.run();
  await page.settle();
  assert.equal(page.charts.length, 0);
  assert.equal(page.box('turnover-tree').querySelector('.ichart-note').textContent, 'Nothing to chart yet.');
  assert.match(page.box('hour-by-day').querySelector('.ichart-note').textContent, /could not be read/);
});

test('with reduced motion the strip is painted still, never set scrolling, and ECharts does not animate', async () => {
  const page = fakePage({ reduced: true });
  page.render([{ id: 'live-bets', kind: 'live', data: live([[0, 5], [1, 6]]) }, { id: 'daily-zoom', kind: 'daily', data: daily }]);
  page.run();
  await page.settle();
  const [strip] = page.strips;
  assert.ok(page.box('live-bets').classList.contains('is-ready'), 'drawn, not failed');
  assert.equal(strip.running, false);
  assert.ok(strip.painted >= 1);
  page.refresh([{ id: 'live-bets', kind: 'live', data: live([[0, 5], [1, 6], [2, 8]]) }, { id: 'daily-zoom', kind: 'daily', data: daily }]);
  await page.settle();
  assert.ok(strip.painted >= 2, 'repainted with the new poll');
  assert.equal(page.charts[0].options[0].animation, false);
});
