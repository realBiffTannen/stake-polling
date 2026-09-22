import { median, mad, robustZ, deltas } from './baseline.mjs';
import { fromUsd, toUsd, formatUsd, DEFAULT_MONEY } from '../money.mjs';

// What each metric means statistically.
//
// `cumulative` metrics are month-to-date running totals - the signal lives in
// the per-minute difference. `gauge` metrics are instantaneous readings, where
// the value itself is the signal and a fall to near zero is a real collapse,
// not a counter rollover.
const GAME_METRICS = [
  // `money` marks a metric reported in raw micro-dollars: its floor is written
  // in config.json as plain dollars and scaled here, and its alert message is
  // rendered as money rather than as a bare eleven-digit integer.
  { name: 'turnover', mode: 'cumulative', label: 'turnover', money: true },
  { name: 'count', mode: 'cumulative', label: 'bets', money: false },
  { name: 'profit', mode: 'cumulative', label: 'profit', money: true },
  // Concurrent players on one game moves before turnover does, and it needs a
  // much lower floor than the team-wide figure - five players arriving on a
  // quiet game is a real event, five arriving across the roster is noise.
  { name: 'onlinePlayers', mode: 'gauge', label: 'online players', floorKey: 'gameOnlinePlayers' },
];

const TEAM_METRICS = [{ name: 'onlinePlayers', mode: 'gauge', label: 'online players' }];

/**
 * Run every rule over the current trails.
 *
 * @param {{ now: number, trails: { team: Sample[], online: Sample[], games: Record<string, Sample[]> }, config: object }} args
 * @returns {Alert[]}
 */
export function detect({ now, trails, config }) {
  const games = trails.games ?? {};
  const alerts = [];

  for (const [game, samples] of Object.entries(games)) {
    for (const metric of GAME_METRICS) {
      const hit = spikeRule({ now, game, samples, metric, config });
      if (hit) alerts.push(hit);
    }
    const flat = flatLineRule({ now, game, samples, config });
    if (flat) alerts.push(flat);
  }

  for (const metric of TEAM_METRICS) {
    const hit = spikeRule({ now, game: 'team', samples: trails.online ?? [], metric, config });
    if (hit) alerts.push(hit);
  }

  alerts.push(...shareShiftRule({ now, games, config }));
  return alerts;
}

/**
 * Point anomaly on one metric of one series.
 *
 * The baseline deliberately excludes the point under test, so a spike cannot
 * pull up the very median it is being compared against.
 */
export function spikeRule({ now, game, samples, metric, config }) {
  const series = readSeries(samples, metric.name);
  if (!series) return null;

  const observations = metric.mode === 'cumulative' ? deltas(series) : series;
  if (observations.length < config.warmupSamples + 1) return null;

  const x = observations.at(-1);
  const base = observations.slice(Math.max(0, observations.length - 1 - config.window), -1);
  if (base.length < config.warmupSamples) return null;

  const mid = median(base);
  const spread = mad(base);
  const money = config.money ?? DEFAULT_MONEY;
  const configuredFloor = config.floors[metric.floorKey ?? metric.name] ?? 0;
  const floor = metric.money ? fromUsd(configuredFloor, money) : configuredFloor;
  const deviation = Math.abs(x - mid);
  if (deviation < floor) return null;

  let z;
  let severity;
  if (spread === 0) {
    // A perfectly flat baseline gives no scale to divide by. Fall back to
    // multiples of the metric's floor, which is what the floor is there for.
    if (deviation < floor) return null;
    severity = deviation >= floor * 5 ? 'crit' : 'warn';
    z = severity === 'crit' ? config.zCrit : config.zWarn;
  } else {
    z = robustZ(x, base);
    if (Math.abs(z) < config.zWarn) return null;
    severity = Math.abs(z) >= config.zCrit ? 'crit' : 'warn';
  }

  const kind = x > mid ? 'spike' : 'drop';
  const unit = metric.mode === 'cumulative' ? (config.rateLabel ?? '/min') : '';
  const show = (v) => (metric.money ? formatUsd(toUsd(v, money)) : fmt(v));
  return {
    ts: now,
    severity,
    kind,
    game,
    metric: metric.name,
    // Values are stored raw so they stay comparable with the trail; the
    // message carries the human-readable form.
    value: round(x),
    baseline: round(mid),
    z: round(z, 2),
    message: `${game} ${metric.label} ${kind} ${show(x)}${unit} vs ${show(mid)} baseline (z=${round(z, 1)})`,
  };
}

/**
 * Traffic concentrating on one game.
 *
 * Works on each game's share of the roster's turnover, so a tide that lifts
 * every game leaves the shares - and this rule - unmoved. That is the whole
 * point: it answers "is this game taking the traffic", not "is it busy".
 */
export function shareShiftRule({ now, games, config }) {
  const names = Object.keys(games);
  if (names.length < 2) return [];

  const perGame = {};
  for (const name of names) {
    const series = readSeries(games[name], 'turnover');
    if (!series) return [];
    perGame[name] = deltas(series);
  }

  const length = Math.min(...names.map((n) => perGame[n].length));
  if (length < config.warmupSamples + 1) return [];

  // shares[i][game] - each game's slice of the roster in minute i.
  const shares = [];
  for (let i = length - 1 - config.window < 0 ? 0 : length - 1 - config.window; i < length; i++) {
    const row = {};
    let total = 0;
    for (const name of names) {
      const d = perGame[name].at(i - length);
      row[name] = Math.max(0, d);
      total += row[name];
    }
    for (const name of names) row[name] = total > 0 ? row[name] / total : 0;
    shares.push(row);
  }

  const current = shares.at(-1);
  const history = shares.slice(0, -1);
  if (history.length < config.warmupSamples) return [];

  const out = [];
  for (const name of names) {
    const baseShare = median(history.map((row) => row[name]));
    const movement = (current[name] - baseShare) * 100;
    if (Math.abs(movement) < config.shareShiftPoints) continue;
    if (current[name] < config.shareShiftMinShare && baseShare < config.shareShiftMinShare) continue;

    const direction = movement > 0 ? 'concentrating on' : 'draining from';
    out.push({
      ts: now,
      severity: Math.abs(movement) >= config.shareShiftPoints * 2 ? 'crit' : 'warn',
      kind: 'share_shift',
      game: name,
      metric: 'turnoverShare',
      value: round(current[name] * 100, 1),
      baseline: round(baseShare * 100, 1),
      z: round(movement, 1),
      message: `traffic ${direction} ${name}: ${round(current[name] * 100, 1)}% of roster turnover vs ${round(baseShare * 100, 1)}% baseline`,
    });
  }
  return out;
}

/**
 * A game that was busy and is now reporting nothing. Usually an outage rather
 * than a quiet patch, which is why it needs a non-zero baseline to fire.
 */
export function flatLineRule({ now, game, samples, config }) {
  const series = readSeries(samples, 'turnover');
  if (!series) return null;

  const observations = deltas(series);
  // The tail is counted in SAMPLES; the message reports the wall-clock minutes
  // those samples span, which are only the same number at a one-minute poll.
  const tailSamples = config.flatLineSamples ?? config.flatLineMinutes;
  if (observations.length < config.warmupSamples + tailSamples) return null;

  const tail = observations.slice(-tailSamples);
  if (!tail.every((d) => d === 0)) return null;

  const base = observations.slice(Math.max(0, observations.length - config.window), -tailSamples);
  if (median(base) <= 0) return null;

  const money = config.money ?? DEFAULT_MONEY;
  return {
    ts: now,
    severity: 'crit',
    kind: 'flat_line',
    game,
    metric: 'turnover',
    value: 0,
    baseline: round(median(base)),
    z: 0,
    message: `${game} has reported no turnover for ${config.flatLineMinutes} minutes (baseline ${formatUsd(toUsd(median(base), money))}${config.rateLabel ?? '/min'})`,
  };
}

/** Pull one numeric field out of a sample trail, or null when it is absent. */
function readSeries(samples, field) {
  if (!Array.isArray(samples) || samples.length < 2) return null;
  if (samples.at(-1)?.fields?.[field] === undefined) return null;
  return samples.map((s) => Number(s?.fields?.[field] ?? 0));
}

function round(n, dp = 0) {
  const f = 10 ** dp;
  return Math.round(Number(n) * f) / f;
}

function fmt(n) {
  return Math.round(Number(n)).toLocaleString('en-US');
}
