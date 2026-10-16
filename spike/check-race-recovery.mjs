// Real host, synthetic controllers. Run only in an empty test lobby.
import assert from 'node:assert/strict';
import {connectWire, waitFor} from './wire-client.mjs';
const token=process.argv[2];
assert.match(token??'',/^[0-9a-f]{8}$/);
const peers=[];
const sleep=ms=>new Promise(r=>setTimeout(r,ms));
let timer;
const state=()=>peers[1]?.messages.filter(m=>m.type==='lobby').at(-1);
try {
 for(let i=0;i<4;i++) {
  const c=await connectWire('http://localhost:8080',token);peers.push(c);
  c.identity=await waitFor(()=>c.messages.find(m=>m.type==='welcome'),'welcome');
  c.seq=0;
 }
 await waitFor(()=>state()?.players.length===4,'four players');
 assert.ok(!state().race,'Requires an empty lobby');
 timer=setInterval(()=>{for(const c of peers)if(!c.closed)c.send({v:1,type:'input',seq:c.seq++,steering:0,synthetic:true});},40);
 for(const laps of [1,2,3]) {
  peers[1].send({v:1,type:'laps',laps});
  await waitFor(()=>state()?.laps===laps,'lap selection');
  for(const c of peers)c.send({v:1,type:'ready',ready:true});
  await waitFor(()=>state()?.allReady,'ready again');
  peers[1].send({v:1,type:'start'});
  await waitFor(()=>state()?.race,'start again');
  peers[0].send({v:1,type:'pause'});
  await waitFor(()=>state()?.race?.pausedBy===peers[0].identity.playerId,'pause owner');
  const elapsed=state().race.elapsed;
  peers[1].send({v:1,type:'resume'});
  await sleep(300);
  assert.equal(state().race.pausedBy,peers[0].identity.playerId,'Other player resumed owner pause');
  assert.equal(state().race.elapsed,elapsed,'Paused race advanced');
  const identity=peers[0].identity;
  await peers[0].close();
  await waitFor(()=>state()?.race?.pausedBy===0,'disconnect releases pause');
  const replacement=await connectWire('http://localhost:8080',token,{resume:identity.resume});
  peers[0]=replacement;replacement.seq=0;
  replacement.identity=await waitFor(()=>replacement.messages.find(m=>m.type==='welcome'),'resume identity');
  assert.equal(replacement.identity.playerId,identity.playerId);
  peers[1].send({v:1,type:'lobby'});
  await waitFor(()=>state()&&!state().race,'return to lobby');
  assert.ok(state().players.every(p=>!p.ready),'Ready state leaked into next race');
 }
 console.log('PASS repeated starts with 1/2/3 laps; pause freezes time; owner-only resume; owner disconnect unpauses; identity resumes; return clears readiness. Synthetic input only.');
} finally {
 clearInterval(timer);
 for(const c of peers)if(!c.closed){c.send({v:1,type:'lobby'});c.send({v:1,type:'leave'});await waitFor(()=>c.closed,'leave acknowledged');}
}
