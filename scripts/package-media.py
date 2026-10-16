#!/usr/bin/env python3
"""Bundle approved local media deliverables for review/voiceover; never upload."""
from pathlib import Path
import hashlib,json,zipfile
root=Path(__file__).resolve().parents[1]
media=root/'marketing';out=media/'exports/tiny-racers-media-kit.zip'
paths=[p for p in (media/'exports').rglob('*') if p.is_file() and p.suffix in {'.png','.mp4','.srt','.vtt'}]
paths += [media/p for p in ['index.html','README.md','VOICEOVER_SCRIPTS.md','HACKATHON_VOICEOVER.md','YOUTUBE_COPY.md']]
paths += [root/'CREDITS.md', root/'ASSET_LICENSE.md']
paths += [media/'exports/devpost-gallery/index.html', media/'exports/devpost-gallery/captions.json']
manifest={str(p.relative_to(root)):hashlib.sha256(p.read_bytes()).hexdigest() for p in paths}
with zipfile.ZipFile(out,'w',zipfile.ZIP_DEFLATED) as z:
 for p in paths:z.write(p,p.relative_to(root))
 z.writestr('SHA256.json',json.dumps(manifest,indent=2)+'\n')
print(f'{len(paths)} deliverables: {out}')
