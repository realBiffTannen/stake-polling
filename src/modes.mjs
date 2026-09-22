/**
 * Per-bet-mode samples.
 *
 * The roster endpoint reports one row per game. The per-game endpoint reports
 * one row per BET MODE - BASE, BONUS_BOOST, FREE_SPINS - and that is the only
 * place a bonus round's own turnover and profit appear. The poller has always
 * fetched it, but only ever kept the latest snapshot, so there was no way to
 * ask what a bonus round earned between 14:35 and 14:40.
 *
 * These samples fix that. They are stored exactly like every other trail: raw
 * API units, cumulative month-to-date counters, differenced at read time.
 *
 * All modes are recorded, BASE included. A bonus-only trail cannot be checked
 * against the game total, and a breakdown nobody can reconcile is a breakdown
 * nobody can trust.
 */

/**
 * The cumulative counters worth differencing.
 *
 * Deliberately not rtp/effectiveRtp/avgBet: those are ratios. Differencing a
 * ratio produces a number with no meaning, and storing one invites somebody to
 * try.
 */
export const MODE_FIELDS = ['count', 'turnover', 'profit'];

// One stream holds every mode of one game, so mode and field share a key. The
// separator must be a character a sanitised mode name can never contain.
const SEP = ':';
const UNSAFE = /[^A-Za-z0-9_-]+/g;

/** `BASE` + `profit` -> `BASE:profit`. */
export function modeField(mode, field) {
  return `${mode}${SEP}${field}`;
}

/**
 * The inverse, or null for a field that is not a mode field at all - the same
 * stream would otherwise happily read `onlinePlayers` as a mode called
 * `onlinePlayers` with no field.
 */
export function parseModeField(key) {
  const at = String(key).indexOf(SEP);
  if (at <= 0) return null;
  const mode = key.slice(0, at);
  const field = key.slice(at + 1);
  if (!mode || !MODE_FIELDS.includes(field)) return null;
  return { mode, field };
}

/**
 * A mode name safe to use as half of a stream field key.
 *
 * Returns null when nothing usable survives, because a mode keyed `undefined`
 * silently merges every unnamed row in the response into one column.
 */
export function sanitiseMode(name) {
  if (name === null || name === undefined) return null;
  const safe = String(name).trim().replace(UNSAFE, '_').replace(/^_+|_+$/g, '');
  return safe.length ? safe : null;
}

/**
 * Flatten this tick's per-game snapshots into one sample per game.
 *
 * A game whose fetch failed is absent from the result rather than present with
 * zeros - the trail must record a gap as a gap, or `deltas()` reads the next
 * successful fetch as a whole month of volume arriving in one interval.
 *
 * @param {Record<string, { ok?: boolean, data?: unknown }>} perGame
 * @returns {Record<string, Record<string, number>>} slug -> { 'MODE:field': n }
 */
export function normaliseModes(perGame) {
  const out = {};

  for (const [slug, snap] of Object.entries(perGame ?? {})) {
    if (!snap?.ok) continue;

    const fields = {};
    for (const row of modeList(snap.data)) {
      const mode = sanitiseMode(row?.mode ?? row?.name ?? row?.betMode);
      if (!mode) continue;
      for (const field of MODE_FIELDS) {
        const n = Number(row?.[field]);
        if (Number.isFinite(n)) fields[modeField(mode, field)] = n;
      }
    }

    if (Object.keys(fields).length) out[slug] = fields;
  }

  return out;
}

/**
 * The canonical display order for a set of bet modes: BASE first, then
 * alphabetical.
 *
 * Fixed order matters because two different views derive their mode set from
 * two different places - the snapshot's array and the trail's field keys. If
 * each used its own order, the same game would list its modes differently on
 * two tabs and a reader comparing them would be comparing two layouts.
 */
export function modeOrder(names) {
  return [...new Set(Array.isArray(names) ? names : [])].sort((a, b) => {
    if (a === b) return 0;
    if (a === 'BASE') return -1;
    if (b === 'BASE') return 1;
    return String(a).localeCompare(String(b));
  });
}

/** The live response puts the per-mode array under `stats`; tolerate the rest. */
function modeList(payload) {
  if (Array.isArray(payload)) return payload;
  for (const key of ['stats', 'modes', 'betModes', 'data']) {
    if (Array.isArray(payload?.[key])) return payload[key];
  }
  return [];
}
