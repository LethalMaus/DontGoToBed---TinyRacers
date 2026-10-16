# Certificate-free controller mode — 16 October 2026

An optional Cloudflare Quick Tunnel provides trusted HTTPS/WSS for the existing
Mac-to-TV bridge. Players scan the TV QR and allow browser motion permission;
they do not install the local CA certificate. Rotation lock is still recommended.
The Mac and an internet connection are still required. This is not standalone
TV networking, and the temporary URL is not a permanent judge-hosting endpoint.

## Start

1. Install Cloudflare's official `cloudflared` binary. Set `CLOUDFLARED` to its
   absolute path, or put it in `.local/bin/cloudflared`.
2. Claim the dedicated TV through ATC, then build/install the current APK and
   forward the game port:
   ```sh
   atc claim --android --type tv
   atc exec -- adb install -r android-host/app/build/outputs/apk/debug/app-debug.apk
   atc exec -- adb forward tcp:8765 tcp:8765
   ```
3. In a separate terminal, run `node spike/tunnel.mjs` and leave it running.
   It prints a temporary `https://…trycloudflare.com` origin and saves it to
   `.local/tunnel-origin`. Only allowlisted controller assets and the fixed game
   WebSocket are served; `.jc`, recordings, certificates and repository files
   are not exposed. Diagnostic upload is disabled on this endpoint.
4. Restart the TV with that exact origin:
   ```sh
   atc exec -- adb shell am force-stop dev.jamescullimore.tinyracers.spike
   atc exec -- adb shell am start -W -n dev.jamescullimore.tinyracers.spike/.SpikeActivity --es controllerOrigin "$(cat .local/tunnel-origin)"
   atc free
   ```
5. Scan the new TV QR. No certificate installation or browser security bypass.
   Stop the tunnel with Ctrl+C when finished. Restarting it changes the URL;
   restart the TV with the new origin and scan its new QR again.

## Verified here

Current APK build/lint and all 24 Node tests passed. Chrome recognised the public
page as a secure context with normal certificate validation. A two-controller
integration test joined, started a race and reconnected to the same slot. Twelve
ping samples measured 52 ms median and 86 ms p95 from this Mac through the public
endpoint. These are network round trips, not physical motion-to-screen latency.
The owner subsequently confirmed that the connection worked without trouble in
Chrome on a phone. Safari requested motion permission and the website needed
parental approval; after those approvals the owner reported that it worked well.
Exact device models and Safari device type were not recorded. The previous local
TLS setup remains available as a fallback.

Cloudflare documents Quick Tunnels as development-only, without an uptime
promise, and with a new hostname per launch:
https://developers.cloudflare.com/tunnel/get-started/quick-tunnels/
Cloudflared is an optional external tool; this checkout does not redistribute it.
