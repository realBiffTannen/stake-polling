// Every Redis key and channel this project touches. Nothing else builds key
// strings by hand, so a namespace change is a one-line change.

/**
 * @param {string} team
 * @returns {{
 *   ns: string, roster: string, games: string, graph: string, lifetime: string,
 *   balance: string, tsTeam: string, tsOnline: string, alerts: string, summary: string, meta: string, lock: string,
 *   chTick: string, chAlerts: string,
 *   game: (g: string) => string, tsGame: (g: string) => string,
 *   tsGameModes: (g: string) => string
 * }}
 */
export function keys(team) {
  const ns = `stake:${team}`;
  return {
    ns,
    dailyInsights: `${ns}:insights:daily:v1`,
    modeRollup: `${ns}:insights:modes:v1`,
    catalogue: `${ns}:insights:catalogue:v1`,
    lockInsights: `${ns}:lock:daily-insights`,
    roster: `${ns}:roster:latest`,
    games: `${ns}:games:latest`,
    graph: `${ns}:graph:latest`,
    lifetime: `${ns}:lifetime:latest`,
    balance: `${ns}:balance:latest`,
    game: (g) => `${ns}:game:${g}:latest`,
    tsTeam: `${ns}:ts:team`,
    tsOnline: `${ns}:ts:online`,
    tsGame: (g) => `${ns}:ts:${g}`,
    // One stream per game holding every bet mode, rather than one per
    // game+mode: a dashboard frame then costs one extra read per game
    // instead of one per mode, and a mode's sample stays atomic with its
    // siblings, so the columns of a row always describe the same instant.
    tsGameModes: (g) => `${ns}:ts:${g}:modes`,
    alerts: `${ns}:alerts`,
    summary: `${ns}:summary`,
    meta: `${ns}:meta`,
    lock: `${ns}:lock:poller`,
    chTick: `${ns}:tick`,
    // The alert stream and the alert channel cannot share a name.
    chAlerts: `${ns}:alerts:ch`,
  };
}
