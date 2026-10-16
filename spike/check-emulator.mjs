// Optional integration check against an already running local Chrome DevTools port.
// Start the TV host + ADB forwarding + localhost:8080 first. Pass the displayed token.
import assert from 'node:assert/strict';
const token = process.argv[2];
const origin = process.argv[3] || 'http://localhost:8080';
assert.match(token || '', /^[0-9a-f]{8}$/);
const tabs = await (await fetch('http://localhost:9225/json/list')).json();
const tab = tabs.find(tab => tab.url === origin + '/');
assert.ok(tab, `Open ${origin} in the test browser on DevTools port 9225`);
const socket = new WebSocket(tab.webSocketDebuggerUrl);
await new Promise((resolve, reject) => { socket.onopen = resolve; socket.onerror = reject; });
let id = 0;
const pending = new Map();
socket.onmessage = event => {
  const message = JSON.parse(event.data);
  if (pending.has(message.id)) { pending.get(message.id)(message); pending.delete(message.id); }
};
// Restore foreground after any lifecycle tests; hidden Chrome throttles timers.
socket.send(JSON.stringify({ id: -1, method: 'Page.bringToFront' }));
socket.send(JSON.stringify({ id: -2, method: 'Emulation.setFocusEmulationEnabled', params: { enabled: true } }));
async function evaluate(expression) {
  const callId = ++id;
  const result = new Promise(resolve => pending.set(callId, resolve));
  socket.send(JSON.stringify({ id: callId, method: 'Runtime.evaluate', params: { expression, awaitPromise: true, returnByValue: true } }));
  const message = await result;
  assert.ok(!message.error && !message.result.exceptionDetails, JSON.stringify(message));
  return message.result.result.value;
}
const timeout = setTimeout(() => { console.error('Integration check timed out'); process.exit(1); }, 45000);
try {
  await evaluate('location.reload()');
  await new Promise(resolve => setTimeout(resolve, 1000));
  const result = await evaluate(`(async () => {
    const wait = ms => new Promise(resolve => setTimeout(resolve, ms));
    const el = id => document.getElementById(id);
    const NativeWebSocket = window.WebSocket;
    window.WebSocket = class extends NativeWebSocket { constructor(...args) { super(...args); window.testSocket = this; } };
    el('token').value = ${JSON.stringify(token)};
    el('synthetic').checked = true;
    el('connect').click();
    await wait(6000);
    const initial = JSON.parse(el('network-metrics').textContent);
    const joins = [];
    for (let i = 0; i < 10; i++) {
      el('disconnect').click(); await wait(100);
      el('connect').click(); await wait(700);
      joins.push(el('network').textContent);
    }
    await wait(600);
    window.testSocket.close(4000, 'Test interruption');
    await wait(2200);
    const recovered = el('network').textContent;
    el('save').click(); await wait(500);
    const result = { secureContext: window.isSecureContext, initial, joins, recovered,
      final: JSON.parse(el('network-metrics').textContent), status: el('network').textContent, saved: el('status').textContent };
    el('disconnect').click(); window.WebSocket = NativeWebSocket; delete window.testSocket;
    return result;
  })()`);
  assert.equal(result.initial.connected, true);
  assert.ok(result.initial.sent >= 100, 'Expected near 25 Hz delivery over six seconds');
  assert.ok(result.initial.rttSamples >= 3);
  assert.ok(result.joins.every(status => status === 'Connected to TV emulator'));
  assert.ok(result.final.successfulConnections >= 11);
  assert.equal(result.recovered, 'Connected to TV emulator');
  assert.match(result.saved, /^Saved to Mac:/);
  assert.equal(result.secureContext, true);
  console.log(JSON.stringify(result, null, 2));
} finally { clearTimeout(timeout); socket.close(); }
