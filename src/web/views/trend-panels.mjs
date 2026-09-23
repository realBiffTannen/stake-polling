/**
 * Trends over time - for the studio on /trends, and for one game on its page.
 *
 * Three sources, each at its own resolution:
 *   - players online, every 2.5-minute poll slot, from the collector's trail
 *     (the studio's `ts:online`, a game's own `ts:<slug>`), 24 hours by default;
 *   - daily bets, turnover, P/L, players, average bet and RTP over the last
 *     30 UTC days, from the daily-insights snapshot;
 *   - the hour-of-day profile, averaged over the last 7 days of trail.
 *
 * Every chart carries its conclusion (src/insights/series.mjs and
 * conclusions.mjs); a view writes none of its own. Two measures never share
 * an axis - a daily figure and its 7-day average are the same measure.
 */

import { html } from '../html.mjs';
import { int, usd, DASH } from '../format.mjs';
import { formatUsd, formatUsdSigned } from '../../money.mjs';
import { chartPanel, conclusion } from './parts.mjs';
import { buildInsights } from '../../insights/model.mjs';
import { onlineSlots, thinMax, onlineHeadline, movingAverage, cumulative, weekOnWeek, hourOfDay, turnoverByGame, hourByDay, dailyTrend } from '../../insights/series.mjs';
import { dailyPnl } from '../../insights/conclusions.mjs';
import { holdTable } from '../../insights/economics.mjs';
import { lineChart } from '../charts/line.mjs';
import { columns } from '../charts/columns.mjs';
import { stackedBars } from '../charts/bars.mjs';
import { timeLine } from '../charts/time.mjs';
import { PAIR_COLOURS } from '../charts/hbars.mjs';
import { GAME_COLOURS, OTHER_COLOUR } from '../charts/donut.mjs';
import { interactiveChart, emptyChart, heatmapData, dailyData } from '../charts/interactive.mjs';

/** The players-online ranges, in hours. 24 hours is the default. */
export const ONLINE_RANGES = { '6h': 6, '24h': 24, '3d': 72, '7d': 168 };
const rangeOf = (param) => (Object.hasOwn(ONLINE_RANGES, param ?? '') ? param : '24h');

const compactUsd = (v) => {
  const a = Math.abs(Number(v));
  return a >= 1000 ? `$${(Number(v) / 1000).toFixed(a >= 10000 ? 0 : 1)}k` : `$${Math.round(Number(v))}`;
};
const pct2 = (v) => `${Number(v).toFixed(2)}%`;

/** A /trends link carrying the players-online range and the picked game, each only when set. */
function trendsHref({ online = null, turnover = null }, hash = '') {
  const query = new URLSearchParams();
  if (online) query.set('online', online);
  if (turnover) query.set('turnover', turnover);
  return `/trends${String(query) ? `?${query}` : ''}${hash}`;
}

// A legend swatch is an SVG fill, not a style attribute: the page's CSP
// (style-src 'self') drops inline styles, which would leave every swatch blank.
const swatch = (fills) => html`<svg class="swatch" viewBox="0 0 10 10" width="10" height="10" aria-hidden="true">${fills.map((fill, i) =>
  html`<rect x="${(10 / fills.length) * i}" width="${10 / fills.length}" height="10" fill="${fill}"/>`)}</svg>`;

/**
 * Turnover by game, with a legend that is also the picker: every game with
 * turnover in the window, biggest first, each a link that charts it alone.
 * Games past the seventh share Other's grey, because that is the layer they
 * are drawn in on the stacked view.
 */
function turnoverPanel(byGame, { online }) {
  const colourAt = (i) => GAME_COLOURS[i] ?? OTHER_COLOUR;
  const at = new Map(byGame.games.map((g, i) => [g.slug, i]));
  const colours = byGame.focus ? [colourAt(at.get(byGame.focus))] : byGame.keys.map((k, i) => (k === 'Other' ? OTHER_COLOUR : colourAt(i)));
  const total = byGame.games.reduce((a, g) => a + g.total, 0);
  const chip = (slug, label, value, fills) => {
    const href = trendsHref({ online, turnover: slug }, '#turnover-by-game');
    const body = html`${swatch(fills)}${label}<span>${compactUsd(value)}</span>`;
    return (byGame.focus ?? null) === slug
      ? html`<a href="${href}" class="selected" aria-current="true">${body}</a>`
      : html`<a href="${href}">${body}</a>`;
  };
  const picked = byGame.games.find((g) => g.slug === byGame.focus);
  const note = picked
    ? `${picked.name} alone, on its own scale. Pick All games for the stacked view.`
    : 'The seven games with the most turnover over the window each get a layer; the rest are Other. Pick any game to chart it on its own.';
  return html`<section class="panel chart-panel" id="turnover-by-game"><div class="section-heading"><div><h2>Turnover by game</h2>
      ${conclusion(byGame.headline)}</div></div>
    ${byGame.dates.length ? html`<div class="game-legend" role="group" aria-label="Pick a game to chart on its own">
        ${chip(null, 'All games', total, GAME_COLOURS.slice(0, 3))}
        ${byGame.games.map((g, i) => chip(g.slug, g.name, g.total, [colourAt(i)]))}</div>
      ${stackedBars({ rows: byGame.rows, keys: byGame.keys, labels: byGame.dates.map((d) => d.slice(5)), colours, legend: false,
        format: compactUsd, title: picked ? `Daily turnover, ${picked.name}` : 'Daily turnover by game' })}`
      : html`<p class="dim">${DASH}</p>`}
    <div class="chart-foot"><span>${note}</span></div></section>`;
}

function rangePicker(href, current) {
  return html`<span class="quick-ranges span-picker">${Object.keys(ONLINE_RANGES).map((key) =>
    html`<a href="${href(key)}" class="${key === current ? 'selected' : ''}">${key}</a>`)}</span>`;
}

/** Players online per poll slot; ranges past a day fold to 15-minute peaks. */
function onlinePanel({ title, samples, now, range, href }) {
  const hours = ONLINE_RANGES[range];
  let points = onlineSlots(samples ?? [], { now, hours });
  if (hours > 24) points = thinMax(points, 15 * 60_000);
  return html`<section class="panel chart-panel"><div class="section-heading"><div><h2>${title}</h2>
      <p class="conclusion">${onlineHeadline(points, { now }) ?? 'Nothing measured in this range yet.'}</p></div>
      ${rangePicker(href, range)}</div>
    ${timeLine({ points, title: 'players online', format: (v) => int(v) })}
    <div class="chart-foot"><span>${hours > 24 ? 'Each point is the peak of 15 minutes of 2.5-minute polls.' : 'One point per 2.5-minute poll. A missed poll breaks the line.'}</span><span>Hover for the reading</span></div></section>`;
}

/** The last 30 UTC days from the daily-insights snapshot, for the studio or one game. */
function thirtyDays(state, slug) {
  const query = new URLSearchParams({ days: '30' });
  if (slug) query.set('game', slug);
  return buildInsights({ snapshot: state.dailySnapshot ?? {}, now: Number(state.now) || Date.now(), query, money: state.money, listings: [] });
}

/** Expected RTP (%) from each mode's deployed RTP, weighted by turnover. */
function expectedRtp(modeRows) {
  const [row] = holdTable({ all: modeRows ?? [] }, {});
  return row && row.theoretical !== null && row.theoretical !== undefined ? (1 - row.theoretical) * 100 : null;
}

function dailyPanels(model, { modeRows, scope }) {
  const daily = model.daily ?? [];
  const labels = daily.map((d) => d.date.slice(5)), tips = daily.map((d) => d.date);
  const pick = (key) => daily.map((d) => (d.measured ? d[key] ?? null : null));
  const withAverage = (key, name, format, title) => lineChart({ labels, tipLabels: tips, format, title,
    series: [{ name, colour: PAIR_COLOURS[0], values: pick(key) }, { name: '7-day average', colour: PAIR_COLOURS[1], values: movingAverage(pick(key), 7, 3) }] });
  const expected = expectedRtp(modeRows);
  const rtpSeries = [{ name: 'observed RTP', colour: PAIR_COLOURS[0], values: pick('rtp') }];
  if (expected !== null) rtpSeries.push({ name: 'expected (deployed)', colour: PAIR_COLOURS[1], values: daily.map(() => expected) });
  const foot = 'The last 30 UTC days from the daily sync. Today is still filling and is left out of the week-on-week comparison.';

  return html`
  ${chartPanel('Bets per day', weekOnWeek(daily, 'count', { noun: 'Bets', fmt: (v) => int(v) }),
    withAverage('count', 'bets', (v) => int(v), `Bets per day, ${scope}`), foot)}
  ${chartPanel('Turnover per day', weekOnWeek(daily, 'turnover', { noun: 'Turnover', fmt: (v) => formatUsd(v) }),
    withAverage('turnover', 'turnover', compactUsd, `Turnover per day, ${scope}`))}
  ${chartPanel('Studio P/L per day', weekOnWeek(daily, 'profit', { noun: 'Studio P/L', fmt: (v) => formatUsdSigned(v) }),
    columns({ rows: daily.map((d) => ({ label: d.date.slice(8), tipLabel: d.date, value: d.measured ? d.profit : null })), tone: 'sign', format: formatUsdSigned, title: `Studio P/L per day, ${scope}` }))}
  ${chartPanel('Running studio P/L', dailyPnl(daily).headline,
    lineChart({ labels, tipLabels: tips, format: formatUsdSigned, title: `Running studio P/L over 30 days, ${scope}`,
      series: [{ name: 'running studio P/L', colour: PAIR_COLOURS[0], values: cumulative(pick('profit')) }] }),
    'Summed day by day from the start of the window; a day the sync missed breaks the line.')}
  ${chartPanel('Players per day', weekOnWeek(daily, 'players', { noun: 'Players', fmt: (v) => int(v) }),
    withAverage('players', 'players', (v) => int(v), `Players per day, ${scope}`),
    scope === 'all games' ? 'Summed across games, so one person playing two games counts twice.' : null)}
  ${chartPanel('Average bet per day', weekOnWeek(daily, 'avgBet', { noun: 'The average bet', fmt: (v) => usd(v) }),
    withAverage('avgBet', 'average bet', (v) => usd(v), `Average bet per day, ${scope}`))}
  ${chartPanel('Observed RTP per day', weekOnWeek(daily, 'rtp', { noun: 'Observed RTP', fmt: pct2 }),
    lineChart({ labels, tipLabels: tips, format: pct2, title: `Observed RTP per day, ${scope}`, series: rtpSeries }),
    'One day of play is far too few rounds for RTP to settle: expect wide daily swings around the expected line.')}`;
}

function hourPanel(trail, now) {
  const { rows, headline } = hourOfDay(trail ?? [], 'count', { now, days: 7 });
  return chartPanel('Hour of the day', headline,
    columns({ rows: rows.map((r) => ({ label: String(r.hour).padStart(2, '0'), tipLabel: `${String(r.hour).padStart(2, '0')}:00Z`, value: r.value })),
      tone: 'neutral', format: (v) => int(v), title: 'Average bets in each UTC hour of the day' }),
    'Averaged over the last 7 days of the collector\'s trail. When play happens, not how much of it.');
}

/** Bets in every hour of the last 7 UTC days: the hour-of-day profile, one day at a time. */
function hourByDayPanel(trail, now) {
  const grid = hourByDay(trail ?? [], 'count', { now, days: 7, noun: 'bets' });
  const data = heatmapData(grid, { noun: 'bets' });
  return chartPanel('Hour by day', grid.headline,
    data.cells.length ? interactiveChart({ id: 'hour-by-day', kind: 'heatmap', title: 'Bets in each UTC hour of the last 7 days', data })
      : emptyChart('The collector\'s trail has no bets in the last 7 days yet.'),
    'Bets per UTC hour from the collector\'s trail. A dashed outline is an hour it missed - empty, not zero; today stops at the hour now.');
}

/** Daily turnover and studio P/L over the 30 days the daily panels chart, zoomable. */
function dailyZoomPanel(model) {
  const trend = dailyTrend(model.daily ?? []);
  return chartPanel('Turnover and studio P/L, day by day', trend.headline,
    trend.headline ? interactiveChart({ id: 'daily-zoom', kind: 'daily', title: 'Daily turnover and studio P/L over the last 30 UTC days', data: dailyData(trend) })
      : emptyChart('The daily sync has not stored any days yet.'),
    'Drag either end of the slider to zoom into any stretch of the last 30 UTC days. Turnover and P/L each keep their own scale; a day the sync missed is a gap, not a zero.');
}

/**
 * The studio's trends, for /trends. `online` is the players-online range
 * parameter and `turnover` the game picked in the turnover legend; each
 * picker's links carry the other's choice so neither resets the other.
 */
export function studioTrendPanels({ state, online = null, turnover = null }) {
  const now = Number(state.now) || Date.now();
  const range = rangeOf(online);
  const model = thirtyDays(state, null);
  const byGame = turnoverByGame(state.dailySnapshot ?? {}, { from: model.from, to: model.to, money: state.money, focus: turnover });
  const allModes = Object.values(state.modeRows ?? {}).flat();
  return html`
  ${onlinePanel({ title: 'Players online, every 2.5 minutes', samples: state.history?.online, now, range, href: (key) => trendsHref({ online: key, turnover: byGame.focus }) })}
  ${dailyPanels(model, { modeRows: allModes, scope: 'all games' })}
  ${dailyZoomPanel(model)}
  ${turnoverPanel(byGame, { online: online === range ? range : null })}
  ${hourPanel(state.history?.team, now)}
  ${hourByDayPanel(state.history?.team, now)}`;
}

/** One game's trends, for its page. Keeps the page's span in the picker links. */
export function gameTrendPanels({ slug, name, state, modeRows = [], span = 'month', online = null }) {
  const now = Number(state.now) || Date.now();
  const range = rangeOf(online);
  const base = `/game/${encodeURIComponent(slug)}`;
  const href = (key) => `${base}?${new URLSearchParams({ span, online: key })}`;
  return html`
  ${onlinePanel({ title: `Players online in ${name}, every 2.5 minutes`, samples: state.history?.game, now, range, href })}
  ${dailyPanels(thirtyDays(state, slug), { modeRows, scope: name })}
  ${hourPanel(state.history?.game, now)}`;
}
