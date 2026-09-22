/**
 * The settlement page - what gets paid, and whether the endpoints agree.
 *
 * Every figure comes from src/insights/settlement.mjs; this file only lays it
 * out. A figure nobody measured is a dash, and a panel with nothing to say
 * says so in words.
 */

import { html } from '../html.mjs';
import { money, pct, utcClock, humanAge, DASH } from '../format.mjs';
import { formatUsdSigned } from '../../money.mjs';
import { shell } from './shell.mjs';
import { conclusion } from './parts.mjs';

const signed = (v) => money(v, { signed: true });

function card(label, value, note, kind = '') {
  return html`<article class="metric-card ${kind}"><div class="metric-label">${label}</div><div class="metric-value">${value}</div><div class="metric-note">${note}</div></article>`;
}

function panel(title, headline, inner = null) {
  return html`<section class="panel"><div class="section-heading"><div><h2>${title}</h2>${conclusion(headline)}</div></div>${inner}</section>`;
}

function figures(rows) {
  return html`<div class="scroll"><table><tbody>${rows.map(([label, value]) => html`<tr><td class="label-cell">${label}</td><td>${value}</td></tr>`)}</tbody></table></div>`;
}

const diffCell = (v) => (v === null || v === undefined ? DASH : Math.abs(v) <= 0.01 ? '$0.00' : formatUsdSigned(v));
const status = (ok) => (ok === null ? html`<span class="dim">nothing to compare</span>` : ok ? html`<span class="good">reconciles</span>` : html`<span class="warn">differs</span>`);
const freshWord = (f) => (f.stale === null ? html`<span class="dim">never read</span>` : f.stale ? html`<span class="warn">stale</span>` : html`<span class="good">fresh</span>`);

/**
 * @param {{ state: object, model?: object, settlement: object, health: object }} args
 */
export function renderSettlement({ state, settlement: s, health: h }) {
  const rateNote = s.rate === null || s.rate === undefined ? DASH
    : `${pct(s.rate * 100, 1)} ${s.rateSource === 'derived' ? 'derived from position' : 'configured'}`;

  const body = html`<div class="page-heading"><div><div class="eyebrow">WHAT GETS PAID</div><h1>Settlement<span>.</span></h1>
      <p>The month as Stake will settle it, how far luck has moved it, and whether the endpoints agree about it.</p></div></div>

  <div class="metric-grid">
    ${card('Position', signed(s.position), 'balance endpoint, carry included', 'accent')}
    ${card('Settled if the month ended now', signed(s.settledNow), rateNote)}
    ${card('Luck gap', signed(s.gap), html`expected this month ${signed(s.expectedMonth)}`)}
    ${card('Carried forward', signed(s.carry), 'from earlier months')}
  </div>

  ${panel('Luck', s.headlines.gap, figures([
    ['Position', signed(s.position)],
    ['Expected (balance endpoint, carry included)', signed(s.balanceExpected)],
    ['Expected this month (carry removed)', signed(s.expectedMonth)],
    ['Luck gap', signed(s.gap)],
  ]))}

  ${panel('What would be settled', s.headlines.settled, figures([
    ['Gross house win this month (sum of roster profit)', signed(s.grossMonth)],
    ['Share rate', rateNote],
    ['Studio share this month', signed(s.studioMonth)],
    ['Carried forward', signed(s.carry)],
    ['Settled if the month ended now', signed(s.settledNow)],
    ['Position minus settled (residual)', signed(s.residual)],
    ['Paid if settled now', s.paidIfSettled === null ? DASH : money(s.paidIfSettled)],
  ]))}

  ${panel('Where the month is heading', s.headlines.projection, s.projection ? figures([
    ['Median complete day', signed(s.projection.medianDay)],
    ['Complete days it is taken from', String(s.projection.basis)],
    ['Full days left', String(s.projection.daysLeft)],
    ['Studio P/L at month end', signed(s.projection.studioMonthEnd)],
    ['Settled at month end, after carry', signed(s.projection.settledMonthEnd)],
  ]) : null)}

  ${panel('Today against yesterday', s.headlines.today, figures([
    ['Today since 00:00Z', signed(s.today)],
    ['Yesterday, the same hours', signed(s.yesterdaySlice)],
  ]))}

  <section class="panel"><div class="section-heading"><div><h2>Do the endpoints agree?</h2>${conclusion(h.headline)}</div>
      <span class="tag">${h.rows.length} games</span></div>
    <div class="scroll"><table><thead><tr><th>Game</th><th>/stats profit</th><th>/games profit</th><th>Difference</th><th>Per-mode sum</th><th>Difference</th><th>Status</th></tr></thead>
      <tbody>${h.rows.length ? h.rows.map((r) => html`<tr><td>${r.name}</td><td>${signed(r.rosterProfit)}</td><td>${signed(r.catalogueProfit)}</td>
        <td>${diffCell(r.diffUsd)}</td><td>${signed(r.modesProfit)}</td><td>${diffCell(r.modesDiffUsd)}</td><td>${status(r.ok)}</td></tr>`)
        : html`<tr><td colspan="7" class="empty">No roster yet.</td></tr>`}</tbody></table></div>
    <p class="dim">Gross USD. The three responses are fetched seconds apart in the same tick, so a small gap on a busy game can be timing; one that persists across ticks is not.</p></section>

  <section class="panel"><div class="section-heading"><div><h2>Freshness</h2>
      <p>When each endpoint was last read successfully. Stale means older than three of its own polls.</p></div></div>
    <div class="scroll"><table><thead><tr><th>Endpoint</th><th>Last read</th><th>Age</th><th>Status</th></tr></thead>
      <tbody>${h.freshness.length ? h.freshness.map((f) => html`<tr><td>${f.endpoint}</td><td>${f.ts === null ? DASH : utcClock(f.ts)}</td>
        <td>${f.ageMs === null ? DASH : humanAge(f.ageMs)}</td><td>${freshWord(f)}</td></tr>`)
        : html`<tr><td colspan="4" class="empty">No endpoint has been read yet.</td></tr>`}</tbody></table></div></section>

  <section class="panel definitions"><div class="section-heading"><h2>How these are counted</h2></div>
    <div class="definition-grid">
      <div><h3>Settled against position</h3><p>Stake settles on the share rate times the summed roster profit, plus carry - not on the balance endpoint's position. The two usually agree to the cent; in August 2026 they differed by $48, and the settlement followed the roster. The residual above is that difference, live.</p></div>
      <div><h3>Carry</h3><p>A month that settles negative pays nothing and carries its deficit into the next. The balance endpoint folds carry into both position and its expectation, so this month's expectation is its expectedProfit minus carry.</p></div>
      <div><h3>The two rates</h3><p>The studio's share is 10% of gross gaming revenue. The expectation uses 7.5% of turnover times the house edge. The share rate shown is derived from position when there is enough money to trust it, and snaps to 10% or 7.5% when within half a point.</p></div>
      <div><h3>The luck gap</h3><p>Position against the balance endpoint's own expectation. Negative means players are ahead of the math so far this month; at this studio's volume a gap of thousands can be ordinary variance.</p></div>
    </div></section>`;

  return shell({ state, body, active: 'settlement', title: 'Settlement' });
}
