#!/usr/bin/env bash
cd "$(dirname "$0")"
./scripts/run-spike.sh "$@"
SPIKE_EXIT=$?
if [[ $SPIKE_EXIT != 0 ]]; then echo 'Startup needs attention. See the message above.'; read -r -p 'Press Return to close.'; fi
exit "$SPIKE_EXIT"
