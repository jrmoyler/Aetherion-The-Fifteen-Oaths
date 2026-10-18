"""Validate mesh changes, skin/animation preservation and finite unit normals."""
import json,struct,pathlib,subprocess,sys
import numpy as np
ROOT=pathlib.Path(__file__).resolve().parents[2]
BASE='4080e58d17d56bb5a92dfe3556630258d0762205'
def unpack(data):
 n=struct.unpack_from('<I',data,12)[0];assert struct.unpack_from('<I',data,8)[0]==len(data)
 return json.loads(data[20:20+n]),data[28+n:]
def read(j,b,i):
 a=j['accessors'][i];v=j['bufferViews'][a['bufferView']];c={'SCALAR':1,'VEC2':2,'VEC3':3,'VEC4':4,'MAT4':16}[a['type']];d={5126:'<f4',5125:'<u4',5123:'<u2',5121:'u1'}[a['componentType']]
 return np.ndarray((a['count'],c),dtype=d,buffer=b,offset=v.get('byteOffset',0)+a.get('byteOffset',0),strides=(v.get('byteStride',np.dtype(d).itemsize*c),np.dtype(d).itemsize)).copy()
for p in sorted((ROOT/'game/public/assets/characters').glob('*.glb')):
 j,b=unpack(p.read_bytes());old,ob=unpack(subprocess.check_output(['git','show',f'{BASE}:{p.relative_to(ROOT)}'],cwd=ROOT))
 assert j['skins']==old['skins'] and j['nodes']==old['nodes'] and j['animations']==old['animations'],p.name
 for anim in j['animations']:
  for s in anim['samplers']:
   for k in ['input','output']:assert np.array_equal(read(j,b,s[k]),read(old,ob,s[k])),(p.name,'animation bytes')
 for skin in j['skins']:assert np.array_equal(read(j,b,skin['inverseBindMatrices']),read(old,ob,skin['inverseBindMatrices']))
 for mesh in j['meshes']:
  for prim in mesh['primitives']:
   attrs=prim['attributes'];v=read(j,b,attrs['POSITION']);n=read(j,b,attrs['NORMAL']);w=read(j,b,attrs['WEIGHTS_0']);idx=read(j,b,prim['indices'])
   assert np.isfinite(v).all() and np.isfinite(n).all()
   assert np.allclose(np.linalg.norm(n,axis=1),1,atol=.002)
   assert np.allclose(w.sum(1),1,atol=.002) and idx.max()<len(v)
   assert read(j,b,attrs['JOINTS_0']).max()<len(j['skins'][0]['joints'])
 p0=j['meshes'][0]['primitives'][0]['attributes']['POSITION'];p1=old['meshes'][0]['primitives'][0]['attributes']['POSITION'];delta=np.linalg.norm(read(j,b,p0)-read(old,ob,p1),axis=1)
 assert np.count_nonzero(delta>1e-7)>20 and delta.max()<.035,(p.name,delta.max())
print('PASS: 30 changed meshes; skins, bind poses and all animation bytes preserved; finite normals, indices and skin weights.')
