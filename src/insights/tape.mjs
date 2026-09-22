/**
 * The tape: the individual moments inside the 2.5-minute trail worth a look -
 * a big stake, a payout spike, a house take, a single buy recovered exactly -
 * and the four launch checks that ask whether a new game is being played the
 * way it was built to be played.
 *
 * Thresholds are carried over from an earlier in-house poller, in USD of
 * GROSS money. Three of its hard-won rules shape
 * every difference taken here:
 *
 *   - Read replicas lag. A counter can read 289 -> 286 -> 289 inside three
 *     minutes. A reading below the running high-water mark is skipped, and
 *     the next interval is measured from the high-water mark - never read as
 *     a reset, which would book the whole counter as one interval.
 *   - Everything resets at 00:00Z on the 1st. No interval spans two months.
 *   - Rounds are published in batches (+457, 0, 0, +704), so a RATE is only
 *     ever read over windows of at least five minutes.
 *
 * Null discipline as everywhere: a sample missing a field drops out, and the
 * next interval spans the gap; it is never a zero reading.
 */

import { parseModeField } from '../modes.mjs';
import { monthKey } from './periods.mjs';
import { DEFAULT_MONEY, formatUsd } from '../money.mjs';
import { BUY_COST } from './conclusions.mjs';

const HOUR_MS = 3_600_000;
const WINDOW_MS = 5 * 60_000;
const STALE_MS = 15 * 60_000;

// USD, gross - the earlier poller's constants.
export const BIG_STAKE_USD = 500;
export const BIG_STAKE_PER_SPIN_USD = 10;
export const SPIKE_WIN_USD = 250;
export const SPIKE_MULTIPLE = 5;
export const TAKE_KEPT_USD = 250;

const measured = (v) => v !== null && v !== undefined && v !== '' && Number.isFinite(Number(v));
const hhmm = (ts) => `${new Date(ts).toISOString().slice(11, 16)}Z`;
const ints = (v) => Math.round(v).toLocaleString('en-US');
const median = (xs) => {
  const s = [...xs].sort((a, b) => a - b);
  return s.length ? (s.length % 2 ? s[(s.length - 1) / 2] : (s[s.length / 2 - 1] + s[s.length / 2]) / 2) : null;
};

/**
 * Consecutive differences of one cumulative (count, turnover, profit) triple.
 * Count and turnover only ever rise within a month, so either one falling
 * marks a lagging replica; profit may fall freely (the house losing).
 *
 * @param {{ ts: number, fields: object }[]} samples oldest-first
 * @param {string} prefix '' for a game trail, 'MODE:' for one mode of a mode trail
 * @returns {{ from: number, to: number, dCount: number, dTurnover: number, dProfit: number }[]}
 */
export function intervals(samples, prefix = '') {
  const out = [];
  let base = null;
  for (const s of Array.isArray(samples) ? samples : []) {
    const f = s?.fields ?? {};
    const c = f[`${prefix}count`], t = f[`${prefix}turnover`], p = f[`${prefix}profit`];
    if (!measured(c) || !measured(t) || !measured(p) || !measured(s?.ts)) continue;
    const reading = { ts: Number(s.ts), count: Number(c), turnover: Number(t), profit: Number(p) };
    if (!base || monthKey(reading.ts) !== monthKey(base.ts)) { base = reading; continue; }
    if (reading.count < base.count || reading.turnover < base.turnover) continue;
    out.push({ from: base.ts, to: reading.ts, dCount: reading.count - base.count,
      dTurnover: reading.turnover - base.turnover, dProfit: reading.profit - base.profit });
    base = reading;
  }
  return out;
}

function modesIn(trail) {
  const names = new Set();
  for (const s of Array.isArray(trail) ? trail : []) {
    for (const key of Object.keys(s?.fields ?? {})) {
      const parsed = parseModeField(key);
      if (parsed) names.add(parsed.mode);
    }
  }
  return [...names];
}

function event({ iv, slug, label, mode, kind, multiple = null, message, money }) {
  const usd = (raw) => raw / (money.unitsPerDollar || 1);
  const turnoverUsd = usd(iv.dTurnover), profitUsd = usd(iv.dProfit);
  return { ts: iv.to, slug, label, mode, kind, dCount: iv.dCount, turnoverUsd, profitUsd,
    paidUsd: turnoverUsd - profitUsd, perSpinUsd: iv.dCount > 0 ? turnoverUsd / iv.dCount : null, multiple, message };
}

/**
 * Notable intervals across every game over the trailing `hours`, newest first.
 *
 *   big_stake     a game took >= $500 in one interval at >= $10 a spin
 *   payout_spike  a mode's players came out >= $250 up, on a payout of at
 *                 least 5x the interval's average stake
 *   house_take    a mode kept >= $250 in one interval
 *   exact_stake   a mode took exactly one bet: its stake is the turnover
 *                 moved, to the cent, and `multiple` is what it paid back
 */
export function tape({ gameTrails = {}, modeTrails = {}, labels = {}, now, hours = 24, money = DEFAULT_MONEY } = {}) {
  const since = Number(now) - hours * HOUR_MS;
  const inWindow = (iv) => iv.to > since && iv.to <= Number(now);
  const out = [];

  for (const [slug, trail] of Object.entries(gameTrails ?? {})) {
    const label = labels?.[slug] ?? slug;
    for (const iv of intervals(trail).filter(inWindow)) {
      const e = event({ iv, slug, label, mode: null, kind: 'big_stake', money, message: '' });
      if (e.turnoverUsd >= BIG_STAKE_USD && e.perSpinUsd !== null && e.perSpinUsd >= BIG_STAKE_PER_SPIN_USD) {
        e.message = `${label} took ${formatUsd(e.turnoverUsd)} in one window: ${ints(e.dCount)} bets at ${formatUsd(e.perSpinUsd)} a spin.`;
        out.push(e);
      }
    }
  }

  for (const [slug, trail] of Object.entries(modeTrails ?? {})) {
    const label = labels?.[slug] ?? slug;
    for (const mode of modesIn(trail)) {
      for (const iv of intervals(trail, `${mode}:`).filter(inWindow)) {
        const base = event({ iv, slug, label, mode, kind: '', money, message: '' });
        const who = `${label} ${mode}`;
        if (base.dCount > 0 && -base.profitUsd >= SPIKE_WIN_USD && base.paidUsd >= SPIKE_MULTIPLE * base.perSpinUsd) {
          const multiple = base.paidUsd / base.perSpinUsd;
          out.push({ ...base, kind: 'payout_spike', multiple,
            message: `${who} paid out ${formatUsd(base.paidUsd)} on ${formatUsd(base.turnoverUsd)} staked (${multiple.toFixed(1)}x the average stake) - players up ${formatUsd(-base.profitUsd)}.` });
        }
        if (base.profitUsd >= TAKE_KEPT_USD) {
          out.push({ ...base, kind: 'house_take',
            message: `${who} kept ${formatUsd(base.profitUsd)} of ${formatUsd(base.turnoverUsd)} staked in one window.` });
        }
        if (base.dCount === 1) {
          const multiple = base.turnoverUsd > 0 ? base.paidUsd / base.turnoverUsd : null;
          out.push({ ...base, kind: 'exact_stake', multiple,
            message: `${who}: one buy of exactly ${formatUsd(base.turnoverUsd)} paid ${formatUsd(base.paidUsd)}${multiple === null ? '' : ` (${multiple.toFixed(1)}x)`}.` });
        }
      }
    }
  }

  return out.sort((a, b) => b.ts - a.ts || String(a.slug).localeCompare(String(b.slug)));
}

const KIND_WORDS = [['big_stake', 'big stake'], ['payout_spike', 'payout spike'], ['house_take', 'house take'], ['exact_stake', 'exact buy stake']];

/**
 * One sentence over the tape. An empty tape over a measured window is a
 * finding ("nothing crossed"); over nothing measured it is null.
 */
export function tapeHeadline(events = [], { hours = 24, measured: wasMeasured = true } = {}) {
  if (!events.length) return wasMeasured ? `Nothing crossed the tape thresholds in the last ${hours}h.` : null;
  const counts = KIND_WORDS.map(([kind, word]) => [events.filter((e) => e.kind === kind).length, word])
    .filter(([n]) => n > 0).map(([n, word]) => `${n} ${word}${n === 1 ? '' : 's'}`);
  let headline = `${counts.join(', ')} in the last ${hours}h.`;
  const payouts = events.filter((e) => e.kind === 'payout_spike' || e.kind === 'exact_stake');
  if (payouts.length) {
    const top = payouts.reduce((a, b) => (b.paidUsd > a.paidUsd ? b : a));
    headline += ` Biggest payout: ${top.label}${top.mode ? ` ${top.mode}` : ''} paid ${formatUsd(top.paidUsd)} at ${hhmm(top.ts)}.`;
  }
  return headline;
}

// ------------------------------------------------------------ launch checks

function ladderStuck(betStats) {
  const sizes = (Array.isArray(betStats) ? betStats : []).filter((b) => measured(b?.costUSD) && Number(b.costUSD) > 0 && measured(b?.betCount));
  const total = sizes.reduce((a, b) => a + Number(b.betCount), 0);
  if (!sizes.length) return { status: 'unknown', message: 'No bet-size breakdown for this game.' };
  if (total < 500) return { status: 'unknown', message: `Only ${ints(total)} sized bets so far - the ladder is read from 500.` };
  const cheapest = Math.min(...sizes.map((b) => Number(b.costUSD)));
  const atCheapest = sizes.filter((b) => Number(b.costUSD) === cheapest).reduce((a, b) => a + Number(b.betCount), 0);
  const share = atCheapest / total;
  return share >= 0.9
    ? { status: 'flag', message: `${Math.round(share * 100)}% of ${ints(total)} bets sit at the cheapest size (${formatUsd(cheapest)}) - the bet ladder may be stuck.` }
    : { status: 'ok', message: `${Math.round(share * 100)}% of bets at the cheapest size (${formatUsd(cheapest)}); players are moving up the ladder.` };
}

function noBuys(modeRows) {
  const list = (Array.isArray(modeRows) ? modeRows : []).filter((r) => measured(r?.cost));
  if (!list.length) return { status: 'unknown', message: 'No per-mode figures for this game.' };
  const base = list.filter((r) => Number(r.cost) <= BUY_COST), buys = list.filter((r) => Number(r.cost) > BUY_COST);
  if (!buys.length) return { status: 'ok', message: 'This game has no feature-buy modes; nothing to check.' };
  if (base.some((r) => !measured(r.count)) || buys.some((r) => !measured(r.count))) {
    return { status: 'unknown', message: 'A mode has no bet count, so "no buys" cannot be told from "not measured".' };
  }
  const baseRounds = base.reduce((a, r) => a + Number(r.count), 0), buyRounds = buys.reduce((a, r) => a + Number(r.count), 0);
  if (buyRounds > 0) return { status: 'ok', message: `${ints(buyRounds)} feature buys against ${ints(baseRounds)} base rounds.` };
  if (baseRounds < 800) return { status: 'unknown', message: `No buys yet, but only ${ints(baseRounds)} base rounds - read from 800.` };
  return { status: 'flag', message: `${ints(baseRounds)} base rounds and not one feature buy.` };
}

function avgStakeLow(modeRows, studioAvgBetUsd, studioTurnoverUsd, money) {
  const list = (Array.isArray(modeRows) ? modeRows : []).filter((r) => measured(r?.count) && measured(r?.turnover));
  const rounds = list.reduce((a, r) => a + Number(r.count), 0);
  if (rounds < 300) return { status: 'unknown', message: `Only ${ints(rounds)} rounds - the average stake is read from 300.` };
  if (!measured(studioAvgBetUsd) || Number(studioAvgBetUsd) <= 0) return { status: 'unknown', message: 'No studio average stake to compare against.' };
  if (measured(studioTurnoverUsd) && Number(studioTurnoverUsd) < 200) return { status: 'unknown', message: 'The studio baseline is under $200 of turnover - too thin to compare against.' };
  const avg = list.reduce((a, r) => a + Number(r.turnover), 0) / (money.unitsPerDollar || 1) / rounds;
  return avg < 0.5 * Number(studioAvgBetUsd)
    ? { status: 'flag', message: `Average stake ${formatUsd(avg)} is under half the studio's ${formatUsd(Number(studioAvgBetUsd))}.` }
    : { status: 'ok', message: `Average stake ${formatUsd(avg)} against the studio's ${formatUsd(Number(studioAvgBetUsd))}.` };
}

/**
 * Bet-rate windows of at least five minutes, built backwards from the newest
 * interval so the latest window ends on the latest reading.
 */
function rateWindows(gameTrail) {
  const ivs = intervals(gameTrail);
  const online = new Map((Array.isArray(gameTrail) ? gameTrail : [])
    .filter((s) => measured(s?.fields?.onlinePlayers)).map((s) => [Number(s.ts), Number(s.fields.onlinePlayers)]));
  const windows = [];
  let count = 0, span = 0, end = null;
  for (let i = ivs.length - 1; i >= 0; i--) {
    if (end === null) end = ivs[i].to;
    count += ivs[i].dCount; span += ivs[i].to - ivs[i].from;
    if (span >= WINDOW_MS) {
      windows.unshift({ to: end, rate: count / (span / 60_000), online: online.has(end) ? online.get(end) : null });
      count = 0; span = 0; end = null;
    }
  }
  return windows;
}

function trafficCliff(gameTrail, now) {
  const windows = rateWindows(gameTrail);
  if (!windows.length) return { status: 'unknown', message: 'No trail for this game.' };
  const latest = windows.at(-1), prior = windows.slice(0, -1);
  if (measured(now) && Number(now) - latest.to > STALE_MS) return { status: 'unknown', message: `The trail ends at ${hhmm(latest.to)} - too stale to judge traffic now.` };
  if (prior.length < 4) return { status: 'unknown', message: `Only ${prior.length + 1} five-minute windows so far - read from 5.` };
  const typical = median(prior.map((w) => w.rate));
  if (typical < 20) return { status: 'unknown', message: `Traffic is ${typical.toFixed(1)} bets a minute - too thin to call a cliff (needs 20).` };
  if (latest.rate >= 0.3 * typical) return { status: 'ok', message: `${latest.rate.toFixed(0)} bets a minute against a typical ${typical.toFixed(0)}.` };
  const onlines = prior.map((w) => w.online).filter((v) => v !== null);
  if (latest.online === null || !onlines.length) {
    return { status: 'unknown', message: `Bets fell to ${latest.rate.toFixed(0)} a minute from ${typical.toFixed(0)}, but no online count to confirm it.` };
  }
  const usual = median(onlines);
  return latest.online <= 0.5 * usual
    ? { status: 'flag', message: `Bets fell to ${latest.rate.toFixed(0)} a minute from a typical ${typical.toFixed(0)}, and players online to ${ints(latest.online)} from ${ints(usual)}.` }
    : { status: 'ok', message: `Bets dipped to ${latest.rate.toFixed(0)} a minute, but ${ints(latest.online)} players are still online - rounds arrive in batches.` };
}

/**
 * The four launch checks, always all four, each 'flag' | 'ok' | 'unknown'.
 * `unknown` means the data cannot answer yet - never read it as 'ok'.
 *
 * @param {{ modeRows?: object[], betStats?: object[], gameTrail?: object[], studioAvgBetUsd?: number|null,
 *   studioTurnoverUsd?: number|null, now?: number, money?: object }} input
 *   `studioTurnoverUsd` is optional: when given, a baseline under $200 is too
 *   thin to compare against; when absent that floor is not checked.
 */
export function launchChecks({ modeRows, betStats, gameTrail, studioAvgBetUsd = null, studioTurnoverUsd = null, now, money = DEFAULT_MONEY } = {}) {
  return [
    { check: 'ladder_stuck', ...ladderStuck(betStats) },
    { check: 'no_buys', ...noBuys(modeRows) },
    { check: 'avg_stake_low', ...avgStakeLow(modeRows, studioAvgBetUsd, studioTurnoverUsd, money) },
    { check: 'traffic_cliff', ...trafficCliff(gameTrail, now) },
  ];
}

/**
 * The tape as a page shows it. Big stakes, payout spikes and house takes all
 * stay; an exact stake stays only in a feature-buy mode, where recovering the
 * precise price of one buy is the point - an exact base spin of $0.08 is not
 * news, and there are hundreds a day. `costOf(slug, mode)` gives a mode's cost
 * multiplier, null when unknown (an unknown mode is not assumed to be a buy).
 */
export function notable(events = [], costOf = () => null) {
  return events.filter((e) => {
    if (e.kind !== 'exact_stake') return true;
    const cost = costOf(e.slug, e.mode);
    return cost !== null && cost !== undefined && Number(cost) > BUY_COST;
  });
}

const CHECK_WORDS = { ladder_stuck: 'ladder stuck', no_buys: 'no buys', avg_stake_low: 'average stake low', traffic_cliff: 'traffic cliff' };

/** One sentence over the launch checks. */
export function checksHeadline(checks = []) {
  if (!checks.length) return null;
  const flagged = checks.filter((c) => c.status === 'flag');
  const unknown = checks.filter((c) => c.status === 'unknown').length;
  const tail = unknown ? `; ${unknown} cannot be judged yet` : '';
  if (!flagged.length) return `No launch check flags${tail}.`;
  return `${flagged.length} of ${checks.length} launch checks flag: ${flagged.map((c) => CHECK_WORDS[c.check] ?? c.check).join(', ')}${tail}.`;
}
