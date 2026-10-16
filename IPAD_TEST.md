# Phone/tablet setup and motion test

The first phone tests passed. For the multiplayer race, follow the play steps in
[README.md](README.md). Use this guide to set up another device or record diagnostics.

The Mac side is ready. The current setup page is **http://192.168.178.188:8081**.
Keep the Mac awake and connect the iPad to the same Wi-Fi. This is a developer
experiment: Safari → local HTTPS/WSS on Mac → ADB → Android TV emulator.
It does not yet prove standalone Fire TV hosting or setup-free consumer pairing.

## Do this on the iPad

1. Open the setup page in Safari and download the **Tiny Racers Development CA**
   certificate. Compare its SHA-256 fingerprint with the one below.
2. Install the downloaded profile in **Settings → General → VPN & Device
   Management** (or the **Profile Downloaded** shortcut).
3. In **Settings → General → About → Certificate Trust Settings**, enable full
   trust for **Tiny Racers Development CA**. Apple requires this separate trust
   step for manually installed certificates ([Apple instructions](https://support.apple.com/en-us/102390)).
4. Open **https://192.168.178.188:8443** in Safari. It must load without a
   certificate warning. If it does not, stop here and tell me the exact message.
5. Enter the eight-character token visible in the TV emulator and tap **Connect
   to TV**. Leave **Developer test sweep** off.
6. Turn on Rotation Lock. Choose a racer, tap **Ready!**, allow motion if asked,
   and hold your device upright and straight for two seconds. Calibration and
   readiness happen automatically. See FAMILY_PLAYTEST.md for tonight's flow.
7. Turn left/right. Your racer on the emulator should respond. Try **Invert
   steering** if the direction is reversed. If no sensor readings appear, select
   the matching observation and save the report anyway.
8. Select what happened and tap **Save report to Mac**. Tell me when it is saved;
   I can read the report directly from `.local/reports/`.

Fingerprint for this workspace's current development CA:

```text
35:29:8F:38:4C:24:2B:93:87:8F:F3:67:CF:BC:77:C7:85:D8:8C:F1:BB:1B:73:B4:73:6A:39:07:01:C3:C9:EA
```

Trusting a root CA allows certificates signed by its private key. The key stays
in `.local/tls/` on this Mac and is never served. Only use this temporary CA for
this test. After testing, remove its profile in **VPN & Device Management**.
The setup does not install trust automatically, change Wi-Fi settings, enroll
the device in management, or send data to a cloud service.

## If the first test works

- Hold still, reset measurements, wait ten seconds and save a stationary report.
- Steer for a minute and save another report. Rate should be around 25 network
  inputs/second; sensor rate can differ.
- If you change your normal grip, use Pause → Set straight ahead and test direction.
- Background Safari, reopen, reconnect and recalibrate. The TV should center
  while disconnected. Save another report if recovery fails.

These observations are necessary before calling motion control validated. A
synthetic sweep or desktop test cannot validate the iPad's sensor/permission UX.
Do not start racing features on the basis of the emulator networking checks alone.

## Restarting later

If the services have stopped, from this workspace run:

```sh
./scripts/run-spike.sh
```

This builds/installs the host, starts the existing TV AVD if needed, forwards the
socket, and serves the controller. The printed address takes precedence if your
Mac's IP changed. For Ethernet or a different interface, pass its IPv4 address:
`./scripts/run-spike.sh 192.168.x.x`.

The script expects free ports 8080, 8081 and 8443; it will not kill another
process using them. Stop an earlier run with Ctrl+C before starting another.
If the setup page cannot be reached, check that both devices share the same LAN
and tell me what Safari displays; guest networks may isolate clients.

The server certificate lasts seven days and is renewed by the launcher as needed
under the same CA. The development CA lasts thirty days. On CA expiry, stop the
bridges, remove the old iPad profile, rename `.local/tls/`, rerun setup and install
the newly generated CA. On regeneration, use the new fingerprint printed in the
terminal and `.local/tls/config.json`, replacing the fingerprint above.
Do not disable certificate verification to get past errors.
