import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { DONATIONS } from '../src/donations.mjs';
import { renderDonate } from '../src/web/views/donate.mjs';
import { shell } from '../src/web/views/shell.mjs';
import { createWebServer } from '../src/web/server.mjs';
import { buildInsights } from '../src/insights/model.mjs';

// Pinned by hand: a one-character slip in an address sends someone's
// donation to nobody, so a change here has to be made on purpose, twice.
const EXPECTED = [
  ['ETH', '0x485496ACF522083a433556C2652fcD2FBa3211Bb'],
  ['USDT', '0x485496ACF522083a433556C2652fcD2FBa3211Bb'],
  ['SOL', 'FFwvJa8Tt8etgFAb3gG8iVMQTd2uyKq1UBqtaSZ9jfsz'],
  ['BTC', 'bc1q97n73mmc9g7s2v7ydstg2h564gvr6593v5n5e0'],
];
const state = { meta: { team: 'acme-studios' }, stale: false, ageMs: 0, now: Date.parse('2026-09-22T12:00:00Z') };

test('the donation addresses are exactly the published ones', () => {
  assert.deepEqual(DONATIONS.map((d) => [d.asset, d.address]), EXPECTED);
});

test('the Donations page lists every address with a copy control', () => {
  const out = String(renderDonate({ state }));
  assert.match(out, /<h1>Donations<span>\.<\/span><\/h1>/);
  for (const [asset, address] of EXPECTED) {
    assert.match(out, new RegExp(`${asset}[\\s\\S]*?<code class="donate-address">${address}</code>`), asset);
    assert.match(out, new RegExp(`data-copy="${address}"`), `${asset} copy button`);
    assert.match(out, new RegExp(`<summary>QR</summary><div class="donate-qr-pop"><svg class="qr"[^>]*aria-label="QR code for ${asset} donation address"`), `${asset} QR`);
  }
  assert.match(out, /data-static/, 'an open QR is not closed by the auto-refresh');
});

test('the sidebar links the Donations page from every screen', () => {
  const out = String(shell({ state, body: 'x', active: 'insights', title: 'Player insights' }));
  assert.match(out, /<a class="" href="\/donate"><span>[^<]+<\/span> Donations<\/a>/);
  assert.match(String(shell({ state, body: 'x', active: 'donate', title: 'Donations' })), /<a class="active" href="\/donate">/);
});

test('the README opens with the same donation addresses the dashboard shows', () => {
  const readme = readFileSync(new URL('../README.md', import.meta.url), 'utf8');
  const top = readme.split('\n## ')[0];
  for (const [asset, address] of EXPECTED) assert.ok(top.includes(address), `${asset} address is in the README's opening section`);
});

test('the server serves /donate', async (t) => {
  const now = Date.parse('2026-09-22T12:00:00Z');
  const server = createWebServer({ read: async (query) => ({ model: buildInsights({ snapshot: {}, now, query }), state: { ...state, rows: [] } }) });
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
  t.after(() => new Promise((resolve) => { server.close(resolve); server.closeAllConnections(); }));
  const res = await fetch(`http://127.0.0.1:${server.address().port}/donate`);
  assert.equal(res.status, 200);
  const body = await res.text();
  for (const [, address] of EXPECTED) assert.ok(body.includes(address));
  assert.match(body, /<title>Donations · acme-studios<\/title>/);
});
