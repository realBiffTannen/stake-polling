---
title: Sign-in and security
nav_order: 6
description: "Turning on sign-in, sessions, CSRF, rate limits, recovery, plain HTTP, reverse proxies, and what stays public."
---

# Sign-in and security
{: .no_toc }

1. TOC
{:toc}

## Off by default

The dashboard binds every interface and is open to anyone who can reach it
until you turn sign-in on. That means turnover, profit, player counts, per-mode
math and the game catalogue, including unreleased titles. The header says
**Sign-in off** while it is.

Two ways to close it, which you can combine:

- keep it on this machine: `npm start -- --host 127.0.0.1` (or `web.host` in
  `config.local.json`, or `STAKE_WEB_HOST=127.0.0.1`);
- turn on sign-in.

## Turning it on

Go to **Settings > Security > Require sign-in**. Choose a username (1 to 64
letters, digits, dots, hyphens, underscores or `@`) and a password of at least
10 characters, entered twice. The browser you do it from stays signed in.

From then on, every page, live refresh, CSV and PDF export and archive download
needs a session. A page load without one goes to the sign-in page and comes
back afterwards; anything else (a live refresh, an export, an archive file) is
refused with `401`.

Settings is also where you:

- change the username or password (this signs every other browser out);
- **Sign out everywhere**, this browser included;
- turn sign-in off again.

Each of those asks for the current password.

## What stays public

With sign-in on, these still answer without a session:

| Path | Why |
|---|---|
| `/healthz` | So monitors keep working. It returns only `ok`, the version, `collectorStale` and `dailySyncError` |
| `/login` | The sign-in page itself |
| The static files: `/app.css`, `/app.js`, `/charts.css`, `/charts.js`, `/brand/logo.svg`, `/brand/favicon.svg`, `/vendor/echarts.min.js`, `/vendor/smoothie.js`, and `/favicon.ico` | So the sign-in page can load. They hold code and styles, never data |

## How it is kept safe

- **Passwords:** only a salted scrypt hash of the password is stored, in
  Redis (`stake:<team>:auth`).
- **Sessions:** random tokens in `HttpOnly`, `SameSite=Strict` cookies
  (`sp_session`). Redis holds only each token's SHA-256, with an expiry: 12
  hours, or 30 days with **Keep me signed in for 30 days**. Changing the
  credentials, signing out everywhere or turning sign-in off ends every other
  session at once, and a session from before sign-in was last turned off can
  never come back.
- **Forms:** every form, including the one that turns sign-in on, carries a
  CSRF token (the `sp_csrf` cookie, repeated in a hidden field) and is refused
  from another origin. So another website cannot turn sign-in on with its own
  password and lock you out.
- **Guessing:** sign-in attempts are rate-limited per address: 5 wrong in 15
  minutes, and that address waits out the window. The same limit covers the
  current-password check on the Settings actions, so a borrowed session cannot
  be used to guess the password. An unknown username takes as long to reject
  as a wrong password.
- **Redis down:** if the sign-in check cannot read Redis, the dashboard
  refuses with `503` rather than opening up.
- **Headers:** every response carries a strict Content-Security-Policy
  (scripts and styles from the dashboard only, no framing), `nosniff` and a
  same-origin referrer policy.

## Forgot the password?

On the machine running the dashboard:

```bash
npm run auth -- status     # is sign-in on, and for whom
npm run auth -- disable    # turn it off and end every session
```

Then turn it on again, with a new password, under **Settings > Security**.
Whoever can run this command can read Redis anyway, so it adds no new way in.

## Plain HTTP

The dashboard serves plain HTTP, so on your network the password crosses the
wire unencrypted. On a network you do not trust:

- bind it to this machine (`npm start -- --host 127.0.0.1`) and reach it over
  an SSH tunnel:

  ```bash
  ssh -N -L 3005:127.0.0.1:3005 youruser@dashboard-host
  # then open http://127.0.0.1:3005 on your own machine
  ```

- or put it behind a reverse proxy that serves HTTPS.

## Behind a reverse proxy

A proxy that terminates HTTPS in front of the dashboard works, with three
things to get right:

1. **Bind the dashboard to `127.0.0.1`** so the only way in is through the
   proxy.
2. **Pass the original `Host` header through.** A form post is accepted only
   when the browser's `Origin` matches the `Host` the dashboard sees. A proxy
   that rewrites `Host` to `127.0.0.1:3005` makes every sign-in and Settings
   form fail with "The form expired".
3. **Set `X-Forwarded-Proto: https`.** With it, the session and CSRF cookies
   are also marked `Secure`.

For example, with nginx:

```nginx
location / {
    proxy_pass http://127.0.0.1:3005;
    proxy_set_header Host $host;
    proxy_set_header X-Forwarded-Proto https;
}
```

Two things to know about proxies:

- The rate limit counts wrong passwords per **connection address**, and the
  dashboard does not read `X-Forwarded-For`. Behind a proxy every visitor
  shares the proxy's address, so five wrong passwords from anyone make
  everyone wait out the 15 minutes.
- The count is kept in the dashboard's memory, so restarting the dashboard
  clears it.

## Other things worth knowing

- **The sid** is never logged, never stored in Redis, never sent to the
  browser, and never included in an error message. See
  [The sid](configuration/sid.md).
- **Redis credentials** are read from the environment, never carried on the
  config object, and masked in every URL a process prints. See
  [Redis](redis.md#authenticated-redis).
- **Archive links.** A presigned S3 link from the Archive page works for
  whoever holds it until it expires. Keep `S3_PRESIGN_SECONDS` short if that
  matters. See [Nightly archive and S3](archive.md).
- **Secrets on disk:** `.sid`, `.env` and `config.local.json` are gitignored.
  `.sid` and a `.env` written by the S3 setup script are mode 600.
