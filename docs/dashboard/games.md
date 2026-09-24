---
title: Games
parent: The web dashboard
nav_order: 2
description: "The catalogue: every title the studio has, live or not, with its Engine star rating, status, revenue model and approval stage, and the titles not yet live with their captured math."
---

# Games

Route: `/games`

The studio's catalogue, every title live or not. The same two tables sit under
the money table on the [Overview](overview.md); they are drawn by the same
code, so the two pages never disagree.

## Games

| Column | Shows |
|---|---|
| Game | The title; opens its [game page](game.md) |
| Rating | The star rating the Engine studio shows for it, out of three (the catalogue's `rating` over 30, rounded), or *Unrated* |
| Status | *Live*, *Not live* or *Unpublished* |
| Revenue model | From the roster's rate: the **10% revenue share** or the **5% GGR split across providers**. A dash for a title not on the roster - the API reports a rate only for a game with figures |
| Approval stage | As the catalogue reports it |
| Engine | Opens the title's page on the Engine studio, in a new tab |

Live titles come first, then the dark ones, each run by name.

## Not yet live

Titles in the catalogue but not turned on. The API reports no play for them at
all, so this table carries what is known - status, approval stage, and the
captured math (RTP, number of modes, max win) - and no money columns. A row of
$0.00 would claim somebody watched a quiet month.

## Sorting

Click a column heading to sort by it, and again to reverse. Numbers start
biggest first, text A to Z; a figure nobody measured sorts last either way.
The choice is remembered for the tab, so it survives the live refresh. Every
table on the Overview sorts the same way.
