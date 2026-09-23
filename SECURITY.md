# Security

## Reporting a vulnerability

Please report security problems privately, not in a public issue: use
**[Report a vulnerability](https://github.com/realBiffTannen/stake-polling/security/advisories/new)**
on this repository (GitHub's private vulnerability reporting). Say what you
found, how to reproduce it, and which version (`/healthz` reports it). Expect
an acknowledgement within a few days.

## Supported versions

Fixes land on the latest release only.

## What to know when running it

- **The dashboard is open until you turn sign-in on** (Settings > Security).
  It binds every interface by default; `npm start -- --host 127.0.0.1` keeps
  it on the machine.
- **It serves plain HTTP.** With sign-in on, the password crosses the network
  unencrypted. On a network you do not trust, reach it over an SSH tunnel or
  put it behind a reverse proxy that serves HTTPS.
- **What it stores.**
  - The Engine session id (`sid`) is kept in `.sid` (mode 600) and never logged, stored in Redis or sent to the browser.
  - A sign-in password is kept only as a salted scrypt hash.
  - Sessions are stored by the hash of their token.
- **Never commit** `.env`, `.sid`, `config.local.json` or `math.json`. All four are gitignored, because they hold credentials or your studio's own figures.
- **The archive bucket is private.** `scripts/create-s3-bucket.py` blocks public access, enforces TLS and gives the archiver a user that can only upload, read and list under its prefix. The demo bucket is the only one that should ever be public.
