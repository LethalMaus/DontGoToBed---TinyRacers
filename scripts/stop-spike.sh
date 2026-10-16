#!/usr/bin/env bash
set -euo pipefail
SPIKE_SDK="${ANDROID_HOME:-$HOME/Library/Android/sdk}"
SPIKE_ROOT="$(cd "$(dirname "$0")/.." && pwd)"
SPIKE_SERIAL="${ANDROID_SERIAL:-$(cat "$SPIKE_ROOT/.local/playtest-serial" 2>/dev/null || echo emulator-5560)}"
"$SPIKE_SDK/platform-tools/adb" -s "$SPIKE_SERIAL" shell am force-stop dev.jamescullimore.tinyracers.spike
echo 'Tiny Racers and its music are stopped.'
