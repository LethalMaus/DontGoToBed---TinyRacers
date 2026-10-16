#!/usr/bin/env python3
"""Read-only Mac playtest preflight. Does not launch the game, change trust or play audio."""
from pathlib import Path
import hashlib, json, os, shutil, subprocess, sys
root=Path(__file__).resolve().parents[1]
sdk=Path(os.environ.get('ANDROID_HOME',str(Path.home()/'Library/Android/sdk')))
failures=[]
def check(label,ok,detail=''):
    print(('OK   ' if ok else 'TODO ')+label+(' — '+detail if detail else ''))
    if not ok: failures.append(label)
for cmd in ['node','java','openssl','python3']:
    check(cmd,shutil.which(cmd) is not None)
check('Android SDK', (sdk/'platform-tools/adb').exists(),str(sdk))
check('TV emulator profile',(root/'.local/avd/TinyRacersTV.ini').exists(),'See JUDGE_SETUP.md to create it on another Mac.')
apk=root/'android-host/app/build/outputs/apk/debug/app-debug.apk'
check('Built APK',apk.exists())
assets=root/'android-host/app/src/main/assets/audio'
manifest=json.loads((assets/'PROVENANCE.json').read_text())
audio=all((assets/n).exists() and hashlib.sha256((assets/n).read_bytes()).hexdigest()==h for n,h in manifest['files'].items())
check('All nine bundled audio files match provenance',audio,'Restore with scripts/prepare-audio.py if missing.')
config=root/'.local/tls/config.json'
if config.exists():
    c=json.loads(config.read_text());print('iPad setup: '+c['setupURL']);print('Controller: '+c['origin']);print(c['fingerprint'])
    p=subprocess.run(['openssl','x509','-in',str(root/'.local/tls/ca.pem'),'-checkend','86400','-noout'],capture_output=True)
    check('Development CA valid for tomorrow',p.returncode==0)
else: print('INFO Certificates will be created on first launch; trust on each iPad is manual.')
if (sdk/'platform-tools/adb').exists():
    state=Path(os.environ.get('TINY_RACERS_STATE_FILE',str(root/'.local/playtest-serial')))
    serial=os.environ.get('ANDROID_SERIAL') or (state.read_text().strip() if state.exists() else 'emulator-5560')
    p=subprocess.run([str(sdk/'platform-tools/adb'),'-s',serial,'shell','pidof','dev.jamescullimore.tinyracers.spike'],capture_output=True,text=True)
    print('Game: '+('running' if p.returncode==0 and p.stdout.strip() else 'stopped / emulator offline'))
print('Preflight only. No game launch or music.')
sys.exit(bool(failures))
