---
title: Player insights
parent: The web dashboard
nav_order: 4
description: "Daily players, new and returning, per game and per month, with CSV and PDF export."
---

# Player insights
{: .no_toc }

Route: `/insights`

The daily picture: who is playing, what is growing, and how each game performs,
by UTC calendar day.

1. TOC
{:toc}

## Where the figures come from

The web dashboard runs a small, bounded sync of daily history using `.sid` or
`STAKE_SID`. On first launch it fetches up to 30 calendar days one after
another, about 61 API requests for a full backfill. Completed days are cached;
today and yesterday are fetched again on each sync, which runs every three
minutes. The reports live in `stake:<team>:insights:daily:v1` and follow your
Redis persistence settings.

Only one web server syncs at a time: a `lock:daily-insights` key stops
duplicate syncs when several run. `--no-sync` or `STAKE_WEB_SYNC=0` turns the
sync off, and the page then shows whatever is cached.

If the sync has no valid session, the page says **Daily sync needs a valid
session in .sid or STAKE_SID**, keeps showing cached figures, and retries on
its own. If today's figures are more than 30 minutes old, a notice says so.

## Filters

| Control | Does |
|---|---|
| Game | One game, or all games |
| From, To | Any range of UTC days. Defaults to this month so far |
| 7D, 14D, 30D | Quick ranges ending today |
| Column headings | Sort the game table; click again to reverse |
| A game's name in the table | Focus the page on that game |

Filters are ordinary links, so any view can be bookmarked. The page's live
refresh never throws away a filter you are halfway through editing. Old
`/?game=...` links from before the Overview existed redirect here with their
filters intact.

## What is on the page

- **Cards:** daily players and new-to-game for the last day in the range,
  turnover and studio profit for the range.
- **Players, day by day:** daily players and new-to-game players, as bars.
- **Turnover trend** and **Period at a glance** (player-days, new-player share,
  bets, average bet).
- **Game performance:** player-days, new to game, returning player-days,
  turnover, studio profit, bets, average bet and observed RTP per game.
- **By calendar month:** the same totals per month. The current month is marked
  in progress.
- **Daily breakdown:** exact daily values, most recent first, with the day in
  progress and any day not yet synced marked.

## Export: CSV and PDF

The **Export CSV** button at the top, and the **CSV** and **PDF** buttons on
the daily breakdown, download exactly what the filters select:

| Route | Gives |
|---|---|
| `/export.csv?game=&from=&to=` | `player-insights.csv`: one row per day, with `date`, `game`, `daily_game_players`, `new_to_game`, `returning_game_players`, `turnover_usd`, `studio_profit_usd`, `expected_share_usd`, `bets`, `in_progress` and `fetched_at_utc` |
| `/export.pdf?game=&from=&to=` | `player-insights-<from>-to-<to>.pdf`: the daily breakdown table, with the game, the range, the team and when it was made |

With all games selected, the CSV's `game` column reads
`ALL_GAMES_SUM_NOT_DEDUPLICATED`, because the counts are summed per game.

## What the player numbers mean

- **Daily players:** the API's distinct players within a game for one UTC
  calendar day, midnight to midnight.
- **All games** sums game-level counts. Someone playing two games can appear
  twice; these are not studio-wide deduplicated people.
- **New to game:** the difference between consecutive end-of-day cumulative
  unique counts since `lifetimeStart`. It means newly observed for that game
  since tracking began, not new account registrations. The API provides no
  identities and no first-ever studio-wide player counts.
- **Returning:** daily players minus new-to-game players. Counter corrections
  that would make this inconsistent show a dash instead of a made-up count.
- **Player-days:** daily player counts summed across the period, so playing on
  two days counts twice. Missing days are excluded and disclosed.
- **Money:** turnover in US dollars; studio profit at the configured share
  (10%); expected share at 7.5%; RTP from gross figures. Today is labelled in
  progress, and every daily report carries its fetch time.
