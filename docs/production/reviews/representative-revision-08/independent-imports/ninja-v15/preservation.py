import json,struct,hashlib,copy
from pathlib import Path
root=Path('/workspace/scratch/ninja-v15');old=Path('/tmp/ninja-v13/kiln-ninja-ensemble-candidate');new=root/'kiln-ninja-ensemble-candidate';rows=[]
def parse(p):
 b=p.read_bytes();n=struct.unpack_from('<I',b,12)[0];j=json.loads(b[20:20+n]);off=20+n;return j,b[off+8:off+8+struct.unpack_from('<I',b,off)[0]]
for p in sorted(new.glob('*.glb')):
 baseline=old/p.name;a,x=parse(baseline);b,y=parse(p)
 if 'collision' in p.name:
  rows.append({'file':p.name,'entireFileExact':baseline.read_bytes()==p.read_bytes()});continue
 changes=[]
 for i,(ac,bc) in enumerate(zip(a['animations'],b['animations'])):
  for k,(sa,sb) in enumerate(zip(ac['samplers'],bc['samplers'])):
   if sa!=sb:changes.append((i,k))
 assert len(changes)==1,changes
 i,k=changes[0];channels=[c for c in b['animations'][i]['channels'] if c['sampler']==k];assert len(channels)==1
 c=channels[0];target={'clip':b['animations'][i]['name'],'node':b['nodes'][c['target']['node']]['name'],'path':c['target']['path']}
 assert target=={'clip':'walk_in_place','node':'pelvis','path':'translation'},target
 canonical=copy.deepcopy(b['animations']);canonical[i]['samplers'][k]=a['animations'][i]['samplers'][k]
 fields=['nodes','meshes','skins','materials','textures','images','scenes','scene']
 rows.append({'file':p.name,'sha256':hashlib.sha256(p.read_bytes()).hexdigest(),'baselineSha256':hashlib.sha256(baseline.read_bytes()).hexdigest(),'baselineCopyExact':(root/'baseline'/p.name).read_bytes()==baseline.read_bytes(),'binaryPrefixExact':y[:len(x)]==x,'all379PriorAccessorDefinitionsExact':b['accessors'][:len(a['accessors'])]==a['accessors'],'geometryRigMaterialJSONExact':all(a.get(f)==b.get(f) for f in fields),'allOtherAnimationJSONExact':canonical==a['animations'],'onlyChangedTarget':target,'keyCount':b['accessors'][b['animations'][i]['samplers'][k]['input']]['count']})
assert all(all(v for k,v in r.items() if k.endswith('Exact')) for r in rows)
Path(__file__).with_suffix('.json').write_text(json.dumps(rows,indent=2)+'\n')
