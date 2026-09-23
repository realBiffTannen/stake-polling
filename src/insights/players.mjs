/**
 * Players over a span, and how their numbers move with the money.
 *
 * What the data can and cannot say. The API never identifies a player: per
 * game it reports how many are online at each poll, and how many distinct
 * players it has seen this month. So nothing here follows a person. It
 * relates how many players were on to what was staked while they were, which
 * is the most that counts can honestly support:
 *
 *   online      a head count at each poll - concurrency, not distinct players
 *   new         the rise in the month's distinct-player count across the span:
 *               players whose first play this month fell inside it (a floor
 *               on the span's distinct players, never the whole of it)
 *
 * Intervals are the trail's own poll-to-poll steps (tape.mjs `intervals`),
 * with a step longer than `maxGapMs` dropped: it spans an outage, and pinning
 * its whole volume on one head count would invent a relationship.
 */

import { intervals } from './tape.mjs';
import { pearson } from './trends.mjs';
import { toUsd } from '../money.mjs';

const MAX_GAP_MS = 20 * 60_000;
const measured = (v) => v !== null && v !== undefined && v !== '' && Number.isFinite(Number(v));
const sum = (xs) => xs.reduce((a, b) => a + b, 0);

/** The last reading of `field` at or before each sample, keyed by timestamp. */
function readingsAt(trail, field) {
  const map = new Map();
  for (const s of Array.isArray(trail) ? trail : []) if (measured(s?.fields?.[field])) map.set(Number(s.ts), Number(s.fields[field]));
  return map;
}

/**
 * Per game over (from, now]: its players online (average and peak), players
 * new to the month, and the turnover and bets of the span.
 */
export function playersByGame(gameTrails = {}, { from, now, labels = {}, money, maxGapMs = MAX_GAP_MS }) {
  return Object.entries(gameTrails ?? {}).map(([slug, trail]) => {
    const inSpan = (Array.isArray(trail) ? trail : []).filter((s) => Number(s.ts) > from && Number(s.ts) <= now);
    const online = inSpan.map((s) => s?.fields?.onlinePlayers).filter(measured).map(Number);
    const steps = intervals(trail).filter((iv) => iv.to > from && iv.to <= now && iv.to - iv.from <= maxGapMs);
    const uniques = (Array.isArray(trail) ? trail : []).filter((s) => measured(s?.fields?.unique));
    const before = uniques.filter((s) => Number(s.ts) <= from).at(-1);
    const last = uniques.filter((s) => Number(s.ts) <= now).at(-1);
    // Only within one month: the count restarts on the 1st.
    const sameMonth = before && last && new Date(Number(before.ts)).getUTCMonth() === new Date(Number(last.ts)).getUTCMonth();
    return {
      slug, label: labels[slug] ?? slug,
      avgOnline: online.length ? sum(online) / online.length : null,
      peakOnline: online.length ? Math.max(...online) : null,
      newPlayers: sameMonth ? Math.max(0, Number(last.fields.unique) - Number(before.fields.unique)) : null,
      turnoverUsd: steps.length ? toUsd(sum(steps.map((s) => s.dTurnover)), money) : null,
      bets: steps.length ? sum(steps.map((s) => s.dCount)) : null,
    };
  });
}

/**
 * Studio-wide, one point per poll interval: players online at the end of it
 * against the turnover and bets staked during it, with Pearson's r and a
 * least-squares slope (turnover per extra player online, per interval).
 */
export function playerCorrelation(gameTrails = {}, { from, now, money, maxGapMs = MAX_GAP_MS }) {
  const byTs = new Map();
  for (const trail of Object.values(gameTrails ?? {})) {
    const online = readingsAt(trail, 'onlinePlayers');
    for (const iv of intervals(trail)) {
      if (!(iv.to > from && iv.to <= now) || iv.to - iv.from > maxGapMs || !online.has(iv.to)) continue;
      const at = byTs.get(iv.to) ?? { ts: iv.to, online: 0, turnover: 0, bets: 0, games: 0 };
      at.online += online.get(iv.to);
      at.turnover += iv.dTurnover;
      at.bets += iv.dCount;
      at.games++;
      byTs.set(iv.to, at);
    }
  }
  const points = [...byTs.values()].sort((a, b) => a.ts - b.ts)
    .map((p) => ({ ts: p.ts, online: p.online, turnoverUsd: toUsd(p.turnover, money), bets: p.bets }));
  const turnover = pearson(points.map((p) => p.online), points.map((p) => p.turnoverUsd));
  const bets = pearson(points.map((p) => p.online), points.map((p) => p.bets));
  return { points, turnover, bets, slope: slopeOf(points.map((p) => p.online), points.map((p) => p.turnoverUsd)) };
}

function slopeOf(xs, ys) {
  const n = xs.length;
  if (n < 3) return null;
  const mx = sum(xs) / n, my = sum(ys) / n;
  let sxy = 0, sxx = 0;
  xs.forEach((x, i) => { sxy += (x - mx) * (ys[i] - my); sxx += (x - mx) ** 2; });
  return sxx > 0 ? sxy / sxx : null;
}

/** "strong", "moderate", "weak" or "no real" - for |r|. */
export function strength(r) {
  const a = Math.abs(Number(r));
  return a >= 0.7 ? 'strong' : a >= 0.4 ? 'moderate' : a >= 0.2 ? 'weak' : 'no real';
}

/**
 * Each game's share of players online set against its share of turnover and
 * of bets. A contribution above 1 means its players stake more than their
 * numbers alone would suggest.
 */
export function contribution(rows = []) {
  const usable = rows.filter((r) => measured(r.avgOnline) && r.avgOnline > 0);
  const players = sum(usable.map((r) => r.avgOnline));
  const turnover = sum(usable.map((r) => (measured(r.turnoverUsd) ? r.turnoverUsd : 0)));
  const bets = sum(usable.map((r) => (measured(r.bets) ? r.bets : 0)));
  return usable.map((r) => {
    const playerShare = players > 0 ? r.avgOnline / players : null;
    const turnoverShare = turnover > 0 && measured(r.turnoverUsd) ? r.turnoverUsd / turnover : null;
    const betShare = bets > 0 && measured(r.bets) ? r.bets / bets : null;
    return { ...r, playerShare, turnoverShare, betShare,
      index: playerShare && turnoverShare !== null ? turnoverShare / playerShare : null };
  }).sort((a, b) => (b.turnoverUsd ?? -Infinity) - (a.turnoverUsd ?? -Infinity));
}

/** The headline for the player counts over a span. */
export function playersHeadline(rows = [], { words = 'in this span' } = {}) {
  const got = rows.filter((r) => measured(r.avgOnline));
  if (!got.length) return null;
  const avg = sum(got.map((r) => r.avgOnline));
  const busiest = [...got].sort((a, b) => b.avgOnline - a.avgOnline)[0];
  const fresh = rows.filter((r) => measured(r.newPlayers));
  const newCount = fresh.length ? sum(fresh.map((r) => r.newPlayers)) : null;
  return `About ${Math.round(avg).toLocaleString('en-US')} players online on average ${words}, most on ${busiest.label} (${Math.round(busiest.avgOnline).toLocaleString('en-US')}).`
    + (newCount === null ? '' : ` ${newCount.toLocaleString('en-US')} ${newCount === 1 ? 'player' : 'players'} played for the first time this month.`);
}

/** The headline for the correlation: how closely turnover and bets follow players online. */
export function correlationHeadline({ points = [], turnover, bets, slope }, { intervalWords = 'per poll' } = {}) {
  if (!turnover) return points.length ? `Too little variation in ${points.length} intervals to relate players to turnover.` : null;
  const t = `${strength(turnover.r)} ${turnover.r >= 0 ? 'positive' : 'negative'}`;
  const per = slope !== null && slope > 0 ? ` Each extra player online goes with about $${slope.toFixed(2)} more turnover ${intervalWords}.` : '';
  const b = bets ? ` Bets follow at r = ${bets.r.toFixed(2)}.` : '';
  return `${t[0].toUpperCase()}${t.slice(1)} link between players online and turnover: r = ${turnover.r.toFixed(2)} over ${turnover.n} intervals.${per}${b}`;
}

/** The headline for contribution: the game whose players stake furthest above their share. */
export function contributionHeadline(rows = []) {
  const ranked = rows.filter((r) => r.index !== null && r.turnoverShare !== null && r.turnoverShare > 0.01).sort((a, b) => b.index - a.index);
  if (!ranked.length) return null;
  const top = ranked[0];
  const pct = (v) => `${Math.round(v * 100)}%`;
  return `${top.label} carries ${pct(top.turnoverShare)} of turnover with ${pct(top.playerShare)} of the players online - ${top.index.toFixed(1)}x its share.`;
}
