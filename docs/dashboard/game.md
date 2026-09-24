---
title: Game pages
parent: The web dashboard
nav_order: 12
description: "One game in depth: bet modes, P/L by mode, noise bands, hold, economics, players, the tape, launch checks, captured math and trends. Also the bet-mode and bucket-cadence pages."
---

# Game pages
{: .no_toc }

Route: `/game/<slug>`, for example `/game/berry`

Every game name on the dashboard opens its game page, and the command palette
lists every game. Titles that are not live get a page too, built from their
captured math.

1. TOC
{:toc}

## The game page

### Bet modes

The bet-mode table comes first: cost, bets, share of bets, turnover, studio
P/L, deployed RTP, effective and normalized RTP (the API's own), captured RTP
(from `math.json`) and average bet, with a total row. Each mode name opens its
[bet-mode page](#a-bet-mode-page).

The picker above it scopes the table to **Last 24h**, **Today** (since
00:00:00Z) or **This month** (the default). The trail spans come from the
collector's per-mode trail, which is read 24 hours deep, so a game page offers
no longer window. Average bet and the effective and normalized RTPs exist only
for the month.

### Charts and panels

- **Where the P/L came from:** studio P/L by mode.
- **Bets against turnover, by mode.**
- **Luck or fault, mode by mode:** each mode's margin against its captured
  edge and noise band. Needs [math.json](../configuration/math-json.md).
- **Running P/L, hour by hour**, **P/L per hour** and **Bets per hour**, for
  today or the last 24 hours.
- **Hold against theory, mode by mode:** how many points of the game's
  realised-minus-theoretical hold gap each mode explains. The bars add up to the
  gap.
- **Buy economics:** buy conversion, buys' share of turnover, average buy,
  average base bet, and the average price actually paid for each buy mode.
- **Bet-size ladder:** share of bets and of turnover by base bet size. Lifetime,
  from the API's `betStats`, and bucketed by BASE bet: a 250x buy at $2 counts
  as a $2 bet.
- **Players and sessions:** turnover, rounds and studio P/L per player, studio
  P/L per 1,000 rounds, **average stay** (Little's law over the trail: players
  online divided by the rate new players arrive), and the share of turnover
  taken with two or fewer players online.
- **The tape:** big stakes, payout spikes, house takes and exact feature-buy
  stakes over the last 24 hours, as on [Analysis](analysis.md#unusual-days-and-the-tape).
- **Launch checks:** four checks, each **ok**, **flag** or **unknown**.
  Unknown means the data cannot answer yet; never read it as ok.

  | Check | Flags when |
  |---|---|
  | ladder stuck | Most bets sit at the cheapest bet size, so the bet ladder may be stuck (read from 500 sized bets) |
  | no buys | A game with feature-buy modes has taken plenty of base rounds (800 or more) and not one buy |
  | avg stake low | The game's average stake is under half the studio's (read from 300 rounds) |
  | traffic cliff | Bets per minute fell under 30% of their typical rate (read once typical traffic is 20 bets a minute), and players online fell with them |

### Players, math and verdicts

- Cards for players, returning and new players, turnover and studio profit over
  the selected period, from the daily history.
- **Captured math:** version, house edge, RTP, base volatility, max win, modes,
  cost ladder and compliance, or a plain note that there is no captured model.
- **What the math says about the play:** each conclusion with its sample size
  and whether it can be read at that size. A margin inside its noise band says
  it is noise, and how many rounds it would need to read to ±1 point.
- **Players, day by day** and, once the daily rollup has history, **Turnover by
  mode, day by day**.

### Trends for this game

The same panels as [Trends](trends.md), for this game alone: players online
every poll (6h, 24h, 3d or 7d), the last 30 days, and the hour-of-day profile.

### Actions

- **Bucket cadence** opens the [bucket page](#the-bucket-cadence-page).
- The **⋯** menu has **Player insights** for this game, **Raw CSV today** (the
  game's trail) and **Modes CSV today** (its per-mode trail).

## A bet-mode page

Route: `/game/<slug>/mode/<MODE>`, for example `/game/berry/mode/BONUS`

One bet mode on its own: its month-to-date figures, **Captured against
deployed** (the certified model beside what the API reports now), its
conclusions with their sample sizes, and, once the rollup has history, this
mode day by day.

The API reports players per game, never per mode, so this page shows no player
counts and estimates none.

## The bucket cadence page

Route: `/game/<slug>/buckets`, with `?cadence=5m`, `15m`, `30m` or `1h` (the
default)

One game's play in wall-clock buckets, aligned to the epoch and labelled in UTC,
over the last 24 buckets: bets and studio profit per bucket, a totals table,
and studio profit by bet mode beside the total. A delta is counted in the
bucket its sample landed in.

A bucket the collector did not measure is blank, not zero. The game total and
the mode columns come from two different API responses; the
[terminal dashboard](../terminal.md#profit-by-hour-and-by-five-minutes)
explains why they need not sum exactly.
