import json,struct,hashlib,io
from pathlib import Path
from PIL import Image
root=Path('/tmp/ninja-v14');prior=Path('/tmp/ninja-v13');out=Path('/tmp/aetherion-revision05-import-checks');stem='kiln-ninja-ensemble-candidate';rows=[]
def parse(p):
 b=p.read_bytes();n=struct.unpack_from('<I',b,12)[0];return json.loads(b[20:20+n]),b[28+n:]
for p in sorted((root/stem).glob('*.glb')):
 old=root/'baseline'/p.name;original=prior/stem/p.name;assert old.read_bytes()==original.read_bytes();a,x=parse(old);b,y=parse(p);parts={k:a.get(k)==b.get(k) for k in ['meshes','nodes','skins','animations','accessors','scenes','scene']};prefix=y[:len(x)]==x;assert all(parts.values()) and prefix
 images=[]
 for image in b.get('images',[]):
  assert 'uri'not in image
  v=b['bufferViews'][image['bufferView']];data=y[v.get('byteOffset',0):v.get('byteOffset',0)+v['byteLength']];im=Image.open(io.BytesIO(data));im.load();images.append({'sha256':hashlib.sha256(data).hexdigest(),'size':im.size,'format':im.format})
 rows.append({'path':str(p),'sha256':hashlib.sha256(p.read_bytes()).hexdigest(),'baselineMatchesFrozenV13':True,'jsonSectionsIdentical':parts,'originalBinaryPrefixIdentical':prefix,'originalBinaryBytes':len(x),'accessorCount':len(a.get('accessors',[])),'decodedImages':images})
assert (root/'baseline'/(stem+'.blend')).read_bytes()==(prior/stem/(stem+'.blend')).read_bytes()
(out/'ninja14-resource-preservation.json').write_text(json.dumps({'scope':'Independent raw GLB comparison; all original buffer bytes, accessor definitions and scene/mesh/node/skin/animation structures match frozenV13. New embedded PNGs actually decoded; not visual acceptance.','reports':rows,'baselineBlendMatchesFrozenV13':True},indent=2)+'\n')
m=root/'material-freeze-receipt.json';d=json.loads(m.read_text());rows=[]
for r in d['files']:
 p=root/r['path'];rows.append({**r,'matches':p.stat().st_size==r['bytes'] and hashlib.sha256(p.read_bytes()).hexdigest()==r['sha256']})
assert all(r['matches'] for r in rows);(out/'ninja14-freeze-verification.json').write_text(json.dumps({'manifestSha256':hashlib.sha256(m.read_bytes()).hexdigest(),'files':rows,'allMatch':True},indent=2)+'\n');print('freeze',len(rows),hashlib.sha256(m.read_bytes()).hexdigest())
