---
title: Running as a service
nav_order: 4
description: "Keep the collector, dashboard and archiver running across crashes and reboots, with launchd on macOS or systemd on Linux."
---

# Running as a service
{: .no_toc }

1. TOC
{:toc}

## macOS: launchd

```bash
npm run service:install      # start at login, restart after a crash
npm run service:status       # loaded? running? which pid? last exit code? is Redis a login service?
npm run service:uninstall
```

`service:install` writes a launchd **user agent** to
`~/Library/LaunchAgents/<label>.plist` and loads it into your login session. It
runs the same `bin/stake-up.mjs` as `npm start`: the poller, the web dashboard
and the archiver. Output goes to `~/Library/Logs/stake-polling/out.log` and
`err.log`:

```bash
tail -f ~/Library/Logs/stake-polling/out.log
```

Re-running `service:install` replaces the agent, so it is also how you pick up
a change: new options, a new node, or a new `.env`.

### Options

| Option | Default | Does |
|---|---|---|
| `--host <address>` | `web.host` from the config, else the dashboard's default (`0.0.0.0`) | Where the dashboard listens |
| `--port <number>` | `web.port` from the config, else `3005` | The dashboard's port |
| `--label <id>` | `service.label` from the config, else `local.stake-polling` | The agent's label and plist name |
| `--wait-for-redis <ms>` | `180000` | How long to wait for Redis at login |

```bash
npm run service:install -- --host 127.0.0.1 --port 3010
```

To use your own reverse-DNS label, set it once in `config.local.json` so the
status and uninstall commands find the same agent:

```json
{ "service": { "label": "com.acme-studios.stake-polling" } }
```

The log folder is named from the part of the label starting at
`stake-polling`, so it stays `~/Library/Logs/stake-polling/` for that label
too.

### Three deliberate choices

**It restarts after a crash, not after a clean stop.** `KeepAlive` is
`SuccessfulExit: false` rather than a bare `true`. A bare `true` relaunches the
job however it exited, which leaves no way to stop the collector short of
uninstalling it. `ThrottleInterval` is 30 seconds, so a job that crashes on
startup backs off instead of spinning.

**It starts at login, not at boot.** A LaunchDaemon would run before anyone
logs in, but sid recovery reads Chrome's cookie store through the Keychain,
which a root daemon cannot reach. A pre-login daemon would go permanently
paused the first time the sid expired. The cost: if the machine reboots and
nobody logs in, nothing polls.

**It waits for Redis instead of exiting.** At login, launchd reliably starts
the agent before Homebrew's `redis-server`. Started by hand, a missing Redis is
a mistake worth reporting at once, and `npm start` still exits immediately.
Under the agent, `STAKE_WAIT_FOR_REDIS_MS` (180 seconds) turns that into a
wait, because exiting on a two-second ordering gap makes a throttled crash loop
that reads as "the poller is broken". Redis itself is left alone:
`service:status` reports whether it is a Homebrew login service and tells you
the command.

### Running after a reboot with nobody at the keyboard

1. Make Redis start with your session: `brew services start redis`.
2. Turn on automatic login: **System Settings > Users & Groups > Automatically
   log in as** your user. macOS does not offer this while FileVault is on; in
   that case the machine waits at the FileVault unlock screen after a reboot
   until someone logs in.
3. Turn on **System Settings > Energy > Start up automatically after a power
   failure** if the machine should come back by itself.

### When node moves (nvm)

If the plist names an interpreter that later disappears, the agent silently
stops starting, and launchd reports it only to the system log. That is what an
`nvm` upgrade does, because the path carries the version number.
`service:status` checks the recorded path on every run and says `BROKEN` when
it has gone. The fix is to reinstall, which rewrites the plist with the node you
are running now:

```bash
npm run service:install
```

`service:install` warns you when it pins an nvm path. Installing from a
version-stable node, such as `/opt/homebrew/bin/node`, avoids the issue.

## Linux: systemd

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

`WorkingDirectory` matters less than you might think: the code finds
`config.json`, `config.local.json`, `.env` and `.sid` from its own location, not
the working directory. It is still the tidy choice.

Under systemd the sid comes from `.sid`, or `STAKE_SID` in the unit or `.env`:
Chrome cookie recovery is macOS-only. When the sid expires, the poller pauses
and the dashboard shows `SID EXPIRED`. Write a fresh value to `.sid` and polling
resumes on the next tick, with no restart.

## Other ways to run it

`npm start` in a terminal multiplexer (`screen`, `tmux`) works too. Stop it with
Ctrl-C: the poller releases its lock at once, so a restart does not have to wait
out the lock's lease.

Only one poller may run per team per Redis. If you start a second copy by hand
with `npm run poll`, it exits with `another poller already holds
stake:acme-studios:lock:poller`. `npm start` instead follows the running
poller and takes over only when that one stops.
