/**
 * The Games page - the studio's catalogue, every title live or not.
 *
 * Two tables, drawn here and reused by the Overview so the two pages cannot
 * drift. The catalogue: every title with the star rating the Engine studio
 * shows for it, its approval stage (or simply "Live" once it is), the revenue
 * model the roster reports for it (the 10% revenue share, or the 5% GGR split
 * across providers), its lifetime bets, players, turnover and studio P/L from
 * the hourly lifetime snapshot, and a link to its page on the studio itself.
 * Each row opens (a button, app.js) into a details row: this month's figures,
 * the catalogue facts, the captured math, its bet modes and the links.
 *
 * Titles the catalogue lists but has not turned on get a table of their own.
 * The API reports no play for them at all, so that table carries what IS
 * known (status, approval stage, captured math) and no money columns - a row
 * of $0.00 would claim somebody watched a quiet month.
 */

import { html } from '../html.mjs';
import { int, usd, pct, money, blank, DASH } from '../format.mjs';
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


/** The roster's rate for the title, or a dash: only a game with figures reports one. */
function model(rate) {
  const m = revenueModel(rate);
  if (!m) return html`<span class="dim" title="The API reports a revenue rate only for a game on the roster">${DASH}</span>`;
  return html`<span class="model${m.split ? ' split' : ''}">${m.label}</span>`;
}

const CATALOGUE_COLUMNS = 9;
const signed = (v) => money(v, { signed: true });

function status(title) {
  if (title.published === false) return 'Unpublished';
  return title.published ? 'Published · not live' : 'Not live';
}

/** The bet modes read for a game, or the captured ones when none have been. */
function modesOf(read, math) {
  if (Array.isArray(read) && read.length) return read;
  return Object.entries(math?.modes ?? {}).map(([mode, m]) => ({ mode, cost: m?.cost ?? null }));
}

function catalogueRow(title, { team, rate, roster, lifetime, math, modes }) {
  const url = engineGameUrl(team, title.slug);
  return html`<tr>
    <td><button type="button" class="expand" data-expand="${title.slug}" aria-expanded="false" aria-controls="details-${title.slug}" aria-label="Show details for ${title.name}"><span aria-hidden="true">▸</span></button><a class="game-link" href="${gameHref(title.slug)}">${title.name}</a></td>
    ${numCell(starRating(title.rating) === null ? null : title.rating, stars(title.rating))}
    <td>${title.isLive ? html`<span class="pill live">Live</span>` : title.approval ?? DASH}</td>
    <td>${model(rate)}</td>
    ${numCell(lifetime?.count, int(lifetime?.count))}
    ${numCell(lifetime?.unique, int(lifetime?.unique))}
    ${numCell(lifetime?.turnoverUsd, usd(lifetime?.turnoverUsd))}
    ${numCell(lifetime?.profitUsd, signed(lifetime?.profitUsd))}
    <td>${url ? html`<a class="engine-link" href="${url}" target="_blank" rel="noopener noreferrer">Open on Engine ↗</a>` : DASH}</td></tr>
  <tr class="game-details" id="details-${title.slug}" data-details-for="${title.slug}"><td colspan="${CATALOGUE_COLUMNS}">${detailsOf(title, { url, roster, math, modes })}</td></tr>`;
}

/** What opens under a catalogue row. Every figure a dash when unmeasured, never a zero. */
function detailsOf(title, { url, roster, math, modes }) {
  const kv = (pairs) => html`<dl>${pairs.map(([k, v]) => html`<dt>${k}</dt><dd>${v}</dd>`)}</dl>`;
  const rating = starRating(title.rating) === null ? 'Unrated' : `${(Number(title.rating) / 30).toFixed(2)} of ${MAX_STARS}`;
  const modeWords = modes.map((m) => `${m.mode} ${blank(m.cost) ? '?' : `${m.cost}x`}`);
  return html`<div class="details-grid">
    <div><h4>This month</h4>${kv([['Bets', int(roster?.count)], ['Turnover', usd(roster?.turnoverUsd)], ['Studio P/L', signed(roster?.profitUsd)],
      ['P/L today', signed(roster?.dayProfitUsd)], ['Online now', int(roster?.online)], ['Players', int(roster?.unique)]])}</div>
    <div><h4>Catalogue</h4>${kv([['Status', title.isLive ? 'Live' : status(title)], ['Approval stage', title.approval ?? DASH], ['Rating', rating], ['Slug', title.slug]])}</div>
    <div><h4>Captured math</h4>${math ? kv([['RTP', blank(math.edge) ? DASH : pct((1 - Number(math.edge)) * 100)], ['House edge', blank(math.edge) ? DASH : pct(Number(math.edge) * 100)],
      ['Max win', blank(math.maxWin) ? DASH : `${int(math.maxWin)}x`], ['Modes', math.modes ? int(Object.keys(math.modes).length) : DASH], ['Version', math.version ?? DASH]])
      : html`<p class="dim">No captured math.</p>`}</div>
    <div><h4>Bet modes</h4>${modeWords.length ? html`<p>${modeWords.join(' · ')}</p>` : html`<p class="dim">No bet modes read yet.</p>`}</div>
    <div class="details-links"><a class="game-link" href="${gameHref(title.slug)}">Open game page →</a>${url ? html`<a class="engine-link" href="${url}" target="_blank" rel="noopener noreferrer">Open on Engine ↗</a>` : null}</div>
  </div>`;
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
  // The roster row (month to date, and the revenue rate) rides on the slug (`row.name`).
  const rosterBySlug = new Map((state.rows ?? []).map((r) => [r.name, r]));
  const lifetimeGames = state.lifetimeGames ?? {};
  const row = (t) => catalogueRow(t, { team, rate: rosterBySlug.get(t.slug)?.rate ?? null, roster: rosterBySlug.get(t.slug) ?? null,
    lifetime: lifetimeGames[t.slug] ?? null, math: state.math?.[t.slug] ?? null, modes: modesOf(state.modeRows?.[t.slug], state.math?.[t.slug]) });
  return html`<section class="panel"><div class="section-heading"><div><h2>Games</h2>
      <p>Every title in the studio's catalogue, live or not, with the rating the Engine studio shows for it and the revenue model the roster reports: the 10% revenue share, or the 5% GGR split across providers. Lifetime figures run from ${state.lifetime?.from ?? 'the start of tracking'}, from the hourly lifetime snapshot. Open a row for this month's figures, its math and bet modes; open a game for everything else, or open it on Engine.</p></div>
      <span class="tag">${catalogue.length} titles</span></div>
    ${catalogue.length ? html`<div class="scroll"><table data-sortable="catalogue"><thead><tr><th data-sort="text">Game</th><th data-sort="number">Rating</th><th data-sort="text">Approval stage</th><th data-sort="text">Revenue model</th><th data-sort="number">Lifetime bets</th><th data-sort="number">Lifetime players</th><th data-sort="number">Lifetime turnover</th><th data-sort="number">Lifetime P/L</th><th>Engine</th></tr></thead>
      <tbody>${catalogue.map(row)}</tbody></table></div>`
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
