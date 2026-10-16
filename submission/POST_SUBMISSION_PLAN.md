# First priority after submission: direct phone-to-TV connections

Owner decision, 16 October 2026: submit the working hosted-relay version first.
Immediately afterwards, prioritise direct WebRTC connections, ideally completing
them before the hackathon submission period ends on 23 October. This is a target,
not a completed feature or delivery guarantee. Eight-player mode comes later.

Keep the TV authoritative. Phones remain browser controllers; the first phone
does not become the host. Cloudflare serves the HTTPS controller and exchanges
connection-establishment messages. Steering and game updates should use encrypted
WebRTC data channels directly between phones and TV whenever the network allows.

## Implementation and acceptance

1. Preserve the submitted source revision, APK, video and hosted relay configuration.
   Build the new transport separately so the judgeable version remains available.
2. Prove one Safari/Chrome controller connects to the Android TV host, then four
   concurrent controllers. Use data channels only; no camera or microphone permissions.
3. Keep ordered/reliable control messages separate from time-sensitive steering;
   reject old inputs and preserve stop-on-stale behaviour, room authentication,
   reconnect/resume and existing race authority.
4. Measure connection success, steering latency and packet loss on real family
   devices. Test sleep/background, rotation, rejoin, host restart and Wi-Fi changes.
5. Verify actual network paths and cloud traffic: report direct versus relayed
   connections, with no claim that internet or relay use is eliminated everywhere.
6. Decide fallback policy for isolated guest networks and failed direct connections.
   Keep the current capped relay during evaluation. Any paid TURN service or plan
   requires the owner's approval; the existing zero-cost constraint remains.

Source of deadline: https://amazonappdev2026.devpost.com/rules
