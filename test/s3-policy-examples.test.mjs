import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const load = (name) => JSON.parse(readFileSync(new URL(`../docs/s3/${name}`, import.meta.url), 'utf8'));

test('the example archiver policy grants upload, read and list under the prefix - and nothing else', () => {
  const policy = load('archiver-policy.example.json');
  const actions = policy.Statement.flatMap((s) => [].concat(s.Action));
  assert.deepEqual(actions.sort(), ['s3:GetObject', 's3:ListBucket', 's3:PutObject']);
  assert.ok(policy.Statement.every((s) => s.Effect === 'Allow'));
  assert.ok(actions.every((a) => !a.includes('*')), 'no wildcard actions');
  const objects = policy.Statement.find((s) => [].concat(s.Action).includes('s3:PutObject'));
  assert.equal(objects.Resource, 'arn:aws:s3:::YOUR-BUCKET/stake-polling/*', 'objects only under the prefix');
  const list = policy.Statement.find((s) => s.Action === 's3:ListBucket');
  assert.deepEqual(list.Condition, { StringLike: { 's3:prefix': ['stake-polling/*'] } }, 'listing only under the prefix');
});

test('the example bucket policy refuses anything not made over TLS', () => {
  const [deny] = load('bucket-policy.example.json').Statement;
  assert.equal(deny.Effect, 'Deny');
  assert.deepEqual(deny.Condition, { Bool: { 'aws:SecureTransport': 'false' } });
  assert.deepEqual(deny.Resource, ['arn:aws:s3:::YOUR-BUCKET', 'arn:aws:s3:::YOUR-BUCKET/*']);
});
