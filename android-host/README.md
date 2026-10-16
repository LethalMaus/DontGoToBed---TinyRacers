# Android TV hackathon preview

See [JUDGE_SETUP.md](../JUDGE_SETUP.md) for setup/builds and
[FAMILY_PLAYTEST.md](../FAMILY_PLAYTEST.md) for iPad testing.

- App 0.2.0-hackathon, debug signed; application ID retained for local updates:
  dev.jamescullimore.tinyracers.spike.
- JDK17+, Android SDK36, minSdk26. Dedicated Android TV API34 arm64 emulator-5560.
- RaceModel/Track are plain Java; RaceArt draws Canvas; SpikeActivity owns sessions.
- Four players, three tracks, six powers, one circuit with elimination rounds.
- Full-screen view, compact scores, shared pause and automatic items.
- GameAudio bundles original music/effects; notices in app assets.

The host accepts input on port8765; the development Mac bridge validates origin
and forwards phone HTTPS traffic. Do not expose the host as an arbitrary proxy.
Room tokens change after app recreation. Reconnection uses a private per-player
resume credential in sessionStorage. Ready resets on reconnect.

Protocol v1 messages include input, ping, character, track, ready, start, lobby,
leave, use, autoItems, pause and resume. Input sequence must increase, steering
must be finite in [-1,1], and frames are bounded. Stale input stops that car;
pause freezes simulation and only its owner may resume via phone.
TV Menu can override pause. No standalone TV hosting or physical-TV performance
claim is made for this emulator build.
