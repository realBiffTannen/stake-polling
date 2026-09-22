import { test } from 'node:test';
import assert from 'node:assert/strict';
import { AlertGate } from '../src/detect/alerts.mjs';

const MIN = 60000;
const spike = (over = {}) => ({ kind: 'spike', game: 'g', metric: 'turnover', severity: 'warn', message: 'x', ...over });

test('the same condition is suppressed inside the cooldown and escalates after', () => {
  const gate = new AlertGate({ cooldownMinutes: 15 });
  assert.equal(gate.admit([spike()], 0).length, 1);
  assert.equal(gate.admit([spike()], 5 * MIN).length, 0);

  const late = gate.admit([spike()], 16 * MIN);
  assert.equal(late.length, 1);
  assert.equal(late[0].severity, 'crit');
});

test('different games do not share a cooldown', () => {
  const gate = new AlertGate({ cooldownMinutes: 15 });
  gate.admit([spike({ game: 'a' })], 0);
  assert.equal(gate.admit([spike({ game: 'b' })], MIN).length, 1);
});

test('different kinds on the same game do not share a cooldown', () => {
  const gate = new AlertGate({ cooldownMinutes: 15 });
  gate.admit([spike()], 0);
  assert.equal(gate.admit([spike({ kind: 'flat_line' })], MIN).length, 1);
});

test('a condition that clears and returns fires again at its own severity', () => {
  const gate = new AlertGate({ cooldownMinutes: 15 });
  gate.admit([spike()], 0);
  gate.admit([], 5 * MIN);           // condition cleared
  gate.admit([], 20 * MIN);
  const again = gate.admit([spike()], 40 * MIN);
  assert.equal(again.length, 1);
  assert.equal(again[0].severity, 'warn');
});

test('escalation stops at crit and does not keep re-firing every cooldown', () => {
  const gate = new AlertGate({ cooldownMinutes: 15 });
  gate.admit([spike()], 0);
  const second = gate.admit([spike()], 16 * MIN);
  assert.equal(second[0].severity, 'crit');
  const third = gate.admit([spike()], 32 * MIN);
  assert.equal(third.length, 1);
  assert.equal(third[0].severity, 'crit');
});

test('admit never mutates the alert it was handed', () => {
  const gate = new AlertGate({ cooldownMinutes: 15 });
  const original = spike();
  gate.admit([original], 0);
  gate.admit([original], 16 * MIN);
  assert.equal(original.severity, 'warn');
});
