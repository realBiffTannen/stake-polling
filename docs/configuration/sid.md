---
title: The sid
parent: Configuration
nav_order: 1
description: "Where the poller finds a session cookie, how it validates it, and how it recovers when it expires."
---

# The sid
{: .no_toc }

Every studio API endpoint is authenticated with the `sid` cookie from a
logged-in `studio.engine.io` session.

1. TOC
{:toc}

## Where it comes from

The poller looks for a sid in this order, and checks each candidate against the
live API before accepting it. A stale value in an earlier source falls through
to the next one instead of wedging the poller.

| Order | Source | Notes |
|---|---|---|
| 1 | `STAKE_SID` | Environment variable, or a line in `.env` |
| 2 | `.sid` | A file in the project root, mode 600, gitignored. `STAKE_SID_FILE` names another path |
| 3 | Chrome | The `sid` cookie from your logged-in Chrome profile. macOS only |
| 4 | You | A hidden prompt at the terminal, on startup. Up to three tries |

A sid found in Chrome, or typed at the prompt, is written to `.sid` (mode 600)
so the next start is quiet.

If a network error stops the check, the poller keeps the candidate and retries:
a dropped connection says nothing about the credential.

If nothing works, the poller exits with:

```
no usable sid. Set STAKE_SID, write one to .sid, or run this in a terminal to be prompted.
```

## Getting one by hand

Open a logged-in `studio.engine.io` tab, then DevTools > **Application** >
**Cookies** > `sid`. Copy the value and either paste it at the prompt or save
it:

```bash
printf '%s' 'PASTE-SID-HERE' > .sid && chmod 600 .sid
```

## When it expires mid-run

The poller pauses rather than writing fiction into the trail. Then it tries to
recover on its own, once per poll tick:

- if `.sid` has changed, it validates the new value and resumes;
- otherwise it re-reads the Chrome cookie store, at most once every ten
  minutes.

If neither works it keeps running, paused. The web dashboard shows a red
`SID EXPIRED` banner, the terminal dashboard shows the same in its header, and
an `auth` finding is raised. Drop a new sid into `.sid` and polling resumes on
the next tick, with no restart.

## The web dashboard's daily sync

The web dashboard runs its own small sync of daily history (see
[Player insights](../dashboard/insights.md)). It uses `STAKE_SID` or `.sid`
only, never Chrome or a prompt. Without one it keeps showing cached figures and
says **Daily sync needs a valid session in .sid or STAKE_SID**.

## Chrome recovery (macOS)

The Chrome path reads
`~/Library/Application Support/Google/Chrome/<profile>/Cookies` (the `Default`
profile and any `Profile N`) and decrypts it with the Keychain
`Chrome Safe Storage` key. That triggers a one-time macOS authorisation prompt.
It is best-effort: it returns nothing if Chrome is absent, the profile moved,
or the encryption scheme changed. The terminal prompt and `.sid` always work.

This is why the launchd service starts at login rather than at boot: a job
running before anyone logs in cannot reach the Keychain. See
[Running as a service](../service.md).

## What is kept, and what is not

**The sid is never logged, never stored in Redis, and never included in an
error message.** Only `sha256(sid)[0:8]`, the fingerprint, is recorded. It is
enough to tell "the sid changed" from "the same sid is still failing":

```
[09:14:30] sid accepted from file (1a2b3c4d)
```

Some agent sandboxes classify a sid-bearing request as data exfiltration and
block it. Run the poller from a normal shell.
