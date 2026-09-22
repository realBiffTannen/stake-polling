// Eight block heights. Braille would pack more samples per column, but blocks
// render identically in every terminal font, and a sparkline that turns into
// tofu is worse than a coarser one.
const BLOCKS = ['▁', '▂', '▃', '▄', '▅', '▆', '▇', '█'];

/**
 * A fixed-width sparkline of the most recent `width` values.
 *
 * Scales between the series' own min and max, so it shows shape rather than
 * absolute size - two games with very different turnover are still comparable
 * at a glance.
 *
 * @param {number[]} values oldest-first
 * @param {number} width character cells available
 */
export function sparkline(values, width) {
  if (!width || width < 1) return '';
  const nums = (values ?? []).map(Number).filter(Number.isFinite);
  if (!nums.length) return ' '.repeat(width);

  const recent = nums.slice(-width);
  const min = Math.min(...recent);
  const max = Math.max(...recent);
  const span = max - min;

  const glyphs = recent.map((n) => {
    if (span === 0) return BLOCKS[0];
    const index = Math.round(((n - min) / span) * (BLOCKS.length - 1));
    return BLOCKS[Math.max(0, Math.min(BLOCKS.length - 1, index))];
  });

  // Right-aligned: the newest sample always sits at the same column.
  return glyphs.join('').padStart(width, ' ');
}
