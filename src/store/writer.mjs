/**
 * One tick of data, written as a single MULTI so a reader never observes half
 * a tick. Failed endpoints are simply absent: their previous snapshot stays
 * where it is, which is why every snapshot carries its own fetch timestamp.
 */

/**
 * @param {import('redis').RedisClientType} client
 * @param {ReturnType<import('./keys.mjs').keys>} k
 * @param {object} tick
 * @param {{ trailMaxLen: number, alertMaxLen: number }} retention
 */
export async function writeTick(client, k, tick, retention) {
  const multi = client.multi();
  const trailTrim = trim(retention.trailMaxLen);
  const alertTrim = trim(retention.alertMaxLen);

  const snaps = tick.snapshots ?? {};
  putSnapshot(multi, k.roster, tick.ts, snaps.roster);
  putSnapshot(multi, k.games, tick.ts, snaps.games);
  putSnapshot(multi, k.graph, tick.ts, snaps.graph);
  putSnapshot(multi, k.lifetime, tick.ts, snaps.lifetime);
  putSnapshot(multi, k.balance, tick.ts, snaps.balance);
  for (const [game, snap] of Object.entries(snaps.perGame ?? {})) {
    putSnapshot(multi, k.game(game), tick.ts, snap);
  }

  const samples = tick.samples ?? {};
  const id = sampleId(tick.ts);
  putSample(multi, k.tsTeam, samples.team, trailTrim, id);
  putSample(multi, k.tsOnline, samples.online, trailTrim, id);
  for (const [game, fields] of Object.entries(samples.games ?? {})) {
    putSample(multi, k.tsGame(game), fields, trailTrim, id);
  }
  // Absent rather than empty when the per-game fetch failed: putSample drops a
  // fieldless sample, so a gap stays a gap.
  for (const [game, fields] of Object.entries(samples.modes ?? {})) {
    putSample(multi, k.tsGameModes(game), fields, trailTrim, id);
  }

  for (const alert of tick.alerts ?? []) {
    multi.xAdd(k.alerts, '*', stringify(alert), alertTrim);
  }

  if (tick.summary) {
    multi.xAdd(k.summary, '*', stringify(tick.summary), trim(retention.summaryMaxLen ?? 2016));
  }

  const meta = { ...(tick.meta ?? {}), last_attempt: String(tick.ts) };
  if (tick.ok !== false) meta.last_ok = String(tick.ts);
  multi.hSet(k.meta, stringify(meta));

  multi.publish(k.chTick, JSON.stringify({ ts: tick.ts, ok: tick.ok !== false, alerts: (tick.alerts ?? []).length }));
  for (const alert of tick.alerts ?? []) {
    multi.publish(k.chAlerts, JSON.stringify(alert));
  }

  await multi.exec();
}

/** Record a single out-of-band alert (auth expiry, repeated poll failure). */
export async function writeAlert(client, k, alert, retention) {
  await client
    .multi()
    .xAdd(k.alerts, '*', stringify(alert), trim(retention.alertMaxLen))
    .publish(k.chAlerts, JSON.stringify(alert))
    .exec();
}

/** Merge fields into the meta hash without touching anything else. */
export async function writeMeta(client, k, fields) {
  const payload = stringify(fields);
  if (Object.keys(payload).length) await client.hSet(k.meta, payload);
}

function putSnapshot(multi, key, ts, snap) {
  if (!snap?.ok) return;
  multi.set(key, JSON.stringify({ ts, endpoint: snap.endpoint, ok: true, data: snap.data }));
}

/**
 * The stream ID a trail sample is written under: its grid boundary.
 *
 * `tick.ts` is the boundary the poller slept to (00:00:00, 00:02:30, ...), not
 * the moment the MULTI landed a second or several later. Every reader takes a
 * sample's time from its ID, so stamping the boundary is what makes the
 * 00:00:00Z tick read as exactly 00:00:00.000 - and what lets "since midnight"
 * leave out the step that arrived AT midnight, which covers the last interval
 * of the day before (see sumSince in src/window.mjs).
 *
 * `<ms>-*` lets Redis pick the sequence, so a second write for the same
 * boundary lands as `<ms>-1` instead of being rejected. Without a usable
 * boundary this falls back to `*` rather than writing a malformed ID.
 *
 * Alerts and summaries are NOT stamped this way: they are events, and their
 * time is when they were raised.
 */
function sampleId(ts) {
  return Number.isSafeInteger(ts) && ts > 0 ? `${ts}-*` : '*';
}

function putSample(multi, key, fields, trimOpts, id = '*') {
  const payload = stringify(fields);
  if (!Object.keys(payload).length) return;
  multi.xAdd(key, id, payload, trimOpts);
}

// Approximate trimming: exact MAXLEN is O(N) on every write, and this process
// writes forever.
function trim(threshold) {
  return { TRIM: { strategy: 'MAXLEN', strategyModifier: '~', threshold } };
}

/** Redis stream and hash values are strings; undefined/null fields are dropped. */
function stringify(obj) {
  const out = {};
  for (const [key, value] of Object.entries(obj ?? {})) {
    if (value === undefined || value === null) continue;
    out[key] = typeof value === 'string' ? value : String(value);
  }
  return out;
}
