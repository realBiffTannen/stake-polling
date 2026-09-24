import { test } from 'node:test';
import assert from 'node:assert/strict';
import { runInNewContext } from 'node:vm';
import { INSIGHTS_JS } from '../src/web/insights-assets.mjs';

// Just enough DOM for the sortable, expandable tables: heading cells with
// attributes and closest(), body rows the script reorders by re-appending,
// details rows with a class list, expand buttons, and a document that hands
// the script its tables and its listeners.
const cell = (text, value) => ({ textContent: text, dataset: value === undefined ? {} : { value: String(value) } });
const classes = () => { const set = new Set(); return { add: (c) => set.add(c), remove: (c) => set.delete(c), contains: (c) => set.has(c),
  toggle(c, force) { const on = force === undefined ? !set.has(c) : force; if (on) set.add(c); else set.delete(c); return on; } }; };
const attrs = () => ({ attrs: {}, getAttribute(n) { return n in this.attrs ? this.attrs[n] : null; }, setAttribute(n, v) { this.attrs[n] = String(v); }, hasAttribute(n) { return n in this.attrs; } });

/** rows: arrays of cells (a cell is text or [text, value]); a row may end with { details: slug } to get a details row after it. */
function makeTable(id, heads, rows) {
  const table = { dataset: { sortable: id }, tBodies: [] };
  const thead = { children: [] };
  table.ths = heads.map(([label, kind]) => {
    const th = { textContent: label, dataset: kind ? { sort: kind } : {}, ...attrs(), parentElement: thead,
      closest(sel) { if (/th\[data-sort\]$/.test(sel)) return this.dataset.sort ? this : null; if (/^table/.test(sel)) return table; return null; } };
    thead.children.push(th);
    return th;
  });
  const tbody = { rows: [], appendChild(tr) { this.rows.splice(this.rows.indexOf(tr), 1); this.rows.push(tr); } };
  const sibling = (tr) => ({ get nextElementSibling() { return tbody.rows[tbody.rows.indexOf(tr) + 1] ?? null; } });
  for (const r of rows) {
    const spec = r.at(-1)?.details ? r.slice(0, -1) : r;
    const tr = { cells: spec.map((c) => (Array.isArray(c) ? cell(c[0], c[1]) : cell(c))), dataset: {}, classList: classes() };
    Object.defineProperty(tr, 'nextElementSibling', Object.getOwnPropertyDescriptor(sibling(tr), 'nextElementSibling'));
    tbody.rows.push(tr);
    if (r.at(-1)?.details) {
      const slug = r.at(-1).details;
      tr.button = { dataset: { expand: slug }, ...attrs(), closest(sel) { if (/th\[data-sort\]$/.test(sel)) return null; if (/data-expand/.test(sel)) return this; if (/^table/.test(sel)) return table; if (sel === 'tr') return tr; return null; } };
      tr.button.setAttribute('aria-expanded', 'false');
      const dr = { cells: [cell('details')], dataset: { detailsFor: slug }, classList: classes() };
      Object.defineProperty(dr, 'nextElementSibling', Object.getOwnPropertyDescriptor(sibling(dr), 'nextElementSibling'));
      tbody.rows.push(dr);
    }
  }
  table.tBodies.push(tbody);
  table.querySelectorAll = (sel) => {
    if (/data-expand/.test(sel)) return tbody.rows.filter((r) => r.button).map((r) => r.button);
    if (/th/.test(sel)) return table.ths.filter((th) => !/\[data-sort\]/.test(sel) || th.dataset.sort);
    return [];
  };
  table.order = () => tbody.rows.map((tr) => (tr.dataset.detailsFor ? `details:${tr.dataset.detailsFor}` : tr.cells[0].textContent));
  table.button = (slug) => tbody.rows.find((r) => r.button && r.button.dataset.expand === slug).button;
  table.detailsRow = (slug) => tbody.rows.find((r) => r.dataset.detailsFor === slug);
  return table;
}

function fakePage(tables) {
  const listeners = {};
  const storage = new Map();
  const document = {
    hidden: false, activeElement: {}, body: { classList: { toggle() {}, contains: () => false } },
    documentElement: { classList: { add() {} }, hasAttribute: () => false },
    querySelector: (s) => (s === 'main' ? { contains: () => false, innerHTML: '' } : null),
    querySelectorAll: (s) => (s === 'table[data-sortable]' ? tables() : []),
    getElementById: () => null,
    addEventListener(type, fn) { (listeners[type] ??= []).push(fn); },
    dispatchEvent(ev) { (listeners[ev.type] ?? []).forEach((fn) => fn(ev)); },
  };
  const sessionStorage = { getItem: (k) => (storage.has(k) ? storage.get(k) : null), setItem: (k, v) => storage.set(k, String(v)) };
  runInNewContext(INSIGHTS_JS, { document, URL, CustomEvent, location: { href: 'http://localhost/' }, AbortSignal, performance: { now: () => 0 },
    setTimeout: () => 0, setInterval() {}, fetch: async () => ({}), sessionStorage });
  return {
    click: (el) => (listeners.click ?? []).forEach((fn) => fn({ target: el, preventDefault() {} })),
    key: (el, key) => (listeners.keydown ?? []).forEach((fn) => fn({ target: el, key, preventDefault() {} })),
    refreshed: () => document.dispatchEvent(new CustomEvent('stake:refreshed')),
    storage,
  };
}

const HEADS = [['Game', 'text'], ['Bets', 'number'], ['Engine']];
const rows = () => [[['Candy'], ['123,171', 123171], ['↗']], [['Hog Stampede'], ['33,637', 33637], ['↗']], [['Ganja Ranch'], ['44,906', 44906], ['↗']]];
const withDetails = () => [[['Candy'], ['123,171', 123171], ['↗'], { details: 'candy' }], [['Hog Stampede'], ['33,637', 33637], ['↗'], { details: 'hog' }], [['Ganja Ranch'], ['44,906', 44906], ['↗'], { details: 'ganja' }]];

test('clicking a numeric heading sorts biggest first, and clicking it again reverses the order', () => {
  const table = makeTable('live-games', HEADS, rows());
  const page = fakePage(() => [table]);
  page.click(table.ths[1]);
  assert.deepEqual(table.order(), ['Candy', 'Ganja Ranch', 'Hog Stampede']);
  assert.equal(table.ths[1].getAttribute('aria-sort'), 'descending');
  page.click(table.ths[1]);
  assert.deepEqual(table.order(), ['Hog Stampede', 'Ganja Ranch', 'Candy']);
  assert.equal(table.ths[1].getAttribute('aria-sort'), 'ascending');
});

test('clicking a text heading sorts A to Z first, and the other headings drop their sort state', () => {
  const table = makeTable('live-games', HEADS, rows());
  const page = fakePage(() => [table]);
  page.click(table.ths[1]);
  page.click(table.ths[0]);
  assert.deepEqual(table.order(), ['Candy', 'Ganja Ranch', 'Hog Stampede']);
  assert.equal(table.ths[0].getAttribute('aria-sort'), 'ascending');
  assert.equal(table.ths[1].getAttribute('aria-sort'), 'none');
});

test('a figure nobody measured sorts last whichever way the column goes', () => {
  const table = makeTable('live-games', HEADS, [[['Pixel Nest'], ['-'], ['↗']], ...rows()]);
  const page = fakePage(() => [table]);
  page.click(table.ths[1]);
  assert.equal(table.order().at(-1), 'Pixel Nest');
  page.click(table.ths[1]);
  assert.equal(table.order().at(-1), 'Pixel Nest');
});

test('a heading without a sort kind, and the Total footer, are left alone', () => {
  const table = makeTable('live-games', HEADS, rows());
  const page = fakePage(() => [table]);
  page.click(table.ths[2]);
  assert.deepEqual(table.order(), ['Candy', 'Hog Stampede', 'Ganja Ranch'], 'server order kept');
  assert.equal(table.ths[2].getAttribute('aria-sort'), null);
});

test('the chosen sort survives the fragment refresh that replaces the table', () => {
  let table = makeTable('live-games', HEADS, rows());
  const page = fakePage(() => [table]);
  page.click(table.ths[1]);
  page.click(table.ths[1]);
  table = makeTable('live-games', HEADS, rows());
  page.refreshed();
  assert.deepEqual(table.order(), ['Hog Stampede', 'Ganja Ranch', 'Candy'], 'the fresh table is put back in the chosen order');
  assert.equal(table.ths[1].getAttribute('aria-sort'), 'ascending');
});

test('sortable headings are reachable from the keyboard and announce that they sort', () => {
  const table = makeTable('live-games', HEADS, rows());
  const page = fakePage(() => [table]);
  assert.equal(table.ths[1].getAttribute('aria-sort'), 'none');
  assert.equal(table.ths[1].getAttribute('role'), 'button');
  assert.equal(table.ths[1].tabIndex, 0);
  page.key(table.ths[1], 'Enter');
  assert.equal(table.ths[1].getAttribute('aria-sort'), 'descending');
});

test('the expand button opens its details row and says so; clicking again closes it', () => {
  const table = makeTable('catalogue', HEADS, withDetails());
  const page = fakePage(() => [table]);
  page.click(table.button('hog'));
  assert.equal(table.detailsRow('hog').classList.contains('open'), true);
  assert.equal(table.button('hog').getAttribute('aria-expanded'), 'true');
  assert.equal(table.detailsRow('candy').classList.contains('open'), false, 'only the clicked row opens');
  page.click(table.button('hog'));
  assert.equal(table.detailsRow('hog').classList.contains('open'), false);
  assert.equal(table.button('hog').getAttribute('aria-expanded'), 'false');
});

test('sorting keeps every details row directly under its game', () => {
  const table = makeTable('catalogue', HEADS, withDetails());
  const page = fakePage(() => [table]);
  page.click(table.ths[1]);
  assert.deepEqual(table.order(), ['Candy', 'details:candy', 'Ganja Ranch', 'details:ganja', 'Hog Stampede', 'details:hog']);
});

test('an opened details row is open again after the refresh replaces the table', () => {
  let table = makeTable('catalogue', HEADS, withDetails());
  const page = fakePage(() => [table]);
  page.click(table.button('ganja'));
  table = makeTable('catalogue', HEADS, withDetails());
  page.refreshed();
  assert.equal(table.detailsRow('ganja').classList.contains('open'), true);
  assert.equal(table.button('ganja').getAttribute('aria-expanded'), 'true');
  assert.equal(table.detailsRow('candy').classList.contains('open'), false);
});
