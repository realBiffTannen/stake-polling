import { C, ESCAPE } from './format.mjs';

const ESC = ESCAPE;

/** Drop the least important columns until the row fits. */
export function fit(columns, available) {
  const chosen = [...columns].sort((a, b) => a.priority - b.priority);
  const kept = [];
  let used = 0;
  for (const column of chosen) {
    const cost = column.width + (kept.length ? 1 : 0);
    if (used + cost > available) continue;
    kept.push(column);
    used += cost;
  }
  return columns.filter((c) => kept.includes(c));
}

/**
 * One table row, every cell exactly its column's width as the terminal shows
 * it. A cell may carry colour (a loss painted red): `padStart`/`slice` count
 * escape bytes as characters, which would both under-pad the cell and risk
 * cutting a sequence in half, so a coloured cell is measured with `visible`
 * and cut with `clip`. A plain cell is cut exactly as it always was - `clip`
 * closes a colour it never opened, and a bare reset in plain text is noise.
 */
export function row(columns, valueOf) {
  return columns
    .map((c) => {
      const raw = String(valueOf(c) ?? '');
      const text = raw.includes(ESC) ? clip(raw, c.width) : raw.slice(0, c.width);
      const gap = ' '.repeat(Math.max(0, c.width - visible(text)));
      return c.align === 'right' ? `${gap}${text}` : `${text}${gap}`;
    })
    .join(' ');
}

/** Box drawing that always produces exactly `width` visible characters. */
export function boxer(width) {
  const inner = width - 4;
  return {
    top: (left, right) => cap('┌', '┐', left, right),
    bottom: (left) => cap('└', '┘', left, ''),
    rule: (label) => {
      const text = label ? ` ${label} ` : '';
      return `├─${text}${'─'.repeat(Math.max(0, width - 3 - visible(text)))}┤`;
    },
    line: (content) => `│ ${pad(content, inner)} │`,
  };

  function cap(l, r, left, right) {
    const rightText = clip(right, Math.max(0, width - 4));
    const leftText = clip(left, Math.max(0, width - 4 - visible(rightText)));
    const filler = Math.max(0, width - 4 - visible(leftText) - visible(rightText));
    return `${l}─${leftText}${'─'.repeat(filler)}${rightText}─${r}`;
  }
}

function pad(content, inner) {
  const text = clip(content, inner);
  return text + ' '.repeat(Math.max(0, inner - visible(text)));
}

/** Length ignoring colour codes - what the terminal actually shows. */
export function visible(text) {
  return String(text).replace(new RegExp(`${ESC}\\[[0-9;]*m`, 'g'), '').length;
}

/**
 * Cut to a visible length without slicing an escape sequence in half, and
 * without padding - callers decide whether the remainder is spaces or box rule.
 */
export function clip(text, limit) {
  const str = String(text ?? '');
  if (visible(str) <= limit) return str;

  let out = '';
  let shown = 0;
  let i = 0;
  while (i < str.length && shown < limit) {
    if (str[i] === ESC) {
      const end = str.indexOf('m', i);
      if (end === -1) break;
      out += str.slice(i, end + 1);
      i = end + 1;
      continue;
    }
    out += str[i++];
    shown++;
  }
  return `${out}${C.reset}`;
}
