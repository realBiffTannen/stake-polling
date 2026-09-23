import { test, after } from 'node:test';
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { mkdtemp, rm, readFile, writeFile, readdir, copyFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { gunzipSync } from 'node:zlib';
import { nextMidnight, pendingDays, buildArchive, archivePending, statusOf, archiveName } from '../src/archive/archive.mjs';
import { localStore, s3Store, storeFor } from '../src/archive/stores.mjs';
import { loadConfig } from '../src/config.mjs';
import { connect } from '../src/store/redis.mjs';
import { keys } from '../src/store/keys.mjs';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const TEST_ENV = { STAKE_TEAM: 'acme-studios', STAKE_LIFETIME_START: '2026-07-24' };
const k = keys('archive-test-team');
const scratch = await mkdtemp(join(tmpdir(), 'stake-archive-'));
after(() => rm(scratch, { recursive: true, force: true }));

// ------------------------------------------------------------ schedule
test('the next run is the next 00:00:00Z, never the current instant', () => {
  assert.equal(nextMidnight(Date.parse('2026-09-22T23:59:59.999Z')), Date.parse('2026-09-23T00:00:00Z'));
  assert.equal(nextMidnight(Date.parse('2026-09-23T00:00:00Z')), Date.parse('2026-09-24T00:00:00Z'), 'run at midnight, schedule the next one');
});

test('pending days are finished days the store lacks, oldest first, and never today', () => {
  const now = Date.parse('2026-09-23T00:00:00.050Z');
  assert.deepEqual(pendingDays({ now, have: new Set(), catchUpDays: 3 }), ['2026-09-20', '2026-09-21', '2026-09-22']);
  assert.deepEqual(pendingDays({ now, have: new Set(['2026-09-21', '2026-09-22']), catchUpDays: 3 }), ['2026-09-20']);
  assert.deepEqual(pendingDays({ now: Date.parse('2026-09-23T13:00:00Z'), have: new Set(['2026-09-22']), catchUpDays: 1 }), []);
});

// ------------------------------------------------------------ building
/** Just the Redis calls the archive makes, over an in-memory set of streams. */
function fakeRedis(streams) {
  return {
    async *scanIterator({ MATCH }) {
      const prefix = MATCH.replace(/\*$/, '');
      yield Object.keys(streams).filter((key) => key.startsWith(prefix));
    },
    async type(key) { return streams[key] ? 'stream' : 'none'; },
    async xRange(key, start, end, { COUNT }) {
      const ms = (id) => Number(String(id).replace(/^\(/, '').split('-')[0]);
      const lo = start === '-' ? -Infinity : ms(start);
      const exclusive = String(start).startsWith('(');
      const hi = end === '+' ? Infinity : ms(end);
      return (streams[key] ?? []).filter((r) => (exclusive ? ms(r.id) > lo : ms(r.id) >= lo) && ms(r.id) <= hi).slice(0, COUNT);
    },
  };
}
const day = Date.parse('2026-09-22T00:00:00Z');
const streams = {
  [k.tsTeam]: [
    { id: `${day - 150_000}-0`, message: { position: '1' } },
    { id: `${day}-0`, message: { position: '2' } },
    { id: `${day + 86_250_000}-0`, message: { position: '3' } },
    { id: `${day + 86_400_000}-0`, message: { position: '4' } },
  ],
  [k.tsGame('berry')]: [{ id: `${day + 150_000}-0`, message: { count: '10', profit: '-5' } }],
};

test('a day\'s archive is the gzipped all-streams CSV for exactly [00:00Z, next 00:00Z)', async () => {
  const built = await buildArchive(fakeRedis(streams), k, '2026-09-22');
  assert.equal(built.name, 'stake-all-2026-09-22.csv.gz');
  assert.equal(built.entries, 3);
  const csv = gunzipSync(built.body).toString('utf8');
  assert.equal(csv.split('\r\n')[0], 'time_utc,entry_id,stream,field,value');
  assert.match(csv, /2026-09-22T00:00:00\.000Z,\d+-0,ts:team,position,2/);
  assert.match(csv, /ts:berry,profit,-5/);
  assert.doesNotMatch(csv, /position,1\r\n/, 'the day before is not in it');
  assert.doesNotMatch(csv, /position,4\r\n/, 'nor the next midnight');
});

test('a day Redis holds nothing for makes no file at all', async () => {
  assert.equal(await buildArchive(fakeRedis(streams), k, '2026-08-01'), null);
});

test('a run archives each missing day, skips empty ones, and one failure does not stop the rest', async () => {
  const put = [];
  const store = { where: 'mem', list: async () => [{ date: '2026-09-21' }], put: async (name, body) => {
    if (name.includes('2026-09-20')) throw new Error('AccessDenied');
    put.push(name);
  } };
  const withEarlier = { ...streams, [k.tsOnline]: [{ id: `${day - 86_400_000 * 2 + 5}-0`, message: { onlinePlayers: '3' } }] };
  const results = await archivePending({ client: fakeRedis(withEarlier), k, store, now: Date.parse('2026-09-23T00:00:01Z'), catchUpDays: 4 });
  assert.deepEqual(results.map((r) => [r.date, r.outcome]), [['2026-09-19', 'empty'], ['2026-09-20', 'failed'], ['2026-09-22', 'stored']]);
  assert.deepEqual(put, ['stake-all-2026-09-22.csv.gz']);
  const status = statusOf({ now: 1, store, results });
  assert.deepEqual(status.failed, [{ date: '2026-09-20', error: 'AccessDenied' }]);
  assert.equal(status.stored[0].date, '2026-09-22');
});

// ------------------------------------------------------------ local store
test('the local store writes atomically, lists newest first, and serves only archive names', async () => {
  const dir = join(scratch, 'local');
  const store = localStore(dir);
  assert.deepEqual(await store.list(), [], 'no directory yet is no files, not an error');
  await store.put(archiveName('2026-09-21'), Buffer.from('a'));
  await store.put(archiveName('2026-09-22'), Buffer.from('bb'));
  await writeFile(join(dir, 'notes.txt'), 'not an archive');
  assert.deepEqual((await store.list()).map((f) => [f.date, f.bytes]), [['2026-09-22', 2], ['2026-09-21', 1]]);
  assert.deepEqual((await readdir(dir)).filter((n) => n.endsWith('.tmp')), [], 'no temp file left behind');
  assert.equal(store.url('stake-all-2026-09-22.csv.gz'), '/archive/file/stake-all-2026-09-22.csv.gz');
  assert.equal(store.path('../config.json'), null);
  assert.equal(store.path('notes.txt'), null);
  assert.equal(store.fileUrl('stake-all-2026-09-22.csv.gz'), `file://${join(dir, 'stake-all-2026-09-22.csv.gz')}`);
  assert.equal(store.fileUrl('../config.json'), null);
  const { fileUrl } = store;
  assert.ok(fileUrl('stake-all-2026-09-22.csv.gz'), 'works detached from the store');
  await assert.rejects(store.put('../escape.csv.gz', Buffer.from('x')), /not an archive name/);
});

// ------------------------------------------------------------ S3 store
function fakeS3(pages) {
  const sent = [];
  const cmd = (type) => class { constructor(input) { this.type = type; this.input = input; } };
  const commands = { PutObjectCommand: cmd('put'), ListObjectsV2Command: cmd('list'), GetObjectCommand: cmd('get') };
  let page = 0;
  const client = { async send(c) { sent.push(c); return c.type === 'list' ? pages[page++] : {}; } };
  const signed = [];
  const getSignedUrl = async (_client, c, opts) => { signed.push({ input: c.input, opts }); return `https://signed.example/${c.input.Key}?X-Amz-Expires=${opts.expiresIn}`; };
  return { sent, signed, deps: { client, commands, getSignedUrl } };
}

test('the S3 store puts under its prefix, lists every page, and presigns a download', async () => {
  const s3 = fakeS3([
    { Contents: [{ Key: 'stake-polling/acme/stake-all-2026-09-21.csv.gz', Size: 10, LastModified: new Date('2026-09-22T00:00:05Z') }, { Key: 'stake-polling/acme/other.txt', Size: 1 }],
      IsTruncated: true, NextContinuationToken: 'next' },
    { Contents: [{ Key: 'stake-polling/acme/stake-all-2026-09-22.csv.gz', Size: 20 }], IsTruncated: false },
  ]);
  const store = s3Store({ bucket: 'acme-archive', prefix: 'stake-polling/acme/', presignSeconds: 900 }, s3.deps);
  assert.equal(store.where, 's3://acme-archive/stake-polling/acme/');
  await store.put('stake-all-2026-09-22.csv.gz', Buffer.from('x'));
  assert.deepEqual({ ...s3.sent[0].input, Body: undefined }, { Bucket: 'acme-archive', Key: 'stake-polling/acme/stake-all-2026-09-22.csv.gz', Body: undefined, ContentType: 'application/gzip' });
  const files = await store.list();
  assert.deepEqual(files.map((f) => [f.name, f.bytes]), [['stake-all-2026-09-22.csv.gz', 20], ['stake-all-2026-09-21.csv.gz', 10]]);
  assert.equal(s3.sent[2].input.ContinuationToken, 'next');
  const url = await store.url('stake-all-2026-09-22.csv.gz');
  assert.match(url, /X-Amz-Expires=900/);
  assert.equal(s3.signed[0].input.ResponseContentDisposition, 'attachment; filename="stake-all-2026-09-22.csv.gz"');
  assert.equal(store.url('../../secret'), null);
});

test('with S3_BUCKET set, the real SDK presigns a GET for the right bucket and key, offline', async () => {
  const env = { AWS_ACCESS_KEY_ID: 'AKIDEXAMPLE', AWS_SECRET_ACCESS_KEY: 'wJalrXUtnFEMI/K7MDENG+bPxRfiCYEXAMPLEKEY' };
  const saved = Object.fromEntries(Object.keys(env).map((key) => [key, process.env[key]]));
  Object.assign(process.env, env);
  try {
    const config = loadConfig({ env: { ...TEST_ENV, S3_BUCKET: 'acme-archive', AWS_REGION: 'us-west-2', S3_PRESIGN_SECONDS: '600' }, local: null });
    const store = await storeFor(config);
    assert.equal(store.where, 's3://acme-archive/stake-polling/acme-studios/');
    const url = new URL(await store.url('stake-all-2026-09-22.csv.gz'));
    assert.equal(url.hostname, 'acme-archive.s3.us-west-2.amazonaws.com');
    assert.equal(url.pathname, '/stake-polling/acme-studios/stake-all-2026-09-22.csv.gz');
    assert.equal(url.searchParams.get('X-Amz-Expires'), '600');
    assert.ok(url.searchParams.get('X-Amz-Signature'));
  } finally {
    for (const [key, value] of Object.entries(saved)) { if (value === undefined) delete process.env[key]; else process.env[key] = value; }
  }
});

// ------------------------------------------------------------ configuration
test('no S3_BUCKET means the local directory; a bad bucket or presign length fails at start-up', () => {
  const local = loadConfig({ env: TEST_ENV, local: null }).archive;
  assert.equal(local.bucket, null);
  assert.equal(local.localDir, join(ROOT, 'stake-polling-logrotate-data'));
  assert.equal(local.presignSeconds, 3600);
  assert.equal(loadConfig({ env: { ...TEST_ENV, S3_BUCKET: 'b-1', S3_PREFIX: '/nested/path/' }, local: null }).archive.prefix, 'nested/path');
  assert.throws(() => loadConfig({ env: { ...TEST_ENV, S3_BUCKET: 'Not_A_Bucket' }, local: null }), /invalid S3_BUCKET/);
  assert.throws(() => loadConfig({ env: { ...TEST_ENV, S3_PRESIGN_SECONDS: '700000' }, local: null }), /604800/);
});

test('a .env at the root is read for a real run, and the real environment wins over it', async () => {
  const root = join(scratch, 'root');
  await rm(root, { recursive: true, force: true });
  await (await import('node:fs/promises')).mkdir(root, { recursive: true });
  await copyFile(join(ROOT, 'config.json'), join(root, 'config.json'));
  await writeFile(join(root, '.env'), 'STAKE_TEAM=dotenv-team\nSTAKE_LIFETIME_START=2026-07-24\nSTAKE_DOTENV_PROBE=from-file\nS3_PREFIX=from-file\n');
  const saved = { STAKE_TEAM: process.env.STAKE_TEAM, STAKE_LIFETIME_START: process.env.STAKE_LIFETIME_START, STAKE_DOTENV_PROBE: process.env.STAKE_DOTENV_PROBE, S3_PREFIX: process.env.S3_PREFIX };
  process.env.S3_PREFIX = 'from-real-env';
  try {
    const cfg = loadConfig({ root, local: null });
    assert.equal(process.env.STAKE_DOTENV_PROBE, 'from-file');
    assert.equal(cfg.archive.prefix, 'from-real-env');
  } finally {
    for (const [key, value] of Object.entries(saved)) { if (value === undefined) delete process.env[key]; else process.env[key] = value; }
  }
});

// ------------------------------------------------------------ the binary, for real
const DB = 8;
let client = null;
let skip = false;
try { client = await connect('redis://127.0.0.1:6379', { database: DB }); } catch { skip = 'redis unreachable on 127.0.0.1:6379'; }
after(async () => { if (client) { await client.flushDb(); await client.quit(); } });

function run(args, env) {
  return new Promise((resolve) => {
    const child = spawn(process.execPath, [join(ROOT, 'bin', 'stake-archive.mjs'), ...args], { env: { ...process.env, ...env }, stdio: ['ignore', 'pipe', 'pipe'] });
    let out = '';
    child.stdout.on('data', (c) => { out += c; });
    child.stderr.on('data', (c) => { out += c; });
    child.on('exit', (code) => resolve({ code, out }));
  });
}

test('npm run archive -- --date stores that day locally, records the run, and exits', { skip }, async () => {
  await client.flushDb();
  for (const r of streams[k.tsTeam]) await client.xAdd(k.tsTeam, r.id, r.message);
  const dir = join(scratch, 'bin-out');
  const env = { ...TEST_ENV, STAKE_TEAM: 'archive-test-team', REDIS_URL: `redis://127.0.0.1:6379/${DB}`, STAKE_ARCHIVE_DIR: dir, S3_BUCKET: '' };
  const { code, out } = await run(['--date', '2026-09-22'], env);
  assert.equal(code, 0, out);
  assert.match(out, /2026-09-22: stored stake-all-2026-09-22\.csv\.gz/);
  const csv = gunzipSync(await readFile(join(dir, 'stake-all-2026-09-22.csv.gz'))).toString('utf8');
  assert.match(csv, /ts:team,position,2/);
  const status = JSON.parse(await client.get(k.archiveStatus));
  assert.equal(status.destination, dir);
  assert.deepEqual(status.stored.map((s) => s.date), ['2026-09-22']);
  assert.equal(await client.get(k.lockArchive), null, 'the lock is released');
  const bad = await run(['--date', 'yesterday'], env);
  assert.equal(bad.code, 1);
  assert.match(bad.out, /YYYY-MM-DD/);
});
