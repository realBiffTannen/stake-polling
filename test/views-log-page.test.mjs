import { test } from 'node:test';
import assert from 'node:assert/strict';
import { renderLog } from '../src/web/views/log.mjs';

const state = { meta: { team: 'acme-studios' }, stale: false, ageMs: 0, now: Date.parse('2026-09-22T12:00:00Z') };
const sources = [{ id: 'ts:team', key: 'k1' }, { id: 'ts:online', key: 'k2' }, { id: 'ts:berry', key: 'k3' }];
const ts = Date.parse('2026-09-22T00:00:00Z');
const entry = (over = {}) => ({ id: `${ts}-0`, ts, source: 'ts:berry', fields: { count: '116556', profit: '1782280984' }, ...over });
const render = (page, source = 'all') => String(renderLog({ state, page: { total: 3, newer: null, older: null, entries: [entry()], ...page }, sources, source, total: page?.total ?? 3 }));

test('each entry shows its UTC time, its stream and its raw fields', () => {
  const out = render({});
  assert.match(out, /2026-09-22 00:00:00Z/);
  assert.match(out, /ts:berry/);
  assert.match(out, /<span class="kv"><b>count<\/b> 116556<\/span>/);
  assert.match(out, /<span class="kv"><b>profit<\/b> 1782280984<\/span>/);
  assert.match(out, /<table class="log">/);
});

test('the page is headed as the poll log and says how much there is', () => {
  const out = render({ total: 22 });
  assert.match(out, /EVERY TICK/);
  assert.match(out, /Poll log/);
  assert.match(out, /22 entries across 3 streams/);
  assert.match(render({ total: 5 }, 'ts:team'), /5 entries across 1 stream\b/);
});

test('the units note says money is micro-dollars and trail profit is gross', () => {
  const out = render({});
  assert.match(out, /micro-dollars/);
  assert.match(out, /1,000,000/);
  assert.match(out, /GROSS/);
  assert.match(out, /10%/);
});

test('the source filter is a GET form to /log listing all and every source, with the current one selected', () => {
  const out = render({}, 'ts:online');
  assert.match(out, /<form[^>]*method="get"[^>]*action="\/log"/);
  assert.match(out, /<option value="all"/);
  for (const s of sources) assert.match(out, new RegExp(`<option value="${s.id}"`));
  assert.match(out, /<option value="ts:online" selected>/);
});

test('on the newest page only Older and Oldest are links, and they keep the source', () => {
  const out = render({ older: '1790000000000-0~2' }, 'ts:berry');
  assert.match(out, /href="\/log\?source=ts%3Aberry&amp;before=1790000000000-0%7E2"[^>]*>Older/);
  assert.match(out, /href="\/log\?source=ts%3Aberry&amp;oldest=1"[^>]*>Oldest/);
  assert.doesNotMatch(out, /href="[^"]*after=/, 'nothing newer than the newest page');
  assert.match(out, /<span class="disabled">Newer<\/span>/);
  assert.match(out, /<span class="disabled">Newest<\/span>/);
});

test('on the oldest page only Newest and Newer are links', () => {
  const out = render({ newer: '1790000000000-0~0' });
  assert.match(out, /href="\/log\?source=all"[^>]*>Newest/);
  assert.match(out, /href="\/log\?source=all&amp;after=1790000000000-0%7E0"[^>]*>Newer/);
  assert.doesNotMatch(out, /before=|oldest=1/);
  assert.match(out, /<span class="disabled">Older<\/span>/);
  assert.match(out, /<span class="disabled">Oldest<\/span>/);
});

test('an empty page says so instead of rendering a bare table body', () => {
  const out = render({ entries: [], total: 0 });
  assert.match(out, /No entries\./);
});

test('hostile field names, values and stream ids cannot inject markup', () => {
  const out = render({ entries: [entry({ source: '<img src=x>', fields: { '<script>k</script>': '<b onmouseover=1>v' } })] });
  assert.doesNotMatch(out, /<img src=x/);
  assert.doesNotMatch(out, /<script>k/);
  assert.doesNotMatch(out, /<b onmouseover/);
  const hostileSource = String(renderLog({ state, page: { total: 0, newer: 'x"><i>', older: null, entries: [] }, sources, source: '"><i>', total: 0 }));
  assert.doesNotMatch(hostileSource, /"><i>/);
});

test('the download panel exports a UTC day - or everything retained - as raw CSV, for one stream or all', () => {
  const out = render({}, 'ts:berry');
  assert.match(out, /<form class="filters export" method="get" action="\/export\/log.csv">/);
  assert.match(out, /<input type="date" name="date" value="2026-09-22" max="2026-09-22">/, 'defaults to today, UTC');
  assert.match(out, /<option value="ts:berry" selected>ts:berry<\/option>/);
  assert.match(out, /Download CSV/);
  assert.match(out, /Leave the date empty for everything retained/);
});
