import { deltas } from '../detect/baseline.mjs';
import { modeOrder, modeField, sanitiseMode } from '../modes.mjs';
import { dayStart, sumSince } from '../window.mjs';
import { toUsd, toShareUsd, DEFAULT_MONEY } from '../money.mjs';
import { gameModel, modeModel, checkMode } from './math.mjs';
import { modeList } from './state.mjs';

/**
 * One display row per bet mode, from two sources that answer at different
 * instants and are deliberately not merged:
 *
 *   the snapshot  month-to-date totals and ratios, available on frame one
 *   the trail     deltas and day totals, forward-only from first record
 *
 * A mode present in the snapshot but absent from the trail keeps its totals
 * and reports null for every rate. That is the common case for a while after
 * this ships, and it must read as "not measured yet", never as zero.
 */
export function buildModeRows({ snapshot, modeTrail, gameRow, now, config, mathModel, slug }) {
  if (!snapshot?.ok) return [];
  const rows = modeList(snapshot.data);
  if (!rows.length) return [];

  const money = config?.money ?? DEFAULT_MONEY;
  const dayFrom = dayStart(now, config?.dayBoundaryUtcHour ?? 12);
  const trail = Array.isArray(modeTrail) ? modeTrail : [];
  const game = gameModel(mathModel, slug);

  // The trail keys its fields by SANITISED mode name (normaliseModes runs the
  // same sanitiseMode before calling modeField), so the lookup key and the
  // display name can differ. A name that does not survive sanitising has no
  // trail key it could ever match, so it is skipped entirely - same as
  // normaliseModes does on the write side.
  const bySnapshotName = new Map();
  for (const row of rows) {
    const name = row?.mode ?? row?.name ?? row?.betMode;
    if (!name) continue;
    const trailKey = sanitiseMode(name);
    if (!trailKey) continue;
    bySnapshotName.set(String(name), { row, trailKey });
  }

  return modeOrder([...bySnapshotName.keys()]).map((mode) => {
    const { row: raw, trailKey } = bySnapshotName.get(mode);
    const turnover = number(raw.turnover);
    const profit = number(raw.profit);
    const expectedReturn = number(raw.expectedReturn);

    const series = (field) => trailSeries(trail, trailKey, field);
    const turnoverSteps = series('turnover');
    const countSteps = series('count');
    const profitSteps = series('profit');

    const base = {
      mode,
      cost: number(raw.cost),
      avgBet: number(raw.avgBet),
      count: number(raw.count),
      turnover,
      profit,
      expectedReturn,
      rtp: number(raw.rtp),
      effectiveRtp: number(raw.effectiveRtp ?? raw.effective_rtp),
      normalizedRtp: number(raw.normalizedRtp ?? raw.normalized_rtp),

      turnoverUsd: toUsd(turnover, money),
      profitUsd: toShareUsd(profit, money.profitShare, money),
      expectedUsd: toShareUsd(expectedReturn, money.expectedShare, money),

      // Fractions of the game as a whole, from the snapshot on both sides so
      // numerator and denominator describe the same instant.
      shareTurnover: share(turnover, gameRow?.turnover),
      shareCount: share(number(raw.count), gameRow?.count),
      shareProfit: share(profit, gameRow?.profit),

      dCount: countSteps.at(-1) ?? null,
      dTurnover: turnoverSteps.at(-1) ?? null,
      dProfit: profitSteps.at(-1) ?? null,

      dayCount: daySum(trail, trailKey, 'count', dayFrom),
      dayTurnover: daySum(trail, trailKey, 'turnover', dayFrom),
      dayProfit: daySum(trail, trailKey, 'profit', dayFrom),

      spark: turnoverSteps,

      // Gross, before any share. `profit` carries a 10% share and
      // `expectedReturn` a 7.5% one, so the converted figures are not
      // commensurable and subtracting them would be meaningless. Guarded on
      // BOTH operands: `null - expectedReturn` coerces the missing side to 0
      // and reports a confident, wrong figure instead of "not measured".
      vsExpected: (profit === null || expectedReturn === null) ? null : profit - expectedReturn,
    };

    base.vsExpectedUsd = toShareUsd(base.vsExpected, money.profitShare, money);
    base.findings = checkMode({
      row: base,
      game,
      mode: modeModel(mathModel, slug, mode),
      money,
    });
    return base;
  });
}

/**
 * Per-poll deltas of one mode's field, or [] when the trail has no reading.
 * `trailKey` is the SANITISED mode name - the same one `normaliseModes` used
 * to write the field - not necessarily the raw display name.
 */
function trailSeries(trail, trailKey, field) {
  const key = modeField(trailKey, field);
  // Routed through `number()`, not a bare `Number.isFinite(Number(...))`
  // filter: `normaliseModes` (../modes.mjs) never writes a null/'' field, so
  // in production this key is always either a real finite number or simply
  // absent (undefined). But a bare coercion would still treat an explicit
  // `null` as a present, finite reading of 0 if one ever reached this trail -
  // safe only by the writer's current behaviour, not by contract.
  const present = trail.filter((s) => number(s?.fields?.[key]) !== null);
  return present.length < 2 ? [] : deltas(present.map((s) => number(s.fields[key])));
}

/**
 * The mode's own total since the accounting boundary.
 *
 * Null rather than 0 when the trail carries fewer than two readings for this
 * mode: one sample is a level, not a change, and a mode that started being
 * recorded this minute has not measured the day.
 */
function daySum(trail, trailKey, field, from) {
  const key = modeField(trailKey, field);
  const present = trail.filter((s) => number(s?.fields?.[key]) !== null);
  if (present.length < 2) return null;
  return sumSince(present.map((s) => ({ ts: s.ts, fields: { [field]: number(s.fields[key]) } })), field, from);
}

/**
 * `part` as a fraction of `whole`, or null when either side was never
 * measured. Routed through `number()` below so a `null` part or whole is
 * rejected BEFORE coercion - `Number(null)` is 0 and finite, so a bare
 * `Number(part)` guard would turn "not measured" into "0% of the game's
 * turnover", a confident and wrong statement. A genuine zero part still
 * divides through to a genuine zero share. `whole === 0` stays its own
 * guard: a share of nothing is undefined, not zero, even when it IS a
 * measured zero.
 */
function share(part, whole) {
  const p = number(part);
  const w = number(whole);
  if (p === null || w === null || w === 0) return null;
  return p / w;
}

/**
 * A raw snapshot value as a finite number, or null when it isn't one.
 *
 * `Number(null)` is `0` - finite - so without the explicit check an API field
 * that is present but `null` would read as a measured zero, exactly the
 * failure this module exists to prevent. `money.mjs`'s `toUsd` guards the
 * same three values for the same reason.
 */
function number(v) {
  if (v === null || v === undefined || v === '') return null;
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
}
