/**
 * QR codes, drawn by hand - for the Donations page's wallet addresses.
 *
 * A QR library would be the project's second dependency, and the page's CSP
 * (script-src 'self') rules out a CDN, for one fixed use: short ASCII strings.
 * So this is the smallest encoder that covers it: byte mode, error correction
 * level M (15% of the code can be damaged or covered and it still scans),
 * versions 1-10 (up to 213 bytes). The layout follows ISO/IEC 18004; the
 * test suite pins each address's matrix, and each was checked once by
 * decoding a render with an independent reader (OpenCV's QRCodeDetector).
 */

import { raw, escape } from './html.mjs';

// Level M, per version: [EC codewords per block, [blocks, data codewords per block]...].
const LEVEL_M = [null,
  [10, [1, 16]], [16, [1, 28]], [26, [1, 44]], [18, [2, 32]], [24, [2, 43]],
  [16, [4, 27]], [18, [4, 31]], [22, [2, 38], [2, 39]], [22, [3, 36], [2, 37]], [26, [4, 43], [1, 44]]];
const ALIGNMENT = [null, [], [6, 18], [6, 22], [6, 26], [6, 30], [6, 34], [6, 22, 38], [6, 24, 42], [6, 26, 46], [6, 28, 50]];
const FORMAT_M = 0b00; // the level M indicator in the format bits

const dataCapacity = (v) => LEVEL_M[v].slice(1).reduce((n, [blocks, size]) => n + blocks * size, 0);
const bit = (x, i) => ((x >>> i) & 1) !== 0;

// ---------------------------------------------------------- Reed-Solomon
const EXP = new Uint8Array(512), LOG = new Uint8Array(256);
for (let i = 0, x = 1; i < 255; i++) {
  EXP[i] = x; LOG[x] = i;
  x <<= 1; if (x & 0x100) x ^= 0x11d;
}
for (let i = 255; i < 512; i++) EXP[i] = EXP[i - 255];
const mul = (a, b) => (a && b ? EXP[LOG[a] + LOG[b]] : 0);

function generator(degree) {
  let poly = [1];
  for (let i = 0; i < degree; i++) {
    const next = new Array(poly.length + 1).fill(0);
    poly.forEach((c, j) => { next[j] ^= c; next[j + 1] ^= mul(c, EXP[i]); });
    poly = next;
  }
  return poly;
}

function remainder(data, degree) {
  const gen = generator(degree);
  const out = new Array(degree).fill(0);
  for (const byte of data) {
    const factor = byte ^ out.shift();
    out.push(0);
    for (let i = 0; i < degree; i++) out[i] ^= mul(gen[i + 1], factor);
  }
  return out;
}

// ---------------------------------------------------------- codewords
function codewords(bytes, version) {
  const bits = [];
  const push = (value, length) => { for (let i = length - 1; i >= 0; i--) bits.push(bit(value, i) ? 1 : 0); };
  push(0b0100, 4);
  push(bytes.length, version < 10 ? 8 : 16);
  for (const b of bytes) push(b, 8);
  const capacity = dataCapacity(version) * 8;
  push(0, Math.min(4, capacity - bits.length));
  push(0, (8 - (bits.length % 8)) % 8);
  const data = [];
  for (let i = 0; i < bits.length; i += 8) data.push(bits.slice(i, i + 8).reduce((a, b) => (a << 1) | b, 0));
  for (let pad = 0xec; data.length < capacity / 8; pad ^= 0xec ^ 0x11) data.push(pad);

  const [ecPerBlock, ...groups] = LEVEL_M[version];
  const blocks = [];
  let at = 0;
  for (const [count, size] of groups) {
    for (let b = 0; b < count; b++) { const d = data.slice(at, at + size); at += size; blocks.push({ d, e: remainder(d, ecPerBlock) }); }
  }
  const out = [];
  const longest = Math.max(...blocks.map((b) => b.d.length));
  for (let i = 0; i < longest; i++) for (const b of blocks) if (i < b.d.length) out.push(b.d[i]);
  for (let i = 0; i < ecPerBlock; i++) for (const b of blocks) out.push(b.e[i]);
  return out;
}

// ---------------------------------------------------------- the matrix
function blank(version) {
  const size = version * 4 + 17;
  const dark = Array.from({ length: size }, () => new Array(size).fill(false));
  const fixed = Array.from({ length: size }, () => new Array(size).fill(false));
  const set = (x, y, on) => { dark[y][x] = on; fixed[y][x] = true; };

  for (let i = 0; i < size; i++) { set(6, i, i % 2 === 0); set(i, 6, i % 2 === 0); }
  for (const [cx, cy] of [[3, 3], [size - 4, 3], [3, size - 4]]) {
    for (let dy = -4; dy <= 4; dy++) for (let dx = -4; dx <= 4; dx++) {
      const x = cx + dx, y = cy + dy, ring = Math.max(Math.abs(dx), Math.abs(dy));
      if (x >= 0 && x < size && y >= 0 && y < size) set(x, y, ring !== 2 && ring !== 4);
    }
  }
  const centres = ALIGNMENT[version], last = centres.length - 1;
  centres.forEach((cy, i) => centres.forEach((cx, j) => {
    if ((i === 0 && j === 0) || (i === 0 && j === last) || (i === last && j === 0)) return;
    for (let dy = -2; dy <= 2; dy++) for (let dx = -2; dx <= 2; dx++) set(cx + dx, cy + dy, Math.max(Math.abs(dx), Math.abs(dy)) !== 1);
  }));
  drawFormat(set, size, 0); // reserves the format areas; redrawn with the real mask below
  if (version >= 7) {
    let rem = version;
    for (let i = 0; i < 12; i++) rem = (rem << 1) ^ ((rem >>> 11) * 0x1f25);
    const bits = (version << 12) | rem;
    for (let i = 0; i < 18; i++) {
      const a = size - 11 + (i % 3), b = Math.floor(i / 3);
      set(a, b, bit(bits, i)); set(b, a, bit(bits, i));
    }
  }
  return { size, dark, fixed, set };
}

function drawFormat(set, size, mask) {
  const data = (FORMAT_M << 3) | mask;
  let rem = data;
  for (let i = 0; i < 10; i++) rem = (rem << 1) ^ ((rem >>> 9) * 0x537);
  const bits = ((data << 10) | rem) ^ 0x5412;
  for (let i = 0; i <= 5; i++) set(8, i, bit(bits, i));
  set(8, 7, bit(bits, 6)); set(8, 8, bit(bits, 7)); set(7, 8, bit(bits, 8));
  for (let i = 9; i < 15; i++) set(14 - i, 8, bit(bits, i));
  for (let i = 0; i < 8; i++) set(size - 1 - i, 8, bit(bits, i));
  for (let i = 8; i < 15; i++) set(8, size - 15 + i, bit(bits, i));
  set(8, size - 8, true); // the dark module, always on
}

function placeData({ size, dark, fixed }, words) {
  let i = 0;
  for (let right = size - 1; right >= 1; right -= 2) {
    if (right === 6) right = 5;
    for (let vert = 0; vert < size; vert++) {
      for (let j = 0; j < 2; j++) {
        const x = right - j, upward = ((right + 1) & 2) === 0, y = upward ? size - 1 - vert : vert;
        if (!fixed[y][x] && i < words.length * 8) { dark[y][x] = bit(words[i >>> 3], 7 - (i & 7)); i++; }
      }
    }
  }
}

const MASKS = [
  (x, y) => (x + y) % 2 === 0, (x, y) => y % 2 === 0, (x) => x % 3 === 0, (x, y) => (x + y) % 3 === 0,
  (x, y) => (Math.floor(y / 2) + Math.floor(x / 3)) % 2 === 0, (x, y) => ((x * y) % 2) + ((x * y) % 3) === 0,
  (x, y) => (((x * y) % 2) + ((x * y) % 3)) % 2 === 0, (x, y) => (((x + y) % 2) + ((x * y) % 3)) % 2 === 0,
];

function applyMask({ size, dark, fixed }, mask) {
  for (let y = 0; y < size; y++) for (let x = 0; x < size; x++) if (!fixed[y][x] && MASKS[mask](x, y)) dark[y][x] = !dark[y][x];
}

// The standard's four penalties. Any mask yields a valid code; the lowest
// score is merely the easiest one to scan.
function penalty({ size, dark }) {
  let score = 0;
  const lines = [];
  for (let i = 0; i < size; i++) { lines.push(dark[i]); lines.push(dark.map((row) => row[i])); }
  const finderLike = [[1, 0, 1, 1, 1, 0, 1, 0, 0, 0, 0], [0, 0, 0, 0, 1, 0, 1, 1, 1, 0, 1]];
  for (const line of lines) {
    let run = 1;
    for (let i = 1; i <= size; i++) {
      if (i < size && line[i] === line[i - 1]) run++;
      else { if (run >= 5) score += 3 + (run - 5); run = 1; }
    }
    for (let i = 0; i + 11 <= size; i++) {
      for (const pattern of finderLike) if (pattern.every((p, k) => line[i + k] === (p === 1))) score += 40;
    }
  }
  for (let y = 0; y + 1 < size; y++) for (let x = 0; x + 1 < size; x++) {
    const c = dark[y][x];
    if (dark[y][x + 1] === c && dark[y + 1][x] === c && dark[y + 1][x + 1] === c) score += 3;
  }
  const darkCount = dark.flat().filter(Boolean).length, total = size * size;
  score += (Math.ceil(Math.abs(darkCount * 20 - total * 10) / total) - 1) * 10;
  return score;
}

/** The module matrix for `text`: rows of booleans, true = dark. */
export function qrMatrix(text) {
  const bytes = [...new TextEncoder().encode(String(text))];
  const version = LEVEL_M.findIndex((row, v) => v > 0 && 4 + (v < 10 ? 8 : 16) + bytes.length * 8 <= dataCapacity(v) * 8);
  if (version < 1) throw new Error(`qrMatrix: ${bytes.length} bytes is more than this encoder holds`);
  const words = codewords(bytes, version);
  let best = null;
  for (let mask = 0; mask < 8; mask++) {
    const qr = blank(version);
    placeData(qr, words);
    applyMask(qr, mask);
    drawFormat(qr.set, qr.size, mask);
    const score = penalty(qr);
    if (!best || score < best.score) best = { score, dark: qr.dark };
  }
  return best.dark;
}

/**
 * The code as an inline SVG: dark on white with the standard four-module
 * quiet zone, so it scans against the dashboard's dark theme. One path, a
 * horizontal run per segment, to keep it to a couple of kilobytes.
 */
export function qrSvg(text, { label = text } = {}) {
  const matrix = qrMatrix(text);
  const quiet = 4, n = matrix.length + quiet * 2;
  let d = '';
  matrix.forEach((row, y) => {
    for (let x = 0; x < row.length;) {
      if (!row[x]) { x++; continue; }
      let end = x;
      while (end < row.length && row[end]) end++;
      d += `M${x + quiet} ${y + quiet}h${end - x}v1h-${end - x}z`;
      x = end;
    }
  });
  return raw(`<svg class="qr" viewBox="0 0 ${n} ${n}" role="img" aria-label="QR code for ${escape(label)}" shape-rendering="crispEdges">`
    + `<rect width="${n}" height="${n}" fill="#fff"/><path d="${d}" fill="#000"/></svg>`);
}
