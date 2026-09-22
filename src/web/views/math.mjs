import { html } from '../html.mjs';
import { int, pct, DASH } from '../format.mjs';
import { shell } from './shell.mjs';
import { mathDrift } from '../../math/checks.mjs';

export function renderMath({ model, state, math = {}, live = [] }) {
  const entries = Object.entries(math).sort(([a], [b]) => a.localeCompare(b));
  const gaps = live.filter(slug => !math[slug]);
  // The API's own view of each game's modes, against what math.json captured.
  const drift = entries.map(([slug, g]) => [slug, mathDrift(g, state.modeRows?.[slug])]).filter(([, found]) => found.length);
  const nameOf = slug => model.options?.find(g => g.slug === slug)?.name ?? slug;

  const body = html`<div class="page-heading"><div><div class="eyebrow">CAPTURED MODELS</div><h1>Game math<span>.</span></h1>
      <p>The certified model each game was approved with. Deployed figures are compared against these on every game page.</p></div>
    <span class="tag">${entries.length} models</span></div>

  ${drift.length ? html`<div class="notice warning"><b>Deployed math differs from math.json</b> - a new math version was published or a mode was added, so recapture these games from the studio dashboard's Math tab:
      <ul>${drift.map(([slug, found]) => html`<li><b>${nameOf(slug)}</b>: ${found.map(d => d.message).join('; ')}</li>`)}</ul></div>` : null}

  ${gaps.length ? html`<div class="notice warning">Live with no captured model: ${gaps.map(slug => html`<b>${slug}</b> `)}. Those games show observed figures only - no drift, convergence or tail verdict can be produced for them.</div>` : null}

  <section class="panel"><div class="scroll"><table><thead><tr>
      <th>Game</th><th>Version</th><th>RTP</th><th>Base volatility</th><th>Star level</th><th>Max win</th><th>Modes</th><th>Cost ladder</th><th>2★</th><th>3★</th><th>Live</th></tr></thead>
    <tbody>${entries.map(([slug, g]) => {
      const starLevel = g.starLevel === null || g.starLevel === undefined ? DASH : g.starLevel;
      return html`<tr>
      <td><a class="game-link" href="/game/${encodeURIComponent(slug)}">${nameOf(slug)}</a></td>
      <td>${int(g.version)}</td>
      <td>${pct((1 - g.edge) * 100)}</td>
      <td>${g.baseVolatility} <span class="dim">${g.volatilityClass}</span></td>
      <td>${starLevel}</td>
      <td>${int(g.maxWin)}x</td>
      <td>${int(Object.keys(g.modes ?? {}).length)}</td>
      <td class="dim">${(g.costLadder ?? []).map(c => `${c}x`).join(' / ')}</td>
      <td class="${g.compliance?.passes2Star === false ? 'bad' : 'good'}">${g.compliance?.passes2Star === false ? 'FAILS' : 'passes'}</td>
      <td class="${g.compliance?.passes3Star === false ? 'bad' : 'good'}">${g.compliance?.passes3Star === false ? 'FAILS' : 'passes'}</td>
      <td>${live.includes(slug) ? 'live' : html`<span class="dim">not live</span>`}</td></tr>`;
    })}</tbody></table></div></section>

  ${entries.map(([slug, g]) => html`<section class="panel"><div class="section-heading"><div><h2>${nameOf(slug)}</h2>
      <p>Version ${g.version} · ${Object.keys(g.modes ?? {}).length} modes${g.compliance?.failures?.length ? ` · failing: ${g.compliance.failures.join(', ')}` : ''}</p></div></div>
    <div class="scroll"><table><thead><tr><th>Mode</th><th>Cost</th><th>RTP</th><th>Std dev</th><th>Zero rate</th><th>Hit rate</th><th>Break-even rate</th><th>Worst loss streak</th></tr></thead>
      <tbody>${Object.entries(g.modes ?? {}).map(([mode, m]) => {
        const sigma = m.sigma === null || m.sigma === undefined || !Number.isFinite(Number(m.sigma)) ? DASH : m.sigma;
        return html`<tr>
        <td><a class="game-link" href="/game/${encodeURIComponent(slug)}/mode/${encodeURIComponent(mode)}">${mode}</a></td>
        <td>${m.cost}x</td><td>${pct(m.rtp * 100)}</td><td>${sigma}</td>
        <td>${pct(m.zeroRate * 100)}</td><td>${m.hitRate === undefined ? DASH : pct(m.hitRate * 100)}</td><td>${m.breakEvenRate === undefined ? DASH : pct(m.breakEvenRate * 100)}</td>
        <td>${int(m.worstLossStreak)}</td></tr>`;
      })}</tbody></table></div></section>`)}`;

  return shell({ state, body, active: 'math', title: 'Game math' });
}
