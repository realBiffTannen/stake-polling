#!/usr/bin/env node
/**
 * Build the demo dashboard: a static copy of the real dashboard, showing a
 * made-up studio, ready to host on S3 (scripts/demo-deploy.mjs).
 *
 *   npm run demo:build                 writes dist/demo/
 *   npm run demo:build -- --out DIR
 *
 * How, with no real data anywhere in it:
 *   1. src/demo/model.mjs generates twenty fictional games - every figure the
 *      Engine API would report, from a fixed seed.
 *   2. The real collector (src/poll/poller.mjs) polls that fake API through
 *      three simulated days, one 2.5-minute tick at a time, into its own Redis
 *      namespace - so the trail, per-mode fields, running log and alerts are
 *      written by the same code as a real install's.
 *   3. The daily history, rollups, a nightly archive file and the captured
 *      math are made the way the real processes make them.
 *   4. The real web server (bin/stake-web.mjs) serves that namespace; every
 *      page, span, game page and export is crawled and saved as static files
 *      (src/demo/site.mjs), with links rewritten for a static host.
 *   5. The demo namespace is deleted from Redis again.
 *
 * Needs a local Redis. Writes only under its own team namespace
 * (stake:demo-studio:*) in DEMO_REDIS_URL (default database 3), and deletes it
 * afterwards.
 */
import { spawn } from 'node:child_process';
import { mkdtemp, mkdir, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createServer } from 'node:net';
import { loadConfig } from '../src/config.mjs';
import { connect } from '../src/store/redis.mjs';
import { keys } from '../src/store/keys.mjs';
import { readTrails, readSnapshot } from '../src/store/reader.mjs';
import { Poller } from '../src/poll/poller.mjs';
import { AlertGate } from '../src/detect/alerts.mjs';
import { syncDaily } from '../src/insights/sync.mjs';
import { buildRollups } from '../src/insights/rollup.mjs';
import { buildArchive, statusOf } from '../src/archive/archive.mjs';
import { localStore } from '../src/archive/stores.mjs';
import { STATIC } from '../src/web/static.mjs';
import { buildModel, api as fakeApi, demoMoment, DEMO, DEMO_TEAM } from '../src/demo/model.mjs';
import { demoMath } from '../src/demo/math.mjs';
import { crawl, staticPath, rewriteLinks, markDemo } from '../src/demo/site.mjs';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const REPO = 'https://github.com/realBiffTannen/stake-polling';
const args = process.argv.slice(2);
const outDir = args.includes('--out') ? args[args.indexOf('--out') + 1] : join(ROOT, 'dist', 'demo');
const redisUrl = process.env.DEMO_REDIS_URL || 'redis://127.0.0.1:6379/3';
const iso = (ms) => new Date(ms).toISOString().slice(0, 10);
const log = (...parts) => console.log('demo:', ...parts);

const realNow = Date.now();
const asOf = Math.floor(demoMoment(realNow) / DEMO.SLOT_MS) * DEMO.SLOT_MS;
const model = buildModel({ now: asOf });
const k = keys(DEMO_TEAM);
const config = loadConfig({ env: { STAKE_TEAM: DEMO_TEAM, STAKE_LIFETIME_START: iso(model.firstDay), REDIS_URL: redisUrl }, local: null });
const client = await connect(redisUrl);
const work = await mkdtemp(join(tmpdir(), 'stake-demo-'));
let web = null;

async function clearNamespace() {
  for await (const batch of client.scanIterator({ MATCH: `${k.ns}:*`, COUNT: 500 })) {
    const found = Array.isArray(batch) ? batch : [batch];
    if (found.length) await client.del(found);
  }
}

try {
  await clearNamespace();
  log(`a made-up studio of ${model.games.length} games, as of ${new Date(asOf).toISOString()}`);

  // 2. The real collector, through three simulated days.
  const api = fakeApi(model);
  const poller = new Poller({ api, client, keys: k, config, gate: new AlertGate(config.detect) });
  const from = asOf - (DEMO.SLOT_DAYS - 1) * DEMO.DAY_MS;
  let index = 0;
  for (let t = from; t <= asOf; t += DEMO.SLOT_MS) {
    model.now = t;
    await poller.tick(t, index++);
    if (index % 288 === 0) log(`polled ${index} ticks (${new Date(t).toISOString().slice(0, 16)}Z)`);
  }
  model.now = asOf;
  log(`polled ${index} ticks`);

  // 3. Daily history, rollups, an archive file, the archiver's last run, and captured math.
  const snapshot = await syncDaily({ api, now: asOf, days: 30, trackingStart: iso(model.firstDay) });
  await client.set(k.dailyInsights, JSON.stringify(snapshot));
  const listing = (await readSnapshot(client, k.games))?.data ?? [];
  const trails = await readTrails(client, k, listing.map((g) => g.slug), Math.ceil(1440 / config.pollMinutes) * 31, { modes: true });
  const rollups = buildRollups({ previous: {}, trails, listing, snapshot, now: asOf });
  await client.set(k.modeRollup, JSON.stringify(rollups.modes));
  await client.set(k.catalogue, JSON.stringify(rollups.catalogue));
  const archiveDir = join(work, 'stake-polling-logrotate-data');
  const store = localStore(archiveDir);
  const yesterday = iso(asOf - DEMO.DAY_MS);
  const built = await buildArchive(client, k, yesterday);
  if (built) await store.put(built.name, built.body);
  await client.set(k.archiveStatus, JSON.stringify(statusOf({ now: DEMO.dayStart(asOf), store,
    results: built ? [{ date: yesterday, outcome: 'stored', name: built.name, bytes: built.body.length, entries: built.entries }] : [] })));
  const mathFile = join(work, 'math.json');
  await writeFile(mathFile, JSON.stringify(demoMath(model), null, 2));

  // 4. The real web server on that namespace, its clock at the demo's moment.
  const port = await new Promise((resolve) => { const s = createServer().listen(0, '127.0.0.1', () => { const p = s.address().port; s.close(() => resolve(p)); }); });
  web = spawn(process.execPath, ['--import', join(ROOT, 'scripts/demo/clock.mjs'), join(ROOT, 'bin/stake-web.mjs'), '--host', '127.0.0.1', '--port', String(port)], {
    env: { ...process.env, STAKE_TEAM: DEMO_TEAM, STAKE_LIFETIME_START: iso(model.firstDay), REDIS_URL: redisUrl, STAKE_WEB_SYNC: '0',
      STAKE_ARCHIVE_DIR: archiveDir, STAKE_MATH_FILE: mathFile, S3_BUCKET: '', REDIS_DB_SIZE: '2GB', DEMO_CLOCK_OFFSET_MS: String(asOf + 60_000 - realNow) },
    stdio: ['ignore', 'ignore', 'inherit'] });
  const base = `http://127.0.0.1:${port}`;
  for (let i = 0; i < 60; i++) {
    try { if ((await fetch(`${base}/healthz`)).ok) break; } catch { /* not up yet */ }
    await new Promise((r) => setTimeout(r, 250));
  }

  // Every page and file a visitor can reach, less the raw poll-log exports
  // (every stream of every day: large, and the page's own form is off in the demo).
  // Game and trend pages follow one picker at a time: a picker's link carries
  // every other picker's setting too, and all their combinations would be
  // hundreds of near-identical pages.
  const onePicker = (key) => /^\/(game|trends)\b/.test(key) && new URLSearchParams(key.split('?')[1] ?? '').size > 1;
  const pages = await crawl({ base, start: ['/', ...Object.keys(STATIC)], limit: 2500, perPath: 40,
    skip: (key) => key.startsWith('/export/log.csv') || key.startsWith('/login') || onePicker(key) });
  const resolve = (key) => { const p = pages.get(key); return p && p.status === 200 ? staticPath(key, p.type).href : null; };
  const banner = `This is a demo: every game and figure on it is made up, generated by a script and replayed through the real collector. <a href="${REPO}">Get stake-polling</a> to see your own studio.`;
  await rm(outDir, { recursive: true, force: true });
  let files = 0, bytes = 0;
  for (const [key, page] of pages) {
    if (page.status !== 200) continue;
    const { file } = staticPath(key, page.type);
    let body = page.body;
    if (page.type.startsWith('text/html')) {
      // The build machine's temporary paths never reach the demo.
      const html = rewriteLinks(body.toString('utf8'), resolve).replaceAll(work, '/srv/stake-polling');
      body = Buffer.from(markDemo(html, { banner }));
    }
    await mkdir(dirname(join(outDir, file)), { recursive: true });
    await writeFile(join(outDir, file), body);
    files++; bytes += body.length;
  }
  await writeFile(join(outDir, 'error.html'), markDemo((pages.get('/')?.body ?? Buffer.from('')).toString('utf8').replace(/<h1>[\s\S]*?<\/h1>/, '<h1>Not in the demo<span>.</span></h1>'), { banner }));
  const skipped = [...pages.values()].filter((p) => p.status !== 200).length;
  log(`${files} files, ${(bytes / 1e6).toFixed(1)} MB, written to ${outDir}${skipped ? `; ${skipped} URLs answered other than 200 and were left out` : ''}`);
} finally {
  web?.kill('SIGKILL');
  await clearNamespace().catch(() => {});
  await client.quit().catch(() => {});
  await rm(work, { recursive: true, force: true });
}
