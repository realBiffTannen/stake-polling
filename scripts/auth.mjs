#!/usr/bin/env node
/**
 * Dashboard sign-in from the machine itself - the way back in when the
 * password is lost. Whoever can run this can read Redis anyway.
 *
 *   npm run auth -- status    is sign-in on, and for which username
 *   npm run auth -- disable   turn it off and end every session
 *
 * Turning it on, and changing the credentials, happens in Settings.
 */
import { loadConfig } from '../src/config.mjs';
import { connect, redactUrl } from '../src/store/redis.mjs';
import { keys } from '../src/store/keys.mjs';

const command = process.argv[2];
if (!['status', 'disable'].includes(command)) {
  console.error('Usage: npm run auth -- status | disable');
  process.exit(1);
}
const config = loadConfig();
const k = keys(config.team);
let client;
try {
  client = await connect(config.redisUrl);
} catch (err) {
  console.error(`cannot reach redis at ${redactUrl(config.redisUrl)}: ${err?.message ?? err}`);
  process.exit(1);
}
try {
  const raw = await client.get(k.auth);
  const username = raw ? (() => { try { return JSON.parse(raw).username; } catch { return '?'; } })() : null;
  if (command === 'status') {
    console.log(username ? `Sign-in is on, for username "${username}".` : 'Sign-in is off: anyone who can reach the dashboard can use it.');
  } else if (!username) {
    console.log('Sign-in is already off.');
  } else {
    await client.del(k.auth);
    // Moving the version ends every session (src/web/auth.mjs).
    await client.incr(k.authEpoch);
    console.log(`Sign-in is off. The credentials for "${username}" are deleted and every session has ended.`);
    console.log('Turn it back on, with a new password, under Settings > Security.');
  }
} finally {
  await client.quit();
}
