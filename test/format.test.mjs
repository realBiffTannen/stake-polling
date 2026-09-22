import { test } from 'node:test';
import assert from 'node:assert/strict';
import { percent, intSigned, intOrDash, humanAge, num, fixed, money, moneySigned, C } from '../src/tui/format.mjs';
import { visible, clip, fit, row } from '../src/tui/layout.mjs';

const ESC = String.fromCharCode(27);

test('percent scales a fraction but leaves a percentage alone', () => {
  // The API sends RTP as 0.9669...; anything above 1.5 is already a percentage.
  assert.equal(percent(0.9669999910816335), '96.70');
  assert.equal(percent(96.7), '96.70');
  assert.equal(percent(1.108850279261279), '110.89');
  assert.equal(percent(undefined), '-');
});

test('percent treats a missing rtp as absent, never as a measured 0%', () => {
  // `Number(null)` is 0 and finite, so a bare coercion would print "0.00" -
  // "this bonus returns 0% RTP" - for a mode that was simply never measured.
  assert.equal(percent(null), '-');
  assert.equal(percent(''), '-');
  assert.equal(percent(undefined), '-');
  // A genuine measured zero must still come through as a zero, not vanish
  // into the same dash - the opposite bug is just as wrong.
  assert.equal(percent(0), '0.00');
});

test('a missing count is a dash, a counted zero is a zero', () => {
  assert.equal(intOrDash(null), '-');
  assert.equal(intOrDash(0), '0');
  assert.equal(intSigned(null), '-');
  assert.equal(intSigned(0), '0');
  assert.equal(intSigned(1500), '+1,500');
});

test('intOrDash and intSigned also treat an empty string as absent, not as zero', () => {
  // `Number('')` is 0 and finite, same trap as null, and neither function's
  // own guard checked for it explicitly before this fix.
  assert.equal(intOrDash(''), '-');
  assert.equal(intSigned(''), '-');
});

test('fixed treats a missing avgBet as absent, never as a measured $0.00', () => {
  // Before the fix, `fixed(null, 2)` was "0.00" - the exact shape `percent`
  // had before its own fix, sitting right below it in the same file. This
  // rendered a specific, wrong average bet (e.g. "$0.00") for a mode whose
  // avgBet was never read, right next to a `cost` column that already prints
  // '-' for the same absent row.
  assert.equal(fixed(null, 2), '-');
  assert.equal(fixed(undefined, 2), '-');
  assert.equal(fixed('', 2), '-');
  // A genuine measured zero must still render as a zero.
  assert.equal(fixed(0, 2), '0.00');
  assert.equal(fixed(0.25, 2), '0.25');
});

test('money and moneySigned paint an absent reading dim, never green', () => {
  // `Number(null) < 0` is false, so a bare sign check would colour a null
  // figure's dash GREEN - this dashboard's colour for "the studio is up",
  // a small false reassurance in the same family as the numeric bugs. Plain
  // string comparisons here, not regex: the ANSI codes contain a literal
  // `[`, which would be read as an (unterminated) character class.
  assert.equal(money(null), `${C.dim}-${C.reset}`);
  assert.equal(moneySigned(null), `${C.dim}-${C.reset}`);
  assert.equal(money(undefined), `${C.dim}-${C.reset}`);
  // Genuine readings keep their sign-based colour, never dim.
  assert.ok(money(-42).startsWith(C.red));
  assert.ok(money(42).startsWith(C.green));
  assert.ok(money(0).startsWith(C.green), 'a genuine zero is not a loss');
  assert.ok(moneySigned(-42).startsWith(C.red));
  assert.ok(moneySigned(42).startsWith(C.green));
});

test('num coerces junk to zero without throwing', () => {
  assert.equal(num('12'), 12);
  assert.equal(num(null), 0);
  assert.equal(num('abc'), 0);
});

test('humanAge switches units rather than printing 5400s', () => {
  assert.equal(humanAge(30_000), '30s');
  assert.equal(humanAge(300_000), '5m');
  assert.equal(humanAge(7_200_000), '2h');
});

test('visible length ignores colour codes', () => {
  assert.equal(visible(`${ESC}[31mred${ESC}[0m`), 3);
});

test('clip never slices an escape sequence in half', () => {
  const clipped = clip(`${ESC}[31mabcdef${ESC}[0m`, 3);
  assert.equal(visible(clipped), 3);
  assert.ok(clipped.endsWith(`${ESC}[0m`), 'must close the colour it opened');
});

test('fit drops the lowest-priority columns until the row fits', () => {
  const columns = [
    { key: 'a', width: 10, priority: 1 },
    { key: 'b', width: 10, priority: 3 },
    { key: 'c', width: 10, priority: 2 },
  ];
  assert.deepEqual(fit(columns, 21).map((c) => c.key), ['a', 'c']);
  // Display order is preserved, not priority order.
  assert.deepEqual(fit(columns, 32).map((c) => c.key), ['a', 'b', 'c']);
});

test('row pads left-aligned and right-aligned cells to exactly their width', () => {
  const columns = [
    { key: 'a', width: 5, align: 'left', value: () => 'ab' },
    { key: 'b', width: 6, align: 'right', value: () => '12' },
  ];
  assert.equal(row(columns, (c) => c.value()), 'ab    ' + '    12');
});

test('row pads a coloured cell by what the terminal shows, not by its escape codes', () => {
  const red = `${ESC}[31m-$5.00${ESC}[0m`;
  const columns = [
    { key: 'a', width: 5, align: 'left', value: () => 'ab' },
    { key: 'b', width: 8, align: 'right', value: () => red },
  ];
  const line = row(columns, (c) => c.value());
  assert.equal(visible(line), 5 + 1 + 8);
  assert.equal(line, `ab    ${'  '}${red}`, 'the padding sits outside the colour, and the colour survives whole');
});

test('row clips a coloured cell that is too wide without cutting an escape in half', () => {
  const red = `${ESC}[31m-$1,234,567.89${ESC}[0m`;
  const line = row([{ key: 'a', width: 6, align: 'right', value: () => red }], (c) => c.value());
  assert.equal(visible(line), 6);
  assert.ok(line.endsWith(`${ESC}[0m`), 'must close the colour it opened');
});

test('row leaves a plain cell that is too wide exactly as it always clipped it', () => {
  const line = row([{ key: 'a', width: 4, align: 'left', value: () => 'pixel-carnivals' }], (c) => c.value());
  assert.equal(line, 'pixe');
});
