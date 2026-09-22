/**
 * Calendar months.
 *
 * A month begins on the 1st at 00:00Z and ends the instant the next one
 * begins - half-open, so no sample is counted in two months and none falls
 * between them. A month is anchored to midnight on the 1st here regardless of
 * `dayBoundaryUtcHour`, which the intraday columns follow: the two agree today
 * because that boundary is 00:00Z, but they are independent. When the day
 * rolled at 12:00Z a month assembled out of noon-to-noon days would have
 * started at midday on the 1st, which is not what anybody means by a month.
 */

const DAY_MS = 86400000;
const KEY = /^(\d{4})-(\d{2})$/;
const MONTHS = ['January', 'February', 'March', 'April', 'May', 'June', 'July',
  'August', 'September', 'October', 'November', 'December'];

export function monthKey(ts) {
  if (ts === null || ts === undefined || ts === '') return null;
  const n = Number(ts);
  if (!Number.isFinite(n)) return null;
  return new Date(n).toISOString().slice(0, 7);
}

export function monthOfDate(date) {
  // date must be an ISO date string (YYYY-MM-DD), never a Date object
  return String(date).slice(0, 7);
}

function parse(key) {
  const m = KEY.exec(String(key));
  if (!m) return null;
  const year = Number(m[1]), month = Number(m[2]);
  return month >= 1 && month <= 12 ? { year, month } : null;
}

/**
 * Returns {from, to} half-open range in ms for a month key, or null if the
 * key is malformed or out of range. Callers must check before destructuring.
 */
export function monthRange(key) {
  const p = parse(key);
  if (!p) return null;
  return {
    from: Date.UTC(p.year, p.month - 1, 1),
    to: Date.UTC(p.month === 12 ? p.year + 1 : p.year, p.month === 12 ? 0 : p.month, 1),
  };
}

export function monthLabel(key) {
  const p = parse(key);
  return p ? `${MONTHS[p.month - 1]} ${p.year}` : String(key);
}

export function monthsBetween(fromKey, toKey) {
  const a = parse(fromKey), b = parse(toKey);
  if (!a || !b) return [];
  const out = [];
  for (let y = a.year, m = a.month; y < b.year || (y === b.year && m <= b.month);) {
    out.push(`${y}-${String(m).padStart(2, '0')}`);
    if (m === 12) { y += 1; m = 1; } else m += 1;
  }
  return out;
}

export function monthToDate(now) {
  if (now === null || now === undefined || now === '') return null;
  const key = monthKey(now);
  if (key === null) return null;
  return { key, from: monthRange(key).from, to: Number(now) };
}

export function datesInMonth(key, { through } = {}) {
  const range = monthRange(key);
  if (!range) return [];
  const limit = through ? Math.min(range.to - DAY_MS, Date.parse(`${through}T00:00:00Z`)) : range.to - DAY_MS;
  const out = [];
  for (let ts = range.from; ts <= limit; ts += DAY_MS) out.push(new Date(ts).toISOString().slice(0, 10));
  return out;
}
