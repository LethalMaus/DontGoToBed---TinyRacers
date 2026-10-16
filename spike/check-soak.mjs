import assert from 'node:assert/strict';
import { readFileSync, writeFileSync } from 'node:fs';
import { connectWire, waitFor } from './wire-client.mjs';
const [token, origin = 'http://localhost:8080', secondsText = '300'] = process.argv.slice(2);
const seconds = Number(secondsText);
assert.ok(seconds >= 5 && seconds <= 600);
const ca = origin.startsWith('https:') ? readFileSync(new URL('../.local/tls/ca.pem', import.meta.url)) : undefined;
const client = await connectWire(origin, token, { ca });
await waitFor(() => client.messages.some(m => m.type === 'welcome'), 'welcome');
const start = performance.now(), rtts = [], observations = [];
let seq = 0, nextPing = 1000, nextProgress = 30000;
const timer = setInterval(() => client.send({ v: 1, type: 'input', seq: seq++, steering: Math.sin(performance.now() / 500) }), 40);
try {
  while (performance.now() - start < seconds * 1000) {
    const elapsed = performance.now() - start;
    assert.equal(client.closed, false, 'Unexpected disconnect during soak');
    assert.equal(client.error, null);
    if (elapsed >= nextPing) {
      const pong = await client.ping(nextPing); nextPing += 1000;
      assert.equal(pong.host.stale, false);
      observations.push(pong.host); rtts.push(pong.rttMs);
    }
    if (elapsed >= nextProgress) { console.log(`${Math.round(elapsed / 1000)} seconds, ${seq} inputs, connection stable`); nextProgress += 30000; }
    await new Promise(resolve => setTimeout(resolve, 20));
  }
  clearInterval(timer);
  const final = await client.ping(nextPing);
  assert.ok(final.host.arrivalHz >= 20 && final.host.arrivalHz <= 30);
  rtts.sort((a,b) => a-b);
  const report = { generatedAt: new Date().toISOString(), origin, seconds, sent: seq, host: final.host,
    echoRttP95Ms: rtts[Math.ceil(rtts.length * .95) - 1], observations,
    synthetic: true, hardwareMilestoneValidated: false, note: 'Verified TLS, Node synthetic client, Mac bridge and ADB. No Safari motion.' };
  writeFileSync(new URL('../.local/soak-report.json', import.meta.url), JSON.stringify(report, null, 2));
  console.log(JSON.stringify({ ...report, observations: `${observations.length} samples saved` }, null, 2));
} finally { clearInterval(timer); await client.close(); }
