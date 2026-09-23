import { createServer } from 'node:http';
import { once } from 'node:events';
import { pipeline } from 'node:stream/promises';
import { gzipSync } from 'node:zlib';
import { html } from './html.mjs';
import { renderInsights, insightsCsv } from './views/insights.mjs';
import { shell, documentFor, polledText } from './views/shell.mjs';
import { STATIC } from './static.mjs';
import { createPageCache } from './page-cache.mjs';
import { refill } from './fills.mjs';
import { renderOverview, countdownHtml } from './views/overview.mjs';
import { renderHome } from './views/home.mjs';
import { renderAnalysis } from './views/analysis.mjs';
import { renderLog } from './views/log.mjs';
import { renderSettlement } from './views/settlement.mjs';
import { settlement, dataHealth } from '../insights/settlement.mjs';
import { listOf } from '../games.mjs';
import { spanOf, SPANS, GAME_SPANS } from '../insights/span.mjs';
import { dayBounds } from '../store/export.mjs';
import { renderGamePage } from './views/game.mjs';
import { renderModePage } from './views/mode.mjs';
import { renderBucketsPage } from './views/buckets.mjs';
import { renderTrends } from './views/trends.mjs';
import { renderMath } from './views/math.mjs';
import { renderDonate } from './views/donate.mjs';
import { renderArchive } from './views/archive.mjs';
import { gameModel } from '../math/checks.mjs';

const HEADERS = {
  'content-security-policy': "default-src 'none'; style-src 'self'; script-src 'self'; img-src 'self' data:; connect-src 'self'; base-uri 'none'; frame-ancestors 'none'; form-action 'self'",
  'x-content-type-options': 'nosniff', 'referrer-policy': 'no-referrer', 'cache-control': 'no-store',
};

/**
 * The slug of a `/game/<slug>/buckets` request, or null for every other path.
 *
 * Computed from the raw URL alone, before `read()` runs - `read()` needs to
 * know which game's per-mode trail (if any) is worth fetching for this
 * request BEFORE it fetches anything, and slug validity against the live
 * roster is checked later, against `model`, once `read()` has returned one.
 */
function bucketsSlugFrom(pathname) {
  if (!pathname.startsWith('/game/')) return null;
  let parts;
  try { parts = pathname.slice(6).split('/').map(decodeURIComponent); } catch { return null; }
  return parts.length === 2 && parts[1] === 'buckets' && parts[0] ? parts[0] : null;
}

/**
 * The query `read()` builds the insights model from. A game page scopes it to
 * its own slug: the path names the game, not a `?game=` parameter, and
 * without this every player figure on a game page was the whole studio's.
 */
function queryFor(url) {
  if (!url.pathname.startsWith('/game/')) return url.searchParams;
  let slug;
  try { slug = decodeURIComponent(url.pathname.slice(6).split('/')[0]); } catch { return url.searchParams; }
  const query = new URLSearchParams(url.searchParams);
  if (slug) query.set('game', slug);
  return query;
}

/**
 * Which per-mode trails `read()` must fetch for this request: every game's
 * for the analysis page, one game's for its own page. Both carry the tape,
 * which reads the last 24 hours of mode trail whatever span is picked.
 */
function modesFor(url) {
  if (url.pathname === '/analysis') return 'all';
  if (!url.pathname.startsWith('/game/')) return null;
  let parts;
  try { parts = url.pathname.slice(6).split('/').map(decodeURIComponent); } catch { return null; }
  return parts.length === 1 && parts[0] ? parts[0] : null;
}

/**
 * Whose longer trail `read()` must fetch: the studio's for the trends page,
 * one game's for its own page. Seven days of it - the players-online chart
 * reaches back that far and the hour-of-day profile averages over it.
 */
function historyFor(url) {
  if (url.pathname === '/trends') return 'studio';
  return modesFor(url) === 'all' ? null : modesFor(url);
}

/**
 * How many hours of trail `read()` must fetch by time, apart from the shared
 * 24-hour trail: only an analysis span longer than that asks for more.
 */
function trailHoursFor(url) {
  if (url.pathname !== '/analysis') return null;
  const hours = SPANS[spanOf(url.searchParams.get('span'))].hours ?? 0;
  return hours > 24 ? hours : null;
}

// Player insights lived at the root until the overview took it. A bookmark or
// an open tab carrying its filters still lands on it, filters intact.
const INSIGHTS_PARAMS = ['game', 'from', 'to', 'days', 'sort', 'dir'];

/** The rendered pages worth caching: every HTML route, never health or exports. */
function cacheable(pathname) {
  return ['/', '/insights', '/analysis', '/settlement', '/log', '/live', '/trends', '/math', '/donate'].includes(pathname) || pathname.startsWith('/game/');
}

const COMPRESSIBLE = /^(text\/|application\/json|image\/svg\+xml)/;

/**
 * Read-only HTTP boundary. read(query, hint) returns explicit metric view models.
 *
 * Pages are cached per data version (`version()` - the poll tick the data
 * came from): the collector writes once per poll period, so a page rendered
 * from one tick is good until the next. The two request-time values on a
 * page - how long ago the collector polled, and the countdown to its next
 * poll - are fills, recomputed on every serve (see fills.mjs). `warm(paths)`
 * renders pages into the cache ahead of the first visitor after a tick.
 */
export function createWebServer({ read, log = null, exporter = null, archive = null, version = () => null, now = Date.now, pageTtlMs = 150_000 }) {
  const pages = createPageCache({ max: 200, ttlMs: pageTtlMs, now });

  // Everything behind the static files: one rendered response, never touched
  // by caching or transport. The handler and warm() both call this.
  async function route(url) {
    const page = (body, title, state) => ({ status: 200, type: 'text/html; charset=utf-8',
      body: String(url.searchParams.get('fragment') === '1' ? body : documentFor({ body, title, team: state?.meta?.team ?? null })), state });
    const text = (status, message, extra = {}) => ({ status, type: 'text/plain', body: message, headers: extra });
    if (!['/', '/insights', '/analysis', '/settlement', '/log', '/live', '/trends', '/math', '/donate', '/archive', '/export.csv', '/healthz'].includes(url.pathname) && !url.pathname.startsWith('/game/')) return text(404, 'Page not found');
    if (url.pathname === '/log' && !log) return text(404, 'Page not found');
    if (url.pathname === '/archive' && !archive) return text(404, 'Page not found');
    if (url.pathname === '/' && INSIGHTS_PARAMS.some(p => url.searchParams.has(p))) return text(302, '', { location: `/insights?${url.searchParams}` });
    try {
      const { model, state } = await read(queryFor(url), { bucketsSlug: bucketsSlugFrom(url.pathname), modesFor: modesFor(url), teamDays: url.pathname === '/settlement' ? 2 : null, history: historyFor(url), trailHours: trailHoursFor(url) });
      if (url.pathname === '/healthz') return { status: 200, type: 'application/json', body: JSON.stringify({ ok: true, collectorStale: !!state.stale, dailySyncError: model.snapshot.error ?? null }) };
      if (url.pathname.startsWith('/game/')) {
        let parts;
        try { parts = url.pathname.slice(6).split('/').map(decodeURIComponent); } catch { return text(404, 'Unknown game'); }
        // Destructure the REST too: every other route here matches exactly, and
        // this one must as well. `/game/<slug>/mode/<mode>/anything` has a
        // trailing segment nothing consumes, and `/game/<slug>/` (an empty
        // trailing segment from the slash) is section === '' - defined, not
        // absent - so it must 404 rather than fall through as if no section
        // were given at all.
        const [slug, section, mode, ...rest] = parts;
        // The roster, or any title the catalogue lists - live or not.
        if (!model.options.some(g => g.slug === slug) && !(state.titles ?? []).some(t => t.slug === slug)) return text(404, 'Unknown game');
        if (rest.length) return text(404, 'Page not found');
        const math = gameModel(state.math, slug);
        const modeRows = Array.isArray(state.modeRows?.[slug]) ? state.modeRows[slug] : [];
        const modeDays = state.modeDays?.[slug] ?? {};
        if (section === undefined) return page(renderGamePage({ slug, model, state, math, modeRows, modeDays, span: spanOf(url.searchParams.get('span'), GAME_SPANS), online: url.searchParams.get('online') }), slug, state);
        if (section === 'mode' && mode) return page(renderModePage({ slug, mode, model, state, math, modeRows, modeDays }), `${slug} ${mode}`, state);
        if (section === 'buckets' && !mode) {
          const gameTrail = state.gameTrails?.[slug] ?? [];
          const modeTrail = state.modeTrails?.[slug] ?? [];
          return page(renderBucketsPage({ slug, model, state, cadence: url.searchParams.get('cadence'), gameTrail, modeTrail }), `${slug} buckets`, state);
        }
        return text(404, 'Page not found');
      }
      if (url.pathname === '/trends') return page(renderTrends({ model, state, catalogue: state.catalogue ?? {}, math: state.math ?? {}, online: url.searchParams.get('online'), turnover: url.searchParams.get('turnover') }), 'Trends', state);
      if (url.pathname === '/donate') return page(renderDonate({ state }), 'Donations', state);
      if (url.pathname === '/math') return page(renderMath({ model, state, math: state.math ?? {}, live: state.liveSlugs ?? [] }), 'Game math', state);
      if (url.pathname === '/export.csv') return { status: 200, type: 'text/csv; charset=utf-8', body: insightsCsv(model), headers: { 'content-disposition': 'attachment; filename="player-insights.csv"' } };
      if (url.pathname === '/analysis') return page(renderAnalysis({ state, model, span: spanOf(url.searchParams.get('span')) }), 'Analysis', state);
      if (url.pathname === '/settlement') {
        // Reconciles one upstream endpoint against another, so it reads the
        // raw snapshots rather than the dashboard's derived rows.
        const raw = state.raw ?? {};
        const roster = listOf(raw.roster?.data);
        const figures = settlement({ balance: raw.balance?.data ?? null, rows: roster, teamTrail: state.teamTrail ?? [],
          daily: model.daily ?? [], money: state.money, now: state.now });
        const health = dataHealth({ roster, games: listOf(raw.games?.data), perGame: raw.perGame ?? {},
          snapshots: { roster: raw.roster?.ts, games: raw.games?.ts, balance: raw.balance?.ts, graph: raw.graph?.ts, lifetime: raw.lifetime?.ts },
          now: state.now, pollMinutes: state.pollMinutes, money: state.money, cadence: state.cadence ?? {} });
        return page(renderSettlement({ state, model, settlement: figures, health }), 'Settlement', state);
      }
      if (url.pathname === '/log') {
        const query = new URLSearchParams(url.searchParams);
        query.delete('fragment');
        const { page: entries, sources, source } = await log(query);
        return page(renderLog({ state, page: entries, sources, source, total: entries.total }), 'Poll log', state);
      }
      if (url.pathname === '/archive') {
        // A store that cannot be listed (S3 unreachable, credentials wrong)
        // is said on the page, not turned into a 503 for the whole page.
        let listing;
        try { listing = await archive.list(); } catch (err) { listing = { ...(archive.describe?.() ?? {}), files: [], error: String(err?.message ?? err) }; }
        return page(renderArchive({ state, listing }), 'Archive', state);
      }
      if (url.pathname === '/') return page(renderHome(state), 'Overview', state);
      if (url.pathname === '/live') {
        return page(shell({ state, body: html`<div class="page-heading"><div><div class="eyebrow">RIGHT NOW</div><h1>Live operations<span>.</span></h1><p>Current roster, accounting totals and observed activity from the collector.</p></div></div>${renderOverview(state, { sort: url.searchParams.get('sort'), panes: url.searchParams.get('panes') !== '0' })}`, active: 'live', title: 'Live operations' }), 'Live operations', state);
      }
      return page(renderInsights(model, state), 'Player insights', state);
    } catch {
      return { status: 503, type: 'text/html; charset=utf-8', body: documentFor({ body: html`<div class="content"><h1>Data temporarily unavailable</h1><p>The dashboard could not read its data. Check Redis and reload.</p><a href="/">Try again</a></div>` }) };
    }
  }

  /** A cached rendered page, or a fresh render stored for its data version. */
  async function pageFor(url) {
    const key = pages.keyOf(url);
    const hit = pages.get(key, version());
    if (hit) return hit;
    const out = await route(url);
    if (out.status !== 200 || !out.state) return out;
    const entry = { status: 200, type: out.type, body: out.body, lastOk: out.state.lastOk ?? null, pollMinutes: out.state.pollMinutes };
    const v = out.state.dataVersion;
    if (v !== null && v !== undefined) pages.set(key, v, entry);
    return entry;
  }

  // The request-time values, as of this serve.
  const fillsFor = (entry) => ({
    age: () => polledText(entry.lastOk ? Math.max(0, now() - entry.lastOk) : null),
    countdown: () => countdownHtml(now(), entry.pollMinutes),
  });

  const server = createServer(async (req, res) => {
    const gzipOk = /\bgzip\b/.test(req.headers['accept-encoding'] ?? '');
    const send = (status, body, type = 'text/html; charset=utf-8', extra = {}) => {
      const headers = { ...HEADERS, 'content-type': type, ...extra };
      let payload = String(body);
      if (gzipOk && COMPRESSIBLE.test(type) && payload.length >= 1024) {
        payload = gzipSync(payload);
        headers['content-encoding'] = 'gzip';
        headers.vary = 'accept-encoding';
      }
      res.writeHead(status, headers);
      res.end(req.method === 'HEAD' ? '' : payload);
    };
    if (!['GET', 'HEAD'].includes(req.method)) return send(405, 'Method not allowed', 'text/plain', { allow: 'GET, HEAD' });
    let url;
    try { url = new URL(req.url, 'http://localhost'); } catch { return send(400, 'Invalid URL', 'text/plain'); }
    const file = STATIC[url.pathname];
    if (file) {
      // A day under its content-hash URL, then revalidated by ETag.
      const headers = { ...HEADERS, 'content-type': file.type, etag: file.etag, vary: 'accept-encoding',
        'cache-control': url.searchParams.get('v') === file.version ? 'public, max-age=86400, immutable' : 'no-cache' };
      if (req.headers['if-none-match'] === file.etag) { res.writeHead(304, headers); return res.end(); }
      const zipped = gzipOk;
      if (zipped) headers['content-encoding'] = 'gzip';
      res.writeHead(200, headers);
      return res.end(req.method === 'HEAD' ? '' : zipped ? file.gzip : file.body);
    }
    if (url.pathname === '/favicon.ico') return send(204, '', 'image/x-icon');
    if (url.pathname.startsWith('/archive/file/')) {
      // The local store's files. An S3 store answers null here - its links go
      // straight to S3, presigned - and so does any name that is not exactly
      // an archive's, so nothing outside the archive directory is reachable.
      let name;
      try { name = decodeURIComponent(url.pathname.slice('/archive/file/'.length)); } catch { return send(404, 'Not found', 'text/plain'); }
      let file = null;
      try { file = archive ? await archive.open(name) : null; } catch { file = null; }
      if (!file) return send(404, 'Not found', 'text/plain');
      res.writeHead(200, { ...HEADERS, 'content-type': 'application/gzip', 'content-length': String(file.size),
        'content-disposition': `attachment; filename="${name}"` });
      if (req.method === 'HEAD') { file.stream.destroy(); return res.end(); }
      try { await pipeline(file.stream, res); } catch { res.destroy(); }
      return;
    }
    if (url.pathname === '/export/log.csv') {
      // Raw poll-log CSV, streamed chunk by chunk straight out of Redis: a
      // whole day of every stream is a few hundred thousand rows, and holding
      // it as one string would put all of it in memory per download.
      if (!exporter) return send(404, 'Page not found', 'text/plain');
      const date = url.searchParams.get('date');
      if (date && !dayBounds(date)) return send(400, 'Give the date as YYYY-MM-DD - a real UTC calendar day.', 'text/plain');
      let out;
      try { out = await exporter(url.searchParams); } catch { return send(503, 'Export unavailable. Check Redis and retry.', 'text/plain'); }
      if (!out) return send(404, 'Unknown stream', 'text/plain');
      res.writeHead(200, { ...HEADERS, 'content-type': 'text/csv; charset=utf-8',
        'content-disposition': `attachment; filename="${String(out.filename).replace(/[^\w.-]/g, '_')}"` });
      if (req.method === 'HEAD') return res.end();
      // A failure mid-stream cannot change the status any more; the file is
      // cut short rather than the process falling over.
      try { for await (const chunk of out.chunks) if (!res.write(chunk)) await once(res, 'drain'); } catch { /* truncated */ }
      return res.end();
    }
    const out = cacheable(url.pathname) ? await pageFor(url) : await route(url);
    const body = out.status === 200 && out.type?.startsWith('text/html') && 'lastOk' in out ? refill(out.body, fillsFor(out)) : refill(out.body);
    return send(out.status, body, out.type, out.headers ?? {});
  });

  /** Render `paths` into the page cache, one after another; failures are skipped. */
  server.warm = async (paths = []) => {
    for (const path of paths) {
      try { await pageFor(new URL(path, 'http://localhost')); } catch { /* the next visitor renders it */ }
    }
  };
  return server;
}
