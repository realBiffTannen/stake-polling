/**
 * How much memory Redis is holding, and whether that is too much.
 *
 * The trail is kept for thirty days across every game and bet mode, so the
 * database grows with the roster. Left unwatched it grows until the machine
 * swaps or Redis starts refusing writes, and the first sign of either is a
 * collector that has quietly stopped recording.
 *
 * The reading is INFO memory's `used_memory` (bytes) and `used_memory_human`
 * (what `redis-cli INFO memory | grep used_memory_human` prints). The limit is
 * REDIS_DB_SIZE, 2GB when unset. Sizes are binary, as Redis's own human
 * figures are: 1K = 1024 bytes, so "2GB" is the "2.00G" redis-cli shows.
 */

const K = 1024;
const UNITS = {
  '': 1, b: 1,
  k: K, kb: K, kib: K,
  m: K ** 2, mb: K ** 2, mib: K ** 2,
  g: K ** 3, gb: K ** 3, gib: K ** 3,
  t: K ** 4, tb: K ** 4, tib: K ** 4,
};

export const DEFAULT_REDIS_LIMIT = '2GB';

/** "2GB", "512mb", "1.5G" or a plain byte count, in bytes; null if it is none of those. */
export function parseSize(text) {
  const m = /^\s*(\d+(?:\.\d+)?)\s*([a-z]*)\s*$/i.exec(String(text ?? ''));
  if (!m) return null;
  const unit = UNITS[m[2].toLowerCase()];
  if (unit === undefined) return null;
  const bytes = Math.round(Number(m[1]) * unit);
  return bytes > 0 ? bytes : null;
}

/** Bytes the way Redis writes them: 1023B, 812.34M, 2.00G. */
export function humanBytes(bytes) {
  const n = Number(bytes);
  if (!Number.isFinite(n)) return null;
  for (const [unit, size] of [['T', K ** 4], ['G', K ** 3], ['M', K ** 2], ['K', K]]) {
    if (n >= size) return `${(n / size).toFixed(2)}${unit}`;
  }
  return `${n}B`;
}

/** `used_memory` and `used_memory_human` out of an INFO memory reply, or null. */
export function parseMemoryInfo(text) {
  const field = (name) => new RegExp(`^${name}:(.*)$`, 'm').exec(String(text ?? ''))?.[1]?.trim();
  const raw = field('used_memory');
  const used = Number(raw);
  if (!raw || !Number.isFinite(used)) return null;
  return { usedBytes: used, human: field('used_memory_human') || humanBytes(used) };
}

/**
 * The reading, or null when it could not be taken. Unknown is not the same as
 * small: a failed INFO must never read back as a database with room to spare.
 */
export async function readRedisMemory(client) {
  try {
    return parseMemoryInfo(await client.info('memory'));
  } catch {
    return null;
  }
}

/** The reading set against the limit, or null when there is no reading. */
export function memoryStatus(reading, limitBytes) {
  if (!reading || !Number.isFinite(Number(reading.usedBytes))) return null;
  const limit = Number(limitBytes) > 0 ? Number(limitBytes) : parseSize(DEFAULT_REDIS_LIMIT);
  return { usedBytes: Number(reading.usedBytes), human: reading.human ?? humanBytes(reading.usedBytes),
    limitBytes: limit, limitHuman: humanBytes(limit), over: Number(reading.usedBytes) > limit };
}
