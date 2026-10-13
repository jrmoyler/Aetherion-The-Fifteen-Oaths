"""Omit a whole optional TANGENT attribute only when Blender exported zero vectors.
No replacement vectors are fabricated. Normals, UVs, positions and materials stay
unchanged. The consumer must generate tangent space for the affected primitives.
"""
from pathlib import Path
import json,struct,math,hashlib
p=Path(__file__).resolve().parent;f=p/'amethyst-short-blade/review.glb';raw=f.read_bytes()
n=struct.unpack_from('<I',raw,12)[0];doc=json.loads(raw[20:20+n]);chunk=20+n
bn,bt=struct.unpack_from('<II',raw,chunk);binary=raw[chunk+8:chunk+8+bn]
removed=[]
for mi,m in enumerate(doc['meshes']):
 for pi,pr in enumerate(m['primitives']):
  ai=pr['attributes'].get('TANGENT')
  if ai is None:continue
  a=doc['accessors'][ai];v=doc['bufferViews'][a['bufferView']]
  assert a['componentType']==5126 and a['type']=='VEC4'
  off=v.get('byteOffset',0)+a.get('byteOffset',0);stride=v.get('byteStride',16);bad=[]
  for i in range(a['count']):
   xyz=struct.unpack_from('<3f',binary,off+i*stride);length=math.sqrt(sum(t*t for t in xyz))
   if not math.isfinite(length) or abs(length-1)>.01:bad.append(i)
  if bad:
   del pr['attributes']['TANGENT'];removed.append({'mesh':mi,'name':m.get('name'),'primitive':pi,'accessor':ai,'invalidVectorIndices':bad,'resolution':'omit optional whole tangent attribute; runtime generation required'})
js=json.dumps(doc,separators=(',',':')).encode();js+=b' '*((-len(js))%4)
out=struct.pack('<III',0x46546c67,2,12+8+len(js)+8+len(binary))+struct.pack('<II',len(js),0x4e4f534a)+js+struct.pack('<II',len(binary),bt)+binary
f.write_bytes(out)
(p/'tangent-omission-receipt.json').write_text(json.dumps({'inputSHA256':hashlib.sha256(raw).hexdigest(),'outputSHA256':hashlib.sha256(out).hexdigest(),'removed':removed,'binaryUnchanged':binary==out[-len(binary):]},indent=2)+'\n')
print('Removed attributes:',len(removed))
