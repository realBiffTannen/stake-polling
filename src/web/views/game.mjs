/**
 * The game page - captured math beside what players actually did.
 *
 * A game can be live with no captured math at all (lunar-blossom was, until
 * its v22 capture on 2026-09-19). That
 * is a real, distinct state - not an error - so the math card says so plainly
 * rather than rendering blank or throwing. Every other section on this page
 * still renders from the observed figures alone.
 */

import { html } from '../html.mjs';
import { int, pct, usd, money, DASH } from '../format.mjs';
import { toUsd, toShareUsd } from '../../money.mjs';
import { shell } from './shell.mjs';
import { gameVerdicts } from '../../insights/verdicts.mjs';
import { lineChart } from '../charts/line.mjs';
import { MODE_COLOURS } from '../svg.mjs';
import { totalsOf } from '../../tui/state.mjs';
import { spanPicker, chartPanel } from './parts.mjs';
import { SPANS, spanStart, modeRowsOver } from '../../insights/span.mjs';
import { pnlByMode, modeMix, modeBands, bandHeadline, hourlySeries, pnlTrend, betsTrend } from '../../insights/conclusions.mjs';
import { hbars, pairedBars, bandChart } from '../charts/hbars.mjs';
import { columns } from '../charts/columns.mjs';
import { formatUsdSigned } from '../../money.mjs';
import { modeHold, buyEconomics, playerWorth, quietShare, stayEstimate, betLadder } from '../../insights/economics.mjs';
import { tape, tapeHeadline, notable, launchChecks, checksHeadline } from '../../insights/tape.mjs';
import { blank } from '../format.mjs';
import { gameTrendPanels } from './trend-panels.mjs';

// Shared with mode.mjs, so the two pages colour the same severities the same
// way rather than each keeping its own copy of this mapping.
export const severityClass = { crit: 'bad', warn: 'warn', info: 'dim' };

function mathCard(math) {
  if (!math) {
    return html`<section class="panel"><div class="section-heading"><h2>Captured math</h2></div>
      <p class="notice warning">No captured math model for this game. Observed figures below stand on their own; nothing is compared against a model, and no drift or convergence verdict can be given.</p></section>`;
  }
  return html`<section class="panel"><div class="section-heading"><div><h2>Captured math</h2>
      <p>Version ${math.version} · house edge ${pct(math.edge * 100)} · RTP ${pct((1 - math.edge) * 100)}</p></div>
      <span class="tag">${math.starLevel ? `${'★'.repeat(math.starLevel)} validated` : 'captured'}</span></div>
    <div class="pulse-grid">
      <div><span>Base volatility</span><b>${math.baseVolatility} ${math.volatilityClass}</b></div>
      <div><span>Max win</span><b>${int(math.maxWin)}x</b></div>
      <div><span>Modes</span><b>${int(Object.keys(math.modes ?? {}).length)}</b></div>
      <div><span>Cost ladder</span><b>${(math.costLadder ?? []).map(c => `${c}x`).join(' / ')}</b></div>
    </div>
    ${math.compliance ? html`<p class="muted">Compliance: 2★ ${math.compliance.passes2Star ? 'passes' : 'FAILS'} · 3★ ${math.compliance.passes3Star ? 'passes' : 'FAILS'}${math.compliance.bindingConstraint ? ` · binding constraint: ${math.compliance.bindingConstraint}` : ''}</p>` : null}</section>`;
}

function verdictList(verdicts) {
  if (!verdicts.length) return html`<p class="dim">Nothing to conclude yet - no captured model, or nothing measured.</p>`;
  return html`<ul class="list">${verdicts.map(v => html`<li class="${severityClass[v.severity] ?? ''}">
    <div>${v.message}</div>
    <div class="dim">${v.kind} · n=${v.n === null || v.n === undefined ? DASH : int(v.n)} · ${v.readable === null ? 'no model to compare' : v.readable ? 'readable at this sample size' : 'not readable yet'}</div></li>`)}</ul>`;
}

/**
 * The captured modes of a title nothing has played, shaped like per-mode
 * response rows with every observed figure absent. Only ever used for a title
 * the catalogue says is not live: a LIVE game with an empty per-mode response
 * is an anomaly worth seeing as an empty table, not something to paper over
 * with the model.
 */
function capturedOnlyRows(math) {
  return Object.entries(math?.modes ?? {}).map(([mode, m]) => ({ mode, cost: m?.cost ?? null, count: null, turnover: null,
    profit: null, rtp: null, avgBet: null, capturedOnly: true }));
}

function modeTable({ slug, rows, math, state }) {
  const totalCount = rows.reduce((a, r) => a + (Number(r.count) || 0), 0);
  const played = rows.filter(r => !r.capturedOnly);
  // Summed per field over the modes that measured it, exactly as the roster
  // totals are - a mode with no profit reading is left out of the profit sum
  // rather than counted as a confident zero.
  const total = totalsOf(played.map(r => ({ count: r.count, turnoverUsd: toUsd(r.turnover, state.money),
    profitUsd: toShareUsd(r.profit, state.money.profitShare, state.money) })));
  return html`<div class="scroll"><table><thead><tr><th>Mode</th><th>Cost</th><th>Bets</th><th>Share of bets</th><th>Turnover</th><th>Studio P/L</th><th>Deployed RTP</th><th>Effective RTP</th><th>Normalized RTP</th><th>Captured RTP</th><th>Avg bet</th></tr></thead>
      <tbody>${rows.map(r => html`<tr>
        <td>${r.capturedOnly ? r.mode : html`<a class="game-link" href="/game/${encodeURIComponent(slug)}/mode/${encodeURIComponent(r.mode)}">${r.mode}</a>`}</td>
        <td>${r.cost === null || r.cost === undefined ? DASH : `${r.cost}x`}</td>
        <td>${int(r.count)}</td>
        <td>${totalCount ? pct((Number(r.count) || 0) / totalCount * 100, 1) : DASH}</td>
        <td>${usd(toUsd(r.turnover, state.money))}</td>
        <td>${money(toShareUsd(r.profit, state.money.profitShare, state.money), { signed: true })}</td>
        <td>${pct(r.rtp === null || r.rtp === undefined ? null : Number(r.rtp) * 100)}</td>
        <td>${pct(blank(r.effectiveRtp) ? null : Number(r.effectiveRtp) * 100)}</td>
        <td>${pct(blank(r.normalizedRtp) ? null : Number(r.normalizedRtp) * 100)}</td>
        <td>${math?.modes?.[r.mode] ? pct(math.modes[r.mode].rtp * 100) : DASH}</td>
        <td>${usd(r.avgBet)}</td></tr>`)}</tbody>
      ${played.length ? html`<tfoot><tr><td>Total</td><td></td><td>${int(total.count)}</td><td>${totalCount ? pct(100, 1) : DASH}</td>
        <td>${usd(total.turnoverUsd)}</td><td>${money(total.profitUsd, { signed: true })}</td><td></td><td></td><td></td><td></td><td></td></tr></tfoot>` : null}</table></div>`;
}

/**
 * @param {{ slug: string, model: object, state: object, math: object|null, modeRows?: object[], modeDays?: object }} args
 */
export function renderGamePage({ slug, model, state, math, modeRows = [], modeDays = {}, span = 'month', online = null }) {
  const title = (state.titles ?? []).find(t => t.slug === slug) ?? null;
  // Strictly the catalogue's own word. A game with no catalogue entry at all
  // renders as it always did - live - rather than being guessed dark.
  const notLive = title?.isLive === false;
  const name = model.options.find(g => g.slug === slug)?.name ?? title?.name ?? slug;
  const game = model.games.find(g => g.slug === slug) ?? {};
  const verdicts = gameVerdicts({ rows: modeRows, game: math, money: state.money });
  const now = Number(state.now) || Date.now();
  const today = new Date(now).toISOString().slice(0, 10);
  const from = notLive ? null : spanStart(span, now);
  // The picker re-scopes the modes to the trail; a title that is not live has
  // no trail, and the month response is all it has (or its captured model).
  const rows = notLive ? (modeRows.length ? modeRows : capturedOnlyRows(math))
    : from === null ? modeRows : modeRowsOver(state.modeTrails?.[slug], from, modeRows);
  const dates = Object.keys(modeDays).sort();
  const modes = [...new Set(modeRows.map(r => r.mode))];

  const heading = html`<div class="page-heading"><div><div class="eyebrow">GAME</div><h1>${name}<span>.</span></h1>
      <p>${notLive ? 'Captured math for a title that is not live yet.' : 'Bet modes first, then captured math against observed play. Month-to-date figures run from the 1st at 00:00Z.'}</p></div>
    ${notLive ? null : html`<a class="button secondary" href="/game/${encodeURIComponent(slug)}/buckets">Bucket cadence ↗</a>
    <a class="button secondary" href="/insights?game=${encodeURIComponent(slug)}">Player insights ↗</a>
    <a class="button secondary" href="/export/log.csv?${new URLSearchParams({ source: `ts:${slug}`, date: today })}">Raw CSV today ↓</a>
    <a class="button secondary" href="/export/log.csv?${new URLSearchParams({ source: `ts:${slug}:modes`, date: today })}">Modes CSV today ↓</a>`}</div>`;

  const modesPanel = html`<section class="panel"><div class="section-heading"><div><h2>Bet modes</h2>
      <p>${notLive ? 'The modes in the captured math model. Nothing has been played, so every observed figure is a dash.'
        : span === 'month' ? 'Month-to-date per mode, from the game endpoint. One bet is one game played. Player identity is not reported per mode.'
          : `Per mode ${SPANS[span].words === 'today' ? 'since 00:00:00Z today' : 'over the last 24 hours'}, from the collector's own trail. One bet is one game played; average bet and the effective/normalized RTPs are only reported for the month.`}</p></div>
      <span class="tag">${rows.length} modes</span></div>
    ${notLive ? null : html`<div class="scope-line"><span>${spanPicker(`/game/${encodeURIComponent(slug)}`, span)}</span></div>`}
    ${modeTable({ slug, rows, math, state })}</section>`;

  if (notLive) {
    const body = html`${heading}
  <div class="notice warning">${name} is not live${title.published === false ? ' and not published' : ''}. The API reports no play data for it${title.approval ? html` - approval stage: <b>${title.approval}</b>` : null}.</div>
  ${modesPanel}
  ${mathCard(math)}`;
    return shell({ state, body, active: 'overview', title: name });
  }

  const pnl = pnlByMode(rows, state.money);
  const mix = modeMix(rows);
  const bands = modeBands(rows, math);
  const hourSpan = span === 'today' ? { now, from } : { now, hours: 24 };
  const trail = state.gameTrails?.[slug];
  const profitHours = hourlySeries(trail ? [trail] : [], 'profit', hourSpan);
  const trend = pnlTrend(profitHours, state.money, { span: span === 'today' ? 'Today' : 'Last 24h' });
  const betHours = hourlySeries(trail ? [trail] : [], 'count', hourSpan);
  const hh = (ts) => new Date(ts).toISOString().slice(11, 13);
  const pct1 = (v) => `${Number(v).toFixed(1)}%`;

  // The derived data points, all from what the collector already polls.
  const hold = modeHold(rows);
  const econ = buyEconomics(rows, state.money);
  const betStats = state.raw?.perGame?.[slug]?.data?.betStats;
  const ladder = Array.isArray(betStats) && betStats.length ? betLadder(betStats) : null;
  const rosterRow = (state.rows ?? []).find(r => r.name === slug) ?? {};
  const worth = playerWorth(rosterRow, state.money);
  const quiet = quietShare(trail ?? []);
  const stay = stayEstimate(trail ?? []);
  const costOf = (_, mode) => modeRows.find(r => r.mode === mode)?.cost ?? null;
  const events = notable(tape({ gameTrails: { [slug]: trail ?? [] }, modeTrails: { [slug]: state.modeTrails?.[slug] ?? [] },
    labels: { [slug]: name }, now, money: state.money }), costOf);
  const studio = totalsOf(state.rows ?? []);
  const checks = launchChecks({ modeRows, betStats, gameTrail: trail ?? [], now, money: state.money,
    studioAvgBetUsd: studio.count > 0 && !blank(studio.turnoverUsd) ? studio.turnoverUsd / studio.count : null, studioTurnoverUsd: studio.turnoverUsd });
  const figure = (label, value) => html`<div><span>${label}</span><b>${value}</b></div>`;
  const usdOrDash = (v) => (blank(v) ? DASH : usd(v));
  const signedOrDash = (v) => (blank(v) ? DASH : formatUsdSigned(v));

  const body = html`${heading}

  ${modesPanel}

  ${chartPanel('Where the P/L came from', pnl.headline, hbars({ rows: pnl.bars, tone: 'sign', format: formatUsdSigned, title: 'Studio P/L by mode' }))}

  ${chartPanel('Bets against turnover, by mode', mix.headline, pairedBars({ rows: mix.rows.map(r => ({ label: r.label, a: r.bets, b: r.turnover })),
    names: ['share of bets', 'share of turnover'], format: pct1, title: 'Share of bets and of turnover by mode' }),
    'A mode that takes a small share of bets and a large share of turnover is where the money - and the variance - sits.')}

  ${chartPanel('Luck or fault, mode by mode', bands.length ? bandHeadline(bands, 'modes') : null,
    bandChart({ rows: bands, format: (v) => `${(Number(v) * 100).toFixed(1)}%`, title: 'House margin by mode against its captured edge' }),
    'Dot: observed house margin. Tick: the captured edge. Shaded: ±2 standard errors from the captured sigma at this many bets.')}

  ${chartPanel('Running P/L, hour by hour', trend.headline, lineChart({ labels: profitHours.map(s => hh(s.from)), tipLabels: profitHours.map(s => `${hh(s.from)}:00Z`),
    series: [{ name: 'running studio P/L', colour: '#4a8ff5', values: trend.cumulative }], format: formatUsdSigned, title: `Running studio P/L for ${name}` }))}

  ${chartPanel('P/L per hour', trend.hourHeadline, columns({ rows: profitHours.map((s, i) => ({ label: hh(s.from), tipLabel: `${hh(s.from)}:00Z`, value: trend.hourly[i] })),
    tone: 'sign', format: formatUsdSigned, title: `Studio P/L per hour for ${name}` }))}

  ${chartPanel('Bets per hour', betsTrend(betHours).headline, columns({ rows: betHours.map(s => ({ label: hh(s.from), tipLabel: `${hh(s.from)}:00Z`, value: s.value })),
    tone: 'neutral', format: (v) => int(v), title: `Bets per hour for ${name}` }))}

  ${chartPanel('Hold against theory, mode by mode', hold.headline,
    hbars({ rows: hold.rows.map(r => ({ key: r.mode, label: r.mode, value: r.contributionPp })), tone: 'sign',
      format: (v) => `${v > 0 ? '+' : ''}${Number(v).toFixed(1)}pp`, title: 'Contribution to the realised-minus-theoretical hold gap' }),
    'Theoretical hold is one minus each mode\'s deployed RTP, weighted by its turnover. A bar is how many points of the game\'s gap that mode explains; the bars add up to the gap.')}

  ${chartPanel('Buy economics', econ.headline, html`<div class="pulse-grid">
      ${figure('Buy conversion', blank(econ.conversion) ? DASH : pct(econ.conversion * 100, 1))}
      ${figure('Buys\' share of turnover', blank(econ.buyTurnoverShare) ? DASH : pct(econ.buyTurnoverShare * 100, 1))}
      ${figure('Average buy', usdOrDash(econ.avgBuyUsd))}
      ${figure('Average base bet', usdOrDash(econ.avgBaseBetUsd))}</div>
    ${econ.tiers?.length ? html`<div class="scroll"><table><thead><tr><th>Mode</th><th>Cost</th><th>Average price paid</th></tr></thead>
      <tbody>${econ.tiers.map(t => html`<tr><td class="label-cell">${t.mode}</td><td>${blank(t.cost) ? DASH : `${t.cost}x`}</td><td>${usdOrDash(t.priceUsd)}</td></tr>`)}</tbody></table></div>` : null}`)}

  ${chartPanel('Bet-size ladder', ladder?.headline ?? null, ladder
    ? pairedBars({ rows: ladder.rows.map(r => ({ label: `$${Number(r.costUSD).toFixed(2)}`, a: blank(r.betShare) ? null : r.betShare * 100, b: blank(r.turnoverShare) ? null : r.turnoverShare * 100 })),
      names: ['share of bets', 'share of turnover'], format: pct1, title: 'Bets and turnover by base bet size' })
    : html`<p class="dim">No bet-size data for this game.</p>`,
    'Lifetime - this does not reset with the month - and bucketed by BASE bet: a 250x buy at $2 counts as a $2 bet.')}

  ${chartPanel('Players and sessions', [worth.headline, stay.headline, quiet.headline].filter(Boolean).join(' ') || null, html`<div class="pulse-grid">
      ${figure('Turnover per player', usdOrDash(worth.turnoverPerPlayer))}
      ${figure('Rounds per player', blank(worth.roundsPerPlayer) ? DASH : int(worth.roundsPerPlayer))}
      ${figure('Studio P/L per player', signedOrDash(worth.studioPerPlayer))}
      ${figure('Studio P/L per 1,000 rounds', signedOrDash(worth.studioPer1kRounds))}
      ${figure('Average stay', blank(stay.minutes) ? DASH : `${Math.round(stay.minutes)} min`)}
      ${figure('Turnover with ≤2 online', blank(quiet.share) ? DASH : pct(quiet.share * 100, 0))}</div>`,
    'Players are month-to-date unique per game. Stay is Little\'s law over the trail: players online divided by the rate new players arrive.')}

  ${chartPanel('The tape', tapeHeadline(events), events.length ? html`<ul class="list">${events.slice(0, 40).map(e => html`<li class="${e.kind === 'payout_spike' ? 'warn' : ''}">
      <div>${e.message}</div><div class="dim">${new Date(e.ts).toISOString().slice(11, 16)}Z · ${e.kind.replace('_', ' ')}</div></li>`)}</ul>
      ${events.length > 40 ? html`<p class="dim">${int(events.length - 40)} more in the poll log.</p>` : null}` : null,
    'Last 24h. Big stake: $500+ in one poll interval at $10+ a spin. Payout spike: a player won $250+ net and 5x+ the stake. House take: the house kept $250+. Exact stake: one feature buy alone in an interval, so its price is exact.')}

  ${chartPanel('Launch checks', checksHeadline(checks), html`<ul class="list">${checks.map(c => html`<li class="${c.status === 'flag' ? 'bad' : c.status === 'unknown' ? 'dim' : ''}">
      <div><b>${c.check.replace(/_/g, ' ')}</b> <span class="tag">${c.status}</span></div><div>${c.message}</div></li>`)}</ul>`)}

  <div class="metric-grid">
    <article class="metric-card accent"><div class="metric-label">Players</div><div class="metric-value">${int(game.players)}</div><div class="metric-note">selected period</div></article>
    <article class="metric-card"><div class="metric-label">Returning</div><div class="metric-value">${int(game.returningPlayers)}</div><div class="metric-note">new: ${int(game.newPlayers)}</div></article>
    <article class="metric-card"><div class="metric-label">Turnover</div><div class="metric-value">${usd(game.turnover)}</div><div class="metric-note">${int(game.count)} bets</div></article>
    <article class="metric-card"><div class="metric-label">Studio profit</div><div class="metric-value">${money(game.profit, { signed: true })}</div><div class="metric-note">observed RTP ${pct(game.rtp)}</div></article>
  </div>

  ${mathCard(math)}

  <section class="panel"><div class="section-heading"><div><h2>What the math says about the play</h2>
      <p>Each conclusion carries its sample size and whether it can be read at that size.</p></div></div>
    ${verdictList(verdicts)}</section>

  <section class="panel chart-panel"><div class="section-heading"><div><h2>Players, day by day</h2>
      <p>Daily players, new to game, and returning.</p></div></div>
    ${lineChart({
      labels: model.daily.map(r => r.date.slice(5)), tipLabels: model.daily.map(r => r.date),
      series: [
        { name: 'players', colour: MODE_COLOURS[5], values: model.daily.map(r => r.players) },
        { name: 'new', colour: MODE_COLOURS[4], values: model.daily.map(r => r.newPlayers) },
        { name: 'returning', colour: MODE_COLOURS[2], values: model.daily.map(r => r.returningPlayers) },
      ],
      title: `Daily players for ${name}`,
    })}</section>

  ${dates.length ? html`<section class="panel chart-panel"><div class="section-heading"><div><h2>Turnover by mode, day by day</h2>
      <p>Accumulated from the collector's own five-minute trail; history begins when this rollup was first written.</p></div></div>
    ${lineChart({
      labels: dates.map(d => d.slice(5)), tipLabels: dates,
      series: modes.map((mode, i) => ({ name: mode, colour: MODE_COLOURS[i % MODE_COLOURS.length],
        values: dates.map(d => { const v = modeDays[d]?.[mode]?.turnover; return v === undefined ? null : toUsd(v, state.money); }) })),
      title: `Daily turnover by mode for ${name}`,
    })}</section>` : null}

  <div class="page-heading"><div><div class="eyebrow">OVER TIME</div><h2>${name}: trends</h2>
    <p>Players online every poll, the last 30 days of play, and when in the day it happens.</p></div></div>
  ${gameTrendPanels({ slug, name, state, modeRows, span, online })}`;

  return shell({ state, body, active: 'overview', title: name });
}
