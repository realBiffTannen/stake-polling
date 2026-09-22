import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { loadMathModel } from '../src/math/checks.mjs';

const model = loadMathModel(new URL('./fixtures/math.json', import.meta.url).pathname);
const live = JSON.parse(readFileSync(new URL('./fixtures/live-modes.json', import.meta.url), 'utf8'));
// NOTE: the brief's own draft of this list used 'goose-farm' literally, but
// that memory file's title is a studio dev-name that was never a live API
// slug - the /games catalogue has no "goose-farm" entry at all. Per
// goose_farm/FOLLOWUP.md section 12 ("Stake pre-check, 2026-09-17 ... renamed
// GOOSE RANCH"), the title was renamed post-approval; math, RTP and the
// published books were untouched. 'goose-ranch' is the real, current API
// slug for this captured math and is used here instead - see task-3-report.md.
const CAPTURED = ['metro-night-run', 'pixel-bulldogs', 'pixel-nest', 'pixel-balloons',
  'pixel-geyser', 'pixel-fort', 'pixel-carnivals', 'dino-dash-extreme',
  'neon-city-heist', 'goose-ranch', 'pixel-embers', 'hippo-hustle', 'berry',
  'lunar-blossom', 'berry-cosmos'];

// Figures the capture genuinely does not contain. Each entry is a fact about
// the source material, not a licence to invent one: the dashboard degrades to
// "not captured" for these and draws no conclusion from them. Filling a gap in
// math.json without removing it here fails this test on purpose.
const CAPTURE_GAPS = {
  'neon-city-heist': { game: ['version'], modes: { PROMO_PASS: ['sigma', 'zeroRate', 'mean', 'minWin', 'subBetRate', 'avgSpinsBetweenWin', 'worstLossStreak', 'worstZeroStreak'] } },
};

test('every captured game is present', () => {
  for (const slug of CAPTURED) assert.ok(model[slug], `missing ${slug}`);
});

test('every game entry carries the fields the dashboard reads', () => {
  for (const [slug, game] of Object.entries(model)) {
    const gap = CAPTURE_GAPS[slug]?.game ?? [];
    for (const key of ['version', 'edge', 'maxWin', 'baseVolatility', 'volatilityClass', 'modes']) {
      if (gap.includes(key)) continue;
      assert.ok(game[key] !== undefined, `${slug}.${key}`);
    }
    assert.ok(game.edge > 0 && game.edge < 0.12, `${slug} edge out of range: ${game.edge}`);
    assert.ok(Object.keys(game.modes).length > 0, `${slug} has no modes`);
  }
});

test('every mode carries a cost, an rtp and a sigma, and none is a coerced zero', () => {
  for (const [slug, game] of Object.entries(model)) {
    for (const [name, mode] of Object.entries(game.modes)) {
      const gap = CAPTURE_GAPS[slug]?.modes?.[name] ?? [];
      assert.ok(Number.isFinite(mode.cost) && mode.cost > 0, `${slug}.${name}.cost`);
      assert.ok(mode.rtp > 0.8 && mode.rtp <= 0.97, `${slug}.${name}.rtp ${mode.rtp}`);
      if (!gap.includes('sigma')) {
        assert.ok(Number.isFinite(mode.sigma) && mode.sigma > 0, `${slug}.${name}.sigma`);
      }
      if (!gap.includes('zeroRate')) {
        assert.ok(mode.zeroRate >= 0 && mode.zeroRate <= 1, `${slug}.${name}.zeroRate`);
      }
      // `hit` is any win; `break-even` is a win that returns at least the
      // stake, so hitRate >= breakEvenRate always holds in the real math.
      // The memory tables print the break-even row to ONE decimal place while
      // the hit row carries two, so 12.78% vs a rounded 12.8% can invert by up
      // to half a decimal place. The tolerance is that display resolution -
      // anything beyond it means a row was read wrongly, and no captured
      // figure is ever adjusted to satisfy this.
      if (mode.hitRate !== undefined && mode.breakEvenRate !== undefined) {
        assert.ok(mode.hitRate >= mode.breakEvenRate - 0.005,
          `${slug}.${name}: hitRate ${mode.hitRate} is below breakEvenRate ${mode.breakEvenRate} by more than the source's rounding`);
      }
    }
  }
});

test("a game's stated edge agrees with its modes' rtp", () => {
  for (const [slug, game] of Object.entries(model)) {
    for (const [name, mode] of Object.entries(game.modes)) {
      assert.ok(Math.abs((1 - mode.rtp) - game.edge) < 5e-4, `${slug}.${name}: 1-rtp vs edge`);
    }
  }
});

test('the cost ladder is exactly the set of mode costs, ascending', () => {
  for (const [slug, game] of Object.entries(model)) {
    const costs = [...new Set(Object.values(game.modes).map((m) => m.cost))].sort((a, b) => a - b);
    assert.deepEqual(game.costLadder, costs, slug);
  }
});

test('captured mode names match the deployed mode names for every live game', () => {
  for (const [slug, modes] of Object.entries(live)) {
    if (!model[slug]) continue; // recorded gap, asserted below
    assert.deepEqual(Object.keys(model[slug].modes).sort(), [...modes].sort(),
      `${slug}: captured modes differ from deployed modes - the slug mapping or the capture is wrong`);
  }
});

test('a live game with no captured model is recorded as a known gap, not silently absent', () => {
  const gaps = Object.keys(live).filter((slug) => !model[slug]);
  assert.deepEqual(gaps, [],
    `live games without a captured model changed: ${gaps.join(', ')}`);
});

test('a recorded capture gap is still genuinely absent from math.json', () => {
  for (const [slug, gap] of Object.entries(CAPTURE_GAPS)) {
    for (const field of gap.game ?? []) {
      assert.equal(model[slug][field], undefined,
        `${slug}.${field} is now captured - delete it from CAPTURE_GAPS`);
    }
    for (const [mode, fields] of Object.entries(gap.modes ?? {})) {
      for (const field of fields) {
        assert.equal(model[slug].modes[mode][field], undefined,
          `${slug}.${mode}.${field} is now captured - delete it from CAPTURE_GAPS`);
      }
    }
  }
});
