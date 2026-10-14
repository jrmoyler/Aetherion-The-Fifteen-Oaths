from pathlib import Path
import hashlib,json,struct
p=Path(__file__).resolve().parent;a=p/'kiln-ninja-ensemble-candidate';b=Path('/tmp/ninja-v8b-reproduction-final/kiln-ninja-ensemble-candidate');rows=[]
for f in sorted(a.glob('*')):
 if not (b/f.name).exists():continue
 x=f.read_bytes();y=(b/f.name).read_bytes();row={'path':f.name,'originalSha256':hashlib.sha256(x).hexdigest(),'scratchSha256':hashlib.sha256(y).hexdigest(),'byteIdentical':x==y}
 if f.suffix=='.glb':
  def read(z):n=struct.unpack_from('<I',z,12)[0];return json.loads(z[20:20+n]),z[28+n:]
  j1,bin1=read(x);j2,bin2=read(y);row['jsonMetadataIdentical']=j1==j2;row['changedAccessorIndices']=[]
  for i,ac in enumerate(j1.get('accessors',[])):
   if 'bufferView' not in ac:continue
   v=j1['bufferViews'][ac['bufferView']];off=v.get('byteOffset',0);n=v['byteLength']
   if bin1[off:off+n]!=bin2[off:off+n]:row['changedAccessorIndices'].append(i)
 rows.append(row)
(p/'reproduction-evidence.json').write_text(json.dumps({'scope':'Actual scratch export build using the environment override. No byte-identical Blender/GLB rebuild guarantee. JSON/array checks are described per file.','command':'AETHERION_REVIEW_OUT=/tmp/ninja-v8b-reproduction-final blender -b -t 6 --python /tmp/ninja-v8b/kiln_ninja.py -- --face-diagnostic --export-only','rows':rows},indent=2)+'\n')
print([(r['path'],r['byteIdentical'],r.get('jsonMetadataIdentical'),len(r.get('changedAccessorIndices',[]))) for r in rows])
