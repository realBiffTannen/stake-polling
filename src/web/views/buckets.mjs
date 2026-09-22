/**
 * Cadence drill-down - one game's play, deltaed against the wall clock at a
 * chosen granularity, its bet modes broken out beside the total.
 *
 * Reuses `profitTable`/`bucketSeries` (src/buckets.mjs) unchanged - the same
 * engine the TUI's own buckets view runs on. The web adds two granularities
 * the TUI does not offer (15m/30m) and tracks three fields (bets, turnover,
 * profit) rather than profit alone, but the delta arithmetic itself is not
 * duplicated here.
 */

import { html } from '../html.mjs';
import { int, usd, money, utcHm } from '../format.mjs';
import { toUsd, toShareUsd } from '../../money.mjs';
import { shell } from './shell.mjs';
import { profitTable, BUCKET_SIZES } from '../../buckets.mjs';
import { lineChart } from '../charts/line.mjs';
import { MODE_COLOURS } from '../svg.mjs';

export const CADENCES = ['5m', '15m', '30m', '1h'];
const ROWS = 24;

/**
 * @param {{ slug: string, model: object, state: object, cadence: string, gameTrail?: object[], modeTrail?: object[] }} args
 */
export function renderBucketsPage({ slug, model, state, cadence, gameTrail = [], modeTrail = [] }) {
  const moneyCfg = state.money;
  const selected = CADENCES.includes(cadence) ? cadence : '1h';
  const size = BUCKET_SIZES[selected];
  const name = model.options.find(g => g.slug === slug)?.name ?? slug;
  const to = state.now ?? Date.now();
  const from = to - (ROWS - 1) * size;

  const span = { sizeMs: size, from, to };
  const counts = profitTable({ trail: gameTrail, modeTrail: [], ...span, field: 'count' });
  const turnovers = profitTable({ trail: gameTrail, modeTrail: [], ...span, field: 'turnover' });
  const profits = profitTable({ trail: gameTrail, modeTrail, ...span, field: 'profit' });

  const rows = dropEdges(profits.rows.map((p, i) => ({
    from: p.from, count: counts.rows[i]?.total ?? null, turnover: turnovers.rows[i]?.total ?? null,
    profit: p.total, byMode: p.byMode,
  })));

  const sum = (key) => rows.reduce((a, r) => r[key] === null ? a : (a ?? 0) + r[key], null);
  const totalCount = sum('count'), totalTurnover = sum('turnover'), totalProfit = sum('profit');

  // Oldest first, for the charts - every other chart on this site reads
  // left-to-right chronological, and this table's own newest-first order (the
  // TUI convention this reuses) would draw time running backwards.
  const chronological = [...rows].reverse();

  const body = html`<div class="page-heading"><div><div class="eyebrow">CADENCE</div><h1>${name}, by ${selected}<span>.</span></h1>
      <p>Wall-clock buckets, aligned to the epoch - a delta is attributed to the bucket its sample landed in.</p></div>
    <a class="button secondary" href="/game/${encodeURIComponent(slug)}">${name} ↗</a></div>

  <nav class="tabs">${CADENCES.map(c => html`<a class="tab${c === selected ? ' active' : ''}" href="?cadence=${c}">${c}</a>`)}</nav>

  <div class="metric-grid">
    <article class="metric-card accent"><div class="metric-label">Bets</div><div class="metric-value">${int(totalCount)}</div><div class="metric-note">visible span</div></article>
    <article class="metric-card"><div class="metric-label">Turnover</div><div class="metric-value">${usd(toUsd(totalTurnover, moneyCfg))}</div><div class="metric-note">visible span</div></article>
    <article class="metric-card"><div class="metric-label">Studio profit</div><div class="metric-value">${money(toShareUsd(totalProfit, moneyCfg.profitShare, moneyCfg), { signed: true })}</div><div class="metric-note">visible span</div></article>
  </div>

  <section class="panel chart-panel"><div class="section-heading"><div><h2>Bets and profit by ${selected}</h2>
      <p>Left axis: bets. Right axis: studio profit.</p></div></div>
    ${lineChart({ labels: chronological.map(r => utcHm(r.from)), tipLabels: chronological.map(r => new Date(r.from).toISOString()),
      series: [
        { name: 'bets', colour: MODE_COLOURS[0], values: chronological.map(r => r.count) },
        { name: 'studio profit (USD)', colour: MODE_COLOURS[2], axis: 'right', values: chronological.map(r => toShareUsd(r.profit, moneyCfg.profitShare, moneyCfg)) },
      ], title: `Bets and studio profit by ${selected} for ${name}` })}</section>

  <section class="panel"><div class="section-heading"><h2>Totals by ${selected}</h2></div>
    <div class="scroll"><table><thead><tr><th>Bucket</th><th>Bets</th><th>Turnover</th><th>Studio profit</th></tr></thead>
      <tbody>${rows.map(r => html`<tr><td>${utcHm(r.from)}Z</td><td>${int(r.count)}</td>
        <td>${usd(toUsd(r.turnover, moneyCfg))}</td><td>${money(toShareUsd(r.profit, moneyCfg.profitShare, moneyCfg), { signed: true })}</td></tr>`)}</tbody></table></div></section>

  <section class="panel chart-panel"><div class="section-heading"><div><h2>Studio profit by bet mode, by ${selected}</h2>
      <p>The detail behind the total - each bonus round beside BASE.</p></div></div>
    ${profits.modes.length ? lineChart({ labels: chronological.map(r => utcHm(r.from)), tipLabels: chronological.map(r => new Date(r.from).toISOString()),
      series: profits.modes.map((mode, i) => ({ name: mode, colour: MODE_COLOURS[i % MODE_COLOURS.length],
        values: chronological.map(r => toShareUsd(r.byMode[mode], moneyCfg.profitShare, moneyCfg)) })),
      title: `Studio profit by bet mode, by ${selected}, for ${name}` }) : null}</section>

  <section class="panel"><div class="section-heading"><div><h2>By bet mode</h2><p>Studio profit delta per bucket, one column per mode.</p></div></div>
    ${profits.modes.length ? html`<div class="scroll"><table><thead><tr><th>Bucket</th><th>Total</th>${profits.modes.map(m => html`<th>${m}</th>`)}</tr></thead>
      <tbody>${rows.map(r => html`<tr><td>${utcHm(r.from)}Z</td><td>${money(toShareUsd(r.profit, moneyCfg.profitShare, moneyCfg), { signed: true })}</td>
        ${profits.modes.map(m => html`<td>${money(toShareUsd(r.byMode[m], moneyCfg.profitShare, moneyCfg), { signed: true })}</td>`)}</tr>`)}</tbody></table></div>`
      : html`<p class="dim">No per-mode trail yet - bonus-round columns fill in as the poller runs.</p>`}</section>`;

  return shell({ state, body, active: 'overview', title: `${name} · ${selected}` });
}

/** Trim buckets neither the totals nor the mode breakdown reached, from each end - never from the middle. */
function dropEdges(rows) {
  const empty = (r) => r.count === null && r.turnover === null && r.profit === null;
  let start = 0, end = rows.length;
  while (start < end && empty(rows[start])) start++;
  while (end > start && empty(rows[end - 1])) end--;
  return rows.slice(start, end);
}
