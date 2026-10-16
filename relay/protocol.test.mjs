import test from 'node:test';
import assert from 'node:assert/strict';
import { roomForSecret, validInput, allowedRate } from './protocol.mjs';
test('only the host secret derives the public room identifier', async () => {
  const room = await roomForSecret('a'.repeat(64));
  assert.match(room, /^[0-9a-f]{32}$/);
  assert.notEqual(room, await roomForSecret('b'.repeat(64)));
  assert.equal(await roomForSecret(room), null);
  assert.equal(await roomForSecret(''), null);
});
test('invalid, binary and oversized controller payloads are rejected', () => {
  assert.equal(validInput('{"v":1,"type":"input"}'), true);
  for (const value of [new Uint8Array(1), 'no', '{"v":2,"type":"input"}', JSON.stringify({v:1,type:'x'.repeat(512)})]) assert.equal(validInput(value), false);
});
test('message budget recovers on the next window', () => {
  const state = { window: 1000, count: 0 };
  for (let n = 0; n < 60; n++) assert.equal(allowedRate(state, 1001, 60), true);
  assert.equal(allowedRate(state, 1002, 60), false);
  assert.equal(allowedRate(state, 2000, 60), true);
});
