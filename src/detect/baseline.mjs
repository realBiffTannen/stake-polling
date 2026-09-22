// Robust statistics for anomaly detection.
//
// Median and MAD rather than mean and standard deviation: a 10x volume spike
// drags a mean and inflates a stddev, so the spike ends up hiding inside the
// baseline it is supposed to be measured against. The median barely moves.

const MAD_TO_SIGMA = 0.6745;

/** @param {number[]} nums */
export function median(nums) {
  if (!nums.length) return 0;
  const sorted = [...nums].sort((a, b) => a - b);
  const mid = sorted.length >> 1;
  return sorted.length % 2 ? sorted[mid] : (sorted[mid - 1] + sorted[mid]) / 2;
}

/** Median absolute deviation. @param {number[]} nums */
export function mad(nums) {
  if (!nums.length) return 0;
  const m = median(nums);
  return median(nums.map((n) => Math.abs(n - m)));
}

/**
 * Robust z-score of x against the distribution of `nums`.
 * Returns 0 when MAD is 0 - a perfectly flat series gives no scale to divide
 * by, so callers fall back to an absolute floor instead.
 */
export function robustZ(x, nums) {
  const spread = mad(nums);
  if (spread === 0) return 0;
  return (MAD_TO_SIGMA * (x - median(nums))) / spread;
}

// A month rollover lands within a percent or two of zero in its first minute;
// ordinary movement never sheds 95% of a month-to-date total between two
// readings. The test is on MAGNITUDE, not on value: profit is signed and
// legitimately runs negative, so "more negative" is ordinary movement while
// "collapsed towards zero" is a reset.
const RESET_RATIO = 0.05;

/**
 * Per-interval deltas of a cumulative series.
 *
 * The API reports month-to-date totals, so rate lives in the differences.
 *
 * Two different things can make the series step backwards, and conflating
 * them is expensive:
 *
 *   reset       a month rollover or re-registration drops the counter to
 *               near zero. The new value is itself that interval's volume.
 *   correction  the total edges down by a tiny amount - a settled or voided
 *               bet, or two reads landing either side of a replication lag.
 *               Observed live: 154,869,581,036 -> 154,868,656,683, a drop of
 *               92 cents on a $154,000 counter. Treating that as a reset
 *               reports a $154,868 delta, which is both a wildly wrong day
 *               total and a guaranteed false spike alert.
 *
 * Profit is signed, so it moves down as a matter of course. Comparing values
 * rather than magnitudes read every step further into the red as a reset, and
 * reported a whole month of losses as one minute's.
 *
 * @param {number[]} series
 */
export function deltas(series) {
  const out = [];
  for (let i = 1; i < series.length; i++) {
    const prev = toNum(series[i - 1]);
    const curr = toNum(series[i]);

    if (Math.abs(curr) < Math.abs(prev) * RESET_RATIO) {
      out.push(curr); // reset: this interval's volume is the whole new total
    } else {
      out.push(curr - prev); // ordinary movement, in either direction
    }
  }
  return out;
}

function toNum(v) {
  const n = Number(v);
  return Number.isFinite(n) ? n : 0;
}
