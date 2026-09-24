/**
 * What gets paid, and whether the endpoints agree about it.
 *
 * Three figures look alike and are not:
 *
 *   position   the balance endpoint's running figure, carry included.
 *   settled    what Stake actually settles on: the share rate x the summed
 *              roster profit, plus carry. Observed in August 2026, the two
 *              differed by $48 (position -$2,232.37 against a settlement of
 *              -$2,184.05) - replicas disagree, and the roster is the one Stake
 *              uses. A negative settlement pays nothing and carries forward.
 *   expected   the balance endpoint's expectation, which has carry folded in:
 *              expected this month = expectedProfit - carry, which is 7.5% of
 *              turnover x edge.
 *
 * The luck gap is position against the balance endpoint's own expectation;
 * carry sits in both and cancels.
 *
 * Roster `profit` is GROSS house win (see marginOf in src/math/checks.mjs);
 * the studio's share of it is the rate. Everything here returns USD, and
 * null wherever the reading it needs was never taken.
 */

import { toUsd, formatUsd, formatUsdSigned } from '../money.mjs';
import { listOf, idOf } from '../games.mjs';
import { monthKey } from './periods.mjs';

const DAY_MS = 86_400_000;
const measured = (v) => v !== null && v !== undefined && v !== '' && Number.isFinite(Number(v));
const usdS = (v) => formatUsdSigned(v);
const sumOf = (xs) => xs.reduce((a, b) => a + b, 0);
// A derived rate is trusted only on enough money to be meaningful, and within
// a plausible band; near one of the two contract rates it snaps to it.
const RATE_MIN_GROSS = 1000;
const RATE_BAND = [0.02, 0.5];
const CONTRACT_RATES = [0.1, 0.075];
const SNAP = 0.005;

function median(xs) {
  const s = [...xs].sort((a, b) => a - b);
  const m = Math.floor(s.length / 2);
  return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2;
}

function utcMidnight(ts) {
  const d = new Date(ts);
  return Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate());
}

/**
 * A month-to-date trail's readings of `field`, oldest first, with the lagging
 * ones taken out.
 *
 * A reading below the high-water mark of the monotonic counters (count,
 * turnover) is a lagging read replica and is dropped outright - differencing
 * across it would book a fake loss and then a fake recovery. The mark resets
 * with the month, since the counters do. The today page (today.mjs) reads its
 * running figures through the same filter, so the two cannot disagree.
 */
export function steadyReadings(trail, field) {
  const samples = (Array.isArray(trail) ? trail : []).filter((s) => measured(s?.ts) && measured(s?.fields?.[field]));
  const kept = [];
  let hw = null;
  for (const s of samples) {
    const month = monthKey(s.ts);
    const count = measured(s.fields.count) ? Number(s.fields.count) : null;
    const turnover = measured(s.fields.turnover) ? Number(s.fields.turnover) : null;
    if (!hw || hw.month !== month) hw = { month, count: -Infinity, turnover: -Infinity };
    if ((count !== null && count < hw.count) || (turnover !== null && turnover < hw.turnover)) continue;
    if (count !== null) hw.count = count;
    if (turnover !== null) hw.turnover = turnover;
    kept.push(s);
  }
  return kept;
}

/**
 * Gross profit change over (from, to], raw units, from a month-to-date trail
 * (steadyReadings above). An interval that crosses a month boundary is the
 * reset, not play, and is skipped. Null unless the trail holds a reading at
 * or before `from` (without one the slice would be partial) and at least one
 * interval lands inside it.
 */
function profitBetween(trail, from, to) {
  const kept = steadyReadings(trail, 'profit');
  if (!kept.length || Number(kept[0].ts) > from) return null;
  let total = 0, counted = 0;
  for (let i = 1; i < kept.length; i++) {
    const prev = kept[i - 1], cur = kept[i];
    if (Number(cur.ts) <= from || Number(cur.ts) > to) continue;
    if (monthKey(prev.ts) !== monthKey(cur.ts)) continue;
    total += Number(cur.fields.profit) - Number(prev.fields.profit);
    counted++;
  }
  return counted ? total : null;
}

function deriveRate(position, carry, gross, fallback) {
  if (position === null || carry === null || gross === null || Math.abs(gross) < RATE_MIN_GROSS) return { rate: fallback, source: 'configured', raw: null };
  const raw = (position - carry) / gross;
  if (!(raw >= RATE_BAND[0] && raw <= RATE_BAND[1])) return { rate: fallback, source: 'configured', raw };
  const snapped = CONTRACT_RATES.find((r) => Math.abs(raw - r) <= SNAP);
  return { rate: snapped ?? raw, source: 'derived', raw };
}

/**
 * @param {{ balance: { position, expectedProfit, carry }|null, rows: object[], teamTrail?: object[],
 *   daily?: { date: string, profit: number|null, measured?: boolean, current?: boolean }[], money: object, now: number }} input
 *   balance and rows in raw units (rows may be roster entries with `stats`, or flat rows with `profit`)
 */
export function settlement({ balance, rows = [], teamTrail = [], daily = [], money, now }) {
  const position = toUsd(balance?.position, money);
  const carry = toUsd(balance?.carry, money);
  const balanceExpected = toUsd(balance?.expectedProfit, money);
  const expectedMonth = balanceExpected !== null && carry !== null ? balanceExpected - carry : null;
  const gap = position !== null && balanceExpected !== null ? position - balanceExpected : null;

  const profits = listOf(rows).map((r) => r?.stats?.profit ?? r?.profit).filter(measured).map(Number);
  const grossMonth = profits.length ? toUsd(sumOf(profits), money) : null;
  const { rate, source: rateSource, raw: rateDerived } = deriveRate(position, carry, grossMonth, money.profitShare);
  const studioMonth = grossMonth === null ? null : grossMonth * rate;
  const settledNow = studioMonth !== null && carry !== null ? studioMonth + carry : null;
  const residual = position !== null && settledNow !== null ? position - settledNow : null;
  const paidIfSettled = position === null ? null : Math.max(0, position);

  // The projection: the median COMPLETE day of this month, for every full day left.
  const month = monthKey(now);
  const days = (Array.isArray(daily) ? daily : []).filter((d) => d?.measured !== false && !d?.current && measured(d?.profit)
    && typeof d.date === 'string' && d.date.slice(0, 7) === month && Date.parse(`${d.date}T00:00:00Z`) < utcMidnight(now));
  let projection = null;
  if (days.length && studioMonth !== null) {
    const d = new Date(now);
    const daysInMonth = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth() + 1, 0)).getUTCDate();
    const daysLeft = daysInMonth - d.getUTCDate();
    const medianDay = median(days.map((x) => Number(x.profit)));
    const studioMonthEnd = studioMonth + medianDay * daysLeft;
    projection = { studioMonthEnd, settledMonthEnd: carry === null ? null : studioMonthEnd + carry, medianDay, daysLeft, basis: days.length };
  }

  // Today against the same elapsed hours of yesterday, in the configured share.
  const midnight = utcMidnight(now);
  const share = (raw) => (raw === null ? null : toUsd(raw, money) * money.profitShare);
  const today = share(profitBetween(teamTrail, midnight, now));
  const yesterdaySlice = share(profitBetween(teamTrail, midnight - DAY_MS, now - DAY_MS));

  const headlines = {
    gap: gap === null ? null
      : `Position ${usdS(position)} against an expected ${usdS(balanceExpected)} - a luck gap of ${usdS(gap)} (${gap < 0 ? 'players running hot' : gap > 0 ? 'the house running hot' : 'exactly on expectation'}).`,
    settled: settledNow === null ? null
      : `If the month ended now, Stake would settle ${usdS(settledNow)}: ${(rate * 100).toFixed(1)}% of ${usdS(grossMonth)} gross, plus ${usdS(carry)} carried. `
        + (paidIfSettled === null ? '' : paidIfSettled > 0 ? `${formatUsd(paidIfSettled)} would be paid.` : 'Nothing would be paid; the deficit carries forward.'),
    projection: projection === null ? null
      : `At the median complete day so far (${usdS(projection.medianDay)}), the month ends near ${usdS(projection.studioMonthEnd)} studio P/L`
        + `${projection.settledMonthEnd === null ? '' : ` - ${usdS(projection.settledMonthEnd)} after carry`}, with ${projection.daysLeft} full ${projection.daysLeft === 1 ? 'day' : 'days'} left.`,
    today: today === null ? null
      : yesterdaySlice === null ? `Today so far ${usdS(today)}; yesterday's same hours are not in the trail.`
        : `Today so far ${usdS(today)}, against ${usdS(yesterdaySlice)} over the same hours yesterday.`,
  };

  return { position, carry, balanceExpected, expectedMonth, gap, grossMonth, studioMonth, settledNow, residual, paidIfSettled,
    rate, rateSource, rateDerived, projection, today, yesterdaySlice, headlines };
}

/**
 * Do the endpoints agree, and are they fresh?
 *
 * `/games` month money has matched `/stats` to the cent, and the per-mode
 * response should sum to the roster row. They are fetched seconds apart in
 * the same tick, so a small gap on a busy game can be timing; one that
 * persists is not. A game with nothing to compare is unverifiable (null),
 * never a pass.
 *
 * @param {{ roster: object, games: object, perGame: object, snapshots: Record<string, number|null>,
 *   now: number, pollMinutes: number, money: object, cadence?: Record<string, number> }} input
 *   `cadence` is each endpoint's interval in ticks (default 1)
 */
export function dataHealth({ roster, games, perGame = {}, snapshots = {}, now, pollMinutes, money, cadence = {} }) {
  const catalogue = new Map(listOf(games).map((g) => [idOf(g), g]));
  const cent = (v) => v !== null && Math.abs(v) <= 0.01;
  const rows = listOf(roster).filter((r) => idOf(r)).map((r) => {
    const slug = idOf(r);
    const rosterProfit = toUsd(r?.stats?.profit, money);
    const catalogueProfit = toUsd(catalogue.get(slug)?.stats?.month?.profit, money);
    const modes = perGame?.[slug]?.data?.stats;
    const modeProfits = Array.isArray(modes) ? modes.map((m) => m?.profit).filter(measured).map(Number) : [];
    const modesProfit = modeProfits.length ? toUsd(sumOf(modeProfits), money) : null;
    const diffUsd = rosterProfit !== null && catalogueProfit !== null ? catalogueProfit - rosterProfit : null;
    const modesDiffUsd = rosterProfit !== null && modesProfit !== null ? modesProfit - rosterProfit : null;
    const checks = [diffUsd, modesDiffUsd].filter((v) => v !== null);
    return { slug, name: r?.name ?? slug, rosterProfit, catalogueProfit, diffUsd, modesProfit, modesDiffUsd,
      ok: checks.length ? checks.every(cent) : null };
  });

  const period = Math.max(1, Number(pollMinutes) || 1) * 60000;
  const freshness = Object.entries(snapshots).map(([endpoint, ts]) => {
    const ageMs = measured(ts) ? now - Number(ts) : null;
    return { endpoint, ts: measured(ts) ? Number(ts) : null, ageMs, stale: ageMs === null ? null : ageMs > 3 * period * (Number(cadence[endpoint]) || 1) };
  });

  const checkable = rows.filter((r) => r.ok !== null);
  const bad = checkable.filter((r) => !r.ok);
  const stale = freshness.filter((f) => f.stale === true);
  const never = freshness.filter((f) => f.stale === null);
  let headline = checkable.length
    ? `${checkable.length - bad.length} of ${checkable.length} checkable games reconcile to the cent across /stats, /games and the per-mode response`
      + (bad.length ? `; ${bad.map((r) => r.name).join(', ')} ${bad.length === 1 ? 'differs' : 'differ'}.` : '.')
    : 'Nothing to reconcile yet.';
  headline += stale.length ? ` Stale: ${stale.map((f) => f.endpoint).join(', ')}.` : freshness.length ? ' Every endpoint read is fresh.' : '';
  if (never.length) headline += ` Never read: ${never.map((f) => f.endpoint).join(', ')}.`;
  return { rows, freshness, headline };
}
