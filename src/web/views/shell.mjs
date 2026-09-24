import { html, raw } from '../html.mjs';
import { humanAge, DASH } from '../format.mjs';
import { banner } from './parts.mjs';
import { fill } from '../fills.mjs';
import { assetUrl } from '../static.mjs';
import { VERSION } from '../../version.mjs';
import { DISCLAIMER } from '../disclaimer.mjs';
import { ICONS } from './icons.mjs';
import { msToNextBoundary, periodMs } from '../../poll/schedule.mjs';

const NAV = [
  { key: 'overview', href: '/', glyph: '▦', label: 'Overview' },
  { key: 'games', href: '/games', glyph: '▤', label: 'Games' },
  { key: 'analysis', href: '/analysis', glyph: '◔', label: 'Analysis' },
  { key: 'settlement', href: '/settlement', glyph: '$', label: 'Settlement' },
  { key: 'insights', href: '/insights', glyph: '◫', label: 'Player insights' },
  { key: 'live', href: '/live', glyph: '◉', label: 'Live operations' },
  { key: 'trends', href: '/trends', glyph: '◈', label: 'Trends' },
  { key: 'math', href: '/math', glyph: '∑', label: 'Game math' },
  { key: 'log', href: '/log', glyph: '≡', label: 'Poll log' },
  { key: 'archive', href: '/archive', glyph: '⤓', label: 'Archive' },
  { key: 'settings', href: '/settings', glyph: '⚙', label: 'Settings' },
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

/**
 * A thin bar under the header filling up towards the next poll. A fill
 * (server.mjs) like the countdown, because it must be timed from the moment
 * the page is served; app.js animates it from there.
 */
export function pollBarHtml(now, pollMinutes) {
  const minutes = Number(pollMinutes) || 0;
  if (!(minutes > 0)) return '';
  return String(html`<div class="poll-progress" data-poll-bar data-next-poll-ms="${msToNextBoundary(now, minutes)}" data-period-ms="${periodMs(minutes)}" role="progressbar" aria-label="Time to the next poll" aria-valuemin="0" aria-valuemax="100"><span></span></div>`);
}

/** The pages the command palette offers, in sidebar order. */
export const PAGES = NAV.map(({ href, label }) => ({ href, label }));

/**
 * The header's account corner, filled in per request (server.mjs) because a
 * cached page must never carry one browser's sign-in state or CSRF token.
 * Rendered here without a viewer, which is also what a page shows when the
 * server has no sign-in to report.
 */
export function viewerMenu(viewer = null) {
  if (!viewer?.enabled) {
    return String(html`<a class="signin-off" href="/settings?tab=security" title="Anyone who can reach this dashboard can use it. Turn on sign-in in Settings.">${ICONS.unlock}<span>Sign-in off</span></a>`);
  }
  const name = String(viewer.username ?? '');
  return String(html`<details class="account"><summary aria-label="Account: ${name}"><span class="avatar" aria-hidden="true">${name.slice(0, 1).toUpperCase()}</span><span class="account-name">${name}</span></summary>
    <div class="menu" role="menu"><div class="menu-head">Signed in as <b>${name}</b></div>
      <a role="menuitem" href="/settings?tab=security">${ICONS.gear} Settings</a>
      <form method="post" action="/logout"><input type="hidden" name="csrf" value="${viewer.csrf ?? ''}"><button role="menuitem" type="submit">${ICONS.logout} Sign out</button></form></div></details>`);
}

/**
 * @param {{ state: object, body: unknown, active?: string, title?: string, crumbs?: { label: string, href?: string }[] }} args
 *   `crumbs` names where the page sits below its section, e.g. a game under Game math.
 */
export function shell({ state, body, active = 'insights', title = 'Player insights', crumbs = [] }) {
  const section = NAV.find(n => n.key === active);
  const current = section?.label ?? title;
  const trail = [{ label: 'Workspace', href: '/' }, ...(crumbs.length ? [{ label: current, href: section?.href }, ...crumbs] : [{ label: current }])];
  const games = (state.rows ?? []).map((r) => ({ href: `/game/${encodeURIComponent(r.name)}`, label: r.label ?? r.name }));
  return html`<aside class="sidebar" id="sidebar">
    <a class="brand" href="/"><img class="cg-logo" src="${assetUrl('/brand/logo.svg')}" alt="Crash Galaxy" width="150" height="32"><small>STUDIO ANALYTICS</small></a>
    <div class="nav-label">WORKSPACE</div>
    <nav aria-label="Workspace">${NAV.map(n => html`<a class="${n.key === active ? 'active' : ''}" href="${n.href}"${n.key === active ? raw(' aria-current="page"') : null}><span aria-hidden="true">${n.glyph}</span> ${n.label}</a>`)}</nav>
    <div class="sidebar-foot"><span class="status-dot"></span> Local workspace<small>${state.meta?.team ?? DASH}<br>Months run 1st 00:00Z</small></div>
  </aside>
  <div class="workspace">
    <header class="app-header">
      <button type="button" class="nav-toggle" data-nav-toggle aria-controls="sidebar" aria-expanded="false" aria-label="Open navigation">${ICONS.menu}</button>
      <nav class="breadcrumbs" aria-label="Breadcrumb"><ol>${trail.map((c, i) => (i === trail.length - 1
        ? html`<li aria-current="page"><b>${c.label}</b></li>` : html`<li><a href="${c.href ?? '/'}">${c.label}</a></li>`))}</ol></nav>
      <button type="button" class="search-trigger" data-palette-open aria-haspopup="dialog">${ICONS.search}<span>Search pages and games</span><kbd>⌘K</kbd></button>
      <div class="status"><span class="status-dot ${state.stale ? 'stale' : 'live'}" aria-hidden="true"></span><span class="status-text">${state.stale ? 'Collector stale' : 'Collector connected'}</span><span class="muted">${fill('age', polledText(state.ageMs))}</span></div>
      ${fill('viewer', viewerMenu(null))}
      ${fill('pollbar', '')}
    </header>
    <div class="scrim" data-scrim hidden></div>
    <dialog class="palette" id="palette" aria-label="Search pages and games">
      <div class="palette-field">${ICONS.search}<input type="search" placeholder="Jump to a page or game…" aria-label="Search pages and games" autocomplete="off" spellcheck="false" data-palette-input></div>
      <ul class="palette-list" role="listbox" data-palette-list></ul>
      <p class="palette-hint"><kbd>↑</kbd><kbd>↓</kbd> to move · <kbd>Enter</kbd> to open · <kbd>Esc</kbd> to close</p>
      <script type="application/json" data-palette-items>${raw(JSON.stringify([...PAGES.map((p) => ({ ...p, kind: 'Page' })), ...games.map((g) => ({ ...g, kind: 'Game' }))]).replace(/</g, '\\u003c').replace(/\u2028/g, '\\u2028').replace(/\u2029/g, '\\u2029'))}</script>
    </dialog>
    ${banner(state)}
    <div class="content">${body}</div>
    <footer><div class="footer-row">STUDIO ANALYTICS <span>Observed data. Clear definitions. <b class="version">v${VERSION}</b></span></div>
      <p class="disclaimer"><b>Disclaimer.</b> ${DISCLAIMER}</p></footer>
  </div>`;
}

export function documentFor({ body, title = 'Studio analytics', team = null }) {
  return '<!doctype html>' + String(html`<html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><title>${title} · ${team ?? 'Studio analytics'}</title><link rel="icon" href="${assetUrl('/brand/favicon.svg')}" type="image/svg+xml"><link rel="stylesheet" href="${assetUrl('/app.css')}"><link rel="stylesheet" href="${assetUrl('/charts.css')}"><script src="${assetUrl('/app.js')}" defer></script><script src="${assetUrl('/charts.js')}" defer></script></head><body><main>${body}</main><div id="refresh-status" class="refresh-status" role="status" hidden></div></body></html>`);
}
