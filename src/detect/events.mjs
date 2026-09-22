/**
 * What might be happening.
 *
 * The rules produce findings: "turnover z=7.1", "20 players arrived". A human
 * reading a dashboard at 3am wants the sentence above those findings - which
 * game, what it looks like, how sure we are. This groups a game's recent
 * alerts into one candidate event and names it.
 *
 * These are HYPOTHESES, not conclusions. The wording says so, and every event
 * carries the findings it was built from so the raw evidence stays one glance
 * away.
 */

const RECENT_MS = 30 * 60 * 1000;

// Signatures are checked in order; the first that matches names the event.
// More specific patterns come first - a surge with players arriving is a
// better description than a bare turnover spike.
const SIGNATURES = [
  {
    id: 'traffic_surge',
    title: 'traffic surge',
    matches: (k) => (k.has('onlinePlayers:spike') || k.has('share_shift:up')) && (k.has('turnover:spike') || k.has('count:spike')),
    describe: (g) => `players and volume are both climbing on ${g} - a promotion, a stream, or an influx from another game`,
  },
  {
    id: 'traffic_drain',
    title: 'traffic draining',
    matches: (k) => (k.has('onlinePlayers:drop') || k.has('share_shift:down')) && (k.has('turnover:drop') || k.has('count:drop')),
    describe: (g) => `players and volume are both falling away from ${g}`,
  },
  {
    id: 'outage',
    title: 'possible outage',
    matches: (k) => k.has('turnover:flat_line'),
    describe: (g) => `${g} has gone quiet after being busy - check whether the game is reachable`,
  },
  {
    id: 'big_win',
    title: 'possible large win',
    matches: (k) => k.has('profit:drop') && !k.has('turnover:drop'),
    describe: (g) => `profit on ${g} fell sharply while volume held - consistent with one or more large payouts`,
  },
  {
    id: 'hot_run',
    title: 'running hot',
    matches: (k) => k.has('profit:spike') && !k.has('turnover:spike'),
    describe: (g) => `profit on ${g} jumped without a matching rise in volume - the game is running above its expected hold`,
  },
  {
    id: 'volume_spike',
    title: 'volume spike',
    matches: (k) => k.has('turnover:spike') || k.has('count:spike'),
    describe: (g) => `volume on ${g} is well above its recent baseline`,
  },
  {
    id: 'volume_drop',
    title: 'volume drop',
    matches: (k) => k.has('turnover:drop') || k.has('count:drop'),
    describe: (g) => `volume on ${g} has fallen well below its recent baseline`,
  },
  {
    id: 'players_moved',
    title: 'player movement',
    matches: (k) => k.has('onlinePlayers:spike') || k.has('onlinePlayers:drop') || k.has('share_shift:up') || k.has('share_shift:down'),
    describe: (g) => `the number of players on ${g} has moved sharply`,
  },
  {
    id: 'credential',
    title: 'polling interrupted',
    matches: (k) => k.has('sid:auth') || k.has('poll:poll_failure'),
    describe: () => 'the poller is not collecting - the figures below are frozen at the last good tick',
  },
];

/**
 * Group recent alerts into candidate events, most confident first.
 *
 * @param {object[]} alerts newest-first, as stored
 * @param {number} now
 * @param {{ recentMs?: number }} [opts]
 */
export function synthesise(alerts, now, opts = {}) {
  const recentMs = opts.recentMs ?? RECENT_MS;
  const recent = (alerts ?? []).filter((a) => Number.isFinite(Number(a?.ts)) && now - Number(a.ts) <= recentMs);

  const byGame = new Map();
  for (const alert of recent) {
    const game = alert.game ?? 'team';
    if (!byGame.has(game)) byGame.set(game, []);
    byGame.get(game).push(alert);
  }

  const events = [];
  for (const [game, found] of byGame) {
    const kinds = new Set(found.map(signatureKey));
    const signature = SIGNATURES.find((s) => s.matches(kinds));
    if (!signature) continue;

    const newest = Math.max(...found.map((a) => Number(a.ts)));
    const oldest = Math.min(...found.map((a) => Number(a.ts)));
    const crits = found.filter((a) => a.severity === 'crit').length;

    events.push({
      id: signature.id,
      title: signature.title,
      game,
      description: signature.describe(game),
      // Confidence is deliberately coarse. Independent findings agreeing is
      // the real signal; a single finding repeated is not.
      confidence: confidenceOf(found, crits),
      findings: found.length,
      crits,
      since: oldest,
      updated: newest,
      evidence: found.slice(0, 4).map((a) => a.message).filter(Boolean),
    });
  }

  const rank = { high: 3, medium: 2, low: 1 };
  return events.sort((a, b) => rank[b.confidence] - rank[a.confidence] || b.updated - a.updated);
}

/** Distinct metrics agreeing matters more than one metric shouting. */
function confidenceOf(found, crits) {
  const metrics = new Set(found.map((a) => a.metric));
  if (metrics.size >= 2 && crits >= 1) return 'high';
  if (metrics.size >= 2 || crits >= 1) return 'medium';
  return 'low';
}

function signatureKey(alert) {
  if (alert.kind === 'share_shift') {
    return `share_shift:${Number(alert.z) >= 0 ? 'up' : 'down'}`;
  }
  return `${alert.metric}:${alert.kind}`;
}
