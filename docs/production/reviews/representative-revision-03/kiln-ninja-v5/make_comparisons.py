from pathlib import Path
from PIL import Image,ImageOps,ImageDraw
import json,hashlib,shutil
out=Path('/tmp/kiln-ninja-revision05');d=out/'kiln-ninja-ensemble-candidate';old=Path('/tmp/kiln-ninja-revision04/kiln-ninja-ensemble-candidate');repo=Path('/workspace/Aetherion-The-Fifteen-Oaths');stem='kiln-ninja-ensemble-candidate'
ref=Image.open(repo/'assets/references/reference-090/original.png').convert('RGB')
items=[('front',(85,50,363,688),'front'),('profile',(870,50,1022,688),'side'),('face',(16,731,180,954),'unmasked-portrait'),('face-profile',(184,733,360,954),'unmasked-face_profile')]
for name,box,view in items:
 sheet=Image.new('RGB',(1950,820),(238,238,235));draw=ImageDraw.Draw(sheet)
 for i,(label,im) in enumerate([('Reference 090 — unchanged source crop',ref.crop(box)),('Revision 04',Image.open(old/(stem+'-'+view+'.png')).convert('RGB')),('Revision 05 — proposed',Image.open(d/(stem+'-'+view+'.png')).convert('RGB'))]):
  im=ImageOps.contain(im,(640,760));sheet.paste(im,(i*650+(650-im.width)//2,45+(760-im.height)//2));draw.text((i*650+12,15),label,fill='black')
 draw.text((12,805),'Comparative framing only. Painted views are not calibrated scans; no exact-match or visual-acceptance claim.',fill='black')
 sheet.save(out/(name+'-comparison.png'))
shutil.copyfile('/tmp/kiln-ninja-revision04/reference-landmarks.json',out/'reference-landmarks.json')
rows=[]
for p in sorted(out.rglob('*')):
 if p.is_file() and p.name not in ['SHA256SUMS.json','build.log','verify.log']:
  rows.append({'path':str(p.relative_to(out)),'bytes':p.stat().st_size,'sha256':hashlib.sha256(p.read_bytes()).hexdigest()})
(out/'SHA256SUMS.json').write_text(json.dumps(rows,indent=2)+'\n')
