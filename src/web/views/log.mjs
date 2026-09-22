/**
 * The poll log - every entry the poller wrote, newest first, a page at a time.
 *
 * Values are shown exactly as stored. This page is where a figure elsewhere
 * on the dashboard gets checked against its source, so it converts nothing:
 * a log that formatted money would need its own log.
 */

import { html, raw } from '../html.mjs';
import { int, DASH } from '../format.mjs';
import { shell } from './shell.mjs';

function utcStamp(ts) {
  const n = Number(ts);
  if (!Number.isFinite(n)) return DASH;
  const iso = new Date(n).toISOString();
  return `${iso.slice(0, 10)} ${iso.slice(11, 19)}Z`;
}

function href(source, extra = {}) {
  return `/log?${new URLSearchParams({ source, ...extra })}`;
}

/** A pager step: a link when it goes somewhere, plain text when it would not. */
function step(label, target) {
  return target ? html`<a href="${target}">${label}</a>` : html`<span class="disabled">${label}</span>`;
}

/**
 * @param {{ state: object, page: { entries: object[], newer: string|null, older: string|null, total: number },
 *   sources: { id: string }[], source: string, total?: number }} args
 */
export function renderLog({ state, page, sources = [], source = 'all', total }) {
  const selected = source || 'all';
  const entries = page?.entries ?? [];
  const count = total ?? page?.total ?? 0;
  const streams = selected === 'all' ? sources.length : 1;
  const today = new Date(Number(state?.now) || Date.now()).toISOString().slice(0, 10);

  const pager = html`<nav class="pager">
    ${step('Newest', page?.newer ? href(selected) : null)}
    ${step('Newer', page?.newer ? href(selected, { after: page.newer }) : null)}
    ${step('Older', page?.older ? href(selected, { before: page.older }) : null)}
    ${step('Oldest', page?.older ? href(selected, { oldest: '1' }) : null)}</nav>`;

  const body = html`<div class="page-heading"><div><div class="eyebrow">EVERY TICK</div><h1>Poll log<span>.</span></h1>
      <p>Every entry the collector has written, newest first, exactly as stored.</p></div></div>

  <form class="filters" method="get" action="/log"><label>Stream<select name="source">
    <option value="all"${selected === 'all' ? raw(' selected') : null}>all</option>
    ${sources.map((s) => html`<option value="${s.id}"${s.id === selected ? raw(' selected') : null}>${s.id}</option>`)}
  </select></label><button class="button" type="submit">Show ↗</button></form>

  <section class="panel"><div class="section-heading"><div><h2>Download raw CSV</h2>
      <p>A UTC day runs 00:00:00Z to the next midnight. One stream downloads one row per entry, a column per field; all streams download one row per data point. Leave the date empty for everything retained.</p></div></div>
    <form class="filters export" method="get" action="/export/log.csv"><label>Stream<select name="source">
      <option value="all"${selected === 'all' ? raw(' selected') : null}>all streams</option>
      ${sources.map((s) => html`<option value="${s.id}"${s.id === selected ? raw(' selected') : null}>${s.id}</option>`)}
    </select></label><label>UTC day<input type="date" name="date" value="${today}" max="${today}"></label>
    <button class="button" type="submit">Download CSV ↓</button></form></section>

  <section class="panel"><div class="section-heading"><div><h2>Entries</h2>
      <p>${int(count)} entries across ${int(streams)} ${streams === 1 ? 'stream' : 'streams'}.
        Money fields are raw micro-dollars - divide by 1,000,000 for USD. A trail's <b>profit</b> is the GROSS house win; the studio's share is 10% of it.</p></div></div>
    ${pager}
    <div class="scroll"><table class="log"><thead><tr><th>Time</th><th>Stream</th><th>Fields</th></tr></thead>
      <tbody>${entries.length ? entries.map((e) => html`<tr>
        <td>${utcStamp(e.ts)}</td><td>${e.source}</td>
        <td class="fields">${Object.entries(e.fields ?? {}).map(([key, value]) => html`<span class="kv"><b>${key}</b> ${value}</span> `)}</td></tr>`)
        : html`<tr><td colspan="3" class="empty">No entries.</td></tr>`}</tbody></table></div>
    ${pager}</section>`;

  return shell({ state, body, active: 'log', title: 'Poll log' });
}
