#!/usr/bin/env node
import { loadConfig } from '../src/config.mjs';
import { connect, redactUrl } from '../src/store/redis.mjs';
import { keys } from '../src/store/keys.mjs';
import { DashboardApp } from '../src/tui/app.mjs';
import { VIEWS } from '../src/tui/views/plain.mjs';

const config = loadConfig();
const k = keys(config.team);

let client;
try {
  client = await connect(config.redisUrl);
} catch (err) {
  console.error(`cannot reach redis at ${redactUrl(config.redisUrl)}: ${err?.message ?? err}`);
  console.error('start it with `redis-server` (or `brew services start redis`) and try again.');
  process.exit(1);
}

const app = new DashboardApp({ client, keys: k, config });

// Every keystroke-driven view is a flag too, or a redirected dashboard - with
// nobody to press a key - can only ever show the roster.
//   stake-dash --view health --game pixel-carnivals > health.txt
//   stake-dash --view daily > daily.txt                          (profit per accounting day)
//   stake-dash --bucket 1h --game pixel-carnivals > today.txt   (old spelling of --view buckets)
const argv = process.argv.slice(2);
const flag = (name) => {
  const at = argv.indexOf(`--${name}`);
  return at === -1 ? null : argv[at + 1] ?? null;
};

const view = flag('view');
const mode = flag('mode');

app.bucket = flag('bucket');

if (view && !VIEWS.includes(view)) {
  console.error(`unknown --view ${view}: expected one of ${VIEWS.join(', ')}`);
  process.exit(1);
}
if (app.bucket && !['5m', '1h'].includes(app.bucket)) {
  console.error(`unknown --bucket ${app.bucket}: expected 5m or 1h`);
  process.exit(1);
}

// --bucket is the old spelling of --view buckets; both still work.
app.setView({ view: view ?? (app.bucket ? 'buckets' : null), game: flag('game'), mode });

// Piped or redirected: print one snapshot and leave. The dashboard should be
// usable from a script, not only from a terminal.
if (!process.stdout.isTTY) {
  console.log(await app.snapshot());
  await client.quit();
  process.exit(0);
}

for (const signal of ['SIGINT', 'SIGTERM']) process.on(signal, () => app.stop());

// An uncaught error must not leave the terminal in the alternate screen with
// the cursor hidden.
process.on('uncaughtException', async (err) => {
  app.stop();
  await client.quit().catch(() => {});
  console.error(err);
  process.exit(1);
});

await app.run();
await client.quit();
process.exit(0);
