# Tiny Racers — judge setup

One-to-four-player Android TV racing with Safari/Chrome motion controllers and optional bots.
Default path: phone → HTTPS/WSS Cloudflare relay → TV app.
Follow [hosted setup](submission/HOSTED_SETUP.md): install the APK, launch and scan
the TV QR. No Mac bridge, ADB forwarding or custom certificate is required.
Internet and available free relay quota are required. Physical Fire TV is untested.
The debug-signed APK is for judging/sideloading, not an Appstore release.

## Alternative development bridge

For the older temporary tunnel without installing an iPad certificate, see
[certificate-free setup](submission/CERTIFICATE_FREE_SETUP.md). This mode needs
internet and still uses the Mac bridge. The local-network-only path follows below.

## Local bridge requirements
Mac with JDK 17+, Node 22+, Python 3, OpenSSL and Android SDK platform 36,
platform-tools, emulator and an Android TV API 34 system image.
Apple Silicon was used here; match the image ABI to your computer.
One to four phones/tablets must share the Mac's Wi-Fi. Internet is needed for
initial SDK/Gradle downloads, not local racing afterwards.

## Fresh checkout / extracted source package
1. Set ANDROID_HOME, normally $HOME/Library/Android/sdk.
2. Restore audio from the supplied game APK. All nine hashes are verified before
   writing, with no dependency on the original Don't Go To Bed checkout:
   python3 scripts/prepare-audio.py --from-apk artifacts/tiny-racers-0.2.0-hackathon.apk
   Retain audio credits/terms. Code is MIT-licensed; asset/audio terms are separate. MP3s are not
   offered as standalone downloads.
3. Create the workspace-local AVD:
~~~sh
export ANDROID_HOME="$HOME/Library/Android/sdk"
mkdir -p .local/avd
"$ANDROID_HOME/cmdline-tools/latest/bin/sdkmanager"   "platform-tools" "platforms;android-36" "emulator"   "system-images;android-34;android-tv;arm64-v8a"
ANDROID_AVD_HOME="$PWD/.local/avd"   "$ANDROID_HOME/cmdline-tools/latest/bin/avdmanager" create avd   -n TinyRacersTV -k "system-images;android-34;android-tv;arm64-v8a"
~~~
Accept SDK licences if prompted. On Intel, use the supported x86_64 TV image.
A fresh standalone launch uses port 5560. An existing dedicated TV emulator can
be selected with ANDROID_SERIAL; the launcher remembers it in .local/playtest-serial.

4. Run python3 scripts/preflight.py. An absent certificate is expected before
   first launch. Run ./scripts/run-spike.sh YOUR_MAC_LAN_IPV4.
5. Keep the Terminal open. It builds/installs, starts the emulator if needed,
   forwards port 8765, starts/reuses ports 8080/8081/8443 and prints the iPad URL.
6. Follow FAMILY_PLAYTEST.md for iPad certificate trust. Keys are generated locally,
   never included in the source package.
7. Scan the current TV QR, connect and choose a racer/track. **Lock screen rotation** in the device’s quick settings (Rotation Lock on, or Auto-rotate off). Return to the controller, tap Ready and hold straight. Tilting and turning still steer the kart.
   Choose No bots or 1–3 bots (four racers total). Once every connected human is
   ready, tap Start race; one human can race alone. Bots use automatic items and
   stop driving when no human controller is active.
8. Stop with ./scripts/stop-spike.sh or Ctrl+C in the play terminal.

## Validate without playing
~~~sh
npm --prefix spike test
cd android-host
./gradlew :app:assembleDebug :app:lintDebug
cd ..
mkdir -p .local/race-check
javac -d .local/race-check   android-host/app/src/main/java/dev/jamescullimore/tinyracers/spike/Track.java   android-host/app/src/main/java/dev/jamescullimore/tinyracers/spike/RaceModel.java   android-host/checks/RaceModelCheck.java android-host/checks/TracksAndGrabberCheck.java
java -cp .local/race-check dev.jamescullimore.tinyracers.spike.RaceModelCheck
java -cp .local/race-check dev.jamescullimore.tinyracers.spike.TracksAndGrabberCheck
~~~
Chrome integration checks need a dedicated debug browser on port 9225. They are
optional developer checks. The browser-only Ready test uses fake networking;
physical Safari permission behaviour needs real iPads.

To rehearse the source package on a development Mac with dependencies already
cached, run `python3 scripts/package-demo.py` followed by
`python3 scripts/check-package.py --offline`. This extracts into a fresh temporary
directory, restores audio from the supplied APK, rebuilds, runs lint and runs
the controller tests. Omit `--offline` when dependencies need downloading.
It does not validate first-time SDK installation or physical iPad permissions.

Developer emulator checks use `ANDROID_SERIAL` (set automatically by `atc exec`)
for screenshots. In an empty test lobby, run `spike/check-multiplayer.mjs`,
`spike/check-tracks.mjs` and `spike/check-race-recovery.mjs` with Node and the
current room token. Run them sequentially: they occupy the four player slots.

## Recovery
Fresh launches issue a new token. Scan again instead of using an old saved link.
If Wi-Fi/IP changes, restart with the new address. The same CA is retained for
server-certificate renewal; an expired CA needs adult-assisted regeneration and
re-trust. Don't disable browser security or bypass warnings.
Guest/school networks may isolate clients; use a normal private LAN.
