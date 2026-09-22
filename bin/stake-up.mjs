#!/usr/bin/env node
/**
 * Everything, from one command.
 *
 * Starts the collector and the dashboard together. If a poller is already
 * running somewhere else - another terminal, a screen session - this one
 * follows rather than fighting it: the existing poller keeps its lock, keeps
 * polling, and is never signalled or evicted.
 *
 * The dashboard binds every interface by default, so other machines on the
 * network can open it. That is unauthenticated by design decision: anyone who
 * can reach the port can read turnover, profit, player counts and the game
 * catalogue. `--host 127.0.0.1` keeps it on this machine only.
 */
import { spawn } from 'node:child_process';
import { networkInterfaces } from 'node:os';
import { loadConfig } from '../src/config.mjs';
import { lanUrls } from '../src/net/addresses.mjs';
import { waitForRedis, redisProbe } from '../src/store/wait-for-redis.mjs';

const config = loadConfig();
let host = process.env.STAKE_WEB_HOST ?? config.web?.host ?? '0.0.0.0';
let port = Number(process.env.STAKE_WEB_PORT ?? config.web?.port ?? 3005);
let poll = true, web = true, sync = true;
// Zero by default: started by hand, a missing Redis is a mistake worth
// reporting at once. The launchd agent sets this, because at login it starts
// before brew's redis and must wait rather than crash-loop.
let waitForRedisMs = Number(process.env.STAKE_WAIT_FOR_REDIS_MS ?? 0) || 0;
const args = process.argv.slice(2);
for (let i = 0; i < args.length; i++) {
  if (args[i] === '--host') host = args[++i];
  else if (args[i] === '--port') port = Number(args[++i]);
  else if (args[i] === '--no-poll') poll = false;
  else if (args[i] === '--no-web') web = false;
  else if (args[i] === '--no-sync') sync = false;
  else if (args[i] === '--wait-for-redis') waitForRedisMs = Number(args[++i]);
  else if (args[i] === '--help') {
    console.log('Usage: npm start -- [--port 3005] [--host 0.0.0.0] [--no-poll] [--no-web] [--no-sync] [--wait-for-redis <ms>]');
    console.log('The dashboard is unauthenticated. --host 127.0.0.1 keeps it on this machine.');
    process.exit(0);
  } else { console.error(`Unknown option: ${args[i]}`); process.exit(1); }
}
if (!host || !Number.isInteger(port) || port < 1 || port > 65535) {
  console.error('Provide a host and a port between 1 and 65535.'); process.exit(1);
}

if (!Number.isFinite(waitForRedisMs) || waitForRedisMs < 0) {
  console.error('--wait-for-redis takes a number of milliseconds.'); process.exit(1);
}

const up = await waitForRedis({
  probe: redisProbe(config.redisUrl),
  retryMs: 2000,
  // A zero wait still gets one attempt - it is the retrying that is optional.
  timeoutMs: waitForRedisMs,
  onRetry: (err, attempt) => {
    if (attempt === 1) console.error(`Redis is not reachable at ${config.redisUrl} (${err.message}). Waiting up to ${Math.round(waitForRedisMs / 1000)}s for it.`);
    else if (attempt % 15 === 0) console.error(`still waiting for Redis (${attempt} attempts)`);
  },
});
if (!up) {
  console.error(`Redis is not reachable at ${config.redisUrl}.`);
  console.error('Start it (brew services start redis, or redis-server) and run npm start again.');
  process.exit(1);
}

const children = [];
function start(name, file, extra) {
  const child = spawn(process.execPath, [new URL(file, import.meta.url).pathname, ...extra], { stdio: 'inherit' });
  child.on('exit', (code, signal) => {
    if (stopping) return;
    console.error(`${name} exited (${signal ?? code}). Stopping the rest.`);
    shutdown();
  });
  children.push(child);
}

if (poll) start('collector', '../bin/stake-poller.mjs', ['--wait-for-lock']);
if (web) start('dashboard', '../bin/stake-web.mjs', ['--host', host, '--port', String(port), ...(sync ? [] : ['--no-sync'])]);

if (web) {
  console.log('Dashboard:');
  for (const url of lanUrls(port, networkInterfaces())) console.log(`  ${url}`);
  if (host === '0.0.0.0') console.log('  (reachable by anyone on this network - no password. --host 127.0.0.1 to keep it local)');
}

let stopping = false;
function shutdown() {
  if (stopping) return;
  stopping = true;
  for (const child of children) child.kill('SIGTERM');
  setTimeout(() => process.exit(0), 3000).unref();
}
process.on('SIGINT', shutdown);
process.on('SIGTERM', shutdown);
