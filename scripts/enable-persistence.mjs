#!/usr/bin/env node
import { createInterface } from 'node:readline/promises';
import { loadConfig } from '../src/config.mjs';
import { connect, appendOnlyEnabled, redactUrl } from '../src/store/redis.mjs';

// Turning on AOF edits the user's global Redis configuration - every database
// on that server, not just ours. That is not something to do behind their
// back, so this is a separate opt-in command rather than part of startup.

const config = loadConfig();
const client = await connect(config.redisUrl);

const current = await appendOnlyEnabled(client);
console.log(`redis: ${redactUrl(config.redisUrl)}`);
console.log(`appendonly is currently: ${current === null ? 'unknown (CONFIG is restricted)' : current ? 'yes' : 'no'}`);

if (current === true) {
  console.log('nothing to do - the trail already survives a restart.');
  await client.quit();
  process.exit(0);
}

console.log('');
console.log('Enabling AOF writes every change to disk so the 30-day minute trail');
console.log('survives a restart. It affects EVERY database on this Redis server,');
console.log('and CONFIG REWRITE will update the redis.conf on disk.');
console.log('');

const rl = createInterface({ input: process.stdin, output: process.stdout });
const answer = (await rl.question('Enable AOF persistence now? [y/N] ')).trim().toLowerCase();
rl.close();

if (answer !== 'y' && answer !== 'yes') {
  console.log('left unchanged.');
  await client.quit();
  process.exit(0);
}

try {
  await client.configSet('appendonly', 'yes');
  await client.configRewrite();
  console.log(`appendonly is now: ${(await appendOnlyEnabled(client)) ? 'yes' : 'no'}`);
} catch (err) {
  console.error(`failed: ${err?.message ?? err}`);
  console.error('if this Redis was started without a config file, CONFIG REWRITE has nothing to write to.');
  await client.quit();
  process.exit(1);
}

await client.quit();
