---
title: Terminal dashboard
nav_order: 9
description: "The live terminal dashboard: its keys, its views, drilling into a game and a bet mode, compare, daily profit, profit buckets, and plain-text snapshots for scripts."
---

# Terminal dashboard
{: .no_toc }

```bash
npm run dash
```

A live, keyboard-driven view of the same Redis data, in the terminal. It only
reads: close it, restart it or run two of them, and the trail is unaffected. It
repaints once a second, and at once when the poller announces a tick.

1. TOC
{:toc}

## What is on screen

- **The header:** the team, the clock (`FROZEN` beside it while frozen), the
  month's totals, "day since HH:MMZ" with the day's bets, turnover and profit,
  and the sid's state, source and fingerprint and whether Redis has AOF on.
  `SID EXPIRED` and the Redis memory alert appear here as red bars.
- **The body:** the roster, or whichever view you have opened.
- **Three lower panes**, coarsest first:
  - **POSSIBLE EVENTS:** what might be happening, in a sentence. See
    [Anomaly detection and alerts](anomalies.md#possible-events).
  - **RUNNING ACTION:** one line every five minutes: bets, turnover, profit,
    how many games were active, the biggest mover, and what fired.
  - **FINDINGS:** the raw alerts, newest first.
- **The footer:** the most-used keys. `?` shows all of them.

The roster's columns are GAME, NOW (players online), BETS, BETS per interval,
PLAYERS, TURNOVER, TURN per interval, PROFIT, PROFIT per interval, DAY PROFIT,
DAY TURN, EXPECTED, RTP and a sparkline. Rate columns name the interval, for
example `TURN/2.5m`, so they never read as per-minute figures. A TOTAL row
closes the table.

A narrow terminal drops columns by priority rather than truncating the table.

## Keys

| Key(s) | Does |
|---|---|
| `q`, `ctrl-c` | Quit |
| `↑`/`↓`, `k`/`j` | Move the selection |
| `→`, `↵` (enter) | Open: descend a level |
| `←`, `⌫` (backspace), `esc` | Back: ascend a level |
| `home`/`end` | Jump to the top or bottom of the list |
| `page up`/`page down` | Move a page at a time |
| `1` `2` `3` `4` | Jump straight to a game's tab: HEALTH, LIVE, TODAY, BUCKETS |
| `tab`, `shift-tab` | Cycle a game's tabs forward or backward |
| `g` | Cycle the drill-down through the roster, without descending |
| `h` | Cycle the bucket size: five minutes, then the hour, then off |
| `c` | Compare one bet mode across every game in the roster |
| `d` | Daily profit: one row per accounting day |
| `[` / `]` | Step which bet mode the compare screen is showing |
| `s` | Cycle the sort: turnover, turnover per interval, profit, bets, name. Applies to the roster, the per-mode tables on a game's tabs, and the compare screen |
| `a` | Toggle the three lower panes together |
| `/` | Open a filter prompt |
| `f` | Freeze the screen: stop reading Redis until you press `f` again |
| `r` | Repaint now |
| `?` | Toggle the help overlay, which lists every binding |

`h` cycles the bucket size; it is not a vim-style "back" key. Back is `←`
(also `⌫` and `esc`), which mirrors `→`/`↵`.

### The filter

While the `/` prompt is open it takes every keystroke as literal text,
including letters that are normally bound (`c`, `g`, `h`, `r`, `s`, ...),
until you press `enter` or back out. `ctrl-c` still quits.

- `enter` applies the filter and closes the prompt.
- `esc` cancels the prompt and clears the filter.
- `⌫` deletes one character without closing the prompt.
- `esc` on the roster, with a filter already applied, clears it.

The filter keeps the games whose slug contains the typed text, ignoring case,
and says how many it hid:

```text
filter "berry" - showing 1 of 14 games (13 hidden, esc clears)
```

### Freezing

`f` stops the dashboard reading Redis, so the figures on screen cannot change
under you while you read them. Press `f` again to carry on.

{: .note }
> In the current release a frozen screen also stops responding to the
> navigation keys, and the `FROZEN` marker may not appear. Press `f` again to
> unfreeze.

## Drilling into a game

`↵` (or `→`) on a roster row descends into that game, and `←` (also `⌫`,
`esc`) comes back up. Three levels deep:

```text
roster  ->  one game, four tabs  ->  one bet mode
```

`1` to `4` (or `tab`/`shift-tab`) switch a game's tab without leaving it; `↵`
on a row in any tab opens that one bet mode in full.

### The four tabs

| Tab | Columns | Built from |
|---|---|---|
| `1` HEALTH | MODE, COST, AVGBET, SPINS, TURNOVER, PROFIT, RTP, EFF, NORM, EDGE_API, vs EXP | The latest snapshot only |
| `2` LIVE | MODE, SPINS, TURN and PROFIT per interval, SHARE, a 12-tick sparkline | Per-poll changes from the per-mode trail |
| `3` TODAY | MODE, SPINS, TURNOVER, PROFIT, SHARE | Totals since the accounting-day boundary |
| `4` BUCKETS | The profit-by-bucket table below, for this game | The trail, at whatever size `h` last picked (5 minutes by default) |

A narrow terminal drops columns by priority: MODE and RTP survive longest;
EDGE_API and vs EXP go first, then NORM and AVGBET.

**HEALTH works on the first frame.** It is built only from the latest snapshot,
so nothing on it waits for the trail. **LIVE and TODAY need the per-mode
trail**, which only starts accumulating once the poller runs; until it has
enough samples they show `-`, never a made-up `$0.00` or `0`.

Here is a HEALTH tab for a made-up game, `berry` (illustrative figures):

```text
berry   HEALTH   [*health* live today buckets]
MODE                COST  AVGBET     SPINS      TURNOVER        PROFIT     RTP     EFF    NORM  EDGE_API        vs EXP
BASE                  1x    0.20    52,400    $10,480.00       +$38.10   96.50   96.36   96.10      3.50        +$1.42
ANTE                  3x    0.20     4,120     $2,472.00        -$6.30   96.50  102.55   96.70      3.50       -$14.95
BONUS               100x    0.20       130     $2,600.00       +$11.20   96.50   95.69   96.50      3.50        +$2.10

VERDICT
  BASE               margin is noise: +/-6.20% at n=52,400, against a 3.50% edge. Needs ~2,016,400 rounds for +/-1pp.
  ANTE               margin is noise: +/-15.27% at n=4,120, against a 3.50% edge. Needs ~960,400 rounds for +/-1pp.
  BONUS              margin is noise: +/-16.66% at n=130, against a 3.50% edge. Needs ~36,100 rounds for +/-1pp.
```

- RTP is the deployed RTP; EFF and NORM are the API's effective and normalized
  RTP.
- EDGE_API is `expectedReturn / turnover`, which reproduces the response's own
  `1 - rtp`.
- vs EXP is the studio profit against what the edge predicts for that
  turnover.

**A margin nobody can read says so.** The band is `σ/√N`, with σ from
[math.json](configuration/math-json.md), and it is computed per bet mode only:
across a whole game, one expensive buy dominates the sum of squared stakes, and
the same formula would understate the noise by an order of magnitude. Where
`math.json` has no entry for a game or mode, the sample size still prints and
no band is claimed.

### One bet mode

`↵` again (or `--view mode --mode <NAME>`) trades the table for a full card:
cost, average bet and spins; turnover, profit, expected and vs expected; the
same per-poll and per-day rates as LIVE and TODAY; the game's whole cost ladder
with this mode's rung picked out; the convergence line above; a sparkline of
this mode's own profit at the current bucket size; and its findings in full.

## Compare

`c` sidesteps the hierarchy: pick a bet mode name and see it down every game in
the roster that runs it, stepping with `[` and `]`. It is snapshot-only, so
opening it costs no extra Redis reads: the columns that need a trail show `-`,
and only the month-to-date figures show. It follows roster order by default and
is sortable with `s`; the header names the sort once it is not the default.

## Daily profit

`d` (or `--view daily` from a pipe) lists profit **per accounting day**, newest
first, with the whole roster beside each total:

```text
DAILY PROFIT  00:00Z -> 00:00Z (UTC), newest first
DAY                            TOTAL         berry  pixel-geyser  marble-orchard
09-22 -> 09-23 so far        +$41.20       +$12.10        -$3.40         +$32.50
09-21 -> 09-22              -$224.16      -$134.15       -$76.03         -$13.98
09-20 -> 09-21 partial       +$88.02       +$88.02             -               -
```

- Each row names both dates, because the day runs from one boundary to the
  next. The boundary is `dayBoundaryUtcHour` (00:00Z as shipped); see
  [The accounting day](configuration.md#the-accounting-day).
- `so far` is the day still being filled. Its TOTAL agrees with the header's
  "day since" profit.
- `partial` is a day the trail covers only part of, because the poller started,
  or was down across the boundary, more than about half an hour into it.
- Days before the trail began are not drawn. A day inside the trail that
  nothing was measured in keeps its row and reads `-`.
- Figures are the studio share, like every other profit column.

The table reaches back as far as the trail is kept (`retention.trailDays`). It
is only read while this view is open, and only re-read when the poller writes.
A narrow terminal sheds game columns from the right, smallest turnover first;
the piped form prints them all.

## Profit by hour, and by five minutes

`h` opens one game's profit per wall-clock bucket, with a column for the game
as a whole and one for each of its bet modes, so a bonus round's own
contribution is separated from the base game's. The first `h` shows five-minute
buckets, the next the hour, and the next turns the bucket size off.

```text
berry profit by 5m   14:45-15:02 UTC
BUCKET        TOTAL         BASE         ANTE        BONUS
15:00        +$4.47       +$3.10       +$0.77       +$0.60
14:55        -$3.10       +$3.36       +$2.27       -$8.73
14:50             -            -            -            -
14:45       +$15.42      +$11.30       +$2.32       +$1.80
```

Four things worth knowing about that table:

- **Buckets are aligned to the epoch and labelled in UTC,** by the time they
  start. An hour bucket starts on the hour UTC.
- **A blank bucket is blank, not zero.** `-` means nothing was measured: the
  poller was down, or had not started. Empty buckets are trimmed from each end
  of the table, but a hole the trail surrounds keeps its row. "We were not
  watching yet" and "we were watching and missed it" are different facts.
- **TOTAL is not the sum of the mode columns.** It comes from
  `/teams/{team}/stats` and the mode columns come from
  `/teams/{team}/games/{slug}/stats`: two different responses. When they
  disagree by more than a percent, the table says so underneath rather than
  picking a winner.
- **Mode columns only go back as far as recording does.** There is no
  backfill: the API only ever reports the current month-to-date total. Until
  there is a per-mode trail, the table says `no per-mode trail yet`.

The web dashboard has the same table, with 15- and 30-minute buckets too, on
each game's [bucket cadence page](dashboard/game.md#the-bucket-cadence-page).

## Losses are red

Every profit figure the terminal draws (the header, the roster's profit
columns, a game's tabs, the bet-mode card, the compare screen, the bucket table
and the daily table) is red below zero, green otherwise, and a dim `-` when it
was never measured. Piped output carries no colour codes at all; there the sign
is the only signal.

## Snapshots for scripts

Piped or redirected, the dashboard prints one plain-text snapshot and exits:

```bash
npm run dash > snapshot.txt
```

Every view you can reach from the keyboard is reachable with flags too, since a
redirected dashboard has nobody to press a key:

```bash
node bin/stake-dash.mjs --view health --game berry
node bin/stake-dash.mjs --view mode --game berry --mode BONUS
node bin/stake-dash.mjs --view compare --mode ANTE
node bin/stake-dash.mjs --view daily
node bin/stake-dash.mjs --view buckets --game berry --bucket 1h
```

| Flag | Takes |
|---|---|
| `--view` | `roster`, `health`, `live`, `today`, `buckets`, `mode`, `compare` or `daily`. A wrong value prints the list |
| `--game <slug>` | The game, for any per-game view |
| `--mode <NAME>` | The bet mode, for `mode` and `compare` |
| `--bucket 5m` or `1h` | The bucket size. `--bucket 1h --game <slug>` alone is the older spelling of `--view buckets` and still works |

The flags work in a terminal too: they choose the view the dashboard opens on.
