from pathlib import Path
from PIL import Image,ImageDraw
import json,hashlib
P=Path('/tmp/aetherion-daybreak-architecture-r04');O=Path(__file__).resolve().parent;provenance=[]
def put(canvas,path,box,rect,label):
 im=Image.open(P/path).convert('RGB');source_size=im.size
 if box:im=im.crop(box)
 im.thumbnail((rect[2],rect[3]-30));canvas.paste(im,(rect[0]+(rect[2]-im.width)//2,rect[1]+30+(rect[3]-30-im.height)//2));ImageDraw.Draw(canvas).text((rect[0]+8,rect[1]+8),label,fill='white')
 provenance.append({'source':path,'sha256':hashlib.sha256((P/path).read_bytes()).hexdigest(),'source_size':source_size,'crop_pixels':box,'label':label})
im=Image.new('RGB',(1400,1040),'#1c2430')
put(im,'references/reference-105-original.png',(9,661,1236,1012),(0,0,1400,400),'ORIGINAL REF105 | environment crop | establishes design language')
put(im,'references/p2-arch-09-daybreak-arcades-proposed-v01.png',(10,412,745,1004),(0,400,700,640),'PROPOSED public colonnade | deep folded canopy / underside ribs')
put(im,'fixtures/civic/hero.png',None,(700,400,700,640),'R04 CANDIDATE | actual CPU civic assembly | not approved')
im.save(O/'01-original-proposed-assembly.png')
im=Image.new('RGB',(1400,1470),'#1c2430')
put(im,'references/daybreak-roof-canopy-proposed-v01.png',(515,110,1024,315),(0,0,700,470),'PROPOSED shallow removable canopy | 0.3m initial envelope')
put(im,'modules/shade-canopy/hero.png',None,(700,0,700,470),'R04 CANDIDATE | top view render | scalloped edges / ribs')
put(im,'references/p2-arch-09-daybreak-arcades-proposed-v01.png',(1260,570,1520,696),(0,470,700,470),'PROPOSED underside | converging ribs and substantial pendant')
put(im,'modules/shade-canopy/underside-detail.png',None,(700,470,700,470),'R04 CANDIDATE | underside | ribs faint, pendant very small')
put(im,'references/daybreak-roof-canopy-proposed-v01.png',(827,626,1140,964),(0,940,700,530),'PROPOSED corner | articulated release / hollow receiver')
put(im,'modules/public-colonnade/capital-detail.png',None,(700,940,700,530),'R04 CANDIDATE | layered head | simplified solid receiver')
im.save(O/'02-canopy-underside-connection.png')
(O/'pixel-provenance.json').write_text(json.dumps({'method':'Exact source pixel crops and proportional resampling; labels added outside images. No generated or repainted imagery. Views are not camera/light registered and do not support pixel-error fidelity scores.','panels':provenance},indent=2)+'\n')
