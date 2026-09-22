/**
 * Decides which detected conditions are worth telling a human about.
 *
 * The rules re-evaluate every minute, so a condition that stays true would
 * otherwise produce sixty identical alerts an hour. The gate emits once, goes
 * quiet for the cooldown, and - if the condition is still true when the
 * cooldown lapses - re-emits once at escalated severity. Silence therefore
 * means "nothing new", not "problem solved".
 */
export class AlertGate {
  /** @param {{ cooldownMinutes: number }} config */
  constructor(config) {
    this.cooldownMs = (config?.cooldownMinutes ?? 15) * 60000;
    /** @type {Map<string, { last: number, escalated: boolean }>} */
    this.state = new Map();
  }

  /**
   * @param {Alert[]} alerts detected this tick
   * @param {number} now epoch ms
   * @returns {Alert[]} the ones to publish
   */
  admit(alerts, now) {
    const seen = new Set();
    const out = [];

    for (const alert of alerts) {
      const id = key(alert);
      seen.add(id);
      const prior = this.state.get(id);

      if (!prior) {
        this.state.set(id, { last: now, escalated: false });
        out.push({ ...alert });
        continue;
      }
      if (now - prior.last < this.cooldownMs) continue;

      // Still true after a full cooldown: say so once more, louder.
      this.state.set(id, { last: now, escalated: true });
      out.push({
        ...alert,
        severity: 'crit',
        message: prior.escalated || alert.severity === 'crit'
          ? `${alert.message} (still active)`
          : `${alert.message} (sustained)`,
      });
    }

    // A condition that stopped firing is forgotten, so its next occurrence is
    // treated as new rather than as a continuation.
    for (const id of [...this.state.keys()]) {
      if (!seen.has(id)) this.state.delete(id);
    }
    return out;
  }
}

function key(alert) {
  return [alert.game, alert.metric, alert.kind].join('::');
}
