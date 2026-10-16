# Contributing

Original code contributions are accepted under the repository’s MIT licence.
You retain your copyright. By submitting a contribution, you agree that it may
be distributed under that licence. Include only work you have rights to submit,
and retain third-party notices. This does not require copyright assignment.

## Build and check

Follow [judge setup](JUDGE_SETUP.md) for the APK or a source build. Run Android
build/lint and the relevant controller/relay or simulation checks after changes.
Do not run multiplayer integration scripts against someone else’s active race.

## Audio

Raw MP3 files are ignored. For a personal build using the supplied demo’s audio:

```sh
python3 scripts/prepare-audio.py --from-apk artifacts/tiny-racers-0.2.0-hackathon.apk
```

The script checks the nine audio hashes before writing. Preserve the audio
credits and terms. For a separately distributed game, obtain licensed copies or
replace the audio; it is not MIT-licensed.

## Assets and hosted services

[Asset terms](ASSET_LICENSE.md) allow private builds and collaborative forks.
Use replacement assets and your own branding for separate public distributions.
Deploy your own relay for sustained development or public use; the supplied
endpoint is a quota-limited hackathon service, not a general hosting commitment.
Keep private photos, credentials, recordings and working notes out of commits.
