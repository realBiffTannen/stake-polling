---
title: Poll log
parent: The web dashboard
nav_order: 9
description: "Every entry the poller wrote, exactly as stored, with raw CSV downloads."
---

# Poll log

Route: `/log`

Every entry the collector has written, newest first, 100 a page, exactly as
stored. This page is where a figure elsewhere gets checked against its source,
so it converts nothing:

- money fields are raw micro-dollars: divide by 1,000,000 for US dollars;
- a trail's `profit` is the **gross** house win. The studio's share is 10% of
  it.

## Browsing

Pick a stream (or **all**) and press **Show**. **Newest**, **Newer**, **Older**
and **Oldest** page through it. The streams are the ones listed under
[Redis keys](../redis.md#keys-and-retention): `ts:team`, `ts:online`, one
`ts:<slug>` and one `ts:<slug>:modes` per game, `summary` and `alerts`.

## Download CSV

The **Download raw CSV** form takes a stream and a UTC day (00:00:00Z to the
next midnight). Leave the date empty for everything retained.

| Choice | Shape |
|---|---|
| One stream | Wide: one row per entry, one column per field |
| All streams | Long: one row per data point, with columns `time_utc`, `entry_id`, `stream`, `field`, `value` |

The same download is a plain URL, handy for scripts:

```bash
curl -o berry-today.csv "http://127.0.0.1:3005/export/log.csv?source=ts:berry&date=2026-09-22"
curl -o all-retained.csv "http://127.0.0.1:3005/export/log.csv?source=all"
```

The file is streamed straight out of Redis, so a whole day of every stream does
not sit in memory. The all-streams CSV for one day is exactly what the nightly
archive stores; see [Archive](archive.md).

Each game page links its own trail and mode trail for today (**Raw CSV today**
and **Modes CSV today**). With sign-in on, a download needs a session like any
page.
