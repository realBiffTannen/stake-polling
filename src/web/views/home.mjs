/**
 * The landing page - one line per game, and nothing deeper.
 *
 * Month-to-date throughout, because that is the only horizon the per-mode
 * figures on a game page exist over: a game's row here and the total row of
 * its mode table are the same numbers. Anything finer - modes, math,
 * verdicts, charts - lives on the game page, one click away.
 *
 * Titles the catalogue lists but has not turned on get a table of their own.
 * The API reports no play for them at all, so that table carries what IS
 * known (status, approval stage, captured math) and no money columns - a row
 * of $0.00 would claim somebody watched a quiet month.
 */

import { html } from '../html.mjs';
import { int, usd, pct, money, blank, DASH } from '../format.mjs';
import { shell } from './shell.mjs';
import { totalsOf } from '../../tui/state.mjs';
import { sorted } from './overview.mjs';

const gameHref = (slug) => `/game/${encodeURIComponent(slug)}`;

function card(label, value, note, kind = '') {
  return html`<article class="metric-card ${kind}"><div class="metric-label">${label}</div><div class="metric-value">${value}</div><div class="metric-note">${note}</div></article>`;
}

function status(title) {
  if (title.published === false) return 'Unpublished';
  return title.published ? 'Published · not live' : 'Not live';
}

function waitingRow(title, math) {
  return html`<tr>
    <td><a class="game-link" href="${gameHref(title.slug)}">${title.name}</a></td>
    <td>${status(title)}</td>
    <td>${title.approval ?? DASH}</td>
    <td>${blank(math?.edge) ? DASH : pct((1 - Number(math.edge)) * 100)}</td>
    <td>${math?.modes ? int(Object.keys(math.modes).length) : DASH}</td>
    <td>${blank(math?.maxWin) ? DASH : `${int(math.maxWin)}x`}</td></tr>`;
}

export function renderHome(state) {
  const rows = sorted(state.rows ?? [], 'turnover');
  const total = totalsOf(rows);
  const onRoster = new Set(rows.map((r) => r.name));
  const waiting = (state.titles ?? []).filter((t) => !t.isLive && !onRoster.has(t.slug))
    .sort((a, b) => String(a.name).localeCompare(String(b.name)));
  const signed = (v) => money(v, { signed: true });

  const body = html`<div class="page-heading"><div><div class="eyebrow">AT A GLANCE</div><h1>Overview<span>.</span></h1>
      <p>Every game this month, one line each. Open a game for its bet modes, math and players.</p></div></div>

  <div class="metric-grid">
    ${card('Studio P/L this month', signed(total.profitUsd), html`today ${signed(total.dayProfitUsd)}`, 'accent')}
    ${card('Bets this month', int(total.count), 'one bet = one game played')}
    ${card('Turnover this month', usd(total.turnoverUsd), 'USD')}
    ${card('Online now', int(state.online), 'across live games')}
  </div>

  <section class="panel"><div class="section-heading"><div><h2>Games</h2>
      <p>Month-to-date from the 1st at 00:00Z. Studio P/L is the studio's ${((state.money?.profitShare ?? 0.1) * 100).toFixed(0)}% share of gross gaming revenue.</p></div>
      <span class="tag">${rows.length} games</span></div>
    <div class="scroll"><table><thead><tr><th>Game</th><th>Bets</th><th>Turnover</th><th>Studio P/L</th><th>P/L today</th><th>Online now</th></tr></thead>
      <tbody>${rows.length ? rows.map((r) => html`<tr class="${r.pending ? 'pending' : ''}">
        <td><a class="game-link" href="${gameHref(r.name)}">${r.label ?? r.name}</a>${r.pending ? html` <span class="tag">live, nothing yet</span>` : null}</td>
        <td>${int(r.count)}</td><td>${usd(r.turnoverUsd)}</td><td>${signed(r.profitUsd)}</td>
        <td>${signed(r.dayProfitUsd)}</td><td>${int(r.online)}</td></tr>`)
        : html`<tr><td colspan="6" class="empty">No games on the roster yet.</td></tr>`}</tbody>
      ${rows.length ? html`<tfoot><tr><td>Total</td><td>${int(total.count)}</td><td>${usd(total.turnoverUsd)}</td>
        <td>${signed(total.profitUsd)}</td><td>${signed(total.dayProfitUsd)}</td><td>${int(total.online)}</td></tr></tfoot>` : null}
    </table></div></section>

  <section class="panel"><div class="section-heading"><div><h2>Not yet live</h2>
      <p>In the catalogue but not turned on. The API reports no play for these; math is what was captured before release.</p></div>
      <span class="tag">${waiting.length} titles</span></div>
    ${waiting.length ? html`<div class="scroll"><table><thead><tr><th>Game</th><th>Status</th><th>Approval stage</th><th>Captured RTP</th><th>Modes</th><th>Max win</th></tr></thead>
      <tbody>${waiting.map((t) => waitingRow(t, state.math?.[t.slug]))}</tbody></table></div>`
      : html`<p class="dim">No titles waiting to go live.</p>`}</section>`;

  return shell({ state, body, active: 'overview', title: 'Overview' });
}
