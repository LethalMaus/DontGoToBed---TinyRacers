// Real unmodified Android gameplay, driven by explicitly synthetic controller input.
// Run only with an empty TV lobby. All device operations use the existing ATC lease.
import {connectWire,waitFor} from '../../spike/wire-client.mjs';
import {spawn} from 'node:child_process';
import {writeFileSync} from 'node:fs';
const [token,themeArg='0',durationArg='145']=process.argv.slice(2);
const theme=Number(themeArg),duration=Number(durationArg),name=['dining','garden','bedroom'][theme];
if(!/^[0-9a-f]{8}$/.test(token??'')||!name||duration<10||duration>360)throw Error('TOKEN TRACK(0–2) SECONDS(10–360)');
const wait=ms=>new Promise(r=>setTimeout(r,ms));
const run=(cmd,args)=>new Promise((resolve,reject)=>{const p=spawn(cmd,args,{stdio:'inherit'});p.on('error',reject);p.on('exit',c=>c===0?resolve():reject(Error(cmd+' exit '+c)));});
const peers=[],events=[];let latest,timer,start=Date.now(),lastEvent='',recorder;
try{
 for(let i=0;i<4;i++){
  const client=await connectWire('http://localhost:8080',token);peers.push({client,seq:0,index:i});
  const state=await waitFor(()=>client.messages.find(m=>m.type==='lobby'),'lobby');
  if(i===0&&(state.race||state.players.length!==1))throw Error('Recording requires an empty lobby.');
  const welcome=await waitFor(()=>client.messages.find(m=>m.type==='welcome'),'welcome');peers[i].id=welcome.playerId;
  client.send({v:1,type:'character',character:i});
 }
 peers[0].client.send({v:1,type:'track',track:theme});peers[0].client.send({v:1,type:'laps',laps:1});
 peers[0].client.send({v:1,type:'language',language:'en'});
 timer=setInterval(()=>{
  for(const p of peers){const state=p.client.messages.filter(m=>m.type==='lobby').at(-1);if(state)latest=state;p.client.messages.length=0;}
  const race=latest?.race;
  for(const p of peers){
   const c=race?.cars.find(c=>c.id===p.id);let steering=0;
   if(c){
    const angle=Math.atan2(c.aimY-c.y,c.aimX-c.x)-c.heading;
    steering=Math.max(-1,Math.min(1,Math.atan2(Math.sin(angle),Math.cos(angle))*2));
    // Small lane variations keep the pack lively; no game-state modification.
    steering+=Math.sin((race.elapsed+p.index*1.7)*.7)*.025;
   }
   p.client.send({v:1,type:'input',seq:p.seq++,steering:Math.max(-1,Math.min(1,steering)),active:true,synthetic:true});
   if(!race&&!latest?.players.find(x=>x.id===p.id)?.ready)p.client.send({v:1,type:'ready',ready:true});
  }
  if(race){const key=JSON.stringify([race.round,race.roundWinner,race.complete,...race.cars.flatMap(c=>[c.airborne,c.attackType,c.attack,c.falling,c.spinning,c.eliminated])]);
   if(key!==lastEvent){events.push({seconds:(Date.now()-start)/1000,...race});lastEvent=key;}
  }
 },40);
 await waitFor(()=>latest?.allReady,'four scripted controllers ready',8000);
 start=Date.now();
 recorder=(async()=>{let remaining=duration,part=0;while(remaining>0){
   const seconds=Math.min(175,remaining),suffix=duration>175?'-'+part:'';
   await run('atc',['exec','--','adb','shell','screenrecord','--bit-rate','10000000','--time-limit',String(seconds),`/sdcard/tiny-${name}.mp4`]);
   await run('atc',['exec','--','adb','pull',`/sdcard/tiny-${name}.mp4`,`.local/recordings/${name}${suffix}.mp4`]);
   remaining-=seconds;part++;
  }})();
 await wait(4000);peers[0].client.send({v:1,type:'start'});
 console.log('Recording '+name+' for '+duration+' seconds with synthetic controllers.');
 await recorder;
}finally{
 clearInterval(timer);writeFileSync(`.local/recordings/${name}-events.json`,JSON.stringify({capturedAt:new Date().toISOString(),synthetic:true,events},null,2));
 peers[0]?.client.send({v:1,type:'lobby'});await wait(200);
 for(const p of peers){if(!p.client.closed){p.client.send({v:1,type:'leave'});await wait(100);await p.client.close();}}
}
