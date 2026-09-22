import { test } from 'node:test';
import assert from 'node:assert/strict';
import { decode, ACTION } from '../src/tui/keymap.mjs';

const ESC = String.fromCharCode(27);
const actions = (chunk, pending = '') => decode(chunk, pending).actions;

test('plain letters map to their actions', () => {
  assert.deepEqual(actions('q'), [ACTION.QUIT]);
  assert.deepEqual(actions('j'), [ACTION.DOWN]);
  assert.deepEqual(actions('k'), [ACTION.UP]);
  assert.deepEqual(actions('c'), [ACTION.COMPARE]);
  assert.deepEqual(actions('f'), [ACTION.FREEZE]);
  assert.deepEqual(actions('?'), [ACTION.HELP]);
  assert.deepEqual(actions('/'), [ACTION.FILTER]);
});

test('the pre-existing keys keep their meanings', () => {
  assert.deepEqual(actions('g'), [ACTION.GAME_CYCLE]);
  assert.deepEqual(actions('h'), [ACTION.BUCKET_CYCLE]);
  assert.deepEqual(actions('s'), [ACTION.SORT]);
  assert.deepEqual(actions('a'), [ACTION.ALERTS]);
  assert.deepEqual(actions('r'), [ACTION.REFRESH]);
});

test('ctrl-c quits', () => {
  assert.deepEqual(actions(String.fromCharCode(3)), [ACTION.QUIT]);
});

test('arrow keys arrive as three-byte escape sequences', () => {
  assert.deepEqual(actions(`${ESC}[A`), [ACTION.UP]);
  assert.deepEqual(actions(`${ESC}[B`), [ACTION.DOWN]);
  assert.deepEqual(actions(`${ESC}[D`), [ACTION.BACK]);
  // Right is deliberately descend, mirroring left-as-ascend.
  assert.deepEqual(actions(`${ESC}[C`), [ACTION.ENTER]);
});

test('paging and jump keys decode', () => {
  assert.deepEqual(actions(`${ESC}[5~`), [ACTION.PAGE_UP]);
  assert.deepEqual(actions(`${ESC}[6~`), [ACTION.PAGE_DOWN]);
  assert.deepEqual(actions(`${ESC}[H`), [ACTION.HOME]);
  assert.deepEqual(actions(`${ESC}[F`), [ACTION.END]);
  assert.deepEqual(actions(`${ESC}[Z`), [ACTION.TAB_PREV]);
});

test('a bare escape is BACK, not the start of a sequence', () => {
  assert.deepEqual(actions(ESC), [ACTION.BACK]);
});

test('a sequence split across two chunks is held, then completed', () => {
  const first = decode(`${ESC}[`);
  assert.deepEqual(first.actions, [], 'an incomplete sequence emits nothing yet');
  assert.equal(first.pending, `${ESC}[`);

  const second = decode('A', first.pending);
  assert.deepEqual(second.actions, [ACTION.UP]);
  assert.equal(second.pending, '');
});

test('several keypresses in one chunk all decode, in order', () => {
  assert.deepEqual(actions(`jk${ESC}[Aq`), [ACTION.DOWN, ACTION.UP, ACTION.UP, ACTION.QUIT]);
});

test('enter, tab and backspace', () => {
  assert.deepEqual(actions('\r'), [ACTION.ENTER]);
  assert.deepEqual(actions('\n'), [ACTION.ENTER]);
  assert.deepEqual(actions('\t'), [ACTION.TAB_NEXT]);
  // Backspace decodes to its own ERASE action, distinct from Escape's BACK -
  // nav.mjs treats them the same outside the filter prompt, but only the
  // decoder knows which byte actually arrived, so it must not collapse the
  // two before nav.mjs gets a chance to tell them apart while filtering.
  assert.deepEqual(actions(String.fromCharCode(127)), [ACTION.ERASE]);
  assert.deepEqual(actions(String.fromCharCode(8)), [ACTION.ERASE]);
});

test('digits select tabs and brackets step the compared mode', () => {
  assert.deepEqual(actions('1'), [ACTION.TAB_1]);
  assert.deepEqual(actions('4'), [ACTION.TAB_4]);
  assert.deepEqual(actions('['), [ACTION.MODE_PREV]);
  assert.deepEqual(actions(']'), [ACTION.MODE_NEXT]);
});

test('an unmapped key produces no action rather than throwing', () => {
  assert.deepEqual(actions('~'), []);
  assert.deepEqual(actions(''), []);
});

test('a bound key carries no text; an unbound printable is offered to the filter', () => {
  const bound = decode('j');
  assert.deepEqual(bound.actions, [ACTION.DOWN]);
  assert.equal(bound.text, undefined, 'a bound key carries no literal text');

  const typed = decode('P');
  assert.deepEqual(typed.actions, []);
  assert.equal(typed.text, 'P', 'an unbound printable is offered as literal text');
});

test('an unmapped but complete escape sequence is dropped, not replayed as keystrokes', () => {
  // Delete is ESC[3~. Untreated, '[' '3' '~' fire MODE_PREV and TAB_3 - so
  // pressing Delete would silently change tabs.
  const del = decode(`${ESC}[3~`);
  assert.deepEqual(del.actions, []);
  assert.equal(del.pending, '', 'the whole terminated sequence is consumed');

  const after = decode('q', del.pending);
  assert.deepEqual(after.actions, [ACTION.QUIT], 'the next keypress is not corrupted');
});

test('an unmapped sequence split across chunks still resolves cleanly', () => {
  const first = decode(`${ESC}[3`);
  assert.deepEqual(first.actions, [], 'not yet terminated - keep waiting');
  const second = decode('~j', first.pending);
  assert.deepEqual(second.actions, [ACTION.DOWN], 'the Delete is dropped, the j survives');
});

test('bracketed paste markers are consumed whole', () => {
  const paste = decode(`${ESC}[200~`);
  assert.deepEqual(paste.actions, []);
  assert.equal(paste.pending, '');
});

test('an escape followed by a non-CSI byte is a back keypress plus that byte', () => {
  assert.deepEqual(decode(`${ESC}j`).actions, [ACTION.BACK, ACTION.DOWN]);
});

// --- capturingText: the filter prompt's mode --------------------------
//
// Without this, a bound letter (c/a/g/h/s/f/r/q/j/k/?/[/]/1-4) could never be
// typed into the filter at all - it would fire its action instead. "berry"
// and "pixel-carnivals" each hit several of these letters.

test('capturingText makes every printable byte literal text, bound letters included', () => {
  const berry = decode('berry', '', { capturingText: true });
  assert.deepEqual(berry.actions, []);
  assert.equal(berry.text, 'berry');

  // Five bound letters between the two words (g, c, h, r, s) - the case that
  // actually proves bound keys stop being eaten while capturing.
  const slug = decode('pixel-carnivals', '', { capturingText: true });
  assert.deepEqual(slug.actions, []);
  assert.equal(slug.text, 'pixel-carnivals');
});

test('ctrl-c still quits while capturing text - no exceptions', () => {
  assert.deepEqual(decode(String.fromCharCode(3), '', { capturingText: true }).actions, [ACTION.QUIT]);
});

test('enter, escape and backspace still close or edit the prompt while capturing', () => {
  assert.deepEqual(decode('\r', '', { capturingText: true }).actions, [ACTION.ENTER]);
  assert.deepEqual(decode('\n', '', { capturingText: true }).actions, [ACTION.ENTER]);
  assert.deepEqual(decode(ESC, '', { capturingText: true }).actions, [ACTION.BACK]);
  assert.deepEqual(decode(String.fromCharCode(127), '', { capturingText: true }).actions, [ACTION.ERASE]);
  assert.deepEqual(decode(String.fromCharCode(8), '', { capturingText: true }).actions, [ACTION.ERASE]);
});

test('a single chunk that opens and fills the prompt switches mode mid-chunk', () => {
  // A paste of "/berry" arrives as one chunk starting NOT captured - the `/`
  // has to flip capturing on in time for the rest of the same chunk, or this
  // reproduces the exact bug the mode exists to fix.
  const result = decode('/berry', '', { capturingText: false });
  assert.deepEqual(result.actions, [ACTION.FILTER]);
  assert.equal(result.text, 'berry');
});

test('capturingText false (the default) leaves every existing binding exactly as it was', () => {
  // Same quirky-but-unchanged behaviour as before this round: a multi-char
  // chunk keeps only the LAST unbound character, because `text` is a single
  // offered character outside capturingText, not an accumulator.
  // In "berry" both `r`s are bound (refresh) and fire; `b`, `e` and `y` are
  // not, and only the last of those survives as text.
  const result = decode('berry');
  assert.deepEqual(result.actions, [ACTION.REFRESH, ACTION.REFRESH]);
  assert.equal(result.text, 'y');
});

// --- a mid-chunk close must not let what follows clobber captured text ----
//
// Captured filter text ("ab") lands in the SAME `text` field the non-
// capturing branch also writes to (offering a stray printable to whatever
// comes next). Without a guard, a printable arriving AFTER an embedded
// Enter/Escape/Backspace/Ctrl-C closes the prompt mid-chunk overwrites the
// text already captured - a silent substitution of one search term for
// another, the exact class of bug this branch exists to stop.

test('a printable arriving after a mid-chunk enter does not clobber the text already captured', () => {
  // "ab" is typed, enter closes the prompt, "c" fires COMPARE (correct - the
  // prompt is genuinely closed by then), "x" is a stray unbound printable
  // that must NOT overwrite the "ab" already captured.
  const result = decode('ab\rcx', '', { capturingText: true });
  assert.deepEqual(result.actions, [ACTION.ENTER, ACTION.COMPARE]);
  assert.equal(result.text, 'ab', 'the captured filter text must survive whatever follows the close');
});

test('the common fast type-then-enter case still works after the clobber fix', () => {
  const result = decode('berry\r', '', { capturingText: true });
  assert.deepEqual(result.actions, [ACTION.ENTER]);
  assert.equal(result.text, 'berry');
});

test('a mid-chunk open-then-close still reports only the captured text, not what follows', () => {
  // Starts NOT capturing: '/' opens, "ab" is captured, enter closes, "c"
  // fires COMPARE, "x" must not overwrite "ab" reported for the filter.
  const result = decode('/ab\rcx');
  assert.deepEqual(result.actions, [ACTION.FILTER, ACTION.ENTER, ACTION.COMPARE]);
  assert.equal(result.text, 'ab');
});

test('a chunk with no capturing at all still offers an unbound printable as text exactly as before', () => {
  assert.equal(decode('P').text, 'P');
  assert.deepEqual(decode('P').actions, []);
});

// --- the `q` in the filter must not quit (destructive review finding #1) --
//
// KEYS maps BOTH Ctrl-C (byte 3) AND the printable letter `q` to ACTION.QUIT.
// The old exemption (`bound === ACTION.QUIT`) could not tell the two apart,
// so typing a game name containing `q` while the filter was open quit the
// whole dashboard AND silently dropped the `q` from the captured text. Only
// the control byte may still act as a key while capturing; `q` must fall
// through to literal text like every other unbound-while-capturing letter.

test('typing "queen" while capturing yields no actions and the exact text, q included', () => {
  const result = decode('queen', '', { capturingText: true });
  assert.deepEqual(result.actions, []);
  assert.equal(result.text, 'queen');
});

test('typing "quick" while capturing yields no actions and the exact text', () => {
  const result = decode('quick', '', { capturingText: true });
  assert.deepEqual(result.actions, []);
  assert.equal(result.text, 'quick');
});

test('typing "pixel-quilt" while capturing yields no actions and the exact text', () => {
  const result = decode('pixel-quilt', '', { capturingText: true });
  assert.deepEqual(result.actions, []);
  assert.equal(result.text, 'pixel-quilt');
});

test('ctrl-c still quits while capturing text, even with the q fix in place', () => {
  const result = decode(String.fromCharCode(3), '', { capturingText: true });
  assert.deepEqual(result.actions, [ACTION.QUIT]);
  assert.equal(result.text, undefined, 'ctrl-c is a key, not captured filter text');
});

test('d opens the daily profit view', () => {
  assert.deepEqual(actions('d'), [ACTION.DAILY]);
});

test('d typed into the filter is text, like every other bound letter', () => {
  const result = decode('berry-daily', '', { capturingText: true });
  assert.deepEqual(result.actions, []);
  assert.equal(result.text, 'berry-daily');
});
