import http from 'node:http';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { setupTLS } from './setup-tls.mjs';
import { createBridge } from './server.mjs';

const config = setupTLS(process.argv[2]);
const tls = { cert: readFileSync(resolve(config.directory, 'server.pem')), key: readFileSync(resolve(config.directory, 'server.key')) };
const bridge = createBridge({ origin: config.origin, tls, reportDirectory: fileURLToPath(new URL('../.local/reports/', import.meta.url)) });
const certificate = readFileSync(resolve(config.directory, 'tiny-racers-ca.cer'));
const page = `<!doctype html><meta name="viewport" content="width=device-width,initial-scale=1"><title>Tiny Racers iPad setup</title>
<style>body{font:18px system-ui;max-width:700px;margin:40px auto;padding:20px;line-height:1.6}a,code{overflow-wrap:anywhere}</style>
<h1>Tiny Racers — iPad setup</h1><p>This temporary test uses your Mac to connect Safari to the TV emulator. No cloud service is involved.</p>
<ol><li><a href="/tiny-racers-ca.cer">Download the Tiny Racers development certificate</a>.</li>
<li>In Settings → General → VPN &amp; Device Management, install the downloaded certificate profile.</li>
<li>In Settings → General → About → Certificate Trust Settings, enable full trust for <strong>Tiny Racers Development CA</strong>.</li>
<li>Open <a href="${config.origin}">${config.origin}</a>. It must open without a certificate warning. Enter the token shown on the TV, connect and choose your racer. Tap <strong>Ready!</strong>, allow motion if asked, and hold the phone straight until the prompt disappears. Start once everyone is ready.</li></ol>
<p>Trusting this CA allows certificates it signs. Its private key stays in this workspace. Use it only for this development test, and remove the profile afterwards in VPN &amp; Device Management. No trust settings are changed automatically.</p>
<p>Compare this fingerprint with the one shown in the Mac terminal before trusting:</p><code>${config.fingerprint}</code>
<p>Keep the synthetic test sweep off when testing motion. Save a diagnostic report after testing.</p>
<p><a href="https://support.apple.com/en-us/102390">Apple's certificate trust instructions</a></p>`;
// HTTP serves ONLY instructions and the public certificate, never keys/controller.
const setup = http.createServer((req, res) => {
  if (req.headers.host !== `${config.ip}:8081` || req.method !== 'GET') { res.writeHead(404); res.end(); return; }
  if (req.url === '/tiny-racers-ca.cer') {
    res.writeHead(200, { 'Content-Type': 'application/x-x509-ca-cert', 'Cache-Control': 'no-store' }); res.end(certificate);
  } else if (req.url === '/') {
    res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8', 'Cache-Control': 'no-store', 'X-Content-Type-Options': 'nosniff' }); res.end(page);
  } else { res.writeHead(404); res.end(); }
});
for (const server of [setup, bridge]) server.on('error', error => { console.error(error.message); process.exit(1); });
bridge.listen(8443, config.ip, () => console.log(`Secure controller: ${config.origin}`));
setup.listen(8081, config.ip, () => console.log(`Open on iPad first: ${config.setupURL}`));
for (const signal of ['SIGINT', 'SIGTERM']) process.on(signal, async () => {
  setup.closeAllConnections(); setup.close(); await bridge.closeBridge(); process.exit();
});
