---
title: Live operations
parent: The web dashboard
nav_order: 5
description: "The collector's own roster with per-poll rates, the live stream strips, possible events, running action and findings."
---

# Live operations

Route: `/live`

The terminal dashboard's panes, in the browser, in the same order: the roster,
then what might be happening, what the roster did, and the raw findings
underneath.

## Roster

A countdown to the next poll sits beside the heading. Six tiles:

| Tile | Shows |
|---|---|
| Lifetime turnover since `lifetimeStart` | From the lifetime window, read hourly |
| Turnover this month, Profit this month | Month to date |
| Turnover, profit and bets since the boundary | Since the accounting-day boundary (00:00Z by default). The line beneath says `(partial - trail starts HH:MMZ)` while the trail does not yet cover the whole day |

Then one row per game:

| Column | Meaning |
|---|---|
| GAME | Opens the game page. **live, nothing yet** marks a live game with no figures |
| NOW | Players online at the last poll |
| BETS, BETS/2.5m | Month to date, and the change in the last poll interval |
| PLAYERS | Unique players this month |
| TURNOVER, TURN/2.5m | Month to date, and the change in the last interval |
| PROFIT, PROFIT/2.5m | Studio share, month to date, and the change in the last interval |
| DAY PROFIT, DAY TURN | Since the accounting-day boundary |
| LIFETIME TURN | Since `lifetimeStart`. A game missing from the last lifetime read is a dash |
| EXPECTED | The API's expected profit at the expected-share rate (7.5%), as on the studio accounting page |
| RTP | From gross figures |
| TREND | A sparkline of turnover per poll interval |

The rate columns name the poll interval (`/2.5m` at the default), so they never
read as per-minute figures.

Links under the table sort it by `turnover`, `lifetimeTurnover`, `dTurnover`
(turnover per interval), `profit`, `count` or `name`, and **hide panes** hides
the three lower panes. Both are in the address, for example
`/live?sort=profit&panes=0`.

## Live stream

Two strips that scroll with the clock, over the last 3 hours:

- **Players online** at each poll;
- **Bets** in each poll interval: every game's change in bet count, summed.

The figures only move when the collector polls, so each strip says **per
poll**, shows its latest reading beside the title, and takes each new poll as
the page's live refresh brings it in. Two measures, so two strips, never one
axis. A missed poll breaks the line. The strips need JavaScript; without it the
panel keeps its headline.

## Possible events

What might be happening, in a sentence. Findings are grouped per game and
matched against known signatures, such as a **traffic surge** or a **possible
large win**. These are hypotheses, and the wording says so. See
[Anomaly detection and alerts](../anomalies.md#possible-events).

## Running action

One line every five minutes (`intervals.summary`) recording what the roster
did: bets, turnover, profit, how many games were active, the biggest mover, and
what fired. The poller writes it to the `summary` stream, which keeps a week, so
"what happened while I was away" is already written down.

## Findings

The raw alerts, newest first. See
[Anomaly detection and alerts](../anomalies.md).
