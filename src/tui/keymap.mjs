/**
 * Terminal input bytes to action names.
 *
 * Kept pure and separate from the app so the whole key model can be tested
 * without a TTY, and so a split escape sequence - which a real terminal will
 * eventually hand you - is a tested case rather than a mystery dead key.
 */

const ESC = String.fromCharCode(27);

export const ACTION = Object.freeze({
  UP: 'up',
  DOWN: 'down',
  PAGE_UP: 'pageUp',
  PAGE_DOWN: 'pageDown',
  HOME: 'home',
  END: 'end',
  ENTER: 'enter',
  BACK: 'back',
  QUIT: 'quit',
  TAB_1: 'tab1',
  TAB_2: 'tab2',
  TAB_3: 'tab3',
  TAB_4: 'tab4',
  TAB_NEXT: 'tabNext',
  TAB_PREV: 'tabPrev',
  COMPARE: 'compare',
  DAILY: 'daily',
  MODE_NEXT: 'modeNext',
  MODE_PREV: 'modePrev',
  FILTER: 'filter',
  ERASE: 'erase',
  FREEZE: 'freeze',
  HELP: 'help',
  GAME_CYCLE: 'gameCycle',
  BUCKET_CYCLE: 'bucketCycle',
  SORT: 'sort',
  ALERTS: 'alerts',
  REFRESH: 'refresh',
});

// Right arrow descends and left ascends, so the pair reads the same way as
// enter/escape rather than doing nothing on one side.
const SEQUENCES = new Map([
  [`${ESC}[A`, ACTION.UP],
  [`${ESC}[B`, ACTION.DOWN],
  [`${ESC}[C`, ACTION.ENTER],
  [`${ESC}[D`, ACTION.BACK],
  [`${ESC}[H`, ACTION.HOME],
  [`${ESC}[F`, ACTION.END],
  [`${ESC}[Z`, ACTION.TAB_PREV],
  [`${ESC}[5~`, ACTION.PAGE_UP],
  [`${ESC}[6~`, ACTION.PAGE_DOWN],
  [`${ESC}[1~`, ACTION.HOME],
  [`${ESC}[4~`, ACTION.END],
]);

const KEYS = new Map([
  ['q', ACTION.QUIT],
  ['j', ACTION.DOWN],
  ['k', ACTION.UP],
  ['g', ACTION.GAME_CYCLE],
  ['h', ACTION.BUCKET_CYCLE],
  ['s', ACTION.SORT],
  ['a', ACTION.ALERTS],
  ['r', ACTION.REFRESH],
  ['c', ACTION.COMPARE],
  ['d', ACTION.DAILY],
  ['f', ACTION.FREEZE],
  ['?', ACTION.HELP],
  ['/', ACTION.FILTER],
  ['[', ACTION.MODE_PREV],
  [']', ACTION.MODE_NEXT],
  ['1', ACTION.TAB_1],
  ['2', ACTION.TAB_2],
  ['3', ACTION.TAB_3],
  ['4', ACTION.TAB_4],
  ['\r', ACTION.ENTER],
  ['\n', ACTION.ENTER],
  ['\t', ACTION.TAB_NEXT],
  [String.fromCharCode(3), ACTION.QUIT],
  // Backspace/DEL get their own action rather than sharing ACTION.BACK with
  // Escape: outside the filter prompt the two still mean the same thing
  // (nav.mjs's reduce() sends both to ascend()), but while filtering they
  // must not - Escape cancels the filter, Backspace edits it - and the two
  // byte sequences are otherwise indistinguishable once decoded.
  [String.fromCharCode(127), ACTION.ERASE],
  [String.fromCharCode(8), ACTION.ERASE],
]);

// Give-up threshold for a CSI that never reaches a final byte at all. A real
// CSI terminates (see matchSequence's scan below) well before this; this
// bound only protects against a buffer that will never match anything,
// which must be dropped rather than wedging the decoder forever.
const MAX_SEQUENCE = 5;

/**
 * @param {string} chunk bytes just read from stdin
 * @param {string} pending leftover from the previous call
 * @param {{ capturingText?: boolean }} [options] `capturingText: true` is the
 *   filter prompt's mode: every printable byte becomes literal `text`, bound
 *   key or not, except the four keys that still act as keys (see below).
 * @returns {{ actions: string[], pending: string, text?: string }}
 *   `text` is the literal characters typed, in order. Outside `capturingText`
 *   it is (as before) only ever the LAST unbound printable byte in the chunk -
 *   a single offered character a caller may or may not use; `capturingText`
 *   is what turns it into an accumulating string, because the filter prompt
 *   needs every character, not just the last one.
 */
export function decode(chunk, pending = '', { capturingText = false } = {}) {
  let buffer = `${pending}${chunk ?? ''}`;
  const actions = [];
  let text;
  // Set once the capturing branch below has written to `text`. Filter input
  // is captured a character at a time, but capturing can end MID-CHUNK (an
  // embedded Enter/Escape/Backspace/Ctrl-C), and the non-capturing branch
  // further down still runs its own last-char-wins assignment to `text` for
  // ITS OWN purpose (offering a stray printable to whatever comes next).
  // Without this flag, a printable arriving AFTER the flip would silently
  // overwrite the filter text already captured before it - e.g.
  // `decode('ab\rcd', '', { capturingText: true })` would report `text: 'd'`,
  // discarding the "ab" the user actually typed and applying a filter they
  // never asked for. Once real filter input has landed in `text`, nothing
  // after it in this same chunk is allowed to touch that field again -
  // deliberately no "second text field" for whatever comes after the close.
  let textIsFilterInput = false;
  // Local, mutable copy: a single chunk can both OPEN capturing (typing `/`
  // then more bytes in the same paste) and CLOSE it (typing text then Enter
  // or Escape in the same paste), so the mode has to be able to flip
  // mid-buffer rather than being fixed for the whole call.
  let capturing = capturingText;

  const emit = (action) => {
    actions.push(action);
    if (action === ACTION.FILTER) capturing = true;
    else if (action === ACTION.ENTER || action === ACTION.BACK) capturing = false;
  };

  while (buffer.length) {
    if (buffer[0] === ESC) {
      const match = matchSequence(buffer);
      if (match === 'incomplete') break;           // wait for the rest
      if (match) {
        // An unmapped-but-terminated CSI (Delete, Insert, bracketed paste, ...)
        // carries a length but no action: consume it whole and emit nothing,
        // rather than letting decode fall through to KEYS on the leftovers.
        if (match.action) emit(match.action);
        buffer = buffer.slice(match.length);
        continue;
      }
      // A lone escape with something unrecognised after it: treat the escape
      // as a keypress and reconsider the remainder from scratch.
      emit(ACTION.BACK);
      buffer = buffer.slice(1);
      continue;
    }

    const ch = buffer[0];

    if (capturing) {
      // Only the keys that close (Enter/Escape - the latter routed through
      // the ESC branch above) or edit (Backspace/DEL) the prompt, plus the
      // one BYTE that must never be swallowed by anything (Ctrl-C, 0x03),
      // still act as keys here. Every other byte is literal text whether or
      // not KEYS binds it elsewhere - otherwise "berry" or "pixel-carnivals"
      // could never be typed, since between them they hit five bound letters
      // (c, a, g, h, s) that would otherwise fire COMPARE/ALERTS/GAME_CYCLE/
      // BUCKET_CYCLE/SORT instead of reaching the filter.
      //
      // QUIT is exempted by BYTE, not by action: KEYS maps BOTH the control
      // byte Ctrl-C AND the printable letter `q` to ACTION.QUIT, and `bound
      // === ACTION.QUIT` alone cannot tell those two apart. Without the
      // `ch < ' '` guard, typing "queen" or "pixel-quilt" into the filter
      // quit the whole dashboard on the `q` and silently dropped it from the
      // captured text. ENTER and ERASE need no such guard: every byte KEYS
      // maps to either of them (\r, \n, DEL, BS) is already a control byte,
      // never a printable one, so neither can be reached by a letter.
      const bound = KEYS.get(ch);
      if (bound === ACTION.ENTER || bound === ACTION.ERASE || (bound === ACTION.QUIT && ch < ' ')) {
        emit(bound);
      } else if (ch >= ' ' && ch !== String.fromCharCode(127)) {
        text = (text ?? '') + ch;
        textIsFilterInput = true;
      }
      buffer = buffer.slice(1);
      continue;
    }

    const action = KEYS.get(ch);
    if (action) emit(action);
    // Never overwrites filter input already captured above: a stray
    // printable arriving after the prompt closed mid-chunk is not part of
    // what the user typed into the filter, and reporting it as `text` would
    // silently substitute one search term for another.
    else if (!textIsFilterInput && ch >= ' ' && ch !== String.fromCharCode(127)) text = ch;
    buffer = buffer.slice(1);
  }

  return text === undefined ? { actions, pending: buffer } : { actions, pending: buffer, text };
}

function matchSequence(buffer) {
  const hit = SEQUENCES.get(buffer.slice(0, 3)) ?? SEQUENCES.get(buffer.slice(0, 4));
  if (hit) {
    const length = SEQUENCES.get(buffer.slice(0, 3)) ? 3 : 4;
    return { action: hit, length };
  }
  // A bare ESC is a keypress; ESC followed by a non-CSI byte is not a sequence.
  if (buffer.length === 1) return null;
  if (buffer[1] !== '[') return null;

  // Not a sequence we map. It may still be a real CSI we don't act on -
  // Delete, Insert, unmapped keypad/function keys, bracketed paste. A CSI
  // runs ESC '[', then parameter bytes (0x30-0x3F), then intermediate bytes
  // (0x20-0x2F), then exactly one final byte (0x40-0x7E). Scan for that
  // final byte: if the sequence terminates, consume the whole span and
  // report no action, so it is never replayed byte-by-byte through KEYS.
  for (let i = 2; i < buffer.length; i++) {
    const code = buffer.charCodeAt(i);
    if (code >= 0x40 && code <= 0x7e) return { length: i + 1 };
    if (!((code >= 0x30 && code <= 0x3f) || (code >= 0x20 && code <= 0x2f))) break;
  }

  // No final byte in sight yet: keep waiting, unless the buffer has grown
  // past all hope of being a real sequence, in which case give up on it.
  return buffer.length < MAX_SEQUENCE ? 'incomplete' : null;
}
