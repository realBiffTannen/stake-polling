---
title: Game math
parent: The web dashboard
nav_order: 8
description: "Your captured math models, drift warnings, and dismissing standing warnings for everyone."
---

# Game math

Route: `/math`

The certified model each game was approved with, from your
[math.json](../configuration/math-json.md). Deployed figures are compared
against these on every game page.

## The table

One row per captured game: version, RTP, base volatility and class, star
level, max win, number of modes, cost ladder, 2-star and 3-star compliance
(**passes** or **FAILS**), and whether the game is live. A search field over the
table filters it as you type.

Below it, each game gets its own table of modes: cost, RTP, standard deviation,
zero rate, hit rate, break-even rate and worst losing streak. Each mode name
opens that bet mode's page.

## Drift warnings

When a game's deployed modes, as the API reports them, disagree with
`math.json`, a warning names the game and what differs:

```text
Deployed math differs from math.json - a new math version was published or a
mode was added, so recapture these games from the studio dashboard's Math tab:
  pixel-geyser: ANTE is deployed but not in math.json
```

The checks are: a mode deployed but not captured, a mode at a different cost,
and a mode stating a different RTP. A second warning lists live games with no
captured model at all: those games show observed figures only, with no drift,
convergence or tail verdict.

## Dismissing warnings

These two are **standing warnings**: facts that stay true until someone acts,
not live faults. Each carries a **×** button that dismisses it **for
everyone**: the dismissal is kept in Redis (`stake:<team>:dismissed`), so it
holds on every browser and for every user.

- A dismissal is tied to what the warning says. If it changes (another game
  drifts, another game goes live without a model), the new warning shows again
  by itself.
- **Settings > System > Dismissed warnings** counts what is hidden and has a
  **Show them again** button.
- With sign-in on, only a signed-in user can dismiss.
- Live faults (sync failure, stale data, Redis memory, an expired sid) can
  never be dismissed.
