# Player UI languages
Source: player-ui.tsv, UTF-8 tab-separated English source text followed by German,
French, Spanish, Italian, Portuguese, Dutch and Polish. Numeric placeholders must
match in every column. English is the fallback; character names and brands stay
unchanged. Portuguese uses European wording; regional pt-BR currently falls back
to this catalogue. No native-speaker sign-off is claimed.

Run python3 scripts/build-locales.py from any directory after edits. It writes
spike/locales.mjs and android-host/app/src/main/assets/player-ui.json. Both generated
files are included so a normal judge build needs no generation step.

Player UI, item names, key onboarding/errors, pause and results are covered.
Developer diagnostics, certificate setup page and audio credits remain English.
