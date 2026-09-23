import { test } from 'node:test';
import assert from 'node:assert/strict';
import { shell, documentFor } from '../src/web/views/shell.mjs';
import { LOGO_SVG } from '../src/web/brand/logo.mjs';

const state = { meta: { team: 'acme-studios' }, stale: false, ageMs: 1000, now: Date.parse('2026-09-19T12:00:00Z') };

test('the shell carries the Crash Galaxy wordmark, as a cached image rather than 23 KB inlined into every page', () => {
  const out = String(shell({ state, body: 'x', active: 'insights', title: 'Player insights' }));
  assert.match(out, /<img class="cg-logo" src="\/brand\/logo\.svg\?v=[0-9a-f]{16}" alt="Crash Galaxy"/);
  const wordmark = LOGO_SVG.match(/<path d="([^"]{40})/)?.[1];
  assert.ok(wordmark && !out.includes(wordmark), 'the wordmark paths are no longer inlined');
  assert.ok(out.length < 16_000, `the shell stays small (${out.length} bytes)`);
  assert.doesNotMatch(out, /brand-mark/, 'the old lettered placeholder is gone');
});

test('the document links its stylesheet, script and icon under content-hash URLs', () => {
  const out = documentFor({ body: 'x', title: 't' });
  for (const path of ['/app\\.css', '/app\\.js', '/brand/favicon\\.svg']) assert.match(out, new RegExp(`${path}\\?v=[0-9a-f]{16}`), path);
});

test('the vendored wordmark is the invert (white) artwork', () => {
  assert.match(LOGO_SVG, /svg/);
  assert.match(LOGO_SVG, /#FFFFFF/i);
});

test('every page in the nav is linked from the shell', () => {
  const out = String(shell({ state, body: 'x', active: 'insights', title: 'Player insights' }));
  for (const href of ['/', '/analysis', '/settlement', '/insights', '/live', '/trends', '/math', '/log']) {
    assert.match(out, new RegExp(`href="${href.replace('/', '\\/')}"`), href);
  }
});

test('the overview is the first page in the nav, and player insights no longer sits at the root', () => {
  const nav = String(shell({ state, body: 'x', active: 'overview', title: 'Overview' })).match(/<nav[^>]*>([\s\S]*?)<\/nav>/)[1];
  const links = [...nav.matchAll(/href="([^"]*)"[^>]*>(?:<span[^>]*>[^<]*<\/span>)?\s*([^<]+)</g)].map(m => [m[1], m[2].trim()]);
  assert.deepEqual(links[0], ['/', 'Overview']);
  assert.deepEqual(links.find(([, label]) => label === 'Player insights'), ['/insights', 'Player insights']);
});

test('the active page is marked active exactly once', () => {
  const out = String(shell({ state, body: 'x', active: 'trends', title: 'Trends' }));
  assert.equal((out.match(/class="active"/g) ?? []).length, 1);
});

test('the document escapes an untrusted title', () => {
  const out = documentFor({ body: 'x', title: '<script>alert(1)</script>' });
  assert.doesNotMatch(out, /<script>alert/);
});

test('apart from the logo, the shell names the configured team and no one else', () => {
  const out = String(shell({ state: { ...state, meta: { team: 'acme-studios' } }, body: 'x', active: 'insights', title: 'Player insights' }));
  assert.match(out, /acme-studios/, 'the sidebar names the team this install polls');
  const withoutLogo = out.replace(/<img class="cg-logo"[^>]*>/, '');
  assert.doesNotMatch(withoutLogo, /crash|galaxy/i);
  const bare = String(shell({ state: { ...state, meta: {} }, body: 'x', active: 'insights', title: 'Player insights' }));
  assert.doesNotMatch(bare.replace(/<img class="cg-logo"[^>]*>/, ''), /crash|galaxy/i, 'no studio is assumed when the team is unknown');
});

test('the document title carries the team, not a studio baked into the code', () => {
  assert.match(documentFor({ body: 'x', title: 'Trends', team: 'acme-studios' }), /<title>Trends · acme-studios<\/title>/);
  assert.match(documentFor({ body: 'x', title: 'Trends' }), /<title>Trends · Studio analytics<\/title>/);
  assert.doesNotMatch(documentFor({ body: 'x' }), /crash|galaxy/i);
});

test('the page in use is announced as current, and the footer names the release', () => {
  const out = String(shell({ state, body: 'x', active: 'analysis', title: 'Analysis' }));
  const nav = out.match(/<nav aria-label="Workspace">([\s\S]*?)<\/nav>/)[1];
  assert.equal((nav.match(/aria-current="page"/g) ?? []).length, 1, 'one current page in the sidebar');
  assert.match(out, /<nav class="breadcrumbs" aria-label="Breadcrumb"><ol><li><a href="\/">Workspace<\/a><\/li><li aria-current="page"><b>Analysis<\/b><\/li><\/ol><\/nav>/);
  assert.match(out, /<a class="active" href="\/analysis" aria-current="page">/);
  assert.match(out, /<b class="version">v\d+\.\d+\.\d+<\/b>/);
});

test('a page below its section says so in the breadcrumbs', () => {
  const out = String(shell({ state, body: 'x', active: 'overview', title: 'Berry', crumbs: [{ label: 'Berry', href: '/game/berry' }, { label: 'BASE' }] }));
  assert.match(out, /<ol><li><a href="\/">Workspace<\/a><\/li><li><a href="\/">Overview<\/a><\/li><li><a href="\/game\/berry">Berry<\/a><\/li><li aria-current="page"><b>BASE<\/b><\/li><\/ol>/);
});
