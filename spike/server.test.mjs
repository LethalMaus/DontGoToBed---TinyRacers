import test from 'node:test';
import assert from 'node:assert/strict';
import http from 'node:http';
import net from 'node:net';
import { once } from 'node:events';
import { mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createBridge } from './server.mjs';

async function fixture(t) {
  const server = createBridge({ origin: 'http://localhost:8080' });
  server.listen(0, '127.0.0.1'); await once(server, 'listening');
  t.after(() => server.closeBridge());
  return server.address().port;
}
function request(port, path, headers = {}) {
  return new Promise((resolve, reject) => {
    http.get({ hostname: '127.0.0.1', port, path, headers: { Host: 'localhost:8080', ...headers } }, response => {
      let body = ''; response.on('data', chunk => body += chunk);
      response.on('end', () => resolve({ status: response.statusCode, headers: response.headers, body }));
    }).on('error', reject);
  });
}
test('serves controller with same-origin policy; does not expose keys or workspace', async t => {
  const port = await fixture(t);
  const page = await request(port, '/');
  assert.equal(page.status, 200);
  assert.match(page.headers['content-security-policy'], /ws:\/\/localhost:8080/);
  assert.match(page.body, /Enable motion/);
  for (const path of ['/../.local/tls/ca.key', '/server.mjs', '/ca.key', '/.git/config']) {
    assert.equal((await request(port, path)).status, 404);
  }
});
test('rejects foreign Host and Origin before reaching upstream', async t => {
  const port = await fixture(t);
  assert.equal((await request(port, '/', { Host: 'attacker.example' })).status, 421);
  for (const origin of ['http://attacker.example', 'null', 'https://localhost:8080']) {
    const response = await request(port, '/input?token=12345678', {
      Origin: origin, Connection: 'Upgrade', Upgrade: 'websocket',
      'Sec-WebSocket-Version': '13', 'Sec-WebSocket-Key': 'AAAAAAAAAAAAAAAAAAAAAA==',
    });
    assert.equal(response.status, 403);
  }
});
test('forwards only validated handshake to loopback and tears down both sockets', async t => {
  let resolveHeaders;
  const headers = new Promise(resolve => resolveHeaders = resolve);
  const upstream = net.createServer(socket => socket.once('data', data => {
    resolveHeaders(data.toString()); socket.end('HTTP/1.1 403 Forbidden\r\nContent-Length: 0\r\n\r\n');
  }));
  upstream.listen(0, '127.0.0.1'); await once(upstream, 'listening');
  t.after(() => new Promise(resolve => upstream.close(resolve)));
  const bridge = createBridge({ origin: 'http://localhost:8080', upstreamPort: upstream.address().port });
  bridge.listen(0, '127.0.0.1'); await once(bridge, 'listening'); t.after(() => bridge.closeBridge());
  await request(bridge.address().port, '/input?token=12345678', {
    Origin: 'http://localhost:8080', Connection: 'Upgrade', Upgrade: 'websocket',
    'Sec-WebSocket-Version': '13', 'Sec-WebSocket-Key': 'AAAAAAAAAAAAAAAAAAAAAA==',
    'Cookie': 'must-not-reach-upstream', 'Authorization': 'must-not-reach-upstream',
  });
  const raw = await headers;
  assert.match(raw, /^GET \/input\?token=12345678 HTTP\/1.1/);
  assert.match(raw, /Origin: http:\/\/localhost:8080/);
  assert.doesNotMatch(raw, /must-not-reach-upstream/);
});
test('rejects malformed resume credentials and extra upgrade parameters', async t => {
  const port = await fixture(t);
  for (const suffix of ['&resume=bad', '&resume=../secret', '&target=example.com', '&token=87654321']) {
    const response = await request(port, '/input?token=12345678' + suffix, {
      Origin: 'http://localhost:8080', Connection: 'Upgrade', Upgrade: 'websocket',
      'Sec-WebSocket-Version': '13', 'Sec-WebSocket-Key': 'AAAAAAAAAAAAAAAAAAAAAA==',
    });
    assert.equal(response.status, 403);
  }
});
test('saved evidence cannot claim automatic validation or choose a filename', async t => {
  const directory = mkdtempSync(join(tmpdir(), 'racers-report-'));
  const server = createBridge({ origin: 'http://localhost:8080', reportDirectory: directory });
  server.listen(0, '127.0.0.1'); await once(server, 'listening');
  t.after(async () => { await server.closeBridge(); rmSync(directory, { recursive: true }); });
  const save = async (body, origin = 'http://localhost:8080') => new Promise((resolve, reject) => {
    const req = http.request({ hostname: '127.0.0.1', port: server.address().port, path: '/report', method: 'POST',
      headers: { Host: 'localhost:8080', Origin: origin, 'Content-Type': 'application/json' } }, response => {
      let text = ''; response.on('data', chunk => text += chunk); response.on('end', () => resolve({ status: response.statusCode, body: text }));
    }); req.on('error', reject); req.end(JSON.stringify(body));
  });
  assert.equal((await save({}, 'http://foreign.example')).status, 403);
  assert.equal((await save({})).status, 400);
  const result = await save({ stage: 'motion-and-emulator-bridge-spike', capabilities: { secureContext: true }, hardwareMilestoneValidated: true, filename: '../escape' });
  assert.equal(result.status, 201);
  const filename = JSON.parse(result.body).filename;
  assert.match(filename, /^motion-[0-9]+-[0-9a-f-]+\.json$/);
  assert.equal(JSON.parse(readFileSync(join(directory, filename))).hardwareMilestoneValidated, false);
});

test('explicit HTTPS tunnel origin preserves host and browser origin checks', async t => {
  const server=createBridge({origin:'http://localhost:8082',tunnelOrigin:'https://demo.trycloudflare.com'});
  server.listen(0,'127.0.0.1');await once(server,'listening');t.after(()=>server.closeBridge());
  const port=server.address().port;
  const page=await request(port,'/',{Host:'localhost:8082'});
  assert.equal(page.status,200);
  assert.match(page.headers['content-security-policy'],/wss:\/\/demo\.trycloudflare\.com/);
  assert.equal((await request(port,'/',{Host:'attacker.example','X-Forwarded-Host':'localhost:8082'})).status,421);
  const rejected=await request(port,'/input?token=12345678',{Host:'localhost:8082',Origin:'https://attacker.example','X-Forwarded-Host':'demo.trycloudflare.com',Connection:'Upgrade',Upgrade:'websocket','Sec-WebSocket-Version':'13','Sec-WebSocket-Key':'AAAAAAAAAAAAAAAAAAAAAA=='});
  assert.equal(rejected.status,403);
  for(const bad of ['http://demo.trycloudflare.com','https://user:pass@demo.trycloudflare.com','https://demo.trycloudflare.com/path'])assert.throws(()=>createBridge({origin:'http://localhost:8082',tunnelOrigin:bad}));
  assert.throws(()=>createBridge({origin:'http://0.0.0.0:8082',tunnelOrigin:'https://demo.trycloudflare.com'}));
});
