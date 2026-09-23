import { html, raw } from '../html.mjs';
import { humanAge, DASH } from '../format.mjs';
import { banner } from './parts.mjs';
import { fill } from '../fills.mjs';
import { assetUrl } from '../static.mjs';
import { VERSION } from '../../version.mjs';

const NAV = [
  { key: 'overview', href: '/', glyph: '▦', label: 'Overview' },
  { key: 'analysis', href: '/analysis', glyph: '◔', label: 'Analysis' },
  { key: 'settlement', href: '/settlement', glyph: '$', label: 'Settlement' },
  { key: 'insights', href: '/insights', glyph: '◫', label: 'Player insights' },
  { key: 'live', href: '/live', glyph: '◉', label: 'Live operations' },
  { key: 'trends', href: '/trends', glyph: '◈', label: 'Trends' },
  { key: 'math', href: '/math', glyph: '∑', label: 'Game math' },
  { key: 'log', href: '/log', glyph: '≡', label: 'Poll log' },
  { key: 'archive', href: '/archive', glyph: '⤓', label: 'Archive' },
  { key: 'donate', href: '/donate', glyph: '♥', label: 'Donations' },
];

/**
 * "Polled 21s ago". Wrapped in a fill wherever it is rendered, because a
 * cached page is served long after it was rendered and must say how old the
 * data is at the moment it is SERVED - the server recomputes it with this.
 */
export function polledText(ageMs) {
  return ageMs === null || ageMs === undefined ? 'Awaiting poll' : `Polled ${humanAge(ageMs)} ago`;
}

export function shell({ state, body, active = 'insights', title = 'Player insights' }) {
  const current = NAV.find(n => n.key === active)?.label ?? title;
  return html`<aside class="sidebar">
    <a class="brand" href="/"><img class="cg-logo" src="${assetUrl('/brand/logo.svg')}" alt="Crash Galaxy" width="150" height="32"><small>STUDIO ANALYTICS</small></a>
    <div class="nav-label">WORKSPACE</div>
    <nav aria-label="Workspace">${NAV.map(n => html`<a class="${n.key === active ? 'active' : ''}" href="${n.href}"${n.key === active ? raw(' aria-current="page"') : null}><span aria-hidden="true">${n.glyph}</span> ${n.label}</a>`)}</nav>
    <div class="sidebar-foot"><span class="status-dot"></span> Local workspace<small>${state.meta?.team ?? DASH}<br>Months run 1st 00:00Z</small></div>
  </aside>
  <div class="workspace">
    <header class="app-header"><span>Workspace <span class="muted">/</span> <b>${current}</b></span>
      <div class="status"><span class="status-dot ${state.stale ? 'stale' : 'live'}" aria-hidden="true"></span>${state.stale ? 'Collector stale' : 'Collector connected'}<span class="muted">${fill('age', polledText(state.ageMs))}</span></div>
    </header>
    ${banner(state)}
    <div class="content">${body}</div>
    <footer>STUDIO ANALYTICS <span>Observed data. Clear definitions. <b class="version">v${VERSION}</b></span></footer>
  </div>`;
}

export function documentFor({ body, title = 'Studio analytics', team = null }) {
  return '<!doctype html>' + String(html`<html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><title>${title} · ${team ?? 'Studio analytics'}</title><link rel="icon" href="${assetUrl('/brand/favicon.svg')}" type="image/svg+xml"><link rel="stylesheet" href="${assetUrl('/app.css')}"><script src="${assetUrl('/app.js')}" defer></script></head><body><main>${body}</main><div id="refresh-status" class="refresh-status" role="status" hidden></div></body></html>`);
}
