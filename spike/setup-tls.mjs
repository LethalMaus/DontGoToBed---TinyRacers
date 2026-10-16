import { execFileSync } from 'node:child_process';
import { mkdirSync, writeFileSync, existsSync, readFileSync, chmodSync } from 'node:fs';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { isIP } from 'node:net';

// Generates credentials only. Never changes macOS/iPad trust settings.
export function setupTLS(ip, directory = fileURLToPath(new URL('../.local/tls/', import.meta.url))) {
  if (isIP(ip) !== 4 || ip.startsWith('127.') || ip === '0.0.0.0') throw Error('Pass the Mac LAN IPv4 address');
  mkdirSync(directory, { recursive: true, mode: 0o700 }); chmodSync(directory, 0o700);
  const file = name => resolve(directory, name);
  const openssl = args => execFileSync('openssl', args, { cwd: directory, stdio: ['ignore', 'pipe', 'pipe'] }).toString();
  if (!existsSync(file('ca.pem'))) {
    openssl(['req', '-x509', '-newkey', 'rsa:2048', '-nodes', '-sha256', '-days', '30',
      '-subj', '/CN=Tiny Racers Development CA', '-keyout', 'ca.key', '-out', 'ca.pem',
      '-addext', 'basicConstraints=critical,CA:TRUE,pathlen:0', '-addext', 'keyUsage=critical,keyCertSign,cRLSign']);
    chmodSync(file('ca.key'), 0o600);
  }
  openssl(['x509', '-in', 'ca.pem', '-checkend', '86400', '-noout']);
  let renew = !existsSync(file('server.pem')) || !existsSync(file('config.json')) || JSON.parse(readFileSync(file('config.json'))).ip !== ip;
  if (!renew) { try { openssl(['x509', '-in', 'server.pem', '-checkend', '86400', '-noout']); } catch { renew = true; } }
  if (renew) {
    writeFileSync(file('server.ext'), `basicConstraints=critical,CA:FALSE\nkeyUsage=critical,digitalSignature,keyEncipherment\nextendedKeyUsage=serverAuth\nsubjectAltName=IP:${ip},IP:127.0.0.1,DNS:localhost\n`);
    openssl(['req', '-new', '-newkey', 'rsa:2048', '-nodes', '-sha256', '-subj', '/CN=Tiny Racers LAN Test', '-keyout', 'server.key', '-out', 'server.csr']);
    chmodSync(file('server.key'), 0o600);
    openssl(['x509', '-req', '-in', 'server.csr', '-CA', 'ca.pem', '-CAkey', 'ca.key', '-CAcreateserial', '-days', '7', '-sha256', '-extfile', 'server.ext', '-out', 'server.pem']);
  }
  openssl(['verify', '-CAfile', 'ca.pem', '-verify_ip', ip, 'server.pem']);
  openssl(['x509', '-in', 'ca.pem', '-outform', 'DER', '-out', 'tiny-racers-ca.cer']);
  const fingerprint = openssl(['x509', '-in', 'ca.pem', '-noout', '-fingerprint', '-sha256']).trim();
  const config = { ip, origin: `https://${ip}:8443`, setupURL: `http://${ip}:8081`, fingerprint };
  writeFileSync(file('config.json'), JSON.stringify(config, null, 2));
  console.log(JSON.stringify(config, null, 2));
  return { ...config, directory };
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) setupTLS(process.argv[2]);
