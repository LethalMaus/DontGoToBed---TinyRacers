# Controller development notes
Current player/setup instructions are in ../FAMILY_PLAYTEST.md and ../JUDGE_SETUP.md.
The notes below document the earlier spike; old separate calibration steps and
room URLs are historical. Current flow is Connect -> choose -> Ready -> hold straight.
Do not use synthetic input as evidence of physical iPad testing.

# Motion preflight

Browser motion controller, diagnostic and local bridge for the multiplayer race
prototype in `../android-host/`. Real iPhone motion has been measured; physical
iPad/Fire TV testing remains distinct. See the root README for racing instructions.
See [TV host setup](../android-host/README.md) and [hosted controller setup](../submission/HOSTED_SETUP.md).

Requires Node 22+ and OpenSSL 3 for certificate setup. No npm packages to install.

```sh
cd spike
npm test
npm start
```

Open http://localhost:8080 for a desktop smoke check. For the iPad use the
[step-by-step setup guide](../IPAD_TEST.md). The complete launcher is
`../scripts/run-spike.sh`; to run only the secure bridge:

```sh
npm run lan -- 192.168.178.188
```

Replace the address with your Mac's LAN IPv4. Port 8081 serves instructions and
the public development CA certificate; port 8443 serves HTTPS and WSS. Keys stay
in ignored `.local/tls/`, with restricted permissions. No system trust is changed.
Plain LAN HTTP is not offered for the controller because Safari motion requires
a secure context. Do not interpret localhost success as iPad validation.

If you already have a certificate trusted by your iPad with a matching hostname
or IP subject alternative name, the same server supports a controlled TLS test:

```sh
HOST=192.168.178.188 PORT=8443 PUBLIC_ORIGIN=https://192.168.178.188:8443 \
TLS_CERT=/absolute/path/cert.pem TLS_KEY=/absolute/path/key.pem npm start
```

Open the matching HTTPS address. The server does not install certificates, alter
device trust, bypass warnings or expose TLS keys. Frictionless final onboarding
remains unresolved. Manual certificate trust would
only establish a developer experiment, not satisfy product onboarding.

Enable motion, hold the device comfortably and tilted upright, then tap **Set
straight ahead** and hold still for two seconds. A one-second settling delay
avoids calibrating the movement from tapping; a 600 ms stable sensor window sets
the neutral angle. Portrait and landscape grips are supported. Device Rotation
Lock keeps the page still; viewport rotation does not change the sensor frame or
discard neutral. Near-flat grips and sensor gaps pause steering while preserving
neutral. Backgrounding the page disconnects and clears calibration.

For noise, hold still and reset measurements for 10 seconds. Export JSON. Repeat
while steering and after background/resume. **Export diagnostic JSON** downloads
the full retained samples to the device. **Save report to Mac** sends a bounded
summary plus the latest 200 samples to the same local server, saved under
`.local/reports/`. Reports include browser version/origin and your observation;
there is no cloud upload. Saved evidence is never marked automatically validated.

## TV emulator experiment

Follow [host setup](../android-host/README.md), then open http://localhost:8080,
enter the displayed TV token, connect and enable **Developer test sweep**.
The TV rectangle should move at about 25 packets/second. This is synthetic input,
explicitly recorded in exported metrics. Turn off the sweep to send sensor input
if available; uncalibrated or stale sensors send neutral. Network metrics include
connection attempts, successes and local echo RTT. Automatic retries handle a
lost connection; explicit disconnect/backgrounding stops retries.

`node check-emulator.mjs TOKEN [ORIGIN]` automates 10 reconnects, automatic
recovery, and report saving using a Chrome test instance with remote debugging
on localhost:9225 and this page open. For a generated certificate, the isolated
test browser used a pin for that certificate only; it did not change device
trust and cannot validate Safari's trust/permission UX.
`node check-stale.mjs` pauses input for 600 ms with the socket open and captures
the TV for visual confirmation of neutral. These are optional developer checks;
ordinary use does not require Chrome remote debugging.

`node check-rotation.mjs` verifies stable-grip calibration, preserved neutral on
viewport rotation and sensor interruption, and phone layouts in a localhost
test browser. It injects synthetic motion and never connects to the TV.

**Historical single-controller harness (not compatible with current lobby slot semantics):**
`node check-host.mjs TOKEN [ORIGIN]` tested version/range/type/size rejection,
sequence replay, stale input on an open socket, single-controller isolation,
10 reconnects and 25 Hz delivery. `node check-soak.mjs TOKEN [ORIGIN] [SECONDS]`
checks sustained input (default 300 seconds). HTTPS checks use `.local/tls/ca.pem`
and validate the certificate chain and hostname; they never disable verification.
Reports are `.local/host-check.json` and `.local/soak-report.json`. These Node
clients use synthetic input, not real device sensors.

Record device/OS, permission prompts, grip, sign, rate, gaps and stationary
variation. Emulator RTT/reconnect results do not measure LAN reliability, Fire TV
performance or physical latency. Stop and review fallback options if the intended browser
origin fails; the brief requires approval before substituting a native controller.


## Current multiplayer checks

Use `check-multiplayer.mjs` and `check-race-browser.mjs` as documented in the root
README. Older single-controller reconnect/soak scripts are retained as historical
spike tools and may consume reserved slots; use the current checks instead.
`demo-opponent.mjs TOKEN` supplies one visibly labelled synthetic driver for
one-phone developer playtesting. It never starts a race or installs trust.
