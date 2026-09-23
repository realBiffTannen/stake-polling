import { html, raw } from '../html.mjs';
import { int, usd, usdSigned, pct, humanAge, money } from '../format.mjs';
import { tablePdf } from '../pdf.mjs';
import { shell } from './shell.mjs';

const dateLabel = date => new Date(date + 'T00:00:00Z').toLocaleDateString('en-US', { month: 'short', day: 'numeric', timeZone: 'UTC' });
const signed = n => money(n, { signed: true });
function link(model, changes = {}, path = '/insights') {
  const p = new URLSearchParams({ from: model.from, to: model.to, game: model.game, sort: model.sort, dir: model.dir });
  for (const [key, value] of Object.entries(changes)) p.set(key, value);
  return `${path}?${p}`;
}
function card(label, value, note, kind = '') {
  return html`<article class="metric-card ${kind}"><div class="metric-label">${label}</div><div class="metric-value">${value}</div><div class="metric-note">${note}</div></article>`;
}

function playerChart(rows) {
  const w = 900, h = 230, left = 48, bottom = 28, top = 16;
  const chartH = h - bottom - top;
  const max = Math.max(1, ...rows.map(r => r.players ?? 0));
  const step = (w - left - 12) / Math.max(1, rows.length), width = Math.min(44, step * .6);
  return html`<svg class="trend-chart" viewBox="0 0 ${w} ${h}" role="img" aria-label="Daily players and new-to-game players, by UTC calendar date">
    ${[0, .25, .5, .75, 1].map(f => html`<line class="gridline" x1="${left}" x2="${w}" y1="${h - bottom - f * chartH}" y2="${h - bottom - f * chartH}"/><text class="axis-label" x="${left - 10}" y="${h - bottom - f * chartH + 4}" text-anchor="end">${int(f * max)}</text>`)}
    ${rows.map((r, i) => {
      const x = left + step * (i + .5), height = chartH * (r.players ?? 0) / max;
      const tip = JSON.stringify({ label: r.date, note: r.current ? 'Day in progress' : undefined, rows: [
        { name: 'daily players', value: String(int(r.players)), colour: '#86e1c4' }, { name: 'new to game', value: String(int(r.newPlayers)), colour: '#a69aff' }] });
      return html`<g class="hit" data-tip="${tip}"><rect x="${x - step / 2}" y="${top}" width="${step}" height="${chartH}" fill="transparent"/>
        ${r.players == null ? html`<text class="axis-label" x="${x}" y="${h - bottom - 6}" text-anchor="middle">—</text>` : html`<rect class="player-bar ${r.current ? 'in-progress' : ''}" x="${x - width / 2}" y="${h - bottom - height}" width="${width}" height="${Math.max(height, 1)}" rx="3"/>`}
        ${r.newPlayers == null ? null : html`<rect class="new-bar" x="${x - width / 2}" y="${h - bottom - chartH * r.newPlayers / max}" width="${width}" height="${chartH * r.newPlayers / max}" rx="3"/>`}
        ${i % Math.max(1, Math.ceil(rows.length / 10)) === 0 || i === rows.length - 1 ? html`<text class="axis-label" x="${x}" y="${h - 6}" text-anchor="middle">${dateLabel(r.date)}</text>` : null}</g>`;
    })}</svg>`;
}

function moneyChart(rows) {
  const values = rows.map(r => r.turnover).filter(v => v != null), max = Math.max(1, ...values);
  const step = 850 / Math.max(1, rows.length);
  return html`<svg class="money-chart" viewBox="0 0 900 120" role="img" aria-label="Daily turnover in US dollars; exact figures in daily breakdown"><line class="gridline" x1="40" x2="890" y1="91" y2="91"/>
    ${rows.map((r, i) => html`<g class="hit" data-tip="${JSON.stringify({ label: r.date, rows: [{ name: 'turnover', value: String(usd(r.turnover)), colour: '#718dd3' }] })}"><rect x="${40 + i * step}" y="10" width="${step}" height="81" fill="transparent"/>${r.turnover == null ? null : html`<rect class="turnover-bar" x="${40 + i * step + step * .22}" y="${90 - r.turnover / max * 75}" width="${step * .56}" height="${Math.max(1, r.turnover / max * 75)}" rx="2"/>`}${i % Math.max(1, Math.ceil(rows.length / 10)) === 0 ? html`<text class="axis-label" x="${40 + (i + .5) * step}" y="112" text-anchor="middle">${dateLabel(r.date)}</text>` : null}</g>`)}</svg>`;
}

export function renderInsights(model, state) {
  const latest = model.latest ?? {}, total = model.totals;
  const selectedName = model.options.find(r => r.slug === model.game)?.name ?? (model.game ? 'Unknown game' : 'All games');
  const newShare = total.players > 0 && total.newPlayers != null ? total.newPlayers / total.players * 100 : null;
  const fetched = latest.fetchedAt ? `${humanAge(model.now - latest.fetchedAt)} ago` : 'not yet synced';
  const headers = [['name', 'Game'], ['players', 'Player-days'], ['newPlayers', 'New to game'], ['returningPlayers', 'Returning player-days'], ['turnover', 'Turnover'], ['profit', 'Studio profit'], ['count', 'Bets'], ['avgBet', 'Avg bet'], ['rtp', 'Observed RTP']];
  const body = html`<div class="page-heading"><div><div class="eyebrow">THE DAILY PICTURE</div><h1>Player insights<span>.</span></h1><p>Understand who's playing, what's growing, and how your games perform.</p></div><a class="button secondary export" href="${link(model, {}, '/export.csv')}">↓ Export CSV</a></div>
  <form class="filters" method="get" action="/insights"><label>Game<select name="game"><option value="">All games</option>${model.options.map(g => html`<option value="${g.slug}" ${g.slug === model.game ? raw('selected') : null}>${g.name}</option>`)}</select></label><label>From<input type="date" name="from" value="${model.from}" max="${model.to}" required></label><label>To<input type="date" name="to" value="${model.to}" max="${new Date(model.now).toISOString().slice(0,10)}" required></label><button class="button" type="submit">Apply filters ↗</button><div class="quick-ranges">${[7,14,30].map(n => html`<a href="/insights?days=${n}&game=${encodeURIComponent(model.game)}" class="${model.daily.length === n ? 'selected' : ''}">${n}D</a>`)}</div></form>
  <div class="scope-line"><span><b>${selectedName}</b> <span class="muted">/</span> ${dateLabel(model.from)} – ${dateLabel(model.to)}, ${model.to.slice(0,4)}</span><span>UTC calendar days <span class="muted">·</span> Daily data updated ${fetched}</span></div>
  ${model.snapshot.error ? html`<div class="notice warning">Daily sync ${model.snapshot.error === 'AUTH' ? 'needs a valid session in .sid or STAKE_SID' : `is paused (${model.snapshot.error})`}. Cached figures remain visible; retrying automatically.</div>` : null}
  ${model.missingDays ? html`<div class="notice">${model.measuredDays} of ${model.daily.length} selected days available. Missing dates show a dash while history syncs.</div>` : null}
  ${model.stale ? html`<div class="notice warning">Today's daily data is over 30 minutes old. Figures below reflect the last successful daily sync.</div>` : null}
  <div class="metric-grid">${card('Daily players', int(latest.players), `${dateLabel(model.to)}${latest.current ? ' · In progress' : ' · Completed day'}`, 'accent')}${card('New to game', int(latest.newPlayers), `${dateLabel(model.to)} · First seen since tracking start`)}${card('Turnover', usd(total.turnover), 'Selected period · USD')}${card('Studio profit', signed(total.profit), `Selected period · ${((state.money?.profitShare ?? .1) * 100).toFixed(0)}% of gross gaming revenue`)}</div>
  <section class="panel chart-panel"><div class="section-heading"><div><h2>Players, day by day</h2><p>Daily unique players and the players discovering a game for the first time.</p></div><div class="chart-legend"><span><i class="mint"></i>Daily players</span><span><i class="violet"></i>New to game</span></div></div>${playerChart(model.daily)}<div class="chart-foot"><span>${model.game ? 'Unique players within this game each day.' : 'Totals sum game-level players. A person playing two games counts twice.'}</span><span>Hover bars for daily values</span></div></section>
  <div class="secondary-grid"><section class="panel"><div class="section-heading"><div><h2>Turnover trend</h2><p>Daily betting volume in USD</p></div><strong>${usd(total.turnover)}</strong></div>${moneyChart(model.daily)}</section><section class="panel pulse"><div class="section-heading"><h2>Period at a glance</h2><span class="tag">${model.measuredDays} days observed</span></div><div class="pulse-grid"><div><span>Player-days</span><b>${int(total.players)}</b></div><div><span>New-player share</span><b>${pct(newShare, 1)}</b></div><div><span>Bets placed</span><b>${int(total.count)}</b></div><div><span>Average bet</span><b>${usd(total.avgBet)}</b></div></div><p class="muted">Includes today's partial figures when selected.</p></section></div>
  <section class="panel"><div class="section-heading"><div><h2>Game performance</h2><p>Compare the selected period. Click a column to sort, or a game to focus.</p></div><span class="tag">${model.games.length} games</span></div><div class="scroll"><table class="game-table"><thead><tr>${headers.map(([key, title]) => html`<th aria-sort="${model.sort === key ? model.dir === 'asc' ? 'ascending' : 'descending' : 'none'}"><a href="${link(model, { sort: key, dir: model.sort === key && model.dir === 'desc' ? 'asc' : 'desc' })}">${title}${model.sort === key ? model.dir === 'desc' ? ' ↓' : ' ↑' : ''}</a></th>`)}</tr></thead><tbody>${model.games.length ? model.games.map((g, i) => html`<tr><td><a class="game-link" href="${link(model, { game: g.slug })}"><span class="game-index">${String(i + 1).padStart(2, '0')}</span>${g.name}</a></td><td>${int(g.players)}</td><td class="new-number">${int(g.newPlayers)}</td><td>${int(g.returningPlayers)}</td><td>${usd(g.turnover)}</td><td>${signed(g.profit)}</td><td>${int(g.count)}</td><td>${usd(g.avgBet)}</td><td>${pct(g.rtp)}</td></tr>`) : html`<tr><td colspan="9" class="empty">No games match this selection.</td></tr>`}</tbody></table></div></section>
  <section class="panel"><div class="section-heading"><div><h2>By calendar month</h2>
      <p>Each month runs from the 1st at 00:00Z. The current month is still filling.</p></div></div>
    <div class="scroll"><table><thead><tr><th>Month</th><th>Player-days</th><th>New</th><th>Returning</th><th>Turnover</th><th>Studio profit</th><th>Bets</th></tr></thead>
      <tbody>${model.months.map(m => html`<tr><td>${m.label} ${m.complete ? null : html`<span class="tag live-tag">In progress</span>`}</td>
        <td>${int(m.players)}</td><td class="new-number">${int(m.newPlayers)}</td><td>${int(m.returningPlayers)}</td>
        <td>${usd(m.turnover)}</td><td>${signed(m.profit)}</td><td>${int(m.count)}</td></tr>`)}</tbody></table></div></section>
  <section class="panel" id="daily-breakdown"><div class="section-heading"><div><h2>Daily breakdown</h2><p>Exact daily values for ${selectedName}. Most recent first.</p></div><div class="panel-actions"><span class="tag">UTC</span><a class="button secondary small" href="${link(model, {}, '/export.csv')}" download>CSV ↓</a><a class="button secondary small" href="${link(model, {}, '/export.pdf')}" download>PDF ↓</a></div></div><div class="scroll"><table><thead><tr><th>Date</th><th>Daily players</th><th>New to game</th><th>Returning</th><th>Turnover</th><th>Studio profit</th><th>Expected share</th><th>Bets</th></tr></thead><tbody>${[...model.daily].reverse().map(r => html`<tr><td>${r.date} ${r.current ? html`<span class="tag live-tag">In progress</span>` : !r.measured ? html`<span class="tag">Not synced</span>` : null}</td><td>${int(r.players)}</td><td class="new-number">${int(r.newPlayers)}</td><td>${int(r.returningPlayers)}</td><td>${usd(r.turnover)}</td><td>${signed(r.profit)}</td><td>${usd(r.expected)}</td><td>${int(r.count)}</td></tr>`)}</tbody></table></div></section>
  <section class="panel definitions" id="definitions"><div class="section-heading"><div><h2>A little context behind the numbers</h2><p>Know exactly what you're looking at.</p></div><span class="tag">METRIC GUIDE</span></div><div class="definition-grid"><div><h3>Daily players & player-days</h3><p>Daily players are unique within each game on a UTC calendar day. All-game totals sum those counts; they are not deduplicated people across games. Period totals are player-days, so returning on another day counts again.</p></div><div><h3>What “new” means here</h3><p>New to game is the increase in cumulative unique players since ${model.snapshot.trackingStart ?? 'the configured tracking start'}. Returning = daily players minus new. These are not new account registrations or first-ever players across the studio. Corrections that make this calculation inconsistent show a dash.</p></div><div><h3>Money & coverage</h3><p>Turnover is total bets in USD. Studio profit applies the configured ${((state.money?.profitShare ?? .1) * 100).toFixed(0)}% share; expected share uses ${((state.money?.expectedShare ?? .075) * 100).toFixed(1)}%. RTP uses gross figures. Daily history refreshes every 15 minutes. Today's date remains in progress; missing dates are excluded from period totals.</p></div></div></section>`;
  return shell({ state, body, active: 'insights', title: 'Player insights' });
}

/**
 * The daily breakdown as a PDF: the same rows and columns as the table on the
 * page, most recent first, with what was selected and when it was made.
 */
export function insightsPdf(model, { team = null, now = Date.now() } = {}) {
  const name = model.options.find(r => r.slug === model.game)?.name ?? (model.game ? 'Unknown game' : 'All games');
  const rows = [...model.daily].reverse().map(r => [
    `${r.date}${r.current ? ' (in progress)' : !r.measured ? ' (not synced)' : ''}`,
    int(r.players), int(r.newPlayers), int(r.returningPlayers), usd(r.turnover), usdSigned(r.profit), usd(r.expected), int(r.count)]);
  return tablePdf({
    title: 'Player insights - daily breakdown',
    subtitle: `${name} \u00b7 ${model.from} to ${model.to} (UTC days)${team ? ` \u00b7 ${team}` : ''} \u00b7 made ${new Date(now).toISOString().slice(0, 16).replace('T', ' ')}Z`,
    columns: [{ label: 'Date', width: 2.2 }, { label: 'Daily players', align: 'right', width: 1.2 }, { label: 'New to game', align: 'right', width: 1.2 },
      { label: 'Returning', align: 'right', width: 1.1 }, { label: 'Turnover', align: 'right', width: 1.5 }, { label: 'Studio profit', align: 'right', width: 1.5 },
      { label: 'Expected share', align: 'right', width: 1.5 }, { label: 'Bets', align: 'right', width: 1.1 }],
    rows,
    note: 'Studio profit is the studio share of gross gaming revenue. All games sums players per game, so a player of two games counts twice. A dash is a figure not synced.',
  });
}

export function insightsCsv(model) {
  const cell = v => {
    if (v == null) return '';
    let s = String(v);
    if (typeof v === 'string' && /^[=+\-@\t\r]/.test(s)) s = "'" + s;
    return /[",\r\n]/.test(s) ? `"${s.replaceAll('"', '""')}"` : s;
  };
  const keys = ['date', 'game', 'daily_game_players', 'new_to_game', 'returning_game_players', 'turnover_usd', 'studio_profit_usd', 'expected_share_usd', 'bets', 'in_progress', 'fetched_at_utc'];
  return [keys.join(','), ...model.daily.map(r => [r.date, model.game || 'ALL_GAMES_SUM_NOT_DEDUPLICATED', r.players, r.newPlayers, r.returningPlayers, r.turnover, r.profit, r.expected, r.count, r.current, r.fetchedAt ? new Date(r.fetchedAt).toISOString() : ''].map(cell).join(','))].join('\r\n') + '\r\n';
}
