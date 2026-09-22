/**
 * The launchd job description, as a string.
 *
 * Kept pure and separate from the installer so the awkward parts - argv that
 * must survive as separate strings, restart-on-crash that must not mean
 * restart-on-stop, paths that must be absolute - are testable without
 * touching launchctl or the real LaunchAgents directory.
 */

const LABEL_RE = /^[A-Za-z0-9][A-Za-z0-9.-]*$/;
const DEFAULT_THROTTLE_SECONDS = 30;

/**
 * @param {{
 *   label: string,
 *   program: string[],
 *   workingDirectory: string,
 *   stdout: string,
 *   stderr: string,
 *   env?: Record<string, string>,
 *   throttleSeconds?: number,
 * }} spec
 * @returns {string} a complete plist document
 */
export function buildPlist(spec) {
  const { label, program, workingDirectory, stdout, stderr, env, throttleSeconds = DEFAULT_THROTTLE_SECONDS } = spec;

  if (!LABEL_RE.test(String(label ?? ''))) {
    throw new Error(`invalid launchd label: ${JSON.stringify(label)} (reverse-DNS, no spaces)`);
  }
  if (!Array.isArray(program) || !program.length) throw new Error('program must be a non-empty argv array');
  // launchd starts a job with no useful working directory of its own, so a
  // relative path here does not fail loudly - the job simply never runs.
  absolute(program[0], 'program');
  absolute(workingDirectory, 'workingDirectory');
  absolute(stdout, 'stdout');
  absolute(stderr, 'stderr');

  const lines = [
    '<?xml version="1.0" encoding="UTF-8"?>',
    '<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">',
    '<plist version="1.0">',
    '<dict>',
    `  <key>Label</key>`,
    `  <string>${escape(label)}</string>`,
    '  <key>ProgramArguments</key>',
    '  <array>',
    ...program.map((arg) => `    <string>${escape(arg)}</string>`),
    '  </array>',
    '  <key>WorkingDirectory</key>',
    `  <string>${escape(workingDirectory)}</string>`,
    '  <key>RunAtLoad</key>',
    '  <true/>',
    // A bare <true/> KeepAlive relaunches after a deliberate stop as well,
    // which leaves no way to turn the collector off short of uninstalling it.
    '  <key>KeepAlive</key>',
    '  <dict>',
    '    <key>SuccessfulExit</key>',
    '    <false/>',
    '  </dict>',
    '  <key>ThrottleInterval</key>',
    `  <integer>${Math.max(1, Math.round(throttleSeconds))}</integer>`,
    '  <key>StandardOutPath</key>',
    `  <string>${escape(stdout)}</string>`,
    '  <key>StandardErrorPath</key>',
    `  <string>${escape(stderr)}</string>`,
  ];

  if (env && Object.keys(env).length) {
    lines.push('  <key>EnvironmentVariables</key>', '  <dict>');
    for (const [key, value] of Object.entries(env)) {
      lines.push(`    <key>${escape(key)}</key>`, `    <string>${escape(String(value))}</string>`);
    }
    lines.push('  </dict>');
  }

  lines.push('</dict>', '</plist>', '');
  return lines.join('\n');
}

/** Where a user agent with this label lives. */
export function agentFile(home, label) {
  return `${home}/Library/LaunchAgents/${label}.plist`;
}

function absolute(value, field) {
  if (typeof value !== 'string' || !value.startsWith('/')) {
    throw new Error(`${field} must be an absolute path, got ${JSON.stringify(value)}`);
  }
}

function escape(value) {
  return String(value).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

/**
 * The interpreter an installed plist actually runs, or null if the file is
 * not one of ours. Enough parsing to answer one question - a plist is XML,
 * but adding an XML parser to read back a field we wrote is not a trade worth
 * making.
 *
 * @param {string} xml
 */
export function parseProgram(xml) {
  const array = /<key>ProgramArguments<\/key>\s*<array>([\s\S]*?)<\/array>/.exec(String(xml ?? ''));
  if (!array) return null;
  const first = /<string>([\s\S]*?)<\/string>/.exec(array[1]);
  return first ? unescape(first[1]) : null;
}

function unescape(value) {
  return value.replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&amp;/g, '&');
}
