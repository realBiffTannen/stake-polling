/**
 * Captured math models for the demo's fictional games - what an operator
 * would type into math.json from each game's certified math sheet.
 *
 * Two games are left imperfect on purpose, so the demo shows both of the
 * Game math page's standing warnings:
 *   DRIFTED     its captured model has one buy at the wrong price, as if a
 *               new math version shipped and math.json was not updated
 *   UNCAPTURED  no model at all, as for a game nobody has captured yet
 */

const round = (v, dp = 4) => Math.round(v * 10 ** dp) / 10 ** dp;
const classOf = (sigma) => (sigma >= 25 ? 'EXTREME' : sigma >= 15 ? 'HIGH' : sigma >= 8 ? 'MEDIUM' : 'LOW');

export const DRIFTED = 'thunder-mesa';
export const UNCAPTURED = 'frost-fortune';

export function demoMath(model) {
  const out = {};
  for (const g of model.games) {
    if (g.slug === UNCAPTURED) continue;
    const maxWin = [5000, 10000, 15000, 25000][g.index % 4];
    const modes = {};
    for (const m of g.modes) {
      const buy = m.cost > 5;
      const sigma = buy ? round(1.1 + (g.index % 5) * 0.2, 3) : round(m.mode === 'ANTE' ? g.baseSigma * 0.7 : g.baseSigma, 3);
      const hitRate = buy ? 1 : round(0.24 + (g.index % 7) * 0.012);
      const cost = g.slug === DRIFTED && buy && !Object.values(modes).some((x) => x.cost > 5) ? m.cost * 2 : m.cost;
      modes[m.mode] = {
        cost, rtp: g.rtp, sigma, zeroRate: round(1 - hitRate), hitRate, breakEvenRate: buy ? round(0.18 + (g.index % 4) * 0.03) : round(0.08 + (g.index % 3) * 0.02),
        mean: round(cost * g.rtp, 2), minWin: buy ? round(cost * 0.05, 2) : 0, maxWin,
        subBetRate: buy ? round(0.72 + (g.index % 3) * 0.04) : round(0.16 + (g.index % 5) * 0.015),
        avgSpinsBetweenWin: buy ? 1 : Math.round(1 / hitRate), worstLossStreak: buy ? 18 + (g.index % 9) : 55 + g.index * 3,
        worstZeroStreak: buy ? 0 : 18 + (g.index % 6), volatilityClass: classOf(sigma),
      };
    }
    out[g.slug] = {
      version: 1 + (g.index % 6), edge: round(1 - g.rtp), maxWin, released: true,
      volatilityClass: classOf(g.baseSigma), baseVolatility: round(g.baseSigma, 2),
      costLadder: Object.values(modes).map((m) => m.cost).sort((a, b) => a - b),
      tail: { [maxWin / 5]: 0.0002, [maxWin / 2]: 5e-5, [maxWin]: 4e-6 },
      compliance: { passes2Star: g.baseSigma < 30, passes3Star: true, bindingConstraint: 'maxExposure', failures: g.baseSigma < 30 ? [] : ['baseVolatility'] },
      modes,
    };
  }
  return out;
}
