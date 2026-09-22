import { C, int, intSigned, clock, utcClock, humanAge, money, moneySigned } from './format.mjs';
import { toUsd, toShareUsd, formatUsd, formatUsdSigned, DEFAULT_MONEY } from '../money.mjs';
import { boxer } from './layout.mjs';
import { buildState, dayTotals, rosterTotals } from './state.mjs';
import { LEVEL } from './nav.mjs';
import { renderRoster } from './views/roster.mjs';
import { renderBuckets } from './views/buckets.mjs';
import { renderGame } from './views/game.mjs';
import { renderMode } from './views/mode.mjs';
import { renderCompare } from './views/compare.mjs';
import { renderDaily } from './views/daily.mjs';
import { renderPlain } from './views/plain.mjs';

export { buildState, renderPlain };

/**
 * Render one frame as an array of lines, each at most `cols` wide.
 *
 * Returns lines rather than writing them so the layout can be asserted in a
 * test and so the app can diff frames before touching the terminal.
 */
export function renderFrame(state, { cols = 80, rows = 24 } = {}) {
  const width = Math.max(28, cols);
  const out = [];
  const box = boxer(width);
  const nav = state.nav;

  out.push(box.top(
    `${C.bold}${state.meta?.team ?? 'roster'}${C.reset}`,
    nav.frozen ? `${C.yellow}FROZEN${C.reset} ${clock(state.now)}` : clock(state.now),
  ));

  const age = state.ageMs === null ? 'never' : humanAge(state.ageMs);
  const ageText = state.stale ? `${C.red}STALE ${age}${C.reset}` : `${C.dim}poll ${age} ago${C.reset}`;
  const totals = rosterTotals(state);
  out.push(box.line(`online ${C.cyan}${int(state.online)}${C.reset}   turnover ${formatUsd(totals.turnover)}   profit ${money(totals.profit)}   ${ageText}`));
  out.push(box.line(`${C.dim}position ${formatUsd(state.team)}   carry ${formatUsd(state.carry)}${C.reset}`));

  const day = dayTotals(state);
  const since = `${new Date(state.dayFrom).toISOString().slice(11, 16)}Z`;
  const partial = !state.dayCoverage?.partial
    ? ''
    : state.dayCoverage.fromTs
      ? ` ${C.yellow}(partial - trail starts ${new Date(state.dayCoverage.fromTs).toISOString().slice(11, 16)}Z)${C.reset}`
      : ` ${C.yellow}(no trail in this window yet)${C.reset}`;
  out.push(box.line(`day since ${since}   bets ${intSigned(day.count)}   turnover ${formatUsd(day.turnover)}   profit ${money(day.profit)}${partial}`));
  out.push(box.line(`${C.dim}sid ${state.meta?.auth_state ?? 'unknown'} (${state.meta?.sid_source || 'n/a'} ${state.meta?.sid_fingerprint || ''})   aof ${state.meta?.persistence ?? 'unknown'}${C.reset}`));

  if (state.meta?.auth_state === 'expired') {
    out.push(box.line(`${C.redBg} SID EXPIRED - polling paused, put a new sid in .sid ${C.reset}`));
  }

  out.push(box.rule());

  // Shown regardless of level: `/` is reachable from any screen (nav.mjs does
  // not gate ACTION.FILTER on nav.level), and `reduce()` deliberately swallows
  // every keystroke except Enter/Backspace/Escape while `nav.filtering` is
  // true - without this line that swallowing looks exactly like a hang,
  // whichever view happened to be open when `/` was pressed.
  if (nav.filtering) {
    out.push(box.line(`${C.bold}${C.cyan}filter:${C.reset} ${nav.filter}${C.bold}_${C.reset}   ${C.dim}(enter applies, esc cancels)${C.reset}`));
  }

  const budget = Math.max(4, rows - out.length - alertHeight(state) - 2);

  if (nav.help) {
    out.push(...renderHelp(box, state));
  } else if (nav.level === LEVEL.COMPARE) {
    out.push(...renderCompare(state, box, width, budget));
  } else if (nav.level === LEVEL.DAILY) {
    out.push(...renderDaily(state, box, width, budget));
  } else if (nav.level === LEVEL.MODE) {
    out.push(...renderMode(state, box, width, budget));
  } else if (nav.level === LEVEL.GAME) {
    out.push(...renderGame(state, box, width, budget));
  } else if (!state.rows.length) {
    out.push(box.line(`${C.dim}waiting for the first poll...${C.reset}`));
  } else {
    // The lines left before `slice` below cuts the frame. `budget` can
    // overshoot them on a short terminal, and the roster's TOTAL line - its
    // last - is the one line of that table that must never be the one cut.
    out.push(...renderRoster(state, box, width, budget, Math.max(3, rows) - out.length));
  }

  if (state.showAlerts && state.events?.length) {
    out.push(box.rule('POSSIBLE EVENTS'));
    for (const event of state.events.slice(0, 3)) {
      const colour = event.confidence === 'high' ? C.red : event.confidence === 'medium' ? C.yellow : C.dim;
      out.push(box.line(`${colour}${event.title.toUpperCase()}${C.reset} ${C.bold}${event.game}${C.reset} ${C.dim}(${event.confidence}, ${event.findings} finding${event.findings === 1 ? '' : 's'}, since ${clock(event.since)})${C.reset}`));
      out.push(box.line(`  ${event.description}`));
    }
  }

  if (state.showAlerts && state.summaries?.length) {
    out.push(box.rule(`RUNNING ACTION (${state.summaryMinutes ?? state.pollMinutes ?? 5} min)`));
    for (const entry of state.summaries.slice(0, 4)) {
      out.push(box.line(summaryLine(entry, state.money)));
    }
  }

  if (state.showAlerts && state.alerts.length) {
    out.push(box.rule('FINDINGS'));
    for (const alert of state.alerts.slice(0, alertHeight(state) - 1)) {
      const colour = alert.severity === 'crit' ? C.red : C.yellow;
      out.push(box.line(`${C.dim}${clock(alert.ts)}${C.reset} ${colour}${(alert.severity ?? '').padEnd(4)}${C.reset} ${alert.message ?? ''}`));
    }
  }

  // `? help` sits second, not last: the footer is wider than an 80-column
  // terminal, and the hint that leads to every other binding must not be the
  // first thing clipped.
  out.push(box.bottom(`${C.dim}q quit  ? help  ↑↓ move  ↵ open  ← back  1-4 tabs  c compare  d daily  / filter  f freeze${C.reset}`));
  return out.slice(0, Math.max(3, rows));
}

/** The `?` key overlay: every binding, drawn with the same pane helpers as everything else. */
function renderHelp(box, state) {
  const bind = (key, desc) => box.line(`${C.bold}${key.padEnd(22)}${C.reset} ${desc}`);
  // The boundary is configurable (`dayBoundaryUtcHour`), so the help names
  // whichever hour this state was actually built with.
  const hour = Number.isFinite(state?.dayFrom) ? `${utcClock(state.dayFrom)}Z` : null;
  return [
    box.rule('HELP'),
    bind('q, ctrl-c', 'quit'),
    bind('↑/↓, k/j', 'move the selection'),
    bind('→, enter', 'open / descend'),
    bind('←, esc, backspace', 'back / ascend'),
    bind('home/end', 'jump to the top or bottom of the list'),
    bind('page up/down', 'move a page at a time'),
    bind('1 2 3 4', 'jump to a tab (health/live/today/buckets)'),
    bind('tab, shift-tab', 'cycle tabs'),
    bind('g', 'cycle to the next game, in place'),
    bind('h', 'cycle the bucket size (5m / 1h)'),
    bind('[ / ]', 'step the bet mode being compared'),
    bind('c', 'compare a bet mode across every game'),
    bind('d', hour ? `daily profit, one row per ${hour}-to-${hour} accounting day` : 'daily profit, one row per accounting day'),
    bind('s', 'cycle the roster sort'),
    bind('a', 'toggle alerts / findings'),
    bind('/', 'filter the roster by name'),
    bind('f', 'freeze the screen'),
    bind('r', 'refresh now'),
    bind('?', 'toggle this help'),
  ];
}

function alertHeight(state) {
  if (!state.showAlerts) return 0;
  const events = state.events?.length ? Math.min(3, state.events.length) * 2 + 1 : 0;
  const summaries = state.summaries?.length ? Math.min(4, state.summaries.length) + 1 : 0;
  const findings = state.alerts?.length ? Math.min(4, state.alerts.length + 1) : 0;
  return events + summaries + findings;
}

// --- formatting ----------------------------------------------------------

/** One line of the running action log. */
function summaryLine(entry, money = DEFAULT_MONEY) {
  const at = clock(Number(entry.to));
  const bets = intSigned(entry.count);
  const turnover = formatUsdSigned(toUsd(entry.turnover, money));
  const profit = toShareUsd(entry.profit, money.profitShare, money);
  const mover = entry.topMover ? ` top ${entry.topMover}` : '';
  const fired = Number(entry.alerts) > 0 ? ` ${C.yellow}${entry.alerts} finding${Number(entry.alerts) === 1 ? '' : 's'}${C.reset}` : '';
  return `${C.dim}${at}${C.reset} bets ${bets}  turnover ${turnover}  profit ${moneySigned(profit)}  ${C.dim}${entry.activeGames} active${mover}${C.reset}${fired}`;
}
