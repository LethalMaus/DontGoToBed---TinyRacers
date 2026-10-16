#!/usr/bin/env python3
"""Prepare local private-review source/APK files; never publish."""
from pathlib import Path
import hashlib, json, shutil, zipfile
root=Path(__file__).resolve().parents[1]
out=root/'.local/submission'
source=out/'source'
if source.exists(): shutil.rmtree(source)  # This script's generated staging only.
source.mkdir(parents=True)
deny={'build','.gradle','.wrangler','node_modules','.DS_Store','.local','.git','.jc','.dev.vars','.env','local.properties','__pycache__'}
def ignore(directory,names):
    return [n for n in names if n in deny or n.startswith(('.env.','.dev.vars.')) or (Path(directory).name=='relay' and n=='public') or n.endswith(('.mp3','.pem','.key','.jks','.keystore','.pyc','.mp4','.webm','.mov','.zip','.wav','.aifc','.aiff'))]
for folder in ['android-host','spike','relay','scripts','submission','locales','marketing']:
    shutil.copytree(root/folder,source/folder,ignore=ignore)
for name in ['LICENSE','ASSET_LICENSE.md','CONTRIBUTING.md','README.md','CREDITS.md','JUDGE_SETUP.md','FAMILY_PLAYTEST.md','IPAD_TEST.md','.gitignore','.gitattributes','Play Tiny Racers.command','Stop Tiny Racers.command']:
    shutil.copy2(root/name,source/name)
apk=root/'android-host/app/build/outputs/apk/debug/app-debug.apk'
if not apk.exists(): raise SystemExit('Build the APK before packaging.')
artifacts=source/'artifacts';artifacts.mkdir()
shutil.copy2(apk,artifacts/'tiny-racers-0.2.0-hackathon.apk')
(source/'PACKAGE_NOTES.md').write_text('Original code is MIT-licensed; artwork and audio have separate terms. See LICENSE, ASSET_LICENSE.md and CREDITS.md. Follow JUDGE_SETUP.md; restore audio from the supplied APK for personal builds.\n')
archive=out/'tiny-racers-private-review.zip'
with zipfile.ZipFile(archive,'w',zipfile.ZIP_DEFLATED) as z:
    for p in sorted(source.rglob('*')):
        if p.is_file():z.write(p,p.relative_to(source))
files={str(p.relative_to(source)):hashlib.sha256(p.read_bytes()).hexdigest() for p in source.rglob('*') if p.is_file()}
(out/'FILES.sha256.json').write_text(json.dumps(files,indent=2)+'\n')
(out/'SHA256SUMS.txt').write_text(hashlib.sha256(archive.read_bytes()).hexdigest()+'  '+archive.name+'\n')
print(f'Prepared {len(files)} files: {archive}')
print('Local only. Audio embedded in APK; no keys, photos, raw MP3s or build caches.')
