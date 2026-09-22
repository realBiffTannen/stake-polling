/**
 * Which games exist, and which of them are live.
 *
 * Two endpoints answer this and they disagree at the only moment it matters.
 *
 *   /stats   the roster. Authoritative on figures, but a game only grows a row
 *            here once it HAS figures.
 *   /games   the catalogue. Every title the team owns, released or not, with
 *            an `isLive` flag that flips the instant a game is turned on.
 *
 * Observed live 2026-09-16: 25 titles, all `published: true`, of which exactly
 * 10 were `isLive: true` - and those 10 were precisely the roster. `published`
 * is therefore useless as a liveness test; the other 15 404 on the per-game
 * endpoint.
 *
 * Shared by the poller (what to request) and the reader (what to display) so
 * the liveness rule cannot drift between them.
 */

/** Payloads arrive as bare arrays, but tolerate a wrapper. */
export function listOf(payload) {
  if (Array.isArray(payload)) return payload;
  for (const key of ['games', 'data', 'items', 'results']) {
    if (Array.isArray(payload?.[key])) return payload[key];
  }
  return [];
}

/** Slug first: it is what every URL and every Redis key is built from. */
export function idOf(entry) {
  return entry?.slug ?? entry?.game ?? entry?.gameName ?? entry?.name ?? null;
}

/** The slugs the roster lists. */
export function gameIds(roster) {
  return listOf(roster).map(idOf).filter(Boolean);
}

/**
 * The slugs the catalogue says are live.
 *
 * Strictly `=== true`: an older payload with no `isLive` field must yield
 * nothing rather than everything, so a schema change downgrades discovery to
 * the roster instead of firing every dark title at the per-game endpoint.
 */
export function liveGameIds(catalogue) {
  return listOf(catalogue).filter((g) => g?.isLive === true).map(idOf).filter(Boolean);
}

/** The catalogue entries that are live, for their onlinePlayers and totals. */
export function liveListings(catalogue) {
  return listOf(catalogue).filter((g) => g?.isLive === true && idOf(g));
}

/** Union, first list winning the ordering. */
export function mergeSlugs(...lists) {
  return [...new Set(lists.flat().filter(Boolean))];
}

/**
 * Every title the catalogue lists, live or not, reduced to the fields a page
 * may show.
 *
 * An explicit allow-list, because this crosses into the browser: the upstream
 * entry also carries image URLs, ratings and monthly figures, and none of
 * them are anybody's to render from here. `published` stays null when the
 * catalogue does not say - absent is not the same claim as `false`.
 */
export function titlesOf(catalogue) {
  return listOf(catalogue).filter((g) => idOf(g)).map((g) => ({
    slug: idOf(g),
    name: g.name ?? idOf(g),
    isLive: g.isLive === true,
    published: typeof g.published === 'boolean' ? g.published : null,
    approval: g.approval?.column ?? null,
  }));
}
