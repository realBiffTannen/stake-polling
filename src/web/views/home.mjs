/**
 * The landing page - today, since 00:00:00Z, in pictures.
 *
 * The UTC day is the one the Engine studio dashboard reports "today" over, so
 * the two can be read side by side. Everything on it is drawn by
 * views/today.mjs from insights/today.mjs; this page adds only the month, as
 * one strip at the foot. The per-game month table, the catalogue and the
 * titles not yet live are the Games page's (views/games.mjs).
 */

import { html } from '../html.mjs';
import { int, usd, money } from '../format.mjs';
import { shell } from './shell.mjs';
import { totalsOf } from '../../tui/state.mjs';
import { renderToday } from './today.mjs';

function stat(label, value) {
  return html`<div class="month-stat"><span>${label}</span><b>${value}</b></div>`;
}

export function renderHome(state) {
  const total = totalsOf(state.rows ?? []);
  const body = html`${renderToday(state)}
  <section class="panel month-strip"><h2>This month</h2>
    ${stat('Studio P/L', money(total.profitUsd, { signed: true }))}
    ${stat('Turnover', usd(total.turnoverUsd))}
    ${stat('Bets', int(total.count))}
    <a class="month-link" href="/games">Every game →</a></section>`;
  return shell({ state, body, active: 'overview', title: 'Overview' });
}
