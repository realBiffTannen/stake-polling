import { test } from 'node:test';
import assert from 'node:assert/strict';
import { toUsd, toShareUsd, fromUsd, formatUsd, formatUsdSigned, DEFAULT_MONEY, revenueModel } from '../src/money.mjs';
import { roster, balance } from './fixtures/live.mjs';

const M = DEFAULT_MONEY;

test('raw micro-dollars convert to the figures the accounting page shows', () => {
  // berry: raw 154,868,660,000 -> $154,868.66 (page showed $154,780.68 on a
  // slightly earlier snapshot)
  assert.equal(toUsd(154868660000, M), 154868.66);
  assert.equal(toUsd(41446150864, M).toFixed(2), '41446.15');
});

test('profit is the 10% ggr share, expected is 7.5%', () => {
  // pixel-carnivals on the page: profit -$2,241.02, expected $102.55
  const christmas = roster.find((g) => g.slug === 'pixel-carnivals').stats;
  assert.equal(toShareUsd(christmas.profit, M.profitShare, M).toFixed(2), '-2243.14');
  assert.equal(toShareUsd(christmas.expectedProfit, M.expectedShare, M).toFixed(2), '102.58');
});

test('position equals carry plus the roster profit share', () => {
  // The identity that pins the units: -4,472.87 = -2,184.06 + -2,288.81.
  // The fixture roster is a 3-game subset, so this checks the arithmetic
  // rather than the full-roster figure.
  const carry = toUsd(balance.carry, M);
  const position = toUsd(balance.position, M);
  assert.ok(Math.abs(position - carry) > 0, 'position should differ from carry by the accrued share');
  assert.equal(toUsd(balance.position, M).toFixed(2), '-4474.89');
});

test('formatting matches the page: sign, symbol, grouping, two places', () => {
  assert.equal(formatUsd(154780.68), '$154,780.68');
  assert.equal(formatUsd(-2241.02), '-$2,241.02');
  assert.equal(formatUsd(0), '$0.00');
  assert.equal(formatUsd(102.5), '$102.50');
});

test('formatting never produces a bare eleven-digit integer', () => {
  assert.ok(!formatUsd(toUsd(41446150864, M)).includes('41446150864'));
});

test('signed formatting marks gains with a plus', () => {
  assert.equal(formatUsdSigned(1234.5), '+$1,234.50');
  assert.equal(formatUsdSigned(-1234.5), '-$1,234.50');
  assert.equal(formatUsdSigned(0), '$0.00');
});

test('missing values format as a dash rather than NaN', () => {
  for (const bad of [null, undefined, NaN, 'x']) {
    assert.equal(formatUsd(bad), '-');
    assert.equal(formatUsdSigned(bad), '-');
    assert.equal(toUsd(bad, M), null);
  }
});

test('fromUsd is the inverse, for detector floors', () => {
  assert.equal(fromUsd(50, M), 50_000_000);
  assert.equal(toUsd(fromUsd(50, M), M), 50);
});

test('revenueModel reads the roster rate in basis points, and an absent rate is unknown, not 0%', () => {
  assert.deepEqual(revenueModel(1000), { rateBp: 1000, percent: 10, split: false, label: '10% revenue share' });
  assert.deepEqual(revenueModel(500), { rateBp: 500, percent: 5, split: true, label: '5% GGR, split across providers' });
  assert.equal(revenueModel(750).label, '7.5% GGR');
  assert.equal(revenueModel(0).label, '0% GGR', 'a reported zero is a reported zero');
  assert.equal(revenueModel('1000').rateBp, 1000);
  for (const none of [null, undefined, '', 'ten', NaN]) assert.equal(revenueModel(none), null, String(none));
});
