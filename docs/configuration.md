---
title: Configuration
nav_order: 3
has_children: true
description: "The four configuration layers, and every config key, environment variable and command-line option, with defaults."
---

# Configuration
{: .no_toc }

1. TOC
{:toc}

## The four layers

Settings come from four places. Later ones win.

1. **`config.json`** ships with the code and names no studio: poll cadence,
   retention, money share rates, alert thresholds. Leave it alone so `git pull`
   stays clean.
2. **`config.local.json`** is yours, and gitignored (start from
   `config.local.example.json`). `team` and `lifetimeStart` are required here,
   or in the environment. Anything else from `config.json` can be overridden
   here too. It is also where `service.label` and `web: { host, port }` go.
3. **`.env`** at the repo root is yours, and gitignored (start from
   `.env.example`): secrets and switches, read into the environment at
   startup. A variable already set in the real environment wins over the file.
4. **The environment**: variables set in your shell, a launchd plist or a
   systemd unit.

`config.local.json` is merged over `config.json` section by section. Nested
objects merge key by key; arrays and plain values replace. So this keeps the
rest of `detect` as shipped and changes only the warning threshold:

```json
{
  "team": "acme-studios",
  "lifetimeStart": "2026-01-01",
  "detect": { "zWarn": 3 },
  "web": { "host": "127.0.0.1", "port": 3010 },
  "service": { "label": "com.acme-studios.stake-polling" }
}
```

Every process reads its configuration once, when it starts. Restart after a
change (`npm start` again, or reinstall the service).

Credentials never live in the config files. The sid is resolved separately (see
[The sid](configuration/sid.md)) and Redis credentials are read from the
environment, so neither can end up in a log along with the config.

## Settings in config.json and config.local.json

Defaults are what the shipped `config.json` sets. Where the code has its own
fallback for a key the shipped file leaves out, the table says so.

### Your install

| Key | Default | What it does |
|---|---|---|
| `team` | none, required | Your team slug: letters, digits and hyphens, starting with a letter or digit. Names the team to poll and namespaces every Redis key (`stake:<team>:...`). `STAKE_TEAM` overrides it. |
| `lifetimeStart` | none, required | A real UTC date, `YYYY-MM-DD`. Lifetime figures and new-player counts are summed from this day, and the daily-history cache is keyed on it. `STAKE_LIFETIME_START` overrides it. |
| `web.host` | `0.0.0.0` (code default) | Where the web dashboard listens. `STAKE_WEB_HOST` and `--host` override it. |
| `web.port` | `3005` (code default) | The web dashboard's port. `STAKE_WEB_PORT` and `--port` override it. |
| `service.label` | `local.stake-polling` (code default) | The launchd label, and so the plist name. Use your own reverse-DNS label if you like. See [Running as a service](service.md). |
| `redisDbSize` | `2GB` (code default) | The Redis memory limit for the [memory alert](redis.md#memory-alert). `REDIS_DB_SIZE` overrides it. |

### Where to poll, and how often

| Key | Default | What it does |
|---|---|---|
| `apiUrl` | `https://studio.engine.io/api` | The studio API base URL. Must start with `http://` or `https://`; trailing slashes are dropped. `STAKE_API_URL` overrides it. |
| `redisUrl` | `redis://127.0.0.1:6379` | The Redis server. Use `rediss://` for TLS. `REDIS_URL` overrides it. |
| `sidFile` | `.sid` | The file the sid is read from, relative to the repo root. `STAKE_SID_FILE` overrides it (as given, not joined to the repo root). |
| `timeoutMs` | `15000` | How long one API request may take, in milliseconds. `STAKE_TIMEOUT_MS` overrides it. |
| `pollMinutes` | `2.5` | The poll interval, in minutes. Ticks are aligned to the wall clock (:00:00, :02:30, :05:00 ...). Everything time-based is derived from it; see [Changing the poll interval](#changing-the-poll-interval). `STAKE_POLL_MINUTES` overrides it. The code falls back to `1` if the key is removed. |
| `dayBoundaryUtcHour` | `0` | The UTC hour the accounting day rolls at. See [The accounting day](#the-accounting-day). The code falls back to `12` if the key is removed. |
| `intervals.roster` | `1` | How often `/teams/{team}/stats` (the roster) is read, in minutes. Rounded to whole ticks, never less than one, so `1` means every tick. |
| `intervals.games` | `1` | The same for `/teams/{team}/games` (the catalogue). |
| `intervals.gameStats` | `1` | The same for `/teams/{team}/games/{slug}/stats` (per-mode figures, one request per game). |
| `intervals.balance` | `1` | The same for `/teams/{team}/balance`. |
| `intervals.graph` | `15` | The same for `/teams/{team}/graph` (daily buckets). |
| `intervals.lifetime` | `60` | The same for the roster over the lifetime window, from `lifetimeStart`. |
| `intervals.summary` | `5` | How often the poller writes one line to the running-action log. |

### Retention

| Key | Default | What it does |
|---|---|---|
| `retention.trailDays` | `30` | How many days of trail each stream keeps. Converted to an entry cap: 17,280 entries at a 2.5-minute poll. |
| `retention.trailMaxLen` | derived | Set it to cap the trail streams at an exact number of entries instead. Not in the shipped file. |
| `retention.alertMaxLen` | `5000` | Entries kept in the `alerts` stream. |
| `retention.summaryMaxLen` | `2016` | Entries kept in the `summary` stream: a week of five-minute lines. |

Trimming is approximate (`MAXLEN ~`), so a stream can run slightly over its cap.

### Money

| Key | Default | What it does |
|---|---|---|
| `money.unitsPerDollar` | `1000000` | The API reports money in micro-dollars. |
| `money.profitShare` | `0.1` | The studio's share of gross profit. Every "profit" or "Studio P/L" figure on screen is gross profit times this. |
| `money.expectedShare` | `0.075` | The rate the accounting page uses for its "Expected" column. |

See [Money units](#money-units).

### Anomaly detection

All of these live under `detect`. What each rule does is on
[Anomaly detection and alerts](anomalies.md).

| Key | Default | What it does |
|---|---|---|
| `detect.windowSamples` | `36` | The rolling baseline, in samples (90 minutes at 2.5 minutes). Must be larger than `warmupSamples`, or startup refuses. |
| `detect.warmupSamples` | `12` | Samples a metric needs before it can alert at all (30 minutes at 2.5 minutes). |
| `detect.flatLineMinutes` | `15` | How long a busy game must report zero turnover before `flat_line` fires. Converted to samples, never fewer than two. |
| `detect.zWarn` | `4` | Robust z-score for a `warn` spike or drop. |
| `detect.zCrit` | `6` | Robust z-score for a `crit` spike or drop. |
| `detect.ratePerMinuteFloors.turnover` | `50` | Dollars per minute. A turnover change smaller than this never alerts. Scaled to the poll interval. |
| `detect.ratePerMinuteFloors.profit` | `25` | Dollars per minute of gross profit, scaled the same way. |
| `detect.ratePerMinuteFloors.count` | `25` | Bets per minute, scaled the same way. |
| `detect.levelFloors.onlinePlayers` | `25` | The team-wide players-online floor. Not scaled: 25 players is 25 players however often it is read. |
| `detect.levelFloors.gameOnlinePlayers` | `5` | The per-game players-online floor. |
| `detect.shareShiftPoints` | `15` | Percentage points a game's share of roster turnover must move from its baseline for `share_shift`. Twice this is `crit`. |
| `detect.shareShiftMinShare` | `0.05` | A game below this share both now and at baseline is ignored by `share_shift`. |
| `detect.cooldownMinutes` | `15` | Quiet time per game, metric and kind after an alert fires. |

## Environment variables

Set these in `.env`, in your shell, or in the service definition. Every line of
`.env.example` is optional.

### Studio and polling

| Variable | Default | What it does |
|---|---|---|
| `STAKE_TEAM` | `team` from the config | The team slug. |
| `STAKE_LIFETIME_START` | `lifetimeStart` from the config | The lifetime start date, `YYYY-MM-DD`. |
| `STAKE_API_URL` | `apiUrl` from the config | The studio API base URL. |
| `STAKE_SID` | unset | The session cookie. Tried first, before `.sid`. See [The sid](configuration/sid.md). |
| `STAKE_SID_FILE` | `<repo>/.sid` | Another path for the sid file. |
| `STAKE_TIMEOUT_MS` | `timeoutMs` from the config | Per-request timeout. Ignored unless it is a positive number. |
| `STAKE_POLL_MINUTES` | `pollMinutes` from the config | The poll interval. Ignored unless it is a positive number. |

### Web dashboard and startup

| Variable | Default | What it does |
|---|---|---|
| `STAKE_WEB_HOST` | `web.host`, else `0.0.0.0` | Where the dashboard listens. `--host` wins over it. |
| `STAKE_WEB_PORT` | `web.port`, else `3005` | The dashboard's port. `--port` wins over it. |
| `STAKE_WEB_SYNC` | on | `0` turns off the dashboard's daily-history sync, the same as `--no-sync`. |
| `STAKE_WAIT_FOR_REDIS_MS` | `0` | How long `npm start` waits for Redis before giving up. The launchd agent sets `180000`. `--wait-for-redis` wins over it. |

### Redis

| Variable | Default | What it does |
|---|---|---|
| `REDIS_URL` | `redisUrl` from the config | The Redis server, for example `rediss://redis.internal:6380/0`. |
| `REDIS_USERNAME` | unset | An ACL user. Leave it unset for a plain `requirepass` server. |
| `REDIS_PASSWORD` | unset | The password. If either this or `REDIS_USERNAME` is set, credentials inside `REDIS_URL` are ignored. |
| `REDIS_DB_SIZE` | `2GB` | The memory-alert limit: `512MB`, `1.5G`, `4GB` or a byte count, in binary units. An unreadable value stops startup. |

See [Redis](redis.md).

### Nightly archive

| Variable | Default | What it does |
|---|---|---|
| `S3_BUCKET` | unset | Set it to archive to S3. Unset, the archive goes to a local folder. Must be 3 to 63 lowercase letters, digits, dots and hyphens. |
| `S3_PREFIX` | `stake-polling` | The key prefix. Archives go under `s3://$S3_BUCKET/$S3_PREFIX/<team>/`. |
| `S3_PRESIGN_SECONDS` | `3600` | How long the Archive page's download links last. At most `604800` (7 days), or startup refuses. |
| `STAKE_ARCHIVE_DIR` | `<repo>/stake-polling-logrotate-data` | The local archive folder, used when `S3_BUCKET` is unset. |
| `AWS_REGION` | unset | The bucket's region. `AWS_DEFAULT_REGION` also works. |
| `AWS_PROFILE`, `AWS_ACCESS_KEY_ID`, `AWS_SECRET_ACCESS_KEY` | unset | Credentials, read by the AWS SDK's standard credential chain. |

See [Nightly archive and S3](archive.md).

## Command-line options

The npm scripts, and what each accepts. Pass options after `--`, for example
`npm run web -- --port 3010`.

| Command | Runs | Options |
|---|---|---|
| `npm start` | `bin/stake-up.mjs`: the poller, the web dashboard and the archiver together | `--host`, `--port`, `--no-poll`, `--no-web`, `--no-sync`, `--no-archive`, `--wait-for-redis <ms>`, `--help` |
| `npm run poll` | `bin/stake-poller.mjs`: the poller alone | `--wait-for-lock` (follow a running poller until its lock is free, instead of exiting) |
| `npm run web` | `bin/stake-web.mjs`: the web dashboard alone | `--host`, `--port`, `--no-sync`, `--help` |
| `npm run dash` | `bin/stake-dash.mjs`: the terminal dashboard | `--view`, `--game <slug>`, `--mode <MODE>`, `--bucket 5m` or `1h`. See [Terminal dashboard](terminal.md) |
| `npm run archive` | `bin/stake-archive.mjs`: the archiver alone | `--once`, `--date YYYY-MM-DD`. See [Nightly archive and S3](archive.md) |
| `npm run service:install` | Write and load the launchd agent (macOS) | `--host`, `--port`, `--label <id>`, `--wait-for-redis <ms>` |
| `npm run service:status` | Report on the agent | `--label <id>` |
| `npm run service:uninstall` | Unload and delete the agent | `--label <id>` |
| `npm run enable-persistence` | Turn on Redis AOF, after asking | none |
| `npm run auth -- status` | Is sign-in on, and for whom | none |
| `npm run auth -- disable` | Turn sign-in off and end every session | none |
| `npm test` | The test suite | none |

For the web host and port the order is: `--host`/`--port`, then
`STAKE_WEB_HOST`/`STAKE_WEB_PORT`, then `web` in `config.local.json`, then
`0.0.0.0:3005`.

## What startup refuses

Every process stops with a message, rather than running on a bad value, when:

- no team is set, or the slug has characters other than letters, digits and
  hyphens;
- `lifetimeStart` is not a real `YYYY-MM-DD` date;
- `REDIS_DB_SIZE` (or `redisDbSize`) is not a size;
- `S3_BUCKET` is not a valid bucket name;
- `S3_PRESIGN_SECONDS` is over 604800;
- `apiUrl` does not start with `http://` or `https://`;
- `detect.windowSamples` is not larger than `detect.warmupSamples`, because
  then no metric could ever reach the sample count it needs, and the detector
  would go silent without saying so.

## Changing the poll interval

`pollMinutes` is the only number to change. Everything time-based in
`config.json` is written in wall-clock minutes and converted when the process
starts, because when the interval first moved from one minute to five, three
separate settings silently changed meaning.

| Configured as | At 1 min | At 2.5 min (default) | At 5 min |
|---|---|---|---|
| `intervals.graph: 15` (minutes) | every 15 ticks | every 6 ticks | every 3 ticks |
| `retention.trailDays: 30` | 43,200 entries | 17,280 entries | 8,640 entries |
| `ratePerMinuteFloors.turnover: 50` | $50 per tick | $125 per tick | $250 per tick |
| `detect.windowSamples: 36` | 36 minutes | 90 minutes | 3 hours |
| `detect.warmupSamples: 12` | 12 minutes | 30 minutes | 1 hour |
| `detect.flatLineMinutes: 15` | 15 samples | 6 samples | 3 samples |

Rate floors scale with the interval, because five minutes accumulates five
minutes of volume. Level floors (`levelFloors`, concurrent players) do not:
twenty-five players online is twenty-five players however often it is read.

Polling less often buys a longer, steadier baseline at the cost of resolution:
the smallest change that can be seen is one interval wide. A tick that overruns
its slot is skipped rather than queued.

## The accounting day

`dayBoundaryUtcHour` sets when "today" rolls over for:

- the terminal dashboard's DAY columns, the TODAY tab and the daily view;
- the "since" tiles on the web dashboard's **Live operations** page.

The web **Overview** is always the UTC day, from 00:00:00Z, whatever this is
set to: it is there to line up with the Engine studio dashboard, whose day is
the UTC day.

It is `0` (00:00 UTC) in the shipped `config.json`. Set it in
`config.local.json` to roll at another hour, then restart.

"Profit since the boundary" is summed from this project's own trail, not from
the API's day bucket, so it is exact to the poll and survives a month rollover
mid-window. It can only cover what the poller was running for: until the trail
spans the whole window, the header says `(partial - trail starts HH:MMZ)`, and a
game with no samples shows `-` rather than `$0.00`.

Two things do **not** follow this setting. The web dashboard's time picker
**Today** always means since 00:00:00Z, and the daily history on **Player
insights** and **Trends** uses the API's UTC calendar days.

## Money units

**Every monetary figure from the API is in micro-dollars.** A turnover of
`154,868,660,000` is `$154,868.66`. Nothing in the responses says so.

The studio accounting page also applies two share rates rather than showing the
gross figure, and the dashboards reproduce both so the two agree:

| Shown | Derived from | Accounting page label |
|---|---|---|
| turnover | `raw / 1e6` | Turnover |
| profit | `raw / 1e6 x 10%` | Profit (10% ggr) |
| expected | `raw / 1e6 x 7.5%` | Expected |

The scale is confirmed by an identity the balance endpoint satisfies:

```
position = carry + (month-to-date profit x profitShare)
```

**Raw units are what gets stored.** The trail is a faithful record of what the
API said, and the detector works on raw values directly. Conversion happens
only at the point of display, and in the detector's floors, which is why
`ratePerMinuteFloors.turnover` is written as `50`, meaning fifty dollars per
minute.

RTP is computed from the **gross** figures (`1 - profit / turnover`): it is a
property of the game, not of the studio's share of it.
