---
title: Settlement
parent: The web dashboard
nav_order: 3
description: "What would be settled if the month ended now, the luck gap, the month-end projection, and whether the endpoints reconcile."
---

# Settlement

Route: `/settlement`

The month as Stake would settle it, how far luck has moved it, and whether the
endpoints agree about it. Every figure here reconciles one upstream response
against another, so this page reads the raw snapshots rather than the
dashboard's derived rows.

## The cards

| Card | Shows |
|---|---|
| Position | The balance endpoint's position, carry included |
| Settled if the month ended now | The share rate times the summed roster profit, plus carry |
| Luck gap | Position against the balance endpoint's own expectation, with this month's expectation beneath |
| Carried forward | Carry from earlier months |

## The panels

- **Luck.** Position; the balance endpoint's expectation (carry included);
  this month's expectation (carry removed); and the luck gap between them.
  Negative means players are ahead of the math so far this month. At real
  volume a gap of thousands can be ordinary variance.
- **What would be settled.** Gross house win this month (the sum of roster
  profit), the share rate, the studio's share this month, carry, and the
  result. Also the residual (position minus settled) and what would be paid.
  A month that settles negative pays nothing and carries its deficit into the
  next.
- **Where the month is heading.** The median *complete* day so far this month,
  applied to every full day left, gives a studio P/L at month end, and the
  settled figure after carry.
- **Today against yesterday.** Studio P/L since 00:00Z, against the same hours
  of yesterday, read from the collector's trail.

## Settled against position

Stake settles on the share rate times the summed roster profit, plus carry, not
on the balance endpoint's position. The two usually agree to the cent. When they
do not, the settlement follows the roster, and the **residual** row shows the
difference live.

The share rate is derived from position when there is enough money to trust
it, and snaps to the configured 10% (or 7.5%) when it is within half a point.
The card says whether the rate shown was **derived from position** or
**configured**. See [Money units](../configuration.md#money-units).

## Do the endpoints agree?

One row per roster game, in gross US dollars:

| Column | From |
|---|---|
| /stats profit | The roster response |
| /games profit | The catalogue response |
| Difference | Between the two |
| Per-mode sum | The game's per-mode response, summed |
| Difference | Between that and the roster |
| Status | **reconciles**, **differs**, or **nothing to compare** |

The three responses are fetched seconds apart in the same poll, so a small gap
on a busy game can be timing. One that persists across polls is not.

## Freshness

When each endpoint was last read successfully, how old that is, and whether it
is **fresh** or **stale**. Stale means older than three of its own polls, so an
endpoint polled every 15 or 60 minutes is judged on its own cadence (see
[`intervals`](../configuration.md#where-to-poll-and-how-often)).
