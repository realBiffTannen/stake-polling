/**
 * A table as a PDF, with no dependency: landscape US Letter, the standard
 * Helvetica fonts (every PDF reader has them, so nothing is embedded), a
 * title block, and the header row repeated on every page with "Page n of m"
 * at the foot.
 *
 * The file is plain 7-bit text - uncompressed content streams, byte offsets
 * equal to string offsets - so it is served as a string and read by any
 * viewer. Text outside ASCII is written as a WinAnsi octal escape where it
 * has one (é, £, ...), else as "?".
 */

// Helvetica and Helvetica-Bold advance widths, in 1/1000 em, for ASCII 32..126
// (from the Adobe core-font metrics). Needed only to right-align numbers.
const HELVETICA = [278, 278, 355, 556, 556, 889, 667, 191, 333, 333, 389, 584, 278, 333, 278, 278, 556, 556, 556, 556, 556, 556, 556, 556, 556, 556, 278, 278, 584, 584, 584, 556, 1015, 667, 667, 722, 722, 667, 611, 778, 722, 278, 500, 667, 556, 833, 722, 778, 667, 778, 722, 667, 611, 722, 667, 944, 667, 667, 611, 278, 278, 278, 469, 556, 333, 556, 556, 500, 556, 556, 278, 556, 556, 222, 222, 500, 222, 833, 556, 556, 556, 556, 333, 500, 278, 556, 500, 722, 500, 500, 500, 334, 260, 334, 584];
const HELVETICA_BOLD = [278, 333, 474, 556, 556, 889, 722, 238, 333, 333, 389, 584, 278, 333, 278, 278, 556, 556, 556, 556, 556, 556, 556, 556, 556, 556, 333, 333, 584, 584, 584, 611, 975, 722, 722, 722, 722, 667, 611, 778, 722, 278, 556, 722, 611, 833, 722, 778, 667, 778, 722, 667, 611, 722, 667, 944, 667, 667, 611, 333, 278, 333, 584, 556, 333, 556, 611, 556, 611, 556, 333, 611, 611, 278, 278, 556, 278, 889, 611, 611, 611, 611, 389, 556, 333, 611, 556, 778, 556, 556, 500, 389, 280, 389, 584];

const PAGE = { w: 792, h: 612, margin: 40 };
const ROW_H = 16;

/** Width of `text` in points at `size`, in Helvetica (bold or not). */
export function textWidth(text, size, bold = false) {
  const table = bold ? HELVETICA_BOLD : HELVETICA;
  let units = 0;
  for (const ch of String(text)) {
    const c = ch.codePointAt(0);
    units += c >= 32 && c <= 126 ? table[c - 32] : 556;
  }
  return (units * size) / 1000;
}

/** A PDF string literal: (), \ escaped; Latin-1 as octal escapes; anything else "?". */
export function pdfString(text) {
  let out = '';
  for (const ch of String(text)) {
    const c = ch.codePointAt(0);
    if (ch === '(' || ch === ')' || ch === '\\') out += `\\${ch}`;
    else if (c >= 32 && c <= 126) out += ch;
    else if (c >= 160 && c <= 255) out += `\\${c.toString(8).padStart(3, '0')}`;
    else out += '?';
  }
  return `(${out})`;
}

/** `text` cut to fit `width` points, ending in "..." when cut. */
function fit(text, width, size, bold) {
  let s = String(text);
  if (textWidth(s, size, bold) <= width) return s;
  while (s.length > 1 && textWidth(`${s}...`, size, bold) > width) s = s.slice(0, -1);
  return `${s}...`;
}

/**
 * @param {{ title: string, subtitle?: string, columns: { label: string, align?: 'left'|'right', width: number }[],
 *   rows: string[][], note?: string }} spec
 *   Column widths are relative weights, scaled to the page.
 * @returns {string} the PDF file
 */
export function tablePdf({ title, subtitle = '', columns, rows, note = '' }) {
  const inner = PAGE.w - 2 * PAGE.margin;
  const total = columns.reduce((a, c) => a + c.width, 0);
  const widths = columns.map((c) => (c.width / total) * inner);
  const top = PAGE.h - PAGE.margin;
  const firstRowY = top - 64;
  const perPage = Math.max(1, Math.floor((firstRowY - PAGE.margin - 24) / ROW_H));
  const pages = [];
  for (let i = 0; i < Math.max(1, rows.length); i += perPage) pages.push(rows.slice(i, i + perPage));

  const text = (x, y, s, size, bold = false) => `BT /${bold ? 'F2' : 'F1'} ${size} Tf ${x.toFixed(2)} ${y.toFixed(2)} Td ${pdfString(s)} Tj ET`;
  const cells = (y, values, size, bold) => {
    let x = PAGE.margin;
    return values.map((v, i) => {
      const w = widths[i], pad = 6;
      const s = fit(v ?? '', w - 2 * pad, size, bold);
      const at = columns[i].align === 'right' ? x + w - pad - textWidth(s, size, bold) : x + pad;
      x += w;
      return text(at, y, s, size, bold);
    }).join('\n');
  };

  const streams = pages.map((pageRows, p) => {
    const ops = ['0.11 0.13 0.17 rg', text(PAGE.margin, top - 14, title, 16, true)];
    if (subtitle) ops.push('0.35 0.39 0.45 rg', text(PAGE.margin, top - 32, subtitle, 9));
    // Header band, then zebra rows.
    ops.push('0.92 0.94 0.96 rg', `${PAGE.margin} ${firstRowY - 5} ${inner} ${ROW_H} re f`,
      '0.20 0.24 0.30 rg', cells(firstRowY, columns.map((c) => c.label), 8.5, true));
    pageRows.forEach((row, r) => {
      const y = firstRowY - (r + 1) * ROW_H;
      if (r % 2 === 1) ops.push('0.97 0.975 0.98 rg', `${PAGE.margin} ${y - 5} ${inner} ${ROW_H} re f`);
      ops.push('0.11 0.13 0.17 rg', cells(y, row, 9, false));
    });
    if (!rows.length) ops.push('0.35 0.39 0.45 rg', text(PAGE.margin + 6, firstRowY - ROW_H, 'No rows in this selection.', 9));
    ops.push('0.35 0.39 0.45 rg', text(PAGE.margin, PAGE.margin - 18, note, 7.5));
    const foot = `Page ${p + 1} of ${pages.length}`;
    ops.push(text(PAGE.w - PAGE.margin - textWidth(foot, 7.5), PAGE.margin - 18, foot, 7.5));
    return ops.join('\n');
  });

  // Objects: 1 catalog, 2 page tree, 3-4 fonts, then a page and its content per page.
  const objects = [];
  const pageIds = pages.map((_, i) => 5 + i * 2);
  objects[1] = '<< /Type /Catalog /Pages 2 0 R >>';
  objects[2] = `<< /Type /Pages /Kids [${pageIds.map((id) => `${id} 0 R`).join(' ')}] /Count ${pages.length} >>`;
  objects[3] = '<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica /Encoding /WinAnsiEncoding >>';
  objects[4] = '<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica-Bold /Encoding /WinAnsiEncoding >>';
  streams.forEach((content, i) => {
    objects[pageIds[i]] = `<< /Type /Page /Parent 2 0 R /MediaBox [0 0 ${PAGE.w} ${PAGE.h}] /Resources << /Font << /F1 3 0 R /F2 4 0 R >> >> /Contents ${pageIds[i] + 1} 0 R >>`;
    objects[pageIds[i] + 1] = `<< /Length ${content.length} >>\nstream\n${content}\nendstream`;
  });

  let out = '%PDF-1.4\n';
  const offsets = [];
  for (let id = 1; id < objects.length; id++) {
    offsets[id] = out.length;
    out += `${id} 0 obj\n${objects[id]}\nendobj\n`;
  }
  const xref = out.length;
  out += `xref\n0 ${objects.length}\n0000000000 65535 f \n`;
  for (let id = 1; id < objects.length; id++) out += `${String(offsets[id]).padStart(10, '0')} 00000 n \n`;
  out += `trailer\n<< /Size ${objects.length} /Root 1 0 R >>\nstartxref\n${xref}\n%%EOF\n`;
  return out;
}
