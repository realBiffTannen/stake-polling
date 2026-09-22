/**
 * The document shell.
 *
 * `<main>` is the swap boundary: the client replaces its contents on a tick,
 * so everything inside it must be re-renderable from scratch and nothing
 * outside it may hold state. `fragment()` renders exactly what goes inside,
 * and `page()` renders its main through the same function so the two cannot
 * drift.
 *
 * The banner is INSIDE the boundary deliberately. In the shell it would never
 * reach a tab that was already open, and "the sid just expired" is only worth
 * saying to somebody already watching. It must therefore be rendered exactly
 * once, by `fragment()`, and NOT again in the shell around `<main>`.
 */

import { html, raw } from '../html.mjs';
import { utcClock, humanAge, usd, int } from '../format.mjs';
import { banner } from './parts.mjs';

export function page({ title, state, body, active }) {
  const age = state.ageMs === null || state.ageMs === undefined ? 'never' : `${humanAge(state.ageMs)} ago`;
  return `<!doctype html>` + String(html`
<html lang="en"><head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>${title} - ${state.meta?.team ?? 'roster'}</title>
<link rel="stylesheet" href="/app.css">
<script src="/app.js" defer></script>
</head><body>
<header class="top">
  <h1><a href="/">${state.meta?.team ?? 'roster'}</a></h1>
  ${active === 'overview' ? null : html`<span class="dim">${title}</span>`}
  <span class="dim">${utcClock(state.now)}</span>
  <span>online <b>${int(state.online)}</b></span>
  <span class="dim">position ${usd(state.team)}</span>
  <span class="dim">carry ${usd(state.carry)}</span>
  <span class="${state.stale ? 'bad' : 'dim'}">poll ${age}</span>
</header>
<main>${raw(fragment(state, body))}</main>
</body></html>`);
}

/** Just the inside of `<main>`, for the live swap. The banner leads it. */
export function fragment(state, body) {
  return String(html`${banner(state)}${raw(String(body))}`);
}
