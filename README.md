# stake-polling



Minute-resolution accounting data for **your studio on [Engine](https://studio.engine.io)**, kept
in Redis, with a web dashboard, a live terminal dashboard and anomaly detection. It works for any
team you can log in to: point it at your team slug and it polls that team's roster, catalogue,
per-mode stats and balance.

> **Support the project.** stake-polling is free and open source. If it is useful to your studio,
> a donation funds its continued development, improvements and new iterations. The same addresses
> are on the dashboard's **Donations** page.
>
> | Asset | Address |
> |---|---|
> | ETH | `0x485496ACF522083a433556C2652fcD2FBa3211Bb` |
> | USDT | `0x485496ACF522083a433556C2652fcD2FBa3211Bb` |
> | SOL | `FFwvJa8Tt8etgFAb3gG8iVMQTd2uyKq1UBqtaSZ9jfsz` |
> | BTC | `bc1q97n73mmc9g7s2v7ydstg2h564gvr6593v5n5e0` |
>
> Thank you.

<img width="1511" height="833" alt="Screenshot 2026-09-22 at 5 38 55 PM" src="https://github.com/user-attachments/assets/460ad7d7-2c8c-4d3b-887b-079c64d1fc41" />
<img width="1512" height="711" alt="Screenshot 2026-09-22 at 5 39 06 PM" src="https://github.com/user-attachments/assets/449136b2-1867-4f3a-9520-6174c1a9344b" />
<img width="1499" height="652" alt="Screenshot 2026-09-22 at 5 39 51 PM" src="https://github.com/user-attachments/assets/a73d1a1a-2782-4e58-9f07-726d8128e769" />
<img width="1482" height="620" alt="Screenshot 2026-09-22 at 5 40 01 PM" src="https://github.com/user-attachments/assets/cf9c0dc0-17c4-4613-91f5-8b6a2f09a771" />


Three processes, joined only by Redis:

```
bin/stake-poller.mjs ──every 2.5 min──> studio.engine.io/api
          │
          │ one MULTI per tick, then PUBLISH
          v
    redis://127.0.0.1:6379
          │
          ├──> bin/stake-web.mjs    web dashboard (http://<host>:3005)
          └──> bin/stake-dash.mjs   live terminal dashboard
```

The dashboards only read. Close them, restart them, run two of them - the trail is
unaffected. Only the poller writes, and it holds a lock so a second copy cannot
start and double every delta. `npm start` runs the poller and the web dashboard together.

## Use it for your own studio

### Prerequisites

| You need | Why | Check / install |
|---|---|---|
| An **Engine studio account** with access to the team you want to watch | Every endpoint is authenticated with your session's `sid` cookie, and scoped to one team | You can open `https://studio.engine.io/teams/<your-team-slug>` in a browser |
| Your **team slug** | Names the team to poll, and namespaces its Redis keys | The `<slug>` in `studio.engine.io/teams/<slug>/...` |
| **Node.js 22 or newer**, with npm | Runtime (the only npm dependency is the `redis` client) | `node --version`. macOS: `brew install node`. Linux: [nodejs.org](https://nodejs.org) or your package manager |
| **Redis 5.0 or newer** | Storage: the trail is kept in Redis streams | `redis-cli ping` answers `PONG`. macOS: `brew install redis`. Debian/Ubuntu: `sudo apt install redis-server` |
| **git** | To clone and update | `git --version` |
| *Optional:* **macOS + Google Chrome**, logged in to `studio.engine.io` | Automatic sid recovery reads Chrome's cookie store through the Keychain, and `npm run service:*` installs a launchd agent | Everything else works on Linux too: supply the sid through `.sid` or `STAKE_SID`, and run it under systemd (below) |

### Set up

1. **Clone and install.**

   ```bash
   git clone https://github.com/realBiffTannen/stake-polling.git
   cd stake-polling
   npm install
   ```

2. **Name your studio.** Copy the example and fill in the two settings that belong to your
   install:

   ```bash
   cp config.local.example.json config.local.json
   ```

   ```json
   {
     "team": "your-team-slug",
     "lifetimeStart": "2026-01-01"
   }
   ```

   | Setting | Meaning |
   |---|---|
   | `team` | Your team slug. Required. `STAKE_TEAM` overrides it. |
   | `lifetimeStart` | The day (`YYYY-MM-DD`, UTC) lifetime figures and new-player counts are summed from - usually the day your first game went live. Required. `STAKE_LIFETIME_START` overrides it. |

   `config.local.json` is gitignored and merged over `config.json` section by section, so it can
   also override any shared default (poll interval, alert thresholds, money share rates, the web
   host and port) without editing a tracked file. See **Configuration** below.

3. **Give it a session.** Log in to `studio.engine.io` in a browser, open DevTools → Application →
   Cookies → `sid`, and save the value:

   ```bash
   printf '%s' 'PASTE-SID-HERE' > .sid && chmod 600 .sid
   ```

   On macOS with Chrome logged in you can skip this: the poller finds the cookie itself. On a
   terminal it also prompts for one if nothing works. See **The sid** below.

4. **Start Redis**, and keep it running across restarts:

   ```bash
   brew services start redis                  # macOS (starts at login)
   sudo systemctl enable --now redis-server   # Debian/Ubuntu (the unit is "redis" on some distros)
   npm run enable-persistence                 # optional: keep the 30-day trail across a Redis restart
   ```

5. **Run it.**

   ```bash
   npm start                  # poller + web dashboard; prints the URL
   npm run dash               # optional: the terminal dashboard, in a second terminal
   ```

   Open the printed URL (port 3005 by default). The first poll lands within one interval; the
   30-day charts fill as the daily sync backfills (about 61 API requests on first launch).

6. **Optional: add your math models.** The per-mode noise bands, drift checks and the **Game math**
   page need each game's certified math. Copy the example and add one entry per game, keyed by slug,
   from your studio dashboard's Math tab. See **math.json** below.

   ```bash
   cp math.example.json math.json
   ```

7. **Check it.**

   ```bash
   curl -s http://127.0.0.1:3005/healthz      # {"ok":true,"collectorStale":false,...}
   npm test                                    # the whole suite; store tests need a local Redis
   ```

### Start it on every boot

#### macOS (launchd)

```bash
npm run service:install      # start at login, restart after a crash
npm run service:status       # loaded? running? which pid? last exit code? is Redis a login service?
npm run service:uninstall
```

`service:install` writes a launchd user agent that runs `npm start`'s `bin/stake-up.mjs` (see
**Always on, across reboots** below for exactly what it does). It starts when you **log in**,
because sid recovery needs your Keychain. To have it running after a reboot with nobody at the
keyboard:

1. Make Redis start with your session: `brew services start redis`.
2. Turn on automatic login: System Settings → Users & Groups → *Automatically log in as* → your
   user. (macOS does not offer this while FileVault is on. In that case the machine waits at the
   FileVault unlock screen after a reboot until someone logs in.)
3. Turn on System Settings → Energy → *Start up automatically after a power failure* if the machine
   should come back by itself.

The agent's label is `local.stake-polling` unless you set your own reverse-DNS label in
`config.local.json`:

```json
{ "service": { "label": "com.yourstudio.stake-polling" } }
```

#### Linux (systemd)

There is no installer for systemd. The unit is short enough to write by hand:

```ini
# /etc/systemd/system/stake-polling.service
[Unit]
Description=stake-polling collector and web dashboard
After=network-online.target redis-server.service
Wants=network-online.target

[Service]
Type=simple
User=youruser
WorkingDirectory=/home/youruser/stake-polling
# An absolute path to node: with nvm, use the output of `which node`.
ExecStart=/usr/bin/node bin/stake-up.mjs --host 127.0.0.1 --port 3005
# Wait for Redis rather than exiting when it is a moment slower to start.
Environment=STAKE_WAIT_FOR_REDIS_MS=180000
Restart=on-failure
RestartSec=30

[Install]
WantedBy=multi-user.target
```

```bash
sudo systemctl daemon-reload
sudo systemctl enable --now redis-server stake-polling
systemctl status stake-polling
journalctl -u stake-polling -f
```

Under systemd the sid comes from `.sid` (or `STAKE_SID` in the unit): Chrome cookie recovery is
macOS-only. When the sid expires, the poller pauses and the dashboard shows `SID EXPIRED`. Write a
fresh value to `.sid` and polling resumes on the next tick, with no restart.

## Running everything

    npm start

Starts the collector and the dashboard together. If a poller is already
running elsewhere, this one follows it rather than starting a second: the
existing poller keeps its lock and is never signalled.

The dashboard binds every interface, so other machines on the network can
open the printed URL. **It is unauthenticated** - anyone who can reach the
port can read turnover, profit, player counts, per-mode math and the game
catalogue, including unreleased titles. To keep it on this machine only:

    npm start -- --host 127.0.0.1

## Always on, across reboots

    npm run service:install      # start at login, restart after a crash
    npm run service:status       # loaded? running? which pid? last exit code?
    npm run service:uninstall

`service:install` writes a launchd **user agent** to
`~/Library/LaunchAgents/<label>.plist` (`local.stake-polling` unless
`service.label` in `config.local.json` says otherwise) and loads it into
your login session. It runs the same `bin/stake-up.mjs` as `npm start`, with
the host and port from the config unless you pass `--host` / `--port`.
Output goes to `~/Library/Logs/stake-polling/{out,err}.log`:

    tail -f ~/Library/Logs/stake-polling/out.log

Three things about it are deliberate, and each one is a trade:

**It restarts after a crash, not after a clean stop.** `KeepAlive` is
`SuccessfulExit: false` rather than a bare `true`. A bare `true` relaunches the
job however it exited, which leaves no way to stop the collector short of
uninstalling it. `ThrottleInterval` is 30 seconds, so a job that crashes on
startup backs off instead of spinning.

**It starts at login, not at boot.** A `LaunchDaemon` would run before anyone
logs in, but sid recovery reads Chrome's cookie store through the Keychain,
which a root daemon has no access to - a pre-login daemon would go permanently
paused the first time the sid expired. The cost is stated plainly: if the
machine reboots and nobody logs in, nothing polls.

**It waits for Redis instead of exiting.** At login launchd reliably beats
brew's `redis-server` to the punch. Started by hand, a missing Redis is a
mistake worth reporting at once and `npm start` still exits immediately; under
the agent, `STAKE_WAIT_FOR_REDIS_MS` (180 s) turns that into a wait, because
exiting on a two-second ordering gap makes a throttled crash loop that reads
as "the poller is broken". Redis itself is left alone - `service:status`
reports whether it is a brew login service and tells you the command, the same
way `enable-persistence` asks before touching global Redis config.

One failure mode is worth knowing, because launchd reports it only to the
system log: if the plist names an interpreter that later disappears - what an
`nvm` upgrade does, since the path carries the version number - the agent
silently stops starting. `service:status` checks the recorded path on every
run and says `BROKEN` when it has gone. The fix is `npm run service:install`
again, which rewrites the plist with the node you are running now.

## The sid

Every endpoint is authenticated with the `sid` cookie. The poller looks for one
in this order, and validates each candidate against the live API before
accepting it — a stale value in an earlier source falls through instead of
wedging the poller:

| Order | Source | Notes |
|---|---|---|
| 1 | `STAKE_SID` | environment variable |
| 2 | `.sid` | file in the project root, mode 600, gitignored |
| 3 | Chrome | the `sid` cookie from your logged-in profile |
| 4 | you | hidden prompt at the terminal, on startup |

**Getting a fresh one by hand:** open a logged-in `studio.engine.io` tab,
DevTools → Application → Cookies → `sid`, and either paste it at the prompt or
write it to `.sid`.

**When it expires mid-run,** the poller pauses rather than writing fiction into
the trail. It then tries to recover on its own, once a minute:

- if `.sid` has changed, it validates the new value and resumes;
- otherwise it re-reads the Chrome cookie store, at most once every ten minutes.

If neither works it keeps running, paused, and the dashboard shows a red
`SID EXPIRED` banner. Drop a new sid into `.sid` and polling resumes on the next
tick — no restart.

The Chrome path reads `~/Library/Application Support/Google/Chrome/<profile>/Cookies`
and decrypts it with the Keychain `Chrome Safe Storage` key, which triggers a
one-time macOS authorisation prompt. It is best-effort: it returns nothing if
Chrome is absent, the profile moved, or the encryption scheme changed, and the
terminal prompt always works.

**The sid is never logged, never stored in Redis, and never included in an
error message.** Only `sha256(sid)[0:8]` is recorded, which is enough to tell
"the sid changed" from "the same sid is still failing".

## What is polled

| Endpoint | Every | What it gives |
|---|---|---|
| `/teams/{team}/stats` | 5 min | the roster — an **array** of `{ name, slug, stats: { count, turnover, profit, expectedProfit, unique } }` |
| `/teams/{team}/games` | 5 min | the whole catalogue (every title, not just the roster's live ones), with `onlinePlayers` and `stats.month` / `stats.day` **per game** |
| `/teams/{team}/games/{slug}/stats` | 5 min | per-mode breakdown under `stats` — BASE, BONUS_BOOST, FREE_SPINS and so on, with cost, rtp, effectiveRtp |
| `/teams/{team}/balance` | 5 min | `{ position, expectedProfit, carry }` — the balance is **not** in the roster response |
| `/teams/{team}/graph` | 15 min | `{ profit: [], turnover: [], count: [] }` — parallel arrays, one entry per day |
| `/teams/{team}/stats?start=&end=` | 60 min | the same roster over the lifetime window (from `lifetimeStart`) |

### Games that go live mid-run

Discovery takes the **union** of two sources, because they disagree at exactly
the moment that matters:

| Source | Knows | Blind spot |
|---|---|---|
| `/stats` | figures | only lists a game once it *has* figures |
| `/games` | `isLive`, the instant it flips | no per-mode detail |

Observed live: every catalogue title reported `published: true`, and exactly
the `isLive: true` ones were the roster. So `published` is useless as a
liveness test, and the rest return 404 on the per-game endpoint. `src/games.mjs` owns that rule for both the poller and the dashboard
so it cannot drift between them.

A game that is live but not yet on the roster gets polled, gets a per-mode
trail, and gets a dashboard row showing **dashes and its real concurrent
player count** — "live, nothing yet". It does not show `$0.00`, which would
claim a measurement nobody made.

The first tick that sees a slug it has never seen raises a `new_game` finding.
A cold start is exempt: the poller seeds what it already knew from the stored
roster and catalogue snapshots, so a restart is silent but a game that went
live *during* the downtime is still announced.

### Three things the endpoint table does not tell you

These were each found the hard way, on the first live run — every per-game
request 404'd and the lifetime window 400'd:

1. **Games are addressed by `slug`, never by display name.** `pixel-nest` is
   200; `Pixel Nest` is 404. The slug is the identity everywhere in this
   project: URLs, Redis keys, trail lookups, alert subjects.
2. **The windowed query takes epoch seconds.** ISO dates answer `400`, epoch
   milliseconds answer `500`.
3. **`onlinePlayers` is per game, not per team.** The team figure is the sum
   across the catalogue, and the roster's own metrics are nested one level down
   under `stats`.

The captured shapes live in `test/fixtures/live.mjs` and the tests assert
against them, so a repeat of any of the above fails the suite rather than the
poller.

The poller runs every **2.5 minutes** (`pollMinutes`). Ticks are aligned to the
wall clock — :00:00, :02:30, :05:00 — not to a timer started when the process booted, so
samples land on the same timestamps across restarts and never drift. A tick
that overruns its slot is skipped rather than queued.

### Changing the interval

`pollMinutes` is the only number to change. Everything time-based is derived
from it, because when the interval first moved from one minute to five, three
separate settings silently changed meaning:

| Configured as | Derived | At 1 min | At 5 min |
|---|---|---|---|
| `intervals.graph: 15` (minutes) | every 15 ticks / every 3 ticks | 15 min | 15 min |
| `retention.trailDays: 30` | `trailMaxLen` | 43,200 | 8,640 |
| `ratePerMinuteFloors.turnover: 50` | floor per tick | $50 | $250 |

Rate floors scale with the interval — five minutes accumulates five minutes of
volume — while **level** floors (`levelFloors`, concurrent players) do not:
twenty-five players online is twenty-five players however often it is read.

Startup refuses a `windowSamples` no larger than `warmupSamples`: no metric
could ever reach the sample count it needs, and the detector would go silent
without saying so.

At 5 minutes the detector's baseline spans `36 samples = 3 hours` and a metric
warms up in `12 samples = 1 hour`. Polling less often buys a longer, steadier
baseline at the cost of resolution: the smallest change that can be seen is
five minutes wide.

Base URL is `https://studio.engine.io/api`, overridable with `STAKE_API_URL`.

## Keys

Namespace `stake:<team>:`.

| Key | Type | Contents |
|---|---|---|
| `roster:latest` | string | `{ ts, endpoint, ok, data }` envelope |
| `games:latest` | string | as above |
| `game:{game}:latest` | string | per-mode breakdown for one game |
| `graph:latest` | string | 90-day daily buckets |
| `lifetime:latest` | string | the roster over the lifetime window |
| `ts:team` | stream | `balance`, `turnover`, `profit`, `expectedProfit` |
| `ts:online` | stream | `onlinePlayers`, day and month totals |
| `ts:{slug}` | stream | `count`, `turnover`, `profit`, `unique`, `expectedProfit`, `onlinePlayers` |
| `ts:{slug}:modes` | stream | per-bet-mode counters, keyed `MODE:field` — `BASE:profit`, `FREE_SPINS:turnover`, … |
| `summary` | stream | the five-minute running action log, capped at a week |
| `balance:latest` | string | `{ position, expectedProfit, carry }` |
| `alerts` | stream | every raised anomaly |
| `meta` | hash | `last_ok`, `auth_state`, `consecutive_failures`, `sid_fingerprint`, … |
| `lock:poller` | string | single-instance lock, `SET NX EX 90` |

Channels `tick` and `alerts:ch` are published after each tick so the dashboard
repaints immediately instead of waiting for its next heartbeat.

Every snapshot carries its own fetch timestamp, so a failed endpoint leaves the
previous value in place and you can still tell how old it is. Trails are capped
at 8640 entries — 30 days at one sample every five minutes.

Values from the API are month-to-date **cumulative** totals. They are stored as
reported; the rate is derived when it is needed.

A step backwards is **not** automatically a month rollover, and treating it as
one was an expensive bug. Two different things make the series fall:

- a **reset** collapses the counter towards zero (month rollover). The new
  value is that minute's whole volume.
- a **correction** edges it down slightly — a settled or voided bet, or two
  reads either side of a replication lag. Observed live: `154,869,581,036 →
  154,868,656,683`, a 92-cent drop on a $154,000 counter. Read as a reset it
  became a **$154,868 delta**, which both wrecked the day total and would have
  fired a false spike alert.

The test is on **magnitude**, at 5% of the previous reading. Magnitude matters
because `profit` is signed and legitimately runs negative: comparing values
read every step further into the red as a reset, and reported a whole month of
losses as one minute's.

## Money units

**Every monetary figure from the API is in micro-dollars.** A turnover of
`154,868,660,000` is `$154,868.66`. Nothing in the endpoint responses says so.

The studio accounting page also applies two share rates rather than showing the
gross figure, and the dashboard reproduces both so the two agree:

| Shown | Derived from | Page label |
|---|---|---|
| turnover | `raw / 1e6` | Turnover |
| profit | `raw / 1e6 x 10%` | Profit (10% ggr) |
| expected | `raw / 1e6 x 7.5%` | Expected (7.5% of turnover * edge) |

The rates live in `config.json` under `money`. The scale is confirmed by an
identity the balance endpoint satisfies exactly:

    position = carry + (month-to-date profit x profitShare)

Checked against the studio accounting page, every game agrees to well under a
percent; the residual is only that the page's window and the poller's
month-to-date window differ.

**Raw units are what gets stored.** The trail is a faithful record of what the
API said, and the detector works on raw values directly. Conversion happens
only at the point of display — and in the detector's floors, which is why
`detect.floors.turnover` is written as `50` meaning fifty dollars per minute.

`RTP` is deliberately computed from the **gross** figures (`1 - profit /
turnover`): it is a property of the game, not of the studio's share of it.

## Persistence

Redis ships with AOF off. Without it the 30-day trail lives only until the next
restart, so the poller warns at startup and the dashboard header shows
`aof off`. Turning it on edits your global Redis config and affects every
database on that server, so it is opt-in:

```bash
npm run enable-persistence
```

## The accounting day

The day rolls at `dayBoundaryUtcHour` UTC - **00:00 UTC** in the shipped
`config.json`; set it in `config.local.json` to roll at another hour (the
examples below were taken with it at 12). "Profit since 12:00Z" is accumulated from this project's own
minute trail, not from the API's day bucket, so it is exact to the minute and
survives a month rollover mid-window.

It can only cover what the poller was running for. Until the trail spans the
whole window the header says `(partial - trail starts HH:MMZ)`, and a game with
no samples in the window shows `-` rather than `$0.00` — a zero there would
claim a measured quiet period rather than an absence of measurement.

### Every day, not just this one

`d` (or `--view daily` from a pipe) lists profit **per accounting day**, one
row per 12:00Z-to-12:00Z day, newest first, with the whole roster beside each
game:

```
daily profit   12:00Z -> 12:00Z, newest first
DAY                           TOTAL        berry  neon-city-heist  lunar-blossom
09-16 -> 09-17 so far       +$41.20      +$12.10           -$3.40        +$32.50
09-15 -> 09-16             -$224.16     -$134.15          -$76.03        -$13.98
09-14 -> 09-15 partial      +$88.02      +$88.02                -              -
```

A day straddles two calendar dates, so each row names both. `so far` is the
day still being filled - its TOTAL agrees with the header's "day since 12:00Z"
profit, because both attribute a delta to the sample it arrived on. `partial`
is a day the trail only covers part of (the poller started, or was down across
the boundary, more than about half an hour into it). Days before the trail
began are not drawn; a day *inside* the trail that nothing was measured in keeps
its row and reads `-`. Figures are the studio share, like every other PROFIT
column.

The table reaches back as far as the trail is kept (`retention.trailDays`). That
is a month of samples per game against the one day every other view reads, so
it is only read while this view is open, and only re-read when the poller
writes - not on every one-second repaint. A narrow terminal sheds game columns
from the right (smallest turnover first); the piped form prints them all.

### Losses are red

Every PROFIT figure the terminal draws - the header, the roster's PROFIT,
PROFIT/rate and DAY PROFIT columns, a game's tabs, the bet-mode card, the
compare screen, the bucket table and the daily table - is red below zero,
green otherwise, and a dim `-` when it was never measured. Piped output carries
no escapes at all; there the sign is the only signal.

## Panes

The dashboard shows three layers, coarsest first:

**POSSIBLE EVENTS** — what might be happening, in a sentence. Findings are
grouped per game and matched against known signatures: players and volume
climbing together is a `traffic surge`; profit falling while volume holds is a
`possible large win`; a busy game going silent is a `possible outage`.
Confidence is `high` only when two independent metrics agree and at least one
is critical. These are hypotheses and the wording says so — the findings they
were built from stay visible below.

**RUNNING ACTION (5 min)** — one line every five minutes recording what the
roster actually did: bets, turnover, profit, how many games were active, the
biggest mover, and what fired. Written by the poller into the `summary` stream
(a week of history) so the answer to "what happened while I was away" is
already written down rather than reconstructed from the trail.

**FINDINGS** — the raw alerts, newest first.

## Anomalies

Detection runs on per-tick deltas, against a rolling **median and MAD**
baseline of the last 36 samples (three hours at a five-minute poll). Median rather than mean because a 40x spike drags a mean and
inflates a standard deviation — the spike would end up hiding inside the
baseline it is measured against.

| Kind | Fires when |
|---|---|
| `spike` / `drop` | robust z ≥ 4 (warn) or ≥ 6 (crit) **and** the change clears the metric's absolute floor. Watches per-game turnover, spins, profit and concurrent players, plus team-wide concurrent players |
| `share_shift` | a game's share of roster turnover moves ≥ 15 points from its baseline share — "traffic is concentrating on this game" |
| `flat_line` | a previously busy game reports zero turnover for 15 consecutive minutes — usually an outage |
| `auth` | the sid was rejected |
| `poll_failure` | no endpoint answered for three consecutive minutes |
| `new_game` | a slug appeared that this poller had never seen — raised outside the detector, so it does not wait out the 12-sample warm-up |

The absolute floors are written in **dollars per minute**
(`ratePerMinuteFloors`) and scaled both to raw units and to the poll interval
internally. They are what stop a
two-dollar game paging you at 4am. A metric
needs 12 samples before it can alert at all — an hour at a five-minute poll —
so a fresh start is quiet.

`share_shift` deliberately does **not** fire when the whole roster rises
together — it answers "is this game taking the traffic", not "is it busy".

Per-game `onlinePlayers` carries its own much lower floor
(`floors.gameOnlinePlayers`, default 5) than the team-wide figure
(`floors.onlinePlayers`, default 25). Five players arriving on one quiet game is
an event; five more across the whole roster is noise. Concurrency also moves
before turnover does, so this is usually the first rule to fire.

Each `(game, metric, kind)` has a 15-minute cooldown. A condition still true
after that re-fires once at `crit` and then stays quiet. Silence means "nothing
new", not "problem solved".

All thresholds live in `config.json` under `detect`.

## Dashboard keys

| Key(s) | Does |
|---|---|
| `q`, `ctrl-c` | quit |
| `↑`/`↓`, `k`/`j` | move the selection |
| `→`, `↵` (enter) | open — descend a level |
| `←`, `⌫` (backspace), `esc` | back — ascend a level |
| `home`/`end` | jump to the top or bottom of the list |
| `page up`/`page down` | move a page at a time |
| `1` `2` `3` `4` | jump straight to a game's tab: HEALTH / LIVE / TODAY / BUCKETS |
| `tab`, `shift-tab` | cycle a game's tabs forward / backward |
| `g` | cycle the drill-down through the roster, without descending |
| `h` | cycle the bucket size: five minutes, then the hour, then off |
| `c` | compare one bet mode across every game in the roster |
| `d` | daily profit: one row per 12:00Z-to-12:00Z accounting day |
| `[` / `]` | step which bet mode the compare screen is showing |
| `s` | cycle sort: turnover, turnover/min, profit, spins, name — roster, the per-mode table on a game's tabs, and the compare screen |
| `a` | toggle the alerts / events / running-action panes |
| `/` | open a filter prompt |
| `f` | freeze the screen (stop reading Redis until unfrozen) |
| `r` | repaint now |
| `?` | toggle the in-app help overlay (lists every binding above) |

The `a` key toggles all three lower panes together. `h` still does what it
always did — cycle the bucket size — it did **not** become the vim-style
"back" key; that is `←` (also `⌫` and `esc`), which now mirrors `→`/`↵` for
descending the same way `esc` has always mirrored `↵`. Existing muscle memory
for `g h s a r q` is unchanged.

One note on `/`: while the prompt is open it swallows every subsequent
keystroke — movement, tabs, even letters normally bound to other keys (`c`,
`g`, `h`, `r`, `s`, ...) — as literal text, until you press `enter` or back out
with `esc`/`⌫`/`←`. Applied, the filter narrows the roster to game slugs that
contain the typed substring, case-insensitively, and states how many games it
hid:

```
filter "berry" - showing 1 of 14 games (13 hidden, esc clears)
```

`enter` applies the filter and closes the prompt (the narrowed table and the
hidden-count line both persist); `esc` cancels the prompt outright and reverts
to no filter; `⌫` (backspace) edits the typed text one character at a time
without closing the prompt. `esc` on the roster with a filter already applied
(prompt already closed) clears it back to showing everything.

Piped or redirected (`npm run dash > snapshot.txt`) it prints one plain-text
snapshot and exits, so it is usable from a script. Every view reachable from
the keyboard is reachable this way too, since a redirected dashboard has
nobody to press a key:

```sh
node bin/stake-dash.mjs --view health --game metro-night-run
node bin/stake-dash.mjs --view mode --game metro-night-run --mode VIPER_VAULT
node bin/stake-dash.mjs --view compare --mode ANTE
node bin/stake-dash.mjs --view daily
```

`--view` accepts `roster`, `health`, `live`, `today`, `buckets`, `mode`,
`compare` or `daily` (the same list `bin/stake-dash.mjs` prints if you get it
wrong); `mode` and `compare` also take `--mode`, and any per-game view takes
`--game <slug>`.
`--bucket 1h --game <slug>` (or `--bucket 5m`) still works — it is the old
spelling of `--view buckets --game <slug> --bucket 1h`, from before `--view`
existed.

## Drilling into a game

`↵` (or `→`) on a roster row descends into that game; `←` (also `⌫`, `esc`)
comes back up — three levels deep:

    roster  →  one game, four tabs  →  one bet mode

`1`–`4` (or `tab`/`shift-tab`) switch a game's tab without leaving it; `↵` on
a row in any tab opens that one bet mode in full. `c` sidesteps the hierarchy
entirely: pick a bet mode name and see it down every game in the roster that
runs it, stepping with `[`/`]`.

**The four tabs** (`src/tui/views/game.mjs`):

| Tab | Columns | Built from |
|---|---|---|
| `1` HEALTH | MODE, COST, AVGBET, SPINS, TURNOVER, PROFIT, RTP, EFF, NORM, EDGE_API, vs EXP | the latest snapshot only |
| `2` LIVE | MODE, SPINS/rate, TURN/rate, PROFIT/rate, SHARE, a 12-tick sparkline | per-poll deltas from the per-mode trail |
| `3` TODAY | MODE, SPINS, TURNOVER, PROFIT, SHARE | totals since the 12:00Z accounting boundary |
| `4` BUCKETS | the same profit-by-bucket table as **Profit by hour**, below, scoped to this game | the trail, at whatever size `h` last picked (5m by default) |

A narrow terminal drops columns by priority rather than truncating the table —
MODE and RTP survive longest; EDGE_API and vs EXP (the two least essential
columns) go first, followed by NORM and AVGBET.

Every per-mode table (HEALTH/LIVE/TODAY here, and the compare screen below)
also honours `s`: pressing it cycles the same sort roster uses (turnover,
turnover/min, profit, spins, name), and the header states the active sort
once it differs from the canonical order shown by default — BASE-first,
then alphabetical for a game's tabs; roster order for compare.

**HEALTH works on the first frame.** It is built only from the latest
snapshot, which the poller has always kept, so nothing on it waits for the
trail. **LIVE and TODAY need the per-mode trail instead**, which is
forward-only and only starts accumulating once this ships; until it has
enough samples they show `-`, never a fabricated `$0.00` or `0`.

Here is the HEALTH tab for the `metro-night-run` fixture the test suite
itself renders against (`test/fixtures/live.mjs`'s `metroGameStats`, run
through the project's own `buildModeRows`/`renderPlain` against
`test/fixtures/math.json` and `config.json` — the same code path `--view health` uses):

```
metro-night-run   HEALTH   [*health* live today buckets]
MODE                COST  AVGBET     SPINS      TURNOVER        PROFIT     RTP     EFF    NORM  EDGE_API        vs EXP
BASE                  1x    0.25    48,210    $12,000.00       -$42.00   95.50  103.50   94.90      4.50       -$96.00
ANTE                  3x    0.25     6,104     $4,560.00       +$20.52   95.50   89.00   95.12      4.50         $0.00
COASTAL_CRUISER     100x    0.25       240       $600.00        +$2.70   95.50   95.50   95.50      4.50         $0.00
ICY_SPINOUT         150x    0.25        96       $360.00        +$1.62   95.50   95.50   95.50      4.50         $0.00
VIPER_VAULT          75x    0.25       812     $1,522.50        +$6.85   95.50   95.50   95.50      4.50         $0.00

VERDICT
  BASE               margin is noise: +/-20.81% at n=48,210, against a 4.50% edge. Needs ~20,881,245 rounds for +/-1pp.
  ANTE               margin is noise: +/-34.29% at n=6,104, against a 4.50% edge. Needs ~7,178,113 rounds for +/-1pp.
  COASTAL_CRUISER    margin is noise: +/-11.68% at n=240, against a 4.50% edge. Needs ~32,769 rounds for +/-1pp.
  ICY_SPINOUT        margin is noise: +/-18.90% at n=96, against a 4.50% edge. Needs ~34,307 rounds for +/-1pp.
  VIPER_VAULT        margin is noise: +/-5.14% at n=812, against a 4.50% edge. Needs ~21,454 rounds for +/-1pp.
```

**A margin nobody can read says so.** Every mode above gets a `VERDICT` line
because every one of them is noise at its current sample size — that is the
point of the tab, not an artefact of the example. The band is `σ/√N` from
`math.json` (see **math.json** below), and it is computed only ever per bet
mode: across a whole game, one 150x buy dominates the sum of squared stakes,
and the same formula would understate the noise by an order of magnitude if
it were run at the game level instead. Where `math.json` has no entry for a
game or a mode, the sample size still prints and no band is claimed — never a
guessed one.

**Opening one bet mode** (`↵` again, or `--view mode --mode <NAME>`) trades
the table for a full card: cost/avgBet/spins, turnover/profit/expected/vs
expected, the same per-poll and per-day rates as LIVE/TODAY, the game's whole
cost ladder with this mode's own rung picked out, the convergence line above,
a sparkline of this mode's own profit history at the current bucket size, and
its findings in full.

**Compare** (`c`, step with `[`/`]`) is deliberately snapshot-only: it calls
`buildModeRows` once per game with an empty trail, so opening it costs no
extra Redis reads — every rate/delta column that needs a trail comes back
null, and only the month-to-date snapshot figures show. It defaults to roster
order and is sortable by any column with `s`, exactly like the per-mode
tables above; the header names the active sort once it stops being the
default.

## math.json

`math.json`, at the project root, is your optional captured math model - RTP,
volatility and paytable figures taken from each game's certified math at
capture time, keyed by slug. It is **gitignored**: it describes your games,
not the project's. Start from `math.example.json`, and add one entry per game
from your studio dashboard's Math tab (distribution summary and statistics
validation). The API does not serve these figures, so they are entered by hand;
update an entry when you publish a new math version.

It is read once at startup (`loadMathModel` in `src/math/checks.mjs`), so
restart after editing it; a missing or malformed file degrades to `{}` rather
than crashing, and every check below treats an absent game or mode as "not
captured" rather than guessing at one.

An entry, trimmed to the fields the dashboard reads (`math.example.json` has
the full shape):

```json
{
  "metro-night-run": {
    "version": 6,
    "edge": 0.045,
    "maxWin": 50000,
    "costLadder": [1, 3, 75, 100, 150],
    "tail": { "5000": 1.0e-4, "10000": 7.4e-5, "25000": 1.9e-5, "50000": 3.0e-6 },
    "modes": {
      "BASE":            { "cost": 1,   "sigma": 45.696,  "zeroRate": 0.7246, "worstLossStreak": 65  },
      "ANTE":            { "cost": 3,   "sigma": 26.792,  "zeroRate": 0.7303, "worstLossStreak": 174 },
      "VIPER_VAULT":     { "cost": 75,  "sigma": 1.4647,  "zeroRate": 0.0,    "worstLossStreak": 22  },
      "COASTAL_CRUISER": { "cost": 100, "sigma": 1.8102,  "zeroRate": 0.0,    "worstLossStreak": 32  },
      "ICY_SPINOUT":     { "cost": 150, "sigma": 1.8522,  "zeroRate": 0.0,    "worstLossStreak": 21  }
    }
  }
}
```

Each field the dashboard actually reads has exactly one consumer, all in
`src/tui/math.mjs`:

| Field | Consumer |
|---|---|
| `edge` | compared against the deployed `1 - rtp` to raise `model_drift`, and against the convergence band to decide `readable` vs `noise` |
| `maxWin` | the outer bound of `impossible_margin` — a margin outside `[-maxWin, 100%]` is a plumbing bug, not variance |
| `costLadder` | the ladder shown on the bet-mode focus card, with the current mode's own rung picked out |
| `modes.<NAME>.sigma` | the `σ/√N` convergence band |
| `modes.<NAME>.zeroRate` / `worstLossStreak` | the `expected_quiet` finding — a zero-profit mode going quiet for fewer spins than its captured worst losing streak is its design, not an outage |

`version` and `tail` are captured and stored, but **nothing in the dashboard
reads either one yet** — they are recorded against the day something does.
Per-mode `cost` is likewise stored but unused: the `COST` column always comes
from the live snapshot, never from the model.

A game or mode with no entry degrades exactly as `metro-night-run` would if
it were deleted from this file: the sample size still prints, no band is
claimed, and `model_drift`/`impossible_margin`/`expected_quiet` simply don't
fire — each is guarded on the model field it needs existing at all, not on
that field coercing to a friendly zero.

**`edge_api = expectedReturn / turnover`, with no `expectedShare` divisor.**
`expectedReturn` is the gross expected house win (`turnover x edge`), so this
ratio reproduces the response's own `1 - rtp` exactly — for BASE above,
`540,000,000 / 12,000,000,000 = 4.50%`, matching `1 - 0.9550`. The
obvious-looking alternative — dividing by `expectedShare` (7.5%) instead —
yields 44%, which is not an edge: `expectedShare` is a display rate for the
accounting page's "Expected" column only (see **Money units** above) and has
no part in this identity.

## Profit by hour, and by five minutes

`h` opens one game's profit per wall-clock bucket, with a column for the game
as a whole and one for each of its bet modes — so a bonus round's own
contribution is separated from the base game's.

```
pixel-carnivals profit by 5m   14:05-15:00 UTC
BUCKET        TOTAL         BASE  BONUS_BOOST   FREE_SPINS
15:00        +$4.47       +$3.10       +$0.77       +$0.60
14:30        -$3.10       +$3.36       +$2.27      -$82.00
14:05       +$15.42      +$11.30       +$2.32       +$1.80
14:00             -            -            -            -
```

Four things worth knowing about that table:

**Buckets are aligned to the epoch and labelled in UTC.** An hour bucket starts
on the hour UTC; labelling it with a local clock in a half-hour-offset zone
would print `14:30` against a bucket that runs 14:00–15:00.

**A blank bucket is blank, not zero.** `-` means nothing was measured — the
poller was down, or had not started. `$0.00` would claim a measured quiet
period. Empty buckets are trimmed from each END of the table (older than the
trail, or still being filled), but a hole the trail *surrounds* always keeps its
row: "we were not watching yet" and "we were watching and missed it" are
different facts, and only the second is a symptom.

**`TOTAL` is not the sum of the mode columns.** It comes from
`/teams/{team}/stats` and the mode columns come from
`/teams/{team}/games/{slug}/stats` — two different responses. When they
disagree by more than a percent the table says so underneath rather than
picking a winner.

**Mode columns only go back as far as recording does.** The game totals come
from a trail that has always been kept; the per-mode trail starts from the
first tick after this feature shipped, and there is no backfill — the API only
ever reports the current month-to-date total. Until then the columns read
`no per-mode trail yet`. Recording them costs no extra API call: the per-mode
array was already fetched every tick for `game:{slug}:latest` and thrown away.

## Web insights dashboard

```sh
npm run web
# binds 0.0.0.0:3005 by default - see "Running everything" above
npm run web -- --port 3010
npm run web -- --host 127.0.0.1  # this machine only
npm run web -- --no-sync  # read cached reports without API requests
```

Usually you start this together with the collector via `npm start` (see
**Running everything** above) rather than running `npm run web` on its own;
either way it is the same server with the same default bind.

The pages, in sidebar order:

| Route | What it shows |
|---|---|
| `/` | **Overview.** One row per roster game (bets, turnover, studio P/L month-to-date, P/L today, online) with a total row, plus a *Not yet live* table of every catalogue title that is not turned on (status, approval stage, captured RTP / modes / max win). Simple figures only - every game name opens its game page. |
| `/analysis` | **Analysis.** Every chart states its conclusion in a sentence computed from the same numbers: four donuts (share of bets, turnover, profit gains, profit losses by game), P/L by game, *luck or fault* noise bands, turnover concentration, feature-buy share, hour-by-hour studio P/L, bets per hour, players online, daily P/L. |
| `/settlement` | **Settlement.** Position, what Stake would settle if the month ended now (10% of summed roster profit plus carry - Stake settles on this, not on `position`), the luck gap, the month-end projection, today against the same hours of yesterday, and whether `/stats`, `/games` and the per-mode response reconcile to the cent, with endpoint freshness. |
| `/insights` | **Player insights** (was `/`; old `/?game=…` links redirect here). Daily players, new-to-game, returning, filters and the daily CSV export. |
| `/live` | The collector's roster, possible events, running action and findings. |
| `/trends` | Players online every poll, 30 days of bets, turnover, P/L, players, average bet and RTP, turnover by game (the legend lists every game; pick one to chart it on its own scale), and returning players against releases. |
| `/math` | The captured math corpus (your `math.json`). |
| `/log` | **Poll log.** Every entry the poller wrote, newest first, 100 a page, filterable by stream, exactly as stored - plus raw CSV downloads. |
| `/donate` | **Donations.** The project's donation addresses, each with a copy button. |
| `/game/<slug>` | The drilldown: bet-mode table with a total row first, then P/L by mode, bets against turnover, per-mode noise bands, hourly P/L and bets, players, captured math and verdicts. Titles that are not live get a page too, built from their captured math. |

**Also derived**, all from what this collector already polls every 2.5
minutes - no extra endpoints: realised against theoretical hold
(theoretical from each mode's deployed RTP, so it needs no captured math) and
which mode explains the gap; buy economics; player worth; quiet share (turnover
taken with two or fewer online); average stay by Little's law; unusual days;
the bet-size ladder from `betStats` (lifetime, bucketed by BASE bet); the API's
effective and normalized RTP; launch checks; and the tape - big stakes, payout
spikes, house takes and exact feature-buy stakes over the last 24 hours. A
counter that runs backwards for a tick (read-replica lag) is never differenced,
and no interval crosses a month boundary.

**The time picker** on `/analysis` and every game page chooses *This month*
(the API's month-to-date), *Today* (the change since 00:00:00Z - at 01:00Z that
is one hour) or *Last 24h* (rolling). Today and Last 24h are read from the
collector's trail. Samples are stamped with their 2.5-minute grid slot, so the
00:00:00Z sample is the exact start of the UTC day; the step that arrives at
midnight covers 23:57:30-00:00 and stays in yesterday.

**Raw CSV:** `/export/log.csv?source=<stream|all>&date=YYYY-MM-DD` streams the
poll log for one UTC day (or, with no date, everything retained). One stream is
wide - a row per entry, a column per field; `all` is long - a row per data point
(`time_utc, entry_id, stream, field, value`). Values are exactly as stored: raw
micro-dollars, gross `profit`. Each game page links to its own trail and mode
trail for today.

It opens an independent reader alongside the running poller; no poller restart
is needed. The web launcher also runs a bounded daily-history sync using the
existing `.sid` or `STAKE_SID`. On first launch it fetches up to 30 calendar days
sequentially (about 61 API requests for a full backfill). Completed historical
reports are cached; today and yesterday refresh every 15 minutes. A separate
`lock:daily-insights` prevents duplicate history syncs when several web servers
run. Existing poller keys and trails are untouched. Reports live in
`stake:<team>:insights:daily:v1` and follow Redis persistence settings.

Player metrics have precise scopes:

- **Daily players:** the API's distinct players within a game for one **UTC
  calendar date**, midnight to midnight. These API windows use inclusive dates,
  independently of the terminal dashboard's 12:00Z accounting boundary.
- **All games:** sums game-level counts. Someone playing two games can appear
  twice; these are not studio-wide deduplicated people.
- **New to game:** the difference between consecutive end-of-day cumulative
  unique counts since `lifetimeStart`. This means newly
  observed for that game since tracking began, not new account registrations.
  The API does not provide identities or first-ever studio-wide player counts.
- **Returning:** daily players minus new-to-game players. Counter corrections
  that would make this inconsistent show a dash instead of a fabricated count.
- **Player-days:** daily player counts summed across the selected period;
  playing on two days counts twice. Missing reports are excluded and disclosed.
- **Money:** reuses configured units and share rates; RTP uses gross revenue.
  Today is labeled in progress. Every daily report carries its fetch time.

The browser refreshes every 30 seconds, preserving unsaved filter edits and
showing connection errors. Cached data remains readable after an API failure.
Without a valid session, the dashboard explains why sync is paused and retries
automatically. The HTTP routes never make upstream requests or expose the sid.

**Every interface (`0.0.0.0`) is the default**, so other machines on the network
can reach it — see **Running everything** above for what that exposes.
`STAKE_WEB_PORT`, `STAKE_WEB_HOST`, `--port`, and `--host` override it;
`STAKE_WEB_SYNC=0` disables the history worker. There is no web authentication;
pass `--host 127.0.0.1` (or set `STAKE_WEB_HOST=127.0.0.1`) to keep private
studio data off the network.

## Configuration

Three layers, later ones winning:

1. **`config.json`** - shipped with the code, names no studio: poll cadence,
   retention, money share rates, alert thresholds.
2. **`config.local.json`** - yours, gitignored (start from
   `config.local.example.json`). `team` and `lifetimeStart` are required here
   (or in the environment); anything else from `config.json` can be overridden,
   and nested sections merge key by key, so `{ "detect": { "zWarn": 3 } }`
   keeps the rest of `detect`. Also where `service.label` and
   `web: { host, port }` go.
3. **Environment:** `STAKE_TEAM`, `STAKE_LIFETIME_START`, `STAKE_API_URL`,
   `REDIS_URL`, `STAKE_SID`, `STAKE_SID_FILE`, `STAKE_TIMEOUT_MS`,
   `STAKE_POLL_MINUTES`, `STAKE_WEB_HOST`, `STAKE_WEB_PORT`, `STAKE_WEB_SYNC`,
   `STAKE_WAIT_FOR_REDIS_MS`.

Startup refuses a missing team or an invalid `lifetimeStart` with a message
naming where to set it.

## Notes

- One poller per team per Redis. The lock enforces it; a second copy exits with
  a message rather than corrupting the trail. Ctrl-C releases the lock
  immediately, so a restart is instant rather than waiting out the 90s TTL.
- The poller makes authenticated outbound requests. Some agent sandboxes
  classify a `sid`-bearing request as data exfiltration and block it — run the
  daemon from a normal shell.
- Field names are matched leniently around the captured shapes. If one goes
  missing upstream, that metric drops out of the trail instead of taking the
  tick down with it — check `meta.last_error` and the stream fields if a column
  goes blank. A value that is genuinely unknown is omitted rather than written
  as `0`, because a fabricated zero is indistinguishable from a real collapse
  and would fire a `drop` alert.

## License

[MIT](LICENSE). If stake-polling earns its keep at your studio, the donation
addresses at the top of this file (and on the dashboard's Donations page) are
how to say so.
