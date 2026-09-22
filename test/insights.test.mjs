import { test } from 'node:test';
import assert from 'node:assert/strict';
import { syncDaily } from '../src/insights/sync.mjs';
import { buildInsights } from '../src/insights/model.mjs';

const stats = (slug, unique, count = 20) => ({ slug, name: slug, stats: { unique, count, turnover: 100e6, profit: -10e6, expectedProfit: 3e6 } });
const now = Date.parse('2026-09-17T14:00:00Z');
function fakeApi() {
  const calls = [];
  return { calls, async teamStats(range) {
    calls.push(range);
    const cumulative = range.start === '2026-07-24';
    const unique = cumulative ? ({ '2026-09-15': 100, '2026-09-16': 106, '2026-09-17': 110 }[range.end] ?? 0) : 10;
    return { ok: true, data: [stats('berry', unique)] };
  } };
}
test('calendar days use inclusive date ranges and new players use cumulative differences', async () => {
  const api = fakeApi();
  const snapshot = await syncDaily({ api, now, days: 2, trackingStart: '2026-07-24' });
  assert.ok(api.calls.some(x => x.start === '2026-09-16' && x.end === '2026-09-16'));
  const model = buildInsights({ snapshot, now, query: new URLSearchParams('from=2026-09-16&to=2026-09-17') });
  assert.deepEqual(model.daily.map(x => [x.date, x.players, x.newPlayers, x.returningPlayers]), [
    ['2026-09-16', 10, 6, 4], ['2026-09-17', 10, 4, 6],
  ]);
  assert.equal(model.totals.players, 20); // player-days, not 20 distinct people
  assert.equal(model.daily[0].profit, -1);
  assert.equal(model.daily[0].rtp, 110);
  assert.equal(model.daily[0].avgBet, 5);
});
test('successful empty reports mean zero; missing dates stay missing; revisions stay unavailable', () => {
  const snapshot = { trackingStart: '2026-07-24', days: {
    '2026-09-15': { rows: [stats('berry', 5)], fetchedAt: now },
    '2026-09-17': { rows: [], fetchedAt: now },
  }, cumulative: { '2026-09-14': [stats('berry', 100)], '2026-09-15': [stats('berry', 99)], '2026-09-16': [], '2026-09-17': [] } };
  const model = buildInsights({ snapshot, now, query: new URLSearchParams('from=2026-09-15&to=2026-09-17') });
  assert.equal(model.daily[0].newPlayers, null);
  assert.equal(model.daily[1].players, null);
  assert.equal(model.daily[2].players, 0);
  assert.equal(model.daily[2].newPlayers, 0);
});
test('game/date filters and descending/ascending sorting work without mutating input', async () => {
  const snapshot = await syncDaily({ api: fakeApi(), now, days: 2, trackingStart: '2026-07-24' });
  snapshot.days['2026-09-17'].rows.push(stats('pixel', 20));
  snapshot.cumulative['2026-09-17'].push(stats('pixel', 20));
  const model = buildInsights({ snapshot, now, query: new URLSearchParams('game=berry&from=2026-09-17&to=2026-09-17') });
  assert.equal(model.daily.length, 1);
  assert.equal(model.daily[0].players, 10);
  assert.deepEqual(model.games.map(x => x.slug), ['berry']);
  const all = buildInsights({ snapshot, now, query: new URLSearchParams('sort=players&dir=desc') });
  assert.equal(all.games[0].slug, 'berry'); // tie resolved by name
  const unknown = buildInsights({ snapshot, now, query: new URLSearchParams('game=missing') });
  assert.equal(unknown.games.length, 0);
});
test('older daily reports are cached; failed refresh preserves existing data and exposes failure', async () => {
  const snapshot = await syncDaily({ api: fakeApi(), now, days: 2, trackingStart: '2026-07-24' });
  const api = fakeApi();
  const next = await syncDaily({ api, previous: snapshot, now: now + 86400000, days: 3, trackingStart: '2026-07-24' });
  assert.ok(!api.calls.some(x => x.start === '2026-09-16'));
  const failed = await syncDaily({ api: { teamStats: async () => ({ ok: false, error: { code: 'AUTH' } }) }, previous: snapshot, now, days: 2, trackingStart: '2026-07-24' });
  assert.deepEqual(failed.days, snapshot.days);
  assert.equal(failed.error, 'AUTH');
  assert.equal(next.days['2026-09-16'].fetchedAt, snapshot.days['2026-09-16'].fetchedAt);
});

test('resume after several days finalizes a partial day and its cumulative boundary', async () => {
  const start = Date.parse('2026-09-15T12:00:00Z');
  const initialApi = { teamStats: async range => ({ ok: true, data: [stats('berry', range.start === '2026-07-24' ? range.end === '2026-09-14' ? 100 : 105 : 5)] }) };
  const previous = await syncDaily({ api: initialApi, now: start, days: 1, trackingStart: '2026-07-24' });
  const finalApi = { teamStats: async range => ({ ok: true, data: [stats('berry', range.start === '2026-07-24' ? ({'2026-09-14':100,'2026-09-15':110,'2026-09-16':115,'2026-09-17':120}[range.end]) : 10)] }) };
  const snapshot = await syncDaily({ api: finalApi, previous, now, days: 3, trackingStart: '2026-07-24' });
  const model = buildInsights({ snapshot, now, query: new URLSearchParams('from=2026-09-15&to=2026-09-17') });
  assert.deepEqual(model.daily.map(r => [r.players, r.newPlayers]), [[10,10], [10,5], [10,5]]);
});

test('the default window is month-to-date, matching the Stake dashboard', () => {
  const model = buildInsights({ snapshot: {}, now });
  assert.equal(model.from, '2026-09-01');
  assert.equal(model.to, '2026-09-17');
  // The quick ranges still count back from today when explicitly asked for.
  const week = buildInsights({ snapshot: {}, now, query: new URLSearchParams('days=7') });
  assert.equal(week.from, '2026-09-11');
  assert.equal(week.to, '2026-09-17');
});
