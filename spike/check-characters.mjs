import assert from 'node:assert/strict';
import { connectWire, waitFor } from './wire-client.mjs';
const token = process.argv[2];
const clients = [];
async function join(resume) {
  const c = await connectWire('http://localhost:8080', token, { resume }); clients.push(c);
  c.welcome = await waitFor(() => c.messages.find(m => m.type === 'welcome'), 'welcome'); return c;
}
const latest = c => c.messages.filter(m => m.type === 'lobby').at(-1);
try {
  let first = await join(); const other = await join(); const id = first.welcome.playerId;
  for (const character of [3,2,1,0]) {
    first.send({ v:1, type:'character', character });
    await waitFor(() => latest(other)?.players.find(p => p.id === id)?.character === character, 'selection shared');
  }
  first.send({ v:1, type:'ready', ready:true });
  await waitFor(() => latest(other)?.players.find(p => p.id === id)?.ready, 'ready');
  first.send({ v:1, type:'character', character:3 });
  await waitFor(() => latest(other)?.players.find(p => p.id === id)?.character === 3 && !latest(other)?.players.find(p => p.id === id)?.ready, 'selection resets ready');
  const resume = first.welcome.resume; await first.close(); first = await join(resume);
  assert.equal(latest(first)?.players.find(p => p.id === id)?.character, 3);
  for (const character of [-1,4,1.5,'Leo']) {
    first.send({ v:1, type:'character', character });
    await waitFor(() => first.closed, 'invalid selection rejected'); assert.equal(first.closeCode,1008);
    first = await join(resume);
  }
  console.log('PASS: four characters, shared state, selection clears ready, resume preserves character, invalid selections rejected.');
} finally {
  for (const c of clients) if (!c.closed) { c.send({ v:1, type:'leave' }); await waitFor(() => c.closed,'leave'); }
}
