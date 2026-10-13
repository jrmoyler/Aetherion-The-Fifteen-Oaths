"""Decode exactly four source JPEGs for the optional CPU-only image boundary.
No resizing, synthetic pixels, source-file writes, gameplay or shader changes.
"""
import hashlib,json,pathlib,sys
from PIL import Image,__version__
root=pathlib.Path(__file__).resolve().parents[2]/'runtime/ability-matrix'
out=pathlib.Path(sys.argv[1]);out.mkdir(parents=True,exist_ok=True)
rows=[]
for name in ['color.jpg','normal.jpg','roughness.jpg','ao.jpg']:
 p=root/'packs/sandbox/public/textures/cathedral'/name
 source=p.read_bytes()
 with Image.open(p) as im:
  assert im.format=='JPEG'
  assert not im.info.get('icc_profile'),'ICC profile needs an explicitly verified color conversion'
  rgba=im.convert('RGBA');width,height=rgba.size;data=rgba.tobytes()
 target=out/(name+'.rgba');target.write_bytes(data)
 rows.append({'url':'./textures/cathedral/'+name,'source':str(p.relative_to(root)),'sourceSha256':hashlib.sha256(source).hexdigest(),'sourceBytes':len(source),'width':width,'height':height,'decodedFormat':'RGBA8','decodedBytes':len(data),'decodedSha256':hashlib.sha256(data).hexdigest(),'fixturePath':str(target)})
manifest={'decoder':'Pillow','decoderVersion':__version__,'method':'JPEG decode followed by RGB/L to RGBA8 conversion, without resizing or ICC transform; input contains no ICC profile.','textures':rows}
(out/'manifest.json').write_text(json.dumps(manifest,indent=2)+'\n')
print(out/'manifest.json')
