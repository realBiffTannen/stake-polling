---
title: math.json
parent: Configuration
nav_order: 2
description: "The optional captured math model: which fields the dashboards read, and what each one drives."
---

# math.json
{: .no_toc }

1. TOC
{:toc}

## What it is

`math.json`, at the project root, is your optional captured math model: RTP,
volatility and paytable figures taken from each game's certified math, keyed
by slug. It is **gitignored**, because it describes your games, not the
project's.

The API does not serve these figures, so they are entered by hand from your
studio dashboard's Math tab (the distribution summary and the statistics
validation). Update an entry when you publish a new math version.

```bash
cp math.example.json math.json
```

It is read once at startup, so restart after editing it. A missing or
malformed file degrades to "no models" rather than crashing, and every check
treats an absent game or mode as "not captured" rather than guessing.

## An entry

A trimmed example for a made-up game, `berry`. `math.example.json` in the
repository has the full shape.

```json
{
  "berry": {
    "version": 3,
    "edge": 0.035,
    "maxWin": 10000,
    "baseVolatility": 14.2,
    "volatilityClass": "MEDIUM",
    "costLadder": [1, 3, 100],
    "compliance": { "passes2Star": true, "passes3Star": true, "failures": [] },
    "modes": {
      "BASE":  { "cost": 1,   "rtp": 0.965, "sigma": 14.2, "zeroRate": 0.72, "hitRate": 0.28, "breakEvenRate": 0.12, "worstLossStreak": 60 },
      "ANTE":  { "cost": 3,   "rtp": 0.965, "sigma": 9.8,  "zeroRate": 0.70, "hitRate": 0.30, "breakEvenRate": 0.13, "worstLossStreak": 140 },
      "BONUS": { "cost": 100, "rtp": 0.965, "sigma": 1.9,  "zeroRate": 0,    "hitRate": 1,    "breakEvenRate": 0.31, "worstLossStreak": 20 }
    }
  }
}
```

The key must be the game's **slug** (`berry`), never its display name. Games
are addressed by slug everywhere: URLs, Redis keys, trail lookups.

## What each field drives

### Per game

| Field | Used for |
|---|---|
| `edge` | Compared against each mode's deployed `1 - rtp` to raise `model_drift`, and against the convergence band to decide whether a margin is readable or noise. Also the captured RTP on the Overview's *Not yet live* table and the Game math page |
| `maxWin` | The outer bound of `impossible_margin`: a margin outside `[-maxWin, 100%]` is a plumbing bug, not variance. Shown on the Game math page |
| `costLadder` | The ladder on the terminal's bet-mode card, with the current mode's rung picked out; the Game math and game pages; and the top-bonus-cost correlation on Trends |
| `version` | Shown on the Game math page and the game page |
| `baseVolatility`, `volatilityClass` | Shown on the Game math and game pages; base volatility is also correlated with returning players on Trends |
| `starLevel` | Optional. Shown on the Game math page and as a star badge on the game page |
| `compliance.passes2Star`, `compliance.passes3Star`, `compliance.failures` | The 2-star and 3-star columns and the failing list on the Game math page |
| `compliance.bindingConstraint` | Optional. Named on the game page |
| `tail` | Captured and stored, not read by anything yet |

### Per mode, under `modes.<NAME>`

| Field | Used for |
|---|---|
| `sigma` | The `σ/√N` convergence band: the verdicts on the terminal's HEALTH tab and on the web game and bet-mode pages, and the *Luck or fault* charts on Analysis and the game page |
| `cost` | Drift check: a mode deployed at a different cost is flagged on the Game math page |
| `rtp` | Drift check: a mode stating a different RTP is flagged. Falls back to `1 - edge` when a mode has no `rtp` |
| `zeroRate`, `worstLossStreak` | The `expected_quiet` finding: a zero-paying mode going quiet for fewer spins than its captured worst losing streak is its design, not an outage |
| `hitRate` | Shown on the Game math page and the bet-mode page |
| `breakEvenRate` | Shown on the Game math page |
| `mean` | Shown as the mean return on the bet-mode page |

Other fields in `math.example.json` are kept for the record and not read.

## Drift warnings

The Game math page compares each game's deployed modes, as the API reports
them, with `math.json`, and warns when:

- a mode is deployed but not in `math.json`;
- a mode costs a different multiple than captured;
- a mode states a different RTP than captured (by more than half a tenth of a
  point).

Any of these means a new math version was published or a mode was added:
recapture that game. A captured mode missing from the deployed list is **not**
reported, because the stats endpoint cannot tell a removed mode from one nobody
has played yet this month.

A separate warning lists live games with no captured model at all. Both
warnings can be dismissed; see [Game math](../dashboard/math.md).

## Checking your slugs

A slug guessed from a display name produces confident false drift warnings.
With the collector running, this read-only script prints, for every game it has
cached, whether `math.json` has a model and whether the captured mode names
match the deployed ones:

```bash
node tools/verify-math-slugs.mjs
```

```text
berry                  live=true  match
pixel-geyser           live=true  MISMATCH captured=[BASE,BONUS] deployed=[ANTE,BASE,BONUS]
marble-orchard         live=false no model (not live)
```

The script connects with the configured Redis URL only. On an authenticated
Redis, put the credentials in `REDIS_URL` for it (`REDIS_USERNAME` and
`REDIS_PASSWORD` are not read by this one script).

## When there is no entry

A game or mode with no entry still shows every observed figure. What changes:
the sample size prints but no noise band is claimed, and `model_drift`,
`impossible_margin` and `expected_quiet` simply do not fire. Each check is
guarded on the model field it needs existing at all, not on that field reading
as a friendly zero.
