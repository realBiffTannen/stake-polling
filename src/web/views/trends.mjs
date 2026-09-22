/**
 * The trends page - the operator's standing metric.
 *
 * Average returning players across all games, against the number of games
 * released. The games endpoint carries no release date, so "released" is
 * recorded forward from the day this rollup shipped and reconstructed
 * backwards from each game's first active day before that; reconstructed
 * days are inference and must read as such, never blurred with recorded
 * ones. A day the collector missed is a dash, never a zero.
 */

import { html } from '../html.mjs';
import { int, DASH } from '../format.mjs';
import { shell } from './shell.mjs';
import { releasedSeries } from '../../insights/catalogue.mjs';
import { returningTrend } from '../../insights/trends.mjs';
import { correlations } from '../../insights/verdicts.mjs';
import { lineChart } from '../charts/line.mjs';
import { scatterChart } from '../charts/scatter.mjs';
import { MODE_COLOURS } from '../svg.mjs';
import { studioTrendPanels } from './trend-panels.mjs';

const round = (v, dp = 1) => (v === null || v === undefined || !Number.isFinite(Number(v)) ? DASH : Number(v).toFixed(dp));

// Cohen's small-effect convention: |r| below 0.3 is not called a direction at
// all at a dozen titles - it's noise dressed up as a finding. This is the ONE
// place a correlation's direction gets stated in prose, derived from the sign
// and size of `r` itself, so the words can never disagree with the number
// sitting next to them (see the comment on correlations() in
// src/insights/verdicts.mjs for why that guarantee matters).
const ASSOCIATION_THRESHOLD = 0.3;
const associationReading = (r) => {
  if (r === null || r === undefined || !Number.isFinite(Number(r))) return 'no clear relationship at this sample size';
  const v = Number(r);
  if (v >= ASSOCIATION_THRESHOLD) return 'a weak positive association with returning rate';
  if (v <= -ASSOCIATION_THRESHOLD) return 'a weak negative association with returning rate';
  return 'no clear relationship with returning rate at this sample size';
};

export function renderTrends({ model, state, catalogue = {}, math = {}, online = null, turnover = null }) {
  const dates = model.daily.map(r => r.date);
  const released = releasedSeries({ catalogue, dates });
  const trend = returningTrend({ daily: model.daily, released });
  const latest = [...trend].reverse().find(r => r.avgReturning !== null) ?? {};
  const reconstructedDays = released.filter(r => r.reconstructed).length;
  const corr = correlations({ games: model.games, model: math });

  const body = html`<div class="page-heading"><div><div class="eyebrow">OVER TIME</div>
      <h1>Trends<span>.</span></h1>
      <p>Players online every poll, the last 30 days of play, and the standing retention metric.</p></div></div>

  ${studioTrendPanels({ state, online, turnover })}

  <div class="page-heading"><div><div class="eyebrow">STANDING METRIC</div>
      <h2>Average returning players per released game</h2>
      <p>Returning players across every game each day, divided by the number of games live that day.</p></div></div>

  <div class="metric-grid">
    <article class="metric-card accent"><div class="metric-label">Latest average</div><div class="metric-value">${round(latest.avgReturning, 2)}</div>
      <div class="metric-note">${latest.date ?? DASH} · ${int(latest.released)} games live</div></article>
    <article class="metric-card"><div class="metric-label">Returning, 7-day mean</div><div class="metric-value">${round(latest.rolling7)}</div>
      <div class="metric-note">player-days per day, all games</div></article>
    <article class="metric-card"><div class="metric-label">Returning, 28-day mean</div><div class="metric-value">${round(latest.rolling28)}</div>
      <div class="metric-note">smooths a single busy weekend</div></article>
    <article class="metric-card"><div class="metric-label">New, 7-day mean</div><div class="metric-value">${round(latest.newRolling7)}</div>
      <div class="metric-note">first seen since tracking start</div></article>
  </div>

  ${reconstructedDays ? html`<div class="notice">${reconstructedDays} of ${released.length} days are <b>reconstructed</b>: the games endpoint carries no release date, so before this rollup began, a game counts as released from the first day it took a bet.</div>` : null}

  <section class="panel chart-panel"><div class="section-heading"><div><h2>Returning players against releases</h2>
      <p>Left axis: average returning players per released game. Right axis: games live.</p></div></div>
    ${lineChart({ labels: dates.map(d => d.slice(5)), tipLabels: dates,
      series: [
        { name: 'avg returning per game', colour: MODE_COLOURS[5], values: trend.map(r => r.avgReturning) },
        { name: 'games released', colour: MODE_COLOURS[4], axis: 'right', values: trend.map(r => r.released) },
      ], title: 'Average returning players per released game, against the number of games released' })}</section>

  <section class="panel chart-panel"><div class="section-heading"><div><h2>Rolling player tallies</h2>
      <p>Daily new and returning players, with their 7-day and 28-day means.</p></div></div>
    ${lineChart({ labels: dates.map(d => d.slice(5)), tipLabels: dates,
      series: [
        { name: 'returning', colour: MODE_COLOURS[2], values: trend.map(r => r.returningPlayers) },
        { name: 'returning 7-day', colour: MODE_COLOURS[0], values: trend.map(r => r.rolling7) },
        { name: 'new', colour: MODE_COLOURS[1], values: trend.map(r => r.newPlayers) },
        { name: 'new 7-day', colour: MODE_COLOURS[3], values: trend.map(r => r.newRolling7) },
      ], title: 'Daily new and returning players with rolling means' })}</section>

  <section class="panel"><div class="section-heading"><div><h2>Does the math shape retention?</h2>
      <p>Correlation across the games that have a captured model. Weak evidence at this many titles; each row states its n.</p></div></div>
    ${corr.length ? html`<div class="scroll"><table><thead><tr><th>Relationship</th><th>r</th><th>n</th><th>Reading</th></tr></thead>
      <tbody>${corr.map(c => html`<tr><td>${c.label}</td><td>${round(c.r, 2)}</td><td>${int(c.n)}</td><td class="dim">${c.note} - ${associationReading(c.r)}.</td></tr>`)}</tbody></table></div>`
      : html`<p class="dim">Not enough games with both a captured model and measured players yet.</p>`}
    ${corr.length ? scatterChart({
      points: model.games.filter(g => math[g.slug] && g.players > 0)
        .map(g => ({ x: math[g.slug].baseVolatility, y: g.returningPlayers / g.players, label: g.name })),
      xLabel: 'captured base volatility', yLabel: 'returning share of players', fit: true,
      title: 'Returning share against base volatility' }) : null}</section>

  <section class="panel definitions"><div class="section-heading"><h2>How these are counted</h2></div>
    <div class="definition-grid">
      <div><h3>Returning players</h3><p>Daily players minus players new to that game. Summed across games, so one person playing two games counts twice. A day the collector missed is a dash, never a zero.</p></div>
      <div><h3>Games released</h3><p>Games the studio API reports as live. Recorded daily from now on; earlier days are reconstructed from first activity, and are flagged above.</p></div>
      <div><h3>Months</h3><p>Every month figure on this dashboard runs from the 1st at 00:00Z to the 1st of the next month.</p></div>
    </div></section>`;

  return shell({ state, body, active: 'trends', title: 'Trends' });
}
