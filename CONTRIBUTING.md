# Contributing

Thank you for helping. The [documentation](https://realbifftannen.github.io/stake-polling/)
covers setup and every feature; this page is about changing the code.

## Setting up

```bash
git clone https://github.com/realBiffTannen/stake-polling.git
cd stake-polling
npm install
npm test          # some suites need a local Redis (redis-cli ping -> PONG)
```

Node 22 or newer. The tests use Redis databases 5-15 and delete what they
write; don't point them at a Redis that holds anything you want to keep.

## Rules that keep a public repository safe

- **Fictional data only** in tests, fixtures, docs, screenshots and examples: studios like `acme-studios`, games like `berry` or `pixel-geyser`. Never a real studio, game, team slug, player count, figure, bucket, account id, IP address or person. Screenshots come from the demo (`npm run demo:build`), whose every figure is made up.
- **No credentials**, not even expired ones. `.env`, `.sid`, `config.local.json` and `math.json` are gitignored; keep them that way.
- A value nobody measured is shown as a dash, never as `0`: a fabricated zero reads as a real collapse. The tests pin this; keep them pinned.

## Changes

- Match the surrounding code: plain ESM, no build step, comments that say *why*.
- Add or update tests with the change. `npm test` must pass in full.
- Document user-facing changes in `README.md` and `CHANGELOG.md`.
- Pull requests go to a release branch (`rel/x.y.z`), which goes to `main` once it is approved.
