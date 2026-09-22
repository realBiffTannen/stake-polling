import { test, before, beforeEach, after } from 'node:test';
import assert from 'node:assert/strict';
import { connect } from '../src/store/redis.mjs';
import { keys } from '../src/store/keys.mjs';
import { csvCell, dayBounds, wideCsv, longCsv } from '../src/store/export.mjs';

// ------------------------------------------------------------- pure parts
test('csvCell leaves numbers alone, negatives included', () => {
  assert.equal(csvCell('-64542898849'), '-64542898849');
  assert.equal(csvCell('0'), '0');
  assert.equal(csvCell('1.5e3'), '1.5e3');
  assert.equal(csvCell(''), '');
  assert.equal(csvCell(null), '');
});

test('csvCell defuses spreadsheet formulas and quotes separators', () => {
  assert.equal(csvCell('=HYPERLINK("x")'), `"'=HYPERLINK(""x"")"`);
  assert.equal(csvCell('-cmd'), "'-cmd");
  assert.equal(csvCell('@SUM(A1)'), "'@SUM(A1)");
  assert.equal(csvCell('a,b'), '"a,b"');
  assert.equal(csvCell('line\nbreak'), '"line\nbreak"');
});

test('dayBounds is the UTC calendar day, midnight included and the next midnight excluded', () => {
  assert.deepEqual(dayBounds('2026-09-22'), { from: Date.parse('2026-09-22T00:00:00Z'), to: Date.parse('2026-09-23T00:00:00Z') });
  assert.equal(dayBounds('2026-02-30'), null, 'not a real date');
  assert.equal(dayBounds('22-09-2026'), null);
  assert.equal(dayBounds(''), null);
});

// ------------------------------------------------------------ against redis
const k = keys('export-test');
let client = null, skip = false;
try { client = await connect('redis://127.0.0.1:6379', { database: 9 }); } catch { skip = 'redis unreachable'; }
beforeEach(async () => { if (client) await client.flushDb(); });
after(async () => { if (client) await client.quit(); });

const MID = Date.parse('2026-09-22T00:00:00Z');
const NEXT = Date.parse('2026-09-23T00:00:00Z');
async function seed() {
  await client.xAdd(k.tsGame('berry'), `${MID - 150000}-0`, { count: '1', profit: '-5' });
  await client.xAdd(k.tsGame('berry'), `${MID}-0`, { count: '2', profit: '-6' });
  await client.xAdd(k.tsGame('berry'), `${MID + 150000}-0`, { count: '3', profit: '-7', onlinePlayers: '4' });
  await client.xAdd(k.tsGame('berry'), `${NEXT}-0`, { count: '9', profit: '-9' });
  await client.xAdd(k.alerts, `${MID + 1000}-0`, { message: '=cmd()' });
}
const collect = async (gen) => { let s = ''; for await (const chunk of gen) s += chunk; return s; };
const sources = [{ id: 'ts:berry', key: k.tsGame('berry') }, { id: 'alerts', key: k.alerts }];

test('wideCsv writes one row per entry of the day, with a column for every field seen', { skip }, async () => {
  await seed();
  const csv = await collect(wideCsv(client, sources[0], dayBounds('2026-09-22')));
  const lines = csv.trim().split('\r\n');
  assert.equal(lines[0], 'time_utc,entry_id,count,profit,onlinePlayers');
  assert.equal(lines.length, 3, 'header + the 00:00:00 entry + the 00:02:30 entry; neither neighbouring day');
  assert.equal(lines[1], `2026-09-22T00:00:00.000Z,${MID}-0,2,-6,`);
  assert.equal(lines[2], `2026-09-22T00:02:30.000Z,${MID + 150000}-0,3,-7,4`);
});

test('wideCsv with no date exports everything retained', { skip }, async () => {
  await seed();
  const csv = await collect(wideCsv(client, sources[0], null));
  assert.equal(csv.trim().split('\r\n').length, 5);
});

test('longCsv writes one row per data point across every stream, defusing formulas', { skip }, async () => {
  await seed();
  const csv = await collect(longCsv(client, sources, dayBounds('2026-09-22'), { batch: 1 }));
  const lines = csv.trim().split('\r\n');
  assert.equal(lines[0], 'time_utc,entry_id,stream,field,value');
  assert.equal(lines.length, 1 + 2 + 3 + 1, 'berry 2 + 3 fields, alerts 1 field');
  assert.ok(lines.includes(`2026-09-22T00:00:01.000Z,${MID + 1000}-0,alerts,message,'=cmd()`));
});

test('an empty stream exports just its header', { skip }, async () => {
  const csv = await collect(wideCsv(client, sources[0], dayBounds('2026-09-22')));
  assert.equal(csv, 'time_utc,entry_id\r\n');
});
