---
title: Troubleshooting and FAQ
nav_order: 12
description: "The messages you are most likely to see, what each means, and what to do; plus common questions."
---

# Troubleshooting and FAQ
{: .no_toc }

1. TOC
{:toc}

## First checks

```bash
curl -s http://127.0.0.1:3005/healthz          # is the dashboard up, and is the collector fresh?
redis-cli ping                                  # is Redis up?
redis-cli HGETALL stake:acme-studios:meta       # last_ok, last_error, auth_state, sid_source, ...
npm run service:status                          # macOS service: loaded, running, last exit code
tail -f ~/Library/Logs/stake-polling/err.log    # macOS service errors
journalctl -u stake-polling -f                  # systemd
```

`last_ok` in `meta` is the time of the last good poll, in milliseconds since
the epoch. `last_error` is the last endpoint failure.

## Starting up

### "no team configured"

```text
no team configured: copy config.local.example.json to config.local.json and set "team" to your studio's slug ...
```

Create `config.local.json` with your team slug, or set `STAKE_TEAM`. See
[Getting started](getting-started.md#2-name-your-studio-in-configlocaljson).

### "invalid lifetimeStart"

`lifetimeStart` must be a real date written `YYYY-MM-DD`, such as
`2026-01-01`: the day your first game went live.

### "Redis is not reachable"

```text
Redis is not reachable at redis://127.0.0.1:6379.
Start it (brew services start redis, or redis-server) and run npm start again.
```

Start Redis (`brew services start redis`, or
`sudo systemctl start redis-server`). If Redis is simply slow to start at boot,
give `npm start` a wait: `--wait-for-redis 180000` or
`STAKE_WAIT_FOR_REDIS_MS=180000`. The launchd service already waits.

For an authenticated Redis, check `REDIS_URL`, `REDIS_USERNAME` and
`REDIS_PASSWORD`; see [Redis](redis.md#authenticated-redis).

### "another poller already holds ... lock:poller"

Only one poller may run per team per Redis, and one already is: another
terminal, a `screen` session, or the service. Find it before you do anything
else:

```bash
pgrep -fl stake-poller
npm run service:status
```

Stop that one, or leave it running and let `npm start` follow it (it takes over
when that one stops). If the holder really has died, the lock expires by itself
after its lease: three poll intervals, 7½ minutes at the default. Check with
`redis-cli TTL stake:acme-studios:lock:poller`. Do not delete the key while a
live poller holds it: two pollers would double every delta.

### "no usable sid"

The poller could not find a sid that the API accepts. Write one to `.sid`, set
`STAKE_SID`, or run `npm start` in a terminal to be prompted. See
[The sid](configuration/sid.md).

### "Port 3005 is already in use"

Something else, perhaps another copy of the dashboard, holds the port. Choose
another: `npm start -- --port 3010`.

### A startup message about REDIS_DB_SIZE, S3_BUCKET or S3_PRESIGN_SECONDS

These are checked at startup rather than trusted. `REDIS_DB_SIZE` takes sizes
like `2GB` or `512MB`; `S3_BUCKET` must be a valid bucket name;
`S3_PRESIGN_SECONDS` can be at most 604800. See
[What startup refuses](configuration.md#what-startup-refuses).

## While it runs

### SID EXPIRED

The API rejected the session. Polling is paused and nothing is written, so the
trail stays honest. Log in to `studio.engine.io` again, copy the new `sid`, and
write it to `.sid`:

```bash
printf '%s' 'PASTE-SID-HERE' > .sid && chmod 600 .sid
```

Polling resumes on the next tick. No restart is needed. On macOS with Chrome
logged in, the poller also tries Chrome by itself every ten minutes.

### STALE, or "Collector stale"

No poll has succeeded for 2.5 poll intervals. Either the poller is not running
(check `npm run service:status` or the terminal running `npm start`), or every
request is failing: look at `last_error` in the `meta` hash and the poller's
output. `/healthz` reports this as `collectorStale: true`.

### A game shows dashes, or "live, nothing yet"

A dash means the value was never measured: the poller was down, the trail does
not reach back that far, or a game went live and has no figures yet. It never
means zero. A new game gets a row, a trail and its real player count straight
away, and a `new_game` finding.

### The figures differ a little from the studio accounting page

- Money from the API is in micro-dollars, and profit shown is the studio's 10%
  share; both are applied exactly as the accounting page does.
- The accounting page's window and the poller's month-to-date window can
  differ by a few minutes, so a busy game can be a little apart. Every game
  agrees to well under a percent.
- The **Settlement** page's **Do the endpoints agree?** table shows whether the
  API's own responses agree with each other.

### The charts are still empty

The trail starts when the poller does. Hour-by-hour charts fill over the first
hours, and the 30-day charts fill as the daily sync backfills (about 61 API
requests on first launch). The per-mode trail has no backfill: the API only
reports month-to-date totals.

### An interactive chart says it could not load

The treemap, Sankey, heatmap, zoomable trend and live strips use ECharts and
Smoothie, which the dashboard serves from `node_modules`. Run `npm install`
(for example after a `git pull`) and restart.

### "Daily sync needs a valid session in .sid or STAKE_SID"

The web dashboard's daily-history sync uses only `.sid` or `STAKE_SID`, never
Chrome. Write the sid to `.sid`; the sync retries by itself.

### REDIS MEMORY ... over the limit

Redis is using more memory than `REDIS_DB_SIZE` (2GB by default). Lower
`retention.trailDays`, or raise `REDIS_DB_SIZE` if the machine has room. See
[Redis](redis.md#memory-alert).

### aof off

Redis persistence is off, so the trail lives only until Redis restarts. Run
`npm run enable-persistence`. If it fails with a `CONFIG REWRITE` error, your
Redis was started without a config file: set `appendonly yes` in your
`redis.conf` and restart Redis.

### Drift warnings on Game math

A game's deployed modes no longer match `math.json`: a new math version was
published or a mode was added. Recapture that game from your studio
dashboard's Math tab and restart. If a whole game shows as uncaptured, check
that its `math.json` key is the slug, not the display name; see
[Checking your slugs](configuration/math-json.md#checking-your-slugs).

## Sign-in

### Forgot the password

On the machine running the dashboard:

```bash
npm run auth -- disable
```

This turns sign-in off and ends every session. Turn it back on under
**Settings > Security**.

### "Too many wrong attempts from this address"

Five wrong passwords in 15 minutes from one address make that address wait out
the window. The count is kept in the dashboard's memory, so restarting the
dashboard also clears it. Behind a reverse proxy every visitor shares the
proxy's address; see [Behind a reverse proxy](security.md#behind-a-reverse-proxy).

### "The form expired" on every sign-in or Settings form

The dashboard refuses a form whose `Origin` does not match the `Host` it sees.
Behind a reverse proxy, pass the original `Host` header through. Otherwise,
reload the page and try again: the form's token comes from a cookie that may
have been cleared.

### "The sign-in check is unavailable. Check Redis"

With sign-in on, the dashboard refuses rather than opening up when it cannot
read Redis. Start Redis, then reload.

## The service (macOS)

### It stopped starting after a node upgrade

`service:status` says `BROKEN`: the plist names a node that no longer exists,
which is what an `nvm` upgrade does. Reinstall:

```bash
npm run service:install
```

### Nothing polls after a reboot

The agent starts at **login**, not at boot, because sid recovery needs your
Keychain. Turn on automatic login, and make Redis a login service with
`brew services start redis`. See
[Running as a service](service.md#running-after-a-reboot-with-nobody-at-the-keyboard).

### The poller cannot reach the API from an agent sandbox

Some agent sandboxes classify a request carrying a `sid` as data exfiltration
and block it. Run the poller from a normal shell.

## Terminal dashboard

### Keys stop working after `/`

The filter prompt takes every key as text until you press `enter` or `esc`.
The prompt line at the top shows what you have typed.

### The screen stopped updating

You may have pressed `f`, which freezes the screen. Press `f` again.

## FAQ

### Does opening the dashboard make requests to the studio API?

No. The HTTP routes never make upstream requests or expose the sid. The only
API traffic is the poller's, and the web dashboard's own bounded daily-history
sync, which `--no-sync` or `STAKE_WEB_SYNC=0` turns off.

### How fresh are the figures?

As fresh as the last poll: 2.5 minutes at most, on the clock (:00:00, :02:30,
:05:00 ...). The header's progress bar shows the time to the next one.

### Does it work on Linux?

Yes. Everything but Chrome sid recovery and the launchd installer works on
Linux. Supply the sid through `.sid` or `STAKE_SID`, and use the systemd unit
in [Running as a service](service.md#linux-systemd).

### Can I watch more than one team?

Yes: one checkout per team, each with its own `config.local.json` (`team`, a
different `web.port`, and a different `service.label` if you use the macOS
service). They can share one Redis, because every key is namespaced by team and
each team has its own poller lock.

### Can I keep more than 30 days?

In Redis, raise `retention.trailDays` and watch the memory alert. For good, use
the [nightly archive](archive.md), which keeps every finished day as a gzipped
CSV in S3 or a local folder.

### Where is the demo's data from?

It is made up. See [The demo site](demo.md).
