#!/usr/bin/env node
/**
 * Publish the demo site (npm run demo:build) as an S3 static website.
 *
 *   npm run demo:deploy -- --bucket stake-polling-demo [--region us-east-1] [--dir dist/demo] [--create]
 *
 * The bucket is made a PUBLIC website: Block Public Access is turned off for
 * it, and a policy lets anyone read its objects. Use a bucket that holds
 * nothing but the demo - never the archive bucket, whose whole point is to
 * be private. --create makes the bucket if it does not exist yet.
 *
 * Text files go up gzipped (Content-Encoding: gzip), about an eighth of their
 * size. Pages are cached briefly; the stylesheet, scripts and chart libraries
 * are linked with a content hash, so they are cached for a year. Objects no
 * longer in the build are removed.
 *
 * Credentials: the AWS SDK's usual chain (AWS_PROFILE, AWS_ACCESS_KEY_ID,
 * ~/.aws). They need the S3 permissions to configure and fill the bucket.
 */
import { readdir, readFile } from 'node:fs/promises';
import { join, relative, extname, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { gzipSync } from 'node:zlib';
import {
  S3Client, HeadBucketCommand, CreateBucketCommand, PutPublicAccessBlockCommand, PutBucketOwnershipControlsCommand,
  PutBucketWebsiteCommand, PutBucketPolicyCommand, PutObjectCommand, ListObjectsV2Command, DeleteObjectsCommand,
} from '@aws-sdk/client-s3';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const args = process.argv.slice(2);
const opt = (name, fallback = null) => (args.includes(`--${name}`) ? args[args.indexOf(`--${name}`) + 1] : fallback);
const bucket = opt('bucket');
const region = opt('region', process.env.AWS_REGION || 'us-east-1');
const dir = opt('dir', join(ROOT, 'dist', 'demo'));
if (!bucket || !/^[a-z0-9][a-z0-9.-]{1,61}[a-z0-9]$/.test(bucket)) {
  console.error('Usage: npm run demo:deploy -- --bucket <name> [--region us-east-1] [--dir dist/demo] [--create]');
  process.exit(1);
}

const TYPES = { '.html': 'text/html; charset=utf-8', '.css': 'text/css; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.svg': 'image/svg+xml',
  '.json': 'application/json', '.csv': 'text/csv; charset=utf-8', '.pdf': 'application/pdf', '.gz': 'application/gzip', '.png': 'image/png' };
const TEXT = new Set(['.html', '.css', '.js', '.svg', '.json', '.csv']);
const LONG = new Set(['.css', '.js']);

const s3 = new S3Client({ region });
const step = (message) => console.log(`  - ${message}`);

async function files(root) {
  const out = [];
  for (const entry of await readdir(root, { withFileTypes: true, recursive: true })) {
    if (entry.isFile()) out.push(join(entry.parentPath ?? entry.path, entry.name));
  }
  return out;
}

let exists = true;
try { await s3.send(new HeadBucketCommand({ Bucket: bucket })); } catch (err) {
  if (err?.$metadata?.httpStatusCode === 403) { console.error(`${bucket} belongs to another account. Pick another name.`); process.exit(1); }
  exists = false;
}
if (!exists) {
  if (!args.includes('--create')) { console.error(`${bucket} does not exist. Add --create to make it.`); process.exit(1); }
  await s3.send(new CreateBucketCommand({ Bucket: bucket, ObjectOwnership: 'BucketOwnerEnforced',
    ...(region === 'us-east-1' ? {} : { CreateBucketConfiguration: { LocationConstraint: region } }) }));
  step(`created s3://${bucket} in ${region}`);
}
await s3.send(new PutBucketOwnershipControlsCommand({ Bucket: bucket, OwnershipControls: { Rules: [{ ObjectOwnership: 'BucketOwnerEnforced' }] } }));
await s3.send(new PutPublicAccessBlockCommand({ Bucket: bucket, PublicAccessBlockConfiguration: {
  BlockPublicAcls: true, IgnorePublicAcls: true, BlockPublicPolicy: false, RestrictPublicBuckets: false } }));
step('public access: by bucket policy only (ACLs stay blocked)');
await s3.send(new PutBucketWebsiteCommand({ Bucket: bucket, WebsiteConfiguration: { IndexDocument: { Suffix: 'index.html' }, ErrorDocument: { Key: 'error.html' } } }));
step('website hosting: index.html, error.html');
try {
  await s3.send(new PutBucketPolicyCommand({ Bucket: bucket, Policy: JSON.stringify({ Version: '2012-10-17', Statement: [{
    Sid: 'PublicReadForDemoWebsite', Effect: 'Allow', Principal: '*', Action: 's3:GetObject', Resource: `arn:aws:s3:::${bucket}/*` }] }) }));
  step('bucket policy: anyone may read objects');
} catch (err) {
  console.error(`Could not make the bucket public (${err.name}). If the account has Block Public Access turned on account-wide, allow public policies for this bucket in the S3 console, then run this again.`);
  process.exit(1);
}

const local = await files(dir);
if (!local.some((f) => f.endsWith('index.html'))) { console.error(`${dir} has no index.html. Run npm run demo:build first.`); process.exit(1); }
const keys = new Set();
let sent = 0, bytes = 0;
const queue = [...local];
await Promise.all(Array.from({ length: 16 }, async () => {
  for (let file = queue.shift(); file; file = queue.shift()) {
    const key = relative(dir, file).split('\\').join('/');
    const ext = extname(file).toLowerCase();
    let body = await readFile(file);
    const text = TEXT.has(ext);
    if (text) body = gzipSync(body, { level: 9 });
    await s3.send(new PutObjectCommand({ Bucket: bucket, Key: key, Body: body, ContentType: TYPES[ext] ?? 'application/octet-stream',
      ...(text ? { ContentEncoding: 'gzip' } : {}),
      CacheControl: LONG.has(ext) ? 'public, max-age=31536000, immutable' : ext === '.html' ? 'public, max-age=300' : 'public, max-age=3600' }));
    keys.add(key); sent++; bytes += body.length;
  }
}));
step(`uploaded ${sent} files, ${(bytes / 1e6).toFixed(1)} MB as stored`);

// Remove what an earlier build left behind.
let token, stale = [];
do {
  const page = await s3.send(new ListObjectsV2Command({ Bucket: bucket, ContinuationToken: token }));
  for (const o of page.Contents ?? []) if (!keys.has(o.Key)) stale.push({ Key: o.Key });
  token = page.IsTruncated ? page.NextContinuationToken : undefined;
} while (token);
for (let i = 0; i < stale.length; i += 1000) await s3.send(new DeleteObjectsCommand({ Bucket: bucket, Delete: { Objects: stale.slice(i, i + 1000) } }));
if (stale.length) step(`removed ${stale.length} objects from an earlier build`);

const host = region === 'us-east-1' ? `${bucket}.s3-website-us-east-1.amazonaws.com` : `${bucket}.s3-website.${region}.amazonaws.com`;
console.log(`\nThe demo is live at http://${host}/`);
