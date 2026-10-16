// Developer test companion, not a human-input result or production AI mode.
import { readFileSync } from 'node:fs';
import { connectWire, waitFor } from './wire-client.mjs';
const [token, origin = 'http://localhost:8080'] = process.argv.slice(2);
if (!/^[0-9a-f]{8}$/.test(token ?? '')) throw Error('Usage: node demo-opponent.mjs TOKEN [ORIGIN]');
const ca = origin.startsWith('https:') ? readFileSync(new URL('../.local/tls/ca.pem', import.meta.url)) : undefined;
const client = await connectWire(origin, token, { ca });
const welcome = await waitFor(() => client.messages.find(m => m.type === 'welcome') || (client.closed && (() => { throw Error('Join rejected; check token/lobby'); })()), 'welcome');
console.log(`Test opponent joined as P${welcome.playerId}. Join on your phone, calibrate, Ready, Start race. Ctrl+C removes the opponent.`);
client.send({ v: 1, type: 'character', character: 2 });
let seq = 0, latest, wasRace = false, lastUse = 0;
const timer = setInterval(() => {
  if (client.closed) { console.log('Host disconnected. Relaunch with current TV token.'); clearInterval(timer); process.exitCode = 1; return; }
  const state = client.messages.filter(m => m.type === 'lobby').at(-1);
  if (state) latest = state;
  client.messages.length = 0;
  const car = latest?.race?.cars.find(c => c.id === welcome.playerId);
  let steering = 0;
  if (car) {
    if (car.power && Date.now()-lastUse>400) { client.send({v:1,type:'use'}); lastUse=Date.now(); }
    const error = Math.atan2(car.aimY-car.y, car.aimX-car.x)-car.heading;
    steering = Math.max(-1, Math.min(1, Math.atan2(Math.sin(error), Math.cos(error)) * 2));
  }
  client.send({ v: 1, type: 'input', seq: seq++, steering, synthetic: true });
  if (!latest?.race && (!latest?.players.find(p => p.id === welcome.playerId)?.ready || wasRace)) client.send({ v: 1, type: 'ready', ready: true });
  wasRace = !!latest?.race;
}, 40);
async function stop() {
  clearInterval(timer);
  if (!client.closed) { client.send({ v: 1, type: 'leave' }); await new Promise(resolve => setTimeout(resolve, 100)); await client.close(); }
  process.exit(0);
}
process.on('SIGINT', stop); process.on('SIGTERM', stop);
