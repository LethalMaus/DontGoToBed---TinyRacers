import assert from 'node:assert/strict';
import {writeFileSync} from 'node:fs';
import {execFileSync} from 'node:child_process';
import {connectWire,waitFor} from './wire-client.mjs';
const token=process.argv[2],peers=[];let state,timer;
const wait=ms=>new Promise(r=>setTimeout(r,ms));
try{
 for(let i=0;i<4;i++){
  const c=await connectWire('http://localhost:8080',token);
  const w=await waitFor(()=>c.messages.find(m=>m.type==='welcome'),'welcome');peers.push({c,id:w.playerId,seq:0});
 }
 timer=setInterval(()=>{
  for(const p of peers){const latest=p.c.messages.filter(m=>m.type==='lobby').at(-1);if(latest)state=latest;p.c.messages.length=0;}
  for(const p of peers){
   const car=state?.race?.cars.find(c=>c.id===p.id);let steering=0;
   if(car){const e=Math.atan2(car.aimY-car.y,car.aimX-car.x)-car.heading;steering=Math.max(-1,Math.min(1,Math.atan2(Math.sin(e),Math.cos(e))*2));if(car.power)p.c.send({v:1,type:'use'});}
   p.c.send({v:1,type:'input',seq:p.seq++,steering,synthetic:true});
  }
 },40);
 for(const track of (process.argv[3]===undefined?[0,1,2]:[Number(process.argv[3])])){
  peers[0].c.send({v:1,type:'track',track});await waitFor(()=>state?.track===track,'track selection');
  for(const p of peers)p.c.send({v:1,type:'ready',ready:true});
  await waitFor(()=>state?.allReady,'ready');
  peers[0].c.send({v:1,type:'start'});await waitFor(()=>state?.race?.track===track,'selected race');
  peers[0].c.send({v:1,type:'track',track:(track+1)%3});await wait(400);
  assert.equal(state.track,track,'mid-race selection changed');
  await wait(16000);
  assert.ok(state.race.courseProgress>1000,'race failed to advance');
  writeFileSync(new URL('../.local/track-'+track+'.png',import.meta.url),execFileSync('adb',['-s',process.env.ANDROID_SERIAL || 'emulator-5560','exec-out','screencap','-p']));
  console.log('PASS '+state.race.trackName+': selected, frozen during race, driving, screenshot');
  peers[0].c.send({v:1,type:'lobby'});await waitFor(()=>state&&!state.race,'lobby');
 }
 peers[0].c.send({v:1,type:'track',track:0});await wait(300);
}finally{clearInterval(timer);peers[0]?.c.send({v:1,type:'lobby'});await wait(150);for(const p of peers){p.c.send({v:1,type:'leave'});await wait(60);await p.c.close();}}
