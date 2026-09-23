import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { DISCLAIMER } from '../src/web/disclaimer.mjs';
import { shell } from '../src/web/views/shell.mjs';
import { renderLogin } from '../src/web/views/login.mjs';

const escaped = DISCLAIMER.replaceAll('"', '&quot;').replaceAll("'", '&#39;');
const read = (path) => readFileSync(new URL(`../${path}`, import.meta.url), 'utf8');

test('every dashboard page carries the disclaimer in its footer, and so does the sign-in page', () => {
  const page = String(shell({ state: { meta: {}, rows: [] }, body: 'x', active: 'analysis' }));
  const footer = page.slice(page.indexOf('<footer>'), page.indexOf('</footer>'));
  assert.ok(footer.includes(escaped), 'in the footer');
  assert.match(footer, /not affiliated with, endorsed by or supported by Engine/);
  assert.match(footer, /without warranty of any kind/);
  assert.match(footer, /accept no liability/);
  assert.ok(String(renderLogin({ csrf: 'x'.repeat(20) })).includes(escaped));
});

test('the README and the docs site say it word for word', () => {
  assert.ok(read('README.md').includes(DISCLAIMER), 'README');
  assert.ok(read('docs/_includes/footer_custom.html').includes(DISCLAIMER), 'docs footer');
});

test('it names the platform Engine, never "Stake Engine"', () => {
  assert.doesNotMatch(DISCLAIMER, /Stake Engine/);
});
