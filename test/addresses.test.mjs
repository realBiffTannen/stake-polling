import { test } from 'node:test';
import assert from 'node:assert/strict';
import { lanUrls } from '../src/net/addresses.mjs';

const interfaces = {
  lo0: [{ address: '127.0.0.1', family: 'IPv4', internal: true }],
  en0: [{ address: '192.168.1.24', family: 'IPv4', internal: false },
        { address: 'fe80::1', family: 'IPv6', internal: false }],
};

test('every external IPv4 address is offered, plus localhost', () => {
  assert.deepEqual(lanUrls(3005, interfaces), ['http://localhost:3005', 'http://192.168.1.24:3005']);
});

test('a machine with no external interface still offers localhost', () => {
  assert.deepEqual(lanUrls(3005, { lo0: interfaces.lo0 }), ['http://localhost:3005']);
});
