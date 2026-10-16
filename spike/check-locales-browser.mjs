import assert from 'node:assert/strict';
import {writeFileSync} from 'node:fs';
const tabs=await(await fetch('http://localhost:9225/json/list')).json();
const tab=tabs.find(t=>t.url.startsWith('http://localhost:8080/'));
const ws=new WebSocket(tab.webSocketDebuggerUrl);await new Promise(r=>ws.onopen=r);
let id=0;const pending=new Map();ws.onmessage=e=>{const m=JSON.parse(e.data);pending.get(m.id)?.(m);pending.delete(m.id);};
async function call(method,params={}){const n=++id,p=new Promise(r=>pending.set(n,r));ws.send(JSON.stringify({id:n,method,params}));const m=await p;assert.ok(!m.error&&!m.result?.exceptionDetails,JSON.stringify(m));return m.result;}
async function evaluate(expression){return(await call('Runtime.evaluate',{expression,awaitPromise:true,returnByValue:true})).result.value;}
try{
 await call('Page.enable');await call('Page.navigate',{url:'http://localhost:8080/'});await new Promise(r=>setTimeout(r,700));
 const original=await evaluate(`localStorage.getItem('tiny-racers-language')`);
 for(const [width,height] of [[390,844],[844,390]]){
  await call('Emulation.setDeviceMetricsOverride',{width,height,deviceScaleFactor:1,mobile:true});
  const result=await evaluate(`(async()=>{
   const {catalog}=await import('./locales.mjs');const select=document.getElementById('language');
   for(const code of Object.keys(catalog)){
    select.value=code;select.dispatchEvent(new Event('change'));
    if(document.documentElement.lang!==code||document.getElementById('connect').textContent!==catalog[code]['Connect to TV'])throw Error('Language did not render '+code);
    if(document.documentElement.scrollWidth>innerWidth+1)throw Error('Horizontal overflow '+code);
    if(document.querySelectorAll('[data-track] svg path').length<3)throw Error('Lost maps');
   }
   select.value='de';select.dispatchEvent(new Event('change'));return true;
  })()`);assert.equal(result,true);
  const shot=await call('Page.captureScreenshot',{format:'png'});writeFileSync(new URL('../.local/controller-de-'+width+'.png',import.meta.url),Buffer.from(shot.data,'base64'));
 }
 await evaluate(`localStorage.${original===null?'removeItem(\'tiny-racers-language\')':`setItem('tiny-racers-language',${JSON.stringify(original)})`}`);
 console.log('PASS eight languages, regional fallbacks covered by unit tests; portrait/landscape switching, no horizontal overflow, maps preserved.');
}finally{await call('Emulation.clearDeviceMetricsOverride');await call('Page.navigate',{url:'http://localhost:8080/'});ws.close();}
