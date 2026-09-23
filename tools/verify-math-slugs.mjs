#!/usr/bin/env node
/**
 * Prints, for every game the collector has cached, whether math.json holds a
 * model for it and whether the captured mode names match the deployed ones.
 *
 * A mapping guessed from a display name ("Goose Farm" -> goose? goose-ranch?)
 * produces confident false drift alerts, so the mapping is proven here rather
 * than assumed. READ-ONLY: this script only ever calls GET on Redis.
 */
import { createClient } from 'redis';
import { redisOptions } from '../src/store/redis.mjs';
import { loadConfig } from '../src/config.mjs';
import { keys } from '../src/store/keys.mjs';
import { loadMathModel } from '../src/math/checks.mjs';

const config = loadConfig();
const k = keys(config.team);
const model = loadMathModel(new URL('../math.json', import.meta.url).pathname);
const client = createClient(redisOptions(config.redisUrl));
await client.connect();

const listing = JSON.parse((await client.get(k.games)) ?? '{}');
for (const game of listing.data ?? []) {
  const cached = await client.get(k.game(game.slug));
  const deployed = cached ? (JSON.parse(cached).data?.stats ?? []).map((r) => r.mode).sort() : [];
  const captured = model[game.slug] ? Object.keys(model[game.slug].modes).sort() : null;
  const verdict = !captured ? (game.isLive ? 'LIVE, NO MODEL' : 'no model (not live)')
    : !deployed.length ? 'model, no deployed modes cached'
    : String(captured) === String(deployed) ? 'match'
    : `MISMATCH captured=[${captured}] deployed=[${deployed}]`;
  console.log(`${game.slug.padEnd(22)} live=${String(game.isLive).padEnd(5)} ${verdict}`);
}
await client.quit();
