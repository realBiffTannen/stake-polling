import { test } from 'node:test';
import assert from 'node:assert/strict';
import { DashboardApp } from '../src/tui/app.mjs';
import { LEVEL } from '../src/tui/nav.mjs';

const ESC = String.fromCharCode(27);
const appWith = (rows) => {
  const app = new DashboardApp({ client: null, keys: {}, config: { detect: { window: 36 }, pollMinutes: 5 } });
  app.state = { rows, nav: app.nav };
  return app;
};
const ROWS = [
  { name: 'berry', turnover: 300 },
  { name: 'metro-night-run', turnover: 200 },
  { name: 'pixel-carnivals', turnover: 100 },
];

test('a fresh app starts on the roster', () => {
  assert.equal(appWith(ROWS).nav.level, LEVEL.ROSTER);
});

test('arrow down then enter opens the top game', () => {
  const app = appWith(ROWS);
  app.handleInput(`${ESC}[B`);
  app.handleInput('\r');
  assert.equal(app.nav.level, LEVEL.GAME);
  assert.equal(app.nav.game, 'berry');
});

test('escape walks back to the roster', () => {
  const app = appWith(ROWS);
  app.handleInput('\r');
  app.handleInput(ESC);
  assert.equal(app.nav.level, LEVEL.ROSTER);
});

test('the games list the reducer sees is sorted the way the table is', () => {
  const app = appWith(ROWS);
  app.nav = { ...app.nav, sort: 'turnover' };
  assert.deepEqual(app.gameNames(), ['berry', 'metro-night-run', 'pixel-carnivals']);
});

test('q stops the app', () => {
  const app = appWith(ROWS);
  app.running = true;
  app.handleInput('q');
  assert.equal(app.running, false);
});

test('per-mode trails are requested only below the roster', () => {
  const app = appWith(ROWS);
  assert.equal(app.needsModeTrail(), false);
  app.handleInput('\r');
  assert.equal(app.needsModeTrail(), true);
});

test('a split escape sequence still moves the cursor', () => {
  const app = appWith(ROWS);
  app.handleInput(`${ESC}[`);
  assert.equal(app.nav.game, null, 'nothing happens until the sequence completes');
  app.handleInput('B');
  assert.equal(app.nav.game, 'berry');
});

test('the --bucket/--game CLI flag path (bin/stake-dash.mjs) requests the per-mode trail', () => {
  // Mirrors bin/stake-dash.mjs exactly: `app.bucket = flag('bucket'); app.focus = flag('game');`,
  // set before any read ever happens. Both setters have to raise `nav.level` to
  // GAME themselves - `needsModeTrail()` gates on level, not on whether a slug
  // happens to be set - or this combination silently never fetches the
  // per-mode trail the bucket table needs.
  const app = appWith(ROWS);
  assert.equal(app.needsModeTrail(), false, 'a fresh app has not requested anything yet');
  app.bucket = '1h';
  app.focus = 'pixel-carnivals';
  assert.equal(app.needsModeTrail(), true);
  assert.equal(app.nav.level, LEVEL.GAME);
  assert.equal(app.nav.game, 'pixel-carnivals');
  assert.equal(app.nav.bucket, '1h');
  assert.equal(app.nav.tab, 'buckets');
});

test('typing a filter narrows gameNames(), and the cursor can only reach a visible game', () => {
  const app = appWith(ROWS);
  app.handleInput('/');
  app.handleInput('m');
  app.handleInput('e');
  // 'm' and 'e' are both unbound printables (KEYS has no entry for either),
  // so they arrive as literal filter text rather than firing an action -
  // 'me' matches only metro-night-run among the three rows.
  assert.deepEqual(app.gameNames(), ['metro-night-run'], 'the filter narrows the cursor list live, before enter');
  app.handleInput('\r');
  assert.equal(app.nav.filtering, false, 'enter closes the prompt');
  app.handleInput(`${ESC}[B`);
  assert.equal(app.nav.game, 'metro-night-run', 'the cursor lands only on a game the filter lets through');
});

test('escape cancels the filter outright and restores the full roster', () => {
  const app = appWith(ROWS);
  app.handleInput('/');
  app.handleInput('m');
  app.handleInput('e');
  assert.deepEqual(app.gameNames(), ['metro-night-run']);
  app.handleInput(ESC);
  assert.equal(app.nav.filtering, false);
  assert.equal(app.nav.filter, '', 'escape clears the filter, not just closes the prompt');
  assert.deepEqual(app.gameNames(), ['berry', 'metro-night-run', 'pixel-carnivals'], 'the full roster is back');
});

test('backspace edits the filter in place instead of cancelling it', () => {
  const app = appWith(ROWS);
  app.handleInput('/');
  app.handleInput('m');
  app.handleInput('e');
  app.handleInput('z');
  assert.equal(app.nav.filter, 'mez');
  assert.deepEqual(app.gameNames(), [], 'no game matches the typo');

  app.handleInput(String.fromCharCode(127));
  assert.equal(app.nav.filter, 'me', 'backspace removed exactly one character');
  assert.equal(app.nav.filtering, true, 'backspace must not close the prompt the way escape does');
  assert.deepEqual(app.gameNames(), ['metro-night-run']);
});

test('typing a real slug end to end - "berry" and "pixel-carnivals" both hit bound letters and must still arrive intact', () => {
  const app = appWith(ROWS);
  app.handleInput('/');
  for (const ch of 'berry') app.handleInput(ch); // c -> COMPARE, a -> ALERTS if not for capturingText
  assert.equal(app.nav.filter, 'berry');
  assert.deepEqual(app.gameNames(), ['berry']);

  app.handleInput(ESC); // cancel and start over
  assert.equal(app.nav.filter, '');

  app.handleInput('/');
  for (const ch of 'pixel-carnivals') app.handleInput(ch); // g, c, h, r, s are all bound elsewhere
  assert.equal(app.nav.filter, 'pixel-carnivals');
  assert.deepEqual(app.gameNames(), ['pixel-carnivals']);
});

test('clearing focus/bucket back to null does not itself change the level', () => {
  const app = appWith(ROWS);
  app.bucket = '5m';
  app.focus = 'berry';
  assert.equal(app.nav.level, LEVEL.GAME);
  app.focus = null;
  assert.equal(app.nav.game, null);
  assert.equal(app.nav.level, LEVEL.GAME, 'clearing must not itself descend or ascend');
  app.bucket = null;
  assert.equal(app.nav.bucket, null);
  assert.equal(app.nav.level, LEVEL.GAME, 'clearing must not itself descend or ascend');
});
