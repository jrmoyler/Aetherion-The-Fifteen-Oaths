from pathlib import Path
from PIL import Image,ImageOps,ImageDraw
import json
p=Path(__file__).resolve().parent;rows=json.loads((p/'render-progress.json').read_text())
def sheet(name,items,columns=4):
 w,h=300,388;out=Image.new('RGB',(w*columns,h*((len(items)+columns-1)//columns)),(237,237,232));draw=ImageDraw.Draw(out)
 for i,r in enumerate(items):
  im=ImageOps.contain(Image.open(p/r['file']).convert('RGB'),(w,360));x=(i%columns)*w;y=(i//columns)*h;out.paste(im,(x+(w-im.width)//2,y+24));draw.text((x+5,y+6),r['file'].removesuffix('.png'),fill='black')
 out.save(p/name)
if len(rows)>=4:sheet('rest-contact-sheet.png',rows[:4])
if len(rows)>=16:sheet('pose-contact-sheet.png',rows[:16])
for clip in ['idle_breath','walk_in_place','cast_release']:
 items=[r for r in rows if r['clip']==clip]
 if len(items)==4:sheet(clip+'-contact-sheet.png',items)
if len(rows)==19:sheet('head-contact-sheet.png',rows[16:],3);sheet('all19-contact-sheet.png',rows,4)
