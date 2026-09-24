---
title: Trends
parent: The web dashboard
nav_order: 7
description: "Players online every poll, 30 days of daily figures, turnover by game, the hour-by-day heatmap, the zoomable daily trend and the retention metric."
---

# Trends
{: .no_toc }

Route: `/trends`

Players online every poll, the last 30 days of play, and the standing retention
metric.

1. TOC
{:toc}

## Players online, every poll

One point per poll from the collector's trail. The range picker offers **6h**,
**24h** (the default), **3d** and **7d**. Past a day, each point is the peak of
15 minutes of polls. A missed poll breaks the line; hover for the reading. The
range is in the address: `/trends?online=7d`.

## The last 30 days

From the daily-history sync (see [Player insights](insights.md)), all games
together. Each chart's headline compares this week with last week, leaving out
today because it is still filling.

- **Bets per day**, **Turnover per day**, **Players per day** and **Average bet
  per day**, each with a 7-day average line.
- **Studio P/L per day**, green or red by sign.
- **Running studio P/L**, summed day by day from the start of the window.
- **Observed RTP per day**, against the expected RTP from each mode's deployed
  RTP, weighted by turnover. One day is far too few rounds for RTP to settle,
  so expect wide daily swings.

A day the sync missed breaks the line rather than reading as zero.

## Turnover and studio P/L, day by day (zoomable)

An interactive chart of the same 30 days: daily turnover on top and daily studio
P/L beneath, each on its own scale. **Drag either end of the slider** under the
chart to zoom into any stretch, or drag the middle to move along. Hovering
shows both figures for a day. The zoom you chose survives the page's live
refresh. A day the sync missed is a gap, not a zero.

## Turnover by game

Daily turnover as stacked bars. The seven games with the most turnover over the
window each get a layer; the rest are **Other**. The legend is also the picker:
it lists every game with turnover in the window, biggest first, and clicking
one charts that game alone, on its own scale. **All games** goes back to the
stacked view. The choice is in the address (`/trends?turnover=berry`), and the
players-online range and the game picker keep each other's choice.

## Hour of the day

Average bets in each UTC hour, over the last 7 days of the collector's trail:
when play happens, not how much of it.

## Hour by day (heatmap)

An interactive heatmap of bets in every UTC hour of the last 7 days: hours
across, days down, each cell coloured by its bets on the scale shown beneath.
It shows the hour-of-day profile one day at a time, so a quiet Tuesday or a
late Saturday stands out.

- Hover a cell for the day, the hour and the bets.
- An hour the collector missed is drawn as a **dashed outline**: empty, not
  zero.
- Today stops at the current hour, and that hour's reading says it is still
  filling.

## Returning players against releases

The standing metric: returning players across every game each day, divided by
the number of games live that day.

- Four cards: the latest average, returning players' 7-day and 28-day means,
  and new players' 7-day mean.
- A chart of the average against the number of games released, on two axes.
- **Rolling player tallies:** daily new and returning players, with their
  7-day means.

The games endpoint carries no release date. "Games released" is recorded daily
from the day the dashboard started keeping it; earlier days are
**reconstructed** from each game's first active day, and a notice says how
many days are reconstructed.

## Does the math shape retention?

The correlation, across games that have a captured model, between the
returning share of players and three things: base volatility, house edge and
the price of the most expensive bonus buy. Each row states its r and its n, and
reads "no clear relationship" unless |r| is at least 0.3. With a dozen games
this is weak evidence. A scatter of returning share against base volatility
follows. Needs [math.json](../configuration/math-json.md).
