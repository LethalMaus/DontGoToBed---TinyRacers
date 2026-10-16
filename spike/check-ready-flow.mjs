// Browser-only controller check. Fake transport; never starts the TV game/audio.
import assert from 'node:assert/strict';
const flat=process.argv.includes('--flat');
const tabs=await(await fetch('http://localhost:9225/json/list')).json();
const tab=tabs.find(t=>t.url.startsWith('http://localhost:8080/'));
const ws=new WebSocket(tab.webSocketDebuggerUrl);await new Promise(r=>ws.onopen=r);
let id=0;const pending=new Map();ws.onmessage=e=>{const m=JSON.parse(e.data);pending.get(m.id)?.(m);pending.delete(m.id);};
async function call(method,params={}){const n=++id,p=new Promise(r=>pending.set(n,r));ws.send(JSON.stringify({id:n,method,params}));const m=await p;assert.ok(!m.error&&!m.result?.exceptionDetails,JSON.stringify(m));return m.result;}
async function evaluate(expression){return(await call('Runtime.evaluate',{expression,awaitPromise:true,returnByValue:true})).result.value;}
let injection;
try{
 await call('Page.enable');
 await call('Page.bringToFront');
 await call('Emulation.setFocusEmulationEnabled',{enabled:true});
 injection=await call('Page.addScriptToEvaluateOnNewDocument',{source:`
 window.permissionRequests=0;window.sent=[];
 Object.defineProperty(window,'DeviceMotionEvent',{configurable:true,value:class{
 static async requestPermission(){window.permissionRequests++;return 'granted';}}});
 window.WebSocket=class {
 static OPEN=1;
 readyState=1;bufferedAmount=0;
 constructor(){setTimeout(()=>{this.onmessage?.({data:JSON.stringify({v:1,type:'welcome',playerId:1,resume:'00000000-0000-0000-0000-000000000000'})});this.lobby(false);},50);}
 lobby(ready){this.onmessage?.({data:JSON.stringify({v:1,type:'lobby',track:0,laps:window.testLaps||1,allReady:false,players:[{id:1,character:0,name:'Leo',ready,connected:true}],...(window.raceRecovery?{race:{pausedBy:0,cars:[{id:1,place:0,power:0,points:0}]}}:{})})});}
 send(raw){const m=JSON.parse(raw);sent.push(m);if(m.type==='laps'){window.testLaps=m.laps;this.lobby(false);}if(m.type==='ready')this.lobby(m.ready);if(m.type==='ping')this.onmessage?.({data:JSON.stringify({v:1,type:'pong',id:m.id})});}
 close(){this.readyState=3;}
 };
 `});
 await call('Page.navigate',{url:'http://localhost:8080/#token=1234abcd'});
 await call('Page.reload',{ignoreCache:true});
 await new Promise(r=>setTimeout(r,500));
 const result=await evaluate(`(async()=>{
 const wait=ms=>new Promise(r=>setTimeout(r,ms)),el=id=>document.getElementById(id);
 el('connect').click();
 for(let attempt=0;attempt<100&&el('ready').disabled;attempt++)await wait(20);
 if(el('ready').disabled)throw Error('Controller did not connect');
 if(document.querySelectorAll('[data-track] svg').length!==3)throw Error('Missing map outlines');
 el('lap-picker').querySelector('[data-laps="3"]').click();
 if(!sent.some(m=>m.type==='laps'&&m.laps===3))throw Error('Lap selection not sent');
 const lapButtons=[...document.querySelectorAll('[data-laps]')];
 if(lapButtons.filter(b=>b.getAttribute('aria-pressed')==='true').length!==1||lapButtons[2].getAttribute('aria-pressed')!=='true')throw Error('Lap selection ambiguous');
 if(getComputedStyle(lapButtons[0]).backgroundColor===getComputedStyle(lapButtons[2]).backgroundColor)throw Error('Selected lap looks unselected');
 const enabled=!el('ready').disabled;
 el('ready').click();await wait(100);const prompted=el('straight-dialog').open;
 el('straight-cancel').click();const cancelled=!el('straight-dialog').open&&!sent.some(m=>m.type==='ready'&&m.ready);
 el('ready').click();await wait(100);
 const sensor=setInterval(()=>{const e=new Event('devicemotion');Object.defineProperty(e,'accelerationIncludingGravity',{value:${flat?'{x:0,y:0,z:9.8}':'{x:0,y:9.8,z:0}'}});Object.defineProperty(e,'rotationRate',{value:${flat?'{alpha:0,beta:0,gamma:0}':'null'}});dispatchEvent(e);},16);
 await wait(2100);clearInterval(sensor);
 return {enabled,prompted,cancelled,requests:permissionRequests,ready:sent.some(m=>m.type==='ready'&&m.ready),closed:!el('straight-dialog').open};
 })()`);
 assert.deepEqual(result,{enabled:true,prompted:true,cancelled:true,requests:1,ready:true,closed:true});
 console.log('PASS browser-only: Ready requests permission once, prompts straight grip, supports cancel, calibrates and automatically marks ready. No TV commands sent.');
 const recovery=await evaluate(`(async()=>{
 const wait=ms=>new Promise(r=>setTimeout(r,ms)),el=id=>document.getElementById(id);
 window.raceRecovery=true;
 Object.defineProperty(document,'hidden',{configurable:true,value:true});document.dispatchEvent(new Event('visibilitychange'));
 Object.defineProperty(document,'hidden',{configurable:true,value:false});document.dispatchEvent(new Event('visibilitychange'));
 await wait(200);
 if(!document.body.classList.contains('racing')||el('ready').hidden||!el('ready').getBoundingClientRect().height)throw Error('No visible race recovery button');
 if(!el('power').textContent.includes('Collect a power-up'))throw Error('Old item wording');
 el('ready').click();await wait(100);
 const sensor=setInterval(()=>{const e=new Event('devicemotion');Object.defineProperty(e,'accelerationIncludingGravity',{value:{x:0,y:9.8,z:0}});dispatchEvent(e);},16);
 await wait(2100);clearInterval(sensor);
 delete document.hidden;
 return {requests:permissionRequests,closed:!el('straight-dialog').open,hidden:el('ready').hidden,active:sent.filter(m=>m.type==='input').at(-1)?.active};
 })()`);
 assert.deepEqual(recovery,{requests:1,closed:true,hidden:true,active:true});
 console.log('PASS browser regression: distinct lap selection, background/return reconnect, visible race Ready, recalibration restores active steering and updated power-up wording.');
 const tipping=await evaluate(`(async()=>{
 const start=sent.length;
 for(let i=0;i<100;i++){
  const pitch=Math.sin(i/100*Math.PI)*Math.PI*.65;
  const e=new Event('devicemotion');
  Object.defineProperty(e,'accelerationIncludingGravity',{value:{x:0,y:9.8*Math.cos(pitch),z:9.8*Math.sin(pitch)}});
  Object.defineProperty(e,'rotationRate',{value:{alpha:null}});dispatchEvent(e);
  await new Promise(r=>setTimeout(r,16));
 }
 const input=sent.slice(start).filter(m=>m.type==='input');
 return input.length>20&&input.every(m=>m.active&&Math.abs(m.steering)<.01);
 })()`);
 assert.equal(tipping,true,'Forward tip stopped or turned the car');
 console.log('PASS live controller stays active through forward tipping past flat without gyro readings.');
 const rotation=await evaluate(`(async()=>{
  let layout=0;const descriptor=Object.getOwnPropertyDescriptor(screen.orientation,'angle');
  Object.defineProperty(screen.orientation,'angle',{configurable:true,get:()=>layout});
  const feed=async angle=>{const r=angle*Math.PI/180,e=new Event('devicemotion');Object.defineProperty(e,'accelerationIncludingGravity',{value:{x:9.8*Math.sin(r),y:9.8*Math.cos(r),z:0}});Object.defineProperty(e,'rotationRate',{value:{alpha:null}});dispatchEvent(e);await new Promise(r=>setTimeout(r,16));};
  const input=()=>sent.filter(m=>m.type==='input').at(-1);
  try{
   for(let n=0;n<30;n++)await feed(0);
   // Stay in a real turn while repeatedly changing just the browser layout.
   for(const next of [90,0,270,180,0]){
    layout=next;screen.orientation.dispatchEvent(new Event('change'));
    window.dispatchEvent(new Event('orientationchange'));
    for(let n=0;n<35;n++)await feed(20);
    if(!input().active||Math.abs(input().steering)<.2)throw Error('Layout swallowed a real turn');
   }
   // Cross the OS rotation threshold while continuously turning, then come back.
   for(let a=20;a<=90;a++){
    if(a===45){layout=90;screen.orientation.dispatchEvent(new Event('change'));}
    await feed(a);
   }
   if(Math.abs(input().steering)<.8)throw Error('Physical turn was cancelled');
   for(let a=90;a>=0;a--){
    if(a===45){layout=0;screen.orientation.dispatchEvent(new Event('change'));}
    await feed(a);
   }
   for(let n=0;n<40;n++)await feed(0);
   if(Math.abs(input().steering)>.01)throw Error('Original grip no longer centres');
   for(let n=0;n<40;n++)await feed(-20);
   const opposite=input().steering;
   for(let n=0;n<40;n++)await feed(20);
   return input().active&&opposite*input().steering<0;
  }finally{if(descriptor)Object.defineProperty(screen.orientation,'angle',descriptor);else delete screen.orientation.angle;}
 })()`);
 assert.equal(rotation,true,'Steering must stay active in both directions across layout changes');
 console.log('PASS layout changes preserve a held turn; gradual rotation retains steering, original neutral and both directions.');

}finally{
 if(injection)await call('Page.removeScriptToEvaluateOnNewDocument',{identifier:injection.identifier});
 await call('Emulation.setFocusEmulationEnabled',{enabled:false});
 await call('Page.navigate',{url:'http://localhost:8080/'});ws.close();
}
