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
for root,label in [(BASE,'V15 baseline'),(NEW,'V16 candidate')]:
 for p in sorted(root.glob('*.glb')):
  if 'collision' in p.name:continue
  j,b=read(p);prims=[]
  for i,pr in enumerate(j['meshes'][0]['primitives']):
   pos=arr(j,b,pr['attributes']['POSITION']);idx=arr(j,b,pr['indices']).reshape(-1,3);uv=arr(j,b,pr['attributes']['TEXCOORD_0']);v=pos[idx];u=uv[idx];a=np.linalg.norm(np.cross(v[:,1]-v[:,0],v[:,2]-v[:,0]),axis=1)/2;ua=np.abs((u[:,1,0]-u[:,0,0])*(u[:,2,1]-u[:,0,1])-(u[:,1,1]-u[:,0,1])*(u[:,2,0]-u[:,0,0]))/2
   prims.append({'primitive':i,'material':j['materials'][pr['material']]['name'],'activeTriangles':len(idx),'exactZeroAreaTriangles':int((a==0).sum()),'below1eMinus12SquareMeters':int((a<1e-12).sum()),'nondegenerateGeometryCollapsedUvTriangles':int(((a>1e-12)&(ua<1e-12)).sum()),'zeroAreaTriangleRows':np.flatnonzero(a==0).tolist(),'collapsedUvTriangleRows':np.flatnonzero((a>1e-12)&(ua<1e-12)).tolist()})
  rows.append({'label':label,'file':str(p),'sha256':hashlib.sha256(p.read_bytes()).hexdigest(),'primitives':prims})
(OUT/'inherited-geometry-defects.json').write_text(json.dumps({'scope':'Active exported triangles, not unused original BIN/accessors. Existing atlas primitive retains defects; appended V16 bracer primitives have none. This report does not broaden the scoped revision into a cleanup.','reports':rows},indent=2)+'\n')
