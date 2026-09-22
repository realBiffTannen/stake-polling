import { C, utcClock, moneySigned } from '../format.mjs';
import { DEFAULT_MONEY, toShareUsd, formatUsdSigned } from '../../money.mjs';
import { fit, row } from '../layout.mjs';

/**
 * Profit per accounting day, one row per day, beside each game.
 *
 * The header's "day since <boundary>" line is the day in progress; this is
 * that figure for every day the trail reaches. A day runs from the boundary
 * hour to the same hour the next day, so unless the boundary is midnight it
 * straddles two calendar dates - each row is labelled with both, because
 * "09-16" alone would not say which boundary it means.
 *
 * `state.daily` is `dailyTable()`'s result, assembled in `app.mjs`'s `#read()`
 * and only while this view is open. Figures arrive raw, like the bucket
 * table's, and are reduced to the studio's share here.
 */
export function renderDaily(state, box, width, budget) {
  const table = state.daily;
  const lines = [box.line(`${C.bold}daily profit${C.reset}   ${C.dim}${windowLabel(state)}, newest first${C.reset}`)];

  if (!table?.rows?.length) {
    lines.push(box.line(`${C.dim}${EMPTY}${C.reset}`));
    return lines;
  }

  const columns = fit(dailyColumns(table, state.money ?? DEFAULT_MONEY), width - 4);
  lines.push(box.line(`${C.bold}${row(columns, (c) => c.title)}${C.reset}`));

  // The header and the titles come out of the budget; so does the overflow
  // line, when there is one - a table that ends mid-month has to say so.
  const room = Math.max(1, budget - 2);
  const shown = table.rows.length > room ? Math.max(1, room - 1) : table.rows.length;
  for (const day of table.rows.slice(0, shown)) lines.push(box.line(row(columns, (c) => c.value(day))));

  const hidden = table.rows.length - shown;
  if (hidden > 0) lines.push(box.line(`${C.dim}... ${hidden} older day${hidden === 1 ? '' : 's'}${C.reset}`));
  return lines;
}

/** The same table for a pipe: no escapes, and every game rather than the ones that fit. */
export function renderDailyPlain(state) {
  const table = state.daily;
  const out = [`DAILY PROFIT  ${windowLabel(state)} (UTC), newest first`];

  if (!table?.rows?.length) {
    out.push(EMPTY);
    return out;
  }

  const money = state.money ?? DEFAULT_MONEY;
  // Sized to the slug, like the piped bucket table: a game name is wider than
  // any money figure, and a column sized to the figure runs into its neighbour.
  const widthOf = (slug) => Math.max(14, slug.length + 2);
  const cell = (value, w) => formatUsdSigned(toShareUsd(value, money.profitShare, money)).padStart(w);

  out.push(['DAY'.padEnd(DAY_WIDTH), 'TOTAL'.padStart(14), ...table.games.map((g) => g.padStart(widthOf(g)))].join(''));
  for (const day of table.rows) {
    out.push([
      dayLabel(day).padEnd(DAY_WIDTH),
      cell(day.total, 14),
      ...table.games.map((g) => cell(day.byGame[g], widthOf(g))),
    ].join(''));
  }
  return out;
}

const EMPTY = 'no daily trail yet - days fill in as the poller runs';

// "09-16 -> 09-17 partial" is the widest label there is.
const DAY_WIDTH = 22;

/** "00:00Z -> 00:00Z", from whichever boundary hour the state was built with. */
function windowLabel(state) {
  const hour = `${utcClock(state.dayFrom)}Z`;
  return `${hour} -> ${hour}`;
}

/**
 * Both dates, then what is unusual about the row: the day still being filled,
 * or one the trail only covers part of. A day in progress is not also called
 * partial - the header already says when the current window is.
 */
export function dayLabel(day, paint = false) {
  const date = (ms) => new Date(ms).toISOString().slice(5, 10);
  const span = `${date(day.from)} -> ${date(day.to)}`;
  if (day.current) return `${span} ${paint ? `${C.dim}so far${C.reset}` : 'so far'}`;
  if (day.partial) return `${span} ${paint ? `${C.yellow}partial${C.reset}` : 'partial'}`;
  return span;
}

/**
 * DAY, the whole roster, then one column per game in the order given.
 *
 * Game columns carry the lowest priority and descend left to right, so a
 * narrow terminal sheds the games from the right and never the total.
 */
function dailyColumns(table, money) {
  // `toShareUsd` keeps an unmeasured day null, and `moneySigned` draws a null
  // as a dim dash - never as a green "$0.00".
  const cell = (value) => moneySigned(toShareUsd(value, money.profitShare, money));

  return [
    { key: 'day', title: 'DAY', width: DAY_WIDTH, align: 'left', priority: 1, value: (d) => dayLabel(d, true) },
    { key: 'total', title: 'TOTAL', width: 12, align: 'right', priority: 2, value: (d) => cell(d.total) },
    ...table.games.map((slug, i) => ({
      key: `game:${slug}`,
      title: slug,
      width: Math.max(12, Math.min(16, slug.length + 1)),
      align: 'right',
      priority: 3 + i,
      value: (d) => cell(d.byGame[slug]),
    })),
  ];
}
