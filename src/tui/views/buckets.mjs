import { C, utcClock, moneySigned } from '../format.mjs';
import { DEFAULT_MONEY, toShareUsd } from '../../money.mjs';
import { fit, row } from '../layout.mjs';
import { profitTable, BUCKET_SIZES } from '../../buckets.mjs';

/**
 * One game's profit per wall-clock bucket, beside each of its bet modes.
 *
 * Buckets are labelled in UTC. They are aligned to the epoch, so an hour
 * bucket starts on the hour UTC - labelling that with a local clock in a zone
 * offset by thirty minutes would print "14:30" against a bucket that runs
 * 14:00-15:00, which is worse than printing a timezone the reader has to
 * convert.
 */
export function renderBuckets(state, box, width, budget) {
  const sizeMs = BUCKET_SIZES[state.bucket] ?? BUCKET_SIZES['5m'];
  const money = state.money ?? DEFAULT_MONEY;
  const trail = state.gameTrails?.[state.focus] ?? [];
  const modeTrail = state.modeTrails?.[state.focus] ?? [];

  // Two header lines and the column titles come out of the row budget.
  const count = Math.max(1, budget - 3);
  const to = state.now;
  const table = profitTable({ trail, modeTrail, sizeMs, from: to - (count - 1) * sizeMs, to, trimUnreached: true });

  const span = `${utcClock(table.rows.at(-1)?.from ?? to)}-${utcClock(to)}`;
  const lines = [box.line(`${C.bold}${state.focus}${C.reset} ${C.dim}profit by ${state.bucket}   ${span} UTC${C.reset}`)];

  if (!table.modes.length) {
    // Per-mode figures only exist from the moment the poller began recording
    // them; the game totals come from a trail that has always been kept.
    lines.push(box.line(`${C.yellow}no per-mode trail yet${C.reset} ${C.dim}- bonus-round columns fill in as the poller runs${C.reset}`));
  }

  const columns = fit(bucketColumns(table, money), width - 4);
  lines.push(box.line(`${C.bold}${row(columns, (c) => c.title)}${C.reset}`));
  for (const bucket of table.rows) lines.push(box.line(row(columns, (c) => c.value(bucket))));

  const off = table.rows.find((r) => disagrees(r));
  if (off) {
    lines.push(box.line(`${C.yellow}modes do not sum to the total at ${utcClock(off.from)}${C.reset} ${C.dim}- /stats and /games/{slug}/stats disagree${C.reset}`));
  }
  return lines;
}

/**
 * BUCKET, the whole game, then one column per bet mode in a fixed order.
 *
 * Mode columns carry the lowest priority and descend left to right, so a
 * narrow terminal sheds the rarest bonus mode first and never the total.
 */
function bucketColumns(table, money) {
  // `toShareUsd` keeps an unmeasured bucket null, and `moneySigned` draws a
  // null as a dim dash - never as a green "$0.00".
  const cell = (value) => moneySigned(toShareUsd(value, money.profitShare, money));

  return [
    { key: 'bucket', title: 'BUCKET', width: 6, align: 'left', priority: 1, value: (r) => utcClock(r.from) },
    { key: 'total', title: 'TOTAL', width: 12, align: 'right', priority: 2, value: (r) => cell(r.total) },
    ...table.modes.map((mode, i) => ({
      key: `mode:${mode}`,
      title: mode,
      width: Math.max(12, Math.min(16, mode.length + 1)),
      align: 'right',
      priority: 3 + i,
      value: (r) => cell(r.byMode[mode]),
    })),
  ];
}

// A rounding cent apart is two endpoints answering at slightly different
// instants; a percent apart is a real disagreement about what the game did.
function disagrees(bucket) {
  if (bucket.total === null || bucket.modeTotal === null) return false;
  return Math.abs(bucket.total - bucket.modeTotal) > Math.abs(bucket.total) * 0.01;
}
