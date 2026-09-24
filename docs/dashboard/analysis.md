---
title: Analysis
parent: The web dashboard
nav_order: 3
description: "Every chart states its conclusion: the span picker, the players, correlation and contribution panels, and the interactive treemap and Sankey."
---

# Analysis
{: .no_toc }

Route: `/analysis`

Every chart states its conclusion in a sentence computed from the same numbers
it draws, and every conclusion carries what it was computed from. On a wide
screen an **On this page** list follows the section you are reading.

1. TOC
{:toc}

## The span picker

The picker at the top scopes the page. Shortest first:

| Span | Covers | Read from |
|---|---|---|
| Last 10 min | The rolling 10 minutes to now | The collector's trail |
| Last 1h, 3h, 6h, 24h | The rolling window to now | The collector's trail |
| Last 3 days | The rolling 72 hours to now | The collector's trail, read by time |
| Today | Since 00:00:00Z. At 01:00Z that is one hour of play | The collector's trail |
| This month | Month to date from the 1st at 00:00Z | The API's own month-to-date figures |

The picker is a link, so a span can be bookmarked: `/analysis?span=24h`. The
values are `10m`, `1h`, `3h`, `6h`, `24h`, `3d`, `today` and `month` (the
default).

**Today** is always the UTC calendar day, whatever `dayBoundaryUtcHour` says.
Samples are stamped with their poll slot, so the 00:00:00Z sample is the exact
start of the day, and the step that arrives at midnight stays in yesterday.

Trail spans are built from differences between polls, so a month rollover
inside the window counts its real volume, and a game or mode the trail never
measured stays a dash rather than a quiet zero. If the trail does not reach
back to the start of the span, a notice says where it starts.

A few panels keep their own horizon whatever you pick, and say so:

- the hour-by-hour charts need the trail, so under **This month** they show
  the last 24 hours;
- **Daily P/L this month** is always the calendar month;
- **Player worth** is always this month, because the API counts players only
  month to date, per game;
- **Quiet share** and **The tape** always read the last 24 hours;
- the player panels read the last 24 hours under **This month**.

## Share and P/L

- **Four donuts:** share of bets, share of turnover, profit gains (games that
  were up) and profit losses (games that were down), by game. Each game keeps
  its donut colour on every chart on the page.
- **Profit and loss by game.** Studio P/L per game. Zero counts as up.
- **Luck or fault?** Each game's observed house margin (the dot) against its
  captured edge (the tick), inside a band of ±2 standard errors built per mode
  from the captured sigma and weighted by turnover. A margin outside its band
  is a prompt to look, not proof of a fault. Needs
  [math.json](../configuration/math-json.md).
- **Where the turnover goes.** Each game's share of turnover.

## Turnover by game and bet mode (treemap)

An interactive treemap. Area is turnover. Each game keeps its donut colour, and
its tiles are its bet modes. **Click a game** to open it up and see only its
modes; **click the bar underneath** (the breadcrumb, starting at *All games*) to
step back out.

## Feature buys

- **Feature buys against base play.** Each game's feature-buy share of
  turnover. A feature buy is a mode costing more than 5x the base bet.
- **Where each game's turnover flows (Sankey).** An interactive Sankey
  diagram: studio turnover split by game, then each game's turnover split into
  base play or feature buys, using the same 5x rule. Band width is turnover.
  Hover a band or node for its figure. A mode whose cost was never read counts
  as base play.

## Hold and economics

- **Realised against theoretical hold.** Realised hold minus theoretical hold,
  in points, per game. Theoretical hold is one minus each mode's deployed RTP,
  weighted by that mode's turnover: the API's own figures, so it needs no
  captured math. The game page shows which mode explains the gap.
- **Buy economics by game.** Buy conversion, buys' share of turnover, average
  buy and average base bet.
- **Player worth by game.** Turnover, rounds and studio P/L per player, and
  studio P/L per 1,000 rounds.

## Players, correlation and contribution

The API never identifies a player, so these panels relate **counts** to money.
They do not follow any one person.

- **Players in this span.** Average players online per game over the span.
  Players online is a head count at each poll, not distinct players. The note
  also gives this month's player count across games (a player of two games
  counts twice).
- **Players and turnover (correlation).** A scatter of players online against
  turnover, one dot per poll interval, with a fitted line. The headline gives
  Pearson's r and the turnover per extra player. On long spans the chart draws
  an even sample of the dots, but r uses them all. A link is not a cause.
- **Player contribution by game.** A table per game: average and peak players
  online, players new this month, share of players, share of turnover, share of
  bets, and **Contribution**, which is a game's share of turnover over its
  share of players online. Above 1x, its players stake more than their numbers
  alone would suggest.
- **Quiet share.** The share of each game's turnover taken with two or fewer
  players online, over the last 24 hours. A game that takes most of its money
  with almost nobody on is living on a few big players.

## Unusual days and the tape

Both panels start folded: the heading and its conclusion sentence show, and
the arrow on the right opens the list. A panel you open stays open through the
live refresh.

- **Unusual days.** A day at three times the median of that game's previous 14
  active days, with at least five days to compare and a floor of $400 and 900
  rounds. Launch days and today are excluded.
- **The tape.** Notable intervals over the last 24 hours:

  | Kind | Means |
  |---|---|
  | Big stake | $500 or more in one poll interval, at $10 or more a spin |
  | Payout spike | A player won $250 or more net, and 5x or more the stake |
  | House take | The house kept $250 or more |
  | Exact stake | One feature buy alone in an interval, so its price is exact |

  The first 40 are listed; every interval is in the [poll log](log.md).

## Hour by hour, and daily

- **Running studio P/L, hour by hour**, **Studio P/L per hour**, **Bets per
  hour** and **Players online** (peak per hour). For a window shorter than a
  day the charts start at the top of the hour the window begins in, and say
  so.
- **Daily P/L this month.** Studio P/L per day of the calendar month. Today is
  still filling.

At the bottom, **How to read these** explains the picker, money and noise.
