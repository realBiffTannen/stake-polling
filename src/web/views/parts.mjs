/**
 * The pieces every page is built from.
 *
 * An empty pane says it is empty. Rendering nothing would be indistinguishable
 * from a pane that failed to render, and one of those is a symptom.
 */

import { createHash } from 'node:crypto';
import { html, raw } from '../html.mjs';
import { fill } from '../fills.mjs';
import { usd, int, utcHm, money, DASH } from '../format.mjs';
import { toUsd, toShareUsd, DEFAULT_MONEY } from '../../money.mjs';
import { SPANS } from '../../insights/span.mjs';

/**
 * A standing warning that can be dismissed - a fact that stays true until
 * someone acts on it, not a live fault. Dismissing is a form POST to /dismiss
 * (server.mjs), kept in Redis, so it holds for every browser and every user;
 * `dismissed` is that set, and a dismissed warning renders as nothing.
 *
 * The key is a fingerprint of `text`: pass the warning's substance, so a
 * warning that changes - another game drifts - is a new key and shows again.
 * The CSRF field is a request-time fill, because the page itself is cached.
 */
export const dismissKey = (id, text) => `${id}:${createHash('sha256').update(String(text)).digest('hex').slice(0, 12)}`;

export function dismissibleNotice(id, text, content, { dismissed = null, back = '/' } = {}) {
  const key = dismissKey(id, text);
  if (dismissed?.has?.(key)) return null;
  return html`<div class="notice warning dismissible" data-dismiss-key="${key}">${content}<form method="post" action="/dismiss" class="dismiss-form" data-dismiss-form>${fill('csrf-input', '')}<input type="hidden" name="key" value="${key}"><input type="hidden" name="back" value="${back}"><button type="submit" class="dismiss" aria-label="Dismiss this warning for everyone" title="Dismiss for everyone">×</button></form></div>`;
}

/** The alert every screen carries while Redis is over its memory limit, or null. */
export function memoryAlertText(memory) {
  if (!memory?.over) return null;
  return `REDIS MEMORY ${memory.human} - over the ${memory.limitHuman} limit (REDIS_DB_SIZE). Shorten retention.trailDays, or raise the limit if the machine has room.`;
}

export function banner(state) {
  const parts = [];
  const memory = memoryAlertText(state.redisMemory);
  // Sticky: it stays pinned at the top however far the page is scrolled, for
  // as long as the database is over the limit.
  if (memory) parts.push(html`<div class="banner bad sticky" role="alert">${memory}</div>`);
  if (state.meta?.auth_state && state.meta.auth_state !== 'ok') {
    parts.push(html`<div class="banner bad">SID EXPIRED - polling is paused. Drop a new sid into .sid and it resumes on the next tick.</div>`);
  }
  if (state.stale) parts.push(html`<div class="banner warn">STALE - no successful poll recently.</div>`);
  if (state.meta?.persistence === 'off') {
    parts.push(html`<div class="banner warn">aof off - the trail lives only until the next redis restart. npm run enable-persistence</div>`);
  }
  return html`${parts}`;
}

export function tiles(list) {
  if (!list?.length) return html`<p class="dim">no figures yet</p>`;
  return html`<div class="tiles">${list.map((t) => html`
    <div class="tile"><div class="label">${t.label}</div>
    <div class="value ${t.tone ?? ''}">${t.value}</div></div>`)}</div>`;
}

/**
 * A `cell` accessor is caller-supplied and can throw on a bad row. One column
 * failing must not take the whole table down with it - render a visible
 * error cell instead so the rest of the row, and every other row, still
 * reads.
 */
function renderCell(c, r) {
  try {
    return html`<td>${c.cell(r)}</td>`;
  } catch {
    return html`<td class="bad">error</td>`;
  }
}

/**
 * @param {{ columns: {key: string, title: string, cell: (row: object) => unknown}[], rows: object[] }} opts
 */
export function dataTable({ columns, rows }) {
  // The header renders even for zero rows - the columns are information too,
  // and a header with no body reads as "nothing matched" rather than "broken".
  const body = rows?.length
    ? rows.map((r) => html`<tr class="${r.pending ? 'pending' : ''}">${columns.map((c) => renderCell(c, r))}</tr>`)
    : html`<tr><td class="dim" colspan="${columns.length}">no rows</td></tr>`;
  return html`<div class="scroll"><table>
    <thead><tr>${columns.map((c) => html`<th>${c.title}</th>`)}</tr></thead>
    <tbody>${body}</tbody>
  </table></div>`;
}

/**
 * The newest `limit` entries as a list, the rest behind a fold that starts
 * shut. Entries arrive newest first (the reader's xRevRange) and keep that
 * order on both sides of the fold. The fold carries an id so app.js keeps it
 * open through a live refresh.
 */
function recentList(items, { limit, id, render }) {
  const shown = items.slice(0, limit);
  const rest = items.slice(limit);
  const list = (entries) => html`<ul class="list">${entries.map(render)}</ul>`;
  return html`${list(shown)}${rest.length ? html`<details class="fold-more" id="${id}"><summary><span class="when-closed">Show ${int(rest.length)} more</span><span class="when-open">Show fewer</span></summary>${list(rest)}</details>` : null}`;
}

export function findingsList(alerts, { limit = 5, id = 'findings-more' } = {}) {
  if (!alerts?.length) return html`<p class="dim">no findings</p>`;
  return recentList(alerts, { limit, id, render: (a) => html`
    <li class="${a.severity ?? ''}">
      <div>${a.message ?? `${a.game ?? ''} ${a.metric ?? ''} ${a.kind ?? ''}`}</div>
      <div class="dim">${utcHm(a.ts)} ${a.severity ?? ''} ${a.game ?? ''}</div>
    </li>` });
}

export function eventsList(events) {
  if (!events?.length) return html`<p class="dim">nothing that looks like an event right now</p>`;
  return html`<ul class="list">${events.map((e) => html`
    <li class="${e.severity ?? ''}">
      <div><b>${e.title}</b> <span class="badge">${e.confidence ?? 'low'} confidence</span></div>
      <div>${e.description ?? ''}</div>
      <div class="dim">${Array.isArray(e.findings)
        ? e.findings.map((f) => html`<span>${f.message ?? `${f.metric}:${f.kind}`}</span> `)
        : html`${int(e.findings)} findings ${(e.evidence ?? []).map(message => html`<span>${message}</span> `)}`}</div>
    </li>`)}</ul>`;
}

/** The summary stream stores RAW units, like every other trail. Convert here. */
export function actionLog(summaries, money_ = DEFAULT_MONEY, { limit = 5, id = 'running-action-more' } = {}) {
  if (!summaries?.length) return html`<p class="dim">no running action recorded yet</p>`;
  return recentList(summaries, { limit, id, render: (s) => html`
    <li>
      <div>${utcHm(s.from)}-${utcHm(s.to)}
        <b>${int(s.count)}</b> bets,
        ${usd(toUsd(s.turnover, money_))} turnover,
        ${money(toShareUsd(s.profit, money_.profitShare, money_), { signed: true })} profit,
        ${int(s.activeGames)} games active</div>
      <div class="dim">top mover ${s.topMover || DASH} ${usd(toUsd(s.topMoverTurnover, money_))}
        - ${int(s.alerts ?? 0)} findings (${int(s.crits ?? 0)} crit, ${int(s.warns ?? 0)} warn)</div>
    </li>` });
}

/**
 * The time picker, as plain links so it works without script and survives the
 * live refresh (the refresh re-fetches the same URL, span included).
 */
export function spanPicker(path, span, keys = Object.keys(SPANS)) {
  return html`<span class="quick-ranges span-picker" role="group" aria-label="Time span">${keys.map((key) =>
    html`<a href="${path}?span=${key}" class="${key === span ? 'selected' : ''}"${key === span ? raw(' aria-current="true"') : null}>${SPANS[key].label}</a>`)}</span>`;
}

const NOTHING_MEASURED = 'Nothing measured in this period yet.';

/** A chart's headline, or a plain statement that nothing was measured. */
export function conclusion(headline) {
  return html`<p class="conclusion">${headline ?? NOTHING_MEASURED}</p>`;
}

/** A stable, readable anchor for a panel title: "Luck or fault?" -> "p-luck-or-fault". */
export const panelId = (title) => `p-${String(title).toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '')}`;

/**
 * One chart panel: title, the conclusion it supports, the chart, an optional
 * footnote.
 *
 * `collapsed` folds the chart and footnote away behind the heading, shut
 * until the reader opens it; the title and its conclusion stay in view. The
 * fold carries an id so app.js keeps it open through a live refresh. A
 * summary may hold only phrasing and heading content, so the folded heading
 * is an h2 and a span, not the div the open form uses. For static content
 * only: a chart drawn client-side inside a shut fold would be sized at zero.
 */
export function chartPanel(title, headline, chart, note = null, { collapsed = false } = {}) {
  const id = panelId(title);
  const foot = note ? html`<div class="chart-foot"><span>${note}</span></div>` : null;
  if (!collapsed) {
    return html`<section class="panel chart-panel" id="${id}"><div class="section-heading"><div><h2>${title}</h2>
      ${conclusion(headline)}</div></div>${chart}${foot}</section>`;
  }
  return html`<section class="panel chart-panel" id="${id}"><details class="fold" id="${id}-fold"><summary><h2>${title}</h2><span class="conclusion">${headline ?? NOTHING_MEASURED}</span><span class="fold-arrow" aria-hidden="true"></span></summary>
      <div class="fold-body">${chart}${foot}</div></details></section>`;
}
