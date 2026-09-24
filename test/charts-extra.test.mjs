import { test } from 'node:test';
import assert from 'node:assert/strict';
import { hbars, pairedBars, bandChart } from '../src/web/charts/hbars.mjs';
import { columns } from '../src/web/charts/columns.mjs';
import { donut, GAME_COLOURS, OTHER_COLOUR } from '../src/web/charts/donut.mjs';

const s = (v) => String(v);
const noNaN = (out) => assert.doesNotMatch(out, /NaN|Infinity|undefined/);

test('hbars draws one bar per measured row, coloured by sign, and a dash for an unmeasured one', () => {
  const out = s(hbars({ rows: [{ key: 'a', label: 'A', value: 10 }, { key: 'b', label: 'B', value: -5 }, { key: 'c', label: 'C', value: null }], tone: 'sign', format: String, title: 'P/L' }));
  noNaN(out);
  assert.equal((out.match(/class="bar-pos"/g) ?? []).length, 1);
  assert.equal((out.match(/class="bar-neg"/g) ?? []).length, 1);
  assert.match(out, />C</);
  assert.match(out, />-</, 'the unmeasured row says so');
  assert.equal((out.match(/class="hit"/g) ?? []).length, 3, 'every row is hoverable');
});

test('hbars treats a measured zero as a value, not as missing', () => {
  const out = s(hbars({ rows: [{ key: 'a', label: 'A', value: 0 }], tone: 'sign', format: (v) => `$${v}`, title: 't' }));
  noNaN(out);
  assert.match(out, />\$0</);
});

test('hbars neutral tone never implies good or bad', () => {
  const out = s(hbars({ rows: [{ key: 'a', label: 'A', value: 3 }], tone: 'neutral', format: String, title: 't' }));
  assert.match(out, /class="bar-neutral"/);
  assert.doesNotMatch(out, /bar-pos|bar-neg/);
});

test('hbars with no rows or all-null rows renders without NaN', () => {
  noNaN(s(hbars({ rows: [], format: String, title: 't' })));
  noNaN(s(hbars({ rows: [{ key: 'a', label: 'A', value: null }], format: String, title: 't' })));
});

test('hbars escapes an untrusted label', () => {
  const out = s(hbars({ rows: [{ key: 'x', label: '<script>x</script>', value: 1 }], format: String, title: 't' }));
  assert.doesNotMatch(out, /<script>x/);
});

test('pairedBars draws both series per row with a legend naming them', () => {
  const out = s(pairedBars({ rows: [{ label: 'BASE', a: 70, b: 20 }, { label: 'BUY', a: 30, b: null }], names: ['bets', 'turnover'], format: String, title: 't' }));
  noNaN(out);
  assert.match(out, />bets</);
  assert.match(out, />turnover</);
  assert.equal((out.match(/<rect class="pair-a"/g) ?? []).length, 2);
  assert.equal((out.match(/<rect class="pair-b"/g) ?? []).length, 1, 'no bar for the unmeasured value');
});

test('bandChart draws a band, the reference edge and the observed dot, marking a row outside its band', () => {
  const out = s(bandChart({ rows: [
    { label: 'In', value: 0.05, lo: 0, hi: 0.1, ref: 0.033, outside: false },
    { label: 'Out', value: -0.5, lo: -0.1, hi: 0.15, ref: 0.033, outside: true },
    { label: 'NoModel', value: 0.2, lo: null, hi: null, ref: null, outside: null },
  ], format: (v) => `${(v * 100).toFixed(1)}%`, title: 't' }));
  noNaN(out);
  assert.equal((out.match(/class="band"/g) ?? []).length, 2);
  assert.match(out, /class="dot-out"/);
  assert.match(out, /class="dot-in"/);
  assert.match(out, /not judged/);
});

test('columns draw signed values either side of a zero line, and skip nulls', () => {
  const out = s(columns({ rows: [{ label: '09', value: 5 }, { label: '10', value: null }, { label: '11', value: -3 }], tone: 'sign', format: String, title: 't' }));
  noNaN(out);
  assert.match(out, /class="zero"/);
  assert.equal((out.match(/class="bar-(pos|neg)"/g) ?? []).length, 2);
});

test('donut draws a slice per positive value in the given order, with a legend and hover tips', () => {
  const out = s(donut({ slices: [{ key: 'a', label: 'Alpha', value: 3, colour: GAME_COLOURS[0] }, { key: 'b', label: 'Beta', value: 1, colour: GAME_COLOURS[1] },
    { key: 'z', label: 'Zero', value: 0, colour: OTHER_COLOUR }], title: 'Bets', format: String, centre: '4' }));
  noNaN(out);
  assert.equal((out.match(/<path class="slice"/g) ?? []).length, 2, 'a zero slice has no arc');
  assert.ok(out.indexOf('Alpha') < out.indexOf('Beta'));
  assert.match(out, /75\.0%/);
  assert.match(out, /data-tip/);
  assert.match(out, />4</);
});

test('donut of a single slice is a full ring, and an empty donut says nothing was measured', () => {
  const one = s(donut({ slices: [{ key: 'a', label: 'A', value: 5, colour: GAME_COLOURS[0] }], title: 't', format: String }));
  noNaN(one);
  assert.match(one, /100\.0%/);
  assert.match(s(donut({ slices: [], title: 't', format: String })), /Nothing measured/);
});

test('the game palette holds seven validated colours and a separate grey for Other', () => {
  assert.equal(GAME_COLOURS.length, 7);
  assert.ok(!GAME_COLOURS.includes(OTHER_COLOUR));
});

// ------------------------------------------------------------ time line
import { timeLine } from '../src/web/charts/time.mjs';

test('timeLine draws 576 slots as one line with a bounded number of hover bands', () => {
  const t0 = Date.parse('2026-09-21T12:00:00Z');
  const points = Array.from({ length: 576 }, (_, i) => ({ ts: t0 + i * 150_000, value: i % 50 === 7 ? null : 5 + (i % 9) }));
  const out = s(timeLine({ points, title: 'Players online', format: String }));
  noNaN(out);
  assert.ok((out.match(/class="hit"/g) ?? []).length <= 96, 'hover bands are capped');
  assert.ok((out.match(/<path class="series"/g) ?? []).length > 1, 'a missed slot breaks the line');
  assert.match(out, /12:00Z|18:00Z/, 'time labels on the axis');
});

test('timeLine with nothing measured says so', () => {
  assert.match(s(timeLine({ points: [{ ts: 0, value: null }], title: 't', format: String })), /Nothing measured/);
});

test('a sub-hour time line labels its axis every ten minutes, three hours every half hour, six hours every hour', () => {
  const t0 = Date.parse('2026-09-21T12:00:00Z');
  const line = (minutes) => s(timeLine({ points: Array.from({ length: minutes / 2.5 + 1 }, (_, i) => ({ ts: t0 + i * 150_000, value: 5 + (i % 4) })), title: 'p', format: String }));
  const labels = (out) => [...out.matchAll(/text-anchor="middle">([0-9:]+Z)</g)].map((m) => m[1]);
  assert.deepEqual(labels(line(30)), ['12:00Z', '12:10Z', '12:20Z', '12:30Z']);
  assert.deepEqual(labels(line(60)), ['12:00Z', '12:10Z', '12:20Z', '12:30Z', '12:40Z', '12:50Z', '13:00Z']);
  assert.deepEqual(labels(line(180)), ['12:00Z', '12:30Z', '13:00Z', '13:30Z', '14:00Z', '14:30Z', '15:00Z']);
  assert.deepEqual(labels(line(360)), ['12:00Z', '13:00Z', '14:00Z', '15:00Z', '16:00Z', '17:00Z', '18:00Z']);
});
