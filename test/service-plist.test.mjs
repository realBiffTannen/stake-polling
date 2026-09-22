import { test } from 'node:test';
import assert from 'node:assert/strict';
import { buildPlist, agentFile, parseProgram } from '../src/service/plist.mjs';

const spec = () => ({
  label: 'com.example.stake-polling',
  program: ['/opt/homebrew/bin/node', '/Users/alice/code/stake_polling/bin/stake-up.mjs', '--port', '3005'],
  workingDirectory: '/Users/alice/code/stake_polling',
  stdout: '/Users/alice/Library/Logs/stake-polling/out.log',
  stderr: '/Users/alice/Library/Logs/stake-polling/err.log',
});

test('the plist carries the full argv, not a shell string', () => {
  const xml = buildPlist(spec());
  // launchd does not run a shell, so every argument has to be its own
  // <string> or the flags arrive as one unparsable blob.
  assert.match(xml, /<key>ProgramArguments<\/key>\s*<array>/);
  for (const arg of spec().program) assert.match(xml, new RegExp(`<string>${arg}</string>`));
});

test('it starts at load and restarts only after a crash', () => {
  const xml = buildPlist(spec());
  assert.match(xml, /<key>RunAtLoad<\/key>\s*<true\/>/);
  // KeepAlive as a bare <true/> would relaunch the service after a clean
  // `npm run service:stop` too, which makes the thing impossible to turn off.
  assert.match(xml, /<key>KeepAlive<\/key>\s*<dict>\s*<key>SuccessfulExit<\/key>\s*<false\/>\s*<\/dict>/);
});

test('a crash loop is throttled', () => {
  assert.match(buildPlist(spec()), /<key>ThrottleInterval<\/key>\s*<integer>30<\/integer>/);
  assert.match(buildPlist({ ...spec(), throttleSeconds: 90 }), /<key>ThrottleInterval<\/key>\s*<integer>90<\/integer>/);
});

test('working directory and log paths are written', () => {
  const xml = buildPlist(spec());
  assert.match(xml, /<key>WorkingDirectory<\/key>\s*<string>\/Users\/alice\/code\/stake_polling<\/string>/);
  assert.match(xml, /<key>StandardOutPath<\/key>\s*<string>\/Users\/alice\/Library\/Logs\/stake-polling\/out.log<\/string>/);
  assert.match(xml, /<key>StandardErrorPath<\/key>\s*<string>\/Users\/alice\/Library\/Logs\/stake-polling\/err.log<\/string>/);
});

test('environment variables are included only when given', () => {
  assert.ok(!buildPlist(spec()).includes('EnvironmentVariables'));
  const xml = buildPlist({ ...spec(), env: { STAKE_WEB_PORT: '3005' } });
  assert.match(xml, /<key>EnvironmentVariables<\/key>\s*<dict>\s*<key>STAKE_WEB_PORT<\/key>\s*<string>3005<\/string>\s*<\/dict>/);
});

test('relative paths are refused', () => {
  // launchd gives a job no useful working directory of its own: a relative
  // program path simply never starts, and the only symptom is silence.
  assert.throws(() => buildPlist({ ...spec(), program: ['node', 'bin/stake-up.mjs'] }), /absolute/);
  assert.throws(() => buildPlist({ ...spec(), workingDirectory: 'code/stake_polling' }), /absolute/);
  assert.throws(() => buildPlist({ ...spec(), stdout: 'out.log' }), /absolute/);
});

test('a label that is not reverse-DNS is refused', () => {
  assert.throws(() => buildPlist({ ...spec(), label: 'stake polling' }), /label/);
});

test('XML metacharacters in a path are escaped', () => {
  const xml = buildPlist({ ...spec(), workingDirectory: '/Users/alice/code/a&b<c>' });
  assert.match(xml, /<string>\/Users\/alice\/code\/a&amp;b&lt;c&gt;<\/string>/);
  assert.ok(!xml.includes('a&b<c>'));
});

test('the agent file sits in the user LaunchAgents directory', () => {
  assert.equal(agentFile('/Users/alice', 'com.example.stake-polling'),
    '/Users/alice/Library/LaunchAgents/com.example.stake-polling.plist');
});

test('the program path can be read back out of an installed plist', () => {
  // nvm node paths carry a version number. An upgrade deletes the old one and
  // the agent then fails to start with nothing said anywhere the user looks,
  // so `status` has to be able to check the recorded path still exists.
  const xml = buildPlist(spec());
  assert.equal(parseProgram(xml), '/opt/homebrew/bin/node');
});

test('reading the program back survives escaped characters and odd spacing', () => {
  const xml = buildPlist({ ...spec(), program: ['/opt/a&b/node', '/repo/bin/stake-up.mjs'] });
  assert.equal(parseProgram(xml), '/opt/a&b/node');
});

test('a plist without ProgramArguments reads back as nothing, not as a crash', () => {
  assert.equal(parseProgram('<plist><dict></dict></plist>'), null);
});
