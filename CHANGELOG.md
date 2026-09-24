# Changelog

## 1.1.0 - 2026-09-23

### Added
- **Games table on the Overview:** every title in the catalogue, live or not, with the star rating the Engine studio shows for it (out of three; the catalogue's `rating` over 30, rounded, as the studio's own games list draws it, or *Unrated*), whether it is live, its approval stage, a link to its game page and a link to its page on the Engine studio. The money table is now titled *Live games this month*.
- **Revenue model per game,** in the same table: the roster's `rate` (basis points) read as the **10% revenue share** or the **5% GGR split across providers**, with a dash for a title not on the roster. Roster rows now carry `rate`; the demo roster reports 1000.

### Changed
- **Analysis:** *Unusual days* and *The tape* start folded; the heading and its conclusion stay in view and an arrow opens the list. An opened fold stays open through the live refresh.
- **Live operations:** *running action* and *findings* show the five newest entries, with the rest behind *Show N more*.

## 1.0.2 - 2026-09-23

### Added
- **Optional sign-in** for the dashboard, off until turned on in Settings:
  - the password is kept as a salted scrypt hash, and sessions are stored by the hash of their token in HttpOnly SameSite=Strict cookies;
  - every form carries a CSRF token and is refused from another origin;
  - sign-in and password checks are rate-limited per address;
  - changing the password, signing out everywhere or turning sign-in off ends every other session;
  - `npm run auth -- status|disable` recovers from the machine itself.
- **Settings page** with Security, System and About tabs: the sign-in switch and forms, Redis memory as a level meter, and showing dismissed warnings again.
- **Players on Analysis:**
  - average and peak players online, and players new to the month;
  - how turnover and bets move with players online (Pearson's r and the turnover per extra player, one point per poll interval);
  - each game's share of turnover against its share of players.

  All of these relate counts to money; the API never identifies a player.
- **Interactive charts,** served from the dashboard, not a CDN:
  - Apache ECharts draws an hour-by-day heatmap and a zoomable daily trend on Trends, and a turnover treemap and turnover-flow Sankey on Analysis;
  - Smoothie draws live strips of players online and bets per poll on Live operations.
- **Last 10 min span,** with the picker ordered shortest first.
- **Daily breakdown as a PDF,** as well as CSV, from a dependency-free PDF writer.
- **Interface:** a command palette (Cmd/Ctrl+K or /), breadcrumbs, a mobile navigation drawer, a poll progress bar, an "On this page" scrollspy on Analysis, accordions, a timeline tape, an overflow menu, a table filter and modal dialogs.
- **Demo site:** a static copy of the dashboard running on made-up data for twenty fictional games (`npm run demo:build`, `npm run demo:deploy`), hosted at http://stake-polling-demo.s3-website-us-east-1.amazonaws.com/
- **Documentation site** on GitHub Pages, plus `SECURITY.md` and `CONTRIBUTING.md`.
- **Disclaimer** in the footer of every page and on the sign-in page: independent software, not affiliated with Engine, provided as is, not financial advice, no liability. It is repeated word for word in the README and on the docs site.

### Changed
- Dismissed warnings are kept on the server for everyone, not in one browser.
- The archive page drops its redundant "Presigned URL" disclosure. The local archive links each file on disk (`file://`) as well as serving it.
- `Referrer-Policy` is `same-origin`. Under `no-referrer`, browsers send `Origin: null` on form posts, which the CSRF check refuses.
- `STAKE_MATH_FILE` names a math.json other than the one at the root.

### Fixed
- The README screenshots showed a real studio's games and figures; they are replaced by screenshots of the demo.
- Game, bet-mode and bucket pages name themselves in the breadcrumbs.

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
- **Dismissible warnings:** standing warnings (math drift, games with no captured model) carry a dismiss button. A dismissal holds for everyone, on every browser, and Settings > System shows them again. It is tied to what the warning says, so a warning that changes shows again. Live faults (sync failure, stale data, Redis memory) cannot be dismissed.
- **Phones:** the sidebar becomes a scrollable tab bar. It used to be one unwrapped row of links wider than the screen, which pushed the whole page sideways.
- **Version:** the release is shown in the footer and in `/healthz`.

### Added
- **Analysis picker:** Last 10 min, 1h, 3h, 6h and 3 days alongside Last 24h, Today and This month, shortest first.
- **Redis memory alert:** a sticky alert on every screen while `used_memory` is over `REDIS_DB_SIZE` (default 2GB).
- **Authenticated Redis:** `REDIS_USERNAME`/`REDIS_PASSWORD`, or credentials in the URL. No credentials by default. Passwords are masked wherever a URL is printed.
- **`.env`:** loaded at startup (see `.env.example`); the real environment wins over it.
- **Nightly archive:** at 00:00:00Z every finished UTC day is gzipped to `S3_BUCKET`, or to `./stake-polling-logrotate-data`. It runs in its own process, never blocks polling and never deletes from Redis. The `/archive` page lists the stored days, with presigned S3 links, or `file://` links and downloads for the local store.
- **S3 setup:** `scripts/create-s3-bucket.py` and `docs/s3/*.example.json` for a private, encrypted, TLS-only bucket and a least-privilege IAM user.

## 1.0.0

Initial public release.
