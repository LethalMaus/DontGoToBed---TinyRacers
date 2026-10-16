#!/usr/bin/env python3
"""Render reproducible, voiceover-ready cuts from real emulator/controller captures.
Requires ffmpeg on PATH, local raw captures and locally restored licensed music.
No upload. No raw source audio is exported. Uses ordinary cuts at original speed.
"""
from pathlib import Path
import subprocess,json
from functools import lru_cache
ROOT=Path(__file__).resolve().parents[2]
OUT=ROOT/'marketing/exports/videos'; OUT.mkdir(parents=True,exist_ok=True)
WORK=ROOT/'.local/video-edit'; WORK.mkdir(parents=True,exist_ok=True)
FONT='/System/Library/Fonts/Supplemental/Arial Bold.ttf'
MUSIC=ROOT/'android-host/app/src/main/assets/audio/panic.mp3'
def run(args):
 subprocess.run(['ffmpeg','-hide_banner','-loglevel','error','-y']+args,check=True)
@lru_cache(maxsize=None)
def source_duration(path):
 return float(subprocess.check_output(['ffprobe','-v','error','-show_entries','format=duration','-of','default=nw=1:nk=1',str(path)],text=True).strip())
def card(name,duration):return {'kind':'card','source':name,'duration':duration}
def game(name,start,duration,label=''):return {'kind':'game','source':name,'start':start,'duration':duration,'label':label}
def phone(start,duration,label):return {'kind':'phone','source':'controller','start':start,'duration':duration,'label':label}
# Every source is recorded from the real app. Capture metadata documents scripted input.
EDITS={
 'trailer':[
  game('dining',27,5,'A LITTLE FAMILY COMPETITION.'),card('trailer',4),
  game('dining',8,6,'TAKE THE LEAP.'),game('garden',25,6,'TAKE THE GARDEN.'),
  game('bedroom',14,6,'TAKE THE TIGHT TURN.'),game('dining',48,6,'PLAY A LITTLE DIRTY.'),
  game('dining',79,6,'MAKE ROOM FOR MAMMY.'),game('garden',58,5,'LAST RACER STANDING SCORES.'),
  game('bedroom',45,6,'ONE SHARED SCREEN. FOUR RIVALS.'),card('finish',7),card('credits',3)],
 'hackathon-demo':[
  game('dining',48,6,'YOUR PHONE BECOMES YOUR STEERING WHEEL.'),card('hackathon',6),
  game('lobby',1,4,'ANDROID TV EMULATOR'),phone(0,8,'SCAN THE TV’S QR CODE'),
  phone(8,11,'CHOOSE A TRACK AND 1–3 LAPS'),phone(19,11,'LOCK ROTATION · READY · HOLD STRAIGHT'),
  game('dining',7,12,'FOUR RACERS. ONE SHARED SCREEN.'),game('dining',27,13,'RAMPS, BOOSTERS AND TOY WEAPONS'),
  game('garden',23,12,'THE GARDEN'),game('bedroom',20,14,'BEDROOM HAIRPINS'),
  game('dining',31,12,'CATCH UP BEFORE YOU’RE OUT'),phone(39,16,'PAUSE · AUTOMATIC ITEMS · GENTLE STEERING'),
  card('architecture',10),game('bedroom',241,7,'POINTS DECIDE THE FINAL STANDINGS'),card('finish',4),card('credits',4)],
 'tutorial':[
  card('tutorial',5),card('setup',10),game('bedroom',0,4,'SCAN THE TV’S QR CODE'),
  phone(0,8,'1. CONNECT TO YOUR TV'),phone(8,11,'2. CHOOSE YOUR RACE'),
  phone(19,11,'3. TAP READY AND HOLD STILL'),game('dining',7,10,'4. TURN GENTLY TO STEER'),
  game('dining',27,10,'ITEMS WORK AUTOMATICALLY'),phone(39,16,'PAUSE TO CHANGE YOUR OPTIONS'),
  card('rules',8),game('dining',120,10,'LAST SURVIVOR SCORES; EVERYONE RETURNS'),
  game('bedroom',241,8,'MOST POINTS WINS'),card('finish',4),card('credits',4)]
}
def render(name,segments):
 paths=[];timeline=[];cursor=0
 for i,s in enumerate(segments):
  path=WORK/f'{name}-{i:02}.mp4';duration=s['duration'];kind=s['kind'];label=s.get('label','')
  if kind=='card':
   src=ROOT/f'marketing/exports/artwork/card-{s["source"]}.png';args=['-loop','1','-framerate','30','-i',str(src)]
   vf='scale=1920:1080,setsar=1'
  else:
   src=ROOT/f'.local/recordings/{s["source"]}.mp4'
   if s['start']+duration>source_duration(src)+.1:raise ValueError(f'{name}: clip exceeds {src.name}')
   args=['-ss',str(s['start']),'-i',str(src)]
   if kind=='phone':
    vf='scale=-2:940,pad=1920:1080:(ow-iw)/2:90:color=0x11263a,setsar=1'
   else:vf='scale=1920:1080,setsar=1'
   if label:
    textfile=WORK/f'{name}-{i:02}.txt';textfile.write_text(label)
    vf+=f",drawbox=x=0:y=0:w=iw:h=84:color=0x11263a@0.90:t=fill,drawtext=fontfile='{FONT}':textfile='{textfile}':fontsize=34:fontcolor=0xfff2d4:x=(w-tw)/2:y=24"
   note=WORK/'disclosure.txt';note.write_text('HACKATHON BUILD · SCRIPTED CONTROLLERS')
   vf+=f",drawtext=fontfile='{FONT}':textfile='{note}':fontsize=17:fontcolor=white@0.8:box=1:boxcolor=0x11263a@0.65:boxborderw=6:x=w-tw-24:y=h-th-95"
  vf+=f',fps=30,format=yuv420p,fade=t=in:st=0:d=0.12,fade=t=out:st={duration-.12}:d=0.12'
  run(args+['-t',str(duration),'-vf',vf,'-an','-c:v','libx264','-preset','veryfast','-crf','20','-threads','4',str(path)])
  paths.append(path)
  entry={**s,'start':cursor}
  if 'start' in s:entry['sourceStart']=s['start']
  timeline.append(entry);cursor+=duration
 concat=WORK/f'{name}.txt';concat.write_text(''.join(f"file '{p}'\n" for p in paths))
 silent=OUT/f'{name}-picture.mp4';run(['-f','concat','-safe','0','-i',str(concat),'-c','copy','-movflags','+faststart',str(silent)])
 volume='.25' if name=='trailer' else '.10'
 run(['-i',str(silent),'-stream_loop','-1','-i',str(MUSIC),'-t',str(cursor),'-af',f'volume={volume},afade=t=in:st=0:d=1,afade=t=out:st={cursor-3}:d=3','-c:v','copy','-c:a','aac','-b:a','192k','-movflags','+faststart',str(OUT/f'{name}-voiceover-ready.mp4')])
 (ROOT/f'marketing/source/{name}-timeline.json').write_text(json.dumps({'duration':cursor,'segments':timeline},indent=2)+'\n')
 print(name,cursor,'seconds',flush=True)
if __name__=='__main__':
 import sys
 for name in (sys.argv[1:] or list(EDITS)):render(name,EDITS[name])
