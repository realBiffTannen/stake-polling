---
title: Settings
parent: The web dashboard
nav_order: 11
description: "Sign-in, system status (Redis memory, persistence, poll interval, archive, dismissed warnings) and the version."
---

# Settings

Route: `/settings`

Three tabs. Every change is an ordinary form post that comes back to this page
with a result, so a reload never repeats it, and the whole page works without
JavaScript.

## Security

Sign-in for this dashboard. The full description is on
[Sign-in and security](../security.md).

- **Off:** a form to turn it on, with a username and a password of at least 10
  characters, entered twice.
- **On:** change the username or password (this signs every other browser
  out), **Sign out everywhere**, or turn sign-in off. Each asks for the current
  password. The last two ask again in a confirmation dialog.

## System

| Row | Shows |
|---|---|
| Memory | Redis's memory use against the `REDIS_DB_SIZE` limit, as a level meter that turns amber past 70% of the limit and red past 90%. Says so when the reading could not be taken |
| Persistence | Whether Redis AOF is on. See [Redis](../redis.md#persistence-aof) |
| Poll interval | The collector's interval, for example `2.5 min` |
| Nightly archive | Where the archive goes, with a link to the [Archive](archive.md) page |
| Dismissed warnings | How many standing warnings are hidden for everyone, and a **Show them again** button. See [Game math](math.md#dismissing-warnings) |

## About

The version (the same one in the page footer and in `/healthz`), what the
project is, and a link to the source on GitHub.

Settings has no live refresh: it would throw away a form you are filling in.
