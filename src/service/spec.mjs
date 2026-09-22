/**
 * What the launchd job should actually run, derived from this checkout.
 *
 * Separate from the plist writer so the decisions that matter - which node,
 * which script, where the logs go, how long to wait for Redis - are one
 * testable function rather than string building inside an installer.
 */

import { join } from 'node:path';

// A studio can install under its own reverse-DNS prefix by setting
// `service.label` in config.local.json; `local.` is launchd's convention for
// an agent nobody publishes.
export const DEFAULT_LABEL = 'local.stake-polling';
const DEFAULT_WAIT_FOR_REDIS_MS = 180000;

/**
 * @param {{
 *   root: string, home: string, execPath: string,
 *   label?: string, host?: string, port?: number,
 *   waitForRedisMs?: number, throttleSeconds?: number,
 * }} opts
 */
export function buildServiceSpec({ root, home, execPath, label = DEFAULT_LABEL, host, port, waitForRedisMs = DEFAULT_WAIT_FOR_REDIS_MS, throttleSeconds }) {
  const program = [execPath, join(root, 'bin', 'stake-up.mjs')];
  if (host) program.push('--host', host);
  if (port) program.push('--port', String(port));

  // One log directory per label, so a second checkout running its own agent
  // does not interleave its output with this one's.
  const logDir = join(home, 'Library', 'Logs', logName(label));

  return {
    label,
    program,
    workingDirectory: root,
    stdout: join(logDir, 'out.log'),
    stderr: join(logDir, 'err.log'),
    env: { STAKE_WAIT_FOR_REDIS_MS: String(waitForRedisMs) },
    ...(throttleSeconds ? { throttleSeconds } : {}),
  };
}

/**
 * `local.stake-polling.staging` -> `stake-polling.staging`, and the same for
 * any reverse-DNS prefix, so the log directory does not depend on whose
 * prefix the agent was installed under. A label without `stake-polling` in
 * it is used whole.
 */
function logName(label) {
  const at = label.indexOf('stake-polling');
  return at === -1 ? label : label.slice(at);
}
