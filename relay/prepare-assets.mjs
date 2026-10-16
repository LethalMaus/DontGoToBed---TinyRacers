import { mkdir, rm, copyFile, writeFile } from 'node:fs/promises';
const target = new URL('./public/', import.meta.url);
await rm(target, { recursive: true, force: true });
await mkdir(new URL('assets/', target), { recursive: true });
// Explicit allowlist: never publish diagnostics, certificates, source recordings or the repository.
for (const file of ['index.html', 'controller.mjs', 'transport.mjs', 'motion.mjs', 'i18n.mjs', 'locales.mjs',
  'assets/leo_front.png', 'assets/ian_front.png', 'assets/papa_front.png', 'assets/mammy.png']) {
  await copyFile(new URL(`../spike/${file}`, import.meta.url), new URL(file, target));
}
await writeFile(new URL('_headers', target), `/*
  Cache-Control: no-cache
  X-Content-Type-Options: nosniff
  Referrer-Policy: no-referrer
  X-Frame-Options: DENY
  Content-Security-Policy: default-src 'self'; connect-src 'self' wss://tiny-racers.tiny-racers-relay.workers.dev; style-src 'self' 'unsafe-inline'; frame-ancestors 'none'; base-uri 'none'; form-action 'none'
  Permissions-Policy: accelerometer=(self), gyroscope=(self), camera=(), microphone=(), geolocation=()
`);
