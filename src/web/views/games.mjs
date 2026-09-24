/**
 * The Games page - the studio's catalogue, every title live or not.
 *
 * Two tables, drawn here and reused by the Overview so the two pages cannot
 * drift. The catalogue: every title with the star rating the Engine studio
 * shows for it, whether it is live, the revenue model the roster reports for
 * it (the 10% revenue share, or the 5% GGR split across providers), its
 * approval stage, and a link to its page on the studio itself.
 *
 * Titles the catalogue lists but has not turned on get a table of their own.
 * The API reports no play for them at all, so that table carries what IS
 * known (status, approval stage, captured math) and no money columns - a row
 * of $0.00 would claim somebody watched a quiet month.
 */

import { html } from '../html.mjs';
import { int, pct, blank, DASH } from '../format.mjs';
import { shell } from './shell.mjs';
import { numCell } from './parts.mjs';
import { starRating, MAX_STARS } from '../../games.mjs';
import { revenueModel } from '../../money.mjs';

export const gameHref = (slug) => `/game/${encodeURIComponent(slug)}`;

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

/** The roster's rate for the title, or a dash: only a game with figures reports one. */
function model(rate) {
  const m = revenueModel(rate);
  if (!m) return html`<span class="dim" title="The API reports a revenue rate only for a game on the roster">${DASH}</span>`;
  return html`<span class="model${m.split ? ' split' : ''}">${m.label}</span>`;
}

function catalogueRow(title, team, rate) {
  const url = engineGameUrl(team, title.slug);
  return html`<tr>
    <td><a class="game-link" href="${gameHref(title.slug)}">${title.name}</a></td>
    ${numCell(starRating(title.rating) === null ? null : title.rating, stars(title.rating))}
    <td>${liveness(title)}</td>
    <td>${model(rate)}</td>
    <td>${title.approval ?? DASH}</td>
    <td>${url ? html`<a class="engine-link" href="${url}" target="_blank" rel="noopener noreferrer">Open on Engine ↗</a>` : DASH}</td></tr>`;
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
    ${numCell(blank(math?.edge) ? null : (1 - Number(math.edge)) * 100, blank(math?.edge) ? DASH : pct((1 - Number(math.edge)) * 100))}
    ${numCell(math?.modes ? Object.keys(math.modes).length : null, math?.modes ? int(Object.keys(math.modes).length) : DASH)}
    ${numCell(math?.maxWin, blank(math?.maxWin) ? DASH : `${int(math.maxWin)}x`)}</tr>`;
}

const byName = (a, b) => String(a.name).localeCompare(String(b.name));

/** The catalogue: every title, live ones first, each run by name. */
export function catalogueSection(state) {
  const catalogue = [...(state.titles ?? [])].sort((a, b) => Number(b.isLive) - Number(a.isLive) || byName(a, b));
  const team = state.meta?.team ?? null;
  // The revenue rate rides on the roster row, keyed by slug (`row.name`).
  const rateBySlug = new Map((state.rows ?? []).map((r) => [r.name, r.rate ?? null]));
  return html`<section class="panel"><div class="section-heading"><div><h2>Games</h2>
      <p>Every title in the studio's catalogue, live or not, with the rating the Engine studio shows for it and the revenue model the roster reports: the 10% revenue share, or the 5% GGR split across providers. Open a game for its bet modes, math and players, or open it on Engine.</p></div>
      <span class="tag">${catalogue.length} titles</span></div>
    ${catalogue.length ? html`<div class="scroll"><table data-sortable="catalogue"><thead><tr><th data-sort="text">Game</th><th data-sort="number">Rating</th><th data-sort="text">Status</th><th data-sort="text">Revenue model</th><th data-sort="text">Approval stage</th><th>Engine</th></tr></thead>
      <tbody>${catalogue.map((t) => catalogueRow(t, team, rateBySlug.get(t.slug) ?? null))}</tbody></table></div>`
      : html`<p class="dim">No titles in the catalogue yet.</p>`}</section>`;
}

/** Titles in the catalogue but not turned on, by name. */
export function waitingSection(state) {
  const onRoster = new Set((state.rows ?? []).map((r) => r.name));
  const waiting = (state.titles ?? []).filter((t) => !t.isLive && !onRoster.has(t.slug)).sort(byName);
  return html`<section class="panel"><div class="section-heading"><div><h2>Not yet live</h2>
      <p>In the catalogue but not turned on. The API reports no play for these; math is what was captured before release.</p></div>
      <span class="tag">${waiting.length} titles</span></div>
    ${waiting.length ? html`<div class="scroll"><table data-sortable="waiting"><thead><tr><th data-sort="text">Game</th><th data-sort="text">Status</th><th data-sort="text">Approval stage</th><th data-sort="number">Captured RTP</th><th data-sort="number">Modes</th><th data-sort="number">Max win</th></tr></thead>
      <tbody>${waiting.map((t) => waitingRow(t, state.math?.[t.slug]))}</tbody></table></div>`
      : html`<p class="dim">No titles waiting to go live.</p>`}</section>`;
}

export function renderGames(state) {
  const body = html`<div class="page-heading"><div><div class="eyebrow">THE CATALOGUE</div><h1>Games<span>.</span></h1>
      <p>Every title in the studio's catalogue, live or not. Click a column heading to sort by it. Open a game for its bet modes, math and players, or open it on Engine.</p></div></div>

  ${catalogueSection(state)}

  ${waitingSection(state)}`;

  return shell({ state, body, active: 'games', title: 'Games' });
}
