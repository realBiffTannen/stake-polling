/**
 * The roster page - the terminal dashboard's panes, in the same order,
 * coarsest first: what might be happening, what the roster did, then the raw
 * findings underneath.
 */

import { html } from '../html.mjs';
import { usd, usdSigned, int, intSigned, pct, utcHm, money, blank, DASH } from '../format.mjs';
import { sparkline } from '../svg.mjs';
import { tiles, dataTable, findingsList, eventsList, actionLog, chartPanel } from './parts.mjs';
import { dayTotals, rosterTotals } from '../../tui/state.mjs';
import { msToNextBoundary, periodMs } from '../../poll/schedule.mjs';
import { fill } from '../fills.mjs';
import { liveStream } from '../../insights/series.mjs';
import { interactiveChart, emptyChart, liveData, latestReading, ACCENTS } from '../charts/interactive.mjs';

/** How far back the live strips reach: hours of polls, not a day of them. */
export const LIVE_HOURS = 3;

export const SORTS = ['turnover', 'lifetimeTurnover', 'dTurnover', 'profit', 'count', 'name'];

export function renderOverview(state, { sort = 'turnover', panes = true } = {}) {
  const key = SORTS.includes(sort) ? sort : 'turnover';
  const rows = sorted(state.rows ?? [], key);
  const totals = rosterTotals(state);
  const day = dayTotals(state);
  const rate = state.rateLabel ?? '/m';

  const columns = [
    { key: 'name', title: 'GAME', cell: (r) => html`<a href="/game/${r.name}">${r.name}</a>${r.pending ? html` <span class="badge">live, nothing yet</span>` : null}` },
    { key: 'online', title: 'NOW', cell: (r) => int(r.online) },
    { key: 'count', title: 'BETS', cell: (r) => int(r.count) },
    { key: 'dCount', title: `BETS${rate}`, cell: (r) => intSigned(r.dCount) },
    { key: 'unique', title: 'PLAYERS', cell: (r) => int(r.unique) },
    { key: 'turnover', title: 'TURNOVER', cell: (r) => usd(r.turnoverUsd) },
    { key: 'dTurnover', title: `TURN${rate}`, cell: (r) => usdSigned(r.dTurnoverUsd) },
    { key: 'profit', title: 'PROFIT', cell: (r) => money(r.profitUsd) },
    { key: 'dProfit', title: `PROFIT${rate}`, cell: (r) => money(r.dProfitUsd, { signed: true }) },
    { key: 'dayProfit', title: 'DAY PROFIT', cell: (r) => money(r.dayProfitUsd, { signed: true }) },
    { key: 'dayTurnover', title: 'DAY TURN', cell: (r) => usd(r.dayTurnoverUsd) },
    // A slower horizon than every other money column here, and read on its
    // own hourly cadence - a game missing from the last lifetime snapshot is
    // a dash, not a zero.
    { key: 'lifetimeTurnover', title: 'LIFETIME TURN', cell: (r) => usd(r.lifetimeTurnoverUsd) },
    { key: 'expected', title: 'EXPECTED', cell: (r) => usd(r.expectedUsd) },
    { key: 'rtp', title: 'RTP', cell: (r) => pct(r.rtp) },
    { key: 'spark', title: 'TREND', cell: (r) => (r.spark?.length ? sparkline(r.spark) : DASH) },
  ];

  const since = utcHm(state.dayFrom);
  const partial = state.dayCoverage?.partial
    ? html` <span class="warn">(partial - trail starts ${state.dayCoverage.from ? utcHm(state.dayCoverage.from) : '?'})</span>`
    : null;

  // rosterTotals() now returns null itself when no row holds a reading (a
  // brand-new roster that is nothing but pending rows), so this guard is
  // belt-and-braces: it keeps that case reading "-" rather than a confidently
  // wrong $0.00 even if the sum ever goes back to treating null as zero - the
  // same rule the per-row cells already follow.
  const turnoverMeasured = hasReading(rows, 'turnoverUsd');
  const profitMeasured = hasReading(rows, 'profitUsd');

  return html`
<section class="panel">
  <div class="panel-head"><h2>roster</h2>${pollCountdown(state)}</div>
  ${tiles([
    { label: lifetimeLabel(state), value: usd(state.lifetime?.turnover) },
    // Labelled "this month" now that a lifetime tile sits beside it: the
    // roster endpoint reports month-to-date, and an unqualified "turnover"
    // next to a lifetime figure reads as the same horizon.
    { label: 'turnover this month', value: turnoverMeasured ? usd(totals.turnover) : DASH },
    { label: 'profit this month', value: profitMeasured ? usdSigned(totals.profit) : DASH, tone: blank(totals.profit) ? undefined : (totals.profit < 0 ? 'bad' : 'good') },
    { label: `turnover since ${since}`, value: usd(day.turnover) },
    { label: `profit since ${since}`, value: usdSigned(day.profit), tone: blank(day.profit) ? undefined : (day.profit < 0 ? 'bad' : 'good') },
    { label: `bets since ${since}`, value: int(day.count) },
  ])}
  <p class="dim">the accounting day rolls at ${since}${partial} - the collector polls ${cadenceWords(state)}, on the clock</p>
  ${dataTable({ columns, rows })}
  <p class="dim">sort: ${SORTS.map((s) => html`<a href="?sort=${s}">${s === key ? html`<b>${s}</b>` : s}</a> `)}
    - <a href="?panes=${panes ? '0' : '1'}">${panes ? 'hide' : 'show'} panes</a></p>
</section>
${livePanel(state)}
${panes ? html`
<section class="panel"><h2>possible events</h2>
  <p class="dim">hypotheses, not conclusions - the findings they were built from are below</p>
  ${eventsList(state.events)}</section>
<section class="panel"><h2>running action (${state.summaryMinutes ?? state.pollMinutes} min)</h2>
  ${actionLog(state.summaries, state.money)}</section>
<section class="panel"><h2>findings</h2>${findingsList(state.alerts)}</section>` : null}`;
}

/**
 * Players online and bets, poll by poll, as two strips that scroll with the
 * clock. The figures only move when the collector polls, so the strips say
 * "per poll" and take each new poll as the live refresh brings it; two
 * measures, so two strips, never one axis.
 */
function livePanel(state) {
  const now = Number(state.now) || Date.now();
  const slotMs = periodMs(state.pollMinutes);
  const stream = liveStream({ online: state.onlineTrail ?? [], games: state.gameTrails ?? {}, now, hours: LIVE_HOURS, slotMs });
  const strip = ({ id, points, label, title, colour, empty }) => html`<div class="live-strip">
    <div class="live-head"><span>${label}<em>per poll</em></span><b>${latestReading(points) ?? DASH}</b></div>
    ${points.some((p) => p.value !== null)
      ? interactiveChart({ id, kind: 'live', title, data: liveData(points, { label, colour, slotMs, hours: LIVE_HOURS }), note: 'The scrolling strip needs JavaScript.' })
      : emptyChart(empty)}</div>`;
  return chartPanel('Live stream', stream.headline, html`<div class="live-strips">
    ${strip({ id: 'live-online', points: stream.online, label: 'Players online', colour: ACCENTS.online,
      title: `Players online at each poll, last ${LIVE_HOURS} hours`, empty: `No poll has read players online in the last ${LIVE_HOURS} hours.` })}
    ${strip({ id: 'live-bets', points: stream.bets, label: 'Bets', colour: ACCENTS.turnover,
      title: `Bets in each poll interval, last ${LIVE_HOURS} hours`, empty: `No two polls in a row have counted bets in the last ${LIVE_HOURS} hours.` })}</div>`,
    `One point per poll, ${cadenceWords(state)}, over the last ${LIVE_HOURS} hours. Bets are each interval's change in every game's count, summed. A missed poll breaks the line.`);
}

/**
 * When the collector next polls, and how long that is from now.
 *
 * The figure comes from the poller's own msToNextBoundary(), not from a
 * second definition of "the next minute": the poller sleeps to a boundary of
 * the epoch grid, so the boundary this names is the tick that will actually
 * run, and the two cannot drift apart.
 *
 * The countdown is served as a DURATION rather than a wall-clock instant, and
 * app.js counts it down against its own elapsed time. An absolute epoch
 * timestamp would be compared against the BROWSER's clock, and a laptop a
 * minute out would show a countdown a minute wrong on a correct page.
 */
function pollCountdown(state) {
  return fill('countdown', countdownHtml(Number(state.now) || Date.now(), state.pollMinutes));
}

/**
 * The countdown markup for `now`. The server calls this again on every serve
 * of a cached page (the `countdown` fill), so the duration app.js counts down
 * from is always measured from the moment the page left the server.
 */
export function countdownHtml(now, pollMinutes) {
  const minutes = Number(pollMinutes) || 1;
  const ms = msToNextBoundary(now, minutes);
  return String(html`<span class="poll-countdown" data-next-poll-ms="${ms}" data-period-ms="${periodMs(minutes)}">next poll in <b>${countdownLabel(ms)}</b></span>`);
}

/** m:ss, so a one-minute period reads 0:47 rather than 47000. */
export function countdownLabel(ms) {
  if (blank(ms)) return DASH;
  const seconds = Math.max(0, Math.ceil(Number(ms) / 1000));
  return `${Math.floor(seconds / 60)}:${String(seconds % 60).padStart(2, '0')}`;
}

function cadenceWords(state) {
  const minutes = periodMs(state.pollMinutes) / 60000;
  return minutes === 1 ? 'every minute' : `every ${minutes} minutes`;
}

/**
 * The lifetime tile names the date it counts from. Without it the figure is
 * unreadable: "lifetime" is whenever this studio started tracking, which is
 * configuration (`lifetimeStart`), not the studio's first ever bet.
 */
function lifetimeLabel(state) {
  const from = state.lifetime?.from;
  return from ? `lifetime turnover since ${from}` : 'lifetime turnover';
}

/** Whether at least one row holds an actual reading for `field`, as opposed
 * to every row being unmeasured (null/undefined/non-finite). */
function hasReading(rows, field) {
  return rows.some((r) => r[field] !== null && r[field] !== undefined && Number.isFinite(Number(r[field])));
}

export function sorted(rows, key) {
  const copy = [...rows];
  if (key === 'name') return copy.sort((a, b) => String(a.name).localeCompare(String(b.name)));
  // Descending, and a null sorts last rather than as a zero - a game with no
  // reading has not earned a place among the quiet ones.
  return copy.sort((a, b) => rank(b[key]) - rank(a[key]));
}

function rank(value) {
  return value === null || value === undefined || !Number.isFinite(Number(value)) ? -Infinity : Number(value);
}
