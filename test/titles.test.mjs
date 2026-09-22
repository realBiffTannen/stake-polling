import { test } from 'node:test';
import assert from 'node:assert/strict';
import { titlesOf } from '../src/games.mjs';
import { games } from './fixtures/live.mjs';

test('titlesOf keeps every catalogue title, live or not', () => {
  assert.deepEqual(titlesOf(games).map(t => t.slug), ['berry', 'pixel-carnivals', 'hippo-hustle']);
});

test('titlesOf passes only the allow-listed fields through to the browser', () => {
  const [berry] = titlesOf([{ slug: 'berry', name: 'Berry', isLive: true, published: true, image: 'https://x/y.png',
    rating: 30, stats: { month: { count: 1 } }, onlinePlayers: 4, approval: { open: false, locked: false, column: 'responded' } }]);
  assert.deepEqual(berry, { slug: 'berry', name: 'Berry', isLive: true, published: true, approval: 'responded' });
});

test('the approval stage is the catalogue column, and null when the catalogue has none', () => {
  const [a, b] = titlesOf([{ slug: 'a', approval: { column: 'awaiting' } }, { slug: 'b', approval: null }]);
  assert.equal(a.approval, 'awaiting');
  assert.equal(b.approval, null);
});

test('liveness is strictly isLive === true, and an unknown published flag stays unknown', () => {
  const [t] = titlesOf([{ slug: 'x', isLive: 'true' }]);
  assert.equal(t.isLive, false);
  assert.equal(t.published, null, 'absent is not "unpublished"');
  assert.equal(titlesOf([{ slug: 'y', published: false }])[0].published, false);
});

test('a title with no name falls back to its id, and one with no id at all is dropped', () => {
  assert.deepEqual(titlesOf([{ slug: 'goose' }, { name: 'nameless' }].map(g => ({ ...g, isLive: false })))
    .map(t => [t.slug, t.name]), [['goose', 'goose'], ['nameless', 'nameless']]);
  assert.deepEqual(titlesOf([{ isLive: false }]), []);
});

test('a malformed catalogue payload yields no titles rather than throwing', () => {
  assert.deepEqual(titlesOf(null), []);
  assert.deepEqual(titlesOf({ weird: 'shape' }), []);
});
