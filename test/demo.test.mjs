import { test } from 'node:test';
import assert from 'node:assert/strict';
import { runInNewContext } from 'node:vm';
import { buildModel, api, demoMoment, DEMO_GAMES, DEMO_TEAM, totals, DEMO } from '../src/demo/model.mjs';
import { demoMath, DRIFTED, UNCAPTURED } from '../src/demo/math.mjs';
import { urlKey, staticPath, linksIn, rewriteLinks, markDemo } from '../src/demo/site.mjs';
import { INSIGHTS_JS } from '../src/web/insights-assets.mjs';

const usd = (units) => units / 1e6;

test('the demo is about twenty made-up games, each with $500k-$2.5M turnover this month, whenever it is built', async () => {
  assert.equal(DEMO_GAMES.length, 20);
  for (const real of ['2026-09-23T09:00:00Z', '2026-10-01T02:00:00Z', '2026-10-04T23:59:00Z', '2026-10-05T00:00:00Z', '2027-02-28T12:00:00Z']) {
    const now = demoMoment(Date.parse(real));
    const roster = (await api(buildModel({ now })).teamStats()).data;
    assert.equal(roster.length, 20, real);
    for (const r of roster) {
      const t = usd(r.stats.turnover);
      assert.ok(t > 500_000 && t < 2_500_000, `${real}: ${r.name} $${Math.round(t)}`);
    }
  }
});

test('a build in a month\'s first days is dated to the last day of the month before', () => {
  assert.equal(new Date(demoMoment(Date.parse('2026-10-02T08:00:00Z'))).toISOString(), '2026-09-30T08:00:00.000Z');
  assert.equal(demoMoment(Date.parse('2026-10-05T08:00:00Z')), Date.parse('2026-10-05T08:00:00Z'));
});

test('the same moment and seed build the same demo, and every level of detail agrees', async () => {
  const now = Date.parse('2026-09-23T09:00:00Z');
  const a = api(buildModel({ now })), b = api(buildModel({ now }));
  assert.deepEqual((await a.teamStats()).data, (await b.teamStats()).data, 'deterministic');
  const roster = (await a.teamStats()).data;
  for (const r of roster.slice(0, 5)) {
    const modes = (await a.gameStats(r.slug)).data.stats;
    assert.ok(Math.abs(modes.reduce((s, m) => s + m.turnover, 0) - r.stats.turnover) <= modes.length, `${r.slug}: modes sum to the roster`);
    assert.ok(modes.every((m) => m.rtp > 0.9 && m.rtp < 0.98 && m.cost >= 1));
  }
  const catalogue = (await a.teamGames()).data;
  assert.equal(catalogue.filter((g) => g.isLive).length, 20);
  assert.ok(catalogue.some((g) => !g.isLive && g.stats === null), 'titles not live yet');
  const margin = roster.reduce((s, r) => s + r.stats.profit, 0) / roster.reduce((s, r) => s + r.stats.turnover, 0);
  assert.ok(margin > 0.01 && margin < 0.07, `a plausible house margin: ${(margin * 100).toFixed(2)}%`);
});

test('an end date covers its whole day, and nothing after the model\'s now is counted', async () => {
  const now = Date.parse('2026-09-23T09:00:00Z');
  const model = buildModel({ now });
  const slug = model.games[0].slug;
  const sum = (t) => Object.values(t).reduce((s, c) => s + c.turnover, 0);
  const day = sum(totals(model, slug, Date.parse('2026-09-22T00:00:00Z'), Date.parse('2026-09-23T00:00:00Z')));
  const [row] = (await api(model).teamStats({ start: '2026-09-22', end: '2026-09-22' })).data;
  assert.ok(Math.abs(usd(row.stats.turnover) - day) < 1);
  assert.equal(sum(totals(model, slug, now, now + DEMO.DAY_MS)), 0, 'the future is empty');
});

test('the demo math leaves one game drifted and one uncaptured, to show both warnings', () => {
  const math = demoMath(buildModel({ now: Date.parse('2026-09-23T09:00:00Z') }));
  assert.equal(Object.keys(math).length, 19);
  assert.ok(!(UNCAPTURED in math));
  assert.ok(DRIFTED in math);
  assert.equal(DEMO_TEAM, 'demo-studio');
});

test('static paths: a query becomes a directory, a bare page an index, a hashed asset keeps its URL', () => {
  assert.deepEqual(staticPath('/'), { file: 'index.html', href: '/' });
  assert.deepEqual(staticPath('/analysis'), { file: 'analysis/index.html', href: '/analysis/' });
  assert.deepEqual(staticPath('/analysis?span=24h'), { file: 'analysis/q/span-24h/index.html', href: '/analysis/q/span-24h/' });
  assert.deepEqual(staticPath('/app.css?v=abc', 'text/css'), { file: 'app.css', href: '/app.css?v=abc' });
  assert.deepEqual(staticPath('/export.pdf?from=2026-09-01&to=2026-09-23', 'application/pdf'), { file: 'export/q/from-2026-09-01_to-2026-09-23.pdf', href: '/export/q/from-2026-09-01_to-2026-09-23.pdf' });
  assert.equal(urlKey('/analysis?span=24h&fragment=1'), '/analysis?span=24h', 'never the live-refresh flag');
  assert.equal(urlKey('/x?b=2&a=1'), '/x?a=1&b=2', 'query order does not matter');
  assert.equal(urlKey('https://github.com/x'), null, 'other sites are left alone');
});

test('links are found and rewritten in attributes and the palette, and an uncrawled one falls back', () => {
  const html = '<a href="/analysis?span=24h&amp;x=1">a</a><a href="/game/berry#modes">b</a><a href="/nowhere?q=1">c</a><a href="https://example.com/">d</a><script type="application/json">[{"href":"/game/berry"}]</script>';
  assert.deepEqual(linksIn(html).sort(), ['/analysis?span=24h&x=1', '/game/berry', '/nowhere?q=1']);
  const map = { '/analysis?span=24h&x=1': '/analysis/q/span-24h_x-1/', '/game/berry': '/game/berry/' };
  const out = rewriteLinks(html, (k) => map[k] ?? null);
  assert.match(out, /href="\/analysis\/q\/span-24h_x-1\/"/);
  assert.match(out, /href="\/game\/berry\/#modes"/);
  assert.match(out, /href="\/"/, 'an uncrawled link goes to the overview, not a dead end');
  assert.match(out, /href="https:\/\/example\.com\/"/);
  assert.match(out, /"href":"\/game\/berry\/"/);
});

test('a demo page is marked: banner in the workspace, no live refresh, forms off', () => {
  const out = markDemo('<html lang="en"><body><main><aside></aside><div class="workspace"><header></header></div></main></body></html>', { banner: 'Made up.' });
  assert.match(out, /^<html data-demo lang="en">/);
  assert.match(out, /<main><div data-static hidden><\/div>/);
  assert.match(out, /<div class="workspace"><div class="demo-banner" role="note">Made up\.<\/div>/);
});

test('in the demo, a form shows a note instead of posting', () => {
  const listeners = [];
  const note = { hidden: true, textContent: '' };
  const document = { documentElement: { hasAttribute: (n) => n === 'data-demo', classList: { add() {} } }, hidden: false, activeElement: {},
    querySelector: () => null, querySelectorAll: () => [], getElementById: (id) => (id === 'refresh-status' ? note : null),
    addEventListener(type, fn, capture) { listeners.push({ type, fn, capture }); }, dispatchEvent() {} };
  runInNewContext(INSIGHTS_JS, { document, URL, CustomEvent, location: { href: 'http://x/' }, AbortSignal, performance: { now: () => 0 }, setTimeout: () => 0, setInterval() {}, fetch: async () => ({}) });
  let prevented = false, stopped = false;
  const demo = listeners.find((l) => l.type === 'submit' && l.capture === true);
  demo.fn({ preventDefault() { prevented = true; }, stopImmediatePropagation() { stopped = true; } });
  assert.ok(prevented && stopped);
  assert.equal(note.hidden, false);
  assert.match(note.textContent, /demo with made-up data/);
});
