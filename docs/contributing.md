---
title: Contributing
nav_order: 13
description: "Running the tests, the fictional-data rule, and the privacy rule for a public repository."
---

# Contributing
{: .no_toc }

stake-polling is open source under the MIT licence. Issues and pull requests
are welcome at
[github.com/realBiffTannen/stake-polling](https://github.com/realBiffTannen/stake-polling).

1. TOC
{:toc}

## Set up

```bash
git clone https://github.com/realBiffTannen/stake-polling.git
cd stake-polling
npm install
```

Node 22 or newer. There is no build step: the code is plain ES modules.

## Tests

```bash
npm test                              # the whole suite: node --test test/*.test.mjs
node --test test/config.test.mjs      # one file
```

The suite needs no studio account and no sid: it runs against captured
response shapes in `test/fixtures/`.

**Some suites need a local Redis** at `127.0.0.1:6379`: the store, poller,
archive, sign-in and similar tests. Without one, those suites are skipped with
`redis unreachable on 127.0.0.1:6379` rather than failing, and everything else
still runs. Start Redis to run them all:

```bash
brew services start redis    # or: sudo systemctl start redis-server
npm test
```

{: .warning }
> Those suites use their own numbered Redis databases (5, 6 and 8 to 15) and
> **empty them** (`FLUSHDB`) as they go, because test files run in parallel.
> The collector uses database 0 by default, so a normal install is not
> touched. Do not run the tests against a Redis where those databases hold
> anything you want to keep.

### Fixtures

`test/fixtures/live.mjs` holds trimmed captures of the API's response shapes.
The tests assert against them, so a change upstream (a field renamed, an array
that becomes an object) fails the suite rather than the poller. If you capture
a new shape, trim it and replace every name, slug, id and figure with made-up
ones before it goes anywhere near a commit.

## Fictional games and studios only

This is a public repository. Tests, fixtures, examples, documentation,
screenshots and commit messages use **fictional names and figures only**:

- a team like `acme-studios`;
- games like `berry`, `pixel-geyser` or `marble-orchard`;
- a bucket like `acme-stake-archive`;
- hostnames like `redis.internal`, and loopback (`127.0.0.1`) addresses.

Never use a real studio, game, team slug, bucket, AWS account id, IP address or
person. No credentials or tokens either, not even ones that merely look real;
AWS's own documentation placeholder `AKIDEXAMPLE` is fine.

## Privacy: what never gets committed

Never commit real studio data or anything that identifies your install:

| Never commit | Why |
|---|---|
| `.env` | Redis passwords, S3 settings, AWS keys |
| `.sid` | A live session cookie for your studio account |
| `config.local.json` | Your team slug and settings |
| `math.json` | Your games' certified math |
| `stake-polling-logrotate-data/` | Your archived trail |
| Redis dumps, CSV or PDF exports, screenshots of a real dashboard | Real turnover, profit and player counts |

`.gitignore` already covers the first five. Check `git status` and your staged
diff before every commit anyway:

```bash
git status
git diff --cached
```

## How the code likes to be written

A few rules run through the whole codebase. A change that follows them is much
easier to review:

- **A value nobody measured is a dash, never a zero.** A made-up `0` is
  indistinguishable from a real collapse, and would fire a `drop` alert or
  claim a quiet period nobody watched.
- **Raw units are what gets stored.** The trail is a faithful record of what
  the API said, in micro-dollars and gross profit; conversion happens only for
  display.
- **Every chart states its conclusion,** computed from the same numbers it
  draws, so the words cannot drift from the picture.
- **Time-based settings are written in wall-clock minutes** and derived from
  `pollMinutes`, so changing the interval does not quietly change everything
  else.
- **The sid and credentials never reach a log, Redis or the browser.**

## Documentation

This site is the `docs/` folder of the repository, published by GitHub Pages
with the [Just the Docs](https://just-the-docs.com) theme. Each page is a
Markdown file with a little front matter (`title`, `nav_order`, and `parent` for
a child page). Link between pages with relative links to the `.md` files, and
keep to the same rules: plain, practical wording, exact commands in code
blocks, and fictional names only.

If your change adds or alters a feature, add a line for it to `CHANGELOG.md`.
