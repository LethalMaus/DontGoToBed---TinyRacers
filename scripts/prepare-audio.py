#!/usr/bin/env python3
"""Restore audio from the owner's original checkout or an authorized bundled game APK."""
from pathlib import Path
import argparse
import hashlib
import json
import shutil
import zipfile

root = Path(__file__).resolve().parents[1]
parser = argparse.ArgumentParser(description=__doc__)
parser.add_argument('source', nargs='?', help='Original DontGoToBed checkout')
parser.add_argument('--from-apk', type=Path, help='Locally supplied Tiny Racers APK (personal judging/build use)')
args = parser.parse_args()
target = root / 'android-host/app/src/main/assets/audio'
manifest = json.loads((target / 'PROVENANCE.json').read_text())
if args.from_apk:
    with zipfile.ZipFile(args.from_apk) as apk:
        files = {name: apk.read('assets/audio/' + name) for name in manifest['files']}
    origin = str(args.from_apk)
else:
    source = (Path(args.source) if args.source else Path.home() / 'Desktop' / 'DontGoToBed') / 'composeApp/src/commonMain/composeResources/files/audio'
    files = {name: (source / name).read_bytes() for name in manifest['files']}
    origin = str(source)
# Validate all files before any destination changes.
for name, data in files.items():
    if hashlib.sha256(data).hexdigest() != manifest['files'][name]:
        raise SystemExit(f'Audio hash mismatch: {name}; no files changed.')
for name, data in files.items():
    (target / name).write_bytes(data)
print(f'Prepared {len(files)} audio files from {origin}. Preserve bundled audio credits and terms.')
