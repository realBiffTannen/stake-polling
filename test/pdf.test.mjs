import { test } from 'node:test';
import assert from 'node:assert/strict';
import { tablePdf, pdfString, textWidth } from '../src/web/pdf.mjs';

const columns = [{ label: 'Date', width: 2 }, { label: 'Bets', align: 'right', width: 1 }];
const rows = (n) => Array.from({ length: n }, (_, i) => [`2026-09-${String((i % 28) + 1).padStart(2, '0')}`, String(i * 1000)]);

/** Every structural promise a PDF reader relies on. */
function assertWellFormed(pdf) {
  assert.ok(pdf.startsWith('%PDF-1.4\n'));
  assert.ok(pdf.endsWith('%%EOF\n'));
  assert.ok(/^[\x0a\x20-\x7e]*$/.test(pdf), 'plain 7-bit text, so string offsets are byte offsets');
  const startxref = Number(pdf.match(/startxref\n(\d+)\n%%EOF\n$/)[1]);
  assert.ok(pdf.startsWith('xref\n', startxref), 'startxref points at the xref table');
  const [, count] = pdf.slice(startxref).match(/^xref\n0 (\d+)\n/);
  const entries = [...pdf.slice(startxref).matchAll(/^(\d{10}) 00000 n $/gm)].map((m) => Number(m[1]));
  assert.equal(entries.length, Number(count) - 1);
  entries.forEach((offset, i) => assert.ok(pdf.startsWith(`${i + 1} 0 obj\n`, offset), `object ${i + 1} sits at its xref offset`));
  for (const m of pdf.matchAll(/<< \/Length (\d+) >>\nstream\n/g)) {
    const start = m.index + m[0].length;
    assert.equal(pdf.slice(start + Number(m[1]), start + Number(m[1]) + 10), '\nendstream', 'each stream is exactly its stated length');
  }
}

test('a table becomes a well-formed PDF, with the header repeated on every page', () => {
  const pdf = tablePdf({ title: 'Daily breakdown', subtitle: 'All games', columns, rows: rows(100), note: 'A note.' });
  assertWellFormed(pdf);
  const pages = Number(pdf.match(/\/Type \/Pages \/Kids \[[^\]]+\] \/Count (\d+)/)[1]);
  assert.ok(pages >= 3, `${pages} pages for 100 rows`);
  assert.equal((pdf.match(/\(Bets\) Tj/g) ?? []).length, pages, 'the header row on every page');
  assert.match(pdf, new RegExp(`\\(Page ${pages} of ${pages}\\) Tj`));
  assert.match(pdf, /\(99000\) Tj/, 'the last row is there');
});

test('no rows still makes a page that says so', () => {
  const pdf = tablePdf({ title: 'Daily breakdown', columns, rows: [] });
  assertWellFormed(pdf);
  assert.match(pdf, /\(No rows in this selection\.\) Tj/);
});

test('text is escaped for PDF: brackets and backslashes, Latin-1 as octal, anything else as "?"', () => {
  assert.equal(pdfString('a(b)c\\d'), '(a\\(b\\)c\\\\d)');
  assert.equal(pdfString('Café · 5'), '(Caf\\351 \\267 5)');
  assert.equal(pdfString('日本 🎰'), '(?? ?)');
  const pdf = tablePdf({ title: 'Evil ) Tj (game', columns, rows: [['(x)', '1']] });
  assertWellFormed(pdf);
  assert.match(pdf, /\(Evil \\\) Tj \\\(game\) Tj/, 'a title cannot break out of its string');
});

test('numbers right-align from real Helvetica widths, and an overlong cell is cut with an ellipsis', () => {
  assert.equal(textWidth('0000', 10), 22.24, 'digits are 556/1000 em');
  const pdf = tablePdf({ title: 't', columns: [{ label: 'A', width: 1 }, { label: 'B', width: 1 }], rows: [['x'.repeat(400), '1']] });
  assert.match(pdf, /x+\.\.\.\) Tj/);
});
