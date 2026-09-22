import { test } from 'node:test';
import assert from 'node:assert/strict';
import { synthesise } from '../src/detect/events.mjs';

const NOW = Date.parse('2026-09-16T14:00:00Z');
const MIN = 60000;
const alert = (over) => ({ ts: NOW - MIN, severity: 'warn', kind: 'spike', game: 'pixel-nest', metric: 'turnover', z: 5, message: 'm', ...over });

test('players arriving alongside volume reads as a traffic surge', () => {
  const events = synthesise([
    alert({ metric: 'onlinePlayers', kind: 'spike', severity: 'crit' }),
    alert({ metric: 'turnover', kind: 'spike' }),
  ], NOW);

  assert.equal(events.length, 1);
  assert.equal(events[0].id, 'traffic_surge');
  assert.equal(events[0].game, 'pixel-nest');
  assert.equal(events[0].confidence, 'high', 'two metrics agreeing, one critical');
  assert.match(events[0].description, /promotion|stream|influx/);
});

test('a flat line reads as a possible outage regardless of what else fired', () => {
  const events = synthesise([
    alert({ metric: 'turnover', kind: 'flat_line', severity: 'crit' }),
    alert({ metric: 'count', kind: 'drop' }),
  ], NOW);
  assert.equal(events[0].id, 'outage');
  assert.match(events[0].description, /reachable/);
});

test('profit falling while volume holds reads as a possible large win', () => {
  const events = synthesise([alert({ metric: 'profit', kind: 'drop', severity: 'crit' })], NOW);
  assert.equal(events[0].id, 'big_win');
  assert.match(events[0].description, /payout/);
});

test('profit falling WITH volume is not called a big win', () => {
  const events = synthesise([
    alert({ metric: 'profit', kind: 'drop' }),
    alert({ metric: 'turnover', kind: 'drop' }),
  ], NOW);
  assert.notEqual(events[0].id, 'big_win');
});

test('an expired sid is reported as polling interrupted', () => {
  const events = synthesise([alert({ game: 'team', metric: 'sid', kind: 'auth', severity: 'crit' })], NOW);
  assert.equal(events[0].id, 'credential');
  assert.match(events[0].description, /frozen/);
});

test('alerts older than the window are ignored', () => {
  assert.deepEqual(synthesise([alert({ ts: NOW - 120 * MIN })], NOW), []);
});

test('one lone finding is low confidence', () => {
  const events = synthesise([alert({ metric: 'turnover', kind: 'spike', severity: 'warn' })], NOW);
  assert.equal(events[0].confidence, 'low');
  assert.equal(events[0].findings, 1);
});

test('events from different games are kept separate and ranked by confidence', () => {
  const events = synthesise([
    alert({ game: 'a', metric: 'turnover', kind: 'spike', severity: 'warn' }),
    alert({ game: 'b', metric: 'turnover', kind: 'spike', severity: 'crit' }),
    alert({ game: 'b', metric: 'onlinePlayers', kind: 'spike', severity: 'crit' }),
  ], NOW);

  assert.equal(events.length, 2);
  assert.equal(events[0].game, 'b', 'the better-evidenced event ranks first');
  assert.equal(events[0].confidence, 'high');
  assert.equal(events[1].confidence, 'low');
});

test('every event carries its underlying findings as evidence', () => {
  const events = synthesise([
    alert({ metric: 'onlinePlayers', kind: 'spike', message: '20 players arrived' }),
    alert({ metric: 'turnover', kind: 'spike', message: 'turnover +$46.00/min' }),
  ], NOW);
  assert.deepEqual(events[0].evidence, ['20 players arrived', 'turnover +$46.00/min']);
});

test('alerts with no recognised signature produce no event rather than a junk one', () => {
  assert.deepEqual(synthesise([alert({ metric: 'mystery', kind: 'unknown' })], NOW), []);
});

test('no alerts means no events', () => {
  assert.deepEqual(synthesise([], NOW), []);
  assert.deepEqual(synthesise(undefined, NOW), []);
});
