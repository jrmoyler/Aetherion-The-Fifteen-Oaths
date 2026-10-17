#!/usr/bin/env python3
"""CI-ready, no-DCC-required structural tests for only the R07 review GLBs.
These tests do not prove artwork likeness, cinematic motion or engine performance.
"""
import hashlib, json, math, struct, unittest
from pathlib import Path

REPO=Path(__file__).resolve().parents[1]
ROOT=REPO/'assets/production/reviews/roster-r07'
EXPECTED={
 'creature-o01-natural':('4b134d85e1e216709adf206a79391220f1e37c1f4b033623fa9532b74a120e5a',14,12476),
 'creature-o03-natural':('ac0fb9f93628e5f3d75424231e1e729cf28deda5c3c12bfa63bf076a24b9c0a4',12,10044),
 'creature-o04-natural':('6c59fe862e271534e140e13eba807e81968822e778e08a7e754733f4527da762',12,14696),
}


def read_glb(path):
 data=path.read_bytes()
 if data[:4]!=b'glTF' or len(data)<28:raise ValueError('Bad glTF magic')
 version,length=struct.unpack_from('<II',data,4)
 if version!=2 or length!=len(data):raise ValueError('Invalid GLB container')
 jsize,jmagic=struct.unpack_from('<I4s',data,12)
 if jmagic!=b'JSON' or jsize%4:raise ValueError('Bad JSON chunk')
 doc=json.loads(data[20:20+jsize]);offset=20+jsize
 bsize,bmagic=struct.unpack_from('<I4s',data,offset)
 if bmagic!=b'BIN\x00' or offset+8+bsize!=len(data):raise ValueError('Bad BIN chunk')
 return data,doc,data[offset+8:]


def array(doc,body,ai):
 a=doc['accessors'][ai];v=doc['bufferViews'][a['bufferView']]
 fmt={5126:'f',5125:'I',5123:'H'}[a['componentType']]
 width=struct.calcsize('<'+fmt)
 size={'SCALAR':1,'VEC2':2,'VEC3':3,'VEC4':4,'MAT4':16}[a['type']]
 if v.get('byteStride'):raise ValueError('Unexpected strided data')
 off=v.get('byteOffset',0)+a.get('byteOffset',0)
 if off+a['count']*width*size>len(body):raise ValueError('Out-of-bounds accessor')
 return [struct.unpack_from('<'+fmt*size,body,off+i*width*size) for i in range(a['count'])]


class ReviewCandidateIntegrity(unittest.TestCase):
 def test_models(self):
  for identity,(sha,bones,expected_faces) in EXPECTED.items():
   with self.subTest(identity=identity):
    raw,doc,body=read_glb(ROOT/(identity+'.glb'))
    self.assertEqual(hashlib.sha256(raw).hexdigest(),sha)
    self.assertEqual(doc['extras']['reference_fidelity_approved'],False)
    self.assertEqual(doc['extras']['coordinate_convention'],'GLTF_Y_UP_ROOT_ALIGNED_V1')
    self.assertEqual(doc['extras']['r07_stats']['faces'],expected_faces)
    self.assertEqual(len(doc['skins'][0]['joints']),bones)
    self.assertEqual(len(doc['animations']),21)
    self.assertLessEqual(len(doc['meshes'][0]['primitives']),6)
    self.assertGreaterEqual(len(doc['images']),18)
    face_count=0
    for primitive in doc['meshes'][0]['primitives']:
     attrs=primitive['attributes']
     self.assertTrue({'POSITION','NORMAL','TEXCOORD_0','JOINTS_0','WEIGHTS_0'}<=set(attrs))
     v=array(doc,body,attrs['POSITION']);w=array(doc,body,attrs['WEIGHTS_0']);j=array(doc,body,attrs['JOINTS_0'])
     idx=array(doc,body,primitive['indices']);face_count+=len(idx)//3
     self.assertTrue(all(abs(sum(x)-1)<1e-5 for x in w))
     self.assertTrue(all(all(0<=u<bones for u in skin) for skin in j))
     self.assertTrue(all(all(math.isfinite(p) for p in vert) for vert in v))
     for i in range(0,len(idx),3):
      a,b,c=(v[idx[i+k][0]] for k in range(3))
      u=[b[k]-a[k] for k in range(3)];q=[c[k]-a[k] for k in range(3)]
      cross=[u[1]*q[2]-u[2]*q[1],u[2]*q[0]-u[0]*q[2],u[0]*q[1]-u[1]*q[0]]
      self.assertGreater(sum(y*y for y in cross),1e-20)
    self.assertEqual(face_count,expected_faces)
 def test_burrower_has_articulated_middle_legs(self):
  _,doc,_=read_glb(ROOT/'creature-o01-natural.glb')
  names={n.get('name') for n in doc['nodes']}
  self.assertTrue({'leg.middle.L','leg.middle.R'}<=names)
  targets={doc['nodes'][ch['target']['node']]['name'] for animation in doc['animations'] for ch in animation['channels']}
  self.assertTrue({'leg.middle.L','leg.middle.R'}<=targets)

if __name__=='__main__':unittest.main()
