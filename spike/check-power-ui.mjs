import assert from 'node:assert/strict';
import {writeFileSync} from 'node:fs';
const token=process.argv[2];assert.match(token??'',/^[0-9a-f]{8}$/);
const tabs=await(await fetch('http://localhost:9225/json/list')).json();
const tab=tabs.find(t=>t.url.startsWith('http://localhost:8080/'));
const ws=new WebSocket(tab.webSocketDebuggerUrl);await new Promise(r=>ws.onopen=r);
let id=0;const pending=new Map();ws.onmessage=e=>{const m=JSON.parse(e.data);pending.get(m.id)?.(m);pending.delete(m.id);};
async function call(method,params={}){const n=++id;const p=new Promise(r=>pending.set(n,r));ws.send(JSON.stringify({id:n,method,params}));const m=await p;assert.ok(!m.error&&!m.result?.exceptionDetails,JSON.stringify(m));return m.result;}
async function evaluate(expression){return(await call('Runtime.evaluate',{expression,awaitPromise:true,returnByValue:true})).result.value;}
const timeout=setTimeout(()=>process.exit(1),40000);
try {
 await call('Page.bringToFront');await call('Emulation.setFocusEmulationEnabled',{enabled:true});
 await call('Page.navigate',{url:`http://localhost:8080/#token=${token}`});await call('Page.reload');
 await new Promise(r=>setTimeout(r,600));
 await evaluate(`(async()=>{
  const wait=ms=>new Promise(r=>setTimeout(r,ms));const el=id=>document.getElementById(id);
  sessionStorage.removeItem('tiny-racers-player-${token}');el('connect').click();
  window.driveUI=false;window.raceState=null;
  window.sensor=setInterval(()=>{
   let angle=0;const id=JSON.parse(el('network-metrics').textContent||'{}').playerId;
   const c=window.raceState?.race?.cars.find(c=>c.id===id);
   if(window.driveUI&&c){const error=Math.atan2(c.aimY-c.y,c.aimX-c.x)-c.heading;const steer=Math.max(-1,Math.min(1,Math.atan2(Math.sin(error),Math.cos(error))*2));angle=-Math.sign(steer)*(3+32*Math.abs(steer));}
   const e=new Event('devicemotion');Object.defineProperty(e,'accelerationIncludingGravity',{value:{x:Math.sin(angle*Math.PI/180)*9.8,y:Math.cos(angle*Math.PI/180)*9.8,z:0}});dispatchEvent(e);
  },16);
  await wait(300);
  for(const track of [1,2,0]){
   document.querySelector('[data-track="'+track+'"]').click();await wait(400);
   if(document.querySelector('[data-track="'+track+'"]').getAttribute('aria-pressed')!=='true')throw Error('Track selector did not sync '+track);
  }
  if(!el('auto-items').checked)throw Error('Auto items should default on');
  el('auto-items').checked=false;el('auto-items').dispatchEvent(new Event('change'));
  el('ready').click();await wait(2300);
  if(el('straight-dialog').open||!el('ready').textContent.includes('Ready!'))throw Error('One-tap readiness failed');
  const {EmulatorTransport}=await import('/transport.mjs');sessionStorage.removeItem('tiny-racers-player-${token}');
  window.uiPeer=new EmulatorTransport(()=>{},state=>window.raceState=state);uiPeer.connect('${token}');await wait(300);uiPeer.setReady(true);
  window.peerFeed=setInterval(()=>uiPeer.sendInput(0,true),40);await wait(500);el('start').click();window.driveUI=true;
  const deadline=performance.now()+16000;
  while(el('power').disabled){if(performance.now()>deadline)throw Error('No usable power-up reached phone');await wait(100);}
 })()`);
 const paused=await evaluate(`(async()=>{
  const wait=ms=>new Promise(r=>setTimeout(r,ms)),el=id=>document.getElementById(id);
  el('options-button').click();await wait(400);
  const who=raceState.race.pausedBy,elapsed=raceState.race.elapsed;
  uiPeer.command('resume');await wait(700);
  const frozen=raceState.race.elapsed===elapsed&&raceState.race.pausedBy===who;
  el('sensitivity').value='150';el('sensitivity').dispatchEvent(new Event('input'));
  if(localStorage.getItem('tiny-racers-sensitivity-v2')!=='1.5'||el('sensitivity-value').value!=='150%')throw Error('Sensitivity did not save');
  el('reset-sensitivity').click();if(el('sensitivity').value!=='50')throw Error('Sensitivity reset failed');
  const visible=el('options-menu').open&&el('pause-title').textContent.includes('paused');
  el('resume').click();await wait(400);return {frozen,visible,resumed:raceState.race.pausedBy===0};
 })()`);
 assert.ok(paused.frozen&&paused.visible&&paused.resumed,JSON.stringify(paused));
 for(const [name,width,height] of [['portrait',390,844],['landscape',844,390]]) {
  await call('Emulation.setDeviceMetricsOverride',{width,height,deviceScaleFactor:1,mobile:true});
  await evaluate('scrollTo(0,0)');await new Promise(r=>setTimeout(r,150));
  const layout=await evaluate(`(()=>{const b=document.getElementById('power').getBoundingClientRect();return {fits:document.documentElement.scrollWidth<=innerWidth,visible:b.top>=0&&b.bottom<=innerHeight,text:document.getElementById('power').textContent};})()`);
  assert.ok(layout.fits&&layout.visible,JSON.stringify({name,...layout}));
  const shot=await call('Page.captureScreenshot',{format:'png'});writeFileSync(new URL('../.local/power-ui-'+name+'.png',import.meta.url),Buffer.from(shot.data,'base64'));
 }
 const used=await evaluate(`(async()=>{const id=JSON.parse(document.getElementById('network-metrics').textContent).playerId;document.getElementById('power').click();for(let i=0;i<15;i++){await new Promise(r=>setTimeout(r,100));if(raceState.race.cars.find(c=>c.id===id).power===0)return true;}return false;})()`);
 assert.equal(used,true);
 await evaluate('document.getElementById("auto-items").checked=true;document.getElementById("auto-items").dispatchEvent(new Event("change"));');
 console.log('PASS: pause freezes race, other player cannot resume, owner resumes; phone track selector syncs all three courses; controller UI collects an item from host, power button fits both orientations, click consumes it on host. Synthetic motion only.');
} finally {
 await evaluate('clearInterval(window.sensor);clearInterval(window.peerFeed);window.uiPeer?.command("lobby");document.getElementById("leave").click();window.uiPeer?.leave();');
 clearTimeout(timeout);ws.close();
}
