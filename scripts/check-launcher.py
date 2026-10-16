#!/usr/bin/env python3
"""Exercise launcher reuse/cleanup with fake ADB and HTTP; never opens emulator/music."""
from pathlib import Path
import os, subprocess, tempfile
root=Path(__file__).resolve().parents[1]
with tempfile.TemporaryDirectory(prefix='tiny-racers-launch-check-') as directory:
    tmp=Path(directory);binary=tmp/'bin';binary.mkdir();sdk=tmp/'sdk';(sdk/'platform-tools').mkdir(parents=True)
    log=tmp/'calls'
    def script(path,body):
        path.write_text('#!/bin/bash\n'+body);path.chmod(0o755)
    script(sdk/'platform-tools/adb','''echo "$*" >> "$RACERS_CHECK_LOG"
case "$*" in
 *get-state*) echo device ;;
 *getprop*) echo 1 ;;
 *"pm list features"*) echo feature:android.software.leanback ;;
 *pidof*) exit 1 ;;
esac
''')
    script(binary/'curl',"echo 'Tiny Racers'\n")
    script(binary/'caffeinate','exit 0\n')
    env=dict(os.environ,PATH=str(binary)+os.pathsep+os.environ['PATH'],
             ANDROID_HOME=str(sdk),TINY_RACERS_STATE_FILE=str(tmp/'serial'),TINY_RACERS_SKIP_BUILD='1',RACERS_CHECK_LOG=str(log))
    result=subprocess.run(['bash',str(root/'scripts/run-spike.sh'),'192.168.178.188'],
                          env=env,capture_output=True,text=True,timeout=20)
    assert result.returncode==0,result.stdout+result.stderr
    calls=log.read_text()
    assert 'am start' in calls and 'forward tcp:8765 tcp:8765' in calls,calls
    assert calls.rstrip().endswith('am force-stop dev.jamescullimore.tinyracers.spike'),calls
    assert 'Reusing local controller bridge.' in result.stdout
    assert 'Reusing secure iPad bridge.' in result.stdout
    print('PASS simulated launcher: existing bridge reuse, fresh app start, forwarding and cleanup. No real app/audio launched.')
