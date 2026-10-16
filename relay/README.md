# Hosted controller and relay

Controller: https://tiny-racers.tiny-racers-relay.workers.dev

The TV opens an outbound TLS WebSocket. A Cloudflare Durable Object routes each
phone to a loopback adapter inside the TV app, retaining the existing authoritative
game protocol. The Mac, certificate installation and ADB forwarding are unnecessary
for gameplay. An emulator still runs on its computer. Internet is required.

## Deploy and test

Use a Cloudflare **Workers Free** account. Do not enable Workers Paid for this setup.

```sh
cd relay
npm ci
npx wrangler login
npm test
npm run deploy
node check-relay.mjs https://tiny-racers.tiny-racers-relay.workers.dev
```

The SQLite-backed Durable Object migration is compatible with Workers Free. Only
the explicit controller asset allowlist is uploaded. `public/` is generated and
ignored; no `.jc`, diagnostics, credentials, audio masters or source repository is
published. Wrangler stores deployment credentials outside the project.

`npm run dev` starts a local runtime. On Wrangler 4.151.1 the local protocol check
times out waiting for peer close handshakes after host loss; the same full check
passes against the deployed service. Do not claim the local integration test passes.

## Limits and cost

Checked 16 October 2026; owner confirmed Workers Free in the dashboard.
This is not a timed trial. Free quotas can change and this is not an uptime guarantee.
The free Durable Objects allocation is 100,000 requests/day and 13,000 GB-s/day.
Incoming WebSocket messages count at 20:1 for request billing. Outgoing messages
are not metered as requests. Exceeding a free quota fails operations until reset
(00:00 UTC), rather than enabling paid overages.

Estimate with four active human controllers: 4 × (25 inputs + 1 application ping)
plus 4 × (4 lobby updates + 1 pong) = 124 incoming messages/second at the relay.
That is around 22,320 metered requests per room-hour, before joins, commands and
other traffic: approximately 4.5 hours/day, with **4 hours** a practical planning
estimate. All simultaneous rooms share the account allowance. Bots generate no
controller traffic. This is a protocol estimate, not a measured billing result.

Idle connected controllers also consume quota; close controller tabs and the game
when finished. No-controller rooms send no application messages. Hibernation
avoids charging idle resident time. Room alarms clear state after four hours;
clients reconnect, and the TV can open another session.

This fits hackathon/small-family use, not unrestricted public multiplayer.
Longer-term work: investigate WebRTC data channels for direct TV/controller traffic,
using the hosted service for connection establishment. Some networks need TURN
relay fallback, so zero-cost operation at arbitrary scale is not promised.

Sources:
- https://developers.cloudflare.com/durable-objects/platform/pricing/
- https://developers.cloudflare.com/workers/platform/limits/
- https://developers.cloudflare.com/workers/configuration/routing/workers-dev/

## Security and privacy

- HTTPS/WSS with standard certificate and hostname verification. No TLS bypass.
- Per-launch 256-bit host secret; public room identifier is a 128-bit SHA-256 prefix.
  Knowing the room identifier permits joining but does not authenticate a host.
- Exact browser Origin validation, four controllers per room, controller message
  size/rate limits, host envelope limits, independent room objects.
- Host secrets stay in TV memory and are sent only as an encrypted authorisation header.
- No controller account, camera, microphone or location access. The relay forwards
  steering and game messages; it does not persist gameplay or diagnostic uploads.
  Cloudflare still processes connections and may retain infrastructure logs.
- No IP/global abuse prevention is claimed: public clients can create their own
  authenticated rooms, and malicious traffic could exhaust the free allowance.

To change deployment address, update the Android default relay origin and the
static CSP WebSocket origin together. The local development bridge remains usable
by supplying its `controllerOrigin` launch extra.
