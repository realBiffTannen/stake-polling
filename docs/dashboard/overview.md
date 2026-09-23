---
title: Overview
parent: The web dashboard
nav_order: 1
description: "The landing page: one line per game, month to date, and the titles not yet live."
---

# Overview

Route: `/`

The landing page. Every game this month, one line each, and nothing deeper.
Every game name opens its [game page](game.md), where the bet modes, math and
players are.

## Summary cards

| Card | Shows |
|---|---|
| Studio P/L this month | The studio's share of gross gaming revenue, month to date, with today's figure beneath |
| Bets this month | One bet is one game played |
| Turnover this month | In US dollars |
| Online now | Players online across live games |

## Games

One row per roster game, sorted by turnover, with a total row:

| Column | Meaning |
|---|---|
| Game | Opens the game page |
| Bets | Month to date |
| Turnover | Month to date |
| Studio P/L | Month to date, the studio's share |
| P/L today | Since the accounting-day boundary (00:00Z by default; see [The accounting day](../configuration.md#the-accounting-day)) |
| Online now | Players on that game at the last poll |

Month to date runs from the 1st at 00:00Z. A game that is live but has no
figures yet shows dashes and the tag **live, nothing yet**, rather than `$0.00`.

## Not yet live

Every catalogue title that is not turned on, with what is known about it:

| Column | Meaning |
|---|---|
| Game | Opens its game page, built from its captured math |
| Status | **Unpublished**, **Published · not live** or **Not live** |
| Approval stage | As the catalogue reports it |
| Captured RTP, Modes, Max win | From your [math.json](../configuration/math-json.md), or a dash |

The API reports no play for these titles, so there are no money columns.

For the collector's own view of the roster, with per-poll rates and findings,
see [Live operations](live.md).
