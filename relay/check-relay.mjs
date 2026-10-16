// Live protocol/security test against a local Worker or the deployed relay.
import WebSocket from 'ws';
import assert from 'node:assert/strict';
import { randomBytes } from 'node:crypto';
import { roomForSecret } from './protocol.mjs';
import { waitFor } from '../spike/wire-client.mjs';
const origin = process.argv[2] || 'http://localhost:8787';
const sockets=[];
async function open(path, headers={}) {
  return new Promise((resolve,reject)=>{
    const ws=new WebSocket(origin.replace(/^http/,'ws')+path,{headers});sockets.push(ws);
    ws.messages=[];ws.on('message',data=>ws.messages.push(JSON.parse(data.toString())));
    ws.once('error',reject);ws.once('open',()=>resolve(ws));
  });
}
const send=(ws,message)=>ws.send(JSON.stringify(message));
const pause=ms=>new Promise(r=>setTimeout(r,ms));
try {
  const secret=randomBytes(32).toString('hex'),room=await roomForSecret(secret);
  await assert.rejects(open(`/host?token=${room}`,{Authorization:'Bearer '+'b'.repeat(64)}),/403/);
  const host=await open(`/host?token=${room}`,{Authorization:`Bearer ${secret}`});
  await waitFor(()=>host.messages.some(m=>m.type==='connected'),'host ready');
  await assert.rejects(open(`/input?token=${room}`,{Origin:'https://evil.example'}),/403/);
  await assert.rejects(open(`/input?token=${'0'.repeat(32)}`,{Origin:origin}),/404/);
  const peers=[];
  for(let i=0;i<4;i++)peers.push(await open(`/input?token=${room}`,{Origin:origin}));
  await assert.rejects(open(`/input?token=${room}`,{Origin:origin}),/429/);
  await waitFor(()=>host.messages.filter(m=>m.type==='open').length===4,'four peers');
  const id=host.messages.find(m=>m.type==='open').id;
  send(peers[0],{v:1,type:'ping',id:12});
  const input=await waitFor(()=>host.messages.find(m=>m.type==='message'),'forward input');
  assert.equal(input.id,id);assert.equal(JSON.parse(input.data).id,12);
  send(host,{type:'message',id,data:JSON.stringify({v:1,type:'pong',id:12})});
  await waitFor(()=>peers[0].messages.some(m=>m.type==='pong'),'forward response');
  assert.equal(peers[1].messages.length,0);
  peers[0].send('x'.repeat(513));
  await waitFor(()=>peers[0].readyState===WebSocket.CLOSED,'oversize closes');
  host.close(1000,"Test complete");await waitFor(()=>peers.slice(1).every(p=>p.readyState===WebSocket.CLOSED),'host loss closes players');
  await pause(100);
  const next=await open(`/host?token=${room}`,{Authorization:`Bearer ${secret}`});
  await waitFor(()=>next.messages.some(m=>m.type==='connected'),'host reconnect');
  const resume='a'.repeat(8)+'-aaaa-aaaa-aaaa-'+'a'.repeat(12);
  await open(`/input?token=${room}&resume=${resume}`,{Origin:origin});
  const joined=await waitFor(()=>next.messages.find(m=>m.type==='open'),'resume forwarded');assert.equal(joined.resume,resume);
  console.log(JSON.stringify({origin,hostAuthentication:true,originValidation:true,roomIsolation:true,fourPlayerLimit:true,bidirectionalRouting:true,oversizedInputRejected:true,hostReconnect:true,resumeForwarded:true}));
} finally {for(const ws of sockets)if(ws.readyState===WebSocket.OPEN)ws.close(1000,"Test complete");}
