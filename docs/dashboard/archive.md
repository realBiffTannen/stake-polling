---
title: Archive
parent: The web dashboard
nav_order: 9
description: "The nightly archive's stored days, their download links, and the archiver's last run."
---

# Archive

Route: `/archive`

Redis keeps 30 days of trail. The nightly archiver keeps it for good, one gzipped
file per UTC day, and this page lists what it has stored. Setting the archiver
up is on [Nightly archive and S3](../archive.md).

## The scope line

The top line says where archives go: `S3: s3://acme-stake-archive/stake-polling/acme-studios/`,
or `Local directory: /home/youruser/stake-polling/stake-polling-logrotate-data`.
For S3 it also says until when the links on the page are valid.

## Last run

When the archiver last ran, where it stored to, which days it stored, and any
failure, with the reason (for example `AccessDenied` or `NoSuchBucket`). Before
the first run it says so, and suggests `npm run archive -- --once`.

## Stored days

One row per file, newest day first: the UTC day, the file name
(`stake-all-YYYY-MM-DD.csv.gz`), its size, when it was stored, and a
**Download** link.

| Store | Download link |
|---|---|
| S3 | A presigned S3 URL, signed afresh on every page load and valid for `S3_PRESIGN_SECONDS` (an hour by default). The file downloads straight from S3 |
| Local folder | The dashboard serves the file itself, from `/archive/file/<name>`. The file name is also a `file://` link to the file on disk, with its full path beneath it to copy |

Most browsers will not follow a `file://` link out of a web page, and one opened
on another machine points at that machine's disk. So for a local archive, the
path (for Finder or a terminal) and **Download** (from anywhere) are the
dependable routes.

Each file is the [poll log](log.md)'s all-streams CSV for one UTC day, gzipped:
raw micro-dollars, gross profit, nothing derived.

## Who can use the links

With sign-in off, anyone who can open this page can use its presigned links
while they last. Keep `S3_PRESIGN_SECONDS` short, turn on
[sign-in](../security.md), or bind the dashboard to `127.0.0.1`, if that
matters on your network. With sign-in on, the page and every local download
need a session. A presigned S3 link, once handed out, works for whoever holds
it until it expires.
