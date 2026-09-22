import { DEFAULT_MONEY, toUsd, toShareUsd } from '../money.mjs';
import { DAY_MS, dateKey, previousDate } from './sync.mjs';
import { monthKey, monthLabel, monthOfDate, monthToDate as mtd, datesInMonth } from './periods.mjs';

export const SORTS = ['name', 'players', 'newPlayers', 'returningPlayers', 'turnover', 'profit', 'count', 'avgBet', 'rtp'];
const valid = (v) => typeof v === 'number' && Number.isFinite(v);
const sum = (rows, key) => rows.length && rows.every(r => valid(r[key])) ? rows.reduce((n, r) => n + r[key], 0) : null;
const countOf = (rows, slug) => rows?.find(r => r.slug === slug)?.stats?.unique ?? (rows ? 0 : null);
const validDate = (s) => /^\d{4}-\d{2}-\d{2}$/.test(s ?? '') && Number.isFinite(Date.parse(s)) && dateKey(Date.parse(s)) === s;

export function aggregate(rows) {
  const out = {};
  for (const key of ['players', 'newPlayers', 'returningPlayers', 'turnover', 'profit', 'expected', 'count', 'grossProfit']) out[key] = sum(rows, key);
  out.avgBet = out.count > 0 && valid(out.turnover) ? out.turnover / out.count : null;
  out.rtp = out.turnover > 0 && valid(out.grossProfit) ? Math.round((1 - out.grossProfit / out.turnover) * 10000) / 100 : null;
  return out;
}

export function buildInsights({ snapshot = {}, now = Date.now(), query = new URLSearchParams(), money = DEFAULT_MONEY, listings = [] } = {}) {
  const today = dateKey(now);
  // No explicit range means month-to-date, the window Stake's own dashboard
  // opens on; `days` only applies when a quick range asks for it.
  const days = [7, 14, 30].includes(Number(query.get('days'))) ? Number(query.get('days')) : null;
  let to = validDate(query.get('to')) ? query.get('to') : today;
  if (to > today) to = today;
  let from = validDate(query.get('from')) ? query.get('from') : days ? dateKey(Date.parse(to) - (days - 1) * DAY_MS) : `${to.slice(0, 7)}-01`;
  if (from > to) [from, to] = [to, from];
  if (to > today) to = today;
  if (Date.parse(to) - Date.parse(from) > 29 * DAY_MS) from = dateKey(Date.parse(to) - 29 * DAY_MS);
  const inventory = new Map(listings.map(r => [r.slug, r.name ?? r.slug]));
  for (const day of Object.values(snapshot.days ?? {})) for (const row of day.rows ?? []) inventory.set(row.slug, row.name);
  const options = [...inventory].map(([slug, name]) => ({ slug, name })).sort((a, b) => a.name.localeCompare(b.name));
  const game = query.get('game') ?? '';
  const selected = options.filter(r => !game || r.slug === game);
  // Per-game rows for one UTC calendar date, against the currently selected
  // roster. Pulled out of the daily loop below so month-to-date (which walks
  // dates outside the selected from/to window) can reuse the exact same
  // per-day computation without also feeding those extra days into `perGame`,
  // which must stay scoped to the selected window.
  const dayRows = (date) => {
    const record = snapshot.days?.[date];
    const before = snapshot.cumulative?.[previousDate(date)], after = snapshot.cumulative?.[date];
    const rows = selected.map(({ slug, name }) => {
      const raw = record?.rows.find(r => r.slug === slug)?.stats;
      // A successfully fetched roster omits a game with no activity.
      const stats = raw ?? (record ? { unique: 0, turnover: 0, profit: 0, expectedProfit: 0, count: 0 } : {});
      const delta = before && after ? countOf(after, slug) - countOf(before, slug) : null;
      const players = valid(stats.unique) ? stats.unique : null;
      const newPlayers = valid(delta) && delta >= 0 && valid(players) && delta <= players ? delta : null;
      return { slug, name, players, newPlayers, returningPlayers: valid(players) && valid(newPlayers) ? players - newPlayers : null,
        turnover: toUsd(stats.turnover, money), grossProfit: toUsd(stats.profit, money),
        profit: toShareUsd(stats.profit, money.profitShare, money), expected: toShareUsd(stats.expectedProfit, money.expectedShare, money), count: stats.count ?? null };
    });
    return { record, rows };
  };
  const daily = [], perGame = new Map(selected.map(r => [r.slug, []]));
  for (let ts = Date.parse(from); ts <= Date.parse(to); ts += DAY_MS) {
    const date = dateKey(ts);
    const { record, rows } = dayRows(date);
    if (record) for (const row of rows) perGame.get(row.slug).push(row);
    daily.push({ date, ...aggregate(rows), current: date === today, fetchedAt: record?.fetchedAt ?? null, measured: !!record });
  }
  const sort = SORTS.includes(query.get('sort')) ? query.get('sort') : 'players';
  const dir = query.get('dir') === 'asc' ? 'asc' : 'desc';
  const games = selected.map(({ slug, name }) => ({ slug, name, ...aggregate(perGame.get(slug)) }));
  games.sort((a, b) => {
    if (sort === 'name') return (dir === 'asc' ? 1 : -1) * a.name.localeCompare(b.name);
    if (!valid(a[sort])) return valid(b[sort]) ? 1 : a.name.localeCompare(b.name);
    if (!valid(b[sort])) return -1;
    return (dir === 'asc' ? 1 : -1) * (a[sort] - b[sort]) || a.name.localeCompare(b.name);
  });
  const measured = daily.filter(r => r.measured);
  // Calendar months, 1st 00:00Z to 1st 00:00Z. `months` covers only the
  // SELECTED window (`from`..`to` above), grouped by whichever calendar
  // months it touches - built from the daily rows already computed for that
  // window rather than from the upstream month-to-date counter, whose own
  // reset point is not something this code is allowed to assume. A month
  // with zero measured days in the window is simply absent, not a zero row.
  const byMonth = new Map();
  for (const row of measured) {
    const key = monthOfDate(row.date);
    if (!byMonth.has(key)) byMonth.set(key, []);
    byMonth.get(key).push(row);
  }
  const currentMonth = monthKey(now);
  const months = [...byMonth.entries()].sort(([a], [b]) => a.localeCompare(b))
    .map(([key, rows]) => ({ key, label: monthLabel(key), complete: key < currentMonth, ...aggregate(rows) }));
  // `monthToDate` covers the WHOLE current calendar month (1st 00:00Z
  // through `now`) regardless of the selected window above - it always
  // answers "how is the current month doing", even when the reader has
  // filtered the page down to a couple of days. Its own dates are read
  // straight from the snapshot via `dayRows`, independent of `daily`/
  // `measured`, so its `from` (the true 1st) always agrees with what its
  // aggregate actually sums. An unsynced day within the month is simply
  // absent from the sum, exactly as elsewhere.
  const thisMonth = mtd(now);
  const monthToDateDays = datesInMonth(thisMonth.key, { through: today })
    .map(date => { const { record, rows } = dayRows(date); return { ...aggregate(rows), measured: !!record }; })
    .filter(d => d.measured);
  const monthToDateOut = { key: thisMonth.key, label: monthLabel(thisMonth.key),
    from: thisMonth.from, to: thisMonth.to, ...aggregate(monthToDateDays) };
  return { daily, games, options, from, to, days, game, sort, dir, totals: aggregate(measured), latest: daily.at(-1),
    measuredDays: measured.length, missingDays: daily.length - measured.length, snapshot, now,
    stale: measured.some(r => r.current && now - r.fetchedAt > 30 * 60000),
    months, monthToDate: monthToDateOut };
}
