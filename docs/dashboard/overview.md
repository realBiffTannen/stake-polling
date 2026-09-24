---
title: Overview
parent: The web dashboard
nav_order: 1
description: "The landing page: one line per live game, month to date, with the catalogue and the titles not yet live beneath. Every table sorts by any column."
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

## Live games this month

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

Click a column heading to sort by it, and again to reverse. Numbers start
biggest first, text A to Z; a figure nobody measured sorts last either way, and
the Total row stays at the bottom. The choice is remembered for the tab.

## Games, and Not yet live

The catalogue and the titles not yet live, exactly as the [Games](games.md)
page shows them - the same code draws both.
