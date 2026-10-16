import http from 'node:http';
import https from 'node:https';
import net from 'node:net';
import { readFileSync, mkdirSync, writeFileSync } from 'node:fs';
import { randomUUID } from 'node:crypto';
import { join } from 'node:path';
import { pathToFileURL, fileURLToPath } from 'node:url';

const routes = new Map([
  ['/i18n.mjs', ['i18n.mjs', 'text/javascript; charset=utf-8']],
  ['/locales.mjs', ['locales.mjs', 'text/javascript; charset=utf-8']],
  ['/assets/leo_front.png', ['assets/leo_front.png', 'image/png']],
  ['/assets/ian_front.png', ['assets/ian_front.png', 'image/png']],
  ['/assets/papa_front.png', ['assets/papa_front.png', 'image/png']],
  ['/assets/mammy.png', ['assets/mammy.png', 'image/png']],
  ['/', ['index.html', 'text/html; charset=utf-8']],
  ['/controller.mjs', ['controller.mjs', 'text/javascript; charset=utf-8']],
  ['/motion.mjs', ['motion.mjs', 'text/javascript; charset=utf-8']],
  ['/transport.mjs', ['transport.mjs', 'text/javascript; charset=utf-8']],
]);

// Development bridge: fixed loopback upstream, never an arbitrary proxy.
export function createBridge({ origin, tls, upstreamPort = 8765, reportDirectory, tunnelOrigin }) {
  const expected = new URL(origin);
  if (expected.protocol !== (tls ? 'https:' : 'http:')) throw Error('Origin and TLS mode disagree');
  // A tunnel may terminate public TLS, but the origin listener stays loopback-only.
  // Never infer this authority from forwarded request headers.
  const browser = tunnelOrigin ? new URL(tunnelOrigin) : expected;
  if (tunnelOrigin && (tls || expected.hostname !== 'localhost' || expected.protocol !== 'http:' ||
      browser.protocol !== 'https:' || browser.username || browser.password || browser.pathname !== '/' || browser.search || browser.hash)) {
    throw Error('Tunnel requires a loopback HTTP origin and an explicit HTTPS browser origin');
  }
  const sockets = new Set();
  const handler = (req, res) => {
    if (req.headers.host !== expected.host) { res.writeHead(421); res.end(); return; }
    if (req.method === 'POST' && req.url === '/report' && reportDirectory) {
      if (req.headers.origin !== browser.origin || req.headers['content-type'] !== 'application/json') {
        res.writeHead(403); res.end(); return;
      }
      let body = '', size = 0, rejected = false;
      req.on('data', chunk => {
        if (rejected) return;
        size += chunk.length;
        if (size > 65536) { rejected = true; body = ''; res.writeHead(413); res.end(); req.destroy(); return; }
        body += chunk;
      });
      req.on('end', () => {
        if (rejected) return;
        try {
          const data = JSON.parse(body);
          if (data.stage !== 'motion-and-emulator-bridge-spike' || typeof data.capabilities?.secureContext !== 'boolean') throw Error('Invalid diagnostic');
          data.hardwareMilestoneValidated = false;
          data.receivedAt = new Date().toISOString();
          mkdirSync(reportDirectory, { recursive: true, mode: 0o700 });
          const filename = `motion-${Date.now()}-${randomUUID().slice(0, 8)}.json`;
          writeFileSync(join(reportDirectory, filename), JSON.stringify(data, null, 2), { mode: 0o600 });
          res.writeHead(201, { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' }); res.end(JSON.stringify({ filename }));
        } catch { res.writeHead(400); res.end('Invalid diagnostic'); }
      });
      return;
    }
    const route = routes.get(req.url);
    if (req.method !== 'GET' || !route) { res.writeHead(404); res.end(); return; }
    res.writeHead(200, {
      'Content-Type': route[1], 'Cache-Control': 'no-store',
      'X-Content-Type-Options': 'nosniff', 'Referrer-Policy': 'no-referrer',
      'Content-Security-Policy': `default-src 'self'; connect-src 'self' ${browser.origin.replace(/^http/, 'ws')}; style-src 'self' 'unsafe-inline'; frame-ancestors 'none'`,
      'Permissions-Policy': 'accelerometer=(self), gyroscope=(self)',
    });
    res.end(readFileSync(new URL(route[0], import.meta.url)));
  };
  const server = tls ? https.createServer({ ...tls, minVersion: 'TLSv1.2' }, handler) : http.createServer(handler);
  server.headersTimeout = 5000; server.requestTimeout = 10000;
  server.on('upgrade', (req, client, head) => {
    const key = req.headers['sec-websocket-key'];
    if (req.method !== 'GET' || req.headers.host !== expected.host || req.headers.origin !== browser.origin ||
        !/^\/input\?token=[0-9a-f]{8}(?:&resume=[0-9a-f-]{36})?$/.test(req.url || '') ||
        req.headers.upgrade?.toLowerCase() !== 'websocket' || req.headers['sec-websocket-version'] !== '13' ||
        typeof key !== 'string' || !/^[A-Za-z0-9+/]{22}==$/.test(key)) {
      client.end('HTTP/1.1 403 Forbidden\r\nConnection: close\r\nContent-Length: 0\r\n\r\n'); return;
    }
    if (sockets.size >= 16) { client.destroy(); return; }
    const upstream = net.connect({ host: '127.0.0.1', port: upstreamPort });
    sockets.add(client); sockets.add(upstream);
    let connected = false;
    const deadline = setTimeout(() => { client.destroy(); upstream.destroy(); }, 3000);
    client.setNoDelay(true); upstream.setNoDelay(true);
    const close = () => { clearTimeout(deadline); client.destroy(); upstream.destroy(); sockets.delete(client); sockets.delete(upstream); };
    client.on('error', close); client.on('close', close);
    upstream.on('error', () => {
      if (!connected) client.end('HTTP/1.1 502 Bad Gateway\r\nConnection: close\r\nContent-Length: 0\r\n\r\n');
      else client.destroy();
      clearTimeout(deadline); upstream.destroy();
    });
    upstream.on('close', () => client.end());
    upstream.on('connect', () => {
      connected = true; clearTimeout(deadline);
      // Origin was validated above. The emulator host accepts its loopback
      // harness origin; never forward unchecked browser headers.
      upstream.write(`GET ${req.url} HTTP/1.1\r\nHost: localhost:8765\r\nUpgrade: websocket\r\nConnection: Upgrade\r\nSec-WebSocket-Version: 13\r\nSec-WebSocket-Key: ${key}\r\nOrigin: http://localhost:8080\r\n\r\n`);
      if (head.length) upstream.write(head);
      client.pipe(upstream).pipe(client);
    });
  });
  server.closeBridge = () => { for (const socket of sockets) socket.destroy(); server.closeAllConnections(); return new Promise(resolve => server.close(resolve)); };
  return server;
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  if (!!process.env.TLS_CERT !== !!process.env.TLS_KEY) throw Error('Set both TLS_CERT and TLS_KEY');
  const tls = process.env.TLS_CERT ? { cert: readFileSync(process.env.TLS_CERT), key: readFileSync(process.env.TLS_KEY) } : undefined;
  const port = Number(process.env.PORT || (tls ? 8443 : 8080));
  const origin = process.env.PUBLIC_ORIGIN || `${tls ? 'https' : 'http'}://localhost:${port}`;
  if (!tls && process.env.HOST && process.env.HOST !== '127.0.0.1') throw Error('LAN binding requires TLS. Use npm run lan.');
  const server = createBridge({ origin, tls, reportDirectory: fileURLToPath(new URL('../.local/reports/', import.meta.url)) });
  server.on('error', error => { console.error(error.message); process.exitCode = 1; });
  server.listen(port, process.env.HOST || '127.0.0.1', () => {
    console.log(`Controller: ${origin}`);
    console.log('Development bridge: browser → Mac → ADB → TV emulator. Not standalone Fire TV hosting.');
  });
  for (const signal of ['SIGINT', 'SIGTERM']) process.on(signal, () => server.closeBridge().then(() => process.exit()));
}
