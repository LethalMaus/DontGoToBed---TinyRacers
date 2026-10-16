import assert from 'node:assert/strict';
import { writeFileSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
const token = process.argv[2]; assert.match(token ?? '', /^[0-9a-f]{8}$/);
const tabs = await (await fetch('http://localhost:9225/json/list')).json();
const tab = tabs.find(t => t.url.startsWith('http://localhost:8080/'));
const socket = new WebSocket(tab.webSocketDebuggerUrl);
await new Promise(resolve => { socket.onopen = resolve; });
let serial = 0; const pending = new Map();
socket.onmessage = e => { const r = JSON.parse(e.data); pending.get(r.id)?.(r); pending.delete(r.id); };
async function call(method, params = {}) {
  const id = ++serial; const result = new Promise(resolve => pending.set(id, resolve));
  socket.send(JSON.stringify({ id, method, params })); const r = await result;
  assert.ok(!r.error && !r.result?.exceptionDetails, JSON.stringify(r)); return r.result;
}
async function evaluate(expression) { return (await call('Runtime.evaluate', { expression, awaitPromise: true, returnByValue: true })).result.value; }
const deadline = setTimeout(() => process.exit(1), 480000);
try {
  await call('Page.bringToFront'); await call('Emulation.setFocusEmulationEnabled', { enabled: true });
  await call('Page.navigate', { url: `http://localhost:8080/#token=${token}` });
  await call('Page.reload');
  await new Promise(resolve => setTimeout(resolve, 600));
  const ui = await evaluate(`(async () => {
    const wait = ms => new Promise(r => setTimeout(r, ms)); const el = id => document.getElementById(id);
    const { EmulatorTransport } = await import('/transport.mjs');
    window.peers = []; window.latest = []; window.usedPowers = new Set();
    sessionStorage.removeItem('tiny-racers-player-${token}');
    el('connect').click(); el('enable').click();
    window.sensor = setInterval(() => { const e = new Event('devicemotion'); Object.defineProperty(e, 'accelerationIncludingGravity', { value: {x:0,y:9.8,z:0} }); dispatchEvent(e); }, 16);
    await wait(300); el('calibrate').click(); await wait(2100);
    document.querySelector('[data-character="3"]').click(); await wait(350);
    const characterSelected = document.querySelector('[data-character="3"]').getAttribute('aria-pressed') === 'true';
    const portraitsLoaded = [...document.querySelectorAll('.racer img')].every(img => img.complete && img.naturalWidth > 0);
    el('ready').click(); await wait(2300);
    sessionStorage.removeItem('tiny-racers-player-${token}');
    const peer = new EmulatorTransport(() => {}); window.peers.push(peer); peer.connect('${token}');
    await wait(300); peer.setReady(true); window.inputTimer = setInterval(() => peer.sendInput(0, true), 40);
    await wait(500); const canStart = !el('start').disabled;
    el('start').click(); await wait(500); const starting = el('race-status').textContent;
    el('back').click(); await wait(300); const returned = !el('back').hidden;
    el('leave').click(); peer.leave(); clearInterval(window.sensor); clearInterval(window.inputTimer);
    await wait(300);
    return { characterSelected, portraitsLoaded, token: el('token').value, canStart, starting, returned, fits: document.documentElement.scrollWidth <= innerWidth };
  })()`);
  assert.equal(ui.token, token); assert.equal(ui.canStart, true); assert.match(ui.starting, /Ready/);
  assert.equal(ui.characterSelected, true); assert.equal(ui.portraitsLoaded, true);
  assert.equal(ui.returned, false); assert.equal(ui.fits, true);
  console.log('PASS: QR-token prefill, sensor calibration, ready button, two-player start, countdown, back to lobby and leave.');
  await evaluate(`(async () => {
    const { EmulatorTransport } = await import('/transport.mjs');
    const wait = ms => new Promise(r => setTimeout(r, ms));
    window.peers = []; window.latest = [];
    for (let i = 0; i < 4; i++) {
      sessionStorage.removeItem('tiny-racers-player-${token}');
      const p = new EmulatorTransport(() => {}, state => { window.latest[i] = state; });
      window.peers.push(p); p.connect('${token}'); await wait(250); p.chooseCharacter(3-i); await wait(100); p.setReady(true);
    }
    window.drive = setInterval(() => {
      for (let i = 0; i < 4; i++) {
        const p = peers[i], c = latest[i]?.race?.cars.find(c => c.id === p.playerId); let input = 0;
        if (c) {
          if(c.attack)usedPowers.add(c.attackType);
          if(c.power && (!p.lastUse || performance.now()-p.lastUse>400)) { usedPowers.add(c.power); p.command('use'); p.lastUse=performance.now(); }
          const tx = c.aimX, ty = c.aimY;
          const error = Math.atan2(ty-c.y, tx-c.x)-c.heading;
          input = Math.max(-1, Math.min(1, Math.atan2(Math.sin(error),Math.cos(error))*2));
        }
        p.sendInput(input, true);
      }
    },40);
    await wait(300); peers[0].command('start');
  })()`);
  let result;
  for (let i = 0; i < 45; i++) {
    await new Promise(resolve => setTimeout(resolve, 10000));
    result = await evaluate('({race:latest[0]?.race, usedPowers:[...usedPowers], connections:peers.map(p=>p.ready), metrics:peers.map(p=>p.metrics())})');
    assert.ok(result.connections.every(Boolean), 'Race transport disconnected');
    assert.ok(result.race, 'Race did not start');
    console.log(`Race ${Math.round(result.race.elapsed)}s:`, result.race.cars.map(c => `P${c.id} points ${c.points} out ${c.eliminated}`).join(', '));
    if (result.race.complete) break;
  }
  assert.equal(result.race.complete, true, 'Full circuit must finish');
  assert.ok(result.race.cars.some(c => c.place === 1));
  assert.ok(result.race.cars.every(c => c.place >= 1 && c.place <= 4));
  assert.ok(result.race.courseProgress >= result.race.courseLength);
  assert.ok(result.race.elapsed >= 120);
  assert.deepEqual(result.usedPowers.sort(), [1,2,3,4,5,6]);
  assert.ok(result.race.cars.some(c => c.jumps > 0));

  if (process.env.CAPTURE_TV === '1') writeFileSync(new URL('../.local/polished-results.png', import.meta.url), execFileSync('adb', ['-s',process.env.ANDROID_SERIAL || 'emulator-5560','exec-out','screencap','-p']));
  const placeBeforeLeave = result.race.cars.find(c => c.id === result.metrics[0].playerId).place;
  const placeAfterLeave = await evaluate(`(async () => {
    const id = peers[0].playerId; peers[0].leave(); await new Promise(r => setTimeout(r, 400));
    return latest[1].race.cars.find(c => c.id === id).place;
  })()`);
  assert.equal(placeAfterLeave, placeBeforeLeave, 'Leaving after finishing must preserve the result');
  writeFileSync(new URL('../.local/race-browser-check.json', import.meta.url), JSON.stringify({ synthetic: true, ui, ...result }, null, 2));
  console.log('PASS: four browser transports complete a full winding circuit with all six powers, ramps and final standings and preserve the winner.');
} finally {
  await evaluate('clearInterval(window.drive); clearInterval(window.sensor); clearInterval(window.inputTimer); window.peers?.find(p=>p.ready)?.command("lobby"); window.peers?.forEach(p=>p.leave());');
  clearTimeout(deadline); socket.close();
}
