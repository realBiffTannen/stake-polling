import { ACTION } from './keymap.mjs';
import { nextBucket } from '../buckets.mjs';

/**
 * The whole navigation model, as a pure reducer.
 *
 * `nav` holds the SELECTED SLUG, never a row index. The roster re-sorts under
 * the cursor every time the sort changes or a game overtakes another, and an
 * index would silently point at a different game afterwards.
 */

export const LEVEL = Object.freeze({
  ROSTER: 'roster',
  GAME: 'game',
  MODE: 'mode',
  COMPARE: 'compare',
  DAILY: 'daily',
});

export const TABS = Object.freeze(['health', 'live', 'today', 'buckets']);
export const SORTS = Object.freeze(['turnover', 'dTurnover', 'profit', 'count', 'name']);

const TAB_BY_ACTION = {
  [ACTION.TAB_1]: 'health',
  [ACTION.TAB_2]: 'live',
  [ACTION.TAB_3]: 'today',
  [ACTION.TAB_4]: 'buckets',
};

export function initialNav() {
  return {
    level: LEVEL.ROSTER,
    game: null,
    mode: null,
    tab: TABS[0],
    compareMode: null,
    filter: '',
    filtering: false,
    frozen: false,
    bucket: null,
    sort: 'turnover',
    showAlerts: true,
    help: false,
  };
}

/** Per-mode trails double the per-frame read count; only pay when drawn. */
export function needsModeTrail(nav) {
  return nav.level === LEVEL.GAME || nav.level === LEVEL.MODE;
}

/**
 * The daily view reads the trail as far back as it is kept - a month of
 * samples per game, against the one day every other view needs. Only pay for
 * that while it is the thing on screen.
 */
export function needsDailyTrail(nav) {
  return nav.level === LEVEL.DAILY;
}

/** Where a selected item sits in the list as currently ordered, or -1. */
export function cursorIndex(list, selected) {
  return selected === null || selected === undefined ? -1 : (list ?? []).indexOf(selected);
}

/**
 * Apply `nav.sort` to a list of rows that already arrive in their view's own
 * canonical order (mode rows: BASE-first-then-alphabetical; compare rows:
 * roster order).
 *
 * `SORTS[0]` (`initialNav`'s default) is the sentinel for "the user has not
 * pressed `s` yet" - canonical order stays canonical rather than being
 * re-sorted by a field nobody actually chose. Once `s` moves off that
 * sentinel, this sorts descending by the named field, mirroring
 * `views/roster.mjs`'s own comparator - the same `?? 0` treats a row that
 * does not carry the chosen field (a mode row has no `name`, a compare row
 * has no `name` either) as tied rather than throwing, so cycling onto a key
 * a row shape does not have is a harmless no-op, not a crash.
 */
export function sortByNav(rows, sort) {
  if (!sort || sort === SORTS[0]) return rows;
  return [...rows].sort((a, b) => (b[sort] ?? 0) - (a[sort] ?? 0));
}

export function reduce(nav, action, context = {}) {
  const games = context.games ?? [];
  const modes = context.modes ?? [];
  const page = Math.max(1, context.pageSize ?? 10);

  // Typing into the filter prompt swallows everything except the keys that
  // close it, or `/foo` would start cycling sorts halfway through a word.
  if (nav.filtering) return filtering(nav, action);

  switch (action) {
    case ACTION.UP: return step(nav, -1, games, modes);
    case ACTION.DOWN: return step(nav, 1, games, modes);
    case ACTION.PAGE_UP: return step(nav, -page, games, modes);
    case ACTION.PAGE_DOWN: return step(nav, page, games, modes);
    case ACTION.HOME: return jump(nav, 0, games, modes);
    case ACTION.END: return jump(nav, -1, games, modes);

    case ACTION.ENTER: return descend(nav, games, modes);
    // Backspace (ACTION.ERASE) ascends just like Escape (ACTION.BACK) outside
    // the filter prompt - it is only inside `filtering()` below that the two
    // diverge (cancel vs. edit).
    case ACTION.BACK:
    case ACTION.ERASE:
      return ascend(nav);

    case ACTION.TAB_NEXT: return cycleTab(nav, 1, games);
    case ACTION.TAB_PREV: return cycleTab(nav, -1, games);

    case ACTION.TAB_1:
    case ACTION.TAB_2:
    case ACTION.TAB_3:
    case ACTION.TAB_4: {
      const opened = nav.level === LEVEL.ROSTER
        ? { ...nav, level: LEVEL.GAME, game: nav.game ?? games[0] ?? null }
        : nav;
      if (!opened.game) return nav;
      return { ...opened, tab: TAB_BY_ACTION[action] };
    }

    case ACTION.COMPARE:
      return { ...nav, level: LEVEL.COMPARE, compareMode: nav.compareMode ?? modes[0] ?? null };

    // Closes the help overlay too: `renderFrame` draws help over every level,
    // so leaving it open would make the key look dead.
    case ACTION.DAILY: return { ...nav, level: LEVEL.DAILY, help: false };

    case ACTION.MODE_NEXT: return stepCompare(nav, 1, modes);
    case ACTION.MODE_PREV: return stepCompare(nav, -1, modes);

    case ACTION.GAME_CYCLE: return cycleGame(nav, games);

    case ACTION.BUCKET_CYCLE: {
      const bucket = nextBucket(nav.bucket);
      const game = nav.game ?? games[0] ?? null;
      if (!bucket) return { ...nav, bucket: null };
      return { ...nav, bucket, game, tab: 'buckets', level: nav.level === LEVEL.ROSTER ? LEVEL.GAME : nav.level };
    }

    case ACTION.SORT:
      return { ...nav, sort: SORTS[(SORTS.indexOf(nav.sort) + 1) % SORTS.length] };

    case ACTION.ALERTS: return { ...nav, showAlerts: !nav.showAlerts };
    case ACTION.FREEZE: return { ...nav, frozen: !nav.frozen };
    case ACTION.HELP: return { ...nav, help: !nav.help };
    case ACTION.FILTER: return { ...nav, filtering: true, help: false };
    case ACTION.REFRESH: return { ...nav };

    default:
      if (action && action.type === 'text') return nav; // only meaningful while filtering
      return nav;
  }

  function cycleTab(current, by, list) {
    const opened = current.level === LEVEL.ROSTER
      ? { ...current, level: LEVEL.GAME, game: current.game ?? list[0] ?? null }
      : current;
    const at = TABS.indexOf(opened.tab);
    return { ...opened, tab: TABS[(at + by + TABS.length) % TABS.length] };
  }
}

/**
 * Keys that mean something while the filter prompt is open.
 *
 * Escape (ACTION.BACK) cancels outright - the filter reverts to empty, not to
 * whatever was typed before Escape landed, since there is no "before" a
 * fresh `/` didn't already clear. Backspace (ACTION.ERASE) edits in place: a
 * typo must not force starting the whole filter over.
 */
function filtering(nav, action) {
  if (action === ACTION.ENTER) return { ...nav, filtering: false };
  if (action === ACTION.BACK) return { ...nav, filtering: false, filter: '' };
  if (action === ACTION.ERASE) return { ...nav, filter: nav.filter.slice(0, -1) };
  if (action && action.type === 'text') return { ...nav, filter: `${nav.filter}${action.text}` };
  return nav;
}

function activeList(nav, games, modes) {
  return nav.level === LEVEL.GAME || nav.level === LEVEL.MODE ? modes : games;
}

function selected(nav) {
  return nav.level === LEVEL.GAME || nav.level === LEVEL.MODE ? nav.mode : nav.game;
}

function select(nav, value) {
  return nav.level === LEVEL.GAME || nav.level === LEVEL.MODE
    ? { ...nav, mode: value }
    : { ...nav, game: value };
}

/**
 * Move by `by`, clamped at both ends.
 *
 * Clamping rather than wrapping: a list you read top to bottom should tell you
 * where its end is, and a wrap at the bottom reads as "nothing happened".
 */
function step(nav, by, games, modes) {
  const list = activeList(nav, games, modes);
  if (!list.length) return nav;
  const at = cursorIndex(list, selected(nav));
  const next = at === -1 ? (by > 0 ? 0 : list.length - 1) : clamp(at + by, 0, list.length - 1);
  return select(nav, list[next]);
}

function jump(nav, to, games, modes) {
  const list = activeList(nav, games, modes);
  if (!list.length) return nav;
  return select(nav, to === -1 ? list[list.length - 1] : list[0]);
}

function descend(nav, games, modes) {
  if (nav.level === LEVEL.ROSTER) {
    const game = nav.game ?? games[0] ?? null;
    return game ? { ...nav, level: LEVEL.GAME, game, tab: nav.tab ?? TABS[0] } : nav;
  }
  if (nav.level === LEVEL.GAME) {
    const mode = nav.mode ?? modes[0] ?? null;
    return mode ? { ...nav, level: LEVEL.MODE, mode } : nav;
  }
  return nav;
}

function ascend(nav) {
  if (nav.help) return { ...nav, help: false };
  if (nav.level === LEVEL.MODE) return { ...nav, level: LEVEL.GAME, mode: null };
  if (nav.level === LEVEL.GAME) return { ...nav, level: LEVEL.ROSTER, mode: null, bucket: null };
  if (nav.level === LEVEL.COMPARE) return { ...nav, level: LEVEL.ROSTER };
  if (nav.level === LEVEL.DAILY) return { ...nav, level: LEVEL.ROSTER };
  if (nav.filter) return { ...nav, filter: '' };
  return nav;
}

/**
 * `g` keeps its old behaviour: step the roster selection without descending.
 *
 * Bet modes are per-game, so a mode selected under the previous game must not
 * survive the move - it would point at a mode the new game may not run at
 * all, and the mode card would wrongly read as empty. `level` and `tab` are
 * deliberately preserved: stepping to the next game on the same tab is
 * exactly what someone holding `g` wants.
 */
function cycleGame(nav, games) {
  if (!games.length) return nav;
  const at = cursorIndex(games, nav.game);
  return { ...nav, game: games[(at + 1) % games.length], mode: null };
}

function stepCompare(nav, by, modes) {
  if (!modes.length) return nav;
  const at = modes.indexOf(nav.compareMode);
  const next = at === -1 ? 0 : (at + by + modes.length) % modes.length;
  return { ...nav, compareMode: modes[next] };
}

function clamp(n, lo, hi) {
  return Math.min(hi, Math.max(lo, n));
}
