# Credits and asset terms

Don't Go To Bed: Tiny Racers is a hackathon project by James Cullimore, using the
characters from his family's Don't Go To Bed game. The owner requested reuse of
the characters/audio and creation of this game's promotional material. That
permission does not grant a general licence for others to reuse family identities.

## Characters and visual design

Character artwork is adapted from the family's Don't Go To Bed game, with
owner-approved portraits and overhead racing variants. The current Daddy portrait
and kart were approved on 14 October 2026. Character identities and original asset
terms remain with their respective owners; see the source terms below.

Track scenery and the marketing layouts are authored in code. Marketing uses the
original game's navy/cream/gold style, actual supplied portraits and real emulator
captures. No Micro Machines, Hot Wheels or LEGO artwork is copied. References to
those games/toys describe inspiration, not endorsement or a licence to their assets.
System fonts are rendered by the operating system; no font binaries are distributed.

The original artwork/identity terms are retained verbatim at
`android-host/app/src/main/assets/characters/SOURCE_TERMS.md`. Original code is
MIT-licensed; see `LICENSE`. Family artwork, recordings and branding are separately
covered by `ASSET_LICENSE.md`. Third-party components retain their own notices.

## Music

Music by **Liborio Conti**, https://www.no-copyright-music.com/.
Race music and video soundtrack: **Upbeat Drums** (`panic.mp3`, ID3 title verified).
The lobby track is the original game's `menu.mp3`; its title is absent from source
metadata, so no title is invented.

Terms: https://www.no-copyright-music.com/license/ (checked 13 October 2026).
The published terms allow music incorporated into personal/commercial video and
media productions. Do not redistribute standalone tracks or claim them through
Content ID. The videos contain an edited soundtrack, not a music download.

## Sound effects

Pixabay, as credited in the original game's `AudioCredits.kt`:
`jump`, `hit`, `place`, `arrow`, `damage_taken`, `drink`, `turn`.
https://pixabay.com/sound-effects/ —
https://pixabay.com/service/license-summary/ (checked 13 October 2026).
Individual download links and creator names are not present in the original
metadata. These remain an evidence gap, not fabricated attributions. Hashes and
known source details are preserved in the APK's `assets/audio/PROVENANCE.json`.
Raw MP3s are excluded from Git and must not be offered as an asset collection.

## Software

Java-WebSocket 1.5.6 and SLF4J API 2.0.17: MIT. ZXing core 3.5.3: Apache-2.0 and
included notices. Gradle wrapper 8.14.3 and Android Gradle Plugin 8.11.2: Apache-2.0.
Full notices are retained in `android-host/app/src/main/assets/THIRD_PARTY_NOTICES.txt`,
`ZXING_LICENSE.txt`, `android-host/gradle/LICENSE`.

Cloudflare Wrangler 4.151.1 is used for relay development/deployment (MIT /
Apache-2.0); ws 8.21.0 is a test-only WebSocket dependency (MIT). Dependency
licences remain in the installed packages; versions are locked in relay/package-lock.json.
Cloudflare hosts the controller and relay; it is not presented as a project sponsor.

## Recording disclosure

The marketing footage is captured from the real Android TV emulator build with
four scripted controllers sending ordinary input messages. It demonstrates game
behaviour, not physical iPad testing. The 13 October recordings predate the built-in bot mode. The refreshed
16 October hackathon demo also uses external scripted controllers, rather than
the built-in bots. Controller
onboarding footage uses the real web interface with synthetic motion readings;
it cannot demonstrate a real Safari permission dialog. Editorial cuts and music
are applied afterwards. No new gameplay is fabricated for the videos.
