#!/usr/bin/env python3
"""Verify the generated private-review archive with no original project checkout."""
from pathlib import Path
import argparse, os, subprocess, tempfile, zipfile
parser=argparse.ArgumentParser(description=__doc__)
parser.add_argument('--offline',action='store_true',help='Use already cached Gradle dependencies; still rebuild from extracted source.')
args=parser.parse_args()
root=Path(__file__).resolve().parents[1]
archive=root/'.local/submission/tiny-racers-private-review.zip'
with tempfile.TemporaryDirectory(prefix='tiny-racers-clean-build-') as directory:
    temp=Path(directory)
    with zipfile.ZipFile(archive) as z:
        for name in z.namelist():
            p=Path(name)
            assert not p.is_absolute() and '..' not in p.parts,name
            assert not any(x in {'.jc','.local','.git','.gradle','.wrangler','node_modules','.env','.dev.vars'} for x in p.parts),name
            assert p.suffix.lower() not in {'.key','.pem','.jks','.keystore','.mp3'},name
        z.extractall(temp)
    # zipfile doesn't restore Unix executable bits.
    (temp/'android-host/gradlew').chmod(0o755)
    env=dict(os.environ)
    env.setdefault('ANDROID_HOME',str(Path.home()/'Library/Android/sdk'))
    log=root/'.local/judge-clean-build.log'
    with log.open('w') as output:
        commands=[
            ['python3','scripts/prepare-audio.py','--from-apk','artifacts/tiny-racers-0.2.0-hackathon.apk'],
            ['bash','android-host/gradlew','-p','android-host',':app:assembleDebug',':app:lintDebug']+(['--offline'] if args.offline else []),
            ['npm','--prefix','spike','test'],
            ['npm','--prefix','relay','test'],
        ]
        for command in commands:
            print('Running: '+' '.join(command),flush=True)
            result=subprocess.run(command,cwd=temp,env=env,stdout=output,stderr=subprocess.STDOUT,timeout=600)
            if result.returncode:raise SystemExit('Clean build failed; see '+str(log))
    print('PASS clean archive: no credentials/photos/raw MP3s; hash-verified audio restored from supplied APK; source build/lint and Node tests passed.')
