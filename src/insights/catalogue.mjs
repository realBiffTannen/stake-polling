/**
 * Which games were live, and when.
 *
 * The games endpoint carries `published`, `isLive` and an approval column, but
 * NO release date, so "how many games were released on 2026-08-04" cannot be
 * asked of the API at all. It is answered two ways: recorded forward from the
 * day this ships, and reconstructed backwards from the first date each game
 * took a bet. Reconstructed days are flagged, because they are inference.
 */

export function firstSeenFromSnapshot(snapshot = {}) {
  const out = {};
  for (const [date, day] of Object.entries(snapshot.days ?? {})) {
    for (const row of day.rows ?? []) {
      const played = Number(row?.stats?.count) > 0;
      if (!played) continue;
      if (!out[row.slug] || date < out[row.slug]) out[row.slug] = date;
    }
  }
  return out;
}

export function recordCatalogue({ previous = {}, listing = [], date }) {
  const live = listing.filter(g => g?.isLive).map(g => g.slug).sort();
  const firstSeen = { ...(previous.firstSeen ?? {}) };
  for (const slug of live) if (!firstSeen[slug] || date < firstSeen[slug]) firstSeen[slug] = date;
  return {
    version: 1,
    firstSeen,
    days: { ...(previous.days ?? {}), [date]: { live, released: live.length } },
  };
}

export function releasedSeries({ catalogue = {}, dates = [] }) {
  const firstSeen = Object.values(catalogue.firstSeen ?? {});
  return dates.map(date => {
    const recorded = catalogue.days?.[date];
    if (recorded) return { date, released: recorded.released, reconstructed: false };
    return { date, released: firstSeen.filter(seen => seen <= date).length, reconstructed: true };
  });
}
