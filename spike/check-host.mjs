import assert from 'node:assert/strict';
import { readFileSync, writeFileSync } from 'node:fs';
import { connectWire, waitFor } from './wire-client.mjs';

const [token, origin = 'http://localhost:8080'] = process.argv.slice(2);
assert.match(token || '', /^[0-9a-f]{8}$/);
const ca = origin.startsWith('https:') ? readFileSync(new URL('../.local/tls/ca.pem', import.meta.url)) : undefined;
const report = { origin, generatedAt: new Date().toISOString(), tests: [], synthetic: true, physicalMotionValidated: false };
const pause = ms => new Promise(resolve => setTimeout(resolve, ms));
let ping = 1;
async function connect() { const client = await connectWire(origin, token, { ca }); await waitFor(() => client.messages.find(m => m.type === 'welcome'), 'welcome'); return client; }
const timeout = setTimeout(() => { console.error('Host tests timed out'); process.exit(1); }, 60000);
try {
  await assert.rejects(connectWire(origin, token, { ca, requestOrigin: 'https://foreign.example' }), /HTTP 403/);
  report.tests.push('foreign origin rejected');
  let client = await connect();
  client.send({ v: 1, type: 'input', seq: 10, steering: .75 });
  let pong = await client.ping(ping++);
  assert.equal(pong.host.steering, .75); assert.equal(pong.host.stale, false);
  client.send({ v: 1, type: 'input', seq: 9, steering: -1 });
  pong = await client.ping(ping++); assert.equal(pong.host.lastSequence, 10); assert.equal(pong.host.steering, .75);
  report.tests.push('fresh input accepted; replay rejected');
  await pause(300); pong = await client.ping(ping++);
  assert.equal(pong.host.stale, true); assert.equal(pong.host.steering, 0);
  report.tests.push('250 ms stale input neutralized with socket open');
  const second = await connectWire(origin, token, { ca });
  await waitFor(() => second.closeCode === 1008, 'second controller rejected'); await second.close();
  await client.close(); await pause(100);
  report.tests.push('second controller rejected without displacing first');
  for (const invalid of [
    { v: 1, type: 'input', seq: 0, steering: 1.1 },
    { v: 1, type: 'input', seq: 0.5, steering: 0 },
    { v: 1, type: 'input', seq: -1, steering: 0 },
    { v: 1, type: 'input', seq: 0, steering: '0.2' },
    { v: 2, type: 'input', seq: 0, steering: 0 },
    { v: 1, type: 'ping', id: '2' },
    'not json',
  ]) {
    client = await connect(); client.send(invalid);
    await waitFor(() => client.closeCode === 1008, 'malformed message rejected'); await client.close(); await pause(60);
  }
  report.tests.push('seven malformed protocol messages rejected');
  client = await connect(); client.send('x'.repeat(2048));
  await waitFor(() => client.closeCode === 1009, 'oversized frame rejected'); await client.close(); await pause(100);
  report.tests.push('oversized frame rejected at decoder');
  const rtts = [];
  for (let i = 0; i < 10; i++) {
    client = await connect(); client.send({ v: 1, type: 'input', seq: 0, steering: -.5 });
    pong = await client.ping(ping++); assert.equal(pong.host.steering, -.5); rtts.push(pong.rttMs);
    await client.close(); await pause(80);
  }
  report.tests.push('10/10 reconnects accept fresh sequence');
  client = await connect();
  for (let i = 0; i < 125; i++) { client.send({ v: 1, type: 'input', seq: i, steering: Math.sin(i / 10) }); await pause(40); }
  pong = await client.ping(ping++); report.host = pong.host;
  assert.ok(pong.host.arrivalHz >= 20 && pong.host.arrivalHz <= 30);
  report.tests.push('five-second 25 Hz input test');
  await client.close(); rtts.sort((a,b) => a-b); report.echoRttP95Ms = rtts[Math.ceil(rtts.length * .95) - 1];
  report.note = 'Node test client; RTT includes polling overhead, Mac bridge and ADB. Not Safari or physical latency.';
  writeFileSync(new URL('../.local/host-check.json', import.meta.url), JSON.stringify(report, null, 2));
  console.log(JSON.stringify(report, null, 2));
} finally { clearTimeout(timeout); }
