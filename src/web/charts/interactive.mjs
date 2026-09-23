/**
 * The interactive charts: their mount points, and the data each one draws.
 *
 * The server does all the arithmetic, exactly as it does for the SVG charts.
 * What reaches the browser is a container, a note that stands until the chart
 * replaces it, and the chart's numbers as inert JSON in a
 * `<script type="application/json">` element - data, never code, so the
 * page's CSP (script-src 'self', no inline script) has nothing to object to.
 * /charts.js (chart-assets.mjs) loads ECharts or Smoothie only on a page that
 * has one of these containers, and draws from that JSON.
 *
 * Money is formatted here, by money.mjs, for the same reason as everywhere
 * else: there is one definition of what a dollar looks like, and the browser
 * does not get a second one.
 *
 * Without JavaScript, or with a library that failed to load, the panel keeps
 * its conclusion and the note. An empty chart is an empty state, never a
 * chart of nothing.
 */

import { html, scriptJson } from '../html.mjs';
import { formatUsd, formatUsdSigned } from '../../money.mjs';

/** Which library draws each kind of chart. charts.js loads only what a page names. */
export const CHART_KINDS = { heatmap: 'echarts', treemap: 'echarts', sankey: 'echarts', daily: 'echarts', live: 'smoothie' };

// The dashboard's own tokens (insights-assets.mjs), for the marks the server
// colours. Game colours arrive from the donut palette through `colourOf`.
export const ACCENTS = { mint: '#86e1c4', violet: '#a69aff', neutral: '#c5d0de', turnover: '#4a8ff5', online: '#2fa88f' };

const HOUR_MS = 3_600_000;
const pct = (v, of) => `${(v / of * 100).toFixed(1)}%`;
const ints = (v) => Math.round(v).toLocaleString('en-US');
const dayName = (date) => new Date(`${date}T00:00:00Z`).toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric', timeZone: 'UTC' });
const dayShort = (date) => new Date(`${date}T00:00:00Z`).toLocaleDateString('en-US', { month: 'short', day: 'numeric', timeZone: 'UTC' });

/**
 * A chart's mount point: the container charts.js draws into, the note that
 * stands without it, and the data. `id` must be unique on the page; the data
 * element is `<id>-data`.
 */
export function interactiveChart({ id, kind, title, data, note = 'The interactive chart needs JavaScript.' }) {
  if (!Object.hasOwn(CHART_KINDS, kind)) throw new Error(`Unknown chart kind: ${kind}`);
  // A live strip is drawn straight onto a canvas; ECharts brings its own.
  const plot = kind === 'live'
    ? html`<canvas class="ichart-plot" role="img" aria-label="${title}"></canvas>`
    : html`<div class="ichart-plot" role="img" aria-label="${title}"></div>`;
  return html`<div class="ichart ichart-${kind}" id="${id}" data-ichart="${kind}">${plot}<p class="ichart-note">${note}</p></div><script type="application/json" id="${id}-data">${scriptJson(data)}</script>`;
}

/** What a chart panel shows when there is nothing to draw. */
export function emptyChart(reason) {
  return html`<div class="empty-state ichart-empty"><b>Nothing to chart yet</b><span>${reason}</span></div>`;
}

/**
 * The hour-by-day grid (series.mjs hourByDay) as heatmap cells.
 *
 * Measured cells are `[hour, day, value]`. An hour the collector missed is
 * listed apart, in `unmeasured`, and drawn as an empty outline - it must not
 * take the colour of a quiet hour. Hours that have not happened yet are in
 * neither list. The hour still filling is flagged so its readout says so.
 */
export function heatmapData(grid, { noun = 'bets' } = {}) {
  const cells = [], unmeasured = [];
  let filling = null;
  for (const c of grid?.cells ?? []) {
    if (c.value === null) {
      if (!c.inProgress) unmeasured.push([c.hour, c.day]);
      continue;
    }
    cells.push([c.hour, c.day, c.value]);
    if (c.inProgress) filling = [c.hour, c.day];
  }
  return {
    noun,
    hours: Array.from({ length: 24 }, (_, h) => String(h).padStart(2, '0')),
    days: (grid?.dates ?? []).map(dayShort),
    dayNames: (grid?.dates ?? []).map(dayName),
    cells, unmeasured, filling,
    max: cells.length ? Math.max(...cells.map((c) => c[2])) : null,
  };
}

/**
 * Turnover by game then mode (conclusions.mjs turnoverTree) as treemap nodes,
 * each game in its donut colour, each carrying its hover readout.
 */
export function treemapData(tree, colourOf = () => ACCENTS.neutral) {
  const total = tree?.total;
  if (!total) return { nodes: [] };
  return {
    nodes: tree.games.map((g) => ({
      name: g.label, value: g.value, colour: colourOf(g.key),
      tip: { head: g.label, rows: [{ name: 'turnover', value: formatUsd(g.value) }, { name: 'share of all turnover', value: pct(g.value, total) }] },
      children: g.modes.map((m) => ({
        name: m.mode, value: m.value,
        tip: { head: `${g.label} · ${m.mode}`, note: m.buy ? 'A feature buy.' : null,
          rows: [{ name: 'turnover', value: formatUsd(m.value) }, { name: `share of ${g.label}`, value: pct(m.value, g.value) }, { name: 'share of all turnover', value: pct(m.value, total) }] },
      })),
    })),
  };
}

/**
 * Studio -> game -> base play / feature buys (conclusions.mjs turnoverFlow)
 * as Sankey nodes and links. Node ids are namespaced so that a game called
 * "Base play" cannot be mistaken for the base-play node; `name` is only what
 * is printed. A link of nothing is left out - a flow of zero is not a flow.
 */
export function sankeyData(flow, colourOf = () => ACCENTS.neutral) {
  const total = flow?.total;
  if (!total) return { nodes: [], links: [] };
  const games = flow.games;
  const nodes = [
    { id: 'studio', name: 'Studio', colour: ACCENTS.neutral, tip: { head: 'Studio', rows: [{ name: 'turnover', value: formatUsd(total) }] } },
    ...games.map((g) => ({ id: `game:${g.key}`, name: g.label, colour: colourOf(g.key),
      tip: { head: g.label, rows: [{ name: 'turnover', value: formatUsd(g.total) }, { name: 'share of studio', value: pct(g.total, total) }] } })),
  ];
  const sides = [
    { id: 'base', name: 'Base play', colour: ACCENTS.mint, value: flow.base, key: 'base' },
    { id: 'buys', name: 'Feature buys', colour: ACCENTS.violet, value: flow.buys, key: 'buys' },
  ].filter((s) => s.value > 0);
  for (const s of sides) nodes.push({ id: s.id, name: s.name, colour: s.colour, tip: { head: s.name, rows: [{ name: 'turnover', value: formatUsd(s.value) }, { name: 'share of studio', value: pct(s.value, total) }] } });
  const links = [];
  for (const g of games) {
    links.push({ source: 'studio', target: `game:${g.key}`, value: g.total, colour: colourOf(g.key),
      tip: { head: `Studio → ${g.label}`, rows: [{ name: 'turnover', value: formatUsd(g.total) }, { name: 'share of studio', value: pct(g.total, total) }] } });
    for (const s of sides) {
      const value = g[s.key];
      if (!(value > 0)) continue;
      links.push({ source: `game:${g.key}`, target: s.id, value, colour: colourOf(g.key),
        tip: { head: `${g.label} → ${s.name}`, rows: [{ name: 'turnover', value: formatUsd(value) }, { name: `share of ${g.label}`, value: pct(value, g.total) }] } });
    }
  }
  return { nodes, links };
}

/**
 * Daily turnover and studio P/L (series.mjs dailyTrend) for the zoomable
 * trend: one value per day in each series, null where the sync missed a day,
 * and a readout per day.
 */
export function dailyData(trend) {
  const rows = trend?.rows ?? [];
  return {
    dates: rows.map((r) => r.date.slice(5)),
    turnover: rows.map((r) => r.turnover),
    profit: rows.map((r) => r.profit),
    tips: rows.map((r) => ({
      head: `${dayName(r.date)}${r.current ? ' (still filling)' : ''}`,
      rows: [{ name: 'turnover', value: formatUsd(r.turnover), colour: ACCENTS.turnover }, { name: 'studio P/L', value: formatUsdSigned(r.profit) }],
      note: r.turnover === null && r.profit === null ? 'Not synced: left empty, not zero.' : null,
    })),
  };
}

/**
 * One live strip (series.mjs liveStream): `[ts, value]` pairs, null where a
 * poll was missed, with the window and poll interval the strip scrolls by.
 */
export function liveData(points, { label, colour, slotMs, hours }) {
  return {
    label, colour, slotMs, windowMs: hours * HOUR_MS,
    points: (points ?? []).map((p) => [p.ts, p.value]),
  };
}

/** The newest reading of a strip, for the figure printed beside it. */
export function latestReading(points) {
  const got = (points ?? []).filter((p) => p.value !== null);
  return got.length ? ints(got.at(-1).value) : null;
}
