#!/usr/bin/env bash
set -euo pipefail
SPIKE_ROOT="$(cd "$(dirname "$0")/.." && pwd)"
SPIKE_SDK="${ANDROID_HOME:-$HOME/Library/Android/sdk}"
SPIKE_ADB="$SPIKE_SDK/platform-tools/adb"
SPIKE_STATE_FILE="${TINY_RACERS_STATE_FILE:-$SPIKE_ROOT/.local/playtest-serial}"
SPIKE_SERIAL="${ANDROID_SERIAL:-$(cat "$SPIKE_STATE_FILE" 2>/dev/null || echo emulator-5560)}"
SPIKE_IP="${1:-$(ipconfig getifaddr en0 2>/dev/null || true)}"
if [[ -z "$SPIKE_IP" ]]; then echo 'Connect the Mac to Wi-Fi, or pass its LAN IPv4 address.' >&2; exit 1; fi
for SPIKE_TOOL in node openssl curl; do command -v "$SPIKE_TOOL" >/dev/null || { echo "Missing $SPIKE_TOOL"; exit 1; }; done
[[ -x "$SPIKE_ADB" ]] || { echo 'Install Android SDK or set ANDROID_HOME.'; exit 1; }
SPIKE_CHILDREN=()
cleanup() {
  "$SPIKE_ADB" -s "$SPIKE_SERIAL" shell am force-stop dev.jamescullimore.tinyracers.spike >/dev/null 2>&1 || true
  for SPIKE_PID in "${SPIKE_CHILDREN[@]:-}"; do [[ -z "$SPIKE_PID" ]] || kill "$SPIKE_PID" 2>/dev/null || true; done
}
trap cleanup EXIT
trap 'exit 130' INT TERM
mkdir -p "$SPIKE_ROOT/.local"
if ! "$SPIKE_ADB" -s "$SPIKE_SERIAL" get-state >/dev/null 2>&1; then
  [[ -f "$SPIKE_ROOT/.local/avd/TinyRacersTV.ini" ]] || { echo 'Create TinyRacersTV first; see JUDGE_SETUP.md.'; exit 1; }
  SPIKE_SERIAL="emulator-5560"
  ANDROID_AVD_HOME="$SPIKE_ROOT/.local/avd" "$SPIKE_SDK/emulator/emulator" -avd TinyRacersTV -port 5560 -no-snapshot -no-boot-anim > "$SPIKE_ROOT/.local/emulator.log" 2>&1 &
  SPIKE_CHILDREN+=("$!")
fi
SPIKE_BOOTED=false
for ((SPIKE_TRY=0; SPIKE_TRY<90; SPIKE_TRY++)); do
  if [[ "$("$SPIKE_ADB" -s "$SPIKE_SERIAL" shell getprop sys.boot_completed 2>/dev/null | tr -d '\r')" == 1 ]]; then SPIKE_BOOTED=true; break; fi
  sleep 2
done
[[ "$SPIKE_BOOTED" == true ]] || { echo 'TV emulator did not boot. See .local/emulator.log.'; exit 1; }
"$SPIKE_ADB" -s "$SPIKE_SERIAL" shell pm list features | grep -q android.software.leanback || { echo 'Port 5560 is not a TV emulator.'; exit 1; }
printf '%s\n' "$SPIKE_SERIAL" > "$SPIKE_STATE_FILE"
# Reuse the existing workspace bridge; never launch a conflicting second instance.
if curl --fail --silent --max-time 2 http://localhost:8080/ | grep 'Tiny Racers' >/dev/null; then
  echo 'Reusing local controller bridge.'
else
  (cd "$SPIKE_ROOT/spike" && exec node server.mjs) > "$SPIKE_ROOT/.local/http.log" 2>&1 &
  SPIKE_CHILDREN+=("$!")
fi
if curl --fail --silent --cacert "$SPIKE_ROOT/.local/tls/ca.pem" --max-time 2 "https://$SPIKE_IP:8443/" | grep 'Tiny Racers' >/dev/null; then
  echo 'Reusing secure iPad bridge.'
else
  (cd "$SPIKE_ROOT/spike" && exec node lan.mjs "$SPIKE_IP") > "$SPIKE_ROOT/.local/lan.log" 2>&1 &
  SPIKE_CHILDREN+=("$!")
fi
SPIKE_BRIDGES=false
for ((SPIKE_TRY=0; SPIKE_TRY<20; SPIKE_TRY++)); do
  if curl --fail --silent --max-time 2 http://localhost:8080/ >/dev/null &&
     curl --fail --silent --cacert "$SPIKE_ROOT/.local/tls/ca.pem" --max-time 2 "https://$SPIKE_IP:8443/" >/dev/null &&
     curl --fail --silent --max-time 2 "http://$SPIKE_IP:8081/" >/dev/null; then SPIKE_BRIDGES=true; break; fi
  sleep 1
done
[[ "$SPIKE_BRIDGES" == true ]] || { echo 'Bridge unavailable. See .local/http.log and .local/lan.log. Do not use a different app on ports 8080/8081/8443.'; exit 1; }
if [[ "${TINY_RACERS_SKIP_BUILD:-0}" != 1 ]]; then
  (cd "$SPIKE_ROOT/android-host" && ANDROID_HOME="$SPIKE_SDK" ./gradlew :app:assembleDebug)
fi
[[ -f "$SPIKE_ROOT/android-host/app/build/outputs/apk/debug/app-debug.apk" ]] || { echo 'Build the APK first.'; exit 1; }
"$SPIKE_ADB" -s "$SPIKE_SERIAL" install -r "$SPIKE_ROOT/android-host/app/build/outputs/apk/debug/app-debug.apk"
"$SPIKE_ADB" -s "$SPIKE_SERIAL" forward tcp:8765 tcp:8765
"$SPIKE_ADB" -s "$SPIKE_SERIAL" shell am force-stop dev.jamescullimore.tinyracers.spike
"$SPIKE_ADB" -s "$SPIKE_SERIAL" shell am start -W -n dev.jamescullimore.tinyracers.spike/.SpikeActivity --es controllerOrigin "https://$SPIKE_IP:8443"
echo
echo "FIRST-TIME IPAD SETUP: http://$SPIKE_IP:8081"
echo "CONTROLLER: https://$SPIKE_IP:8443 — scan the current TV QR for the room code."
openssl x509 -in "$SPIKE_ROOT/.local/tls/ca.pem" -noout -fingerprint -sha256
echo 'Keep this window open and the Mac awake. Ctrl+C stops the game/music.'
echo 'Stop Tiny Racers.command also stops the game immediately.'
if command -v caffeinate >/dev/null; then caffeinate -i -w $$ & SPIKE_CHILDREN+=("$!"); fi
while "$SPIKE_ADB" -s "$SPIKE_SERIAL" shell pidof dev.jamescullimore.tinyracers.spike >/dev/null 2>&1; do sleep 2; done
