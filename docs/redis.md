---
title: Redis
nav_order: 7
description: "AOF persistence, authenticated Redis, the memory alert, and every key, stream and channel with its retention."
---

# Redis
{: .no_toc }

Redis is the only thing the four processes share. Redis 5.0 or newer; the trail
is kept in Redis streams.

1. TOC
{:toc}

## Persistence (AOF)

Redis ships with AOF off. Without it the 30-day trail lives only until the next
Redis restart, so the poller warns at startup:

```
warning: redis AOF persistence is off - the 30-day trail will not survive a restart.
         run `npm run enable-persistence` to turn it on.
```

The web dashboard shows an `aof off` banner, the terminal dashboard's header
says `aof off`, and **Settings > System > Persistence** says the same.

Turning it on edits your global Redis config and affects every database on that
server, so it is opt-in, and the command asks first:

```bash
npm run enable-persistence
```

```
redis: redis://127.0.0.1:6379
appendonly is currently: no

Enabling AOF writes every change to disk so the 30-day minute trail
survives a restart. It affects EVERY database on this Redis server,
and CONFIG REWRITE will update the redis.conf on disk.

Enable AOF persistence now? [y/N]
```

It runs `CONFIG SET appendonly yes` and then `CONFIG REWRITE`. If Redis was
started without a config file, `CONFIG REWRITE` has nothing to write to and the
command says so; turn on `appendonly yes` in your `redis.conf` by hand instead.
If the server does not allow `CONFIG`, persistence reads as `unknown` rather
than `off`.

## Authenticated Redis

No credentials by default: a local Redis on a trusted machine. For a server
that requires them, put them in `.env` at the repo root (gitignored; start from
`.env.example`):

```bash
REDIS_USERNAME=stake-polling                 # an ACL user; leave unset for plain requirepass
REDIS_PASSWORD=choose-a-long-random-password
REDIS_URL=rediss://redis.internal:6380/0     # rediss:// for TLS
```

`user:password@` inside `REDIS_URL` works too. If `REDIS_USERNAME` or
`REDIS_PASSWORD` is set, the credentials in the URL are ignored. Every process
(the poller, both dashboards, the archiver, `enable-persistence`, `npm run
auth`) connects the same way, and any URL they print has its password masked.
Credentials are read from the environment and never carried on the config
object, so they cannot end up in a log along with it.

The one exception is the small `tools/verify-math-slugs.mjs` helper, which
reads only the URL. See [math.json](configuration/math-json.md#checking-your-slugs).

An ACL user needs the keys and the [channels](#channels) matching
`stake:<team>:*`. The commands the project uses are `GET`,
`SET`, `DEL`, `INCR`, `HSET`, `HGETALL`, `SADD`, `SMEMBERS`, `XADD`, `XRANGE`,
`XREVRANGE`, `XLEN`, `TYPE`, `SCAN`, `MULTI`/`EXEC`, `EVAL` (the poller lock),
`PUBLISH`, `SUBSCRIBE`, `PING` and `INFO` (the memory alert). `CONFIG GET`
reports persistence; without it persistence reads as `unknown`. `CONFIG SET`
and `CONFIG REWRITE` are used only by `enable-persistence`.

## Memory alert

Every screen carries a sticky red alert while Redis's `used_memory`, what
`redis-cli INFO memory | grep used_memory_human` prints, is over the limit:

```
REDIS MEMORY 2.20G - over the 2.00G limit (REDIS_DB_SIZE). Shorten retention.trailDays, or raise the limit if the machine has room.
```

On the web dashboard it stays pinned to the top however far the page scrolls;
in the terminal dashboard it is in the header. It is read once per poll tick and
clears on its own once memory drops back under the limit. A reading that cannot
be taken (`INFO` denied by an ACL, say) shows no alert rather than a
reassuring zero. **Settings > System > Memory** shows the reading as a meter.

Set the limit with `REDIS_DB_SIZE` in `.env` or the environment (or
`redisDbSize` in `config.local.json`). The default is `2GB`.

```bash
REDIS_DB_SIZE=4GB
```

It takes `512MB`, `1.5G`, `4GB` or a plain byte count. Units are binary, as
Redis's own are, so `2GB` is exactly the `2.00G` that `redis-cli` shows. An
unreadable value stops startup with a message rather than silently falling back
to the default.

The database grows with the roster: every game adds a trail and a per-mode
trail. To shrink it, lower `retention.trailDays` in `config.local.json` (see
[Retention](configuration.md#retention)) and restart. Each stream is trimmed on
its next write.

## Keys and retention

Everything lives under the namespace `stake:<team>:`, for example
`stake:acme-studios:ts:team`. Two teams can share one Redis: each has its own
namespace and its own poller lock.

### What the poller writes

| Key | Type | Contents | Kept |
|---|---|---|---|
| `roster:latest` | string | `{ ts, endpoint, ok, data }`: the last good roster response | Overwritten each read |
| `games:latest` | string | The same envelope, for the catalogue | Overwritten |
| `game:<slug>:latest` | string | One game's per-mode breakdown | Overwritten |
| `graph:latest` | string | Daily buckets | Overwritten |
| `lifetime:latest` | string | The roster over the lifetime window | Overwritten |
| `balance:latest` | string | `{ position, expectedProfit, carry }` | Overwritten |
| `ts:team` | stream | `balance`, `turnover`, `profit`, `expectedProfit` | `retention.trailDays` (30 days) |
| `ts:online` | stream | `onlinePlayers`, and day and month totals | 30 days |
| `ts:<slug>` | stream | `count`, `turnover`, `profit`, `unique`, `expectedProfit`, `onlinePlayers` | 30 days |
| `ts:<slug>:modes` | stream | Per-bet-mode counters, keyed `MODE:field`: `BASE:profit`, `BONUS:turnover`, ... | 30 days |
| `summary` | stream | The running-action log, one line every five minutes | `retention.summaryMaxLen` (a week) |
| `alerts` | stream | Every raised anomaly | `retention.alertMaxLen` (5,000) |
| `meta` | hash | `last_ok`, `last_error`, `auth_state`, `consecutive_failures`, `sid_fingerprint`, `sid_source`, `persistence`, `started_at`, ... | Updated each tick |
| `lock:poller` | string | The single-poller lock | A lease of three poll intervals (at least 90 seconds), renewed each tick |

Every snapshot carries its own fetch time, so a failed endpoint leaves the
previous value in place and you can still tell how old it is.

Values from the API are month-to-date **cumulative** totals, in raw
micro-dollars. They are stored as reported, and rates are derived when needed.
A step backwards is not automatically a month rollover: a **reset** collapses
the counter towards zero, while a **correction** (a settled or voided bet, or
read-replica lag) edges it down slightly. The test is on magnitude, at 5% of
the previous reading.

A value that is genuinely unknown is omitted rather than written as `0`,
because a made-up zero is indistinguishable from a real collapse and would fire
a `drop` alert. If a column goes blank, check `meta`'s `last_error` and the
stream's fields.

### What the web dashboard and archiver write

| Key | Type | Contents |
|---|---|---|
| `insights:daily:v1` | string | The daily-history cache: 30 UTC days of per-game reports |
| `insights:modes:v1` | string | Per-mode daily turnover, rolled forward from the per-mode trail |
| `insights:catalogue:v1` | string | Which games were live each day, recorded forward |
| `lock:daily-insights` | string | Held during a daily sync, so two web servers never sync at once |
| `lock:archive` | string | Held by the archiver for the length of one run, so two archivers never upload the same day |
| `archive:status` | string | The archiver's last run: when, where to, which days were stored or failed and why |
| `auth` | string | The sign-in record: username and scrypt hash, never the password |
| `auth:epoch` | string | A counter that versions the credentials; it only ever goes up |
| `session:<sha256>` | string | One per signed-in browser, named by the token's hash, with a 12-hour or 30-day expiry |
| `dismissed` | set | Standing warnings dismissed for everyone |

### Channels

`stake:<team>:tick` and `stake:<team>:alerts:ch` are published after each tick,
so the dashboards repaint at once instead of waiting for their next heartbeat.
You can watch alerts arrive yourself:

```bash
redis-cli SUBSCRIBE stake:acme-studios:alerts:ch
```

## Nothing is deleted by the archiver

The nightly archive copies each finished day out of Redis; it never deletes
from Redis. Trimming is only ever by the retention caps above. See
[Nightly archive and S3](archive.md).
