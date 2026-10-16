// Integration against the real Android host through the local bridge. Synthetic input only.
import assert from 'node:assert/strict';
import { readFileSync, writeFileSync } from 'node:fs';
import { connectWire, waitFor } from './wire-client.mjs';
const [token, origin = 'http://localhost:8080'] = process.argv.slice(2);
assert.match(token ?? '', /^[0-9a-f]{8}$/);
const options = origin.startsWith('https:') ? { ca: readFileSync(new URL('../.local/tls/ca.pem', import.meta.url)) } : {};
const clients = new Set();
async function connect(resume) {
  const c = await connectWire(origin, token, { ...options, resume }); clients.add(c); return c;
}
async function join(resume) {
  const c = await connect(resume);
  c.welcome = await waitFor(() => c.messages.find(m => m.type === 'welcome'), 'welcome');
  return c;
}
const lobby = c => c.messages.filter(m => m.type === 'lobby').at(-1);
const sleep = ms => new Promise(resolve => setTimeout(resolve, ms));
async function leave(c) { c.send({ v: 1, type: 'leave' }); await waitFor(() => c.closed, 'leave'); }
const timeout = setTimeout(() => { console.error('Integration timeout'); process.exit(1); }, 90000);
try {
  let peers = [];
  for (let i = 0; i < 4; i++) peers.push(await join());
  assert.equal(new Set(peers.map(c => c.welcome.playerId)).size, 4);
  const fifth = await connect(); await waitFor(() => fifth.closed, 'full rejection'); assert.equal(fifth.closeCode, 1008);
  const duplicate = await connect(peers[0].welcome.resume);
  await waitFor(() => duplicate.closed, 'duplicate rejection'); assert.equal(duplicate.closeCode, 1008);
  const values = [-.8, -.25, .35, .9];
  for (let i = 0; i < 4; i++) peers[i].send({ v: 1, type: 'input', seq: 0, steering: values[i] });
  for (let i = 0; i < 4; i++) assert.equal((await peers[i].ping(1)).host.steering, values[i]);
  peers[0].send({ v: 1, type: 'input', seq: 0, steering: 1 });
  assert.equal((await peers[0].ping(2)).host.steering, -.8);
  for (const c of peers) c.send({ v: 1, type: 'ready', ready: true });
  await waitFor(() => peers.every(c => lobby(c)?.allReady), 'all ready');
  await sleep(300);
  for (const c of peers) { const p = await c.ping(3); assert.equal(p.host.stale, true); assert.equal(p.host.steering, 0); }
  const identity = peers[0].welcome;
  await peers[0].close();
  await waitFor(() => lobby(peers[1])?.players.find(p => p.id === identity.playerId)?.connected === false, 'disconnect isolation');
  peers[0] = await join(identity.resume);
  assert.equal(peers[0].welcome.playerId, identity.playerId);
  await waitFor(() => lobby(peers[0])?.players.find(p => p.id === identity.playerId)?.ready === false, 'ready reset');
  assert.equal((await peers[0].ping(4)).host.steering, 0);
  peers[0].send({ v: 1, type: 'ready', ready: 'yes' });
  await waitFor(() => peers[0].closed, 'malformed ready rejection'); assert.equal(peers[0].closeCode, 1008);
  peers[0] = await join(identity.resume);
  const oldId = peers[3].welcome.playerId;
  await leave(peers[3]); peers[3] = await join(); assert.equal(peers[3].welcome.playerId, oldId);
  console.log('PASS: four slots, full/duplicate rejection, independent inputs, replay, stale neutral, resume, ready reset, malformed ready, leave/reuse.');
  let seq = 1;
  const timer = setInterval(() => { for (let i = 0; i < 4; i++) peers[i].send({ v: 1, type: 'input', seq, steering: values[i] }); seq++; }, 40);
  try {
    await sleep(15000); console.log('Four-player soak: 15 seconds, all connected:', peers.every(c => !c.closed));
    await sleep(15000);
    const results = [];
    for (let i = 0; i < 4; i++) {
      const p = await peers[i].ping(20); assert.equal(p.host.steering, values[i]);
      assert.equal(p.host.stale, false); assert.ok(p.host.arrivalHz > 22); results.push(p.host);
    }
    writeFileSync(new URL('../.local/multiplayer-check.json', import.meta.url), JSON.stringify({ recordedAt: new Date().toISOString(), synthetic: true, results }, null, 2));
    console.log('PASS: 30-second four-controller soak', results.map(p => ({ player: p.playerId, hz: p.arrivalHz, packets: p.packets })));
  } finally { clearInterval(timer); }
  peers[0].send({ v: 1, type: 'start' }); await sleep(100);
  assert.equal(lobby(peers[0])?.race, undefined, 'unready lobby must not start');
  for (const c of peers) c.send({ v: 1, type: 'ready', ready: true });
  let driveSequence = 10000;
  const activeTimer = setInterval(() => {
    for (let i = 1; i < 4; i++) peers[i].send({ v: 1, type: 'input', seq: driveSequence, steering: .3 });
    driveSequence++;
  }, 40);
  try {
    peers[0].send({ v: 1, type: 'input', seq: 10000, steering: 0 });
    await sleep(50); peers[0].send({ v: 1, type: 'start' });
    await waitFor(() => lobby(peers[1])?.race, 'race start');
    const initial = lobby(peers[1]).race.cars.find(c => c.id === peers[0].welcome.playerId);
    await peers[0].close();
    const outsider = await connect(); await waitFor(() => outsider.closed, 'midrace join rejection'); assert.equal(outsider.closeCode, 1008);
    await sleep(3600);
    const racing = lobby(peers[1]).race;
    const stopped = racing.cars.find(c => c.id === initial.id);
    assert.equal(stopped.x, initial.x); assert.equal(stopped.y, initial.y);
    assert.ok(racing.elapsed > .3, 'others continue during disconnect');
    peers[0] = await join(identity.resume);
    assert.equal(peers[0].welcome.playerId, identity.playerId);
    peers[0].send({ v: 1, type: 'input', seq: 0, steering: 0 });
    await sleep(200);
    await waitFor(() => lobby(peers[1]).race.cars.find(c => c.id === initial.id).x !== initial.x, 'resumed car moves');
    peers[0].send({ v: 1, type: 'input', seq: 1, steering: 1, active: false });
    await sleep(300);
    const paused = lobby(peers[1]).race.cars.find(c => c.id === initial.id);
    for (let i = 2; i < 10; i++) { peers[0].send({ v: 1, type: 'input', seq: i, steering: 1, active: false }); await sleep(40); }
    const still = lobby(peers[1]).race.cars.find(c => c.id === initial.id);
    assert.equal(still.x, paused.x); assert.equal(still.y, paused.y);
    peers[1].send({ v: 1, type: 'lobby' });
    await waitFor(() => !lobby(peers[1]).race, 'return to lobby');
    assert.ok(lobby(peers[1]).players.every(p => !p.ready), 'return clears ready');
    console.log('PASS: start guard, midrace join rejection, disconnected car stops, other racers continue, resume during race, inactive sensors stop car, return resets ready.');
  } finally { clearInterval(activeTimer); }
  for (const c of peers) await leave(c);
} finally {
  clearTimeout(timeout);
  for (const c of clients) if (!c.closed) await c.close();
}
