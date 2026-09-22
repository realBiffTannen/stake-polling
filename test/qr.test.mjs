import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { qrMatrix, qrSvg } from '../src/web/qr.mjs';

const digest = (m) => createHash('sha256').update(m.map((r) => r.map(Number).join('')).join('\n')).digest('hex').slice(0, 16);

// Each of these matrices was rendered and read back by an independent decoder
// (OpenCV's QRCodeDetector / QRCodeDetectorAruco) when the encoder was
// written, along with random strings covering versions 1-10. Pinning them
// means a change to the encoder cannot silently change what a wallet scans.
test('the donation addresses encode to the matrices that were verified by a real decoder', () => {
  assert.equal(digest(qrMatrix('0x485496ACF522083a433556C2652fcD2FBa3211Bb')), '68ec9bf02899e416');
  assert.equal(digest(qrMatrix('FFwvJa8Tt8etgFAb3gG8iVMQTd2uyKq1UBqtaSZ9jfsz')), 'ef2dea3909e20b39');
  assert.equal(digest(qrMatrix('bc1q97n73mmc9g7s2v7ydstg2h564gvr6593v5n5e0')), '6fa6e2318b3349e3');
});

test('the smallest version that fits is chosen', () => {
  assert.equal(qrMatrix('x').length, 21, 'version 1');
  assert.equal(qrMatrix('a'.repeat(42)).length, 29, 'version 3 holds 42 bytes at level M');
  assert.equal(qrMatrix('a'.repeat(44)).length, 33, '44 bytes needs version 4');
  assert.equal(qrMatrix('a'.repeat(213)).length, 57, 'version 10 is the ceiling');
  assert.throws(() => qrMatrix('a'.repeat(214)), /more than this encoder holds/);
});

test('the three finder patterns sit in their corners', () => {
  const m = qrMatrix('0x485496ACF522083a433556C2652fcD2FBa3211Bb'), n = m.length;
  const finder = (x0, y0) => {
    for (let y = 0; y < 7; y++) for (let x = 0; x < 7; x++) {
      const ring = Math.max(Math.abs(x - 3), Math.abs(y - 3));
      assert.equal(m[y0 + y][x0 + x], ring !== 2, `finder module ${x0 + x},${y0 + y}`);
    }
  };
  finder(0, 0); finder(n - 7, 0); finder(0, n - 7);
});

test('the SVG is dark on white with a quiet zone, and escapes its label', () => {
  const svg = String(qrSvg('abc', { label: '<b>x</b>' }));
  assert.match(svg, /^<svg class="qr" viewBox="0 0 29 29"/, '21 modules plus four either side');
  assert.match(svg, /<rect width="29" height="29" fill="#fff"\/>/);
  assert.match(svg, /fill="#000"/);
  assert.doesNotMatch(svg, /<b>|NaN|undefined/);
});
