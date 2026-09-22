import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, readFile, writeFile, mkdir } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { parsePrint, install, uninstall, status } from '../src/service/agent.mjs';

const LABEL = 'com.example.stake-polling';

const PRINT_RUNNING = `${LABEL} = {
	active count = 1
	path = /Users/alice/Library/LaunchAgents/${LABEL}.plist
	state = running
	program = /opt/homebrew/bin/node
	pid = 41207
	last exit code = (never exited)
}`;

const PRINT_WAITING = `${LABEL} = {
	active count = 0
	state = waiting
	last exit code = 1
}`;

/** A launchctl that records what it was asked and answers from a script. */
function fakeRun(answers = {}) {
  const calls = [];
  const run = async (cmd, args) => {
    calls.push([cmd, ...args].join(' '));
    const key = args[0];
    const answer = answers[key] ?? { code: 0, stdout: '', stderr: '' };
    return typeof answer === 'function' ? answer(args) : answer;
  };
  return { run, calls };
}

async function home() {
  const dir = await mkdtemp(join(tmpdir(), 'stake-service-'));
  await mkdir(join(dir, 'Library', 'LaunchAgents'), { recursive: true });
  return dir;
}

const spec = (dir) => ({
  label: LABEL,
  program: ['/opt/homebrew/bin/node', '/repo/bin/stake-up.mjs'],
  workingDirectory: '/repo',
  stdout: join(dir, 'Library/Logs/stake-polling/out.log'),
  stderr: join(dir, 'Library/Logs/stake-polling/err.log'),
});

test('a running job reports its pid', () => {
  const parsed = parsePrint(PRINT_RUNNING);
  assert.equal(parsed.running, true);
  assert.equal(parsed.pid, 41207);
  assert.equal(parsed.state, 'running');
  assert.equal(parsed.lastExitCode, null);
});

test('a job that exited reports why, and is not called running', () => {
  const parsed = parsePrint(PRINT_WAITING);
  assert.equal(parsed.running, false);
  assert.equal(parsed.pid, null);
  assert.equal(parsed.lastExitCode, 1);
});

test('install writes the plist and bootstraps it into the login session', async () => {
  const dir = await home();
  const { run, calls } = fakeRun({ print: { code: 0, stdout: PRINT_RUNNING, stderr: '' } });

  const result = await install({ spec: spec(dir), home: dir, uid: 501, run });

  const written = await readFile(result.plistPath, 'utf8');
  assert.match(written, /<key>Label<\/key>/);
  assert.equal(result.plistPath, join(dir, 'Library/LaunchAgents', `${LABEL}.plist`));
  assert.ok(calls.some((c) => c === `launchctl bootstrap gui/501 ${result.plistPath}`), calls.join('\n'));
  // The log directory has to exist first: launchd will not create it, and a
  // job whose StandardOutPath cannot be opened never starts.
  assert.ok(existsSync(join(dir, 'Library/Logs/stake-polling')));
});

test('installing over an existing agent replaces it rather than failing', async () => {
  const dir = await home();
  const plistPath = join(dir, 'Library/LaunchAgents', `${LABEL}.plist`);
  await writeFile(plistPath, '<plist>old</plist>');
  const { run, calls } = fakeRun({
    // Already loaded: bootstrap refuses with EALREADY until the old job goes.
    bootstrap: (args) => ({ code: 0, stdout: '', stderr: '', args }),
    print: { code: 0, stdout: PRINT_RUNNING, stderr: '' },
  });

  await install({ spec: spec(dir), home: dir, uid: 501, run });

  const bootoutFirst = calls.findIndex((c) => c.startsWith('launchctl bootout'));
  const bootstrapAt = calls.findIndex((c) => c.startsWith('launchctl bootstrap'));
  assert.ok(bootoutFirst >= 0 && bootoutFirst < bootstrapAt, calls.join('\n'));
  assert.notEqual(await readFile(plistPath, 'utf8'), '<plist>old</plist>');
});

test('a bootstrap that fails is reported, not swallowed', async () => {
  const dir = await home();
  const { run } = fakeRun({ bootstrap: { code: 5, stdout: '', stderr: 'Load failed: 5: Input/output error' } });
  await assert.rejects(() => install({ spec: spec(dir), home: dir, uid: 501, run }), /Input\/output error/);
});

test('status on a machine that never installed it says so', async () => {
  const dir = await home();
  const { run } = fakeRun({ print: { code: 113, stdout: '', stderr: 'Could not find service' } });
  const state = await status({ label: LABEL, home: dir, uid: 501, run });
  assert.equal(state.installed, false);
  assert.equal(state.running, false);
});

test('status separates "plist on disk" from "loaded and running"', async () => {
  const dir = await home();
  await writeFile(join(dir, 'Library/LaunchAgents', `${LABEL}.plist`), '<plist/>');
  const { run } = fakeRun({ print: { code: 113, stdout: '', stderr: 'Could not find service' } });

  const state = await status({ label: LABEL, home: dir, uid: 501, run });
  assert.equal(state.installed, true, 'the plist is on disk');
  assert.equal(state.loaded, false, 'but launchd does not know about it');
  assert.equal(state.running, false);
});

test('uninstall unloads before deleting, so no orphan job survives the plist', async () => {
  const dir = await home();
  const plistPath = join(dir, 'Library/LaunchAgents', `${LABEL}.plist`);
  await writeFile(plistPath, '<plist/>');
  const { run, calls } = fakeRun();

  await uninstall({ label: LABEL, home: dir, uid: 501, run });

  assert.ok(calls.some((c) => c === `launchctl bootout gui/501/${LABEL}`), calls.join('\n'));
  assert.equal(existsSync(plistPath), false);
});

test('uninstalling something that was never installed is not an error', async () => {
  const dir = await home();
  const { run } = fakeRun({ bootout: { code: 113, stdout: '', stderr: 'Could not find service' } });
  const result = await uninstall({ label: LABEL, home: dir, uid: 501, run });
  assert.equal(result.removed, false);
});

test('status flags an agent whose node interpreter has been deleted', async () => {
  // The common way for this to happen is an nvm upgrade: the plist keeps
  // pointing at a version directory that no longer exists, and launchd's only
  // complaint is a line in the system log nobody reads.
  const dir = await home();
  const plistPath = join(dir, 'Library/LaunchAgents', `${LABEL}.plist`);
  await writeFile(plistPath, `<plist><dict><key>ProgramArguments</key><array><string>${join(dir, 'gone/node')}</string><string>/repo/bin/stake-up.mjs</string></array></dict></plist>`);
  const { run } = fakeRun({ print: { code: 113, stdout: '', stderr: 'Could not find service' } });

  const state = await status({ label: LABEL, home: dir, uid: 501, run });
  assert.equal(state.program, join(dir, 'gone/node'));
  assert.equal(state.programExists, false);
});

test('status is happy when the recorded interpreter is still there', async () => {
  const dir = await home();
  const plistPath = join(dir, 'Library/LaunchAgents', `${LABEL}.plist`);
  await writeFile(plistPath, `<plist><dict><key>ProgramArguments</key><array><string>${process.execPath}</string></array></dict></plist>`);
  const { run } = fakeRun({ print: { code: 0, stdout: PRINT_RUNNING, stderr: '' } });

  const state = await status({ label: LABEL, home: dir, uid: 501, run });
  assert.equal(state.programExists, true);
});
