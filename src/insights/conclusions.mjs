/**
 * What a chart is saying, in one sentence.
 *
 * Every chart on the analysis and game pages carries a headline computed here
 * from the same numbers it draws, so the words can never disagree with the
 * picture beside them. Each function returns the drawable rows AND the
 * sentence; a view never writes a conclusion of its own.
 *
 * Two rules run through all of it:
 *
 *   - Null is not zero. A game or mode with no reading is left out of a
 *     ranking and out of every sum, and a headline over nothing measured is
 *     null (the view says "nothing measured yet") rather than "$0.00".
 *   - A margin is only ever judged against its noise. At the sample sizes
 *     this studio sees, a month's margin can sit tens of points from the edge
 *     by pure variance; saying "this game is broken" off one would be wrong
 *     far more often than right.
 */

import { formatUsd, formatUsdSigned, toUsd, toShareUsd, DEFAULT_MONEY } from '../money.mjs';
import { marginOf } from '../math/checks.mjs';
import { bucketSeries, bucketStart } from '../buckets.mjs';

/** A mode costing more than this many base bets is a feature buy, not base play. */
export const BUY_COST = 5;

const HOUR_MS = 3_600_000;
const measured = (v) => v !== null && v !== undefined && v !== '' && Number.isFinite(Number(v));
const sumOf = (xs) => xs.reduce((a, b) => a + b, 0);
const usdS = (v) => formatUsdSigned(v);
const ints = (v) => Math.round(v).toLocaleString('en-US');
const plural = (n, word) => `${n} ${n === 1 ? word : `${word}s`}`;
const hourLabel = (ts) => `${new Date(ts).toISOString().slice(11, 13)}:00Z`;
const dayLabel = (date) => new Date(`${date}T00:00:00Z`).toLocaleDateString('en-US', { month: 'short', day: 'numeric', timeZone: 'UTC' });

/**
 * Whether a per-mode row is a feature buy. The one definition every buy
 * figure uses, so a mode cannot be a buy in one chart and base play in the one
 * beside it. A mode whose cost was never read is not called a buy: an ANTE at
 * 1.25x and a BONUS at 200x are told apart only by that number.
 */
export const isFeatureBuy = (row) => measured(row?.cost) && Number(row.cost) > BUY_COST;

/**
 * Studio profit/loss per game, winners first.
 * @param {{ name: string, label?: string, profitUsd: number|null }[]} rows roster-shaped rows, studio-share USD
 */
export function pnlByGame(rows = []) {
  const bars = rows.filter((r) => measured(r.profitUsd))
    .map((r) => ({ key: r.name, label: r.label ?? r.name, value: Number(r.profitUsd) }))
    .sort((a, b) => b.value - a.value);
  if (!bars.length) return { bars, headline: null };
  const net = sumOf(bars.map((b) => b.value));
  // Zero stays green by the standing ruling: a game that broke even did not lose.
  const down = bars.filter((b) => b.value < 0);
  let headline = `Net ${usdS(net)} across ${plural(bars.length, 'game')} - `;
  if (!down.length) {
    headline += `every game is up. ${bars[0].label} made most (${usdS(bars[0].value)}).`;
  } else {
    const worst = down.at(-1);
    headline += `${bars.length - down.length} up, ${down.length} down. ${worst.label} lost most (${usdS(worst.value)})`;
    if (down.length === 1) headline += ', the only game down.';
    else if (down.length > 3) {
      const losses = down.map((b) => -b.value).sort((a, b) => b - a);
      headline += `; the 3 biggest losers account for ${Math.round(sumOf(losses.slice(0, 3)) / sumOf(losses) * 100)}% of all losses.`;
    } else headline += '.';
  }
  return { bars, headline };
}

/** Each game's share of the period's turnover, largest first. */
export function turnoverShare(rows = [], { span = 'this month' } = {}) {
  const games = rows.filter((r) => measured(r.turnoverUsd) && Number(r.turnoverUsd) >= 0);
  const total = sumOf(games.map((r) => Number(r.turnoverUsd)));
  if (!games.length || total <= 0) return { bars: [], headline: null };
  const bars = games.map((r) => ({ key: r.name, label: r.label ?? r.name, value: Number(r.turnoverUsd) / total * 100 }))
    .sort((a, b) => b.value - a.value);
  let headline = `${bars[0].label} takes ${Math.round(bars[0].value)}% of turnover ${span}`;
  headline += bars.length > 3 ? `; the top 3 take ${Math.round(sumOf(bars.slice(0, 3).map((b) => b.value)))}%.` : '.';
  return { bars, headline };
}

/**
 * The share of each game's turnover that came from feature buys.
 * @param {Record<string, { cost: number|null, turnover: number|null }[]>} modeRowsBySlug
 * @param {Record<string, string>} labels slug -> display name
 */
export function buyShare(modeRowsBySlug = {}, labels = {}) {
  let buys = 0, all = 0;
  const bars = [];
  for (const [slug, rows] of Object.entries(modeRowsBySlug)) {
    const played = (Array.isArray(rows) ? rows : []).filter((r) => measured(r.turnover));
    const total = sumOf(played.map((r) => Number(r.turnover)));
    if (!played.length || total <= 0) continue;
    const bought = sumOf(played.filter(isFeatureBuy).map((r) => Number(r.turnover)));
    buys += bought; all += total;
    bars.push({ key: slug, label: labels[slug] ?? slug, value: bought / total * 100 });
  }
  bars.sort((a, b) => b.value - a.value);
  if (!bars.length) return { bars, headline: null };
  let headline = `Feature buys (modes costing more than ${BUY_COST}x the base bet) are ${Math.round(buys / all * 100)}% of studio turnover.`;
  if (bars.length > 1) {
    headline += ` Highest: ${bars[0].label} (${Math.round(bars[0].value)}%); lowest: ${bars.at(-1).label} (${Math.round(bars.at(-1).value)}%).`;
  }
  return { bars, headline };
}

/**
 * The observed margin beside the captured edge, with a two-standard-error band.
 *
 * The band is built per MODE and combined, because that is the only level at
 * which sigma/sqrt(n) is honest (see convergence() in src/math/checks.mjs):
 * the game margin is the turnover-weighted sum of its mode margins, so its
 * variance is sum((t_i/T)^2 * sigma_i^2 / n_i). Still approximate - it takes
 * stakes as near-equal within a mode, and one whale widens the true band.
 *
 * @param {{ profit: number|null, turnover: number|null, edge: number|null,
 *   parts: { count: number|null, turnover: number|null, sigma: number|null }[] }} input
 *   profit and turnover in raw units (profit GROSS); sigma per-stake
 */
export function noiseBand({ profit, turnover, edge, parts = [] }) {
  const margin = marginOf({ profit, turnover });
  const e = measured(edge) ? Number(edge) : null;
  const played = parts.filter((p) => measured(p.turnover) && Number(p.turnover) > 0);
  const total = sumOf(played.map((p) => Number(p.turnover)));
  let se = null;
  if (played.length && total > 0 && played.every((p) => measured(p.sigma) && Number(p.sigma) > 0 && measured(p.count) && Number(p.count) > 0)) {
    se = Math.sqrt(sumOf(played.map((p) => (Number(p.turnover) / total) ** 2 * Number(p.sigma) ** 2 / Number(p.count))));
  }
  const lo = e !== null && se !== null ? e - 2 * se : null;
  const hi = e !== null && se !== null ? e + 2 * se : null;
  const z = margin !== null && e !== null && se ? (margin - e) / se : null;
  return { margin, edge: e, se, lo, hi, z, outside: z === null ? null : Math.abs(z) > 2 };
}

/** One sentence over a set of noise bands. `noun` is plural: 'games', 'modes'. */
export function bandHeadline(rows = [], noun = 'games') {
  const one = noun.replace(/s$/, '');
  const judged = rows.filter((r) => r.outside === true || r.outside === false);
  const unjudged = rows.length - judged.length;
  if (!judged.length) return `These ${noun} cannot be judged yet: none has both a captured model and measured play.`;
  const outside = judged.filter((r) => r.outside);
  // Payouts are violently right-skewed, so the two directions are not
  // symmetric evidence: one big win at a small sample drops a margin far
  // below its band routinely, while a margin far ABOVE the edge is bounded
  // and much rarer by luck alone.
  const which = (r) => (Number(r.z) < 0 ? 'paid out more than its band' : 'kept more than its band');
  const why = [
    outside.some((r) => Number(r.z) < 0) ? 'A low z is usually one big win at a small sample.' : null,
    outside.some((r) => Number(r.z) > 0) ? 'A high z - the house keeping far more than its edge - is the rarer and more telling signal.' : null,
  ].filter(Boolean).join(' ');
  let headline = outside.length
    ? `${outside.length} of ${judged.length} judged ${noun} sit outside ±2 standard errors of their captured edge: `
      + `${outside.map((r) => `${r.label} (z = ${Number(r.z).toFixed(1)}, ${which(r)})`).join(', ')}. ${why} Either way it is a prompt to look, not proof of a fault.`
    : judged.length === 1
      ? `The one judged ${one} sits inside ±2 standard errors of its captured edge: consistent with ordinary variance.`
      : `All ${judged.length} judged ${noun} sit inside ±2 standard errors of their captured edge: consistent with ordinary variance.`;
  if (unjudged) headline += ` ${unjudged} ${unjudged === 1 ? one : noun} cannot be judged: no captured model, a mode missing its captured sigma, or no measured play.`;
  return headline;
}

/**
 * One cumulative field's change per wall-clock hour, summed across trails,
 * OLDEST first. An hour no trail measured is null, never 0.
 *
 * @param {object[][]} trails oldest-first `{ ts, fields }` samples, one array per trail
 * @param {{ now: number, hours?: number, from?: number|null }} span the first
 *   hour is the one holding `from` when given, else `hours` back from now's
 */
export function hourlySeries(trails = [], field, { now, hours = 24, from = null, maxGapMs = 20 * 60_000 }) {
  return summedSeries(trails, field, { now, sizeMs: HOUR_MS, count: hours, from, maxGapMs });
}

/**
 * The same, in buckets of any size: `count` buckets back to the one `now`
 * falls in, or from the one holding `from`. The live strip reads it one poll
 * interval at a time.
 */
export function summedSeries(trails = [], field, { now, sizeMs, count = 24, from = null, maxGapMs = 20 * 60_000 }) {
  const last = bucketStart(now, sizeMs);
  const first = from !== null && from !== undefined ? bucketStart(from, sizeMs) : last - (count - 1) * sizeMs;
  // A trail is split wherever the collector went quiet for longer than
  // `maxGapMs`: the first sample after an outage carries the whole outage's
  // volume in one step, and pinning that on the hour it arrived in once put
  // 23,000 bets into a single hour. Each segment's first sample is only a
  // baseline, so the outage step is dropped and the hours it spans stay null.
  const per = trails.filter(Array.isArray).flatMap((t) => splitAtGaps(t, maxGapMs)).map((t) => new Map(
    bucketSeries(t, field, { sizeMs, from: first, to: now }).map((b) => [b.from, b.value])));
  const out = [];
  for (let start = first; start <= last; start += sizeMs) {
    const values = per.map((m) => m.get(start)).filter((v) => v !== null && v !== undefined);
    out.push({ from: start, value: values.length ? sumOf(values) : null });
  }
  return out;
}

function splitAtGaps(trail, maxGapMs) {
  const segments = [];
  let current = [];
  for (const s of trail) {
    if (current.length && Number(s.ts) - Number(current.at(-1).ts) > maxGapMs) { segments.push(current); current = []; }
    current.push(s);
  }
  if (current.length) segments.push(current);
  return segments;
}

/** Hourly profit (raw GROSS units) to the studio's share, and its running total. */
export function pnlTrend(series = [], money, { span = 'Last 24h' } = {}) {
  const hourly = series.map((s) => toShareUsd(s.value, money.profitShare, money));
  let running = 0, any = false;
  const cumulative = hourly.map((v) => {
    if (v === null) return null;
    running += v; any = true;
    return running;
  });
  if (!any) return { hourly, cumulative, headline: null, hourHeadline: null };
  let big = null, worst = null, up = 0, n = 0;
  hourly.forEach((v, i) => {
    if (v === null) return;
    n++; if (v >= 0) up++;
    if (big === null || Math.abs(v) > Math.abs(hourly[big])) big = i;
    if (worst === null || v < hourly[worst]) worst = i;
  });
  const headline = `${span}: ${usdS(running)} studio P/L. Biggest hourly swing: ${usdS(hourly[big])} in the hour from ${hourLabel(series[big].from)}.`;
  const hourHeadline = `${up} of ${plural(n, 'measured hour')} ended at or above zero; worst: ${usdS(hourly[worst])} in the hour from ${hourLabel(series[worst].from)}.`;
  return { hourly, cumulative, headline, hourHeadline };
}

/** Bets per hour: the busiest hour and how much of the span was measured. */
export function betsTrend(series = []) {
  const got = series.filter((s) => s.value !== null && s.value !== undefined);
  if (!got.length) return { headline: null };
  const peak = got.reduce((a, b) => (b.value > a.value ? b : a));
  return { headline: `Busiest hour: ${hourLabel(peak.from)} (${ints(peak.value)} bets). ${ints(sumOf(got.map((s) => s.value)))} bets over ${got.length} of ${series.length} hours measured.` };
}

/**
 * Players online, as each hour's peak. A level, not a counter - so no deltas,
 * and a sample missing the reading is skipped rather than read as nobody.
 */
export function onlineHourly(samples = [], { now, hours = 24, from = null }) {
  const last = bucketStart(now, HOUR_MS);
  const first = from !== null && from !== undefined ? bucketStart(from, HOUR_MS) : last - (hours - 1) * HOUR_MS;
  const peaks = new Map();
  let latest = null;
  for (const s of Array.isArray(samples) ? samples : []) {
    const v = s?.fields?.onlinePlayers;
    if (!measured(v)) continue;
    latest = Number(v);
    const start = bucketStart(s.ts, HOUR_MS);
    if (start < first || start > last) continue;
    peaks.set(start, Math.max(peaks.get(start) ?? -Infinity, Number(v)));
  }
  const series = [];
  for (let start = first; start <= last; start += HOUR_MS) series.push({ from: start, value: peaks.has(start) ? peaks.get(start) : null });
  const got = series.filter((s) => s.value !== null);
  if (!got.length) return { series, headline: null };
  const peak = got.reduce((a, b) => (b.value > a.value ? b : a));
  return { series, headline: `Peak: ${ints(peak.value)} players online at ${hourLabel(peak.from)}. Now: ${latest === null ? '-' : ints(latest)}.` };
}

/** Days of the month at or above zero, and the best and worst of them. */
export function dailyPnl(daily = []) {
  const days = daily.filter((d) => measured(d.profit));
  if (!days.length) return { headline: null };
  const up = days.filter((d) => Number(d.profit) >= 0).length;
  const best = days.reduce((a, b) => (Number(b.profit) > Number(a.profit) ? b : a));
  const worst = days.reduce((a, b) => (Number(b.profit) < Number(a.profit) ? b : a));
  return { headline: `${up} of ${plural(days.length, 'measured day')} ended at or above zero. Best: ${dayLabel(best.date)} (${usdS(best.profit)}). Worst: ${dayLabel(worst.date)} (${usdS(worst.profit)}).` };
}

/** Studio profit/loss per bet mode, and the mode that moved the game most. */
export function pnlByMode(modeRows = [], money) {
  const bars = (Array.isArray(modeRows) ? modeRows : []).filter((r) => measured(r.profit))
    .map((r) => ({ key: r.mode, label: r.mode, value: toShareUsd(r.profit, money.profitShare, money) }))
    .sort((a, b) => b.value - a.value);
  if (!bars.length) return { bars, headline: null };
  const net = sumOf(bars.map((b) => b.value));
  const big = bars.reduce((a, b) => (Math.abs(b.value) > Math.abs(a.value) ? b : a));
  let headline = `Net ${usdS(net)} across ${plural(bars.length, 'mode')}. ${big.label} moved it most (${usdS(big.value)})`;
  headline += net !== 0 && Math.sign(big.value) === Math.sign(net) && Math.abs(big.value) > Math.abs(net)
    ? ` - more than the whole net, so the other modes together were ${big.value < 0 ? 'up' : 'down'}.`
    : '.';
  return { bars, headline };
}

/** Each mode's share of bets beside its share of turnover. */
export function modeMix(modeRows = []) {
  const list = Array.isArray(modeRows) ? modeRows : [];
  const bets = sumOf(list.filter((r) => measured(r.count)).map((r) => Number(r.count)));
  const turn = sumOf(list.filter((r) => measured(r.turnover)).map((r) => Number(r.turnover)));
  if (bets <= 0 && turn <= 0) return { rows: [], headline: null };
  const share = (v, total) => (measured(v) && total > 0 ? Number(v) / total * 100 : null);
  const rows = list.map((r) => ({ key: r.mode, label: r.mode, bets: share(r.count, bets), turnover: share(r.turnover, turn), cost: r.cost }));
  const buys = rows.filter(isFeatureBuy);
  let headline;
  if (buys.length) {
    headline = `Feature buys are ${sumOf(buys.map((r) => r.bets ?? 0)).toFixed(1)}% of bets but ${sumOf(buys.map((r) => r.turnover ?? 0)).toFixed(1)}% of turnover.`;
  } else {
    const top = rows.filter((r) => r.bets !== null).reduce((a, b) => (b.bets > a.bets ? b : a), rows[0]);
    headline = `${top.label} is ${top.bets === null ? '-' : top.bets.toFixed(1)}% of bets and ${top.turnover === null ? '-' : top.turnover.toFixed(1)}% of turnover.`;
  }
  return { rows, headline };
}

/** How many games get a colour of their own in a donut; the rest fold into Other. */
export const DONUT_SLOTS = 7;

/**
 * Four breakdowns by game - bets, turnover, profit gains, profit losses -
 * sharing ONE colour assignment, so a game is the same colour in all four.
 *
 * The seven games with the largest share in ANY of the four take the slots,
 * in that order; everything else folds into a single Other slice, drawn last.
 * Slices are ordered by slot, not by size: ring neighbours are then palette
 * neighbours, the only pairs the palette is validated to tell apart. `slot`
 * is an index for the view to map onto its palette (null for Other) - colour
 * itself is the view's business.
 *
 * Gains and losses are split by sign; a game that measured exactly zero is in
 * neither, and an unmeasured game is in none of the four.
 */
export function donutSets(rows = [], { span = 'this month' } = {}) {
  const list = (pickValue) => rows.map((r) => ({ key: r.name, label: r.label ?? r.name, value: pickValue(r) }))
    .filter((s) => s.value !== null && s.value > 0);
  const raw = {
    bets: list((r) => (measured(r.count) ? Number(r.count) : null)),
    turnover: list((r) => (measured(r.turnoverUsd) ? Number(r.turnoverUsd) : null)),
    gains: list((r) => (measured(r.profitUsd) && Number(r.profitUsd) > 0 ? Number(r.profitUsd) : null)),
    losses: list((r) => (measured(r.profitUsd) && Number(r.profitUsd) < 0 ? -Number(r.profitUsd) : null)),
  };
  const relevance = new Map();
  for (const items of Object.values(raw)) {
    const total = sumOf(items.map((s) => s.value));
    for (const s of items) relevance.set(s.key, Math.max(relevance.get(s.key) ?? 0, s.value / total));
  }
  const slot = new Map([...relevance.entries()]
    .sort((a, b) => b[1] - a[1] || String(a[0]).localeCompare(String(b[0])))
    .slice(0, DONUT_SLOTS).map(([key], i) => [key, i]));

  const build = (items, sentence) => {
    const named = items.filter((s) => slot.has(s.key)).map((s) => ({ ...s, slot: slot.get(s.key) })).sort((a, b) => a.slot - b.slot);
    const rest = items.filter((s) => !slot.has(s.key));
    if (rest.length) named.push({ key: 'other', label: `Other (${rest.length})`, value: sumOf(rest.map((s) => s.value)), slot: null });
    const total = sumOf(items.map((s) => s.value));
    const top = items.length ? items.reduce((a, b) => (b.value > a.value ? b : a)) : null;
    return { slices: named, total, headline: top ? sentence(top, Math.round(top.value / total * 100), total, items.length) : null };
  };
  return {
    bets: build(raw.bets, (top, p) => `${top.label} has ${p}% of bets ${span}.`),
    turnover: build(raw.turnover, (top, p) => `${top.label} has ${p}% of turnover ${span}.`),
    gains: build(raw.gains, (top, p, total, n) => `Gains total ${usdS(total)} from ${plural(n, 'game')}; ${top.label} is ${p}%.`),
    losses: build(raw.losses, (top, p, total, n) => `Losses total ${usdS(-total)} from ${plural(n, 'game')}; ${top.label} is ${p}%.`),
  };
}

/**
 * One noise band per game, built from its per-mode rows (raw units, profit
 * GROSS) and the captured per-mode sigmas. A game with play but no captured
 * model stays as an unjudged row - "cannot judge" is itself a finding - and a
 * game with no measured play is left out.
 */
export function gameBands(modeRowsBySlug = {}, math = {}, labels = {}) {
  const out = [];
  for (const [slug, rows] of Object.entries(modeRowsBySlug)) {
    const played = (Array.isArray(rows) ? rows : []).filter((r) => measured(r.turnover) && Number(r.turnover) > 0);
    if (!played.length) continue;
    const model = math?.[slug] ?? null;
    const profits = played.filter((r) => measured(r.profit));
    const band = noiseBand({
      profit: profits.length ? sumOf(profits.map((r) => Number(r.profit))) : null,
      turnover: sumOf(played.map((r) => Number(r.turnover))),
      edge: model?.edge ?? null,
      parts: played.map((r) => ({ count: r.count, turnover: r.turnover, sigma: model?.modes?.[r.mode]?.sigma ?? null })),
    });
    out.push({ key: slug, label: labels[slug] ?? slug, value: band.margin, lo: band.lo, hi: band.hi, ref: band.edge, z: band.z, outside: band.outside });
  }
  return out;
}

/** One noise band per bet mode, each against its own captured RTP. */
export function modeBands(modeRows = [], math = null) {
  return (Array.isArray(modeRows) ? modeRows : []).filter((r) => measured(r.turnover) && Number(r.turnover) > 0).map((r) => {
    const captured = math?.modes?.[r.mode] ?? null;
    const edge = captured && measured(captured.rtp) ? 1 - Number(captured.rtp) : null;
    const band = noiseBand({ profit: r.profit, turnover: r.turnover, edge, parts: [{ count: r.count, turnover: r.turnover, sigma: captured?.sigma ?? null }] });
    return { key: r.mode, label: r.mode, value: band.margin, lo: band.lo, hi: band.hi, ref: band.edge, z: band.z, outside: band.outside };
  });
}

/** Per-mode turnover in dollars, the modes nobody measured or nobody played left out. */
function playedModes(rows, money) {
  return (Array.isArray(rows) ? rows : [])
    .map((r) => ({ mode: String(r?.mode ?? '?'), value: toUsd(r?.turnover, money), buy: isFeatureBuy(r) }))
    .filter((m) => m.value !== null && m.value > 0);
}

/**
 * Turnover by game, then by bet mode, for a treemap: every game that took
 * turnover in the span, biggest first, each with its modes biggest first.
 *
 * A treemap can only draw a positive area, so a mode with no reading or a
 * zero is left out rather than drawn as a sliver - and a game none of whose
 * modes measured anything is absent, not a zero-sized tile. With nothing
 * measured at all, `total` is null and so is the headline.
 *
 * @param {Record<string, object[]>} modeRowsBySlug per-mode rows, raw units
 * @param {Record<string, string>} labels slug -> display name
 */
export function turnoverTree(modeRowsBySlug = {}, labels = {}, money = DEFAULT_MONEY, { span = 'this month' } = {}) {
  const games = Object.entries(modeRowsBySlug ?? {}).map(([slug, rows]) => {
    const modes = playedModes(rows, money).sort((a, b) => b.value - a.value || a.mode.localeCompare(b.mode));
    return { key: slug, label: labels?.[slug] ?? slug, value: sumOf(modes.map((m) => m.value)), modes };
  }).filter((g) => g.modes.length)
    .sort((a, b) => b.value - a.value || String(a.key).localeCompare(String(b.key)));
  if (!games.length) return { games, total: null, headline: null };
  const total = sumOf(games.map((g) => g.value));
  const share = (v, of) => `${Math.round(v / of * 100)}%`;
  const [top] = games;
  let headline = `${top.label} takes ${share(top.value, total)} of turnover ${span}`;
  headline += top.modes.length > 1 ? `, and ${top.modes[0].mode} is ${share(top.modes[0].value, top.value)} of that.` : `, all of it in ${top.modes[0].mode}.`;
  // The biggest tile is not always inside the biggest game: one heavily
  // bought feature can outweigh a bigger game spread across many modes.
  const slice = games.flatMap((g) => g.modes.map((m) => ({ game: g, ...m }))).reduce((a, b) => (b.value > a.value ? b : a));
  if (slice.game !== top) headline += ` The single biggest slice is ${slice.game.label} ${slice.mode}, at ${share(slice.value, total)}.`;
  return { games, total, headline };
}

/**
 * Where the turnover flows: studio, then each game, then base play or
 * feature buys (isFeatureBuy - the same split as buyShare and buyEconomics).
 * Money in dollars; a game none of whose modes measured turnover is left out,
 * and so is the side of the split a game never touched.
 */
export function turnoverFlow(modeRowsBySlug = {}, labels = {}, money = DEFAULT_MONEY, { span = 'this month' } = {}) {
  const games = Object.entries(modeRowsBySlug ?? {}).map(([slug, rows]) => {
    const modes = playedModes(rows, money);
    const buys = sumOf(modes.filter((m) => m.buy).map((m) => m.value));
    const base = sumOf(modes.filter((m) => !m.buy).map((m) => m.value));
    return { key: slug, label: labels?.[slug] ?? slug, base, buys, total: base + buys, played: modes.length };
  }).filter((g) => g.played && g.total > 0)
    .sort((a, b) => b.total - a.total || String(a.key).localeCompare(String(b.key)))
    .map(({ played, ...g }) => g);
  if (!games.length) return { games, base: null, buys: null, total: null, headline: null };
  const base = sumOf(games.map((g) => g.base)), buys = sumOf(games.map((g) => g.buys)), total = base + buys;
  if (buys === 0) return { games, base, buys, total, headline: `${formatUsd(total)} of turnover ${span}, all of it base play: no mode played was a feature buy.` };
  const pct = (v) => `${Math.round(v / total * 100)}%`;
  let headline = `${formatUsd(total)} of turnover ${span}: ${formatUsd(base)} (${pct(base)}) base play, ${formatUsd(buys)} (${pct(buys)}) feature buys.`;
  const lead = games.reduce((a, b) => (b.buys > a.buys ? b : a));
  headline += games.filter((g) => g.buys > 0).length > 1
    ? ` ${lead.label} sends the most into buys: ${formatUsd(lead.buys)}, ${Math.round(lead.buys / buys * 100)}% of all of them.`
    : ` Every buy was in ${lead.label}.`;
  return { games, base, buys, total, headline };
}
