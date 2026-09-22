/**
 * The pieces every page is built from.
 *
 * An empty pane says it is empty. Rendering nothing would be indistinguishable
 * from a pane that failed to render, and one of those is a symptom.
 */

import { html } from '../html.mjs';
import { usd, int, utcHm, money, DASH } from '../format.mjs';
import { toUsd, toShareUsd, DEFAULT_MONEY } from '../../money.mjs';
import { SPANS } from '../../insights/span.mjs';

export function banner(state) {
  const parts = [];
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

export function findingsList(alerts) {
  if (!alerts?.length) return html`<p class="dim">no findings</p>`;
  return html`<ul class="list">${alerts.map((a) => html`
    <li class="${a.severity ?? ''}">
      <div>${a.message ?? `${a.game ?? ''} ${a.metric ?? ''} ${a.kind ?? ''}`}</div>
      <div class="dim">${utcHm(a.ts)} ${a.severity ?? ''} ${a.game ?? ''}</div>
    </li>`)}</ul>`;
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
export function actionLog(summaries, money_ = DEFAULT_MONEY) {
  if (!summaries?.length) return html`<p class="dim">no running action recorded yet</p>`;
  return html`<ul class="list">${summaries.map((s) => html`
    <li>
      <div>${utcHm(s.from)}-${utcHm(s.to)}
        <b>${int(s.count)}</b> bets,
        ${usd(toUsd(s.turnover, money_))} turnover,
        ${money(toShareUsd(s.profit, money_.profitShare, money_), { signed: true })} profit,
        ${int(s.activeGames)} games active</div>
      <div class="dim">top mover ${s.topMover || DASH} ${usd(toUsd(s.topMoverTurnover, money_))}
        - ${int(s.alerts ?? 0)} findings (${int(s.crits ?? 0)} crit, ${int(s.warns ?? 0)} warn)</div>
    </li>`)}</ul>`;
}

/**
 * The time picker, as plain links so it works without script and survives the
 * live refresh (the refresh re-fetches the same URL, span included).
 */
export function spanPicker(path, span) {
  return html`<span class="quick-ranges span-picker">${Object.entries(SPANS).map(([key, s]) =>
    html`<a href="${path}?span=${key}" class="${key === span ? 'selected' : ''}">${s.label}</a>`)}</span>`;
}

/** A chart's headline, or a plain statement that nothing was measured. */
export function conclusion(headline) {
  return html`<p class="conclusion">${headline ?? 'Nothing measured in this period yet.'}</p>`;
}

/** One chart panel: title, the conclusion it supports, the chart, an optional footnote. */
export function chartPanel(title, headline, chart, note = null) {
  return html`<section class="panel chart-panel"><div class="section-heading"><div><h2>${title}</h2>
      ${conclusion(headline)}</div></div>${chart}${note ? html`<div class="chart-foot"><span>${note}</span></div>` : null}</section>`;
}
