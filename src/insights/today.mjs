/**
 * The landing page's day: everything since 00:00:00Z, the UTC day the Engine
 * studio dashboard reports "today" over.
 *
 * Pinned to midnight UTC, like the analysis page's Today, and independent of
 * the configured accounting-day hour - the point of this page is to line up
 * with the studio dashboard, and that dashboard's day is the UTC day.
 *
 * Studio-wide figures come off the TEAM trail (the roster summed at each
 * poll), read through the same replica-lag filter the settlement page uses
 * (settlement.mjs steadyReadings), so a running total here ends exactly where
 * the settlement page's "today so far" does. Per-game and per-hour figures
 * come off each game's own trail through hourlySeries, which drops an
 * outage's catch-up step rather than piling it onto one hour.
 *
 * Null is not zero throughout: an hour nobody watched, a game with no reading,
 * a yesterday the trail does not reach - each stays null, and the charts leave
 * it empty.
 */

import { toUsd, toShareUsd } from '../money.mjs';
import { steadyReadings } from './settlement.mjs';
import { hourlySeries } from './conclusions.mjs';
import { gameRowsOver } from './span.mjs';
import { monthKey } from './periods.mjs';

export const HOUR_MS = 3_600_000;
export const DAY_MS = 86_400_000;
// A reading this long after the one before it breaks the line: eight missed
// polls at the default 2.5 minutes, the same allowance hourlySeries makes.
const MAX_GAP_MS = 20 * 60_000;
// How far from "this time yesterday" a players-online reading may sit and
// still stand for it.
const NEAR_MS = 15 * 60_000;

const measured = (v) => v !== null && v !== undefined && v !== '' && Number.isFinite(Number(v));

/** Epoch ms of the most recent 00:00:00Z at or before `ts`. */
export function utcMidnight(ts) {
  const d = new Date(ts);
  return Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate());
}

/**
 * One field's running change since `from`, one point per reading, from a
 * month-to-date trail, in raw units.
 *
 * The first point is the baseline at zero: at `from` itself when the trail
 * holds a reading at or before it, or at the first reading inside the window
 * when it does not - and then `partial` names that reading's time. A step
 * counts when the reading it arrives at is strictly after `from` and not
 * after `to`, so the step arriving at 00:00:00 is yesterday's last interval.
 * A step across a month boundary is the reset, and is skipped.
 *
 * A reading more than `maxGapMs` after the one before starts a new run: a
 * null point goes in first so the line breaks over the missed stretch. The
 * step itself still counts - the counters are cumulative, so the running
 * total stays exact even where the line cannot show how it got there.
 */
export function running(trail, field, { from, to, maxGapMs = MAX_GAP_MS }) {
  const kept = steadyReadings(trail, field);
  const firstIn = kept.findIndex((s) => Number(s.ts) > from);
  const start = firstIn === -1 ? -1 : firstIn > 0 ? firstIn - 1 : 0;
  if (start === -1 || Number(kept[start].ts) > to) return { points: [], total: null, partial: null };
  const partial = Number(kept[start].ts) > from ? Number(kept[start].ts) : null;
  const points = [{ ts: partial ?? from, value: 0 }];
  let total = 0, counted = 0;
  for (let i = start + 1; i < kept.length; i++) {
    const prev = kept[i - 1], cur = kept[i], ts = Number(cur.ts);
    if (ts > to) break;
    if (monthKey(prev.ts) === monthKey(cur.ts)) {
      total += Number(cur.fields[field]) - Number(prev.fields[field]);
      counted++;
    }
    // The break sits just after the reading before the gap, but never ahead
    // of the baseline: that reading can be yesterday's, before an overnight
    // outage.
    if (ts - Number(prev.ts) > maxGapMs) points.push({ ts: Math.max(Number(prev.ts) + 1, points.at(-1).ts), value: null });
    points.push({ ts, value: total });
  }
  return { points: counted ? points : [], total: counted ? total : null, partial };
}

/**
 * Players online at each poll in [from, to), a level rather than a change.
 * A stretch longer than `maxGapMs` without a reading breaks the line.
 */
export function onlineDay(trail, { from, to, maxGapMs = MAX_GAP_MS, field = 'onlinePlayers', inclusive = true }) {
  const points = [];
  let last = null;
  for (const s of Array.isArray(trail) ? trail : []) {
    const ts = Number(s?.ts), v = s?.fields?.[field];
    if (!measured(ts) || !measured(v) || ts < from || (inclusive ? ts > to : ts >= to)) continue;
    if (last !== null && ts - last > maxGapMs) points.push({ ts: last + 1, value: null });
    points.push({ ts, value: Number(v) });
    last = ts;
  }
  return points;
}

/** The players-online reading nearest `ts`, within NEAR_MS, or null. */
function onlineNear(trail, ts, field = 'onlinePlayers') {
  let best = null;
  for (const s of Array.isArray(trail) ? trail : []) {
    const at = Number(s?.ts), v = s?.fields?.[field];
    if (!measured(at) || !measured(v) || Math.abs(at - ts) > NEAR_MS) continue;
    if (!best || Math.abs(at - ts) < Math.abs(best.ts - ts)) best = { ts: at, value: Number(v) };
  }
  return best ? best.value : null;
}

const shift = (points, by) => points.map((p) => ({ ts: p.ts + by, value: p.value }));
const rtpOf = (profit, turnover) => (profit !== null && turnover !== null && turnover > 0 ? (1 - profit / turnover) * 100 : null);

/**
 * Everything the landing page draws.
 *
 * @param {{ now: number, money: object, rows: object[], online: number|null,
 *   teamTrail: object[], onlineTrail: object[], gameTrails: Record<string, object[]> }} input
 *   rows are the roster rows (buildState); teamTrail and onlineTrail should
 *   reach back to just before yesterday's 00:00Z for the comparisons.
 */
export function todayModel({ now, money, rows = [], online = null, teamTrail = [], onlineTrail = [], gameTrails = {} }) {
  const from = utcMidnight(now);
  const yFrom = from - DAY_MS;
  const usd = (raw) => toUsd(raw, money);
  const share = (raw) => toShareUsd(raw, money.profitShare, money);

  const today = Object.fromEntries(['profit', 'turnover', 'count'].map((f) => [f, running(teamTrail, f, { from, to: now })]));
  // The same elapsed slice of yesterday, for the comparisons - only when the
  // trail reaches yesterday's midnight, or the slice would be short.
  const slice = (f) => {
    const r = running(teamTrail, f, { from: yFrom, to: now - DAY_MS });
    return r.partial === null ? r.total : null;
  };
  const yesterday = { profit: slice('profit'), turnover: slice('turnover'), count: slice('count') };

  const kpis = {
    profit: { value: share(today.profit.total), yesterday: share(yesterday.profit) },
    turnover: { value: usd(today.turnover.total), yesterday: usd(yesterday.turnover) },
    bets: { value: today.count.total, yesterday: yesterday.count },
    online: { value: measured(online) ? Number(online) : null, yesterday: onlineNear(onlineTrail, now - DAY_MS) },
    rtp: { value: rtpOf(today.profit.total, today.turnover.total), yesterday: rtpOf(yesterday.profit, yesterday.turnover) },
  };

  // Yesterday's whole day, laid on today's clock.
  const yDay = running(teamTrail, 'profit', { from: yFrom, to: from });
  const toShare = (points) => points.map((p) => ({ ts: p.ts, value: p.value === null ? null : share(p.value) }));
  const curve = {
    today: toShare(today.profit.points),
    yesterday: yDay.partial === null ? shift(toShare(yDay.points), DAY_MS) : [],
  };

  const players = {
    today: onlineDay(onlineTrail, { from, to: now }),
    yesterday: shift(onlineDay(onlineTrail, { from: yFrom, to: from, inclusive: false }), DAY_MS),
  };

  return { from, now, partial: today.profit.partial, kpis, curve, online: players, hours: hoursOf(gameTrails, { from, now, usd, share }), games: gamesOf(rows, gameTrails, from, money) };
}

/**
 * The day's 24 clock hours. Each is `closed`, `filling` (the hour now falls
 * in) or `future`; a future hour carries nulls, never zeros. Per game, an
 * hour its trail watched but nobody played is a measured 0; an hour its
 * trail missed is null. An hour sums the games that measured it, and is null
 * when none did.
 */
function hoursOf(gameTrails, { from, now, usd, share }) {
  const slugs = Object.keys(gameTrails ?? {});
  const series = Object.fromEntries(slugs.map((slug) => {
    const trail = gameTrails[slug];
    const byHour = (field) => new Map(hourlySeries([trail], field, { now, from }).map((s) => [s.from, s.value]));
    return [slug, { turnover: byHour('turnover'), profit: byHour('profit'), count: byHour('count') }];
  }));
  const current = from + Math.floor((now - from) / HOUR_MS) * HOUR_MS;
  return Array.from({ length: 24 }, (_, h) => {
    const start = from + h * HOUR_MS;
    const state = start > current ? 'future' : start === current ? 'filling' : 'closed';
    const byGame = {};
    let turnover = null, profit = null, bets = null;
    for (const slug of slugs) {
      const pick = (field) => (state === 'future' ? null : series[slug][field].get(start) ?? null);
      const t = pick('turnover'), p = pick('profit'), c = pick('count');
      byGame[slug] = { turnoverUsd: usd(t), profitUsd: share(p), bets: c };
      if (t !== null) turnover = (turnover ?? 0) + t;
      if (p !== null) profit = (profit ?? 0) + p;
      if (c !== null) bets = (bets ?? 0) + c;
    }
    return { hour: h, from: start, state, turnoverUsd: usd(turnover), profitUsd: share(profit), bets, byGame };
  });
}

/**
 * Each roster game over the day, largest turnover first; unmeasured last.
 * `watchedFrom` is the game's first reading in the trail: a game joins the
 * roster with its first bet of the month, so before then it was not being
 * watched at all - which is not the same as a reading missed.
 */
function gamesOf(rows, gameTrails, from, money) {
  const rank = (v) => (measured(v) ? Number(v) : -Infinity);
  const firstOf = (trail) => (Array.isArray(trail) && trail.length && measured(trail[0]?.ts) ? Number(trail[0].ts) : null);
  return gameRowsOver(rows, gameTrails, from, money)
    .map((r) => ({ slug: r.name, label: r.label, pending: r.pending ?? false, online: r.online ?? null,
      bets: r.count, turnoverUsd: r.turnoverUsd, profitUsd: r.profitUsd, watchedFrom: firstOf(gameTrails?.[r.name]) }))
    .sort((a, b) => rank(b.turnoverUsd) - rank(a.turnoverUsd) || String(a.label).localeCompare(String(b.label)));
}
