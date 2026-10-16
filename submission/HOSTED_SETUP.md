# Certificate-free standalone connection

1. Install `artifacts/tiny-racers-0.2.0-hackathon.apk` on the Android TV emulator
   or compatible TV. Testing so far is on the emulator, not physical Fire TV.
2. Open Tiny Racers normally. Wait for **ONLINE** beside the QR code.
3. Scan that QR with each phone/tablet. The address starts with
   `https://tiny-racers.tiny-racers-relay.workers.dev/`.
4. Connect, choose your character, lock screen rotation and tap Ready. Allow motion
   access if asked, then hold the device straight for calibration.
5. Choose a track, laps and optional bots, then start the race.

Both TV and controllers require internet. No Mac bridge, ADB forwarding or custom
certificate is required. Safari motion permission and adult website approval for
restricted devices remain normal platform requirements. A new app launch gets a
new room; scan the current QR rather than reusing a previous session link.

If the TV stays on Connecting, check internet and its date/time. A suspended test
emulator can have an old clock, causing valid HTTPS certificates to be rejected.
Keep TLS validation enabled and correct the clock.

The account uses Workers Free with a shared daily allowance; this is suitable for
the hackathon and limited family use. See [relay operation and limits](../relay/README.md).

Validation on 16 October 2026: hosted authentication/origin/room-isolation/limit
checks passed; TV emulator started a two-controller race and preserved a player
slot after reconnect with ADB forwarding removed. Twelve network echo samples:
median 43 ms, p95 86 ms. These are synthetic test inputs and network round trips,
not physical steering latency. James subsequently confirmed Android Chrome and
iPad Safari both working with the hosted controller on 16 October. Exact device
models, OS versions and specific recovery results were not recorded.

Final four-controller check also passed, including reconnect and a further 30 seconds
of active input with all controllers connected. Twelve echo samples in that run:
median 56 ms, p95 107 ms. Chrome confirmed a secure context, parsed the 32-character
QR room identifier and enabled Ready after joining.
