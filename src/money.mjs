/**
 * Money units.
 *
 * The accounting API reports every monetary figure in micro-dollars: berry's
 * turnover of 154,868,660,000 is $154,868.66. Verified against the studio
 * accounting page for the whole roster, and confirmed by an identity the
 * balance endpoint satisfies exactly:
 *
 *     position = carry + (month-to-date profit x profitShare)
 *
 * The page also shows two different share rates rather than the gross figure:
 *
 *   profit    the studio's 10% share of GGR  ("Profit (10% ggr)")
 *   expected  7.5% of turnover * edge        ("Expected (7.5% of turnover * edge)")
 *
 * Raw units are what gets STORED - the trail is a faithful record of what the
 * API said, and the detector works on them directly. Conversion happens only
 * at the point of display, and in the detector's floors.
 */

export const DEFAULT_MONEY = { unitsPerDollar: 1_000_000, profitShare: 0.1, expectedShare: 0.075 };

/**
 * Raw micro-dollars to dollars, or null when there is no reading.
 *
 * `Number(null)` is 0, so an absent figure would otherwise render as a
 * confident `$0.00` - indistinguishable from a game that genuinely took
 * nothing.
 */
export function toUsd(raw, money = DEFAULT_MONEY) {
  if (raw === null || raw === undefined || raw === '') return null;
  const n = Number(raw);
  if (!Number.isFinite(n)) return null;
  return n / (money.unitsPerDollar || 1);
}

/** The studio's share of a gross figure, in dollars. */
export function toShareUsd(raw, share, money = DEFAULT_MONEY) {
  const usd = toUsd(raw, money);
  return usd === null ? null : usd * share;
}

/** Dollars to raw units - used to express detector floors in readable money. */
export function fromUsd(dollars, money = DEFAULT_MONEY) {
  return Number(dollars) * (money.unitsPerDollar || 1);
}

/**
 * Format dollars the way the accounting page does: a leading sign, then the
 * symbol, then grouped digits to two places. `-$2,241.02`, not `$-2241.0157`.
 */
export function formatUsd(dollars, { decimals = 2 } = {}) {
  if (dollars === null || dollars === undefined || !Number.isFinite(Number(dollars))) return '-';
  const n = Number(dollars);
  const sign = n < 0 ? '-' : '';
  const body = Math.abs(n).toLocaleString('en-US', { minimumFractionDigits: decimals, maximumFractionDigits: decimals });
  return `${sign}$${body}`;
}

/** Same, with an explicit + on gains, for per-minute change columns. */
export function formatUsdSigned(dollars, opts) {
  if (dollars === null || dollars === undefined || !Number.isFinite(Number(dollars))) return '-';
  const n = Number(dollars);
  return n > 0 ? `+${formatUsd(n, opts)}` : formatUsd(n, opts);
}

/**
 * The revenue model a roster game is on, from the `stats.rate` the roster
 * reports for it in basis points: 1000 is the 10% revenue share, 500 the 5%
 * GGR split across several providers. The studio dashboard's own export
 * prints `rate / 100` with a percent sign, and the `revenueShare` beside it
 * is `rate / 10000` of the gross profit. Null when there is no rate - a title
 * not on the roster has none, and that is not the same claim as 0%.
 */
export function revenueModel(rateBp) {
  if (rateBp === null || rateBp === undefined || rateBp === '') return null;
  const bp = Number(rateBp);
  if (!Number.isFinite(bp)) return null;
  const percent = bp / 100;
  if (bp === 1000) return { rateBp: bp, percent, split: false, label: '10% revenue share' };
  if (bp === 500) return { rateBp: bp, percent, split: true, label: '5% GGR, split across providers' };
  return { rateBp: bp, percent, split: null, label: `${Number(percent.toFixed(2))}% GGR` };
}
