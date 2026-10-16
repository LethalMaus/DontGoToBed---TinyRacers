// Real controller UI/network, with synthetic motion and a scripted second player.
import {writeFileSync,mkdirSync} from 'node:fs';
import {connectWire,waitFor} from '../../spike/wire-client.mjs';
const token=process.argv[2],origin=process.argv[3]||'http://localhost:8080';
if(!/^(?:[0-9a-f]{8}|[0-9a-f]{32})$/.test(token??''))throw Error('TOKEN');
if(origin!=='http://localhost:8080'&&!/^https:\/\/[a-z0-9-]+\.[a-z0-9-]+\.workers\.dev$/.test(origin))throw Error('Controller origin');
const tab=await(await fetch('http://localhost:9225/json/new?'+encodeURIComponent(origin+'/#token='+token),{method:'PUT'})).json();
const ws=new WebSocket(tab.webSocketDebuggerUrl);await new Promise(r=>ws.onopen=r);let id=0;const pending=new Map();
ws.onmessage=e=>{const m=JSON.parse(e.data);pending.get(m.id)?.(m);pending.delete(m.id);};
async function call(method,params={}){const n=++id,p=new Promise(r=>pending.set(n,r));ws.send(JSON.stringify({id:n,method,params}));const m=await p;if(m.error||m.result?.exceptionDetails)throw Error(JSON.stringify(m));return m.result;}
async function evaluate(expression){return(await call('Runtime.evaluate',{expression,awaitPromise:true,returnByValue:true})).result.value;}
const wait=ms=>new Promise(r=>setTimeout(r,ms));let injection,timer,recording=false,frames=[],capture;
async function still(name){
 mkdirSync('marketing/exports/screenshots',{recursive:true});
 const shot=await call('Page.captureScreenshot',{format:'png'});
 writeFileSync('marketing/exports/screenshots/'+name+'.png',Buffer.from(shot.data,'base64'));
}
const bot=await connectWire(origin,token);const lobby=await waitFor(()=>bot.messages.find(m=>m.type==='lobby'),'lobby');if(lobby.race||lobby.players.length!==1)throw Error('Empty lobby required');
const welcome=await waitFor(()=>bot.messages.find(m=>m.type==='welcome'),'welcome');let latest,seq=0;
try{
 bot.send({v:1,type:'character',character:2});bot.send({v:1,type:'track',track:0});bot.send({v:1,type:'laps',laps:1});
 timer=setInterval(()=>{const state=bot.messages.filter(m=>m.type==='lobby').at(-1);if(state)latest=state;bot.messages.length=0;
 const c=latest?.race?.cars.find(c=>c.id===welcome.playerId);let steering=0;if(c){const a=Math.atan2(c.aimY-c.y,c.aimX-c.x)-c.heading;steering=Math.max(-1,Math.min(1,Math.atan2(Math.sin(a),Math.cos(a))*2));}
 bot.send({v:1,type:'input',seq:seq++,steering,active:true,synthetic:true});if(!latest?.race&&!latest?.players.find(p=>p.id===welcome.playerId)?.ready)bot.send({v:1,type:'ready',ready:true});},40);
 await call('Page.enable');await call('Page.bringToFront');await call('Emulation.setFocusEmulationEnabled',{enabled:true});await call('Emulation.setDeviceMetricsOverride',{width:480,height:900,deviceScaleFactor:1,mobile:true});
 injection=await call('Page.addScriptToEvaluateOnNewDocument',{source:`
 localStorage.setItem('tiny-racers-language','en');
 Object.defineProperty(window,'DeviceMotionEvent',{configurable:true,value:class {static async requestPermission(){return 'granted';}}});
 const OriginalWebSocket=window.WebSocket;window.WebSocket=class extends OriginalWebSocket{send(raw){let m=JSON.parse(raw);if(m.type==='input')m.synthetic=true;super.send(JSON.stringify(m));}};
 setInterval(()=>{const e=new Event('devicemotion');Object.defineProperty(e,'accelerationIncludingGravity',{value:{x:0,y:0,z:9.8}});Object.defineProperty(e,'rotationRate',{value:{alpha:0,beta:0,gamma:0}});dispatchEvent(e);},16);
 `});
 await call('Page.navigate',{url:origin+'/#token='+token});await call('Page.reload',{ignoreCache:true});await wait(1000);
 mkdirSync('.local/recordings/controller-frames',{recursive:true});recording=true;const start=Date.now();
 capture=(async()=>{while(recording){const t=(Date.now()-start)/1000;const r=await call('Page.captureScreenshot',{format:'jpeg',quality:88});const file=`controller-frames/${String(frames.length).padStart(5,'0')}.jpg`;writeFileSync('.local/recordings/'+file,Buffer.from(r.data,'base64'));frames.push({t,file});await wait(90);}})();
 const act=async(seconds,expression)=>{await wait(Math.max(0,start+seconds*1000-Date.now()));await evaluate(expression);};
 await act(4,`document.getElementById('connect').click()`);
 await act(8,`document.getElementById('track-picker').scrollIntoView({behavior:'smooth',block:'start'})`);
 await act(13,`document.querySelector('[data-track="2"]').click()`);
 await act(16,`document.querySelector('[data-laps="2"]').click()`);
 await act(19,`document.querySelector('[data-track="0"]').click();document.querySelector('[data-laps="1"]').click();document.getElementById('ready').scrollIntoView({behavior:'smooth',block:'center'})`);
 await act(24,`document.getElementById('ready').click()`);
 await act(28,`(()=>{if(document.getElementById('straight-dialog').open)throw Error('Calibration did not finish; visibility='+document.visibilityState)})()`);
 await still('controller-ready');
 await act(30,`document.getElementById('start').click()`);
 await act(33,`(()=>{if(!document.body.classList.contains('racing'))throw Error('Race did not start')})()`);
 await act(39,`document.getElementById('options-button').click()`);
 await act(44,`document.getElementById('sensitivity').scrollIntoView({behavior:'smooth',block:'center'})`);
 await still('controller-options');
 await act(48,`document.getElementById('sensitivity').value='80';document.getElementById('sensitivity').dispatchEvent(new Event('input'))`);
 await act(52,`document.getElementById('sensitivity').value='50';document.getElementById('sensitivity').dispatchEvent(new Event('input'))`);
 await wait(Math.max(0,start+58000-Date.now()));recording=false;await capture;
 let concat='';for(let i=0;i<frames.length;i++){concat+=`file '${frames[i].file}'\nduration ${((frames[i+1]?.t??58)-frames[i].t).toFixed(4)}\n`;}concat+=`file '${frames.at(-1).file}'\n`;writeFileSync('.local/recordings/controller.ffconcat',concat);
 console.log('Captured real controller UI, synthetic motion; '+frames.length+' frames.');
}finally{
 recording=false;if(capture)await capture;clearInterval(timer);bot.send({v:1,type:'lobby'});await wait(200);
 try { await evaluate(`document.getElementById('leave').click()`);
 if(injection)await call('Page.removeScriptToEvaluateOnNewDocument',{identifier:injection.identifier});
 await call('Emulation.clearDeviceMetricsOverride');await call('Page.navigate',{url:origin+'/'}); } catch {}
 ws.close();bot.send({v:1,type:'leave'});await wait(100);await bot.close();
}
