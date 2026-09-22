/**
 * Display formatting for the web views.
 *
 * Money goes through src/money.mjs unchanged - there is no second definition
 * of what a dollar is anywhere in this project. What is here is the null
 * discipline (`-`, never `$0.00`, for a figure nobody measured) and the two
 * clocks.
 *
 * `clock` and `humanAge` are deliberately NOT imported from src/tui/format.mjs.
 * That module also exports the ANSI colour table, and a browser has no use for
 * it; the eight lines below are cheaper than the coupling.
 */

import { formatUsd, formatUsdSigned } from '../money.mjs';
import { html } from './html.mjs';

export const DASH = '-';

/**
 * What "unmeasured" means for every figure on the web layer. Exported so a
 * caller that needs to gate a colour/tone decision (rather than format a
 * value) shares this one definition instead of writing a second guard.
 */
export const blank = (v) => v === null || v === undefined || v === '' || !Number.isFinite(Number(v));

export function usd(dollars) {
  return formatUsd(dollars);
}

export function usdSigned(dollars) {
  return formatUsdSigned(dollars);
}

/**
 * Money with its sign in colour: red below zero, green at or above it.
 *
 * Zero is green by the standing ruling - a game that broke even did not lose.
 * A figure nobody measured is a bare dash with no colour at all, because
 * colouring an unmeasured cell green would be a claim.
 */
export function money(dollars, { signed = false } = {}) {
  if (blank(dollars)) return DASH;
  const n = Number(dollars);
  return html`<span class="${n < 0 ? 'bad' : 'good'}">${signed ? usdSigned(n) : usd(n)}</span>`;
}

export function int(value) {
  return blank(value) ? DASH : Math.round(Number(value)).toLocaleString('en-US');
}

export function intSigned(value) {
  if (blank(value)) return DASH;
  const n = Math.round(Number(value));
  return n > 0 ? `+${n.toLocaleString('en-US')}` : n.toLocaleString('en-US');
}

export function pct(value, dp = 2) {
  return blank(value) ? DASH : `${Number(value).toFixed(dp)}%`;
}

export function utcClock(ms) {
  if (blank(ms)) return DASH;
  return `${new Date(Number(ms)).toISOString().slice(11, 19)}Z`;
}

export function utcHm(ms) {
  if (blank(ms)) return DASH;
  return `${new Date(Number(ms)).toISOString().slice(11, 16)}Z`;
}

export function humanAge(ms) {
  if (blank(ms)) return DASH;
  const seconds = Math.max(0, Math.round(Number(ms) / 1000));
  if (seconds < 60) return `${seconds}s`;
  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) return `${minutes}m`;
  return `${Math.floor(minutes / 60)}h${String(minutes % 60).padStart(2, '0')}m`;
}
