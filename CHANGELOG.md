# Changelog

## 1.0.1 - 2026-09-23

### Dashboard design
A sleeker, more modern dashboard, built from named interface patterns
(namethatui.com):
- **Sidebar with vibrancy:** a translucent, blurred sidebar with an accent bar on the page in use.
- **Sticky glass header:** stays pinned and blurs the page as it scrolls under it.
- **Live status dot:** pulses while the collector is connected, and turns amber when it goes stale.
- **Segmented control:** the time picker is a proper segmented control, marked up as a group with the current segment announced to screen readers.
- **Cards, pills and alerts:** softer, layered cards, pill badges, page banners with an icon, and inline alerts with an accent edge.
- **Toast and hover card:** the refresh notice is a toast and chart tooltips are hover cards.
- **Empty states and focus rings:** empty states say what to do next, and focus rings show only for keyboard use.
- **Reduced motion:** every animation and transition stops under `prefers-reduced-motion`.
- **Phones:** the sidebar becomes a scrollable tab bar. It used to be one unwrapped row of links wider than the screen, which pushed the whole page sideways.
- **Version:** the release is shown in the footer and in `/healthz`.

### Added
- **Analysis picker:** Last 1h, 3h, 6h and 3 days alongside This month, Today and Last 24h.
- **Redis memory alert:** a sticky alert on every screen while `used_memory` is over `REDIS_DB_SIZE` (default 2GB).
- **Authenticated Redis:** `REDIS_USERNAME`/`REDIS_PASSWORD`, or credentials in the URL. No credentials by default. Passwords are masked wherever a URL is printed.
- **`.env`:** loaded at startup (see `.env.example`); the real environment wins over it.
- **Nightly archive:** at 00:00:00Z every finished UTC day is gzipped to `S3_BUCKET`, or to `./stake-polling-logrotate-data`. It runs in its own process, never blocks polling and never deletes from Redis. The `/archive` page lists the stored days, with presigned S3 links, or `file://` links and downloads for the local store.
- **S3 setup:** `scripts/create-s3-bucket.py` and `docs/s3/*.example.json` for a private, encrypted, TLS-only bucket and a least-privilege IAM user.

## 1.0.0

Initial public release.
