import { readDashboard, readTrails, readGameTrailsSince } from '../store/reader.mjs';
import { buildState } from './state.mjs';
import { renderFrame, renderPlain } from './render.mjs';
import { minutesSince } from '../window.mjs';
import { decode, ACTION } from './keymap.mjs';
import { initialNav, reduce, needsModeTrail, needsDailyTrail, LEVEL, TABS } from './nav.mjs';
import { dailyTable, dailyReadFrom } from '../daily.mjs';
import { buildModeRows } from './mode-rows.mjs';
import { loadMathModel } from './math.mjs';
import { listOf, idOf, mergeSlugs } from '../games.mjs';

const ESC = String.fromCharCode(27);
const ALT_SCREEN_ON = `${ESC}[?1049h${ESC}[?25l`;
const ALT_SCREEN_OFF = `${ESC}[?25h${ESC}[?1049l`;
const HOME = `${ESC}[H`;
const CLEAR_LINE = `${ESC}[K`;

const REPAINT_MS = 1000;

// The captured math model lives at the project root, two directories up from
// this file - resolved from this module's own URL rather than `config.root`
// so a test that constructs the app with a bare `{ detect, pollMinutes }`
// config still gets a working model instead of a crash.
const MATH_MODEL_PATH = new URL('../../math.json', import.meta.url).pathname;

/**
 * The dashboard process.
 *
 * It reads; it never writes. Everything it shows comes out of Redis, so it can
 * be killed and restarted at any point without costing the trail a sample, and
 * two of them can watch the same poller at once.
 */
export class DashboardApp {
  constructor({ client, keys, config }) {
    this.client = client;
    this.keys = keys;
    this.config = config;
    this.state = null;
    this.nav = initialNav();
    this.pending = '';
    // Loaded once, not per frame: it never changes while the process runs,
    // and re-reading + re-parsing it on every repaint would be pure waste.
    this.mathModel = loadMathModel(MATH_MODEL_PATH);
    this.lastFrame = '';
    this.running = false;
    // The last daily table built, and what it was built from - see #readDaily.
    this.dailyCache = null;
  }

  // `bin/stake-dash.mjs` sets `app.bucket`/`app.focus` before the first read
  // (the flag path, still the only way to reach the bucket view from a pipe
  // until Task 13). These write through to `nav` so that keeps working
  // unchanged even though `nav` is now the only field actually stored.
  //
  // Setting either one to a real value has to raise `nav.level` to GAME too,
  // not just stash the slug/size - `needsModeTrail()` and the render dispatch
  // both gate on `nav.level`, not on whether `game`/`bucket` happen to be set.
  // Without this, `--bucket 1h --game pixel-carnivals` left `nav.level` at
  // ROSTER: the per-mode trail was never fetched, and the bucket table
  // rendered forever from the game-level trail alone, silently missing every
  // per-mode column. Clearing either one back to null must NOT itself change
  // the level - that would make escaping the flag path re-descend.
  get focus() { return this.nav.game; }

  set focus(v) {
    this.nav = v == null
      ? { ...this.nav, game: null }
      : { ...this.nav, game: v, level: LEVEL.GAME };
  }

  get bucket() { return this.nav.bucket; }

  set bucket(v) {
    this.nav = v == null
      ? { ...this.nav, bucket: null }
      : { ...this.nav, bucket: v, level: LEVEL.GAME, tab: 'buckets' };
  }

  /** One-shot plain text, for a pipe or a redirect. */
  async snapshot() {
    return renderPlain(await this.#read());
  }

  /**
   * Map a `--view` name (plus an optional `--game`/`--mode`) onto `nav` in
   * one atomic update - `bin/stake-dash.mjs`'s flag-driven equivalent of
   * pressing a key.
   *
   * Every branch raises `nav.level` itself (and `nav.tab` for the four
   * per-game tabs), never just stashes the game/mode slug - `needsModeTrail()`
   * and `renderPlain`'s own dispatch both gate on `nav.level`, exactly the
   * trap `set focus`/`set bucket` above were fixed for: leaving the level at
   * ROSTER while only the slug moved silently dropped the per-mode trail
   * (`modes: false`) and every column that depends on it.
   *
   * `game`/`mode` of `null` clear the slug without touching the level -
   * matching `set focus`/`set bucket`'s own "clearing must not itself
   * ascend or descend" contract - while `undefined` (the key simply absent)
   * leaves whatever slug `nav` already had alone.
   */
  setView({ view, game, mode } = {}) {
    let nav = this.nav;

    if (game !== undefined) {
      nav = game == null ? { ...nav, game: null } : { ...nav, game, level: LEVEL.GAME };
    }

    if (view === LEVEL.ROSTER) {
      nav = { ...nav, level: LEVEL.ROSTER };
    } else if (TABS.includes(view)) {
      nav = { ...nav, level: LEVEL.GAME, tab: view };
    } else if (view === 'mode') {
      nav = { ...nav, level: LEVEL.MODE, mode: mode ?? nav.mode };
    } else if (view === 'compare') {
      nav = { ...nav, level: LEVEL.COMPARE, compareMode: mode ?? nav.compareMode };
    } else if (view === LEVEL.DAILY) {
      nav = { ...nav, level: LEVEL.DAILY };
    }

    this.nav = nav;
  }

  async run() {
    this.running = true;
    this.#enterAltScreen();
    this.#bindKeys();
    await this.#subscribe();

    while (this.running) {
      await this.#paint();
      await this.#waitForRepaint();
    }
    this.#exitAltScreen();
  }

  stop() {
    this.running = false;
    this.wake?.();
  }

  /** Decode a chunk of stdin and apply it. Public so it can be tested without a TTY. */
  handleInput(chunk) {
    // Snapshotted BEFORE decoding: whether this chunk should be read as the
    // filter prompt depends on the mode we were already in, not on anything
    // the chunk itself contains yet - `decode()` needs to know it up front to
    // treat a bound letter like `c` or `g` as literal text instead of firing
    // COMPARE/GAME_CYCLE while a filter is open.
    const capturingText = this.nav.filtering;
    const { actions, pending, text } = decode(chunk, this.pending, { capturingText });
    this.pending = pending;

    const context = { games: this.gameNames(), modes: this.modeNames(), pageSize: this.#pageSize() };
    const applyText = () => {
      if (text !== undefined) this.nav = reduce(this.nav, { type: 'text', text }, context);
    };

    // Order matters whenever one chunk carries both text and an action - a
    // paste can. Opening the prompt (`/`) must run BEFORE the text that
    // follows it in the same paste, or that text has nowhere to land yet.
    // Text typed while ALREADY filtering must run BEFORE a closing action
    // (Enter/Escape) arriving in the same chunk, or the close fires against
    // an empty filter and the text is dropped on the floor. `capturingText`
    // (the mode BEFORE this chunk) is exactly the flag that tells the two
    // cases apart.
    if (capturingText) applyText();

    for (const action of actions) {
      if (action === ACTION.QUIT) { this.stop(); return; }
      this.nav = reduce(this.nav, action, context);
    }

    if (!capturingText) applyText();

    this.lastFrame = '';
    this.wake?.();
  }

  needsModeTrail() {
    return needsModeTrail(this.nav);
  }

  /** Mode names for the focused game, in canonical order. */
  modeNames() {
    return (this.state?.modeRows ?? []).map((r) => r.mode);
  }

  /**
   * Game slugs in the order the roster table is currently showing them.
   *
   * Filtered exactly the way `views/roster.mjs` filters the table it draws
   * from the same `nav.filter` - a substring match on the slug, case
   * insensitive - or the cursor could land on a row the roster is not
   * actually showing, which is a worse trap than the filter having no cursor
   * effect at all.
   */
  gameNames() {
    const needle = (this.nav.filter ?? '').trim().toLowerCase();
    return [...(this.state?.rows ?? [])]
      .filter((r) => !needle || r.name.toLowerCase().includes(needle))
      .sort((a, b) => (b[this.nav.sort] ?? 0) - (a[this.nav.sort] ?? 0))
      .map((r) => r.name);
  }

  /**
   * An approximate page size for page-up/page-down, absent a TTY to measure.
   * The exact number of visible rows depends on the alert pane's height,
   * which is only known once a frame is actually laid out; this trades that
   * precision for something that never requires a render pass just to decode
   * a keypress.
   */
  #pageSize() {
    return Math.max(1, (process.stdout.rows || 24) - 12);
  }

  async #read() {
    const now = Date.now();
    const dashboard = await readDashboard(this.client, this.keys, 50);
    const names = dashboard.gameNames ?? [];

    // Enough trail to cover the accounting day as well as the detector's
    // window - "profit since the day boundary" needs up to a full day of
    // samples, not the sixty minutes the sparklines use.
    const poll = this.config.pollMinutes ?? 1;
    const daySamples = Math.ceil(minutesSince(now, this.config.dayBoundaryUtcHour) / poll) + 2;
    const need = Math.min(Math.ceil(1440 / poll), Math.max(this.config.detect.window + 2, daySamples));
    // Per-mode trails are only read when something is going to draw them: they
    // double the per-frame read count, and the roster table never uses them.
    const trails = await readTrails(this.client, this.keys, names, need, { modes: this.needsModeTrail() });
    const state = buildState(dashboard, trails, now, this.config);
    state.meta = { ...state.meta, team: this.config.team };

    // Every slug this dashboard has ever heard of anywhere - the live roster,
    // AND the full catalogue including dark (isLive:false) titles - used only
    // to tell a typo'd --game/--mode apart from a real game with no data yet
    // (views/plain.mjs). Deliberately wider than `names` above (the live set
    // used for per-game reads): a dark catalogue title like metro-night-run is
    // a real slug that will never appear in `names` or `state.perGame`, and
    // validating --game against either would reject that legitimate case.
    state.knownGames = mergeSlugs(
      names,
      listOf(dashboard.roster?.data).map(idOf).filter(Boolean),
      listOf(dashboard.games?.data).map(idOf).filter(Boolean),
    );

    state.nav = this.nav;
    // `views/buckets.mjs` and `views/plain.mjs` read `state.focus`/
    // `state.bucket` directly, not `state.nav` - deliberately left that way.
    // Both have to keep being set here, through the nav-backed accessors, or
    // the piped snapshot and the bucket table silently render the wrong game.
    state.focus = this.focus;
    state.bucket = this.bucket;
    state.sort = this.nav.sort;
    state.showAlerts = this.nav.showAlerts;
    state.mathModel = this.mathModel;
    // `views/compare.mjs` reads `state.config` (for its own per-game
    // `buildModeRows` calls, one per game in the roster) - without this it
    // silently fell back to DEFAULT_MONEY forever, agreeing with the rest of
    // the dashboard only by coincidence of DEFAULT_MONEY matching config.json.
    state.config = this.config;

    if (needsDailyTrail(this.nav)) state.daily = await this.#readDaily(state, dashboard.meta?.last_ok);

    // Per-mode rows are assembled once here rather than inside the view, so a
    // view stays a pure function of `state` and the assembly - which needs
    // the trail, the snapshot AND the math model - happens exactly once per
    // frame regardless of which tab is showing.
    if (this.nav.game) {
      state.modeRows = buildModeRows({
        snapshot: state.perGame?.[this.nav.game],
        modeTrail: state.modeTrails?.[this.nav.game] ?? [],
        gameRow: (state.rows ?? []).find((r) => r.name === this.nav.game),
        now,
        config: this.config,
        mathModel: this.mathModel,
        slug: this.nav.game,
      });
    }
    return state;
  }

  /**
   * The daily table, from a trail read as far back as it is kept.
   *
   * That read is a month of samples per game, against the single day every
   * other view needs - and `#read()` runs on every one-second repaint. The
   * trail only changes when the poller writes, so the table is rebuilt when
   * `last_ok` moves (a new poll), when the accounting day rolls, or when the
   * roster changes, and reused otherwise.
   *
   * Columns follow the roster's default order, biggest turnover first, so the
   * games a narrow terminal has to shed are the small ones.
   */
  async #readDaily(state, lastOk) {
    const boundaryHourUtc = this.config.dayBoundaryUtcHour ?? 12;
    const days = this.config.retention?.trailDays ?? 30;
    const games = [...state.rows].sort((a, b) => (b.turnover ?? 0) - (a.turnover ?? 0)).map((r) => r.name);

    const key = `${lastOk ?? ''}|${state.dayFrom}|${games.join(',')}`;
    if (this.dailyCache?.key === key) return this.dailyCache.table;

    const from = dailyReadFrom(state.now, { boundaryHourUtc, days });
    const trails = await readGameTrailsSince(this.client, this.keys, games, from);
    const table = dailyTable({ trails, games, now: state.now, boundaryHourUtc, days });
    this.dailyCache = { key, table };
    return table;
  }

  async #paint() {
    // Frozen: skip the read entirely so nothing about the figures on screen
    // can change under the reader, and just redraw what is already there
    // (marked as frozen by renderFrame) - unless there is nothing yet to
    // redraw, in which case the first read still has to happen.
    if (!this.nav.frozen || this.state === null) {
      try {
        this.state = await this.#read();
      } catch (err) {
        this.state = null;
        process.stdout.write(`${HOME}redis read failed: ${err?.message ?? err}${CLEAR_LINE}\n`);
        return;
      }
    }

    const size = { cols: process.stdout.columns || 80, rows: process.stdout.rows || 24 };
    const frame = renderFrame(this.state, size).map((l) => `${l}${CLEAR_LINE}`).join('\n');
    // Only repaint when something changed; a static screen should not flicker.
    if (frame === this.lastFrame) return;
    this.lastFrame = frame;
    process.stdout.write(`${HOME}${frame}\n${ESC}[J`);
  }

  /** Wake on the poller's tick, a keypress, or the one-second heartbeat. */
  #waitForRepaint() {
    return new Promise((resolve) => {
      const timer = setTimeout(resolve, REPAINT_MS);
      this.wake = () => { clearTimeout(timer); resolve(); };
    });
  }

  async #subscribe() {
    try {
      this.sub = this.client.duplicate();
      await this.sub.connect();
      await this.sub.subscribe(this.keys.chTick, () => this.wake?.());
      await this.sub.subscribe(this.keys.chAlerts, () => this.wake?.());
    } catch {
      this.sub = null; // the one-second heartbeat is enough on its own
    }
  }

  #bindKeys() {
    const input = process.stdin;
    if (!input.isTTY) return;
    input.setRawMode(true);
    input.resume();
    input.setEncoding('utf8');
    input.on('data', (chunk) => this.handleInput(chunk));
  }

  #enterAltScreen() {
    process.stdout.write(ALT_SCREEN_ON);
    this.restore = () => process.stdout.write(ALT_SCREEN_OFF);
    process.on('exit', this.restore);
  }

  #exitAltScreen() {
    if (process.stdin.isTTY) process.stdin.setRawMode(false);
    process.stdin.pause();
    this.sub?.quit?.().catch(() => {});
    this.restore?.();
  }
}
