// Browser regression only: synthetic sensors, no connection to the TV.
import assert from 'node:assert/strict';
import { writeFileSync } from 'node:fs';
const tabs = await (await fetch('http://localhost:9225/json/list')).json();
const tab = tabs.find(tab => tab.url.startsWith('http://localhost:8080/'));
assert.ok(tab);
const socket = new WebSocket(tab.webSocketDebuggerUrl);
await new Promise((resolve, reject) => { socket.onopen = resolve; socket.onerror = reject; });
let id = 0;
const pending = new Map();
socket.onmessage = event => { const message = JSON.parse(event.data); pending.get(message.id)?.(message); pending.delete(message.id); };
async function call(method, params = {}) {
  const next = ++id, result = new Promise(resolve => pending.set(next, resolve));
  socket.send(JSON.stringify({ id: next, method, params }));
  const response = await result;
  assert.ok(!response.error && !response.result?.exceptionDetails, JSON.stringify(response));
  return response.result;
}
async function evaluate(expression) { return (await call('Runtime.evaluate', { expression, awaitPromise: true, returnByValue: true })).result.value; }
const timeout = setTimeout(() => process.exit(1), 20000);
try {
  await call('Page.bringToFront');
  await call('Emulation.setFocusEmulationEnabled', { enabled: true });
  await call('Emulation.setDeviceMetricsOverride', { width: 390, height: 844, deviceScaleFactor: 1, mobile: true });
  await evaluate('location.reload()'); await new Promise(resolve => setTimeout(resolve, 600));
  const result = await evaluate(`(async () => {
    const wait = ms => new Promise(resolve => setTimeout(resolve, ms));
    const el = id => document.getElementById(id);
    const state = () => JSON.parse(el('metrics').textContent);
    window.testAngle = 0; window.testScreenAngle = 0;
    Object.defineProperty(screen.orientation, 'angle', { configurable: true, get: () => window.testScreenAngle });
    el('enable').click();
    window.testFeed = () => {
      const event = new Event('devicemotion');
      const radians = window.testAngle * Math.PI / 180;
      Object.defineProperty(event, 'accelerationIncludingGravity', { value: { x: Math.sin(radians) * 9.8, y: Math.cos(radians) * 9.8, z: 0 } });
      window.dispatchEvent(event);
    };
    window.testTimer = setInterval(window.testFeed, 20);
    await wait(100); el('calibrate').click(); await wait(2100);
    const calibrated = state();
    window.testScreenAngle = 90; window.testAngle = 15;
    await wait(1300); const rotated = state();
    window.testAngle = 30; await wait(650); const turned = state();
    window.testAngle = 15; await wait(650);
    clearInterval(window.testTimer); await wait(700); const paused = state();
    window.testTimer = setInterval(window.testFeed, 20);
    await wait(650); const resumed = state();
    clearInterval(window.testTimer);
    return { calibrated, rotated, turned, paused, resumed, portraitFits: document.documentElement.scrollWidth <= innerWidth };
  })()`);
  assert.equal(result.calibrated.calibrated, true);
  assert.equal(result.rotated.calibrated, true);
  assert.ok(Math.abs(result.rotated.steering) > .15, 'Layout change must preserve physical steering');
  assert.ok(Math.abs(result.turned.steering) > .15, 'Steering remains responsive');
  assert.equal(result.paused.steering, 0);
  assert.equal(result.paused.calibrated, true);
  assert.equal(result.resumed.calibrated, true);
  assert.ok(Math.abs(result.resumed.steering) > .15);
  assert.equal(result.portraitFits, true);
  const layout = await call('Page.getLayoutMetrics');
  const portrait = await call('Page.captureScreenshot', { format: 'png', captureBeyondViewport: true,
    clip: { x: 0, y: 0, width: 390, height: layout.cssContentSize.height, scale: 1 } });
  writeFileSync(new URL('../.local/controller-portrait.png', import.meta.url), Buffer.from(portrait.data, 'base64'));
  await call('Emulation.setDeviceMetricsOverride', { width: 844, height: 390, deviceScaleFactor: 1, mobile: true });
  assert.equal(await evaluate('document.documentElement.scrollWidth <= innerWidth'), true);
  const screenshot = await call('Page.captureScreenshot', { format: 'png' });
  writeFileSync(new URL('../.local/controller-landscape.png', import.meta.url), Buffer.from(screenshot.data, 'base64'));
  console.log('PASS: stable calibration, viewport rotation, stale-input neutralization, recovery, portrait/landscape layout. Synthetic sensors only.');
} finally { clearTimeout(timeout); socket.close(); }
