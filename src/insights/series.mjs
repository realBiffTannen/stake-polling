/**
 * Time series for the trends charts: players online per poll slot, daily
 * figures with their 7-day averages, the hour-of-day profile, and daily
 * turnover split by game.
 *
 * Null is not zero throughout. A slot the collector did not read, a day the
 * daily sync did not fetch, a game absent from a synced day - each stays
 * null, so a line breaks over it rather than diving to zero, and no average
 * counts it.
 */

import { formatUsd, formatUsdSigned } from '../money.mjs';
import { bucketStart } from '../buckets.mjs';
import { median } from '../detect/baseline.mjs';
import { hourlySeries, summedSeries } from './conclusions.mjs';

const SLOT_MS = 150_000;
const HOUR_MS = 3_600_000;
const DAY_MS = 86_400_000;
const measured = (v) => v !== null && v !== undefined && v !== '' && Number.isFinite(Number(v));
const hm = (ts) => `${new Date(ts).toISOString().slice(11, 16)}Z`;
const ints = (v) => Math.round(v).toLocaleString('en-US');
const pad = (h) => `${String(h).padStart(2, '0')}:00Z`;
const plural = (n, word) => `${n} ${n === 1 ? word : `${word}s`}`;
const dayLabel = (date) => new Date(`${date}T00:00:00Z`).toLocaleDateString('en-US', { month: 'short', day: 'numeric', timeZone: 'UTC' });

/**
 * Players online, one point per poll slot from `hours` back to the slot now
 * falls in, oldest first. The trail has been sampled faster than the grid in
 * the past; when several readings share a slot the LAST one stands for it.
 */
export function onlineSlots(samples = [], { now, hours = 24, slotMs = SLOT_MS, field = 'onlinePlayers' }) {
  const last = bucketStart(now, slotMs);
  const first = bucketStart(now - hours * HOUR_MS, slotMs);
  const bySlot = new Map();
  for (const s of Array.isArray(samples) ? samples : []) {
    const v = s?.fields?.[field];
    if (!measured(v)) continue;
    const slot = bucketStart(s.ts, slotMs);
    if (slot < first || slot > last) continue;
    const prev = bySlot.get(slot);
    if (!prev || s.ts >= prev.ts) bySlot.set(slot, { ts: s.ts, value: Number(v) });
  }
  const out = [];
  for (let slot = first; slot <= last; slot += slotMs) out.push({ ts: slot, value: bySlot.has(slot) ? bySlot.get(slot).value : null });
  return out;
}

/** Fold points into `bucketMs` buckets by their peak - a long range keeps its highs. */
export function thinMax(points = [], bucketMs) {
  const buckets = new Map();
  for (const p of points) {
    const b = bucketStart(p.ts, bucketMs);
    const prev = buckets.has(b) ? buckets.get(b) : null;
    buckets.set(b, !measured(p.value) ? prev : prev === null ? Number(p.value) : Math.max(prev, Number(p.value)));
  }
  return [...buckets.entries()].map(([ts, value]) => ({ ts, value }));
}

/** Peak, low, now, and now against the same time yesterday. */
export function onlineHeadline(points = [], { now }) {
  const got = points.filter((p) => measured(p.value));
  if (!got.length) return null;
  const peak = got.reduce((a, b) => (b.value > a.value ? b : a));
  const low = got.reduce((a, b) => (b.value < a.value ? b : a));
  const latest = got.at(-1);
  const dayAgo = got.filter((p) => Math.abs(p.ts - (latest.ts - 24 * HOUR_MS)) <= 15 * 60_000)
    .sort((a, b) => Math.abs(a.ts - (latest.ts - 24 * HOUR_MS)) - Math.abs(b.ts - (latest.ts - 24 * HOUR_MS)))[0];
  let headline = `Peak ${ints(peak.value)} online at ${hm(peak.ts)}, low ${ints(low.value)} at ${hm(low.ts)}; ${ints(latest.value)} online now`;
  headline += dayAgo ? `, against ${ints(dayAgo.value)} at this time yesterday.` : '.';
  return headline;
}

/** Trailing mean over the last `window` values, needing `minMeasured` of them. */
export function movingAverage(values = [], window = 7, minMeasured = 3) {
  return values.map((_, i) => {
    const slice = values.slice(Math.max(0, i - window + 1), i + 1).filter(measured).map(Number);
    return slice.length >= minMeasured ? slice.reduce((a, b) => a + b, 0) / slice.length : null;
  });
}

/** A running total; a gap breaks the line but the total carries on after it. */
export function cumulative(values = []) {
  let total = 0;
  return values.map((v) => {
    if (!measured(v)) return null;
    total += Number(v);
    return total;
  });
}

/**
 * The last 7 complete days against the 7 before - today is still filling and
 * would drag the latest week down, so it is left out.
 */
export function weekOnWeek(days = [], key, { noun, fmt = String }) {
  const complete = days.filter((d) => !d.current && measured(d[key]));
  const last = complete.slice(-7), prior = complete.slice(-14, -7);
  if (last.length < 3 || prior.length < 3) return `${complete.length} complete days measured - not enough for a week-on-week comparison yet.`;
  const mean = (xs) => xs.reduce((a, d) => a + Number(d[key]), 0) / xs.length;
  const now = mean(last), before = mean(prior);
  const change = before !== 0 ? (now - before) / Math.abs(before) * 100 : null;
  const words = change === null ? 'against nothing the week before'
    : `${change >= 0 ? 'up' : 'down'} ${Math.abs(Math.round(change))}% on the 7 before`;
  return `${noun} averaged ${fmt(now)} a day over the last ${last.length} complete days, ${words}.`;
}

/**
 * The average of each UTC hour of the day across the trail - when play
 * happens, not how much. Each hour of the day is averaged over the days that
 * measured it.
 */
export function hourOfDay(trail = [], field = 'count', { now, days = 7 }) {
  const series = hourlySeries([trail], field, { now, hours: days * 24 });
  const sums = Array.from({ length: 24 }, () => ({ total: 0, n: 0 }));
  for (const s of series) {
    if (!measured(s.value)) continue;
    const h = new Date(s.from).getUTCHours();
    sums[h].total += Number(s.value);
    sums[h].n++;
  }
  const rows = sums.map((s, hour) => ({ hour, value: s.n ? s.total / s.n : null }));
  const got = rows.filter((r) => r.value !== null);
  if (!got.length) return { rows, headline: null };
  const busy = got.reduce((a, b) => (b.value > a.value ? b : a));
  const quiet = got.reduce((a, b) => (b.value < a.value ? b : a));
  const pad = (h) => `${String(h).padStart(2, '0')}:00Z`;
  return { rows, headline: `Busiest hour of the day: ${pad(busy.hour)} (${ints(busy.value)} on average); quietest: ${pad(quiet.hour)} (${ints(quiet.value)}).` };
}

// A day's busiest hour only says something about the day if most of the day
// was measured: a day the collector watched for six hours peaks at whichever
// of those six was busiest, which is a fact about the outage.
const PEAK_DAY_MIN_HOURS = 18;

/**
 * One cumulative field's change in every hour of the last `days` UTC days,
 * as a grid: `dates` oldest first, and a cell per hour that has begun - hours
 * later today have not happened, so they get no cell at all, while an hour
 * the collector missed is a cell whose value is null (drawn empty, never 0).
 * The hour now falls in is still filling and says so (`inProgress`); it is
 * left out of every comparison.
 *
 * Built on hourlySeries, so an outage's catch-up step is dropped rather than
 * piled onto the hour it arrived in, and a month rollover reads as volume.
 */
export function hourByDay(trail = [], field = 'count', { now, days = 7, noun = 'bets' }) {
  const from = bucketStart(now, DAY_MS) - (days - 1) * DAY_MS;
  const current = bucketStart(now, HOUR_MS);
  const byStart = new Map(hourlySeries([trail], field, { now, from }).map((s) => [s.from, s.value]));
  const dates = Array.from({ length: days }, (_, d) => new Date(from + d * DAY_MS).toISOString().slice(0, 10));
  const cells = [];
  for (let day = 0; day < days; day++) {
    for (let hour = 0; hour < 24; hour++) {
      const start = from + day * DAY_MS + hour * HOUR_MS;
      if (start > current) break;
      const value = byStart.get(start);
      cells.push({ day, hour, value: measured(value) ? Number(value) : null, inProgress: start === current });
    }
  }
  const closed = cells.filter((c) => !c.inProgress);
  const got = closed.filter((c) => c.value !== null);
  if (!got.length) return { dates, cells, headline: null };
  const peak = got.reduce((a, b) => (b.value > a.value ? b : a));
  let headline = `Busiest hour: ${dayLabel(dates[peak.day])} at ${pad(peak.hour)} (${ints(peak.value)} ${noun}).`;
  // Which hour each well-measured, finished day peaked at. Today is never
  // finished, so it never votes.
  const peaks = [];
  for (let day = 0; day < days - 1; day++) {
    const hours = got.filter((c) => c.day === day);
    if (hours.length >= PEAK_DAY_MIN_HOURS) peaks.push(hours.reduce((a, b) => (b.value > a.value ? b : a)).hour);
  }
  if (peaks.length >= 3) {
    const votes = new Map();
    for (const h of peaks) votes.set(h, (votes.get(h) ?? 0) + 1);
    const ranked = [...votes.entries()].sort((a, b) => b[1] - a[1] || a[0] - b[0]);
    const [[hour, n], runner] = ranked;
    headline += n >= 2 && (!runner || runner[1] < n)
      ? ` The day's peak fell at ${pad(hour)} on ${n} of ${plural(peaks.length, 'full day')}.`
      : ` The day's peak moves: no one hour led on more than ${n} of ${plural(peaks.length, 'full day')}.`;
  }
  if (got.length < closed.length) headline += ` ${got.length} of ${closed.length} hours were measured; the rest are left empty, not zero.`;
  return { dates, cells, headline };
}

/**
 * The live strip: players online and bets, one point per poll interval over
 * the last `hours`, oldest first.
 *
 * Players online is a level read at each poll (onlineSlots). Bets are the
 * change in every game's cumulative count over each interval, summed across
 * games and stamped at the interval's END - the moment the poll read it.
 * A missed poll breaks the bet series on both sides: the step after it spans
 * two intervals, and pinning it on one would draw a spike nobody played.
 *
 * The unfinished interval at the end, and anything before the trail reaches,
 * are trimmed; a hole inside stays a null, which the strip draws as a break.
 */
export function liveStream({ online = [], games = {}, now, hours = 3, slotMs = SLOT_MS }) {
  const onlinePoints = trimNulls(onlineSlots(online, { now, hours, slotMs }));
  const sums = summedSeries(Object.values(games ?? {}), 'count', { now, sizeMs: slotMs, from: now - hours * HOUR_MS, maxGapMs: slotMs * 1.5 });
  const bets = trimNulls(sums.map((s) => ({ ts: s.from + slotMs, value: s.value })).filter((p) => p.ts <= now));
  const seen = onlinePoints.filter((p) => p.value !== null);
  const counted = bets.filter((p) => p.value !== null);
  const parts = [];
  if (seen.length) {
    const latest = seen.at(-1), peak = seen.reduce((a, b) => (b.value > a.value ? b : a));
    parts.push(`${ints(latest.value)} players online at ${hm(latest.ts)}, peak ${ints(peak.value)} at ${hm(peak.ts)}`);
  }
  if (counted.length) {
    const latest = counted.at(-1);
    parts.push(`the poll to ${hm(latest.ts)} took ${ints(latest.value)} bets, against a median of ${ints(median(counted.map((p) => p.value)))} over ${plural(counted.length, 'measured poll')}`);
  }
  return { online: onlinePoints, bets, headline: parts.length ? `Last ${hours}h, per poll: ${parts.join('; ')}.` : null };
}

/** Drop the unmeasured points at both ends of a series, never from the middle. */
function trimNulls(points) {
  let start = 0, end = points.length;
  while (start < end && points[start].value === null) start++;
  while (end > start && points[end - 1].value === null) end--;
  return points.slice(start, end);
}

/**
 * Daily turnover and studio P/L (both dollars) over the insight model's days,
 * for the zoomable trend. A day the daily sync never fetched is null in both,
 * so the chart leaves a gap rather than a day of nothing.
 */
export function dailyTrend(daily = []) {
  const rows = (Array.isArray(daily) ? daily : []).map((d) => ({
    date: d.date,
    turnover: d.measured && measured(d.turnover) ? Number(d.turnover) : null,
    profit: d.measured && measured(d.profit) ? Number(d.profit) : null,
    current: !!d.current,
  }));
  const turned = rows.filter((r) => r.turnover !== null), settled = rows.filter((r) => r.profit !== null);
  if (!turned.length && !settled.length) return { rows, headline: null };
  const days = rows.filter((r) => r.turnover !== null || r.profit !== null).length;
  const sum = (list, key) => list.reduce((a, r) => a + r[key], 0);
  const figures = [turned.length ? `${formatUsd(sum(turned, 'turnover'))} turnover` : null,
    settled.length ? `${formatUsdSigned(sum(settled, 'profit'))} studio P/L` : null].filter(Boolean);
  let headline = `${days} of ${plural(rows.length, 'day')} measured: ${figures.join(' and ')}.`;
  if (turned.length) {
    const busy = turned.reduce((a, b) => (b.turnover > a.turnover ? b : a));
    headline += ` Busiest: ${dayLabel(busy.date)} (${formatUsd(busy.turnover)}).`;
  }
  if (settled.length > 1) {
    const best = settled.reduce((a, b) => (b.profit > a.profit ? b : a));
    const worst = settled.reduce((a, b) => (b.profit < a.profit ? b : a));
    headline += ` Studio P/L ran from ${formatUsdSigned(worst.profit)} (${dayLabel(worst.date)}) to ${formatUsdSigned(best.profit)} (${dayLabel(best.date)}).`;
  }
  if (rows.some((r) => r.current)) headline += ' Today is still filling.';
  return { rows, headline };
}

/**
 * Daily turnover by game from the daily-insights snapshot, for a stacked
 * chart: the seven games with the most turnover in the window get a layer
 * each (in that order), the rest fold into Other.
 *
 * `games` lists EVERY game with turnover in the window, biggest first, so a
 * legend can offer all of them - not only the seven that won a layer. With
 * `focus` naming one of them, the chart is that game alone, on its own scale:
 * a game doing a few hundred dollars a day is invisible as a sliver of a
 * $75k stack, and is exactly the one someone picks to look at.
 */
export function turnoverByGame(snapshot = {}, { from, to, money, focus = null }) {
  const dates = Object.keys(snapshot.days ?? {}).filter((d) => d >= from && d <= to).sort();
  const names = new Map();
  const totals = new Map();
  const perDay = dates.map((date) => {
    const day = new Map();
    for (const row of snapshot.days[date]?.rows ?? []) {
      const raw = row?.stats?.turnover;
      if (!measured(raw)) continue;
      const usd = Number(raw) / (money?.unitsPerDollar || 1);
      names.set(row.slug, row.name ?? row.slug);
      day.set(row.slug, usd);
      totals.set(row.slug, (totals.get(row.slug) ?? 0) + usd);
    }
    return day;
  });
  const all = [...totals.values()].reduce((a, b) => a + b, 0);
  const games = [...totals.entries()].sort((a, b) => b[1] - a[1])
    .map(([slug, total]) => ({ slug, name: names.get(slug), total, share: all > 0 ? total / all : null }));
  const picked = games.find((g) => g.slug === focus);
  if (picked) {
    const share = picked.share === null ? '' : `, ${(picked.share * 100).toFixed(1)}% of all games' turnover`;
    return { dates, games, focus: picked.slug, keys: [picked.name],
      rows: perDay.map((day) => ({ [picked.name]: day.has(picked.slug) ? day.get(picked.slug) : null })),
      headline: `${picked.name} took ${formatUsd(picked.total)} of turnover over these ${dates.length} days${share}.` };
  }
  const top = games.slice(0, 7).map((g) => g.slug);
  const hasOther = totals.size > top.length;
  const keys = [...top.map((slug) => names.get(slug)), ...(hasOther ? ['Other'] : [])];
  const rows = perDay.map((day) => {
    const row = {};
    for (const slug of top) row[names.get(slug)] = day.has(slug) ? day.get(slug) : null;
    if (hasOther) {
      const rest = [...day.entries()].filter(([slug]) => !top.includes(slug)).map(([, v]) => v);
      row.Other = rest.length ? rest.reduce((a, b) => a + b, 0) : null;
    }
    return row;
  });
  const leader = top.length ? names.get(top[0]) : null;
  return { dates, games, focus: null, keys, rows, headline: leader ? `${leader} took the most turnover over these ${dates.length} days (${formatUsd(totals.get(top[0]))}).` : null };
}
