#!/usr/bin/env node
/**
 * Install, remove or inspect the launchd agent that keeps the collector and
 * the dashboard running.
 *
 * It is a user agent (gui/<uid>), not a system daemon, and that is deliberate:
 * sid recovery reads Chrome's cookie store through the Keychain, which a
 * root daemon running before login cannot do. The cost is stated plainly by
 * `status` - nothing polls until someone logs in.
 *
 * Redis itself is left alone. Turning it into a boot service edits the user's
 * global brew state, the same class of change `enable-persistence` asks
 * before making, so this only reports what it finds.
 */
import { homedir, userInfo } from 'node:os';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { loadConfig } from '../src/config.mjs';
import { buildServiceSpec, DEFAULT_LABEL } from '../src/service/spec.mjs';
import { install, uninstall, status, execRun } from '../src/service/agent.mjs';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const HOME = homedir();
const UID = userInfo().uid;

const config = loadConfig();

const [command = 'status', ...rest] = process.argv.slice(2);
const opts = { label: config.service?.label ?? DEFAULT_LABEL };
for (let i = 0; i < rest.length; i++) {
  if (rest[i] === '--label') opts.label = rest[++i];
  else if (rest[i] === '--host') opts.host = rest[++i];
  else if (rest[i] === '--port') opts.port = Number(rest[++i]);
  else if (rest[i] === '--wait-for-redis') opts.waitForRedisMs = Number(rest[++i]);
  else { console.error(`Unknown option: ${rest[i]}`); process.exit(1); }
}
if (opts.port !== undefined && (!Number.isInteger(opts.port) || opts.port < 1 || opts.port > 65535)) {
  console.error('--port takes a number between 1 and 65535.'); process.exit(1);
}

switch (command) {
  case 'install': await doInstall(); break;
  case 'uninstall': await doUninstall(); break;
  case 'status': await doStatus(); break;
  default:
    console.error('Usage: npm run service:install | service:uninstall | service:status');
    console.error('       node scripts/service.mjs install [--host 0.0.0.0] [--port 3005] [--label <id>] [--wait-for-redis <ms>]');
    process.exit(1);
}

async function doInstall() {
  const spec = buildServiceSpec({
    root: ROOT, home: HOME, execPath: process.execPath,
    label: opts.label, host: opts.host ?? config.web?.host, port: opts.port ?? config.web?.port,
    waitForRedisMs: opts.waitForRedisMs,
  });

  const { plistPath, state } = await install({ spec, home: HOME, uid: UID });
  console.log(`installed ${spec.label}`);
  console.log(`  plist   ${plistPath}`);
  console.log(`  runs    ${spec.program.join(' ')}`);
  console.log(`  logs    ${spec.stdout}`);
  console.log(`          ${spec.stderr}`);
  report(state);
  console.log('');
  console.log('It starts at login and restarts after a crash. It does NOT run before anyone logs in:');
  console.log('sid recovery needs Chrome and the Keychain, which a pre-login daemon cannot reach.');
  warnAboutNvm(spec.program[0]);
  await reportRedis();
}

async function doUninstall() {
  const { removed, plistPath } = await uninstall({ label: opts.label, home: HOME, uid: UID });
  console.log(removed ? `removed ${plistPath}` : `nothing to remove (${plistPath} is not there)`);
}

async function doStatus() {
  const state = await status({ label: opts.label, home: HOME, uid: UID });
  console.log(`${opts.label}`);
  console.log(`  plist   ${state.installed ? state.plistPath : 'not installed'}`);
  report(state);
  if (state.installed) {
    const spec = buildServiceSpec({ root: ROOT, home: HOME, execPath: process.execPath, label: opts.label });
    console.log(`  logs    tail -f ${spec.stderr}`);
  }
  await reportRedis();
}

function report(state) {
  console.log(`  loaded  ${state.loaded ? 'yes' : 'no'}`);
  console.log(`  running ${state.running ? `yes (pid ${state.pid})` : 'no'}`);
  if (state.lastExitCode !== null && state.lastExitCode !== undefined) {
    console.log(`  last exit code ${state.lastExitCode}`);
  }
  if (state.error) console.log(`  launchctl: ${state.error}`);
  if (state.programExists === false) {
    console.log('');
    console.log(`  BROKEN: the plist runs ${state.program}, which no longer exists.`);
    console.log('  This is what an nvm upgrade does to it. Fix with: npm run service:install');
  }
}

/** An interpreter under a version manager moves with every upgrade. */
function warnAboutNvm(program) {
  if (!/\/\.nvm\/versions\//.test(program)) return;
  console.log('');
  console.log(`Note: this agent is pinned to ${program}.`);
  console.log('nvm deletes that path when you upgrade or uninstall that version, and the agent then');
  console.log('stops starting. Re-run `npm run service:install` after any node upgrade - or install');
  console.log('from a version-stable node (e.g. /opt/homebrew/bin/node) to avoid the issue entirely.');
}

/**
 * A poller that survives a reboot is no use if its database does not. This
 * only reports - enabling a brew service is the user's call to make.
 */
async function reportRedis() {
  // By hostname, not by prefix: a URL carrying credentials
  // (redis://user:pass@127.0.0.1) is just as local.
  let host = null;
  try { host = new URL(config.redisUrl).hostname; } catch { /* unparseable: not local */ }
  const local = host === '127.0.0.1' || host === 'localhost';
  if (!local) return;
  const listed = await execRun('brew', ['services', 'list']);
  if (listed.code !== 0) return;
  const line = listed.stdout.split('\n').find((row) => /^redis\s/.test(row));
  if (!line) {
    console.log('');
    console.log('Redis is not a brew service here. After a reboot it will not come back on its own:');
    console.log('  brew services start redis');
    return;
  }
  if (!/\bstarted\b/.test(line)) {
    console.log('');
    console.log(`Redis is installed but not set to start at login (${line.trim()}). To make the data survive a reboot:`);
    console.log('  brew services start redis');
  }
}
