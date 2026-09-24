/**
 * The landing page's panels: today since 00:00:00Z, drawn rather than told.
 *
 * Every figure comes from insights/today.mjs; this file only chooses how each
 * one is drawn. Text is kept to a title and one key figure per panel - the
 * analysis page is where each chart states its conclusion in words.
 *
 * Colour follows the game, never its rank: a game keeps its donut slot's
 * colour on the stacked hours and the donut alike (conclusions.mjs donutSets
 * assigns the slots once). Sign is carried by position and an arrow or a
 * +/- before colour.
 */

import { html } from '../html.mjs';
import { int, blank, DASH, utcHm } from '../format.mjs';
import { formatUsd, formatUsdSigned, DEFAULT_MONEY } from '../../money.mjs';
import { sparkline } from '../svg.mjs';
import { panelId } from './parts.mjs';
import { swatch } from './trend-panels.mjs';
import { dayCurve } from '../charts/day.mjs';
import { heatGrid } from '../charts/grid.mjs';
import { columns } from '../charts/columns.mjs';
import { stackedBars } from '../charts/bars.mjs';
import { hbars } from '../charts/hbars.mjs';
import { donut, GAME_COLOURS, OTHER_COLOUR } from '../charts/donut.mjs';
import { ACCENTS } from '../charts/interactive.mjs';
import { donutSets } from '../../insights/conclusions.mjs';
import { todayModel } from '../../insights/today.mjs';

const hh = (h) => String(h).padStart(2, '0');
const hourSpan = (h) => `${hh(h)}:00-${h === 23 ? '24' : hh(h + 1)}:00Z`;

/** Short dollars for axes: $0, $950, $1.2k, $15k, -$3.4k. */
export function compactUsd(v, { signed = false } = {}) {
  const n = Number(v), a = Math.abs(n);
  const sign = n < 0 ? '-' : signed && n > 0 ? '+' : '';
  const body = a >= 1e6 ? `${(a / 1e6).toFixed(1)}M` : a >= 1e3 ? `${(a / 1e3).toFixed(a >= 1e4 ? 0 : 1)}k` : `${Math.round(a)}`;
  return `${sign}$${body}`;
}

/** A full-width chart, which scrolls inside its panel on a phone rather than shrinking its text away. */
const wide = (chart) => html`<div class="scroll wide-chart">${chart}</div>`;

function panel(title, stat, chart, { cls = '' } = {}) {
  return html`<section class="panel chart-panel today-panel ${cls}" id="${panelId(title)}"><div class="chart-head"><h2>${title}</h2>${stat ? html`<span class="chart-stat">${stat}</span>` : null}</div>${chart}</section>`;
}

// ------------------------------------------------------------ the tiles
const arrow = (d) => (d > 0 ? '▲' : '▼');

/**
 * Today against the same hours of yesterday. `kind` picks how the change is
 * put: dollars for P/L (a percentage of a figure that can cross zero means
 * nothing), percent for volumes, points for RTP. RTP's moves are drawn flat:
 * a lower RTP is the house's luck, not the studio's doing.
 */
function delta(value, yesterday, kind) {
  if (blank(value) || blank(yesterday)) return html`<div class="kpi-delta none">no yesterday to compare</div>`;
  const v = Number(value), y = Number(yesterday), diff = v - y;
  const words = html` <span>vs yesterday</span>`;
  if (kind === 'usd') {
    if (Math.abs(diff) < 0.005) return html`<div class="kpi-delta flat">= level${words}</div>`;
    return html`<div class="kpi-delta ${diff > 0 ? 'up' : 'down'}">${arrow(diff)} ${formatUsdSigned(diff)}${words}</div>`;
  }
  if (kind === 'pp') {
    if (Math.abs(diff) < 0.005) return html`<div class="kpi-delta flat">= level${words}</div>`;
    return html`<div class="kpi-delta flat">${arrow(diff)} ${Math.abs(diff).toFixed(2)}pp${words}</div>`;
  }
  if (y === 0) return v === 0 ? html`<div class="kpi-delta flat">= level${words}</div>` : html`<div class="kpi-delta up">▲ from none${words}</div>`;
  const change = Math.round((diff / Math.abs(y)) * 100);
  if (change === 0) return html`<div class="kpi-delta flat">= level${words}</div>`;
  return html`<div class="kpi-delta ${change > 0 ? 'up' : 'down'}">${arrow(change)} ${Math.abs(change)}%${words}</div>`;
}

function kpi({ label, value, tone = '', change, visual = null }) {
  return html`<article class="kpi"><div class="kpi-label">${label}</div><div class="kpi-value${tone ? ` ${tone}` : ''}">${value}</div>
    ${change}<div class="kpi-visual">${visual}</div></article>`;
}

/**
 * RTP as a bullet: a track from 50% to 150%, a tick at 100% (break-even for
 * the house), and a bar from 100% to today's figure - green where the house
 * kept money, red where players took more than they staked.
 */
function rtpBullet(rtp) {
  if (blank(rtp)) return null;
  const w = 160, lo = 50, hi = 150, x = (v) => ((Math.min(hi, Math.max(lo, v)) - lo) / (hi - lo)) * w;
  const at = x(Number(rtp)), mid = x(100);
  return html`<svg class="rtp-bullet" viewBox="0 0 ${w} 30" role="img" aria-label="RTP against the 100% break-even"><title>RTP against the 100% break-even</title>
    <rect class="track" x="0" y="8" width="${w}" height="6" rx="3"/>
    <rect class="${rtp > 100 ? 'bar-neg' : 'bar-pos'}" x="${Math.min(at, mid).toFixed(1)}" y="8" width="${Math.max(1.5, Math.abs(at - mid)).toFixed(1)}" height="6" rx="2"/>
    <line class="tick" x1="${mid}" x2="${mid}" y1="3" y2="19"/>
    <text class="axis-label" x="${mid}" y="29" text-anchor="middle">100%</text></svg>`;
}

/** At most `n` values, evenly picked: a sparkline of 600 points costs more than it shows. */
const thin = (values, n = 96) => {
  const step = Math.max(1, Math.ceil(values.length / n));
  return values.filter((_, i) => i % step === 0 || i === values.length - 1);
};

function tiles(m) {
  const { kpis } = m;
  const spark = (values, cls = '') => (values.some((v) => !blank(v)) ? html`<div class="kpi-spark ${cls}">${sparkline(values, { width: 160, height: 34 })}</div>` : null);
  const closed = m.hours.filter((h) => h.state !== 'future');
  const pl = kpis.profit.value;
  return html`<div class="kpi-grid">
    ${kpi({ label: 'Studio P/L today', value: blank(pl) ? DASH : formatUsdSigned(pl), tone: blank(pl) ? '' : pl < 0 ? 'bad' : 'good',
      change: delta(pl, kpis.profit.yesterday, 'usd'), visual: spark(thin(m.curve.today.map((p) => p.value)), blank(pl) ? '' : pl < 0 ? 'bad' : 'good') })}
    ${kpi({ label: 'Turnover today', value: blank(kpis.turnover.value) ? DASH : formatUsd(kpis.turnover.value),
      change: delta(kpis.turnover.value, kpis.turnover.yesterday, 'pct'), visual: spark(closed.map((h) => h.turnoverUsd), 'blue') })}
    ${kpi({ label: 'Bets today', value: int(kpis.bets.value),
      change: delta(kpis.bets.value, kpis.bets.yesterday, 'pct'), visual: spark(closed.map((h) => h.bets), 'blue') })}
    ${kpi({ label: 'Players online', value: int(kpis.online.value),
      change: delta(kpis.online.value, kpis.online.yesterday, 'pct'), visual: spark(thin(m.online.today.map((p) => p.value))) })}
    ${kpi({ label: 'RTP today', value: blank(kpis.rtp.value) ? DASH : `${Number(kpis.rtp.value).toFixed(2)}%`,
      change: delta(kpis.rtp.value, kpis.rtp.yesterday, 'pp'), visual: rtpBullet(kpis.rtp.value) })}
  </div>`;
}

// ------------------------------------------------------------ the panels
function heroPanel(m) {
  const last = [...m.curve.today].reverse().find((p) => !blank(p.value));
  const stat = last ? html`<b class="${last.value < 0 ? 'bad' : 'good'}">${formatUsdSigned(last.value)}</b> at ${utcHm(last.ts)}` : null;
  return panel('Running studio P/L', stat, wide(dayCurve({ id: 'today-pnl', from: m.from, now: m.now, polarity: true, height: 320,
    title: 'Running studio P/L since 00:00Z, today against yesterday', format: formatUsdSigned,
    series: [{ name: 'Today', colour: ACCENTS.turnover, area: true, points: m.curve.today },
      ...(m.curve.yesterday.length ? [{ name: 'Yesterday', ghost: true, points: m.curve.yesterday }] : [])] })), { cls: 'today-hero' });
}

/** The first hour slot that has not begun, or null once the day is over. */
const futureFrom = (hours) => {
  const i = hours.findIndex((h) => h.state === 'future');
  return i === -1 ? null : i;
};

function hourPanels(m, slotOf) {
  const keys = [...new Set(m.games.filter((g) => slotOf.has(g.slug)).map((g) => g.slug))].sort((a, b) => slotOf.get(a) - slotOf.get(b));
  const other = m.games.some((g) => !slotOf.has(g.slug) && Number(g.turnoverUsd) > 0);
  const stackKeys = [...keys, ...(other ? ['other'] : [])];
  const colours = stackKeys.map((k) => (k === 'other' ? OTHER_COLOUR : GAME_COLOURS[slotOf.get(k)]));
  const label = new Map(m.games.map((g) => [g.slug, g.label]));
  const rows = m.hours.map((h) => {
    const row = {};
    for (const [slug, v] of Object.entries(h.byGame)) {
      if (blank(v.turnoverUsd)) continue;
      const key = slotOf.has(slug) ? slug : 'other';
      row[key] = (row[key] ?? 0) + Number(v.turnoverUsd);
    }
    return row;
  });
  const tips = m.hours.map((h, i) => (h.state === 'future' ? null : {
    label: `${hourSpan(h.hour)}${h.state === 'filling' ? ' · still filling' : ''}`,
    rows: [{ name: 'turnover', value: blank(h.turnoverUsd) ? '-' : formatUsd(h.turnoverUsd) },
      ...stackKeys.filter((k) => Number(rows[i][k]) > 0).sort((a, b) => rows[i][b] - rows[i][a])
        .map((k) => ({ name: k === 'other' ? 'Other' : String(label.get(k)), value: formatUsd(rows[i][k]), colour: colours[stackKeys.indexOf(k)] }))],
  }));
  const done = m.hours.filter((h) => h.state !== 'future' && !blank(h.turnoverUsd));
  const peak = done.length ? done.reduce((a, b) => (b.turnoverUsd > a.turnoverUsd ? b : a)) : null;
  const legend = html`<div class="today-legend">${stackKeys.map((k, i) => html`<span>${swatch([colours[i]])}${k === 'other' ? 'Other' : label.get(k)}</span>`)}</div>`;
  const turnover = panel('Turnover by hour', peak ? html`peak <b>${compactUsd(peak.turnoverUsd)}</b> at ${hh(peak.hour)}:00Z` : null,
    html`${stackKeys.length ? legend : null}${stackedBars({ rows, keys: stackKeys, labels: m.hours.map((h) => hh(h.hour)), colours, legend: false,
      tips, futureFrom: futureFrom(m.hours), format: (v) => compactUsd(v), title: 'Turnover per hour today, by game', width: 560, height: 250 })}`);

  const measuredHours = m.hours.filter((h) => h.state !== 'future' && !blank(h.profitUsd));
  const up = measuredHours.filter((h) => h.profitUsd >= 0).length;
  const pnl = panel('Studio P/L by hour', measuredHours.length ? html`<b>${up}</b> of ${measuredHours.length} hours up` : null,
    columns({ rows: m.hours.map((h) => ({ label: hh(h.hour), tipLabel: `${hourSpan(h.hour)}${h.state === 'filling' ? ' · still filling' : ''}`, value: h.profitUsd })),
      tone: 'sign', format: (v) => compactUsd(v, { signed: true }), title: 'Studio P/L per hour today', futureFrom: futureFrom(m.hours), width: 560, height: 280 }));
  return html`<div class="today-pair">${turnover}${pnl}</div>`;
}

function gridPanel(m) {
  const playing = m.games.filter((g) => Number(g.turnoverUsd) > 0);
  let max = 0;
  const rows = playing.map((g) => ({
    label: g.label, href: `/game/${encodeURIComponent(g.slug)}`,
    cells: m.hours.map((h) => {
      // Not a miss, but not yet: an hour over before the game's first reading
      // (it was not being watched - see today.mjs gamesOf), or the hour now
      // filling before its first step has landed.
      const v = h.byGame[g.slug];
      if (h.state === 'future' || (g.watchedFrom !== null && h.from + 3_600_000 <= g.watchedFrom)
        || (h.state === 'filling' && blank(v?.turnoverUsd))) return { state: 'future' };
      if (!v || blank(v.turnoverUsd)) return { state: 'missed', value: null };
      max = Math.max(max, Number(v.turnoverUsd));
      return { state: 'measured', value: Number(v.turnoverUsd), note: h.state === 'filling' ? 'This hour is still filling.' : null,
        rows: [{ name: 'turnover', value: formatUsd(v.turnoverUsd) }, { name: 'bets', value: int(v.bets) }, { name: 'studio P/L', value: formatUsdSigned(v.profitUsd) }] };
    }),
  }));
  const stat = playing.length ? html`<b>${playing.length}</b> of ${m.games.length} games played` : null;
  return panel('Turnover by game and hour', stat, wide(heatGrid({ id: 'today-grid', columns: m.hours.map((h) => hh(h.hour)), rows, max,
    format: (v) => compactUsd(v), title: 'Turnover by game and hour today' })));
}

function gamePanels(m, sets, slotOf) {
  const shown = m.games.filter((g) => !blank(g.profitUsd) && (Number(g.turnoverUsd) > 0 || Number(g.profitUsd) !== 0))
    .sort((a, b) => b.profitUsd - a.profitUsd);
  const up = shown.filter((g) => g.profitUsd >= 0).length;
  const bars = panel('Studio P/L by game', shown.length ? html`<b>${up}</b> up · <b>${shown.length - up}</b> down` : null,
    hbars({ rows: shown.map((g) => ({ key: g.slug, label: g.label, value: g.profitUsd })), tone: 'sign', format: formatUsdSigned,
      title: 'Studio P/L today', width: 480, labelWidth: 130, valueWidth: 80 }));
  const set = sets.turnover;
  // Slices come in slot order (colour stays with the game); the headline
  // names the largest game - never the Other slice, which is not one.
  const named = set.slices.filter((sl) => sl.slot !== null);
  const top = named.length ? named.reduce((a, b) => (b.value > a.value ? b : a)) : null;
  const ring = panel('Share of turnover', top && set.total ? html`<b>${top.label}</b> ${Math.round((top.value / set.total) * 100)}%` : null,
    donut({ slices: set.slices.map((s) => ({ ...s, colour: s.slot === null ? OTHER_COLOUR : GAME_COLOURS[s.slot] })),
      title: 'Share of turnover today, by game', format: (v) => formatUsd(v), centre: set.total ? compactUsd(set.total) : '' }));
  return html`<div class="today-pair">${bars}${ring}</div>`;
}

function onlinePanel(m) {
  const got = m.online.today.filter((p) => !blank(p.value));
  const peak = got.length ? got.reduce((a, b) => (b.value > a.value ? b : a)) : null;
  return panel('Players online', peak ? html`peak <b>${int(peak.value)}</b> at ${utcHm(peak.ts)}` : null,
    wide(dayCurve({ id: 'today-online', from: m.from, now: m.now, format: (v) => int(v), title: 'Players online at each poll today, against yesterday', height: 230,
      series: [{ name: 'Today', colour: ACCENTS.online, area: true, points: m.online.today },
        ...(m.online.yesterday.length ? [{ name: 'Yesterday', ghost: true, points: m.online.yesterday }] : [])] })));
}

// ------------------------------------------------------------ the page
function elapsedWords(ms) {
  const minutes = Math.max(0, Math.floor(ms / 60_000));
  return `${Math.floor(minutes / 60)}h ${minutes % 60}m of play`;
}

/** The heading, tiles and charts for today, from the dashboard state. */
export function renderToday(state) {
  const now = Number(state.now) || Date.now();
  const m = todayModel({ now, money: state.money ?? DEFAULT_MONEY, rows: state.rows ?? [], online: state.online ?? null,
    teamTrail: state.teamTrail ?? [], onlineTrail: state.onlineSince ?? state.onlineTrail ?? [], gameTrails: state.gameTrails ?? {} });
  const sets = donutSets(m.games.map((g) => ({ name: g.slug, label: g.label, count: g.bets, turnoverUsd: g.turnoverUsd, profitUsd: g.profitUsd })), { span: 'today' });
  const slotOf = new Map(sets.turnover.slices.filter((s) => s.slot !== null).map((s) => [s.key, s.slot]));
  const date = new Date(m.from).toLocaleDateString('en-GB', { weekday: 'long', day: 'numeric', month: 'long', timeZone: 'UTC' });

  return html`<div class="page-heading"><div><div class="eyebrow">SINCE 00:00:00 UTC</div><h1>Today<span>.</span></h1>
      <p>${date} · ${elapsedWords(now - m.from)} · the same day as the Engine dashboard</p></div></div>
  ${m.partial ? html`<div class="notice warning">The collector's trail starts at ${utcHm(m.partial)} today; today's figures cover from then.</div>` : null}
  ${tiles(m)}
  ${heroPanel(m)}
  ${hourPanels(m, slotOf)}
  ${gridPanel(m)}
  ${gamePanels(m, sets, slotOf)}
  ${onlinePanel(m)}`;
}

