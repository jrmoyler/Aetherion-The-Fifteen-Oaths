import json,struct,hashlib,io
from pathlib import Path
from PIL import Image
root=Path('/tmp/aetherion-daybreak-architecture');out=Path('/tmp/aetherion-daybreak-independent-checks');registry=Path('/workspace/Aetherion-The-Fifteen-Oaths/AETHERION_CANON/21_WORLD_CONSTRUCTION_PHASE_II/ARCHITECTURAL_KIT_REGISTRY.json');canon=json.loads(registry.read_text())['records'][8];work=json.loads((root/'work-list.json').read_text());reports=[]
assert work['registry_sha256']==hashlib.sha256(registry.read_bytes()).hexdigest()
expected=[r['name'] for r in canon['modules']];print('registry modules',len(expected))
assert [r['original_name'] for r in work['modules']]==expected
assert {p.name for p in (root/'modules').iterdir() if p.is_dir()}=={n.replace(' ','-') for n in expected}
for i,name in enumerate(expected):
 d=root/'modules'/name.replace(' ','-');m=json.loads((d/'manifest.json').read_text());assert m['original_name']==name and m['source_pointer']==f'ARCHITECTURAL_KIT_REGISTRY.json#/records/8/modules/{i}'
for p in sorted((root/'modules').glob('*/*.glb')):
 raw=p.read_bytes();n=struct.unpack_from('<I',raw,12)[0];j=json.loads(raw[20:20+n]);binary=raw[28+n:];images=[];errors=[]
 for im in j.get('images',[]):
  if 'uri'in im:errors.append('external_image');continue
  v=j['bufferViews'][im['bufferView']];data=binary[v.get('byteOffset',0):v.get('byteOffset',0)+v['byteLength']];image=Image.open(io.BytesIO(data));image.load();images.append({'name':im.get('name'),'format':image.format,'size':image.size,'sha256':hashlib.sha256(data).hexdigest()})
 if p.stem!='collision':
  if not images:errors.append('visual_missing_images')
  for mi,m in enumerate(j.get('materials',[])):
   pm=m.get('pbrMetallicRoughness',{})
   for field in ['baseColorTexture','metallicRoughnessTexture']:
    if field not in pm:errors.append(f'material{mi}_missing_{field}')
   if 'normalTexture'not in m:errors.append(f'material{mi}_missing_normal')
  for mesh in j['meshes']:
   for primitive in mesh['primitives']:
    if 'TEXCOORD_0'not in primitive['attributes']:errors.append('missing_uv')
 reports.append({'path':str(p),'sha256':hashlib.sha256(raw).hexdigest(),'materials':len(j.get('materials',[])),'decodedEmbeddedImages':images,'errors':errors})
(out/'registry-textures.json').write_text(json.dumps({'registrySha256':hashlib.sha256(registry.read_bytes()).hexdigest(),'exactOriginalModules':expected,'modules':len(expected),'glbs':len(reports),'reports':reports,'allPass':all(not r['errors'] for r in reports)},indent=2)+'\n');assert all(not r['errors'] for r in reports)
