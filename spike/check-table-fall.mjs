import assert from 'node:assert/strict';
import {writeFileSync} from 'node:fs';
import {execFileSync} from 'node:child_process';
import {connectWire,waitFor} from './wire-client.mjs';
const token=process.argv[2],peers=[];let state,timer,shot=false,sawFall=false,sawExplosionEnd=false;
const wait=ms=>new Promise(r=>setTimeout(r,ms));
try{
 for(let i=0;i<2;i++){
  const c=await connectWire('http://localhost:8080',token);peers.push({c,seq:0});
  const w=await waitFor(()=>c.messages.find(m=>m.type==='welcome'),'welcome');peers[i].id=w.playerId;
 }
 timer=setInterval(()=>{
  for(const p of peers){const latest=p.c.messages.filter(m=>m.type==='lobby').at(-1);if(latest)state=latest;p.c.messages.length=0;}
  for(const p of peers){
   const car=state?.race?.cars.find(c=>c.id===p.id);let steering=0;
   if(car){p.heading??=car.heading+Math.PI/2;const error=p.heading-car.heading;steering=Math.max(-1,Math.min(1,Math.atan2(Math.sin(error),Math.cos(error))*2));}
   p.c.send({v:1,type:'input',seq:p.seq++,steering,active:true,synthetic:true});if(!state?.race)p.c.send({v:1,type:'ready',ready:true});
  }
  if(state?.race?.cars.some(c=>c.falling)){sawFall=true;if(!shot){shot=true;writeFileSync(new URL('../.local/table-fall.png',import.meta.url),execFileSync('adb',['-s',process.env.ANDROID_SERIAL || 'emulator-5560','exec-out','screencap','-p']));}}
  if(sawFall&&state?.race?.cars.some(c=>c.eliminated&&!c.falling))sawExplosionEnd=true;
 },40);
 await waitFor(()=>state?.allReady,'ready');peers[0].c.send({v:1,type:'start'});
 await waitFor(()=>sawExplosionEnd,'visible fall then elimination',15000);
 assert.ok(sawFall);console.log('PASS: actual controller inputs drive off-road and off table; falling state precedes elimination.');
 await wait(700);
}finally{clearInterval(timer);peers[0]?.c.send({v:1,type:'lobby'});await wait(200);for(const p of peers){p.c.send({v:1,type:'leave'});await wait(80);await p.c.close();}}
