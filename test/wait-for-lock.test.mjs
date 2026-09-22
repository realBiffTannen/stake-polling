import { test } from 'node:test';
import assert from 'node:assert/strict';
import { waitForLock } from '../src/poll/wait-for-lock.mjs';

function fakeLock(results) {
  return { calls: 0, async acquire() { this.calls += 1; return results.shift() ?? false; }, async holder() { return 'other-process'; } };
}

function fakeLockWithSpies(results) {
  const lock = fakeLock(results);
  lock.delCalls = [];
  lock.releaseCalls = [];
  lock.del = async function() { this.delCalls.push(1); };
  lock.release = async function() { this.releaseCalls.push(1); };
  return lock;
}

test('an available lock is taken on the first try', async () => {
  const lock = fakeLock([true]);
  assert.equal(await waitForLock(lock, { retryMs: 1 }), true);
  assert.equal(lock.calls, 1);
});

test('a held lock is retried, and never deleted or stolen', async () => {
  const lock = fakeLockWithSpies([false, false, true]);
  const waits = [];
  assert.equal(await waitForLock(lock, { retryMs: 1, onWait: (holder) => waits.push(holder) }), true);
  assert.equal(lock.calls, 3);
  assert.deepEqual(waits, ['other-process', 'other-process']);
  assert.equal(lock.delCalls.length, 0, 'lock.del was never called');
  assert.equal(lock.releaseCalls.length, 0, 'lock.release was never called');
});

test('an aborted wait gives up without taking the lock', async () => {
  const ac = new AbortController();
  // Abort DURING the second acquire attempt, so the outcome cannot depend on
  // event-loop timing: the wait must give up rather than take the lock, even
  // though a third attempt would have succeeded.
  const lock = {
    calls: 0,
    async acquire() { this.calls += 1; if (this.calls === 2) ac.abort(); return false; },
    async holder() { return 'other-process'; },
  };
  assert.equal(await waitForLock(lock, { retryMs: 1, signal: ac.signal }), false);
  assert.equal(lock.calls, 2, 'it stopped trying once aborted');
});
