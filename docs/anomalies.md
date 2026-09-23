---
title: Anomaly detection and alerts
nav_order: 10
description: "How the detector works, every kind of finding, the possible events built from them, where alerts go, and how to tune it."
---

# Anomaly detection and alerts
{: .no_toc }

1. TOC
{:toc}

## How it works

The poller runs the detector on every tick, on the change since the previous
poll, against a rolling **median and MAD** baseline of the last 36 samples: 90
minutes at the default 2.5-minute poll. Median rather than mean, because a 40x
spike drags a mean and inflates a standard deviation, and the spike would end
up hiding inside the baseline it is measured against. The point under test is
left out of its own baseline.

A metric needs 12 samples before it can alert at all (30 minutes at 2.5
minutes), so a fresh start is quiet.

It watches, per game: turnover, bets, gross profit and players online. Across
the team: players online.

## Kinds of finding

| Kind | Fires when |
|---|---|
| `spike` / `drop` | The robust z-score is 4 or more (`warn`) or 6 or more (`crit`), **and** the change clears the metric's absolute floor. If the baseline is perfectly flat, the change is judged in multiples of the floor instead (5x the floor is `crit`) |
| `share_shift` | A game's share of roster turnover moves 15 points or more from its baseline share (30 or more is `crit`): "traffic is concentrating on this game". A game under 5% of turnover both now and at baseline is ignored |
| `flat_line` | A previously busy game reports zero turnover for 15 minutes: usually an outage. Always `crit` |
| `auth` | The sid was rejected. Polling pauses; see [The sid](configuration/sid.md) |
| `poll_failure` | No endpoint answered for three polls in a row |
| `new_game` | A slug appeared that this poller had never seen. Raised outside the detector, so it does not wait out the warm-up |

`share_shift` deliberately does **not** fire when the whole roster rises
together. It answers "is this game taking the traffic", not "is it busy".

A cold start does not raise `new_game` for games already known: the poller
seeds what it knew from the stored roster and catalogue, so a restart is silent,
but a game that went live during the downtime is still announced.

## Floors

The absolute floors are what stop a two-dollar game paging you at 4am. Rate
floors are written in **dollars (or bets) per minute** and scaled to the poll
interval; level floors are not scaled.

| Floor | Default | Per 2.5-minute poll |
|---|---|---|
| `ratePerMinuteFloors.turnover` | $50 a minute | $125 |
| `ratePerMinuteFloors.profit` | $25 a minute of gross profit | $62.50 |
| `ratePerMinuteFloors.count` | 25 bets a minute | 62.5 bets |
| `levelFloors.onlinePlayers` | 25 players, team-wide | 25 |
| `levelFloors.gameOnlinePlayers` | 5 players, per game | 5 |

Per-game players online carries a much lower floor than the team-wide figure.
Five players arriving on one quiet game is an event; five more across the whole
roster is noise. Concurrency also moves before turnover does, so this is
usually the first rule to fire.

## Cooldown

Each game, metric and kind has a 15-minute cooldown. A condition still true
after that fires once more at `crit`, and then stays quiet. Silence means
"nothing new", not "problem solved".

## Math findings

With a captured model in [math.json](configuration/math-json.md), each bet
mode is also checked against its math. These appear on the terminal
dashboard's game tabs and bet-mode card, and in the web dashboard's game and
bet-mode pages, rather than in the alert stream:

| Finding | Means |
|---|---|
| `response_edge_mismatch` | The response disagrees with itself: `expectedReturn / turnover` does not match the stated RTP. Needs no model |
| `model_drift` | The deployed edge differs from the captured one: a new math version, or a new mode. Recapture rather than reading it as player behaviour |
| `impossible_margin` | A margin outside `[-maxWin, 100%]`: a plumbing bug, not variance |
| `readable` / `noise` | Whether the margin can be read at this sample size, and how many rounds it would need |
| `expected_quiet` | A zero-paying mode going quiet for fewer spins than its captured worst losing streak: its design, not an outage |

## Possible events

Findings are grouped per game over the last 30 minutes and matched against known
signatures. The first that matches names the event:

| Event | Signature |
|---|---|
| traffic surge | Players (or share) and volume both climbing |
| traffic draining | Players (or share) and volume both falling |
| possible outage | A `flat_line` on turnover |
| possible large win | Profit fell sharply while volume held |
| running hot | Profit jumped without a matching rise in volume |
| volume spike | Turnover or bets well above baseline |
| volume drop | Turnover or bets well below baseline |
| player movement | Players online, or share, moved sharply |
| polling interrupted | The sid was rejected, or polling failed |

Confidence is `high` only when two independent metrics agree and at least one
is `crit`. These are hypotheses, and the wording says so; the findings they
were built from stay visible below them.

## Where alerts go

- **Redis:** every finding is appended to the `stake:<team>:alerts` stream
  (the last 5,000 are kept) and published on the `stake:<team>:alerts:ch`
  channel.
- **The poller's output:** each one is printed under that tick's line, for
  example `WARN traffic concentrating on berry: 41.2% of roster turnover vs
  18.0% baseline`.
- **The dashboards:** **Findings** and **Possible events** on the terminal
  dashboard and on [Live operations](dashboard/live.md).

Nothing is sent outside Redis: there is no email, chat or webhook
integration. To act on alerts from your own tooling, subscribe to the channel;
each message is the alert as JSON:

```bash
redis-cli SUBSCRIBE stake:acme-studios:alerts:ch
```

## Tuning

Every threshold lives under `detect` in `config.json`. Override the ones you
want in `config.local.json`; the rest keep their defaults:

```json
{
  "detect": {
    "zWarn": 5,
    "ratePerMinuteFloors": { "turnover": 100 },
    "levelFloors": { "gameOnlinePlayers": 10 }
  }
}
```

Restart after a change. `detect.windowSamples` must stay larger than
`detect.warmupSamples`, or startup refuses. The full list, with defaults, is
under [Configuration](configuration.md#anomaly-detection). Changing
`pollMinutes` changes what a sample means; see
[Changing the poll interval](configuration.md#changing-the-poll-interval).
