from pathlib import Path
import json,struct,hashlib
p=Path(__file__).resolve().parent;d=p/'kiln-ninja-ensemble-candidate'
def read(path):
 raw=path.read_bytes();n=struct.unpack_from('<I',raw,12)[0];j=json.loads(raw[20:20+n]);offset=20+n;size=struct.unpack_from('<I',raw,offset)[0];return j,raw[offset+8:offset+8+size]
def digest(data):return hashlib.sha256(data).hexdigest()
report=[]
for old in sorted((p/'baseline').glob('*.glb')):
 a,ab=read(old);b,bb=read(d/old.name);rows=[]
 for i,accessor in enumerate(a.get('accessors',[])):
  assert accessor==b['accessors'][i]
  v=a['bufferViews'][accessor['bufferView']];assert v==b['bufferViews'][accessor['bufferView']];offset=v.get('byteOffset',0);av=ab[offset:offset+v['byteLength']];bv=bb[offset:offset+v['byteLength']];assert av==bv
  rows.append({'accessor':i,'type':accessor['type'],'count':accessor['count'],'componentType':accessor['componentType'],'bufferViewSha256':digest(av),'exact':True})
 for k in ['meshes','nodes','skins','animations']:assert a.get(k)==b.get(k)
 maps=[]
 for im in b.get('images',[]):
  if im.get('name','').startswith('V14 baked '):
   suffix=im['name'].removeprefix('V14 baked ');v=b['bufferViews'][im['bufferView']];blob=bb[v['byteOffset']:v['byteOffset']+v['byteLength']];png=(d/('kiln-ninja-ensemble-candidate-'+suffix+'.png')).read_bytes();assert blob==png;maps.append({'map':suffix,'embeddedPngSha256':digest(blob),'exactExternalPng':True})
 report.append({'file':old.name,'accessors':rows,'meshNodeSkinAnimationJsonExact':True,'maps':maps})
(p/'accessor-and-image-verification.json').write_text(json.dumps(report,indent=2)+'\n');print([(r['file'],len(r['accessors']),len(r['maps'])) for r in report])
