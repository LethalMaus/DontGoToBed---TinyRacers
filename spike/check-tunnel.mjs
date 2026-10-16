import {connectWire,waitFor} from './wire-client.mjs';
const [origin,token,countArg]=process.argv.slice(2);
const playerCount=Number(countArg||2);if(![2,3,4].includes(playerCount))throw Error("Use 2–4 test players");
if(!/^https:\/\/(?:[a-z0-9-]+\.trycloudflare\.com|[a-z0-9-]+\.[a-z0-9-]+\.workers\.dev)$/.test(origin??'')||!/^(?:[0-9a-f]{8}|[0-9a-f]{32})$/.test(token??''))throw Error('HTTPS_TUNNEL TOKEN');
const peers=[];let timer;
const state=p=>p.client.messages.filter(m=>m.type==='lobby').at(-1);
try{
 for(let i=0;i<playerCount;i++){
  const client=await connectWire(origin,token);const welcome=await waitFor(()=>client.messages.find(m=>m.type==='welcome'),'welcome');
  const p={client,welcome,seq:0};peers.push(p);
  const lobby=await waitFor(()=>state(p),'lobby');if(i===0&&(lobby.race||lobby.players.length!==1))throw Error('Empty lobby required');
 }
 timer=setInterval(()=>{for(const p of peers)if(!p.client.closed)p.client.send({v:1,type:'input',seq:p.seq++,steering:.12,active:true,synthetic:true});},40);
 await new Promise(r=>setTimeout(r,400));for(const p of peers)p.client.send({v:1,type:'ready',ready:true});
 await waitFor(()=>state(peers[0])?.allReady,'ready');peers[0].client.send({v:1,type:'start'});
 await waitFor(()=>state(peers[0])?.race,'race');
 const rtts=[];for(let i=0;i<12;i++){rtts.push((await peers[0].client.ping(100+i)).rttMs);await new Promise(r=>setTimeout(r,150));}
 const p=peers[1],previous=p.welcome.playerId;await p.client.close();await new Promise(r=>setTimeout(r,500));
 p.client=await connectWire(origin,token,{resume:p.welcome.resume});p.seq=0;
 const welcome=await waitFor(()=>p.client.messages.find(m=>m.type==='welcome'),'reconnect');
 if(welcome.playerId!==previous)throw Error('Reconnect changed slot');
 await waitFor(()=>state(peers[0])?.players.filter(p=>p.connected).length===playerCount,'both reconnected');
 if(playerCount===4){await new Promise(r=>setTimeout(r,30000));if(peers.some(p=>p.client.closed))throw Error("Connection lost during four-player soak");}
 rtts.sort((a,b)=>a-b);
 console.log(JSON.stringify({https:true,players:playerCount,raceStarted:true,reconnectSameSlot:true,pingSamples:rtts.length,rttMedianMs:Math.round(rtts[6]),rttP95Ms:Math.round(rtts[11])}));
}finally{
 clearInterval(timer);
 peers[0]?.client.send({v:1,type:'lobby'});await new Promise(r=>setTimeout(r,200));
 for(const p of peers)if(!p.client.closed){p.client.send({v:1,type:'leave'});await new Promise(r=>setTimeout(r,100));await p.client.close();}
}
