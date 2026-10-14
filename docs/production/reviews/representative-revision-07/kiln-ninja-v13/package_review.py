from pathlib import Path
from PIL import Image,ImageOps,ImageDraw
import json,hashlib,ast,datetime
p=Path(__file__).resolve().parent;d=p/'kiln-ninja-ensemble-candidate';old=Path('/tmp/ninja-v12/kiln-ninja-ensemble-candidate');refpath=Path('/workspace/Aetherion-The-Fifteen-Oaths/assets/references/reference-090/original.png');ref=Image.open(refpath).convert('RGB');stem='kiln-ninja-ensemble-candidate'
for name,box,view in [('front',(20,736,180,950),'portrait'),('profile',(184,736,360,950),'face_profile')]:
 sheet=Image.new('RGB',(1560,668),(238,238,235));draw=ImageDraw.Draw(sheet)
 for i,(label,im) in enumerate([('Original 090 unmasked panel',ref.crop(box)),('Frozen V12',Image.open(old/(stem+'-unmasked-'+view+'.png')).convert('RGB')),('V13 focused diagnostic - unapproved',Image.open(d/(stem+'-unmasked-'+view+'.png')).convert('RGB'))]):
  im=ImageOps.contain(im,(510,608));sheet.paste(im,(i*520+(520-im.width)//2,34+(608-im.height)//2));draw.text((i*520+8,10),label,fill='black')
 draw.text((8,652),'Comparative framing only. No exact likeness, visual approval, or engine appearance parity claim.',fill='black');sheet.save(p/(name+'-comparison.png'))
functions=['face_anatomy','mesh','main','tailored_pants','ceramic_band','draped_cape','create_geometry_v2','reference_stance','widen_lower_rest_stance','rig','animation','sockets']
def defs(file):return {n.name:ast.dump(n,include_attributes=False) for n in ast.parse(file.read_text()).body if isinstance(n,ast.FunctionDef)}
a=defs(Path('/tmp/ninja-v12/kiln_ninja.py'));b=defs(p/'kiln_ninja.py')
rows=[{'function':name,'unchanged':a[name]==b[name],'astSha256':hashlib.sha256(b[name].encode()).hexdigest()} for name in functions]
assert all(r['unchanged'] for r in rows)
(p/'body-rig-preservation.json').write_text(json.dumps({'scope':'V12/V13 normalized Python AST; face/ear, body, cape, bracer, stance, rig, clips and sockets authoring unchanged. Only hair_lock and designed_hair change geometry. main retains compressed saves; preserved functions below include the complete face/ear function. Not byte equality of combined output.','functions':rows},indent=2)+'\n')
(p/'comparison.html').write_text('''<!doctype html><html lang="en"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Ninja V13 focused diagnostic</title><style>body{font:17px system-ui;max-width:1600px;margin:30px auto;background:#eee;color:#222}img{width:100%;height:auto}a{color:#164a8c}</style><h1>V13 focused asymmetric hair mass repair — unapproved</h1><p>Actual reference090 pixels, frozen V12 and actual Blender CPU V13 renders. Facial likeness and hair fidelity remain below the source. No full pose review or GPU appearance certification.</p><p><a href="REVIEW.md">Changes and remaining failures</a> · <a href="geometry-freeze-receipt.json">Frozen source/export/render hashes</a> · <a href="body-rig-preservation.json">Preserved authoring functions</a></p><h2>Front</h2><img src="front-comparison.png" alt="Reference090, V12 and V13 front views"><h2>Profile</h2><img src="profile-comparison.png" alt="Reference090, V12 and V13 profile views"></html>''')
files=[p/'kiln_ninja.py']+sorted(d.glob('*.blend'))+sorted(d.glob('*.glb'))+sorted(d.glob('*.png'))
rows=[{'path':str(f),'bytes':f.stat().st_size,'sha256':hashlib.sha256(f.read_bytes()).hexdigest()} for f in files]
(p/'geometry-freeze-receipt.json').write_text(json.dumps({'status':'FROZEN_FOCUSED_DIAGNOSTIC_UNAPPROVED','utc':datetime.datetime.now(datetime.timezone.utc).isoformat(),'sourceReference':{'path':str(refpath),'sha256':hashlib.sha256(refpath.read_bytes()).hexdigest()},'note':'No mutations of source/GLBs/maps/two diagnostic views after this receipt. Independent evidence may be added. No full pose render run.','files':rows},indent=2)+'\n')
