import { test } from 'node:test';
import assert from 'node:assert/strict';
import { normaliseModes, modeField, parseModeField, MODE_FIELDS, modeOrder } from '../src/modes.mjs';
import { gameStats } from './fixtures/live.mjs';

test('per-mode stats are flattened to MODE:field keys', () => {
  const out = normaliseModes({ 'pixel-carnivals': { ok: true, data: gameStats } });
  assert.equal(out['pixel-carnivals']['BASE:profit'], -1575312730);
  assert.equal(out['pixel-carnivals']['BASE:turnover'], 5141917874);
  assert.equal(out['pixel-carnivals']['BASE:count'], 10029);
  assert.equal(out['pixel-carnivals']['BONUS_BOOST:turnover'], 2425201818);
  assert.equal(out['pixel-carnivals']['FREE_SPINS:count'], 147);
});

test('only the three cumulative fields are stored - rtp is a ratio, not a counter', () => {
  const out = normaliseModes({ 'pixel-carnivals': { ok: true, data: gameStats } });
  assert.deepEqual(MODE_FIELDS, ['count', 'turnover', 'profit']);
  assert.equal(out['pixel-carnivals']['BASE:rtp'], undefined);
  assert.equal(out['pixel-carnivals']['BASE:effectiveRtp'], undefined);
});

test('a failed per-game fetch contributes no sample at all', () => {
  const out = normaliseModes({ 'pixel-nest': { ok: false, error: { code: 'HTTP' } } });
  assert.equal(out['pixel-nest'], undefined, 'a gap must stay a gap, not become a row of zeros');
});

test('a mode name that would break the field encoding is sanitised', () => {
  const out = normaliseModes({
    g: { ok: true, data: { stats: [{ mode: 'SUPER:BONUS 2', count: 5, turnover: 10, profit: 1 }] } },
  });
  assert.equal(out.g['SUPER_BONUS_2:count'], 5);
  assert.deepEqual(parseModeField('SUPER_BONUS_2:count'), { mode: 'SUPER_BONUS_2', field: 'count' });
});

test('modes with no usable name are dropped rather than keyed as undefined', () => {
  const out = normaliseModes({ g: { ok: true, data: { stats: [{ count: 5, turnover: 10 }] } } });
  assert.equal(out.g, undefined);
});

test('the per-mode array is found under stats, modes, or a bare array', () => {
  const row = [{ mode: 'BASE', count: 1, turnover: 2, profit: 3 }];
  for (const data of [{ stats: row }, { modes: row }, row]) {
    assert.equal(normaliseModes({ g: { ok: true, data } }).g['BASE:profit'], 3);
  }
});

test('field encoding round-trips and rejects anything that is not one', () => {
  assert.equal(modeField('FREE_SPINS', 'profit'), 'FREE_SPINS:profit');
  assert.deepEqual(parseModeField('FREE_SPINS:profit'), { mode: 'FREE_SPINS', field: 'profit' });
  assert.equal(parseModeField('onlinePlayers'), null);
});

test('BASE sorts first and the rest alphabetically, whatever order they arrive in', () => {
  assert.deepEqual(
    modeOrder(['FREE_SPINS', 'BASE', 'BONUS_BOOST']),
    ['BASE', 'BONUS_BOOST', 'FREE_SPINS'],
  );
  assert.deepEqual(
    modeOrder(['ICY_SPINOUT', 'VIPER_VAULT', 'ANTE', 'COASTAL_CRUISER', 'BASE']),
    ['BASE', 'ANTE', 'COASTAL_CRUISER', 'ICY_SPINOUT', 'VIPER_VAULT'],
  );
});

test('modeOrder is stable, deduplicating and safe on nothing', () => {
  assert.deepEqual(modeOrder(['ANTE', 'ANTE', 'BASE']), ['BASE', 'ANTE']);
  assert.deepEqual(modeOrder([]), []);
  assert.deepEqual(modeOrder(null), []);
});

test('a game with no BASE mode still sorts alphabetically', () => {
  assert.deepEqual(modeOrder(['ZULU', 'ALPHA']), ['ALPHA', 'ZULU']);
});
