import { formatUsd, formatUsdSigned } from '../money.mjs';

const ESC = String.fromCharCode(27);

export const C = {
  reset: `${ESC}[0m`,
  dim: `${ESC}[2m`,
  bold: `${ESC}[1m`,
  red: `${ESC}[31m`,
  green: `${ESC}[32m`,
  yellow: `${ESC}[33m`,
  cyan: `${ESC}[36m`,
  redBg: `${ESC}[41m${ESC}[97m`,
};

export const ESCAPE = ESC;

export function num(v) {
  const n = Number(v);
  return Number.isFinite(n) ? n : 0;
}

export function int(v) {
  return Math.round(num(v)).toLocaleString('en-US');
}

/** A count, or a dash when there is no reading - distinct from a counted zero. */
export function intOrDash(v) {
  return v === null || v === undefined || v === '' ? '-' : int(v);
}

/** Signed integer delta, or a dash when there is no previous sample yet. */
export function intSigned(v) {
  if (v === null || v === undefined || v === '' || !Number.isFinite(Number(v))) return '-';
  const n = Math.round(Number(v));
  return n > 0 ? `+${n.toLocaleString('en-US')}` : n.toLocaleString('en-US');
}

/**
 * RTP arrives as a fraction (0.9669...). A value at or below 1.5 is therefore
 * a fraction and needs scaling; anything larger is already a percentage.
 *
 * `null`/`undefined`/`''` mean "not measured" and must return '-', not '0.00'.
 * `Number(null)` is 0 and `Number.isFinite(0)` is true, so without this
 * explicit check first, an absent `rtp` would render as a confident "this
 * bonus returns 0% RTP" - the same trap `money.mjs`'s `toUsd` guards against.
 * A genuine measured zero (`percent(0)`) must still render "0.00".
 */
export function percent(value) {
  if (value === null || value === undefined || value === '') return '-';
  const n = Number(value);
  if (!Number.isFinite(n)) return '-';
  return `${(Math.abs(n) <= 1.5 ? n * 100 : n).toFixed(2)}`;
}

/**
 * A share (0..1) as a percentage WITH its trailing `%`, or `-` when unmeasured.
 *
 * The one formatting rule for every SHARE column on the dashboard - built on
 * `percent()` rather than reimplemented, so the figure cannot render at a
 * different precision depending on whether it came from `views/game.mjs`
 * (the TTY) or `views/plain.mjs` (piped): the same number diffed between the
 * two used to disagree in the second decimal place.
 */
export function sharePercent(value) {
  const p = percent(value);
  return p === '-' ? '-' : `${p}%`;
}

/**
 * A number fixed to `dp` decimal places, or '-' when it was never measured.
 *
 * Exactly `percent()`'s trap: `Number(null)` is 0 and finite, so without this
 * explicit check first, an absent `avgBet` would render as a confident
 * "$0.00" - a specific, wrong average bet for a mode nobody measured, right
 * next to a `cost` column that already prints '-' for the same absence.
 * `fixed(0, dp)` is a genuine measured zero and must still render "0.00".
 */
export function fixed(v, dp) {
  if (v === null || v === undefined || v === '') return '-';
  const n = Number(v);
  return Number.isFinite(n) ? n.toFixed(dp) : '-';
}

/**
 * A fixed-precision figure with a leading `$`, or a bare `-` when unmeasured -
 * never `$-`, a dash wearing a currency sign. Built on `fixed()` rather than
 * re-deriving absence locally, so this can never disagree with `fixed()`'s
 * own null/undefined/'' guard.
 */
export function usdFixed(v, dp) {
  const f = fixed(v, dp);
  return f === '-' ? '-' : `$${f}`;
}

export function clock(ms) {
  return new Date(ms ?? Date.now()).toTimeString().slice(0, 8);
}

/** HH:MM in UTC - what a bucket boundary is actually aligned to. */
export function utcClock(ms) {
  return new Date(ms ?? Date.now()).toISOString().slice(11, 16);
}

export function humanAge(ms) {
  const s = Math.round(ms / 1000);
  if (s < 90) return `${s}s`;
  const m = Math.round(s / 60);
  return m < 90 ? `${m}m` : `${Math.round(m / 60)}h`;
}

/**
 * Red when the studio is down on the figure, green when it is up, dim for an
 * absent reading.
 *
 * `Number(dollars) < 0` is false for a null figure - the same trap as
 * everywhere else in this file - which would paint an unmeasured dash GREEN,
 * this dashboard's colour for "the studio is up". Deciding colour from the
 * FORMATTED TEXT rather than re-deriving absence locally means this can never
 * disagree with `formatUsd`'s own dash-vs-number decision.
 */
export function money(dollars) {
  const text = formatUsd(dollars);
  const colour = text === '-' ? C.dim : Number(dollars) < 0 ? C.red : C.green;
  return `${colour}${text}${C.reset}`;
}

/** The same, with an explicit sign - for deltas and day figures. */
export function moneySigned(dollars) {
  const text = formatUsdSigned(dollars);
  const colour = text === '-' ? C.dim : Number(dollars) < 0 ? C.red : C.green;
  return `${colour}${text}${C.reset}`;
}

/**
 * Raw micro-dollars (optionally reduced to the studio's share of them) to
 * display dollars - the ONE conversion for `dTurnover`/`dProfit`/
 * `dayTurnover`/`dayProfit`, which arrive raw, unlike `turnoverUsd`/
 * `profitUsd`/`expectedUsd`/`vsExpectedUsd`, which are already dollars and
 * must never pass through here.
 *
 * Previously defined byte-for-byte identically in `views/game.mjs`,
 * `views/mode.mjs` and `views/plain.mjs` - three copies of the single
 * highest-consequence figure on this dashboard, where a wrong divisor scales
 * a number by 1,000,000x while it still looks plausible. One copy now; the
 * three views import it instead of keeping their own.
 */
export function toDisplay(raw, state, share = 1) {
  if (raw === null || raw === undefined) return null;
  const units = state.money?.unitsPerDollar || 1;
  return (Number(raw) / units) * share;
}

/**
 * A raw turnover-shaped figure as `$X.XX`, converted through `toDisplay` -
 * or, with `already: true`, a figure that is ALREADY display dollars
 * (`turnoverUsd` and friends), passed straight to `formatUsd` untouched.
 * `already` exists so a HEALTH-tab column reading a snapshot's pre-converted
 * total and a LIVE/TODAY column reading a raw trail delta can share one
 * function without either one dividing by `unitsPerDollar` an extra, wrong
 * time.
 */
export function usd(v, state, already = false) {
  return formatUsd(already ? v : toDisplay(v, state));
}

/** A raw turnover/profit delta as a signed `+$X.XX` / `-$X.XX`. */
export function usdSigned(v, state) {
  return formatUsdSigned(toDisplay(v, state));
}

/** A raw profit figure, converted AND reduced to the studio's share, signed. */
export function shareSigned(v, state) {
  return formatUsdSigned(toDisplay(v, state, state.money?.profitShare));
}

/**
 * `shareSigned`, painted by `moneySigned` - what a PROFIT cell on the terminal
 * shows, so a loss is red wherever it is drawn. Never for `views/plain.mjs`:
 * a redirect gets no escapes, and formats the same figure unpainted.
 */
export function profitSigned(v, state) {
  return moneySigned(toDisplay(v, state, state.money?.profitShare));
}
