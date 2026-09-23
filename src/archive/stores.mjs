/**
 * Where the nightly archive goes: an S3 bucket when S3_BUCKET is set, else a
 * local directory, `stake-polling-logrotate-data` at the repo root.
 *
 * Both answer the same four calls, so the archiver and the archive page never
 * ask which one they have:
 *   list()      every archive held, newest day first
 *   put(n, b)   store body `b` under name `n`
 *   url(n)      where a browser downloads it: a presigned S3 URL, or the
 *               dashboard's own /archive/file/<n> route for the local store
 *               (which also gives each file's own path and file:// URL)
 *   where       a human description of the destination, for the page
 *
 * The AWS SDK is imported only when a bucket is configured, so a local-only
 * install never loads it.
 */

import { createReadStream } from 'node:fs';
import { mkdir, readdir, rename, stat, writeFile, rm } from 'node:fs/promises';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';
import { ARCHIVE_NAME } from './archive.mjs';

const byDateDesc = (a, b) => (a.date < b.date ? 1 : a.date > b.date ? -1 : 0);

/** The store the configuration asks for. */
export async function storeFor(config) {
  const a = config.archive;
  if (!a?.bucket) return localStore(a.localDir);
  let sdk, presigner;
  try {
    [sdk, presigner] = await Promise.all([import('@aws-sdk/client-s3'), import('@aws-sdk/s3-request-presigner')]);
  } catch (err) {
    // An install updated with git pull but not npm install.
    if (err?.code === 'ERR_MODULE_NOT_FOUND') throw new Error('S3_BUCKET is set but the AWS SDK is not installed - run npm install');
    throw err;
  }
  const { S3Client, PutObjectCommand, ListObjectsV2Command, GetObjectCommand } = sdk;
  const { getSignedUrl } = presigner;
  const client = new S3Client(a.region ? { region: a.region } : {});
  return s3Store({ bucket: a.bucket, prefix: `${a.prefix ? `${a.prefix}/` : ''}${config.team}/`, presignSeconds: a.presignSeconds },
    { client, commands: { PutObjectCommand, ListObjectsV2Command, GetObjectCommand }, getSignedUrl });
}

/** Archives as files in `dir`, created on the first write. */
export function localStore(dir) {
  const pathOf = (name) => (ARCHIVE_NAME.test(String(name)) ? join(dir, name) : null);
  return {
    kind: 'local',
    where: dir,
    async list() {
      let names;
      try { names = await readdir(dir); } catch (err) { if (err.code === 'ENOENT') return []; throw err; }
      const files = [];
      for (const name of names) {
        const m = ARCHIVE_NAME.exec(name);
        if (!m) continue;
        const info = await stat(join(dir, name));
        files.push({ name, date: m[1], bytes: info.size, modified: info.mtimeMs });
      }
      return files.sort(byDateDesc);
    },
    // Written beside the target and renamed over it, so a reader never sees
    // half a file and a crash mid-write leaves the previous one intact.
    async put(name, body) {
      if (!ARCHIVE_NAME.test(name)) throw new Error(`not an archive name: ${name}`);
      await mkdir(dir, { recursive: true });
      const tmp = join(dir, `.${name}.${process.pid}.tmp`);
      try {
        await writeFile(tmp, body, { mode: 0o600 });
        await rename(tmp, join(dir, name));
      } catch (err) {
        await rm(tmp, { force: true });
        throw err;
      }
    },
    url(name) {
      return `/archive/file/${encodeURIComponent(name)}`;
    },
    /** The file's path, only for a name that is an archive's - never a traversal. */
    path: pathOf,
    /** The file itself on this machine's disk, as a file:// URL (spaces and all encoded). */
    fileUrl(name) {
      const path = pathOf(name);
      return path ? pathToFileURL(path).href : null;
    },
  };
}

/**
 * Archives as objects under `prefix` in `bucket`. `deps` is the SDK client,
 * its command classes and getSignedUrl - injected, so tests need no AWS.
 */
export function s3Store({ bucket, prefix, presignSeconds = 3600 }, { client, commands, getSignedUrl }) {
  const { PutObjectCommand, ListObjectsV2Command, GetObjectCommand } = commands;
  return {
    kind: 's3',
    where: `s3://${bucket}/${prefix}`,
    presignSeconds,
    async list() {
      const files = [];
      let token;
      do {
        const page = await client.send(new ListObjectsV2Command({ Bucket: bucket, Prefix: prefix, ContinuationToken: token }));
        for (const obj of page.Contents ?? []) {
          const name = String(obj.Key).slice(prefix.length);
          const m = ARCHIVE_NAME.exec(name);
          if (m) files.push({ name, date: m[1], bytes: Number(obj.Size), modified: obj.LastModified ? new Date(obj.LastModified).getTime() : null });
        }
        token = page.IsTruncated ? page.NextContinuationToken : undefined;
      } while (token);
      return files.sort(byDateDesc);
    },
    async put(name, body) {
      if (!ARCHIVE_NAME.test(name)) throw new Error(`not an archive name: ${name}`);
      await client.send(new PutObjectCommand({ Bucket: bucket, Key: `${prefix}${name}`, Body: body, ContentType: 'application/gzip' }));
    },
    // Signed locally with the archiver's own credentials - no request to AWS.
    // Attachment, so a browser saves the .csv.gz rather than trying to show it.
    url(name) {
      if (!ARCHIVE_NAME.test(String(name))) return null;
      return getSignedUrl(client, new GetObjectCommand({ Bucket: bucket, Key: `${prefix}${name}`,
        ResponseContentDisposition: `attachment; filename="${name}"` }), { expiresIn: presignSeconds });
    },
  };
}

/**
 * What the dashboard's archive page and file route read: the store's files,
 * each with its download link - and, for the local store, its path and
 * file:// URL on disk - plus the archiver's last run. The web process only
 * ever reads; bin/stake-archive.mjs writes.
 *
 * @param {{ store: object|null, setupError?: string|null, readStatus: () => Promise<object|null> }} opts
 */
export function dashboardArchive({ store, setupError = null, readStatus }) {
  const describe = () => (store ? { kind: store.kind, where: store.where, presignSeconds: store.presignSeconds } : {});
  return {
    describe,
    async list() {
      const status = await readStatus();
      if (!store) return { files: [], status, error: `the archive store could not be set up: ${setupError}` };
      const held = await store.list();
      const files = await Promise.all(held.map(async (f) => ({ ...f, url: await store.url(f.name),
        ...(store.kind === 'local' && { path: store.path(f.name), fileUrl: store.fileUrl(f.name) }) })));
      return { ...describe(), files, status };
    },
    /** A local archive as a stream, or null - for an S3 store, or any name that is not an archive's. */
    async open(name) {
      const path = store?.kind === 'local' ? store.path(name) : null;
      if (!path) return null;
      const info = await stat(path).catch(() => null);
      return info?.isFile() ? { size: info.size, stream: createReadStream(path) } : null;
    },
  };
}
