/**
 * One bet mode, on its own.
 *
 * The API reports unique players per GAME and never per mode, so this page
 * carries no player counts. That absence is stated on the page rather than
 * left as a gap, because a missing column reads as a broken feature while a
 * sentence reads as a measurement boundary.
 */

import { html } from '../html.mjs';
import { int, pct, usd, money, DASH } from '../format.mjs';
import { toUsd, toShareUsd } from '../../money.mjs';
import { shell } from './shell.mjs';
import { modeVerdicts } from '../../insights/verdicts.mjs';
import { convergence } from '../../math/checks.mjs';
import { lineChart } from '../charts/line.mjs';
import { MODE_COLOURS } from '../svg.mjs';
import { severityClass } from './game.mjs';

/**
 * @param {{ slug: string, mode: string, model: object, state: object, math: object|null, modeRows?: object[], modeDays?: object }} args
 */
export function renderModePage({ slug, mode, model, state, math, modeRows = [], modeDays = {} }) {
  const name = model.options.find(g => g.slug === slug)?.name ?? slug;
  const row = modeRows.find(r => r.mode === mode) ?? null;
  const captured = math?.modes?.[mode] ?? null;
  const totalCount = modeRows.reduce((a, r) => a + (Number(r.count) || 0), 0);
  const dates = Object.keys(modeDays).filter(d => modeDays[d]?.[mode]).sort();
  const band = convergence({ sigma: captured?.sigma, count: row?.count });

  if (!row) {
    return shell({ state, active: 'overview', title: `${name} · ${mode}`,
      body: html`<div class="page-heading"><div><div class="eyebrow">BET MODE</div><h1>${mode}<span>.</span></h1>
        <p>${name}</p></div></div>
      <div class="notice warning">This mode is not present in the current per-mode response for ${name}. It may have been renamed, removed, or never deployed.</div>` });
  }

  const body = html`<div class="page-heading"><div><div class="eyebrow">BET MODE</div><h1>${mode}<span>.</span></h1>
      <p><a href="/game/${encodeURIComponent(slug)}">${name}</a> · cost ${row.cost}x · month-to-date from the 1st at 00:00Z</p></div>
    <a class="button secondary" href="/game/${encodeURIComponent(slug)}/buckets">Bucket cadence ↗</a></div>

  <div class="metric-grid">
    <article class="metric-card accent"><div class="metric-label">Bets</div><div class="metric-value">${int(row.count)}</div>
      <div class="metric-note">Share of bets ${totalCount ? pct((Number(row.count) || 0) / totalCount * 100, 1) : DASH}</div></article>
    <article class="metric-card"><div class="metric-label">Turnover</div><div class="metric-value">${usd(toUsd(row.turnover, state.money))}</div>
      <div class="metric-note">avg bet ${usd(row.avgBet)}</div></article>
    <article class="metric-card"><div class="metric-label">Studio profit</div>
      <div class="metric-value">${money(toShareUsd(row.profit, state.money.profitShare, state.money), { signed: true })}</div>
      <div class="metric-note">deployed RTP ${pct(row.rtp === null || row.rtp === undefined ? null : Number(row.rtp) * 100)}</div></article>
    <article class="metric-card"><div class="metric-label">Margin error bar</div>
      <div class="metric-value">${band ? `±${pct(band.se * 100)}` : DASH}</div>
      <div class="metric-note">${band ? `${int(band.needFor1pp)} rounds for ±1pp` : 'no captured sigma'}</div></article>
  </div>

  <section class="panel"><div class="section-heading"><div><h2>Captured against deployed</h2>
    <p>The model this mode was certified with, beside what the response reports now.</p></div></div>
    ${captured ? html`<div class="scroll"><table><thead><tr><th>Field</th><th>Captured</th><th>Deployed / observed</th></tr></thead><tbody>
      <tr><td>Cost</td><td>${captured.cost}x</td><td>${row.cost}x</td></tr>
      <tr><td>RTP</td><td>${pct(captured.rtp * 100)}</td><td>${pct(row.rtp === null || row.rtp === undefined ? null : Number(row.rtp) * 100)}</td></tr>
      <tr><td>Std dev (sigma)</td><td>${captured.sigma}</td><td>${DASH} <span class="dim">not reported per response</span></td></tr>
      <tr><td>Zero rate</td><td>${pct(captured.zeroRate * 100)}</td><td>${DASH}</td></tr>
      <tr><td>Hit rate</td><td>${pct((captured.hitRate ?? null) === null ? null : captured.hitRate * 100)}</td><td>${DASH}</td></tr>
      <tr><td>Mean return</td><td>${captured.mean === null || captured.mean === undefined ? DASH : `${captured.mean}x`}</td><td>${DASH}</td></tr>
      <tr><td>Worst loss streak (1-in-1000)</td><td>${int(captured.worstLossStreak)}</td><td>${DASH}</td></tr>
    </tbody></table></div>` : html`<p class="notice warning">No captured model for this mode. Observed figures stand alone.</p>`}</section>

  <section class="panel"><div class="section-heading"><div><h2>Conclusions</h2>
    <p>Each carries its sample size and whether it can be read at that size.</p></div></div>
    <ul class="list">${modeVerdicts({ row, game: math, mode: captured, money: state.money }).map(v => html`
      <li class="${severityClass[v.severity] ?? ''}"><div>${v.message}</div>
        <div class="dim">${v.kind} · n=${int(v.n)} · ${v.readable === null ? 'no model to compare' : v.readable ? 'readable' : 'not readable yet'}</div></li>`)}</ul>
    ${math ? null : html`<p class="dim">No captured math for this game, so no comparison is possible.</p>`}</section>

  ${dates.length ? html`<section class="panel chart-panel"><div class="section-heading"><div><h2>This mode, day by day</h2>
      <p>Bets and turnover accumulated from the collector's five-minute trail.</p></div></div>
    ${lineChart({ labels: dates.map(d => d.slice(5)), tipLabels: dates,
      series: [
        { name: 'bets', colour: MODE_COLOURS[0], values: dates.map(d => modeDays[d][mode].count ?? null) },
        { name: 'turnover (USD)', colour: MODE_COLOURS[2], axis: 'right',
          values: dates.map(d => { const v = modeDays[d][mode].turnover; return v === undefined ? null : toUsd(v, state.money); }) },
      ], title: `${mode} by day` })}</section>`
    : html`<section class="panel"><p class="dim">No daily history for this mode yet. The per-mode rollup accumulates forward; the API cannot supply past days for a bet mode.</p></section>`}

  <section class="panel definitions"><div class="section-heading"><h2>About this page</h2></div>
    <p>The studio API does not report player identity per bet mode - unique, new and returning players exist only per game. No player counts are shown here, and none are estimated from turnover or bet counts. Game-level player figures are on the <a href="/game/${encodeURIComponent(slug)}">game page</a>.</p></section>`;

  return shell({ state, body, active: 'overview', title: `${name} · ${mode}` });
}
