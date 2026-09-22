/**
 * The dashboard's static files, cacheable for a day.
 *
 * Each is served under a content-hash URL (`assetUrl`), so a browser can keep
 * it without asking again: a redeploy that changes a byte changes the hash,
 * and the page links the new URL. The gzipped body is computed once here
 * rather than on every request.
 *
 * The wordmark used to be inlined into every page - 23 KB inside every page
 * AND every 30-second live refresh of it. As a file it is fetched once.
 */

import { createHash } from 'node:crypto';
import { gzipSync } from 'node:zlib';
import { INSIGHTS_CSS, INSIGHTS_JS } from './insights-assets.mjs';
import { LOGO_SVG, FAVICON_SVG } from './brand/logo.mjs';

// Inline, the vendored wordmark repeats `role` and `aria-label` on its root -
// harmless in HTML, but a standalone image/svg+xml file must be valid XML, and
// a repeated attribute fails to load. The <img> carries the accessible name.
const LOGO_FILE = LOGO_SVG.replace(/^<svg[^>]*>/, (root) => {
  const seen = new Set();
  return root.replace(/\s([a-zA-Z:-]+)="[^"]*"/g, (attr, name) => {
    if (seen.has(name) || name === 'class') return '';
    seen.add(name);
    return attr;
  });
});

function asset(body, type) {
  const version = createHash('sha256').update(body).digest('hex').slice(0, 16);
  return { body, type, etag: `"${version}"`, version, gzip: gzipSync(body) };
}

export const STATIC = {
  '/app.css': asset(INSIGHTS_CSS, 'text/css; charset=utf-8'),
  '/app.js': asset(INSIGHTS_JS, 'text/javascript; charset=utf-8'),
  '/brand/logo.svg': asset(LOGO_FILE, 'image/svg+xml; charset=utf-8'),
  '/brand/favicon.svg': asset(FAVICON_SVG, 'image/svg+xml; charset=utf-8'),
};

/** The cache-busting URL a page should link for a static file. */
export function assetUrl(path) {
  return `${path}?v=${STATIC[path].version}`;
}
