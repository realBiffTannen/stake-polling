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
import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { dirname, join } from 'node:path';
import { gzipSync } from 'node:zlib';
import { INSIGHTS_CSS, INSIGHTS_JS } from './insights-assets.mjs';
import { CHARTS_CSS, chartsJs } from './chart-assets.mjs';
import { LOGO_SVG, FAVICON_SVG } from './brand/logo.mjs';

const require = createRequire(import.meta.url);

/**
 * A charting library's browser build, read out of node_modules once at
 * startup - installed by npm, never copied into this repository. Null when it
 * is not installed (a checkout that skipped `npm install`): the dashboard
 * still serves every page, and each interactive chart says it could not load.
 *
 * ECharts is the full build: the heatmap, treemap and Sankey are in no smaller
 * one. It runs under this CSP - its one `new Function` is a fallback for
 * engines without JSON.parse, never reached.
 */
function vendor(locate) {
  try { return readFileSync(locate()); } catch { return null; }
}
const ECHARTS_JS = vendor(() => join(dirname(require.resolve('echarts')), 'echarts.min.js'));
const SMOOTHIE_JS = vendor(() => require.resolve('smoothie'));

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
  '/charts.css': asset(CHARTS_CSS, 'text/css; charset=utf-8'),
};
if (ECHARTS_JS) STATIC['/vendor/echarts.min.js'] = asset(ECHARTS_JS, 'text/javascript; charset=utf-8');
if (SMOOTHIE_JS) STATIC['/vendor/smoothie.js'] = asset(SMOOTHIE_JS, 'text/javascript; charset=utf-8');
// Built after the libraries so it can name them by their content-hash URLs:
// a new library version changes charts.js's own hash with it.
STATIC['/charts.js'] = asset(chartsJs({
  echarts: STATIC['/vendor/echarts.min.js'] ? assetUrl('/vendor/echarts.min.js') : null,
  smoothie: STATIC['/vendor/smoothie.js'] ? assetUrl('/vendor/smoothie.js') : null,
}), 'text/javascript; charset=utf-8');

/** The cache-busting URL a page should link for a static file. */
export function assetUrl(path) {
  return `${path}?v=${STATIC[path].version}`;
}
