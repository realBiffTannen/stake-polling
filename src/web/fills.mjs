/**
 * Request-time holes in a cached page.
 *
 * A cached page is rendered once per poll tick, but two things on it must be
 * true at the moment it is SERVED, not the moment it was rendered: how long
 * ago the collector last polled, and the countdown to its next poll (which
 * app.js counts down from the served duration). Each is rendered inside a
 * fill marker, and `refill` swaps the region for a freshly computed value on
 * every serve - so a page cached for two minutes never claims "polled 3s ago".
 */

import { raw } from './html.mjs';

const open = (name) => `<!--fill:${name}-->`;
const close = (name) => `<!--/fill:${name}-->`;

/** Mark `content` (already-rendered HTML) as the request-time region `name`. */
export function fill(name, content) {
  return raw(`${open(name)}${String(content)}${close(name)}`);
}

/**
 * Replace every marked region with `values[name]()`, or with its rendered
 * content when no value is given. Markers never reach the browser.
 */
export function refill(body, values = {}) {
  return String(body).replace(/<!--fill:([a-z-]+)-->([\s\S]*?)<!--\/fill:\1-->/g,
    (_, name, content) => (typeof values[name] === 'function' ? String(values[name]()) : content));
}
