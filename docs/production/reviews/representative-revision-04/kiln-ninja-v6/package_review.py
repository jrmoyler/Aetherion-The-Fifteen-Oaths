from pathlib import Path
from PIL import Image,ImageOps,ImageDraw
import json,hashlib
p=Path('/tmp/ninja-v6');d=p/'kiln-ninja-ensemble-candidate';old=Path('/tmp/kiln-ninja-revision05/kiln-ninja-ensemble-candidate');ref=Image.open('/workspace/Aetherion-The-Fifteen-Oaths/assets/references/reference-090/original.png').convert('RGB');stem='kiln-ninja-ensemble-candidate'
for name,box,view in [('front',(20,736,180,950),'portrait'),('profile',(184,736,360,950),'face_profile')]:
 sheet=Image.new('RGB',(1950,825),(238,238,235));draw=ImageDraw.Draw(sheet)
 for i,(label,im) in enumerate([('Original 090 unmasked panel',ref.crop(box)),('Frozen V5',Image.open(old/(stem+'-unmasked-'+view+'.png')).convert('RGB')),('V6 focused diagnostic - unapproved',Image.open(d/(stem+'-unmasked-'+view+'.png')).convert('RGB'))]):
  im=ImageOps.contain(im,(640,760));sheet.paste(im,(i*650+(650-im.width)//2,40+(760-im.height)//2));draw.text((i*650+12,12),label,fill='black')
 draw.text((12,808),'Comparative framing; not a calibrated scan or exact-match certification. Lighting on V5/V6 retained. See remaining shape failures in REVIEW.md.',fill='black');sheet.save(p/(name+'-comparison.png'))
files=[p/'kiln_ninja.py',p/'model-face-landmarks.json',p/'source-face-landmarks.json',p/'source-face-landmarks.png',p/'hair-cost.json',p/'diagnostic-evidence.json',p/'glb-vertex-color-inspection.json',p/'geometry-freeze-receipt.json',p/'front-comparison.png',p/'profile-comparison.png',p/'package_review.py',p/'measure_reference.py',p/'REVIEW.md',p/'comparison.html',p/'body-rig-preservation.json',p/'independent-import-summary.md',p/'independent-import-receipt.json',p/'independent-colors.json']+list(d.glob('*'))
rows=[{'path':str(f.relative_to(p)),'bytes':f.stat().st_size,'sha256':hashlib.sha256(f.read_bytes()).hexdigest()} for f in sorted(files) if f.is_file()];(p/'SHA256SUMS.json').write_text(json.dumps(rows,indent=2)+'\n')
