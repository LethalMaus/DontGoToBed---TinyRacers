// Short, explicitly synthetic presentation demo. Run alongside demo-opponent.mjs.
import { connectWire, waitFor } from './wire-client.mjs';
const token=process.argv[2];
if(!/^[0-9a-f]{8}$/.test(token??''))throw Error('Usage: node demo-race.mjs TOKEN');
const peers=[];let latest,timer;
const wait=ms=>new Promise(r=>setTimeout(r,ms));
try {
  for(let i=0;i<3;i++){
    const client=await connectWire('http://localhost:8080',token);
    peers.push({client,seq:0,index:i});
    const welcome=await waitFor(()=>client.messages.find(m=>m.type==='welcome'),'demo welcome');
    peers[i].id=welcome.playerId;
    client.send({v:1,type:'character',character:[0,1,3][i]});
  }
  let roundStart=0,lastRound=0;
  timer=setInterval(()=>{
    for(const p of peers){
      const state=p.client.messages.filter(m=>m.type==='lobby').at(-1);if(state)latest=state;
      p.client.messages.length=0;
    }
    const race=latest?.race;
    if(race&&race.round!==lastRound){lastRound=race.round;roundStart=race.elapsed;console.log(`Demo round ${lastRound}`);}
    for(const p of peers){
      const car=race?.cars.find(c=>c.id===p.id);let steering=0;
      if(car){
        const error=Math.atan2(car.aimY-car.y,car.aimX-car.x)-car.heading;
        steering=Math.max(-1,Math.min(1,Math.atan2(Math.sin(error),Math.cos(error))*2));
        // Stagger deliberate driving mistakes to demonstrate off-screen elimination.
        if(race.elapsed-roundStart>5+p.index*3)steering=-.85;
        if(car.power&&!car.eliminated&&!race.roundBreak)p.client.send({v:1,type:'use'});
      }
      p.client.send({v:1,type:'input',seq:p.seq++,steering,active:true,synthetic:true});
      if(!race)p.client.send({v:1,type:'ready',ready:true});
    }
  },40);
  await waitFor(()=>latest?.allReady,'four ready demo drivers',6000);
  if(latest.players.some(p=>p.connected&&!p.synthetic))throw Error('A human controller is connected; leaving automatic start to the user.');
  console.log('Four-driver demo starts in 5 seconds and runs for 50 seconds.');
  await wait(5000);peers[0].client.send({v:1,type:'start'});
  await wait(50000);
} finally {
  clearInterval(timer);
  peers[0]?.client.send({v:1,type:'lobby'});
  await wait(200);
  for(const p of peers){if(!p.client.closed){p.client.send({v:1,type:'leave'});await wait(100);await p.client.close();}}
  console.log('Demo finished. Back in the lobby; Daddy test opponent remains ready.');
}
