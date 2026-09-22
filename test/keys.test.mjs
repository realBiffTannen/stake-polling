import { test } from 'node:test';
import assert from 'node:assert/strict';
import { keys } from '../src/store/keys.mjs';

test('keys are namespaced by team', () => {
  const k = keys('acme-studios');
  assert.equal(k.ns, 'stake:acme-studios');
  assert.equal(k.roster, 'stake:acme-studios:roster:latest');
  assert.equal(k.games, 'stake:acme-studios:games:latest');
  assert.equal(k.graph, 'stake:acme-studios:graph:latest');
  assert.equal(k.lifetime, 'stake:acme-studios:lifetime:latest');
  assert.equal(k.game('pixel-geyser'), 'stake:acme-studios:game:pixel-geyser:latest');
  assert.equal(k.tsGame('pixel-geyser'), 'stake:acme-studios:ts:pixel-geyser');
  assert.equal(k.tsGameModes('pixel-geyser'), 'stake:acme-studios:ts:pixel-geyser:modes');
  assert.equal(k.tsTeam, 'stake:acme-studios:ts:team');
  assert.equal(k.tsOnline, 'stake:acme-studios:ts:online');
  assert.equal(k.alerts, 'stake:acme-studios:alerts');
  assert.equal(k.meta, 'stake:acme-studios:meta');
  assert.equal(k.lock, 'stake:acme-studios:lock:poller');
  assert.equal(k.chTick, 'stake:acme-studios:tick');
  assert.equal(k.chAlerts, 'stake:acme-studios:alerts:ch');
});

test('a different team gets a different namespace', () => {
  assert.equal(keys('other-team').roster, 'stake:other-team:roster:latest');
});

test('the per-mode trail is a stream of its own, not the game trail', () => {
  const k = keys('acme-studios');
  assert.notEqual(k.tsGameModes('pixel-geyser'), k.tsGame('pixel-geyser'));
  // Slugs are URL path segments - `[a-z0-9-]` - which is what every key here
  // has always relied on to interpolate them unescaped.
  assert.ok(/^[a-z0-9-]+$/.test('pixel-geyser'));
});
