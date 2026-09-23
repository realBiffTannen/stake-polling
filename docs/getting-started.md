---
title: Getting started
nav_order: 2
description: "Install stake-polling, give it a session and a team, and check that it is polling."
---

# Getting started
{: .no_toc }

From a fresh clone to a dashboard that fills itself. Allow ten minutes.

1. TOC
{:toc}

## Prerequisites

| You need | Why | Check / install |
|---|---|---|
| An **Engine studio account** with access to the team you want to watch | Every endpoint is authenticated with your session's `sid` cookie, and scoped to one team | You can open `https://studio.engine.io/teams/<your-team-slug>` in a browser |
| Your **team slug** | Names the team to poll, and namespaces its Redis keys | The `<slug>` in `studio.engine.io/teams/<slug>/...` |
| **Node.js 22 or newer**, with npm | The runtime. npm installs the `redis` client, the chart libraries, and the AWS S3 SDK (loaded only when `S3_BUCKET` is set) | `node --version`. macOS: `brew install node`. Linux: [nodejs.org](https://nodejs.org) or your package manager |
| **Redis 5.0 or newer** | Storage: the trail is kept in Redis streams | `redis-cli ping` answers `PONG`. macOS: `brew install redis`. Debian/Ubuntu: `sudo apt install redis-server` |
| **git** | To clone and update | `git --version` |
| *Optional:* **macOS and Google Chrome**, logged in to `studio.engine.io` | Automatic sid recovery reads Chrome's cookie store through the Keychain, and `npm run service:*` installs a launchd agent | Everything else works on Linux too: supply the sid through `.sid` or `STAKE_SID`, and run it under systemd |

## 1. Clone and install

```bash
git clone https://github.com/realBiffTannen/stake-polling.git
cd stake-polling
npm install
```

## 2. Name your studio in config.local.json

Copy the example and fill in the two settings that belong to your install:

```bash
cp config.local.example.json config.local.json
```

```json
{
  "team": "acme-studios",
  "lifetimeStart": "2026-01-01"
}
```

| Setting | Meaning |
|---|---|
| `team` | Your team slug. Required. `STAKE_TEAM` overrides it. |
| `lifetimeStart` | The day (`YYYY-MM-DD`, UTC) lifetime figures and new-player counts are summed from, usually the day your first game went live. Required. `STAKE_LIFETIME_START` overrides it. |

`config.local.json` is gitignored and merged over `config.json` section by
section, so it can also override any shared default (poll interval, alert
thresholds, money share rates, the web host and port) without editing a tracked
file. See [Configuration](configuration.md).

Startup refuses a missing team or an invalid `lifetimeStart`, with a message
that names where to set it.

## 3. Give it a session (the first sid)

Every request to the studio API carries your browser session's `sid` cookie.
Log in to `studio.engine.io`, open DevTools, go to **Application > Cookies >
`sid`**, copy the value, and save it:

```bash
printf '%s' 'PASTE-SID-HERE' > .sid && chmod 600 .sid
```

`.sid` is gitignored. On macOS with Chrome logged in you can skip this step: the
poller finds the cookie itself. Run from a terminal, it also prompts for one if
nothing else works. A sid found in Chrome or typed at the prompt is saved to
`.sid` for next time.

The full story, including what happens when the sid expires, is on
[The sid](configuration/sid.md).

## 4. Optional: secrets and switches in .env

Everything that is a secret or a switch for this machine goes in `.env` at the
repo root. It is gitignored, and every line is optional. Start from the example:

```bash
cp .env.example .env
chmod 600 .env
```

You need it only for an authenticated Redis, a different memory limit, or the
S3 archive. For example:

```bash
REDIS_DB_SIZE=4GB
S3_BUCKET=acme-stake-archive
```

A variable already set in the real environment wins over the file. See
[Configuration](configuration.md#environment-variables) for every variable.

## 5. Start Redis, and keep it running

```bash
brew services start redis                  # macOS (starts at login)
sudo systemctl enable --now redis-server   # Debian/Ubuntu (the unit is "redis" on some distros)
npm run enable-persistence                 # optional: keep the 30-day trail across a Redis restart
```

`enable-persistence` asks before it changes anything, because turning on AOF
edits your global Redis configuration. See [Redis](redis.md#persistence-aof).

## 6. Run it

```bash
npm start                  # poller + web dashboard + nightly archiver; prints the URLs
npm run dash               # optional: the terminal dashboard, in a second terminal
```

`npm start` prints a URL for this machine and one for each network address (with `--host 127.0.0.1`, just the one it is bound to).
Open one (port 3005 by default). The first poll lands within one interval
(2.5 minutes). The 30-day charts fill as the daily sync backfills, which is
about 61 API requests on first launch.

{: .warning }
> The dashboard binds every interface by default, and sign-in is off until you
> turn it on. Anyone who can reach the port can read turnover, profit, player
> counts, per-mode math and the game catalogue, including unreleased titles.
> Keep it on this machine with `npm start -- --host 127.0.0.1`, or turn on
> [sign-in](security.md).

`npm start` takes these options:

| Option | Does |
|---|---|
| `--host <address>` | Where the web dashboard listens. Default `0.0.0.0` (every interface) |
| `--port <number>` | The web dashboard's port. Default `3005` |
| `--no-poll` | Do not start the poller |
| `--no-web` | Do not start the web dashboard |
| `--no-sync` | Start the web dashboard without its daily-history sync (no API requests from it) |
| `--no-archive` | Do not start the nightly archiver |
| `--wait-for-redis <ms>` | Wait up to this long for Redis instead of exiting at once. Default `0` |

Pass them after `--`, for example `npm start -- --host 127.0.0.1 --port 3010`.

If a poller is already running elsewhere (another terminal, a service),
`npm start` follows it rather than starting a second one: the existing poller
keeps its lock and is never signalled.

## 7. Optional: add your math models

The per-mode noise bands, drift checks and the **Game math** page need each
game's certified math. Copy the example and add one entry per game, keyed by
slug, from your studio dashboard's Math tab:

```bash
cp math.example.json math.json
```

See [math.json](configuration/math-json.md).

## 8. Verify it works

The health endpoint answers without a session, even when sign-in is on:

```bash
curl -s http://127.0.0.1:3005/healthz
```

```json
{"ok":true,"version":"1.0.1","collectorStale":false,"dailySyncError":null}
```

- `collectorStale` turns `true` when no poll has succeeded for 2.5 poll
  intervals (6¼ minutes at the default).
- `dailySyncError` names why the daily-history sync stopped, for example `AUTH`
  when it has no valid sid.

Then check each part:

| Check | Expect |
|---|---|
| The terminal where `npm start` runs | `sid accepted from file (1a2b3c4d)`, then `polling https://studio.engine.io/api/teams/acme-studios into redis://127.0.0.1:6379 every 2.5 minutes, aligned to the clock`, then a `tick` line every 2.5 minutes |
| The web dashboard header | **Collector connected**, "Polled 40s ago", and the poll progress bar filling |
| `npm run dash` | The roster, with each game's figures |
| `redis-cli --scan --pattern 'stake:acme-studios:*'` | The team's keys, such as `stake:acme-studios:ts:team` |
| `npm test` | The whole suite passes. Some suites need a local Redis; see [Contributing](contributing.md#tests) |

The first tick prints `first sample, no delta yet`: there is nothing to
difference against until the second tick.

## Next steps

- Keep it running across reboots: [Running as a service](service.md).
- Turn on sign-in before you share the URL: [Sign-in and security](security.md).
- Keep more than 30 days: [Nightly archive and S3](archive.md).
- Tune the poll interval or alert thresholds: [Configuration](configuration.md).
