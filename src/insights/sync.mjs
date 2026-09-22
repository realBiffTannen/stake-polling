export const DAY_MS = 86400000;
export const dateKey = (value) => new Date(value).toISOString().slice(0, 10);
export const previousDate = (date) => dateKey(Date.parse(date) - DAY_MS);

// Keep only metrics. No upstream metadata or credentials enter this cache.
function project(data) {
  if (!Array.isArray(data)) throw new Error('SHAPE');
  return data.map((r) => {
    if (!r?.slug || !r.stats || !Number.isFinite(r.stats.unique)) throw new Error('SHAPE');
    const stats = {};
    for (const key of ['unique', 'count', 'turnover', 'profit', 'expectedProfit']) {
      stats[key] = Number.isFinite(r.stats[key]) ? r.stats[key] : null;
    }
    return { slug: String(r.slug), name: String(r.name ?? r.slug), stats };
  });
}

/** Daily API reports use inclusive UTC DATES; intraday timestamps are ignored. */
export async function syncDaily({ api, previous = {}, now = Date.now(), days = 30, trackingStart, onProgress = async () => {}, delayMs = 0, signal }) {
  const today = dateKey(now);
  const start = dateKey(trackingStart);
  const cache = previous.trackingStart === start ? previous : {};
  const out = { version: 1, trackingStart: start, days: { ...cache.days }, cumulative: { ...cache.cumulative }, cumulativeThrough: { ...cache.cumulativeThrough }, lastSync: cache.lastSync ?? null, error: null };
  const refreshed = new Set();
  const endOf = date => Date.parse(date) + DAY_MS;
  const finalBoundary = date => date < start || (out.cumulativeThrough[date] ?? out.days[date]?.through ?? 0) >= endOf(date);
  async function fetchRows(from, to) {
    if (signal?.aborted) throw new Error('STOPPED');
    const result = await api.teamStats({ start: from, end: to });
    if (!result.ok) throw new Error(result.error?.code ?? 'UPSTREAM');
    const rows = project(result.data);
    if (delayMs) await new Promise(resolve => setTimeout(resolve, delayMs));
    return rows;
  }
  async function cumulative(date) {
    if (date < start) return [];
    const recent = date >= previousDate(today);
    if (out.cumulative[date] && ((!recent && finalBoundary(date)) || refreshed.has(date))) return out.cumulative[date];
    const rows = await fetchRows(start, date);
    refreshed.add(date);
    return rows;
  }
  try {
    for (let i = 0; i < Math.min(30, Math.max(1, days)); i++) {
      const date = dateKey(Date.parse(today) - i * DAY_MS);
      if (date < start) break;
      if (i > 1 && out.days[date]?.through >= endOf(date) && out.cumulative[date] && finalBoundary(date) && (previousDate(date) < start || out.cumulative[previousDate(date)] && finalBoundary(previousDate(date)))) continue;
      // Commit one whole day only after all three reads succeed.
      const rows = await fetchRows(date, date);
      const after = await cumulative(date);
      const before = await cumulative(previousDate(date));
      out.days[date] = { rows, fetchedAt: now, through: date === today ? now : Date.parse(date) + DAY_MS };
      out.cumulative[date] = after;
      out.cumulative[previousDate(date)] = before;
      out.cumulativeThrough[date] = Math.min(now, endOf(date));
      out.cumulativeThrough[previousDate(date)] = endOf(previousDate(date));
      await onProgress(out);
    }
    out.lastSync = now;
  } catch (err) {
    // Never echo upstream bodies or arbitrary exception messages into HTML.
    out.error = ['AUTH', 'SHAPE', 'NETWORK', 'CLIENT', 'SERVER', 'STOPPED', 'PARSE'].includes(err.message) ? err.message : 'SYNC_FAILED';
  }
  const oldest = dateKey(Date.parse(today) - 29 * DAY_MS);
  out.days = Object.fromEntries(Object.entries(out.days).filter(([date]) => date >= oldest));
  out.cumulative = Object.fromEntries(Object.entries(out.cumulative).filter(([date]) => date >= previousDate(oldest)));
  out.cumulativeThrough = Object.fromEntries(Object.entries(out.cumulativeThrough).filter(([date]) => date >= previousDate(oldest)));
  return out;
}
