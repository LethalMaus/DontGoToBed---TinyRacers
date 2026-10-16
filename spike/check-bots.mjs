// Empty emulator lobby only; synthetic human input, real host-controlled bots.
import assert from 'node:assert/strict';
import {connectWire,waitFor} from './wire-client.mjs';
const token=process.argv[2],sleep=ms=>new Promise(r=>setTimeout(r,ms));
let peer,timer,identity,seq=0,sendInputs=true;
const state=()=>peer?.messages.filter(m=>m.type==='lobby').at(-1);
async function join(resume){peer=await connectWire('http://localhost:8080',token,{resume});identity=await waitFor(()=>peer.messages.find(m=>m.type==='welcome'),'welcome');seq=0;}
try{
 await join();await waitFor(state,'lobby');assert.equal(state().players.length,1,'Needs empty lobby');
 timer=setInterval(()=>{if(!sendInputs||peer.closed)return;const car=state()?.race?.cars.find(c=>c.id===identity.playerId);const error=car?Math.atan2(car.aimY-car.y,car.aimX-car.x)-car.heading:0;peer.send({v:1,type:'input',seq:seq++,steering:Math.max(-1,Math.min(1,Math.atan2(Math.sin(error),Math.cos(error))*2)),synthetic:true});},40);
 for(let bots=0;bots<=3;bots++){
  peer.send({v:1,type:'bots',bots});await waitFor(()=>state()?.bots===bots,'bot selection');
  peer.send({v:1,type:'ready',ready:true});await waitFor(()=>state()?.allReady,'one human ready');
  peer.send({v:1,type:'start'});await waitFor(()=>state()?.race,'solo starts');
  assert.equal(state().race.cars.length,bots+1);
  assert.equal(state().race.cars.filter(c=>c.bot).length,bots);
  const positions=state().race.cars.map(c=>[c.x,c.y]);
  await sleep(5500);
  state().race.cars.forEach((c,i)=>assert.ok(Math.hypot(c.x-positions[i][0],c.y-positions[i][1])>10,'Racer did not drive'));
  assert.ok(state().race.courseProgress>0);
  peer.send({v:1,type:'bots',bots:(bots+1)%4});await sleep(150);assert.equal(state().bots,bots,'Bot count changed midrace');
  if(bots===3){
   const resume=identity.resume;sendInputs=false;await peer.close();await sleep(500);await join(resume);await waitFor(()=>state()?.race,'resumed race');
   const stopped=state().race.cars.map(c=>[c.x,c.y]);await sleep(350);
   assert.deepEqual(state().race.cars.map(c=>[c.x,c.y]),stopped,'Bots moved with no active human');
   sendInputs=true;await sleep(400);assert.ok(state().race.cars.some((c,i)=>c.x!==stopped[i][0]||c.y!==stopped[i][1]),'Resume did not restart racers');
  }
  peer.send({v:1,type:'lobby'});await waitFor(()=>state()&&!state().race,'return');
  console.log('PASS one human + '+bots+' bots: start, drive, fixed roster, return');
 }
 peer.send({v:1,type:'bots',bots:0});
}finally{clearInterval(timer);if(peer&&!peer.closed){peer.send({v:1,type:'lobby'});peer.send({v:1,type:'leave'});await waitFor(()=>peer.closed,'leave');}}
