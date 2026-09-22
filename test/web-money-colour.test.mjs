import { test } from 'node:test';
import assert from 'node:assert/strict';
import { money } from '../src/web/format.mjs';

test('a profit is green', () => {
  assert.match(String(money(12.5)), /class="good"/);
});

test('a loss is red', () => {
  assert.match(String(money(-12.5)), /class="bad"/);
});

test('zero is green, by the standing ruling', () => {
  assert.match(String(money(0)), /class="good"/);
});

test('an unmeasured figure is a dash with no colour', () => {
  assert.equal(String(money(null)), '-');
  assert.equal(String(money(undefined)), '-');
  assert.equal(String(money('')), '-');
  assert.equal(String(money(NaN)), '-');
});

test('the signed form keeps its sign and its colour', () => {
  const out = String(money(5, { signed: true }));
  assert.match(out, /class="good"/);
  assert.match(out, /\+\$5\.00/);
});
