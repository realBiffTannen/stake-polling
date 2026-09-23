/**
 * The demo dashboard as a static site: crawl the real web server, then save
 * every page and file under a path a static host can serve.
 *
 * S3's website endpoint ignores query strings, and the dashboard says a lot
 * with them (/analysis?span=24h, /game/x?span=today, CSV and PDF exports). So
 * every URL with a query gets its own directory - /analysis?span=24h becomes
 * /analysis/q/span-24h/ - and every link is rewritten to match. Asset URLs
 * that carry only a cache-busting ?v= stay as they are: S3 serves the file
 * and the query does no harm.
 *
 * A link the crawl did not follow (it was over a budget, or skipped as too
 * big) falls back to its page without the query, or to the overview, so the
 * demo has no dead ends.
 */

const ASSET_ONLY = new Set(['v']);
const EXTENSIONS = { 'text/html': '', 'text/css': '.css', 'text/javascript': '.js', 'application/javascript': '.js', 'application/json': '.json',
  'image/svg+xml': '.svg', 'image/png': '.png', 'application/pdf': '.pdf', 'text/csv': '.csv', 'application/gzip': '.gz' };

/** The crawl's key for a URL: path plus sorted query, never the live-refresh flag. */
export function urlKey(href, base = 'http://demo.invalid') {
  let url;
  try { url = new URL(href, base); } catch { return null; }
  if (url.origin !== new URL(base).origin) return null;
  url.searchParams.delete('fragment');
  const params = [...url.searchParams].sort(([a, x], [b, y]) => (a === b ? (x < y ? -1 : 1) : a < b ? -1 : 1));
  return params.length ? `${url.pathname}?${new URLSearchParams(params)}` : url.pathname;
}

const queryName = (search) => [...new URLSearchParams(search)]
  .map(([k, v]) => `${k}-${v}`).join('_').replace(/[^A-Za-z0-9._-]+/g, '~').slice(0, 180);

/**
 * Where a crawled URL is saved, and the href that reaches it on a static host.
 * @returns {{ file: string, href: string }}
 */
export function staticPath(key, contentType = 'text/html') {
  const [path, search = ''] = key.split('?');
  const type = String(contentType).split(';')[0].trim();
  const html = type === 'text/html';
  const params = new URLSearchParams(search);
  const onlyAsset = search && [...params.keys()].every((k) => ASSET_ONLY.has(k));
  if (!search || onlyAsset) {
    if (!html) return { file: path.replace(/^\//, ''), href: onlyAsset ? key : path };
    const dir = path.replace(/^\/|\/$/g, '');
    return { file: dir ? `${dir}/index.html` : 'index.html', href: dir ? `/${dir}/` : '/' };
  }
  const q = queryName(search);
  if (html) {
    const dir = `${path.replace(/^\/|\/$/g, '')}/q/${q}`.replace(/^\//, '');
    return { file: `${dir}/index.html`, href: `/${dir}/` };
  }
  const ext = EXTENSIONS[type] ?? '';
  const stem = path.replace(/^\//, '').replace(/\.[a-z0-9]+$/i, '');
  return { file: `${stem}/q/${q}${ext}`, href: `/${stem}/q/${q}${ext}` };
}

const decode = (s) => s.replace(/&amp;/g, '&').replace(/&#39;/g, "'").replace(/&quot;/g, '"');

/** Every same-origin href, src and palette link in a page, as crawl keys. */
export function linksIn(html, base = 'http://demo.invalid') {
  const out = new Set();
  for (const m of String(html).matchAll(/\b(?:href|src)="(\/[^"]*)"/g)) { const k = urlKey(decode(m[1]), base); if (k) out.add(k); }
  for (const m of String(html).matchAll(/"href":"(\/[^"]*)"/g)) { const k = urlKey(m[1], base); if (k) out.add(k); }
  return [...out];
}

/**
 * Point every internal link at its static path. `resolve(key)` gives the new
 * href for a crawled key, or null; an uncrawled link falls back to its page
 * without the query, then to the overview.
 */
export function rewriteLinks(html, resolve) {
  const target = (raw) => {
    if (raw.startsWith('//')) return raw;
    const hash = raw.includes('#') ? raw.slice(raw.indexOf('#')) : '';
    const key = urlKey(decode(raw.split('#')[0]));
    if (key === null) return raw;
    return (resolve(key) ?? resolve(key.split('?')[0]) ?? '/') + hash;
  };
  return String(html)
    .replace(/\b(href|src)="(\/[^"]*)"/g, (_, attr, raw) => `${attr}="${target(raw).replace(/&/g, '&amp;')}"`)
    .replace(/"href":"(\/[^"]*)"/g, (_, raw) => `"href":"${target(raw)}"`);
}

/**
 * Mark a page as the demo: the stylesheet shows a banner, app.js turns forms
 * into a note instead of a post, and data-static stops the live refresh -
 * there is no server behind a static page to refresh from.
 */
export function markDemo(html, { banner }) {
  return String(html)
    .replace(/<html\b/, '<html data-demo')
    .replace(/<main>/, '<main><div data-static hidden></div>')
    .replace(/<div class="workspace">/, `<div class="workspace"><div class="demo-banner" role="note">${banner}</div>`);
}

/**
 * Crawl breadth-first from `start`, following same-origin links in HTML.
 * @param {{ base: string, start?: string[], limit?: number, perPath?: number, skip?: (key: string) => boolean, fetchImpl?: typeof fetch }} opts
 * @returns {Promise<Map<string, { status: number, type: string, body: Buffer }>>}
 */
export async function crawl({ base, start = ['/'], limit = 2000, perPath = 40, skip = () => false, fetchImpl = fetch }) {
  const pages = new Map();
  const queue = start.map((s) => urlKey(s, base));
  const seen = new Set(queue);
  const perPathCount = new Map();
  while (queue.length && pages.size < limit) {
    const key = queue.shift();
    const res = await fetchImpl(new URL(key, base), { redirect: 'manual' });
    const type = res.headers.get('content-type') ?? '';
    const body = Buffer.from(await res.arrayBuffer());
    pages.set(key, { status: res.status, type, body });
    if (res.status !== 200 || !type.startsWith('text/html')) continue;
    for (const link of linksIn(body.toString('utf8'), base)) {
      if (seen.has(link) || skip(link)) continue;
      const path = link.split('?')[0];
      const n = perPathCount.get(path) ?? 0;
      if (link.includes('?') && n >= perPath) continue;
      perPathCount.set(path, n + 1);
      seen.add(link);
      queue.push(link);
    }
  }
  return pages;
}
