import json,struct,hashlib,copy,shutil
from pathlib import Path
import numpy as np
P=Path(__file__).resolve().parent;ID='kiln-ninja-ensemble-candidate';BASE=P/'baseline';D=P/ID
T={5121:np.uint8,5123:np.dtype('<u2'),5125:np.dtype('<u4'),5126:np.dtype('<f4')};C={'SCALAR':1,'VEC2':2,'VEC3':3,'VEC4':4,'MAT4':16}
def readglb(p):
 b=p.read_bytes();n=struct.unpack_from('<I',b,12)[0];j=json.loads(b[20:20+n]);sz=struct.unpack_from('<I',b,20+n)[0];return j,bytearray(b[28+n:28+n+sz])
def arr(j,b,a):
 a=j['accessors'][a];v=j['bufferViews'][a['bufferView']];dt=T[a['componentType']];dim=C[a['type']];sz=np.dtype(dt).itemsize;off=v.get('byteOffset',0)+a.get('byteOffset',0);return np.ndarray((a['count'],dim),dtype=dt,buffer=b,offset=off,strides=(v.get('byteStride',dim*sz),sz)).copy()
def append(j,b,x,typ,ctype,target=None):
 while len(b)%4:b.append(0)
 x=np.asarray(x,dtype=T[ctype]);v={'buffer':0,'byteOffset':len(b),'byteLength':x.nbytes}
 if target:v['target']=target
 j['bufferViews'].append(v);b.extend(x.tobytes());a={'bufferView':len(j['bufferViews'])-1,'componentType':ctype,'count':len(x),'type':typ}
 if typ in ['VEC3','SCALAR'] and ctype==5126:a.update(min=x.reshape(len(x),-1).min(axis=0).astype(float).tolist(),max=x.reshape(len(x),-1).max(axis=0).astype(float).tolist())
 j['accessors'].append(a);return len(j['accessors'])-1
def write(p,j,b):
 j['buffers'][0]['byteLength']=len(b)
 while len(b)%4:b.append(0)
 s=json.dumps(j,separators=(',',':')).encode();s+=b' '*((-len(s))%4);p.write_bytes(struct.pack('<III',0x46546c67,2,28+len(s)+len(b))+struct.pack('<II',len(s),0x4e4f534a)+s+struct.pack('<II',len(b),0x004e4942)+b)
receipts=[]
for level,suffix in [(0,''),(1,'-lod1'),(2,'-lod2')]:
 file=ID+suffix+'.glb';j,b=readglb(BASE/file);original=copy.deepcopy(j);prefix=bytes(b);n,nb=readglb(P/'component-exports'/('bracer-lod%d.glb'%level));removed=[];before=sum(j['accessors'][p['indices']]['count']//3 for m in j['meshes'] for p in m['primitives']);destination=j['meshes'][0]['primitives']
 for pi,prim in enumerate(destination):
  if 'TEXCOORD_0' not in prim['attributes']:continue
  pos=arr(j,b,prim['attributes']['POSITION']);uv=arr(j,b,prim['attributes']['TEXCOORD_0']);idx=arr(j,b,prim['indices']).reshape(-1,3)
  # Frozen old bracer is the only ceramic/iron geometry within these conservative bounds.
  # Y is glTF world-up and Z is -Blender Y; glTF texture V is flipped.
  mask=(pos[:,0]>.26)&(pos[:,0]<.42)&(pos[:,1]>1.03)&(pos[:,1]<1.21)&(pos[:,2]>.035)&(pos[:,2]<.075)&(uv[:,0]>.25)&(uv[:,0]<.75)&(uv[:,1]>.5)
  gone=np.all(mask[idx],axis=1)
  if not np.any(gone):continue
  oldidx=prim['indices'];removedpos=pos[np.unique(idx[gone])];removed.append({'primitive':pi,'material':prim.get('material'),'originalIndexAccessor':oldidx,'removedTriangleCount':int(gone.sum()),'removedTriangleRows':np.where(gone)[0].tolist(),'uniqueRemovedVertices':int(len(removedpos)),'boundsGltf':[removedpos.min(axis=0).tolist(),removedpos.max(axis=0).tolist()],'exactRemovedIndicesSha256':hashlib.sha256(idx[gone].tobytes()).hexdigest(),'keptIndexBytesSha256':hashlib.sha256(idx[~gone].tobytes()).hexdigest()});prim['indices']=append(j,b,idx[~gone].reshape(-1,1),'SCALAR',5125,34963)
 assert removed and sum(r['removedTriangleCount'] for r in removed)>100,removed
 oldskin=j['skins'][0];newskin=n['skins'][0];oldnames=[j['nodes'][x]['name'] for x in oldskin['joints']];newnames=[n['nodes'][x]['name'] for x in newskin['joints']];mapping=np.array([oldnames.index(name) for name in newnames]);ibold=arr(j,b,oldskin['inverseBindMatrices']);ibnew=arr(n,nb,newskin['inverseBindMatrices']);assert np.allclose(ibnew,ibold[mapping],atol=1e-7),np.max(abs(ibnew-ibold[mapping]))
 added=[]
 for mesh in n['meshes']:
  for prim in mesh['primitives']:
   p={'attributes':{},'material':0};counts={}
   for sem,ai in prim['attributes'].items():
    a=n['accessors'][ai];x=arr(n,nb,ai)
    if sem=='JOINTS_0':x=mapping[x]
    p['attributes'][sem]=append(j,b,x,a['type'],a['componentType'],34962);counts[sem]=hashlib.sha256(x.tobytes()).hexdigest()
   ia=n['accessors'][prim['indices']];x=arr(n,nb,prim['indices']);p['indices']=append(j,b,x,'SCALAR',ia['componentType'],34963);destination.append(p);added.append({'primitive':len(destination)-1,'triangles':len(x)//3,'attributeHashes':counts,'forearmJoint':oldnames.index('forearm.L')})
 assert bytes(b[:len(prefix)])==prefix
 for key in ['nodes','skins','animations','materials','images','textures','samplers']:assert j.get(key)==original.get(key),key
 write(D/file,j,b);receipts.append({'file':file,'baselineSha256':hashlib.sha256((BASE/file).read_bytes()).hexdigest(),'candidateSha256':hashlib.sha256((D/file).read_bytes()).hexdigest(),'originalBinaryPrefixExact':True,'originalAccessorDefinitionsExact':j['accessors'][:len(original['accessors'])]==original['accessors'],'rigAndAllAnimationJsonExact':True,'removed':removed,'added':added,'beforeTriangles':before,'afterTriangles':sum(j['accessors'][p['indices']]['count']//3 for m in j['meshes'] for p in m['primitives'])})
 print(file,receipts[-1]['beforeTriangles'],receipts[-1]['afterTriangles'],'removed',sum(x['removedTriangleCount'] for x in removed))
shutil.copyfile(BASE/(ID+'-collision.glb'),D/(ID+'-collision.glb'));(P/'export-preservation.json').write_text(json.dumps(receipts,indent=2)+'\n')
