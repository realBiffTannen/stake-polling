/**
 * The standing metric: average returning players across all games, against the
 * number of games released.
 *
 * Every function here keeps the project's null discipline. A day the collector
 * missed is not a day with no returning players, and a rolling mean that
 * counts it as zero would make an outage look like churn.
 */

const valid = (v) => typeof v === 'number' && Number.isFinite(v);

export function rollingMean(rows = [], key, window) {
  return rows.map((_, i) => {
    const slice = rows.slice(Math.max(0, i - window + 1), i + 1).map(r => r?.[key]).filter(valid);
    return slice.length ? slice.reduce((a, b) => a + b, 0) / slice.length : null;
  });
}

/**
 * Aggregates daily player metrics against released game counts.
 * The daily rows define the output span; a released-only date is not emitted.
 */
export function returningTrend({ daily = [], released = [] }) {
  const byDate = new Map(released.map(r => [r.date, r]));
  const rolling7 = rollingMean(daily, 'returningPlayers', 7);
  const rolling28 = rollingMean(daily, 'returningPlayers', 28);
  const newRolling7 = rollingMean(daily, 'newPlayers', 7);
  return daily.map((row, i) => {
    const rel = byDate.get(row.date);
    const count = valid(rel?.released) && rel.released > 0 ? rel.released : null;
    return {
      date: row.date,
      released: rel?.released ?? null,
      reconstructed: rel?.reconstructed ?? null,
      newPlayers: row.newPlayers ?? null,
      returningPlayers: row.returningPlayers ?? null,
      avgReturning: valid(row.returningPlayers) && count ? row.returningPlayers / count : null,
      rolling7: rolling7[i],
      rolling28: rolling28[i],
      newRolling7: newRolling7[i],
    };
  });
}

export function pearson(xs = [], ys = []) {
  const pairs = xs.map((x, i) => [x, ys[i]]).filter(([x, y]) => valid(x) && valid(y));
  const n = pairs.length;
  if (n < 3) return null;
  const mx = pairs.reduce((a, [x]) => a + x, 0) / n;
  const my = pairs.reduce((a, [, y]) => a + y, 0) / n;
  let sxy = 0, sxx = 0, syy = 0;
  for (const [x, y] of pairs) { sxy += (x - mx) * (y - my); sxx += (x - mx) ** 2; syy += (y - my) ** 2; }
  if (sxx === 0 || syy === 0) return null;
  const r = sxy / Math.sqrt(sxx * syy);
  return { r: Math.max(-1, Math.min(1, r)), n };
}
