/**
 * Install, remove and inspect the launchd user agent.
 *
 * Every launchctl call goes through an injected `run`, so the whole install
 * sequence is testable without a real login session - and so the one place
 * that shells out is a single, auditable function.
 */

import { spawn } from 'node:child_process';
import { writeFile, mkdir, unlink, readFile } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { dirname } from 'node:path';
import { buildPlist, agentFile, parseProgram } from './plist.mjs';

/** launchctl's exit code for "no such service". Not a failure for our purposes. */
const NO_SUCH_SERVICE = 113;

/** @type {(cmd: string, args: string[]) => Promise<{ code: number, stdout: string, stderr: string }>} */
export const execRun = (cmd, args) =>
  new Promise((resolve) => {
    const child = spawn(cmd, args, { stdio: ['ignore', 'pipe', 'pipe'] });
    let stdout = '', stderr = '';
    child.stdout.on('data', (d) => { stdout += d; });
    child.stderr.on('data', (d) => { stderr += d; });
    child.on('error', (err) => resolve({ code: 127, stdout, stderr: String(err?.message ?? err) }));
    child.on('close', (code) => resolve({ code: code ?? 0, stdout, stderr }));
  });

/**
 * Write the plist and load it. Replaces an existing agent rather than
 * failing on it: re-running the installer after a config change is the
 * normal way to pick that change up.
 */
export async function install({ spec, home, uid, run = execRun }) {
  const plistPath = agentFile(home, spec.label);
  const xml = buildPlist(spec);

  await mkdir(dirname(spec.stdout), { recursive: true });
  await mkdir(dirname(spec.stderr), { recursive: true });
  await mkdir(dirname(plistPath), { recursive: true });

  // Unload first. A bootstrap over a loaded job fails with EALREADY, and the
  // old job would keep running the old plist either way.
  await run('launchctl', ['bootout', `gui/${uid}/${spec.label}`]);
  await writeFile(plistPath, xml, 'utf8');

  const loaded = await run('launchctl', ['bootstrap', `gui/${uid}`, plistPath]);
  if (loaded.code !== 0) {
    throw new Error(`launchctl bootstrap failed (${loaded.code}): ${(loaded.stderr || loaded.stdout).trim()}`);
  }

  return { plistPath, state: await status({ label: spec.label, home, uid, run }) };
}

/** Unload then delete. Never leaves a loaded job with no plist behind it. */
export async function uninstall({ label, home, uid, run = execRun }) {
  const plistPath = agentFile(home, label);
  await run('launchctl', ['bootout', `gui/${uid}/${label}`]);
  if (!existsSync(plistPath)) return { removed: false, plistPath };
  await unlink(plistPath);
  return { removed: true, plistPath };
}

/**
 * Three separate facts, because they fail separately: is the plist on disk,
 * does launchd know about it, and is a process actually up right now.
 */
export async function status({ label, home, uid, run = execRun }) {
  const plistPath = agentFile(home, label);
  const printed = await run('launchctl', ['print', `gui/${uid}/${label}`]);
  const installed = existsSync(plistPath);
  const recorded = await recordedProgram(plistPath);

  const base = { installed, plistPath, ...recorded };
  if (printed.code === NO_SUCH_SERVICE || (printed.code !== 0 && /could not find/i.test(printed.stderr))) {
    return { ...base, loaded: false, running: false, pid: null, lastExitCode: null };
  }
  if (printed.code !== 0) {
    return { ...base, loaded: false, running: false, pid: null, lastExitCode: null,
      error: (printed.stderr || printed.stdout).trim() };
  }
  return { ...base, loaded: true, ...parsePrint(printed.stdout) };
}

/**
 * Which interpreter the installed plist names, and whether it is still on
 * disk. An nvm upgrade deletes the version directory the plist points at,
 * and from the outside that looks exactly like a service that simply stopped.
 */
async function recordedProgram(plistPath) {
  if (!existsSync(plistPath)) return { program: null, programExists: null };
  const program = parseProgram(await readFile(plistPath, 'utf8').catch(() => ''));
  return { program, programExists: program ? existsSync(program) : null };
}

/**
 * Pull the three fields worth reading out of `launchctl print`. Everything
 * else in that output is launchd internals that change between releases.
 *
 * @param {string} text
 */
export function parsePrint(text) {
  const state = /^\s*state\s*=\s*(\S+)/m.exec(text)?.[1] ?? null;
  const pid = Number(/^\s*pid\s*=\s*(\d+)/m.exec(text)?.[1]);
  const exit = /^\s*last exit code\s*=\s*(.+)$/m.exec(text)?.[1]?.trim() ?? null;
  return {
    state,
    running: state === 'running',
    pid: Number.isFinite(pid) ? pid : null,
    // "(never exited)" is not a status code - reporting it as one would claim
    // a clean exit for a job that has never stopped.
    lastExitCode: exit && /^\d+$/.test(exit) ? Number(exit) : null,
  };
}
