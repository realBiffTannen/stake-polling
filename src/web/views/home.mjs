/**
 * The landing page - one line per game, and nothing deeper.
 *
 * Month-to-date throughout, because that is the only horizon the per-mode
 * figures on a game page exist over: a game's row here and the total row of
 * its mode table are the same numbers. Anything finer - modes, math,
 * verdicts, charts - lives on the game page, one click away.
 *
 * Under the money table, the catalogue and the titles not yet live - the
 * same two tables the Games page is made of (views/games.mjs), drawn by the
 * same code so the two pages cannot drift.
 */

import { html } from '../html.mjs';
import { int, usd, money } from '../format.mjs';
import { shell } from './shell.mjs';
import { numCell } from './parts.mjs';
import { totalsOf } from '../../tui/state.mjs';
import { sorted } from './overview.mjs';
import { gameHref, catalogueSection, waitingSection } from './games.mjs';

function card(label, value, note, kind = '') {
  return html`<article class="metric-card ${kind}"><div class="metric-label">${label}</div><div class="metric-value">${value}</div><div class="metric-note">${note}</div></article>`;
}

export function renderHome(state) {
  const rows = sorted(state.rows ?? [], 'turnover');
  const total = totalsOf(rows);
  const signed = (v) => money(v, { signed: true });

  const body = html`<div class="page-heading"><div><div class="eyebrow">AT A GLANCE</div><h1>Overview<span>.</span></h1>
      <p>Every game this month, one line each. Open a game for its bet modes, math and players.</p></div></div>

  <div class="metric-grid">
    ${card('Studio P/L this month', signed(total.profitUsd), html`today ${signed(total.dayProfitUsd)}`, 'accent')}
    ${card('Bets this month', int(total.count), 'one bet = one game played')}
    ${card('Turnover this month', usd(total.turnoverUsd), 'USD')}
    ${card('Online now', int(state.online), 'across live games')}
  </div>

  <section class="panel"><div class="section-heading"><div><h2>Live games this month</h2>
      <p>Month-to-date from the 1st at 00:00Z. Studio P/L is the studio's ${((state.money?.profitShare ?? 0.1) * 100).toFixed(0)}% share of gross gaming revenue.</p></div>
      <span class="tag">${rows.length} games</span></div>
    <div class="scroll"><table data-sortable="live-games"><thead><tr><th data-sort="text">Game</th><th data-sort="number">Bets</th><th data-sort="number">Turnover</th><th data-sort="number">Studio P/L</th><th data-sort="number">P/L today</th><th data-sort="number">Online now</th></tr></thead>
      <tbody>${rows.length ? rows.map((r) => html`<tr class="${r.pending ? 'pending' : ''}">
        <td><a class="game-link" href="${gameHref(r.name)}">${r.label ?? r.name}</a>${r.pending ? html` <span class="tag">live, nothing yet</span>` : null}</td>
        ${numCell(r.count, int(r.count))}${numCell(r.turnoverUsd, usd(r.turnoverUsd))}${numCell(r.profitUsd, signed(r.profitUsd))}
        ${numCell(r.dayProfitUsd, signed(r.dayProfitUsd))}${numCell(r.online, int(r.online))}</tr>`)
        : html`<tr><td colspan="6" class="empty">No games on the roster yet.</td></tr>`}</tbody>
      ${rows.length ? html`<tfoot><tr><td>Total</td><td>${int(total.count)}</td><td>${usd(total.turnoverUsd)}</td>
        <td>${signed(total.profitUsd)}</td><td>${signed(total.dayProfitUsd)}</td><td>${int(total.online)}</td></tr></tfoot>` : null}
    </table></div></section>

  ${catalogueSection(state)}

  ${waitingSection(state)}`;

  return shell({ state, body, active: 'overview', title: 'Overview' });
}
