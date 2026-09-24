---
title: Home
nav_order: 1
description: "stake-polling keeps minute-resolution accounting for your Engine studio in Redis, with a web dashboard, a terminal dashboard, anomaly detection and a nightly archive."
permalink: /
---

# stake-polling

Minute-resolution accounting data for **your studio on Engine**
(`studio.engine.io`), kept in Redis, with a web dashboard, a live terminal
dashboard and anomaly detection. It works for any team you can log in to:
point it at your team slug and it polls that team's roster, catalogue, per-mode
stats and balance.

[Try the live demo]({{ site.demo_url }}){: .btn .btn-primary .mr-2 }
[Get started](getting-started.md){: .btn }

![The overview page of the demo dashboard: today in charts, from made-up games](screenshots/overview.png)

*From the demo: every game and figure is made up.*

The demo is a static copy of the real dashboard, built from made-up data for
about twenty fictional games. See [The demo site](demo.md).

## What it is

stake-polling is a Node 22+ collector. Every 2.5 minutes, on the clock, it
reads your team's figures from the Engine studio API and appends them to Redis
streams. Everything else reads those streams.

Four processes, joined only by Redis:

```
bin/stake-poller.mjs ──every 2.5 min──> studio.engine.io/api
          │
          │ one MULTI per tick, then PUBLISH
          v
    redis://127.0.0.1:6379
          │
          ├──> bin/stake-web.mjs      web dashboard (http://<host>:3005)
          ├──> bin/stake-dash.mjs     live terminal dashboard
          └──> bin/stake-archive.mjs  nightly archive, 00:00:00Z ──> S3 or ./stake-polling-logrotate-data
```

The dashboards and the archiver only read the trail. Close them, restart them,
run two of them: the trail is unaffected. Only the poller writes it, and it
holds a lock so a second copy cannot start and double every delta. `npm start`
runs the poller, the web dashboard and the archiver together.

## Features

| Feature | What you get | Read more |
|---|---|---|
| Collector | Polls the roster, catalogue, per-mode stats, balance, daily graph and lifetime window into Redis streams, aligned to the wall clock | [Getting started](getting-started.md) |
| Configuration | Four layers: `config.json`, `config.local.json`, `.env` and the environment, with every key and variable listed | [Configuration](configuration.md) |
| Session handling | Finds a working `sid` on its own, pauses rather than writing bad data when it expires, and resumes when you drop in a new one | [The sid](configuration/sid.md) |
| Captured math | Optional `math.json` with each game's certified model, for noise bands, drift checks and the Game math page | [math.json](configuration/math-json.md) |
| Always on | A launchd agent on macOS, or a short systemd unit on Linux | [Running as a service](service.md) |
| Web dashboard | Overview, Analysis, Settlement, Player insights, Live operations, Trends, Game math, Poll log, Archive, Settings, and a page per game | [The web dashboard](dashboard/index.md) |
| Sign-in | Optional username and password, sessions, CSRF protection and rate limits | [Sign-in and security](security.md) |
| Redis | AOF persistence, authenticated Redis, a memory alert, and the key layout | [Redis](redis.md) |
| Nightly archive | Each finished UTC day gzipped to S3 or a local folder, with a script that sets up a private bucket | [Nightly archive and S3](archive.md) |
| Terminal dashboard | A keyboard-driven roster, game tabs, bet-mode cards, compare and daily views, and plain-text snapshots for scripts | [Terminal dashboard](terminal.md) |
| Anomaly detection | Robust spike and drop detection, share shifts, flat lines, and "possible events" built from them | [Anomaly detection and alerts](anomalies.md) |

## Where to go next

- New here: [Getting started](getting-started.md).
- Something is wrong: [Troubleshooting and FAQ](troubleshooting.md).
- Want to help: [Contributing](contributing.md).

Every studio, game, bucket and figure in these pages is made up, for example
the team `acme-studios` and the games `berry` and `pixel-geyser`.
