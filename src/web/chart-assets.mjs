/**
 * /charts.js and /charts.css: the interactive charts' client side.
 *
 * Every page links both (views/shell.mjs documentFor), and both are small.
 * The libraries are not: ECharts is over a megabyte. So charts.js loads a
 * library only when the page holds a container that needs it
 * (charts/interactive.mjs), by adding a <script src> for this server's own
 * copy - which the CSP's script-src 'self' allows, where a CDN or an inline
 * script would be refused. A page without these charts never fetches either.
 *
 * The client is written as an ordinary function and served as its source
 * text, so Node parses it on import (a syntax error fails the tests, not a
 * browser) and a test can run it against a fake DOM.
 *
 * Under the CSP (style-src 'self', no 'unsafe-inline') nothing here may write
 * a style attribute or HTML carrying one: every style is set through the
 * CSSOM, and every tooltip is built as DOM nodes, text via textContent -
 * game and mode names come from the upstream API.
 */

function chartsClient(LIBS) {
  'use strict';
  // Which library draws which kind of chart (the same map as CHART_KINDS),
  // and the global each one defines once loaded.
  const KINDS = { heatmap: 'echarts', treemap: 'echarts', sankey: 'echarts', daily: 'echarts', live: 'smoothie' };
  const GLOBALS = { echarts: 'echarts', smoothie: 'SmoothieChart' };
  // The dashboard's tokens (insights-assets.mjs :root).
  const T = { text: '#edf1f7', dim: '#8d9bb0', grid: '#263043', line: '#344055', mint: '#86e1c4', good: '#7fdec1', bad: '#ff8796', panel: '#131a26', ink: '#0c1019', turnover: '#4a8ff5' };
  const FONT = "-apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif";
  // Magnitude on the dark panel: one hue, dark to light, so a quiet hour sits
  // close to the panel and a busy one stands out - never a rainbow.
  const RAMP = ['#1f3d3f', '#2d6a60', '#4aa38c', '#86e1c4', '#cdf6e8'];
  const still = () => !!(window.matchMedia && matchMedia('(prefers-reduced-motion: reduce)').matches);
  const ints = (v) => Math.round(Number(v)).toLocaleString('en-US');

  // ---- loading -----------------------------------------------------------
  // One promise per library for the life of the page. A load that failed
  // stays failed: retrying on every 30-second refresh would only repeat the
  // same network error.
  const loads = {};
  function load(name) {
    if (!loads[name]) {
      loads[name] = new Promise((resolve, reject) => {
        const global = GLOBALS[name];
        if (window[global]) return resolve(window[global]);
        if (!LIBS[name]) return reject(new Error('not installed'));
        const script = document.createElement('script');
        script.src = LIBS[name];
        script.onload = () => (window[global] ? resolve(window[global]) : reject(new Error('empty')));
        script.onerror = () => reject(new Error('failed'));
        document.head.appendChild(script);
      });
    }
    return loads[name];
  }

  function parse(text) {
    try { const data = JSON.parse(text); return data && typeof data === 'object' ? data : null; } catch { return null; }
  }

  // ---- tooltips ----------------------------------------------------------
  // The same hover card as the SVG charts' (.chart-tip in app.css): built as
  // nodes, so no markup and no style attribute ever passes through innerHTML.
  function node(tag, className, text) {
    const el = document.createElement(tag);
    el.className = className;
    if (text !== undefined) el.textContent = text;
    return el;
  }
  function tipBox(tip) {
    const box = node('div', 'ichart-tipbody');
    if (!tip) return box;
    box.appendChild(node('div', 'tip-head', String(tip.head ?? '')));
    for (const r of tip.rows || []) {
      const row = node('div', 'tip-row'), key = node('i', 'tip-key');
      if (r.colour) key.style.background = String(r.colour); else key.hidden = true;
      row.appendChild(key);
      row.appendChild(node('span', 'tip-name', String(r.name ?? '')));
      row.appendChild(node('b', 'tip-val', String(r.value ?? '-')));
      box.appendChild(row);
    }
    if (tip.note) box.appendChild(node('div', 'tip-note', String(tip.note)));
    return box;
  }
  // `confine` keeps the card inside the chart, and also stops ECharts adding
  // its pointer arrow - which it writes as markup with a style attribute.
  function tooltip(formatter, extra) {
    return Object.assign({
      confine: true, formatter, className: 'ichart-tip',
      backgroundColor: 'rgba(17,24,36,.94)', borderColor: 'rgba(148,163,184,.26)', borderWidth: 1, padding: [10, 12],
      textStyle: { color: T.text, fontSize: 11, fontFamily: FONT },
      // Last, so it wins over the border colour ECharts takes from the mark.
      extraCssText: 'border-color:rgba(148,163,184,.26);border-radius:10px;box-shadow:0 14px 34px -12px rgba(0,0,0,.85);min-width:150px;line-height:1.5',
      transitionDuration: still() ? 0 : 0.2,
    }, extra);
  }

  const axisLabel = { color: T.dim, fontSize: 10, fontFamily: FONT };
  const base = (extra) => Object.assign({ backgroundColor: 'transparent', animation: !still(), textStyle: { fontFamily: FONT, color: T.dim, fontSize: 11 } }, extra);
  function usdShort(v, signed) {
    const n = Number(v), a = Math.abs(n);
    const sign = n < 0 ? '-' : signed && n > 0 ? '+' : '';
    const body = a >= 1e6 ? (a / 1e6).toFixed(a >= 1e7 ? 0 : 1) + 'M' : a >= 1e3 ? (a / 1e3).toFixed(a >= 1e4 ? 0 : 1) + 'k' : String(Math.round(a));
    return sign + '$' + body;
  }
  function alpha(hex, a) {
    const m = /^#([0-9a-f]{6})$/i.exec(String(hex || ''));
    if (!m) return 'transparent';
    const n = parseInt(m[1], 16);
    return 'rgba(' + (n >> 16) + ',' + ((n >> 8) & 255) + ',' + (n & 255) + ',' + a + ')';
  }

  // ---- the ECharts charts -----------------------------------------------
  // Each returns its option, or null when there is nothing to draw.
  const ECHARTS = {
    heatmap: {
      option(d) {
        if (!d.cells || (!d.cells.length && !(d.unmeasured || []).length)) return null;
        const filling = d.filling;
        const head = (h, day) => d.dayNames[day] + ', ' + d.hours[h] + ':00Z';
        return base({
          tooltip: tooltip((p) => {
            const [h, day, v] = p.value;
            if (p.seriesIndex === 1) return tipBox({ head: head(h, day), rows: [{ name: d.noun, value: '-' }], note: 'Not measured: left empty, not zero.' });
            const busy = filling && filling[0] === h && filling[1] === day;
            return tipBox({ head: head(h, day), rows: [{ name: d.noun, value: ints(v), colour: p.color }], note: busy ? 'This hour is still filling.' : null });
          }),
          grid: { left: 50, right: 6, top: 4, bottom: 56 },
          xAxis: { type: 'category', data: d.hours, axisLine: { lineStyle: { color: T.grid } }, axisTick: { show: false }, axisLabel, splitArea: { show: false } },
          yAxis: { type: 'category', data: d.days, axisLine: { show: false }, axisTick: { show: false }, axisLabel },
          visualMap: [
            { type: 'continuous', seriesIndex: 0, min: 0, max: Math.max(1, Number(d.max) || 0), calculable: false, orient: 'horizontal', left: 'center', bottom: 2,
              itemWidth: 10, itemHeight: 150, text: [ints(Math.max(1, Number(d.max) || 0)) + ' ' + d.noun, '0'], textGap: 8, textStyle: { color: T.dim, fontSize: 10, fontFamily: FONT },
              formatter: (v) => ints(v), inRange: { color: RAMP } },
            // The missed hours get a map of their own that paints nothing:
            // an outline on the panel, never a colour from the ramp.
            { type: 'continuous', seriesIndex: 1, show: false, min: 0, max: 1, inRange: { color: ['rgba(0,0,0,0)', 'rgba(0,0,0,0)'] } },
          ],
          series: [
            { type: 'heatmap', data: d.cells, itemStyle: { borderColor: T.panel, borderWidth: 2, borderRadius: 3 }, emphasis: { itemStyle: { borderColor: T.text, borderWidth: 1 } } },
            { type: 'heatmap', data: (d.unmeasured || []).map((c) => [c[0], c[1], 0]), itemStyle: { borderColor: T.line, borderWidth: 1, borderType: 'dashed', borderRadius: 3 }, emphasis: { disabled: true } },
          ],
        });
      },
    },
    treemap: {
      option(d) {
        if (!d.nodes || !d.nodes.length) return null;
        const paint = (n) => ({ name: n.name, value: n.value, tip: n.tip, itemStyle: n.colour ? { color: n.colour } : undefined, children: n.children ? n.children.map(paint) : undefined });
        return base({
          tooltip: tooltip((p) => tipBox(p.data && p.data.tip)),
          series: [{
            // Named, so the breadcrumb's first step back reads as somewhere.
            type: 'treemap', name: 'All games', data: d.nodes.map(paint), roam: false, nodeClick: 'zoomToNode', top: 0, left: 0, right: 0, bottom: 30,
            breadcrumb: { show: true, left: 0, bottom: 0, height: 22, emptyItemWidth: 20,
              itemStyle: { color: '#1b2535', borderColor: T.line, borderWidth: 1, textStyle: { color: T.dim, fontSize: 11, fontFamily: FONT } },
              emphasis: { itemStyle: { color: '#263447', textStyle: { color: T.text } } } },
            label: { show: true, color: T.ink, fontSize: 11, fontFamily: FONT, overflow: 'truncate', formatter: '{b}' },
            // A game's name sits on its border band, which is the panel's colour.
            upperLabel: { show: true, height: 20, color: T.text, fontSize: 11, fontWeight: 600, fontFamily: FONT },
            levels: [
              { itemStyle: { borderWidth: 0, gapWidth: 3, borderColor: T.panel }, upperLabel: { show: false } },
              { itemStyle: { borderWidth: 2, gapWidth: 1, borderColor: T.panel } },
              { itemStyle: { borderWidth: 1, borderColor: 'rgba(19,26,38,.6)' } },
            ],
          }],
        });
      },
    },
    sankey: {
      // A row per game, so the height follows the roster.
      size(d, plot) {
        const games = (d.nodes || []).filter((n) => String(n.id).startsWith('game:')).length;
        plot.style.height = Math.max(240, games * 30 + 40) + 'px';
      },
      responsive: true,
      option(d, plot) {
        if (!d.links || !d.links.length) return null;
        const narrow = plot.clientWidth < 520;
        return base({
          tooltip: tooltip((p) => tipBox(p.data && p.data.tip)),
          series: [{
            type: 'sankey', left: 2, right: 2, top: 6, bottom: 6, nodeWidth: 10, nodeGap: narrow ? 8 : 10, nodeAlign: 'justify',
            layoutIterations: 0, draggable: false, emphasis: { focus: 'adjacency' },
            data: d.nodes.map((n) => ({ name: n.id, display: n.name, tip: n.tip, itemStyle: { color: n.colour, borderWidth: 0 } })),
            links: d.links.map((l) => ({ source: l.source, target: l.target, value: l.value, tip: l.tip, lineStyle: { color: l.colour } })),
            lineStyle: { opacity: 0.32, curveness: 0.5 },
            label: { color: T.text, fontSize: narrow ? 10 : 11, fontFamily: FONT, width: narrow ? 86 : 170, overflow: 'truncate', formatter: (p) => (p.data && p.data.display) || '' },
            levels: [{ depth: 2, label: { position: 'left' } }],
          }],
        });
      },
    },
    daily: {
      // The zoom a reader chose outlives a redraw with new data.
      save(chart) {
        const zoom = (chart.getOption().dataZoom || [])[0];
        return zoom ? { start: zoom.start, end: zoom.end } : null;
      },
      option(d, plot, saved) {
        const has = (list) => (list || []).some((v) => v !== null);
        if (!has(d.turnover) && !has(d.profit)) return null;
        const zoom = saved || { start: 0, end: 100 };
        const title = (text, top) => ({ text, left: 0, top, textStyle: { color: T.dim, fontSize: 11, fontWeight: 500, fontFamily: FONT } });
        const split = { lineStyle: { color: T.grid, type: 'dashed' } };
        return base({
          tooltip: tooltip((ps) => tipBox(d.tips[(Array.isArray(ps) ? ps[0] : ps).dataIndex]),
            { trigger: 'axis', axisPointer: { type: 'shadow', shadowStyle: { color: 'rgba(148,163,184,.08)' } } }),
          axisPointer: { link: [{ xAxisIndex: 'all' }] },
          // Two measures, two grids: turnover and P/L never share an axis.
          title: [title('Turnover per day', 0), title('Studio P/L per day', '50%')],
          grid: [{ left: 54, right: 8, top: 22, height: '31%' }, { left: 54, right: 8, top: '58%', height: '22%' }],
          xAxis: [
            { type: 'category', gridIndex: 0, data: d.dates, axisLabel: { show: false }, axisTick: { show: false }, axisLine: { lineStyle: { color: T.grid } } },
            { type: 'category', gridIndex: 1, data: d.dates, axisLabel, axisTick: { show: false }, axisLine: { lineStyle: { color: T.grid } } },
          ],
          yAxis: [
            { type: 'value', gridIndex: 0, splitNumber: 3, axisLabel: Object.assign({ formatter: (v) => usdShort(v) }, axisLabel), splitLine: split },
            { type: 'value', gridIndex: 1, splitNumber: 2, axisLabel: Object.assign({ formatter: (v) => usdShort(v, true) }, axisLabel), splitLine: split },
          ],
          // A slider only: an "inside" zoom would take the page's own scroll
          // wheel and touch-drag away from the reader.
          dataZoom: [{ type: 'slider', xAxisIndex: [0, 1], start: zoom.start, end: zoom.end, bottom: 4, height: 22, brushSelect: false,
            borderColor: T.line, backgroundColor: 'rgba(7,10,16,.55)', fillerColor: 'rgba(134,225,196,.14)',
            handleStyle: { color: T.mint, borderColor: T.mint }, moveHandleStyle: { color: T.line }, textStyle: { color: T.dim, fontSize: 10, fontFamily: FONT },
            dataBackground: { lineStyle: { color: T.turnover, opacity: 0.5 }, areaStyle: { color: T.turnover, opacity: 0.12 } },
            selectedDataBackground: { lineStyle: { color: T.mint, opacity: 0.7 }, areaStyle: { color: T.mint, opacity: 0.15 } } }],
          series: [
            { name: 'turnover', type: 'bar', xAxisIndex: 0, yAxisIndex: 0, barMaxWidth: 18,
              data: d.turnover.map((v) => (v === null ? '-' : v)), itemStyle: { color: T.turnover, borderRadius: [3, 3, 0, 0] } },
            // Zero is green by the standing ruling: a day that broke even did not lose.
            { name: 'studio P/L', type: 'bar', xAxisIndex: 1, yAxisIndex: 1, barMaxWidth: 18,
              data: d.profit.map((v) => (v === null ? '-' : { value: v, itemStyle: { color: v < 0 ? T.bad : T.good, borderRadius: v < 0 ? [0, 0, 3, 3] : [3, 3, 0, 0] } })) },
          ],
        });
      },
    },
  };

  function drawEcharts(entry, data, echarts) {
    const kind = ECHARTS[entry.kind], plot = entry.plot;
    if (kind.size) kind.size(data, plot);
    // Shown before init, so ECharts measures the plot at its real size.
    entry.el.classList.add('is-ready');
    const option = kind.option(data, plot, entry.saved);
    if (!option) { entry.el.classList.remove('is-ready'); entry.say('Nothing to chart yet.'); return; }
    const chart = echarts.init(plot, null, { renderer: 'canvas' });
    // Disposable from the moment it exists, so an option ECharts rejects
    // below still leaves nothing behind.
    entry.teardown = () => chart.dispose();
    chart.setOption(option);
    let frame = 0, current = data;
    const observer = typeof ResizeObserver === 'function' ? new ResizeObserver(() => {
      cancelAnimationFrame(frame);
      frame = requestAnimationFrame(() => {
        if (kind.size) kind.size(current, plot);
        if (kind.responsive) chart.setOption(kind.option(current, plot, kind.save ? kind.save(chart) : null));
        chart.resize();
      });
    }) : null;
    if (observer) observer.observe(plot);
    entry.save = kind.save ? () => kind.save(chart) : null;
    // New figures go onto the chart already drawn: ECharts moves each mark
    // to its new place rather than drawing the whole chart in again, once a
    // poll. False when there is nothing left to draw - the caller rebuilds.
    entry.update = (next) => {
      if (kind.size) kind.size(next, plot);
      const nextOption = kind.option(next, plot, kind.save ? kind.save(chart) : null);
      if (!nextOption) return false;
      chart.setOption(nextOption);
      chart.resize();
      current = next;
      return true;
    };
    entry.teardown = () => { if (observer) observer.disconnect(); cancelAnimationFrame(frame); chart.dispose(); };
    entry.ready = true;
  }

  // ---- the Smoothie strip -----------------------------------------------
  // The data moves once per poll, so the strip scrolls at the pace of a
  // window of hours across its width, repainting at most twice a second. It
  // scrolls on the browser's clock while the points carry the server's; at
  // several seconds a pixel, a clock a minute out moves the line a few pixels.
  // Each unbroken run of polls is its own series: Smoothie joins every point
  // it is given, and a missed poll must stay a break in the line.
  function drawLive(entry, data) {
    const canvas = entry.plot, calm = still();
    const Smoothie = window.SmoothieChart, Series = window.TimeSeries;
    const speed = () => data.windowMs / Math.max(1, canvas.clientWidth || 300);
    entry.el.classList.add('is-ready');
    const chart = new Smoothie({
      responsive: true, millisPerPixel: speed(), interpolation: 'linear', tooltip: false,
      // The scale snaps rather than easing: eased a step per frame at two
      // frames a second, a new peak would draw off the top for many seconds.
      limitFPS: calm ? 0 : 2, scaleSmoothing: 1, minValue: 0, maxValueScale: 1.15,
      grid: { fillStyle: 'transparent', strokeStyle: T.grid, lineWidth: 1, millisPerLine: 30 * 60000, verticalSections: 2, borderVisible: false },
      labels: { fillStyle: T.dim, fontSize: 10, fontFamily: FONT, precision: 0 },
      timestampFormatter: (date) => date.toISOString().slice(11, 16) + 'Z',
    });
    const style = { strokeStyle: data.colour, lineWidth: 2, fillStyle: alpha(data.colour, 0.12) };
    const strip = { runs: [], run: null, last: -Infinity, lastMeasured: -Infinity };
    // With reduced motion the strip does not scroll: it is painted once per
    // feed and per resize, at the time it was painted. Smoothie measures
    // `chart.canvas` before it draws, so that is set before the first paint.
    if (calm) chart.canvas = canvas;
    const paint = () => { chart.lastChartTimestamp = 0; chart.lastRenderTimeMillis = 0; chart.render(canvas, Date.now()); };
    function feed(d) {
      for (const [ts, v] of d.points || []) {
        if (!(ts > strip.last)) continue;
        strip.last = ts;
        if (v === null || !Number.isFinite(v)) { strip.run = null; continue; }
        if (!strip.run || ts - strip.lastMeasured > d.slotMs * 1.5) {
          strip.run = new Series({ resetBounds: false });
          chart.addTimeSeries(strip.run, style);
          strip.runs.push(strip.run);
        }
        strip.run.append(ts, v);
        strip.lastMeasured = ts;
      }
      // Runs that have scrolled out of the window are let go, and the scale
      // is recomputed from what is left - here, once per poll, rather than on
      // the three-second timer Smoothie would otherwise give every series.
      const oldest = Date.now() - d.windowMs - d.slotMs;
      strip.runs = strip.runs.filter((run) => {
        const keep = run.data.length > 0 && run.data[run.data.length - 1][0] >= oldest;
        if (!keep) { chart.removeTimeSeries(run); if (strip.run === run) strip.run = null; }
        return keep;
      });
      strip.runs.forEach((run) => run.resetBounds());
      if (calm) paint();
    }
    feed(data);
    if (!calm) chart.streamTo(canvas, 0);
    const observer = typeof ResizeObserver === 'function' ? new ResizeObserver(() => {
      chart.options.millisPerPixel = speed();
      if (calm) paint();
    }) : null;
    if (observer) observer.observe(canvas);
    entry.update = (next) => { feed(next); return true; };
    entry.teardown = () => {
      if (observer) observer.disconnect();
      chart.stop();
      strip.runs.forEach((run) => chart.removeTimeSeries(run));
      strip.runs = [];
    };
    entry.ready = true;
  }

  // ---- mounting, and the live refresh -----------------------------------
  // Every chart on the page, by container id. app.js replaces <main> on each
  // refresh and then fires `stake:refreshed`. The chart already on screen is
  // then put back in the new page's place - so a reader's zoom, drill-down
  // and hover survive - and given the new figures if there are any: a live
  // strip takes the polls it has not seen, an ECharts chart its new option.
  // Only a chart that cannot take them is rebuilt, and every chart whose
  // container is gone is disposed, its observers and animation frames with it.
  const mounted = new Map();

  function mount(el, text, saved) {
    const entry = {
      el, text, kind: el.dataset.ichart, plot: el.querySelector('.ichart-plot'), saved, ready: false, dead: false,
      teardown: null, save: null, update: null,
      say(words) { const note = el.querySelector('.ichart-note'); if (note) note.textContent = words; },
      dispose() {
        entry.dead = true;
        const down = entry.teardown;
        entry.teardown = null;
        if (down) { try { down(); } catch { /* already gone */ } }
      },
    };
    const lib = KINDS[entry.kind];
    const data = parse(text);
    if (!lib || !entry.plot) { entry.say('This chart could not be drawn.'); return entry; }
    if (!data) { entry.say('This chart’s data could not be read.'); return entry; }
    load(lib).then((library) => {
      if (entry.dead || !el.isConnected) return;
      try {
        if (lib === 'echarts') drawEcharts(entry, data, library); else drawLive(entry, data);
      } catch {
        entry.dispose();
        el.classList.remove('is-ready');
        entry.say('The interactive chart could not be drawn.');
      }
    }, () => entry.say('The interactive chart could not load.'));
    return entry;
  }

  function scan() {
    const present = new Set();
    for (const el of Array.from(document.querySelectorAll('[data-ichart]'))) {
      const id = el.id;
      if (!id) continue;
      present.add(id);
      const source = document.getElementById(id + '-data');
      const text = source ? source.textContent : '';
      const prev = mounted.get(id);
      if (prev && prev.el === el) continue;
      if (prev && prev.ready && prev.kind === el.dataset.ichart) {
        // In first, so the chart measures the page it now sits in.
        el.replaceWith(prev.el);
        if (prev.text === text) continue;
        const data = parse(text);
        let taken = false;
        try { taken = !!(data && prev.update && prev.update(data)); } catch { taken = false; }
        if (taken) { prev.text = text; continue; }
        prev.el.replaceWith(el);
      }
      const saved = prev && prev.save ? prev.save() : null;
      if (prev) prev.dispose();
      mounted.set(id, mount(el, text, saved));
    }
    for (const [id, entry] of mounted) {
      if (!present.has(id)) { entry.dispose(); mounted.delete(id); }
    }
  }

  document.addEventListener('stake:refreshed', scan);
  scan();
  return { scan, mounted };
}

/** The served /charts.js, with this server's content-hashed library URLs (null: not installed). */
export function chartsJs({ echarts = null, smoothie = null } = {}) {
  return `(${chartsClient})(${JSON.stringify({ echarts, smoothie })});\n`;
}

export const CHARTS_CSS = `
.ichart{position:relative;width:100%;min-width:0}
.ichart-plot{display:none;width:100%}
.ichart.is-ready .ichart-plot{display:block}
.ichart.is-ready .ichart-note{display:none}
.ichart-note{margin:0;padding:22px 0;text-align:center;color:var(--dim);font-size:11.5px}
.ichart-heatmap .ichart-plot{height:292px}
.ichart-treemap .ichart-plot{height:380px}
.ichart-sankey .ichart-plot{height:320px}
.ichart-daily .ichart-plot{height:400px}
.ichart-live .ichart-plot{height:92px}
.ichart-empty{padding:26px 0;color:var(--dim)}
.ichart-tipbody{white-space:normal}
.live-strips{display:grid;gap:18px}
.live-head{display:flex;align-items:baseline;justify-content:space-between;gap:12px;margin:0 0 6px;font-size:11px;color:var(--dim)}
.live-head b{color:var(--text);font-size:13px;font-weight:600;font-variant-numeric:tabular-nums}
.live-head em{font-style:normal;color:#6e7f99;margin-left:6px}
@media(max-width:600px){.ichart-treemap .ichart-plot{height:320px}.ichart-daily .ichart-plot{height:360px}.ichart-heatmap .ichart-plot{height:270px}}
`;
