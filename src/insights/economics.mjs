/**
 * Hold, buy economics and presence - the derived metrics that can be
 * computed from what this collector already polls every 2.5 minutes.
 *
 * Units follow the rest of the insights layer: per-mode and trail figures
 * arrive raw (micro-dollars, `profit` GROSS), and anything returned in
 * dollars says so in its name (`...Usd`, `...PerPlayer`). Studio money is the
 * `profitShare` of gross, as everywhere else.
 *
 * Null is not zero. A figure that could not be measured is null and a
 * headline over nothing is null; a measured zero stays a zero.
 *
 * Two API habits shape the trail arithmetic (both observed against the
 * live API):
 *   - read replicas lag, so a cumulative counter can read LOWER for a tick.
 *     Such a reading is dropped and the next one is differenced against the
 *     high-water mark - never treated as a reset, never differenced against.
 *   - everything resets at 00:00Z on the 1st, so no interval is taken across
 *     a UTC month boundary.
 */

import { isFeatureBuy } from './conclusions.mjs';
import { DEFAULT_MONEY, toUsd, toShareUsd, formatUsd, formatUsdSigned } from '../money.mjs';

const measured = (v) => v !== null && v !== undefined && v !== '' && Number.isFinite(Number(v));
const num = (v) => (measured(v) ? Number(v) : null);
const sumOf = (xs) => xs.reduce((a, b) => a + b, 0);
const pct = (v, dp = 1) => `${(v * 100).toFixed(dp)}%`;
const pp = (v) => `${v > 0 ? '+' : ''}${v.toFixed(1)}pp`;
const monthOf = (ts) => new Date(Number(ts)).toISOString().slice(0, 7);
const played = (rows) => (Array.isArray(rows) ? rows : []).filter((r) => measured(r.turnover) && Number(r.turnover) > 0);

/** Realised and theoretical hold over a set of per-mode rows. */
function holdOf(rows) {
  const live = played(rows);
  if (!live.length) return null;
  const turnover = sumOf(live.map((r) => Number(r.turnover)));
  const withProfit = live.filter((r) => measured(r.profit));
  const realised = withProfit.length
    ? sumOf(withProfit.map((r) => Number(r.profit))) / sumOf(withProfit.map((r) => Number(r.turnover)))
    : null;
  // Theoretical hold is the deployed RTP each mode reports, weighted by the
  // turnover that mode took - so it needs no captured model, and a game whose
  // mix leans on a low-RTP mode is held to that mode's edge.
  const withRtp = live.filter((r) => measured(r.rtp));
  const theoretical = withRtp.length
    ? 1 - sumOf(withRtp.map((r) => Number(r.rtp) * Number(r.turnover))) / sumOf(withRtp.map((r) => Number(r.turnover)))
    : null;
  const deltaPp = realised !== null && theoretical !== null ? (realised - theoretical) * 100 : null;
  return { realised, theoretical, deltaPp, turnover };
}

/**
 * Realised against theoretical hold, one row per game that took any turnover,
 * largest turnover first.
 * @param {Record<string, object[]>} modeRowsBySlug per-mode rows, raw units
 * @param {Record<string, string>} labels slug -> display name
 */
export function holdTable(modeRowsBySlug = {}, labels = {}) {
  const out = [];
  for (const [slug, rows] of Object.entries(modeRowsBySlug ?? {})) {
    const hold = holdOf(rows);
    if (hold) out.push({ key: slug, label: labels?.[slug] ?? slug, ...hold });
  }
  return out.sort((a, b) => b.turnover - a.turnover);
}

/** Studio-wide hold against theory, and the game furthest from its own. */
export function holdHeadline(rows = []) {
  const real = rows.filter((r) => r.realised !== null);
  const theo = rows.filter((r) => r.theoretical !== null);
  if (!real.length) return null;
  const weighted = (list, key) => sumOf(list.map((r) => r[key] * r.turnover)) / sumOf(list.map((r) => r.turnover));
  let headline = `Across ${real.length} ${real.length === 1 ? 'game' : 'games'} the house kept ${pct(weighted(real, 'realised'))} of turnover`;
  headline += theo.length ? ` against a theoretical ${pct(weighted(theo, 'theoretical'))}.` : '.';
  const judged = rows.filter((r) => r.deltaPp !== null);
  if (judged.length) {
    const far = judged.reduce((a, b) => (Math.abs(b.deltaPp) > Math.abs(a.deltaPp) ? b : a));
    headline += ` Furthest from theory: ${far.label} (${pp(far.deltaPp)}).`;
  }
  return headline;
}

/**
 * Each mode's share of the game's gap between realised and theoretical hold.
 * contribution = (t_m / T) x (realised_m - theoretical_m), in points, so the
 * contributions of fully measured modes add up to the game's own gap.
 */
export function modeHold(modeRows = []) {
  const live = played(modeRows);
  if (!live.length) return { rows: [], headline: null };
  const total = sumOf(live.map((r) => Number(r.turnover)));
  const rows = live.map((r) => {
    const t = Number(r.turnover);
    const realised = measured(r.profit) ? Number(r.profit) / t : null;
    const theoretical = measured(r.rtp) ? 1 - Number(r.rtp) : null;
    const gap = realised !== null && theoretical !== null ? realised - theoretical : null;
    return { mode: r.mode, realised, theoretical, deltaPp: gap === null ? null : gap * 100,
      contributionPp: gap === null ? null : (t / total) * gap * 100 };
  });
  const judged = rows.filter((r) => r.contributionPp !== null);
  if (!judged.length) return { rows, headline: null };
  const big = judged.reduce((a, b) => (Math.abs(b.contributionPp) > Math.abs(a.contributionPp) ? b : a));
  const gap = sumOf(judged.map((r) => r.contributionPp));
  return { rows, headline: `${big.mode} accounts for ${pp(big.contributionPp)} of the ${pp(gap)} gap between realised and theoretical hold.` };
}

/**
 * How a game's play splits between base play and feature buys.
 *
 * The average base bet divides turnover by (rounds x cost multiplier) over the
 * non-buy modes, so a 3x ANTE round at $0.50 counts as a $0.50 base bet rather
 * than $1.50 - it is the bet size a player chose, not the price per round.
 */
export function buyEconomics(modeRows = [], money = DEFAULT_MONEY) {
  const list = (Array.isArray(modeRows) ? modeRows : []).filter((r) => measured(r.count));
  if (!list.length) {
    return { rounds: null, buyRounds: null, conversion: null, buyTurnoverShare: null, avgBuyUsd: null, avgBaseBetUsd: null, tiers: [], headline: null };
  }
  const buys = list.filter(isFeatureBuy), base = list.filter((r) => !isFeatureBuy(r));
  const rounds = sumOf(list.map((r) => Number(r.count)));
  const buyRounds = sumOf(buys.map((r) => Number(r.count)));
  const turn = (rows) => sumOf(rows.filter((r) => measured(r.turnover)).map((r) => Number(r.turnover)));
  const turnover = turn(list), buyTurnover = turn(buys);
  const baseUnits = sumOf(base.filter((r) => measured(r.turnover) && measured(r.cost)).map((r) => Number(r.count) * Number(r.cost)));
  const baseTurnover = turn(base.filter((r) => measured(r.cost)));
  const conversion = rounds > 0 ? buyRounds / rounds : null;
  const buyTurnoverShare = turnover > 0 ? buyTurnover / turnover : null;
  const avgBuyUsd = buyRounds > 0 ? toUsd(buyTurnover, money) / buyRounds : null;
  const avgBaseBetUsd = baseUnits > 0 ? toUsd(baseTurnover, money) / baseUnits : null;
  const tiers = list.filter((r) => Number(r.count) > 0 && measured(r.turnover))
    .map((r) => ({ mode: r.mode, cost: num(r.cost), priceUsd: toUsd(r.turnover, money) / Number(r.count) }));
  let headline = null;
  if (rounds > 0) {
    headline = buyRounds > 0
      ? `Feature buys are ${pct(conversion)} of rounds and ${buyTurnoverShare === null ? '-' : pct(buyTurnoverShare)} of turnover; the average buy costs ${formatUsd(avgBuyUsd)} against an average base bet of ${formatUsd(avgBaseBetUsd)}.`
      : `No feature buys: all ${rounds.toLocaleString('en-US')} rounds were base play, at an average base bet of ${formatUsd(avgBaseBetUsd)}.`;
  }
  return { rounds, buyRounds, conversion, buyTurnoverShare, avgBuyUsd, avgBaseBetUsd, tiers, headline };
}

/**
 * What one player is worth to a game this month. `unique` is the API's
 * month-to-date distinct players for that game, so a player on two games
 * counts on both - per-game figures, never summed across the studio.
 */
export function playerWorth(row = {}, money = DEFAULT_MONEY) {
  const count = num(row?.count), unique = num(row?.unique);
  const turnoverUsd = toUsd(row?.turnover, money);
  const studioUsd = toShareUsd(row?.profit, money.profitShare, money);
  const perPlayer = (v) => (v !== null && unique !== null && unique > 0 ? v / unique : null);
  const out = {
    turnoverPerPlayer: perPlayer(turnoverUsd),
    roundsPerPlayer: perPlayer(count),
    studioPerPlayer: perPlayer(studioUsd),
    studioPer1kRounds: studioUsd !== null && count !== null && count > 0 ? studioUsd / count * 1000 : null,
    avgBet: turnoverUsd !== null && count !== null && count > 0 ? turnoverUsd / count : null,
  };
  out.headline = out.turnoverPerPlayer === null || out.roundsPerPlayer === null ? null
    : `The average player staked ${formatUsd(out.turnoverPerPlayer)} over ${Math.round(out.roundsPerPlayer).toLocaleString('en-US')} rounds this month; the studio made ${out.studioPerPlayer === null ? '-' : formatUsdSigned(out.studioPerPlayer)} per player.`;
  return out;
}

/**
 * The intervals of a cumulative trail that can be trusted: consecutive
 * accepted samples inside one UTC month, with any reading that runs BELOW the
 * high-water mark dropped (replica lag) rather than differenced.
 * Calls step(prev, next) for each; `fields` must be present on both.
 */
function eachInterval(trail, fields, step) {
  let prev = null;
  for (const s of Array.isArray(trail) ? trail : []) {
    if (!fields.every((f) => measured(s?.fields?.[f]))) continue;
    if (prev && monthOf(prev.ts) !== monthOf(s.ts)) { prev = s; continue; }
    if (prev && fields.some((f) => Number(s.fields[f]) < Number(prev.fields[f]))) continue;
    if (prev) step(prev, s);
    prev = s;
  }
}

/** How much turnover arrived while hardly anybody was online. Raw units. */
export function quietShare(trail = [], { maxOnline = 2 } = {}) {
  let turnover = 0, quietTurnover = 0, intervals = 0;
  eachInterval(trail, ['turnover'], (a, b) => {
    if (measured(a.fields.count) && measured(b.fields.count) && Number(b.fields.count) < Number(a.fields.count)) return;
    const dt = Number(b.fields.turnover) - Number(a.fields.turnover);
    intervals++;
    if (dt <= 0) return;
    turnover += dt;
    // A reading with no player count is not evidence of a quiet room.
    if (measured(b.fields.onlinePlayers) && Number(b.fields.onlinePlayers) <= maxOnline) quietTurnover += dt;
  });
  if (!intervals || turnover <= 0) return { share: null, quietTurnover: intervals ? quietTurnover : null, turnover: intervals ? turnover : null, headline: null };
  const share = quietTurnover / turnover;
  return { share, quietTurnover, turnover,
    headline: `${Math.round(share * 100)}% of turnover arrived while ${maxOnline} or fewer players were online.` };
}

/**
 * Average time on a game, by Little's law: players online on average,
 * divided by the rate new players arrive. Arrivals are the rise in the API's
 * month-to-date distinct players (a running max - it jitters down between
 * polls), so returning players this month are not arrivals and the figure
 * leans long. Only the current month's stretch of the trail is used.
 */
export function stayEstimate(trail = []) {
  const list = (Array.isArray(trail) ? trail : []).filter((s) => measured(s?.fields?.unique));
  if (list.length < 2) return { minutes: null, headline: null };
  const month = monthOf(list.at(-1).ts);
  const seg = list.filter((s) => monthOf(s.ts) === month);
  if (seg.length < 2) return { minutes: null, headline: null };
  const span = (Number(seg.at(-1).ts) - Number(seg[0].ts)) / 60_000;
  if (span < 30) return { minutes: null, headline: null };
  let high = Number(seg[0].fields.unique);
  for (const s of seg) high = Math.max(high, Number(s.fields.unique));
  const rate = (high - Number(seg[0].fields.unique)) / span;
  const online = seg.filter((s) => measured(s.fields.onlinePlayers)).map((s) => Number(s.fields.onlinePlayers));
  if (rate <= 0 || !online.length) return { minutes: null, headline: null };
  const minutes = sumOf(online) / online.length / rate;
  return { minutes, headline: `A player stays about ${Math.round(minutes)} minutes (Little's law: ${(sumOf(online) / online.length).toFixed(1)} online on average, a new player every ${(1 / rate).toFixed(1)} minutes).` };
}

const median = (xs) => {
  const s = [...xs].sort((a, b) => a - b);
  return s.length % 2 ? s[(s.length - 1) / 2] : (s[s.length / 2 - 1] + s[s.length / 2]) / 2;
};

/**
 * Days a game ran at three times its usual level, from the daily snapshot.
 * "Usual" is the median of that game's prior 14 ACTIVE days (at least 5);
 * a game's first three active days are its launch and never compared, today
 * is still filling, and small days are below the floors ($400 turnover for a
 * stakes surge, 900 rounds for a players surge).
 */
export function unusualDays(snapshot = {}, { now = Date.now(), money = DEFAULT_MONEY } = {}) {
  const today = new Date(now).toISOString().slice(0, 10);
  const byGame = new Map();
  for (const date of Object.keys(snapshot?.days ?? {}).sort()) {
    for (const row of snapshot.days[date]?.rows ?? []) {
      if (!row?.slug || !measured(row?.stats?.count) || Number(row.stats.count) <= 0) continue;
      if (!byGame.has(row.slug)) byGame.set(row.slug, []);
      byGame.get(row.slug).push({ date, name: row.name ?? row.slug, turnover: toUsd(row.stats.turnover, money), count: Number(row.stats.count), unique: num(row.stats.unique) });
    }
  }
  const rows = [];
  let compared = false;
  for (const [slug, days] of byGame) {
    days.forEach((d, i) => {
      if (i < 3 || d.date >= today) return;
      const prior = days.slice(Math.max(0, i - 14), i);
      if (prior.length < 5) return;
      compared = true;
      const medT = median(prior.filter((p) => p.turnover !== null).map((p) => p.turnover));
      const uniques = prior.filter((p) => p.unique !== null).map((p) => p.unique);
      const medU = uniques.length ? median(uniques) : null;
      const stakes = d.turnover !== null && medT > 0 && d.turnover >= 3 * medT && d.turnover >= 400;
      const players = d.unique !== null && medU > 0 && d.unique >= 3 * medU && d.count >= 900;
      if (!stakes && !players) return;
      rows.push({ slug, name: d.name, date: d.date, kind: stakes && players ? 'both' : stakes ? 'stakes' : 'players',
        turnover: d.turnover, median: medT, ratio: stakes ? d.turnover / medT : d.unique / medU });
    });
  }
  rows.sort((a, b) => b.ratio - a.ratio);
  let headline = null;
  if (rows.length) {
    const top = rows[0];
    headline = `${rows.length} unusual ${rows.length === 1 ? 'day' : 'days'}; the biggest: ${top.name} on ${top.date} (${top.ratio.toFixed(1)}x its usual ${top.kind === 'players' ? 'players' : 'turnover'}).`;
  } else if (compared) {
    headline = 'No game had an unusual day: none ran at 3x its usual turnover or players.';
  }
  return { rows, headline };
}

/**
 * Bets by base-bet size, from the per-game `betStats`. LIFETIME, and bucketed
 * by the BASE bet - a 250x buy at $2 counts as a $2 bet - so it describes the
 * sizes players pick, not turnover by price. The ladder is "stuck" when 90%
 * or more of paid bets sit at the cheapest paid size (judged from 500 bets).
 */
export function betLadder(betStats = []) {
  const list = (Array.isArray(betStats) ? betStats : [])
    .filter((b) => measured(b?.costUSD) && measured(b?.betCount))
    .map((b) => ({ costUSD: Number(b.costUSD), betCount: Number(b.betCount), betTurnover: num(b.betTurnover) }))
    .sort((a, b) => a.costUSD - b.costUSD);
  if (!list.length) return { rows: [], stuck: null, headline: null };
  const bets = sumOf(list.map((b) => b.betCount));
  const turnover = sumOf(list.filter((b) => b.betTurnover !== null).map((b) => b.betTurnover));
  const rows = list.map((b) => ({ ...b, betShare: bets > 0 ? b.betCount / bets : null,
    turnoverShare: turnover > 0 && b.betTurnover !== null ? b.betTurnover / turnover : null }));
  const paid = rows.filter((b) => b.costUSD > 0);
  const paidBets = sumOf(paid.map((b) => b.betCount));
  const stuck = paidBets >= 500 ? paid[0].betCount / paidBets >= 0.9 : null;
  const common = rows.reduce((a, b) => (b.betCount > a.betCount ? b : a));
  const top = [...rows].filter((b) => b.turnoverShare !== null).sort((a, b) => b.turnoverShare - a.turnoverShare)[0];
  let headline = `Lifetime, by base bet size: the most common size is ${formatUsd(common.costUSD)} (${pct(common.betShare ?? 0)} of bets)`;
  headline += top ? `, and ${formatUsd(top.costUSD)} bets carry the most turnover (${pct(top.turnoverShare)}).` : '.';
  if (stuck) headline += ' The ladder looks stuck: 90% or more of paid bets sit at the cheapest size.';
  return { rows, stuck, headline };
}

/**
 * Quiet share across the studio: each game's share of turnover taken with
 * two or fewer players online, and the studio figure from SUMMED turnover
 * (not an average of shares, which would weight a $5 game like a $5,000 one).
 * A game with no measurable turnover is left out rather than shown as 0%.
 */
export function quietByGame(gameTrails = {}, labels = {}, { maxOnline = 2 } = {}) {
  let quietSum = 0, allSum = 0;
  const bars = [];
  for (const [slug, trail] of Object.entries(gameTrails)) {
    const q = quietShare(trail, { maxOnline });
    if (q.share === null || q.share === undefined || !(q.turnover > 0)) continue;
    quietSum += q.quietTurnover; allSum += q.turnover;
    bars.push({ key: slug, label: labels[slug] ?? slug, value: q.share * 100 });
  }
  bars.sort((a, b) => b.value - a.value);
  if (!bars.length || allSum <= 0) return { bars, headline: null };
  return { bars, headline: `${Math.round(quietSum / allSum * 100)}% of studio turnover arrived with ${maxOnline} or fewer players online in the game. ${bars[0].label} is the quietest (${Math.round(bars[0].value)}%).` };
}
