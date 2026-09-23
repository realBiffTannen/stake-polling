import { test, after } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';
import { createWebServer } from '../src/web/server.mjs';
import { buildInsights } from '../src/insights/model.mjs';
import { localStore, dashboardArchive } from '../src/archive/stores.mjs';

const now = Date.parse('2026-09-23T03:00:00Z');
const snapshot = { trackingStart: '2026-07-24', days: {}, cumulative: {} };
// A space in the path on purpose: a file:// URL must encode it.
const root = await mkdtemp(join(tmpdir(), 'stake-web-archive-'));
const dir = join(root, 'my archive');
after(() => rm(root, { recursive: true, force: true }));

/** Exactly what bin/stake-web.mjs builds, over a real local store. */
const localArchive = (store, status = null) => dashboardArchive({ store, readStatus: async () => status });

async function setup(t, archive) {
  const server = createWebServer({ archive, read: async (query) => ({ model: buildInsights({ snapshot, now, query }),
    state: { now, meta: { team: 'acme-studios' }, rows: [], ageMs: 1000 } }) });
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
  t.after(() => new Promise((resolve) => { server.close(resolve); server.closeAllConnections(); }));
  return `http://127.0.0.1:${server.address().port}`;
}

test('the archive page lists every stored day with a download link, and the dashboard serves the local file', async (t) => {
  const store = localStore(dir);
  await store.put('stake-all-2026-09-22.csv.gz', Buffer.from('gzipped-bytes'));
  const base = await setup(t, localArchive(store, { ranAt: now - 3 * 3_600_000, destination: dir, stored: [{ date: '2026-09-22' }], failed: [], error: null }));
  const page = await (await fetch(`${base}/archive`)).text();
  assert.match(page, /<h1>Archive<span>\.<\/span><\/h1>/);
  assert.match(page, /Local directory: /);
  assert.match(page, /<td>2026-09-22<\/td>/);
  assert.match(page, /href="\/archive\/file\/stake-all-2026-09-22\.csv\.gz"/);
  assert.match(page, /Stored 2026-09-22\./);
  // The file itself, on this machine's disk: its file:// URL and its path.
  const onDisk = join(dir, 'stake-all-2026-09-22.csv.gz');
  const fileUrl = pathToFileURL(onDisk).href;
  assert.match(fileUrl, /my%20archive/);
  assert.ok(page.includes(`href="${fileUrl}"`), fileUrl);
  assert.ok(page.includes(`<code class="local-path">${onDisk}</code>`), onDisk);
  assert.match(page, /Most browsers will not open a file:\/\/ link/);
  assert.match(page, /class="active" href="\/archive"/, 'in the nav, and the page in use');
  const file = await fetch(`${base}/archive/file/stake-all-2026-09-22.csv.gz`);
  assert.equal(file.status, 200);
  assert.equal(file.headers.get('content-type'), 'application/gzip');
  assert.equal(file.headers.get('content-disposition'), 'attachment; filename="stake-all-2026-09-22.csv.gz"');
  assert.equal(await file.text(), 'gzipped-bytes');
});

test('nothing outside the archive directory is reachable through the file route', async (t) => {
  const base = await setup(t, localArchive(localStore(dir)));
  for (const path of ['/archive/file/..%2F..%2Fconfig.json', '/archive/file/%2Fetc%2Fpasswd', '/archive/file/stake-all-2026-09-01.csv.gz', '/archive/file/%E0%A4%A']) {
    assert.equal((await fetch(base + path)).status, 404, path);
  }
});

test('an S3 archive links each file straight to its presigned URL and says until when it is good', async (t) => {
  const archive = { describe: () => ({ kind: 's3', where: 's3://acme-archive/stake-polling/acme-studios/', presignSeconds: 3600 }),
    list: async () => ({ kind: 's3', where: 's3://acme-archive/stake-polling/acme-studios/', presignSeconds: 3600, status: null,
      files: [{ name: 'stake-all-2026-09-22.csv.gz', date: '2026-09-22', bytes: 2048, modified: now, url: 'https://acme-archive.s3.amazonaws.com/k?X-Amz-Signature=abc&X-Amz-Expires=3600' }] }),
    open: async () => null };
  const base = await setup(t, archive);
  const page = await (await fetch(`${base}/archive`)).text();
  assert.match(page, /S3: s3:\/\/acme-archive\/stake-polling\/acme-studios\//);
  assert.match(page, /href="https:\/\/acme-archive\.s3\.amazonaws\.com\/k\?X-Amz-Signature=abc&amp;X-Amz-Expires=3600"/);
  assert.match(page, /<summary>Presigned URL<\/summary>/);
  assert.doesNotMatch(page, /file:\/\/|local-path/, 'an S3 archive names no local disk');
  assert.match(page, /presigned until 04:00/);
  assert.match(page, /2\.00K/);
  assert.equal((await fetch(`${base}/archive/file/stake-all-2026-09-22.csv.gz`)).status, 404, 'S3 files are never proxied');
});

test('a store that cannot be listed is said on the page, not a 503', async (t) => {
  const base = await setup(t, { describe: () => ({ kind: 's3', where: 's3://acme-archive/x/' }), list: async () => { throw new Error('AccessDenied'); }, open: async () => null });
  const res = await fetch(`${base}/archive`);
  assert.equal(res.status, 200);
  assert.match(await res.text(), /Could not list the archive: AccessDenied/);
});

test('a store that could not be set up says why, with no files', async (t) => {
  const base = await setup(t, dashboardArchive({ store: null, setupError: 'no credentials', readStatus: async () => null }));
  assert.match(await (await fetch(`${base}/archive`)).text(), /could not be set up: no credentials/);
});

test('without an archive the page does not exist', async (t) => {
  const base = await setup(t, null);
  assert.equal((await fetch(`${base}/archive`)).status, 404);
  assert.equal((await fetch(`${base}/archive/file/stake-all-2026-09-22.csv.gz`)).status, 404);
});
