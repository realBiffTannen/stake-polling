---
title: The web dashboard
nav_order: 5
has_children: true
description: "Starting the web dashboard, getting around it, and what each page shows."
---

# The web dashboard
{: .no_toc }

1. TOC
{:toc}

## Starting it

Usually it starts with everything else:

```bash
npm start
```

It is also its own process, if you want to run it alone or on a different
port:

```bash
npm run web
npm run web -- --port 3010
npm run web -- --host 127.0.0.1   # this machine only
npm run web -- --no-sync          # read cached reports, make no API requests
```

Either way it is the same server with the same default bind: every interface
(`0.0.0.0`), port 3005. `STAKE_WEB_HOST`, `STAKE_WEB_PORT`, `--host` and
`--port` change it; see [Configuration](../configuration.md#command-line-options).

It opens its own reader alongside the running poller, so it never needs a
poller restart, and the HTTP routes never make upstream requests or expose the
sid. Anyone who can reach the port can read everything on it until you turn on
[sign-in](../security.md).

## Getting around

**Command palette.** Press <kbd>⌘K</kbd> on a Mac or <kbd>Ctrl+K</kbd>
elsewhere, or <kbd>/</kbd> when you are not typing in a field, to jump to any
page or game. Type to filter, <kbd>↑</kbd> and <kbd>↓</kbd> to move,
<kbd>Enter</kbd> to open, <kbd>Esc</kbd> to close. The search button in the
header opens it too.

**Sidebar and mobile drawer.** The sidebar lists every page, with an accent bar
on the one in use. On a narrow screen it folds away: the menu button in the
header opens it as a drawer over the page, and tapping outside it, choosing a
page or pressing <kbd>Esc</kbd> closes it. Without JavaScript the sidebar
becomes a scrollable tab bar instead.

**Poll progress bar.** The thin bar under the header fills up towards the
collector's next poll. The header beside it says **Collector connected** (a
pulsing dot) or **Collector stale** (amber), and how long ago the last poll
landed.

**Live refresh.** Pages refresh themselves in step with the collector, a couple
of seconds after each poll, or every 30 seconds on pages without a poll
countdown. A refresh keeps open accordions, horizontal scroll positions and any
filter you are halfway through editing. If a refresh fails, a notice says so
and the cached figures stay on screen. A tab in the background waits, and
catches up when you come back to it.

**Banners.** A few faults show as banners at the top of every page, and cannot
be dismissed while they are true:

| Banner | Means |
|---|---|
| `REDIS MEMORY ... over the ... limit (REDIS_DB_SIZE)` | Redis is using more memory than the limit. Stays pinned while you scroll. See [Redis](../redis.md#memory-alert) |
| `SID EXPIRED - polling is paused` | The studio API rejected the sid. See [The sid](../configuration/sid.md#when-it-expires-mid-run) |
| `STALE - no successful poll recently` | No poll has succeeded for 2.5 poll intervals |
| `aof off` | Redis persistence is off, so the trail lives only until the next Redis restart |

**Standing warnings** that describe a fact rather than a fault (math drift,
games with no captured model) carry a dismiss button instead. See
[Game math](math.md#dismissing-warnings).

**Account corner.** The header's top-right corner says **Sign-in off** while
sign-in is off. Once it is on, it shows your username, with links to Settings
and **Sign out**.

**Reduced motion.** Every animation and transition stops when your system asks
for reduced motion.

## The pages

In sidebar order:

| Page | Route | What it shows |
|---|---|---|
| [Overview](overview.md) | `/` | Today since 00:00:00 UTC in charts: KPI tiles, the running P/L, the day hour by hour and game by game |
| [Games](games.md) | `/games` | The catalogue: every title with its Engine rating, status, revenue model and approval stage, and the titles not yet live |
| [Analysis](analysis.md) | `/analysis` | Every chart with its conclusion, scoped by a time picker |
| [Settlement](settlement.md) | `/settlement` | What would be settled if the month ended now, and whether the endpoints agree |
| [Player insights](insights.md) | `/insights` | Daily players, new and returning, with CSV and PDF export |
| [Live operations](live.md) | `/live` | The collector's roster, live stream strips, possible events and findings |
| [Trends](trends.md) | `/trends` | Players online, 30 days of daily figures, the hour-by-day heatmap and the zoomable daily trend |
| [Game math](math.md) | `/math` | Your `math.json`, and drift warnings |
| [Poll log](log.md) | `/log` | Every entry the poller wrote, with raw CSV downloads |
| [Archive](archive.md) | `/archive` | The nightly archive's stored days and last run |
| [Settings](settings.md) | `/settings` | Sign-in, system status and version |
| Donations | `/donate` | The project's donation addresses, each with a copy button |
| [Game pages](game.md) | `/game/<slug>` | One game in depth: bet modes, math, players, trends |

## Conventions on every page

- **Money.** Turnover is in US dollars. "Studio P/L" and "profit" are the
  studio's share (10% by default) of gross gaming revenue. RTP and house
  margins use the gross figures. See
  [Money units](../configuration.md#money-units).
- **Months** run from the 1st at 00:00Z.
- **A dash means not measured.** A game or hour the collector never saw shows
  `-`, never `$0.00`, and is left out of totals. A zero would claim a quiet
  period somebody watched.
- **Charts state their conclusion.** Each chart has a headline sentence
  computed from the same numbers it draws, and hovering shows the exact
  reading.
- **Interactive charts** (the treemap, Sankey, heatmap, zoomable trend and live
  strips) are drawn by ECharts and Smoothie, served by the dashboard itself
  from `node_modules`. Without JavaScript, or if a library is missing, the
  panel keeps its conclusion and says the chart could not load.
