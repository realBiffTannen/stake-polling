/**
 * The landing page - one line per game, and nothing deeper.
 *
 * Month-to-date throughout, because that is the only horizon the per-mode
 * figures on a game page exist over: a game's row here and the total row of
 * its mode table are the same numbers. Anything finer - modes, math,
 * verdicts, charts - lives on the game page, one click away.
 *
 * Under the money table, the Games table: every title in the catalogue, live
 * or not, with the star rating the Engine studio shows for it, whether it is
 * live, its approval stage, and a link to its page on the studio itself.
 *
 * Titles the catalogue lists but has not turned on also get a table of their
 * own. The API reports no play for them at all, so that table carries what IS
 * known (status, approval stage, captured math) and no money columns - a row
 * of $0.00 would claim somebody watched a quiet month.
 */

import { html } from '../html.mjs';
import { int, usd, pct, money, blank, DASH } from '../format.mjs';
import { shell } from './shell.mjs';
import { totalsOf } from '../../tui/state.mjs';
import { sorted } from './overview.mjs';
import { starRating, MAX_STARS } from '../../games.mjs';

const gameHref = (slug) => `/game/${encodeURIComponent(slug)}`;

/** Where the studio's own pages live. The API under it is config; the site is not. */
export const ENGINE_STUDIO = 'https://studio.engine.io';

/** A title's page on the Engine studio, or null when no team is known to build it from. */
export function engineGameUrl(team, slug) {
  if (!team || !slug) return null;
  return `${ENGINE_STUDIO}/teams/${encodeURIComponent(team)}/games/${encodeURIComponent(slug)}`;
}

/** Stars out of three as the studio dashboard draws them, or Unrated. */
function stars(rating) {
  const n = starRating(rating);
  if (n === null) return html`<span class="dim">Unrated</span>`;
  return html`<span class="stars" role="img" aria-label="${n} of ${MAX_STARS} stars" title="${(Number(rating) / 30).toFixed(2)} of ${MAX_STARS}">${'★'.repeat(n)}<span class="stars-off">${'★'.repeat(MAX_STARS - n)}</span></span>`;
}

function liveness(title) {
  if (title.isLive) return html`<span class="pill live">Live</span>`;
  return html`<span class="pill">${title.published === false ? 'Unpublished' : 'Not live'}</span>`;
}

function catalogueRow(title, team) {
  const url = engineGameUrl(team, title.slug);
  return html`<tr>
    <td><a class="game-link" href="${gameHref(title.slug)}">${title.name}</a></td>
    <td>${stars(title.rating)}</td>
    <td>${liveness(title)}</td>
    <td>${title.approval ?? DASH}</td>
    <td>${url ? html`<a class="engine-link" href="${url}" target="_blank" rel="noopener noreferrer">Open on Engine ↗</a>` : DASH}</td></tr>`;
}

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
  const byName = (a, b) => String(a.name).localeCompare(String(b.name));
  const waiting = (state.titles ?? []).filter((t) => !t.isLive && !onRoster.has(t.slug)).sort(byName);
  // Live titles first, then the dark ones, each run by name.
  const catalogue = [...(state.titles ?? [])].sort((a, b) => Number(b.isLive) - Number(a.isLive) || byName(a, b));
  const team = state.meta?.team ?? null;
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
    <div class="scroll"><table><thead><tr><th>Game</th><th>Bets</th><th>Turnover</th><th>Studio P/L</th><th>P/L today</th><th>Online now</th></tr></thead>
      <tbody>${rows.length ? rows.map((r) => html`<tr class="${r.pending ? 'pending' : ''}">
        <td><a class="game-link" href="${gameHref(r.name)}">${r.label ?? r.name}</a>${r.pending ? html` <span class="tag">live, nothing yet</span>` : null}</td>
        <td>${int(r.count)}</td><td>${usd(r.turnoverUsd)}</td><td>${signed(r.profitUsd)}</td>
        <td>${signed(r.dayProfitUsd)}</td><td>${int(r.online)}</td></tr>`)
        : html`<tr><td colspan="6" class="empty">No games on the roster yet.</td></tr>`}</tbody>
      ${rows.length ? html`<tfoot><tr><td>Total</td><td>${int(total.count)}</td><td>${usd(total.turnoverUsd)}</td>
        <td>${signed(total.profitUsd)}</td><td>${signed(total.dayProfitUsd)}</td><td>${int(total.online)}</td></tr></tfoot>` : null}
    </table></div></section>

  <section class="panel"><div class="section-heading"><div><h2>Games</h2>
      <p>Every title in the studio's catalogue, live or not, with the rating the Engine studio shows for it. Open a game for its bet modes, math and players, or open it on Engine.</p></div>
      <span class="tag">${catalogue.length} titles</span></div>
    ${catalogue.length ? html`<div class="scroll"><table><thead><tr><th>Game</th><th>Rating</th><th>Status</th><th>Approval stage</th><th>Engine</th></tr></thead>
      <tbody>${catalogue.map((t) => catalogueRow(t, team))}</tbody></table></div>`
      : html`<p class="dim">No titles in the catalogue yet.</p>`}</section>

  <section class="panel"><div class="section-heading"><div><h2>Not yet live</h2>
      <p>In the catalogue but not turned on. The API reports no play for these; math is what was captured before release.</p></div>
      <span class="tag">${waiting.length} titles</span></div>
    ${waiting.length ? html`<div class="scroll"><table><thead><tr><th>Game</th><th>Status</th><th>Approval stage</th><th>Captured RTP</th><th>Modes</th><th>Max win</th></tr></thead>
      <tbody>${waiting.map((t) => waitingRow(t, state.math?.[t.slug]))}</tbody></table></div>`
      : html`<p class="dim">No titles waiting to go live.</p>`}</section>`;

  return shell({ state, body, active: 'overview', title: 'Overview' });
}
