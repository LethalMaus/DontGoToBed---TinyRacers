import {writeFileSync,mkdirSync} from 'node:fs';
const tabs=await(await fetch('http://localhost:9225/json/list')).json();
const tab=tabs.find(t=>t.type==='page');const ws=new WebSocket(tab.webSocketDebuggerUrl);await new Promise(r=>ws.onopen=r);
let id=0;const pending=new Map();ws.onmessage=e=>{const m=JSON.parse(e.data);pending.get(m.id)?.(m);pending.delete(m.id);};
async function call(method,params={}){const n=++id,p=new Promise(r=>pending.set(n,r));ws.send(JSON.stringify({id:n,method,params}));const m=await p;if(m.error||m.result?.exceptionDetails)throw Error(JSON.stringify(m));return m.result;}
mkdirSync('marketing/exports/artwork',{recursive:true});
try{
 await call('Page.enable');
 await call('Page.bringToFront');
 const variants=[['youtube-trailer',1280,720,'trailer'],['youtube-tutorial',1280,720,'tutorial'],['youtube-hackathon',1280,720,'hackathon'],['social-square',1080,1080,'trailer'],['social-story',1080,1920,'trailer'],['feature-graphic',1024,500,'trailer'],['social-landscape',1200,630,'trailer']];
 for(const card of ['trailer','tutorial','hackathon','connect','ready','rules','finish','setup','options','credits','architecture'])variants.push(['card-'+card,1920,1080,card]);
 for(const [name,width,height,card] of variants){
  if(process.argv.length>2&&!process.argv.slice(2).includes(name))continue;
  await call('Emulation.setDeviceMetricsOverride',{width,height,deviceScaleFactor:1,mobile:false});
  await call('Page.navigate',{url:'http://127.0.0.1:8090/marketing/source/cards.html?card='+card});
  await new Promise(r=>setTimeout(r,450));await call('Runtime.evaluate',{expression:'Promise.all([...document.images].map(i=>i.decode().catch(()=>{})))',awaitPromise:true});
  const shot=await call('Page.captureScreenshot',{format:'png'});writeFileSync('marketing/exports/artwork/'+name+'.png',Buffer.from(shot.data,'base64'));
 }
}finally{await call('Emulation.clearDeviceMetricsOverride');await call('Page.navigate',{url:'http://localhost:8080/'});ws.close();}
console.log(process.argv.length>2?'Exported selected branded graphics.':'Exported 18 branded graphics.');
