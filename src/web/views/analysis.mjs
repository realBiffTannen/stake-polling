/**
 * The analysis page - every chart states its conclusion.
 *
 * Each panel is a headline sentence from src/insights/conclusions.mjs, then
 * the chart that sentence was computed from. The words are never written
 * here, so they cannot drift from the picture.
 *
 * The picker scopes everything that CAN be scoped: this month (the API's own
 * month-to-date), today (the trail since 00:00:00Z) or a rolling window of
 * 10 minutes, 1, 3, 6 or 24 hours, or 3 days (the trail). Two panels are fixed by what
 * they are: the hour-by-hour charts need the trail, so under "this month"
 * they show the last 24 hours; and the daily P/L chart is always the month,
 * because a day does not split into days.
 */

import { html, raw } from '../html.mjs';
import { int, utcHm } from '../format.mjs';
import { formatUsd, formatUsdSigned } from '../../money.mjs';
import { shell } from './shell.mjs';
import { spanPicker, chartPanel } from './parts.mjs';
import { SPANS, spanStart, gameRowsOver, modeRowsOver } from '../../insights/span.mjs';
import {
  pnlByGame, turnoverShare, buyShare, gameBands, bandHeadline, hourlySeries, pnlTrend, betsTrend,
  onlineHourly, dailyPnl, donutSets, turnoverTree, turnoverFlow, BUY_COST,
} from '../../insights/conclusions.mjs';
import { hbars, bandChart } from '../charts/hbars.mjs';
import { columns } from '../charts/columns.mjs';
import { lineChart } from '../charts/line.mjs';
import { donut, GAME_COLOURS, OTHER_COLOUR } from '../charts/donut.mjs';
import { interactiveChart, emptyChart, treemapData, sankeyData } from '../charts/interactive.mjs';
import { html as h } from '../html.mjs';
import { pct, usd, blank, DASH } from '../format.mjs';
import { holdTable, holdHeadline, buyEconomics, playerWorth, quietByGame, unusualDays } from '../../insights/economics.mjs';
import { tape, tapeHeadline, notable } from '../../insights/tape.mjs';
import { playersByGame, playerCorrelation, contribution, playersHeadline, correlationHeadline, contributionHeadline } from '../../insights/players.mjs';
import { scatterChart } from '../charts/scatter.mjs';

const pct1 = (v) => `${Number(v).toFixed(1)}%`;
const marginPct = (v) => `${(Number(v) * 100).toFixed(1)}%`;
const hh = (ts) => new Date(ts).toISOString().slice(11, 13);

export function compact(v, prefix = '') {
  const n = Number(v), a = Math.abs(n);
  if (a >= 1e6) return `${prefix}${(n / 1e6).toFixed(1)}M`;
  if (a >= 1e3) return `${prefix}${(n / 1e3).toFixed(1)}k`;
  return `${prefix}${Math.round(n)}`;
}

const panel = chartPanel;

/** Where the trail stops covering the span, or null when it covers all of it. */
function coverageGap(trails, from) {
  const firsts = Object.values(trails ?? {}).filter((t) => Array.isArray(t) && t.length).map((t) => Number(t[0].ts));
  if (!firsts.length) return 'none';
  const earliest = Math.min(...firsts);
  return earliest > from ? earliest : null;
}

/**
 * @param {{ state: object, model: object, span: keyof SPANS }} args
 */
export function renderAnalysis({ state, model, span = 'month' }) {
  const now = Number(state.now) || Date.now();
  const money = state.money;
  const from = spanStart(span, now);
  const { words, hours } = SPANS[span];
  // A span longer than the shared 24-hour trail arrives with its own, read by
  // time (bin/stake-web.mjs); every other span reads the shared one.
  const spanGames = state.spanTrails?.games ?? state.gameTrails ?? {};
  const spanModes = state.spanTrails?.modes ?? state.modeTrails ?? {};
  const baseRows = state.rows ?? [];
  const rows = from === null ? baseRows : gameRowsOver(baseRows, spanGames, from, money);
  const labels = Object.fromEntries(baseRows.map((r) => [r.name, r.label ?? r.name]));
  const modesBySlug = from === null
    ? (state.modeRows ?? {})
    : Object.fromEntries(Object.entries(spanModes).map(([slug, trail]) => [slug, modeRowsOver(trail, from, state.modeRows?.[slug])]));

  const sets = donutSets(rows, { span: words });
  const colourOf = (s) => (s.slot === null ? OTHER_COLOUR : GAME_COLOURS[s.slot]);
  // The same colour per game on every chart here: the slot the donuts gave
  // it, or Other's grey for a game that did not win one.
  const slots = new Map(Object.values(sets).flatMap((set) => set.slices).filter((s) => s.slot !== null).map((s) => [s.key, s.slot]));
  const gameColour = (slug) => (slots.has(slug) ? GAME_COLOURS[slots.get(slug)] : OTHER_COLOUR);
  const ring = (set, title, format, centre) => donut({ slices: set.slices.map((s) => ({ ...s, colour: colourOf(s) })), title, format, centre });

  const pnl = pnlByGame(rows);
  const bands = gameBands(modesBySlug, state.math ?? {}, labels);
  const share = turnoverShare(rows, { span: words });
  const buys = buyShare(modesBySlug, labels);
  const tree = turnoverTree(modesBySlug, labels, money, { span: words });
  const flow = turnoverFlow(modesBySlug, labels, money, { span: words });

  // The hour-by-hour panels: since midnight for "today"; for a window shorter
  // than a day, every clock hour it reaches into, so the chart starts at the
  // top of the hour the window begins in and says so; else the last N hours
  // (the last 24 under "this month").
  const partHours = hours && hours < 24;
  const hourSpan = span === 'today' || partHours ? { now, from } : { now, hours: hours ?? 24 };
  const hourWords = span === 'today' ? 'Today' : partHours ? `Since ${hh(from)}:00Z` : hours ? SPANS[span].label : 'Last 24h';
  const trails = Object.values(spanGames);
  const profitHours = hourlySeries(trails, 'profit', hourSpan);
  const trend = pnlTrend(profitHours, money, { span: hourWords });
  const betHours = hourlySeries(trails, 'count', hourSpan);
  const online = onlineHourly(state.spanTrails?.online ?? state.onlineTrail ?? [], hourSpan);
  const hourLabels = profitHours.map((s) => hh(s.from));
  const hourTips = profitHours.map((s) => `${hh(s.from)}:00Z`);
  const daily = model?.daily ?? [];

  // The derived data points, all from what the collector already polls.
  const hold = holdTable(modesBySlug, labels);
  const bySize = (a, b) => (Number(b.turnoverUsd) || 0) - (Number(a.turnoverUsd) || 0);
  const econRows = [...baseRows].sort(bySize).map((r) => ({ r, e: buyEconomics(modesBySlug[r.name] ?? [], money) })).filter(({ e }) => !blank(e.rounds) && e.rounds > 0);
  const worthRows = [...baseRows].sort(bySize).map((r) => ({ r, w: playerWorth(r, money) })).filter(({ w }) => !blank(w.turnoverPerPlayer));
  const quiet = quietByGame(state.gameTrails ?? {}, labels);
  // Players, from counts only (src/insights/players.mjs). The month has no
  // trail of its own, so under "this month" these read the last 24 hours.
  const playerSpan = from === null ? { trails: state.gameTrails ?? {}, from: now - 86_400_000, words: 'in the last 24h' } : { trails: spanGames, from, words };
  const playerRows = playersByGame(playerSpan.trails, { from: playerSpan.from, now, labels, money });
  const playerLinks = playerCorrelation(playerSpan.trails, { from: playerSpan.from, now, money });
  const contrib = contribution(playerRows);
  const monthUnique = baseRows.filter((r) => !blank(r.unique)).reduce((a, r) => a + Number(r.unique), 0);
  // Every interval counts toward r; the chart draws an even sample so a
  // three-day span stays a readable, light page.
  const step = Math.max(1, Math.ceil(playerLinks.points.length / 400));
  const scatterPoints = playerLinks.points.filter((_, i) => i % step === 0)
    .map((p) => ({ x: p.online, y: p.turnoverUsd, label: `${utcHm(p.ts)}Z` }));
  const perPoll = Number(state.pollMinutes) > 0 ? `per ${Number(state.pollMinutes)} minutes` : 'per poll';
  const unusual = unusualDays(state.dailySnapshot ?? {}, { now, money });
  const costOf = (slug, mode) => (state.modeRows?.[slug] ?? []).find((r) => r.mode === mode)?.cost ?? null;
  const events = notable(tape({ gameTrails: state.gameTrails ?? {}, modeTrails: state.modeTrails ?? {}, labels, now, money }), costOf);
  const usdOrDash = (v) => (blank(v) ? DASH : usd(v));
  const signedOrDash = (v) => (blank(v) ? DASH : formatUsdSigned(v));
  const pctOrDash = (v, dp = 1) => (blank(v) ? DASH : pct(Number(v) * 100, dp));

  const gap = from === null ? null : coverageGap(spanGames, from);
  const scope = span === 'month'
    ? 'Month-to-date from the 1st at 00:00Z, as the API reports it.'
    : span === 'today'
      ? `Since 00:00:00Z today - ${utcHm(now)} now, so ${Math.floor((now - from) / 3_600_000)}h ${Math.floor(((now - from) % 3_600_000) / 60000)}m of play.`
      : `The rolling ${SPANS[span].period} to ${utcHm(now)}, from the collector's own trail.`;

  const head = html`<div class="page-heading"><div><div class="eyebrow">WHAT THE DATA SAYS</div><h1>Analysis<span>.</span></h1>
      <p>Every chart states its conclusion, and every conclusion carries what it was computed from.</p></div></div>
  <div class="scope-line"><span>${spanPicker('/analysis', span)}</span><span>${scope}</span></div>
  ${gap === 'none' ? html`<div class="notice warning">No trail has been recorded yet, so nothing in this span can be measured.</div>`
    : gap ? html`<div class="notice warning">The trail only reaches back to ${utcHm(gap)}; figures cover from then, not the whole span.</div>` : null}`;

  const panels = html`<div class="donut-grid">
    ${panel('Share of bets', sets.bets.headline, ring(sets.bets, 'Bets by game', (v) => int(v), compact(sets.bets.total)))}
    ${panel('Share of turnover', sets.turnover.headline, ring(sets.turnover, 'Turnover by game', (v) => formatUsd(v), compact(sets.turnover.total, '$')))}
    ${panel('Profit gains', sets.gains.headline, ring(sets.gains, 'Studio profit, games that were up', (v) => formatUsd(v), compact(sets.gains.total, '+$')))}
    ${panel('Profit losses', sets.losses.headline, ring(sets.losses, 'Studio loss, games that were down', (v) => formatUsd(v), compact(sets.losses.total, '-$')))}
  </div>

  ${panel('Profit and loss by game', pnl.headline, hbars({ rows: pnl.bars, tone: 'sign', format: formatUsdSigned, title: 'Studio P/L' }),
    'Studio P/L is the studio\'s share of gross gaming revenue. Zero counts as up.')}

  ${panel('Luck or fault?', bands.length ? bandHeadline(bands, 'games') : null,
    bandChart({ rows: bands, format: marginPct, title: 'House margin against the captured edge' }),
    'Dot: observed house margin. Tick: the captured edge. Shaded: ±2 standard errors, built per mode from the captured sigma and weighted by turnover. Payouts are skewed, so a big win pulls a margin further below its band than a normal curve expects.')}

  ${panel('Where the turnover goes', share.headline, hbars({ rows: share.bars, tone: 'neutral', format: pct1, title: 'Share of turnover' }))}

  ${panel('Turnover by game and bet mode', tree.headline,
    tree.total ? interactiveChart({ id: 'turnover-tree', kind: 'treemap', title: `Turnover by game and bet mode, ${words}`, data: treemapData(tree, gameColour) })
      : emptyChart('No bet mode has measured turnover in this span yet.'),
    'Area is turnover. Each game keeps its donut colour; its tiles are its bet modes. Click a game to open it up, and the bar underneath to step back out.')}

  ${panel('Feature buys against base play', buys.headline, hbars({ rows: buys.bars, tone: 'neutral', format: pct1, title: 'Feature-buy share of turnover' }))}

  ${panel('Where each game\'s turnover flows', flow.headline,
    flow.total ? interactiveChart({ id: 'turnover-flow', kind: 'sankey', title: `Studio turnover by game, then base play or feature buys, ${words}`, data: sankeyData(flow, gameColour) })
      : emptyChart('No bet mode has measured turnover in this span yet.'),
    `Band width is turnover. A feature buy is a mode costing more than ${BUY_COST}x the base bet, the same split as the bars above; a mode whose cost was never read counts as base play.`)}

  ${panel('Realised against theoretical hold', holdHeadline(hold),
    hbars({ rows: hold.map((r) => ({ key: r.key, label: r.label, value: r.deltaPp })), tone: 'sign',
      format: (v) => `${v > 0 ? '+' : ''}${Number(v).toFixed(1)}pp`, title: 'Realised minus theoretical hold' }),
    'Theoretical hold is one minus each mode\'s deployed RTP, weighted by that mode\'s turnover - the API\'s own figures, so it needs no captured math. Open a game to see which mode explains its gap.')}

  ${panel('Buy economics by game', econRows.length ? `${econRows[0].r.label ?? econRows[0].r.name}: ${econRows[0].e.headline}` : null,
    h`<div class="scroll"><table><thead><tr><th>Game</th><th>Buy conversion</th><th>Buys' share of turnover</th><th>Average buy</th><th>Average base bet</th></tr></thead>
      <tbody>${econRows.map(({ r, e }) => h`<tr><td class="label-cell"><a class="game-link" href="/game/${encodeURIComponent(r.name)}">${r.label ?? r.name}</a></td>
        <td>${pctOrDash(e.conversion)}</td><td>${pctOrDash(e.buyTurnoverShare)}</td><td>${usdOrDash(e.avgBuyUsd)}</td><td>${usdOrDash(e.avgBaseBetUsd)}</td></tr>`)}</tbody></table></div>`)}

  ${panel('Player worth by game', worthRows.length ? `${worthRows[0].r.label ?? worthRows[0].r.name}: ${worthRows[0].w.headline}` : null,
    h`<div class="scroll"><table><thead><tr><th>Game</th><th>Turnover per player</th><th>Rounds per player</th><th>Studio P/L per player</th><th>Studio P/L per 1,000 rounds</th></tr></thead>
      <tbody>${worthRows.map(({ r, w }) => h`<tr><td class="label-cell"><a class="game-link" href="/game/${encodeURIComponent(r.name)}">${r.label ?? r.name}</a></td>
        <td>${usdOrDash(w.turnoverPerPlayer)}</td><td>${blank(w.roundsPerPlayer) ? DASH : int(w.roundsPerPlayer)}</td><td>${signedOrDash(w.studioPerPlayer)}</td><td>${signedOrDash(w.studioPer1kRounds)}</td></tr>`)}</tbody></table></div>`,
    'Always this month, whatever span is picked: the API only counts players month-to-date, per game.')}

  ${panel('Players in this span', playersHeadline(playerRows, { words: playerSpan.words }),
    hbars({ rows: playerRows.filter((r) => !blank(r.avgOnline)).sort((a, b) => b.avgOnline - a.avgOnline).map((r) => ({ key: r.slug, label: r.label, value: r.avgOnline })),
      tone: 'neutral', format: (v) => Number(v).toFixed(1), title: 'Average players online' }),
    `Players online is a head count at each poll, not distinct players.${span === 'month' ? ' Under This month it reads the last 24 hours of the trail.' : ''}${monthUnique > 0 ? ` This month the API counts ${int(monthUnique)} players across games (a player of two games counts twice).` : ''}`)}

  ${panel('Players and turnover', correlationHeadline(playerLinks, { intervalWords: perPoll }),
    playerLinks.points.length ? scatterChart({ points: scatterPoints, xLabel: 'Players online', yLabel: `Turnover ${perPoll} ($)`, fit: true, title: 'Players online against turnover, one dot per poll interval' }) : null,
    `One dot per poll interval${step > 1 ? ` (every ${step}th of ${int(playerLinks.points.length)} drawn; r uses them all)` : ''}. The API never identifies a player, so this relates how many were on to what was staked - it does not follow any one player, and a link is not a cause.`)}

  ${panel('Player contribution by game', contributionHeadline(contrib), contrib.length ? h`<div class="scroll"><table><thead><tr><th>Game</th><th>Avg online</th><th>Peak</th><th>New this month</th><th>Share of players</th><th>Share of turnover</th><th>Share of bets</th><th>Contribution</th></tr></thead>
      <tbody>${contrib.map((r) => h`<tr><td class="label-cell"><a class="game-link" href="/game/${encodeURIComponent(r.slug)}">${r.label}</a></td>
        <td>${Number(r.avgOnline).toFixed(1)}</td><td>${int(r.peakOnline)}</td><td>${int(r.newPlayers)}</td><td>${pctOrDash(r.playerShare)}</td><td>${pctOrDash(r.turnoverShare)}</td><td>${pctOrDash(r.betShare)}</td>
        <td class="${r.index === null ? '' : r.index >= 1 ? 'good' : 'dim'}">${r.index === null ? DASH : `${r.index.toFixed(2)}x`}</td></tr>`)}</tbody></table></div>` : null,
    'Contribution is a game\'s share of turnover over its share of players online: above 1x, its players stake more than their numbers alone would suggest.')}

  ${panel('Quiet share', quiet.headline, hbars({ rows: quiet.bars, tone: 'neutral', format: pct1, title: 'Share of turnover taken with two or fewer players online' }),
    'Last 24h of the trail. A game that takes most of its money with almost nobody on is living on a few big players.')}

  ${panel('Unusual days', unusual.headline, unusual.rows.length ? h`<ul class="list">${unusual.rows.map((u) => h`<li>
      <div><b>${u.name ?? u.slug}</b> on ${u.date}: ${u.kind === 'both' ? 'stakes and players' : u.kind} at ${Number(u.ratio).toFixed(1)}x its median${blank(u.turnover) ? '' : ` (${usd(u.turnover)} turnover)`}</div></li>`)}</ul>` : null,
    'A day at three times the median of that game\'s previous 14 active days, with at least five days to compare, $400 and 900 rounds of floor. Launch days and today are excluded.')}

  ${panel('The tape', tapeHeadline(events), events.length ? h`<ul class="list timeline">${events.slice(0, 40).map((e) => h`<li class="${e.kind === 'payout_spike' ? 'warn' : ''}">
      <div>${e.message}</div><div class="dim">${new Date(e.ts).toISOString().slice(11, 16)}Z · ${e.label ?? e.slug} · ${e.kind.replace('_', ' ')}</div></li>`)}</ul>
      ${events.length > 40 ? h`<p class="dim">${int(events.length - 40)} more - every interval is in the poll log.</p>` : null}` : null,
    'Always the last 24h. Big stake: $500+ in one poll interval at $10+ a spin. Payout spike: a player won $250+ net and 5x+ the stake. House take: the house kept $250+. Exact stake: one feature buy alone in an interval, so its price is exact.')}

  ${panel('Running studio P/L, hour by hour', trend.headline, lineChart({ labels: hourLabels, tipLabels: hourTips,
      series: [{ name: 'running studio P/L', colour: '#4a8ff5', values: trend.cumulative }], format: formatUsdSigned, title: `${hourWords}: running studio P/L` }),
    span === 'month' ? 'Hourly figures come from the collector\'s trail, so under This month they show the last 24 hours.'
      : partHours ? `Whole clock hours: the chart starts at ${hh(from)}:00Z, the top of the hour the window begins in.` : null)}

  ${panel('Studio P/L per hour', trend.hourHeadline, columns({ rows: profitHours.map((s, i) => ({ label: hourLabels[i], tipLabel: hourTips[i], value: trend.hourly[i] })),
    tone: 'sign', format: formatUsdSigned, title: 'Studio P/L per hour' }))}

  ${panel('Bets per hour', betsTrend(betHours).headline, columns({ rows: betHours.map((s, i) => ({ label: hourLabels[i], tipLabel: hourTips[i], value: s.value })),
    tone: 'neutral', format: (v) => int(v), title: 'Bets per hour' }))}

  ${panel('Players online', online.headline, lineChart({ labels: online.series.map((s) => hh(s.from)), tipLabels: online.series.map((s) => `${hh(s.from)}:00Z`),
    series: [{ name: 'peak players online', colour: '#2fa88f', values: online.series.map((s) => s.value) }], format: (v) => int(v), title: 'Peak players online per hour' }))}

  ${panel('Daily P/L this month', dailyPnl(daily).headline, columns({ rows: daily.map((d) => ({ label: d.date.slice(8), tipLabel: d.date, value: d.profit })),
    tone: 'sign', format: formatUsdSigned, title: 'Studio P/L per day' }), 'Always the calendar month - a day does not split into days. Today is still filling.')}

  <section class="panel definitions" id="how-to-read"><div class="section-heading"><h2>How to read these</h2></div>
    <div class="accordion-group">
      <details class="accordion" id="def-picker"><summary>The picker</summary><p>This month is what the API reports month-to-date. Today is the change since 00:00:00Z, so at 01:00Z it holds one hour. Last 10 min, 1h, 3h, 6h, 24h and 3 days are rolling windows ending now. Everything but This month is read from the collector's trail, which samples every ${Number(state.pollMinutes) > 0 ? `${Number(state.pollMinutes)} minutes` : 'poll'} on the clock, starting at 00:00Z.</p></details>
      <details class="accordion" id="def-money"><summary>Money</summary><p>Studio P/L is ${Math.round((money?.profitShare ?? 0.1) * 100)}% of gross gaming revenue. Margins and RTP use the gross figures. A game with no reading shows a dash and is left out of every total.</p></details>
      <details class="accordion" id="def-noise"><summary>Noise</summary><p>A month of play can sit tens of points from a game's edge by variance alone. Only a margin outside its ±2 standard-error band is called out, and even then it is a prompt to look, not proof of a fault.</p></details>
    </div></section>`;

  // "On this page", built from the panels as rendered, so it cannot drift from them.
  const sections = [...String(panels).matchAll(/<section class="panel[^"]*" id="([^"]+)"><div class="section-heading">(?:<div>)?<h2>([^<]+)<\/h2>/g)];
  const toc = html`<nav class="toc" aria-label="On this page"><p class="toc-title">On this page</p><ol>${sections.map(([, id, title]) => html`<li><a href="#${id}">${raw(title)}</a></li>`)}</ol></nav>`;
  const body = html`${head}<div class="with-toc"><div class="toc-main">${panels}</div>${toc}</div>`;

  return shell({ state, body, active: 'analysis', title: 'Analysis' });
}
