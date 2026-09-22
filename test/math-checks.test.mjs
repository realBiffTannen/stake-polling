import { test } from 'node:test';
import assert from 'node:assert/strict';
import { loadMathModel, gameModel, edgeApi, mathDrift } from '../src/math/checks.mjs';
import * as shim from '../src/tui/math.mjs';

test('the checks are importable from src/math/checks.mjs', () => {
  const model = loadMathModel(new URL('./fixtures/math.json', import.meta.url).pathname);
  assert.ok(gameModel(model, 'metro-night-run'));
  assert.equal(edgeApi({ expectedReturn: 45, turnover: 1000 }), 0.045);
});

test('src/tui/math.mjs re-exports the same functions, so the TUI is unaffected', () => {
  for (const name of ['loadMathModel', 'gameModel', 'modeModel', 'edgeApi',
    'marginOf', 'convergence', 'isReadable', 'checkMode']) {
    assert.equal(typeof shim[name], 'function', name);
  }
});

// ------------------------------------------------------------- math drift
// The API serves a few figures of each game's math - the mode list, each
// mode's cost and stated RTP - and those are compared with math.json so a
// newly published math version is noticed instead of silently mis-read.
const captured = { edge: 0.035, modes: { BASE: { cost: 1, rtp: 0.965 }, BONUS: { cost: 100, rtp: 0.965 } } };

test('a deployment that matches its captured model shows no drift, float noise included', () => {
  assert.deepEqual(mathDrift(captured, [{ mode: 'BASE', cost: 1, rtp: 0.9649999910816335 }, { mode: 'BONUS', cost: 100, rtp: 0.965 }]), []);
});

test('a new mode, a repriced mode and a retuned RTP each show as drift', () => {
  const drift = mathDrift(captured, [
    { mode: 'BASE', cost: 1, rtp: 0.955 },
    { mode: 'BONUS', cost: 120, rtp: 0.965 },
    { mode: 'SUPER', cost: 300, rtp: 0.965 },
  ]);
  assert.deepEqual(drift.map((d) => [d.kind, d.mode]), [['rtp', 'BASE'], ['cost', 'BONUS'], ['mode_added', 'SUPER']]);
  assert.match(drift[0].message, /95\.50%.*96\.50%/);
  assert.match(drift[1].message, /120x.*100x/);
});

test('a mode captured without its own RTP is compared against the game edge', () => {
  const drift = mathDrift({ edge: 0.04, modes: { BASE: { cost: 1 } } }, [{ mode: 'BASE', cost: 1, rtp: 0.965 }]);
  assert.deepEqual(drift.map((d) => d.kind), ['rtp']);
});

test('nothing to compare is not drift: no model, no deployed rows, unmeasured fields, or a captured mode nobody played', () => {
  assert.deepEqual(mathDrift(null, [{ mode: 'BASE', cost: 1, rtp: 0.9 }]), []);
  assert.deepEqual(mathDrift(captured, []), []);
  assert.deepEqual(mathDrift(captured, [{ mode: 'BASE', cost: null, rtp: null }]), [], 'unmeasured is not different');
  assert.deepEqual(mathDrift(captured, [{ mode: 'BASE', cost: 1, rtp: 0.965 }]), [], 'BONUS may simply be unplayed this month');
});
