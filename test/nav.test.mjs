import { test } from 'node:test';
import assert from 'node:assert/strict';
import { initialNav, reduce, LEVEL, TABS, needsModeTrail, needsDailyTrail } from '../src/tui/nav.mjs';
import { decode, ACTION } from '../src/tui/keymap.mjs';

const GAMES = ['berry', 'metro-night-run', 'pixel-carnivals'];
const MODES = ['BASE', 'ANTE', 'VIPER_VAULT'];
const ctx = { games: GAMES, modes: MODES, pageSize: 10 };
const run = (nav, ...actions) => actions.reduce((n, a) => reduce(n, a, ctx), nav);

test('it starts on the roster with nothing selected', () => {
  const nav = initialNav();
  assert.equal(nav.level, LEVEL.ROSTER);
  assert.equal(nav.game, null);
  assert.equal(nav.frozen, false);
});

test('down selects the first game, then walks the list', () => {
  const nav = run(initialNav(), ACTION.DOWN);
  assert.equal(nav.game, 'berry');
  assert.equal(run(nav, ACTION.DOWN).game, 'metro-night-run');
});

test('the cursor stops at the ends rather than wrapping', () => {
  // Wrapping a list you are reading top-to-bottom hides where the end is.
  const top = run(initialNav(), ACTION.DOWN, ACTION.UP, ACTION.UP);
  assert.equal(top.game, 'berry');
  const bottom = run(initialNav(), ACTION.END, ACTION.DOWN, ACTION.DOWN);
  assert.equal(bottom.game, 'pixel-carnivals');
});

test('home and end jump to the ends of the list', () => {
  assert.equal(run(initialNav(), ACTION.END).game, 'pixel-carnivals');
  assert.equal(run(initialNav(), ACTION.END, ACTION.HOME).game, 'berry');
});

test('enter descends roster to game to mode, and back walks up again', () => {
  let nav = run(initialNav(), ACTION.DOWN, ACTION.ENTER);
  assert.equal(nav.level, LEVEL.GAME);
  assert.equal(nav.game, 'berry');
  assert.equal(nav.tab, 'health', 'a freshly opened game starts on HEALTH');

  nav = run(nav, ACTION.DOWN, ACTION.ENTER);
  assert.equal(nav.level, LEVEL.MODE);
  assert.equal(nav.mode, 'BASE');

  assert.equal(run(nav, ACTION.BACK).level, LEVEL.GAME);
  assert.equal(run(nav, ACTION.BACK, ACTION.BACK).level, LEVEL.ROSTER);
});

test('enter on the roster with nothing selected selects the first game', () => {
  const nav = run(initialNav(), ACTION.ENTER);
  assert.equal(nav.level, LEVEL.GAME);
  assert.equal(nav.game, 'berry');
});

test('back from the roster is a no-op rather than an error', () => {
  const nav = run(initialNav(), ACTION.BACK);
  assert.equal(nav.level, LEVEL.ROSTER);
});

test('the selection follows the slug across a re-sort, not the row index', () => {
  const nav = run(initialNav(), ACTION.DOWN, ACTION.DOWN);
  assert.equal(nav.game, 'metro-night-run');
  // The roster re-sorts and this game is now last.
  const resorted = { ...ctx, games: ['berry', 'pixel-carnivals', 'metro-night-run'] };
  const after = reduce(nav, ACTION.SORT, resorted);
  assert.equal(after.game, 'metro-night-run', 'sorting must not move the selection');
});

test('a selected game that vanishes from the roster clears the selection', () => {
  const nav = run(initialNav(), ACTION.DOWN);
  const gone = reduce(nav, ACTION.DOWN, { ...ctx, games: ['pixel-carnivals'] });
  assert.equal(gone.game, 'pixel-carnivals');
});

test('digits and tab pick the four tabs', () => {
  const open = run(initialNav(), ACTION.ENTER);
  assert.equal(reduce(open, ACTION.TAB_3, ctx).tab, 'today');
  assert.equal(reduce(open, ACTION.TAB_NEXT, ctx).tab, TABS[1]);
  assert.equal(reduce(open, ACTION.TAB_PREV, ctx).tab, TABS[TABS.length - 1]);
});

test('selecting a tab from the roster opens the top game on that tab', () => {
  const nav = reduce(initialNav(), ACTION.TAB_2, ctx);
  assert.equal(nav.level, LEVEL.GAME);
  assert.equal(nav.game, 'berry');
  assert.equal(nav.tab, 'live');
});

test('compare is a top-level screen, and brackets step the mode', () => {
  const nav = reduce(initialNav(), ACTION.COMPARE, ctx);
  assert.equal(nav.level, LEVEL.COMPARE);
  assert.equal(nav.compareMode, 'BASE');
  assert.equal(reduce(nav, ACTION.MODE_NEXT, ctx).compareMode, 'ANTE');
  assert.equal(reduce(nav, ACTION.MODE_PREV, ctx).compareMode, 'VIPER_VAULT', 'stepping back from the first wraps');
  assert.equal(reduce(nav, ACTION.BACK, ctx).level, LEVEL.ROSTER);
});

test('freeze and help toggle', () => {
  assert.equal(reduce(initialNav(), ACTION.FREEZE, ctx).frozen, true);
  assert.equal(run(initialNav(), ACTION.FREEZE, ACTION.FREEZE).frozen, false);
  assert.equal(reduce(initialNav(), ACTION.HELP, ctx).help, true);
});

test('the filter captures typing and back closes it without leaving the level', () => {
  let nav = reduce(initialNav(), ACTION.FILTER, ctx);
  assert.equal(nav.filtering, true);
  nav = reduce(nav, { type: 'text', text: 'mi' }, ctx);
  assert.equal(nav.filter, 'mi');
  nav = reduce(nav, ACTION.ENTER, ctx);
  assert.equal(nav.filtering, false, 'enter applies the filter');
  assert.equal(nav.filter, 'mi');
  assert.equal(nav.level, LEVEL.ROSTER, 'applying a filter must not descend into a game');

  const cleared = reduce(nav, ACTION.BACK, ctx);
  assert.equal(cleared.filter, '', 'back clears an applied filter before it ascends');
});

test('backspace erases one character of the filter, unlike escape which cancels it outright', () => {
  let nav = reduce(initialNav(), ACTION.FILTER, ctx);
  nav = reduce(nav, { type: 'text', text: 'berry' }, ctx);
  assert.equal(nav.filter, 'berry');

  nav = reduce(nav, ACTION.ERASE, ctx);
  assert.equal(nav.filter, 'berr', 'one character gone, not the whole filter');
  assert.equal(nav.filtering, true, 'backspace must not close the prompt the way escape does');

  nav = run(nav, ACTION.ERASE, ACTION.ERASE, ACTION.ERASE, ACTION.ERASE, ACTION.ERASE, ACTION.ERASE);
  assert.equal(nav.filter, '', 'erasing past the start leaves an empty filter rather than throwing');
  assert.equal(nav.filtering, true);
});

test('backspace outside the filter prompt still ascends, exactly like escape', () => {
  const inGame = run(initialNav(), ACTION.ENTER);
  assert.equal(inGame.level, LEVEL.GAME);
  assert.equal(reduce(inGame, ACTION.ERASE, ctx).level, LEVEL.ROSTER, 'erase is not filter-only - it is back everywhere else');
});

test('typing "berry" through decode() then enter leaves nav.filter exactly "berry", bound letters and all', () => {
  // End-to-end through keymap.mjs's decode() AND nav.mjs's reduce(): "berry"
  // hits two bound letters (c -> COMPARE, a -> ALERTS) that, before
  // capturingText existed, would have fired their actions instead of
  // reaching the filter at all.
  let nav = reduce(initialNav(), ACTION.FILTER, ctx);
  for (const ch of 'berry') {
    const { actions, text } = decode(ch, '', { capturingText: nav.filtering });
    for (const a of actions) nav = reduce(nav, a, ctx);
    if (text !== undefined) nav = reduce(nav, { type: 'text', text }, ctx);
  }
  assert.equal(nav.filter, 'berry');
  assert.equal(nav.filtering, true, 'the prompt is still open - only enter/escape closes it');

  nav = reduce(nav, ACTION.ENTER, ctx);
  assert.equal(nav.filtering, false, 'enter applies and closes the prompt');
  assert.equal(nav.filter, 'berry', 'the applied filter is unchanged by closing the prompt');
});

test('h cycles the bucket size and opens the bucket tab', () => {
  const nav = reduce(reduce(initialNav(), ACTION.ENTER, ctx), ACTION.BUCKET_CYCLE, ctx);
  assert.equal(nav.bucket, '5m');
  assert.equal(nav.tab, 'buckets');
  assert.equal(reduce(nav, ACTION.BUCKET_CYCLE, ctx).bucket, '1h');
});

test('per-mode trails are only needed below the roster', () => {
  assert.equal(needsModeTrail(initialNav()), false);
  assert.equal(needsModeTrail(reduce(initialNav(), ACTION.ENTER, ctx)), true);
  assert.equal(needsModeTrail(reduce(initialNav(), ACTION.COMPARE, ctx)), false,
    'compare reads snapshots only');
});

test('an unknown action returns the same object, so the caller can skip a repaint', () => {
  const nav = initialNav();
  assert.equal(reduce(nav, 'nonsense', ctx), nav);
});

test('g cycles the roster selection and wraps at the end', () => {
  // `g` is the one cursor action that wraps rather than clamping - existing
  // users already have that in their fingers.
  let nav = reduce(initialNav(), ACTION.GAME_CYCLE, ctx);
  assert.equal(nav.game, 'berry');
  nav = run(nav, ACTION.GAME_CYCLE, ACTION.GAME_CYCLE);
  assert.equal(nav.game, 'pixel-carnivals');
  assert.equal(reduce(nav, ACTION.GAME_CYCLE, ctx).game, 'berry', 'wraps back to the top');
});

test('g inside a drill-down changes the game without stranding the old game mode', () => {
  // Bet modes are per-game. Carrying BASE from one game to the next is fine;
  // carrying a mode the new game does not run would render an empty card.
  const inMode = run(initialNav(), ACTION.ENTER, ACTION.DOWN, ACTION.ENTER);
  assert.equal(inMode.level, LEVEL.MODE);
  assert.equal(inMode.mode, 'BASE');

  const moved = reduce(inMode, ACTION.GAME_CYCLE, ctx);
  assert.equal(moved.game, 'metro-night-run', 'the game advanced');
  assert.equal(moved.mode, null, 'the previous game mode must not survive the move');
  assert.equal(moved.level, LEVEL.MODE, 'the level is deliberately preserved');
  assert.equal(moved.tab, inMode.tab, 'and so is the tab');
});

test('g on an empty roster is a no-op', () => {
  const nav = reduce(initialNav(), ACTION.GAME_CYCLE, { ...ctx, games: [] });
  assert.equal(nav.game, null);
});

test('d opens the daily view from anywhere, and back returns to the roster', () => {
  const fromRoster = run(initialNav(), ACTION.DAILY);
  assert.equal(fromRoster.level, LEVEL.DAILY);
  assert.equal(run(fromRoster, ACTION.BACK).level, LEVEL.ROSTER);

  const fromGame = run(initialNav(), ACTION.DOWN, ACTION.ENTER, ACTION.DAILY);
  assert.equal(fromGame.level, LEVEL.DAILY);
  assert.equal(fromGame.game, 'berry', 'the roster selection survives the detour');
  assert.equal(run(fromGame, ACTION.ERASE).level, LEVEL.ROSTER);
});

test('d closes the help overlay rather than opening the view underneath it', () => {
  const nav = run(initialNav(), ACTION.HELP, ACTION.DAILY);
  assert.equal(nav.level, LEVEL.DAILY);
  assert.equal(nav.help, false, 'the view just asked for must be the thing on screen');
});

test('the month-deep daily trail is requested only while the daily view is open', () => {
  assert.equal(needsDailyTrail(initialNav()), false);
  assert.equal(needsDailyTrail(run(initialNav(), ACTION.DAILY)), true);
  assert.equal(needsDailyTrail(run(initialNav(), ACTION.DAILY, ACTION.BACK)), false);
  assert.equal(needsModeTrail(run(initialNav(), ACTION.DAILY)), false, 'nothing on the daily view draws a bet mode');
});
