/**
 * The time picker: this month, today, or the last 24 hours.
 *
 *   month   what the API reports - month-to-date from the 1st at 00:00Z. The
 *           per-game and per-mode responses carry nothing finer.
 *   today   the change since 00:00:00Z, read off the collector's own trail.
 *           At 01:00Z that is one hour of play, because one hour of the UTC
 *           day has elapsed - not a rolling window.
 *   24h     the change over the trailing 24 hours, from the same trail.
 *
 * Today is pinned to midnight UTC on purpose, independent of the configured
 * accounting-day hour: "today" on this picker means the UTC calendar day.
 *
 * Both trail spans are built from deltas (window.mjs sumSince), so a month
 * rollover inside the window contributes its real volume, and a game or mode
 * the trail never measured stays null rather than reading as a quiet zero.
 */

import { sumSince } from '../window.mjs';
import { parseModeField, modeOrder } from '../modes.mjs';
import { toUsd, toShareUsd } from '../money.mjs';

export const SPANS = {
  month: { label: 'This month', words: 'this month' },
  today: { label: 'Today', words: 'today' },
  '24h': { label: 'Last 24h', words: 'in the last 24h' },
};

export function spanOf(param) {
  return Object.hasOwn(SPANS, param ?? '') ? param : 'month';
}

/** Where a trail span begins, or null for the month (which the API reports whole). */
export function spanStart(span, now) {
  if (span === 'today') {
    const d = new Date(now);
    return Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate());
  }
  if (span === '24h') return now - 86_400_000;
  return null;
}

/**
 * Roster-shaped rows over a trail span: the same fields the month rows carry,
 * so every chart and conclusion takes either without knowing which it has.
 */
export function gameRowsOver(rows = [], trails = {}, from, money) {
  return rows.map((r) => {
    const trail = trails?.[r.name];
    const count = sumSince(trail, 'count', from);
    const turnover = sumSince(trail, 'turnover', from);
    const profit = sumSince(trail, 'profit', from);
    return { name: r.name, label: r.label ?? r.name, pending: r.pending, online: r.online ?? null,
      count, turnover, profit, turnoverUsd: toUsd(turnover, money), profitUsd: toShareUsd(profit, money.profitShare, money) };
  });
}

/**
 * Per-mode rows over a trail span, shaped like the per-mode API response.
 * A mode's cost and deployed RTP are not in the trail, so they are taken from
 * the month response (null for a mode that response no longer lists).
 */
export function modeRowsOver(modeTrail, from, monthRows = []) {
  if (!Array.isArray(modeTrail) || !modeTrail.length) return [];
  const names = new Set();
  for (const s of modeTrail) for (const key of Object.keys(s?.fields ?? {})) {
    const parsed = parseModeField(key);
    if (parsed) names.add(parsed.mode);
  }
  const month = Array.isArray(monthRows) ? monthRows : [];
  const cost = new Map(month.map((r) => [r.mode, r.cost ?? null]));
  // Deployed RTP is the mode's configuration, not a figure of the period, so
  // it carries over from the month response unchanged - which is what lets a
  // trail span still compare realised hold with theoretical.
  const rtp = new Map(month.map((r) => [r.mode, r.rtp ?? null]));
  return modeOrder([...names]).map((mode) => ({
    mode,
    cost: cost.get(mode) ?? null,
    rtp: rtp.get(mode) ?? null,
    count: sumSince(modeTrail, `${mode}:count`, from),
    turnover: sumSince(modeTrail, `${mode}:turnover`, from),
    profit: sumSince(modeTrail, `${mode}:profit`, from),
  }));
}
