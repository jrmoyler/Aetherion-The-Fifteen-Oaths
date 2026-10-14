import json,struct,hashlib,collections,io
from pathlib import Path
import numpy as np
from PIL import Image
BASE=Path('/workspace/scratch/ninja-v15/kiln-ninja-ensemble-candidate');NEW=Path('/workspace/scratch/ninja-v16/kiln-ninja-ensemble-candidate');OUT=Path(__file__).parent
DT={5121:'u1',5123:'<u2',5125:'<u4',5126:'<f4'};DIM={'SCALAR':1,'VEC2':2,'VEC3':3,'VEC4':4,'MAT4':16}
def read(p):
 b=p.read_bytes();n=struct.unpack_from('<I',b,12)[0];return json.loads(b[20:20+n]),b[28+n:]
def arr(j,b,i):
 a=j['accessors'][i];v=j['bufferViews'][a['bufferView']];d=np.dtype(DT[a['componentType']]);n=DIM[a['type']];return np.ndarray((a['count'],n),dtype=d,buffer=b,offset=v.get('byteOffset',0)+a.get('byteOffset',0),strides=(v.get('byteStride',d.itemsize*n),d.itemsize)).copy()
rows=[]
for p in sorted(NEW.glob('*.glb')):
 old=BASE/p.name;a,x=read(old);b,y=read(p)
 if 'collision' in p.name:rows.append({'file':p.name,'collisionEntireBytesExact':old.read_bytes()==p.read_bytes()});continue
 checks={'originalBinaryPrefixExact':y[:len(x)]==x,'originalAccessorDefinitionsExact':b['accessors'][:len(a['accessors'])]==a['accessors']}
 for k in ['nodes','skins','animations','materials','images','textures','samplers','scenes','scene']:checks[k+'Exact']=a.get(k)==b.get(k)
 oldprims=a['meshes'][0]['primitives'];newprims=b['meshes'][0]['primitives'];removed=[];newparts=[];triangles=0;degenerate=0;uvbad=0
 for i,pr in enumerate(newprims):
  pos=arr(b,y,pr['attributes']['POSITION']);idx=arr(b,y,pr['indices']).reshape(-1,3);triangles+=len(idx);uv=arr(b,y,pr['attributes']['TEXCOORD_0']);v=pos[idx];u=uv[idx];area=np.linalg.norm(np.cross(v[:,1]-v[:,0],v[:,2]-v[:,0]),axis=1)/2;uvarea=np.abs((u[:,1,0]-u[:,0,0])*(u[:,2,1]-u[:,0,1])-(u[:,1,1]-u[:,0,1])*(u[:,2,0]-u[:,0,0]))/2;degenerate+=int((area<1e-12).sum());uvbad+=int(((area>1e-12)&(uvarea<1e-12)).sum())
  if i<len(oldprims):
   prior=oldprims[i];checks['primitive%dAttributesExact'%i]=pr['attributes']==prior['attributes'];checks['primitive%dMaterialExact'%i]=pr.get('material')==prior.get('material');oldidx=arr(a,x,prior['indices']).reshape(-1,3);cursor=0;gone=[]
   for k,t in enumerate(oldidx):
    if cursor<len(idx) and np.array_equal(t,idx[cursor]):cursor+=1
    else:gone.append(k)
   checks['primitive%dKeptTrianglesExactOrderedSubset'%i]=cursor==len(idx)
   if gone:
    rp=pos[np.unique(oldidx[gone])];removed.append({'primitive':i,'removedTriangles':len(gone),'boundsGltf':[rp.min(axis=0).tolist(),rp.max(axis=0).tolist()],'oldTriangleRows':gone})
  else:
   joints=arr(b,y,pr['attributes']['JOINTS_0']);weights=arr(b,y,pr['attributes']['WEIGHTS_0']);names=[b['nodes'][n]['name'] for n in b['skins'][0]['joints']];forearm=names.index('forearm.L');valid=bool(np.all(joints[weights>0]==forearm) and np.allclose(weights.sum(axis=1),1,atol=1e-7));newparts.append({'primitive':i,'triangles':len(idx),'degenerateGeometryTriangles':int((area<1e-12).sum()),'collapsedUvTriangles':int(((area>1e-12)&(uvarea<1e-12)).sum()),'vertices':len(pos),'allWeightedToForearmL':valid,'boundsGltf':[pos.min(axis=0).tolist(),pos.max(axis=0).tolist()]});checks['new%dRigidForearmL'%i]=valid
 images=[]
 for im in b.get('images',[]):
  v=b['bufferViews'][im['bufferView']];blob=y[v.get('byteOffset',0):v.get('byteOffset',0)+v['byteLength']];image=Image.open(io.BytesIO(blob));image.load();images.append({'sha256':hashlib.sha256(blob).hexdigest(),'size':image.size})
 rows.append({'file':p.name,'sha256':hashlib.sha256(p.read_bytes()).hexdigest(),'checks':checks,'allPreservationChecksPass':all(checks.values()),'activeTriangles':triangles,'degenerateGeometryTriangles':degenerate,'collapsedUvTriangles':uvbad,'removed':removed,'newComponents':newparts,'decodedImages':images})
(OUT/'glb-preservation.json').write_text(json.dumps(rows,indent=2)+'\n');print([(r['file'],r.get('allPreservationChecksPass'),r.get('activeTriangles'),r.get('degenerateGeometryTriangles'),r.get('collapsedUvTriangles')) for r in rows])
