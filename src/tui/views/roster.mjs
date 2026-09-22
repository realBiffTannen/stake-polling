import { C, int, intOrDash, intSigned, money, moneySigned } from '../format.mjs';
import { formatUsd, formatUsdSigned } from '../../money.mjs';
import { fit, row } from '../layout.mjs';
import { sparkline } from '../sparkline.mjs';
import { totalsOf } from '../state.mjs';

/**
 * Every column the roster table can show, in display order.
 *
 * Built per frame rather than declared once, because the rate columns have to
 * name their period: at a five-minute poll, "TURN/m" would read as a
 * per-minute figure five times smaller than the number beside it.
 */
export function columnsFor(state) {
  const rate = state.rateLabel ?? '/m';
  const spanMinutes = 12 * (state.pollMinutes ?? 1);
  const spanLabel = spanMinutes >= 120 ? `${Math.round(spanMinutes / 60)}h` : `${spanMinutes}m`;

  // A column with a `total` draws the TOTAL row's cell with it instead of
  // `value`. Every other column draws its total through `value` itself, from
  // `totalsOf()`'s row-shaped sums - so a losing total is red by the same
  // helper that paints a losing game, and a dash means "unmeasured" in both.
  return [
    { key: 'name', title: 'GAME', width: 18, align: 'left', priority: 1, value: (r) => r.name, total: (t, w) => `${C.bold}${totalLabel(t.games, t.of, w)}${C.reset}` },
    { key: 'online', title: 'NOW', width: 4, align: 'right', priority: 4, value: (r) => (r.online === null ? '-' : int(r.online)) },
    { key: 'count', title: 'BETS', width: 8, align: 'right', priority: 11, value: (r) => intOrDash(r.count) },
    { key: 'dCount', title: `BETS${rate}`, width: 8, align: 'right', priority: 8, value: (r) => intSigned(r.dCount) },
    // Blank, not a dash: a dash says nobody measured it, and the truth is that
    // one player on two games counts in both, so no sum of this column is real.
    { key: 'unique', title: 'PLAYERS', width: 8, align: 'right', priority: 13, value: (r) => intOrDash(r.unique), total: () => '' },
    { key: 'turnover', title: 'TURNOVER', width: 12, align: 'right', priority: 2, value: (r) => formatUsd(r.turnoverUsd) },
    { key: 'dTurnover', title: `TURN${rate}`, width: 11, align: 'right', priority: 5, value: (r) => formatUsdSigned(r.dTurnoverUsd) },
    { key: 'profit', title: 'PROFIT', width: 11, align: 'right', priority: 3, value: (r) => money(r.profitUsd) },
    { key: 'dProfit', title: `PROFIT${rate}`, width: 12, align: 'right', priority: 7, value: (r) => moneySigned(r.dProfitUsd) },
    { key: 'dayProfit', title: 'DAY PROFIT', width: 11, align: 'right', priority: 6, value: (r) => moneySigned(r.dayProfitUsd) },
    { key: 'dayTurnover', title: 'DAY TURN', width: 11, align: 'right', priority: 9, value: (r) => formatUsd(r.dayTurnoverUsd) },
    { key: 'expected', title: 'EXPECTED', width: 10, align: 'right', priority: 12, value: (r) => formatUsd(r.expectedUsd) },
    { key: 'rtp', title: 'RTP', width: 7, align: 'right', priority: 10, value: (r) => (r.rtp === null ? '-' : `${r.rtp.toFixed(2)}%`) },
    { key: 'spark', title: spanLabel, width: 12, align: 'right', priority: 14, value: (r, w) => sparkline(r.spark, w), total: () => '' },
  ];
}

/**
 * "TOTAL (10 games)", or "TOTAL (1 of 10 games)" when `of` - the whole
 * roster - says a filter is narrowing it, so a filtered total is never
 * mistaken for the roster's.
 *
 * Given a `width`, the longest form that fits: the terminal's GAME column is
 * 18 wide, and a label cut mid-word reads worse than a shorter one. The noun
 * goes first; the "of" goes last, because it is the part that matters.
 */
export function totalLabel(games, of = null, width = Infinity) {
  const noun = (n) => `game${n === 1 ? '' : 's'}`;
  const forms = of === null
    ? [`TOTAL (${games} ${noun(games)})`, `TOTAL (${games})`, 'TOTAL']
    : [`TOTAL (${games} of ${of} ${noun(of)})`, `TOTAL (${games} of ${of})`, `TOTAL ${games}/${of}`, 'TOTAL'];
  return forms.find((f) => f.length <= width) ?? forms.at(-1);
}

/**
 * Rows the filter lets through: a case-insensitive substring match on the
 * slug. Never on `label` - the slug is the one thing every game and every
 * key on this dashboard agrees to call it by, and `app.mjs`'s `gameNames()`
 * (which the cursor moves through) matches the same field the same way, so
 * the visible table and the reachable cursor can never disagree.
 */
export function filterRows(rows, filter) {
  const needle = (filter ?? '').trim().toLowerCase();
  return needle ? rows.filter((r) => r.name.toLowerCase().includes(needle)) : rows;
}

/**
 * @param {number} budget the lines the frame set aside for game rows - a
 *   target, and one the frame does not always keep (see `fitLines`).
 * @param {number} fitLines how many lines, counting from this table's first,
 *   survive before the frame is cut at the terminal's height. The TOTAL line
 *   is drawn inside it whatever `budget` says.
 */
export function renderRoster(state, box, width, budget, fitLines = Infinity) {
  const nav = state.nav ?? {};
  const filterText = (nav.filter ?? '').trim();
  const rows = filterRows(state.rows, filterText);

  const columns = fit(columnsFor(state), width - 4);
  const lines = [];

  // Shown whenever a filter is applied, typing or not - an applied filter
  // must never be mistaken for a roster that is simply short. Cannot key off
  // `nav.filtering` alone: once Enter closes the prompt the filter (and the
  // narrowed table) both persist, and the count-hidden line is exactly the
  // thing that has to survive that moment.
  if (filterText) {
    const hidden = state.rows.length - rows.length;
    lines.push(box.line(
      `${C.yellow}filter "${filterText}"${C.reset} ${C.dim}- showing ${rows.length} of ${state.rows.length} game${state.rows.length === 1 ? '' : 's'} (${hidden} hidden, esc clears)${C.reset}`,
    ));
  }

  lines.push(box.line(`${C.bold}${row(columns, (c) => c.title)}${C.reset}`));

  if (filterText && !rows.length) {
    lines.push(box.line(`${C.dim}no games match "${filterText}"${C.reset}`));
    return lines;
  }

  if (!rows.length) return lines;

  // TOTAL is the table's last line, and the one that must never be cut. It
  // comes out of the row budget, so on a short terminal one more game goes
  // into "... N more" rather than the total falling off the bottom.
  const sorted = [...rows].sort((a, b) => (b[state.sort] ?? 0) - (a[state.sort] ?? 0));
  let shown = Math.min(sorted.length, Math.max(0, budget - 1));

  // `budget` alone does not keep it on screen: renderFrame floors the budget
  // at 4 however short the terminal is, and counts neither the filter line
  // nor "... N more" in it. Against the real edge, the game rows give way
  // first, then "... N more", and TOTAL last.
  const room = fitLines - lines.length - 1;
  if (shown + (shown < sorted.length ? 1 : 0) > room) shown = Math.max(0, room - 1);

  for (const r of sorted.slice(0, shown)) {
    lines.push(box.line(row(columns, (c) => c.value(r, c.width))));
  }
  if (sorted.length > shown && lines.length + 1 < fitLines) {
    lines.push(box.line(`${C.dim}... ${sorted.length - shown} more${C.reset}`));
  }

  // Every row the table represents, cut-off games included - the ones behind
  // "... N more" are still on the roster. Drawn through the same fitted
  // columns as the header, so a narrow terminal drops the same cells from it.
  const total = { ...totalsOf(rows), games: rows.length, of: filterText ? state.rows.length : null };
  lines.push(box.line(row(columns, (c) => (c.total ?? c.value)(total, c.width))));
  return lines;
}
