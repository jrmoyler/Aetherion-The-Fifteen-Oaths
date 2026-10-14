from pathlib import Path
from PIL import Image,ImageOps,ImageDraw
import json,hashlib,ast,datetime
p=Path(__file__).resolve().parent;d=p/'kiln-ninja-ensemble-candidate';old=Path('/tmp/ninja-v12/kiln-ninja-ensemble-candidate');refpath=Path('/workspace/Aetherion-The-Fifteen-Oaths/assets/references/reference-090/original.png');ref=Image.open(refpath).convert('RGB');stem='kiln-ninja-ensemble-candidate'
for name,box,view in [('front',(20,736,180,950),'portrait'),('profile',(184,736,360,950),'face_profile')]:
 sheet=Image.new('RGB',(1560,668),(238,238,235));draw=ImageDraw.Draw(sheet)
 for i,(label,im) in enumerate([('Original 090 unmasked panel',ref.crop(box)),('Frozen V12',Image.open(old/(stem+'-unmasked-'+view+'.png')).convert('RGB')),('V13 focused diagnostic - unapproved',Image.open(d/(stem+'-unmasked-'+view+'.png')).convert('RGB'))]):
  im=ImageOps.contain(im,(510,608));sheet.paste(im,(i*520+(520-im.width)//2,34+(608-im.height)//2));draw.text((i*520+8,10),label,fill='black')
 draw.text((8,652),'Comparative framing only. No exact likeness, visual approval, or engine appearance parity claim.',fill='black');sheet.save(p/(name+'-comparison.png'))
