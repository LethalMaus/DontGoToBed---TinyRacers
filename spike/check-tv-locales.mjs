// Run only in an empty lobby. Uses one temporary controller, never starts a race.
import assert from 'node:assert/strict';
import {connectWire,waitFor} from './wire-client.mjs';
const token=process.argv[2];assert.match(token??'',/^[0-9a-f]{8}$/);
const client=await connectWire('http://localhost:8080',token);
const latest=()=>client.messages.filter(m=>m.type==='lobby').at(-1);
try{
 const state=await waitFor(latest,'lobby');assert.ok(!state.race&&state.players.length===1,'Only run in an empty lobby');
 for(const language of ['en','de','fr','es','it','pt','nl','pl']){
  client.send({v:1,type:'language',language});await waitFor(()=>latest()?.language===language,'language '+language);
 }
 client.send({v:1,type:'language',language:process.argv[3]??state.language});
 await waitFor(()=>latest()?.language===(process.argv[3]??state.language),'restore language');
 console.log('PASS all eight TV languages accepted and broadcast; no race started.');
}finally{client.send({v:1,type:'leave'});await waitFor(()=>client.closed,'leave');}
