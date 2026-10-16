import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { writeFileSync } from 'node:fs';
const tabs = await (await fetch('http://localhost:9225/json/list')).json();
const socket = new WebSocket(tabs.find(tab => tab.url === 'http://localhost:8080/').webSocketDebuggerUrl);
await new Promise(resolve => { socket.onopen = resolve; });
let id = 0;
const pending = new Map();
socket.onmessage = event => { const r = JSON.parse(event.data); pending.get(r.id)?.(r); pending.delete(r.id); };
async function command(method, params) {
  const callId = ++id; const promise = new Promise(resolve => pending.set(callId, resolve));
  socket.send(JSON.stringify({ id: callId, method, params }));
  const result = await promise; assert.ok(!result.error, JSON.stringify(result)); return result;
}
try {
  await command('Page.bringToFront', {});
  await command('Emulation.setFocusEmulationEnabled', { enabled: true });
  await command('Runtime.evaluate', { expression: "document.getElementById('synthetic').checked = true; document.getElementById('connect').click()" });
  await new Promise(resolve => setTimeout(resolve, 1200));
  const connected = await command('Runtime.evaluate', { expression: "document.getElementById('network').textContent" });
  assert.equal(connected.result.result.value, 'Connected to TV emulator');
  await command('Runtime.evaluate', { expression: "import('/transport.mjs').then(({EmulatorTransport}) => { window.restoreSendInput = EmulatorTransport.prototype.sendInput; EmulatorTransport.prototype.sendInput = () => {}; })", awaitPromise: true });
  await new Promise(resolve => setTimeout(resolve, 600));
  writeFileSync(new URL('../.local/tv-stale.png', import.meta.url), execFileSync('adb', ['-s', process.env.ANDROID_SERIAL || 'emulator-5560', 'exec-out', 'screencap', '-p']));
  console.log('Captured host after 600 ms without input, socket left open: .local/tv-stale.png; visually verify neutral.');
} finally {
  await command('Runtime.evaluate', { expression: "import('/transport.mjs').then(({EmulatorTransport}) => { EmulatorTransport.prototype.sendInput = window.restoreSendInput; delete window.restoreSendInput; })", awaitPromise: true }); socket.close();
}
