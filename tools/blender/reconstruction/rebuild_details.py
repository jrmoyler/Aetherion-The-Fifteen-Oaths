"""Blender-authored costume geometry appended to pinned GLBs.
Run blender -b --python this_file -- [hero keys]. Original geometry, inverse bind
matrices and every animation byte remain intact. New primitives use original joints.
"""
import bpy, json, struct, math, hashlib, subprocess, sys
from pathlib import Path
from mathutils import Vector
ROOT=Path(__file__).resolve().parents[3]
BASE='3c991ee6e83dce6bd13a8bade714fc463e4263be'
OUT=ROOT/'game/public/assets/characters'
REPORT=ROOT/'validation/reconstruction-continuation'
REPORT.mkdir(parents=True,exist_ok=True)
keys=sys.argv[sys.argv.index('--')+1:] if '--' in sys.argv else []
keys=keys or ['oath-01-sorcerer','oath-03-sorcerer','oath-14-sorcerer']

def unpack(blob):
 n=struct.unpack_from('<I',blob,12)[0];j=json.loads(blob[20:20+n]);b=bytearray(blob[28+n:]);return j,b

def pack(j,b):
 while len(b)%4:b.append(0)
 j['buffers'][0]['byteLength']=len(b)
 t=json.dumps(j,separators=(',',':')).encode();t+=b' '*((-len(t))%4)
 return struct.pack('<4sII',b'glTF',2,28+len(t)+len(b))+struct.pack('<I4s',len(t),b'JSON')+t+struct.pack('<I4s',len(b),b'BIN\0')+b

def accessor(j,b,values,typ,components,code=5126):
 fmt={5126:'f',5123:'H',5125:'I'}[code];raw=struct.pack('<'+fmt*len(values),*values)
 while len(b)%4:b.append(0)
 vi=len(j['bufferViews']);j['bufferViews'].append(dict(buffer=0,byteOffset=len(b),byteLength=len(raw)));b.extend(raw)
 a=dict(bufferView=vi,componentType=code,count=len(values)//components,type=typ)
 if typ=='VEC3':a.update(min=[min(values[i::3]) for i in range(3)],max=[max(values[i::3]) for i in range(3)])
 ai=len(j['accessors']);j['accessors'].append(a);return ai

for key in keys:
 src=subprocess.check_output(['git','show',f'{BASE}:game/public/assets/characters/{key}.glb'],cwd=ROOT)
 j,b=unpack(src);bpy.ops.wm.read_factory_settings(use_empty=True)
 skin=j['skins'][0];jointNames=[j['nodes'][n]['name'] for n in skin['joints']]
 mats={};objects=[]
 palette={'iron':('#51473c',.72,.56),'leather':('#30261e',0,.86),'terra':('#9c4b2d',0,.83),'edge':('#967351',.45,.62),'navy':('#202b3e',0,.91),'copper':('#ad7448',.7,.48),'teal':('#243e41',0,.88),'brass':('#a98448',.72,.48),'ivory':('#c5bba5',0,.88),'glass':('#272b2c',.25,.25)}
 def material(kind):
  if kind not in mats:
   col,metal,rough=palette[kind];rgb=[int(col[i:i+2],16)/255 for i in (1,3,5)]
   # glTF color factors are linear.
   rgb=[v/12.92 if v<=.04045 else ((v+.055)/1.055)**2.4 for v in rgb]
   mats[kind]=len(j.setdefault('materials',[]));j['materials'].append(dict(name='reconstructed-'+kind,pbrMetallicRoughness=dict(baseColorFactor=[*rgb,1],metallicFactor=metal,roughnessFactor=rough),doubleSided=kind in ['navy','teal','ivory','terra']))
   texturePath=OUT/'reconstruction'/f'{kind}-surface.png'
   if texturePath.exists():
    raw=texturePath.read_bytes()
    while len(b)%4:b.append(0)
    vi=len(j['bufferViews']);j['bufferViews'].append(dict(buffer=0,byteOffset=len(b),byteLength=len(raw)));b.extend(raw)
    ii=len(j.setdefault('images',[]));j['images'].append(dict(bufferView=vi,mimeType='image/png',name=f'{kind}-reference-surface'))
    si=len(j.setdefault('samplers',[]));j['samplers'].append(dict(magFilter=9729,minFilter=9987,wrapS=10497,wrapT=10497))
    ti=len(j.setdefault('textures',[]));j['textures'].append(dict(source=ii,sampler=si))
    pbr=j['materials'][mats[kind]]['pbrMetallicRoughness'];pbr['baseColorFactor']=[1,1,1,1];pbr['baseColorTexture']={'index':ti}
  return mats[kind]
 # Y-up coordinates intentionally retained inside Blender so the binary appender
 # does not need an axis conversion or an animation round trip.
 f=1 if key=='oath-01-sorcerer' else 1.065 if key=='oath-03-sorcerer' else 1.075
 def register(o,kind,bone='spine2'):
  o['kind']=kind;o['joint']=bone;objects.append(o);return o
 def box(name,loc,dims,kind,bone='spine2',bevel=.003):
  bpy.ops.mesh.primitive_cube_add(size=1,location=tuple(v*f for v in loc));o=bpy.context.object;o.name=name;o.dimensions=tuple(v*f for v in dims)
  bpy.ops.object.transform_apply(location=False,rotation=False,scale=True)
  if bevel:
   m=o.modifiers.new('crafted edge','BEVEL');m.width=bevel*f;m.segments=3
   m=o.modifiers.new('weighted normals','WEIGHTED_NORMAL')
  return register(o,kind,bone)
 def tube(name,pts,r,kind,bone='spine2'):
  cu=bpy.data.curves.new(name,'CURVE');cu.dimensions='3D';cu.resolution_u=8;cu.bevel_depth=r*f;cu.bevel_resolution=2
  sp=cu.splines.new('POLY');sp.points.add(len(pts)-1)
  for p,v in zip(sp.points,pts):p.co=(*[x*f for x in v],1)
  o=bpy.data.objects.new(name,cu);bpy.context.collection.objects.link(o);return register(o,kind,bone)
 def panel(name,rows,kind,bone='spine2',fold=.002):
  # Rows: (height, left, right, forward depth). Actual cloth surface, not a plane.
  V=[];F=[];N=28
  for k,(y,l,r,z) in enumerate(rows):
   for n in range(N+1):
    t=n/N;x=l+(r-l)*t;zz=z-.035*(2*t-1)**2+fold*math.sin(t*math.pi*10+k*.25)
    V.append((x*f,y*f,zz*f))
  for k in range(len(rows)-1):
   for n in range(N):a=k*(N+1)+n;F.append((a,a+1,a+N+2,a+N+1))
  me=bpy.data.meshes.new(name);me.from_pydata(V,[],F);me.update();o=bpy.data.objects.new(name,me);bpy.context.collection.objects.link(o)
  sol=o.modifiers.new('cloth thickness','SOLIDIFY');sol.thickness=.003*f
  for p in me.polygons:p.use_smooth=True
  return register(o,kind,bone)
 def buckle(name,x,y,z,kind='iron',bone='spine2',w=.04,h=.045):
  tube(name,[(x-w/2,y-h/2,z),(x+w/2,y-h/2,z),(x+w/2,y+h/2,z),(x-w/2,y+h/2,z),(x-w/2,y-h/2,z)],.0035,kind,bone)
  tube(name+' tongue',[(x,y-h/2,z+.002),(x,y+h*.26,z+.002)],.002,kind,bone)
 if key=='oath-01-sorcerer':
  panel('shaped ceramic chest bib',[(1.28,-.15,.15,.19),(1.23,-.18,.18,.23),(1.15,-.19,.19,.255),(1.04,-.195,.195,.24)],'terra')
  panel('heavy apron',[(.98,-.20,.20,.23),(.88,-.225,.225,.25),(.75,-.25,.25,.26),(.58,-.27,.27,.26)],'terra','hips',.0015)
  for side in [-1,1]:
   tube('apron binding',[(side*.20,.98,.232),(side*.225,.88,.252),(side*.25,.75,.262),(side*.27,.58,.262)],.005,'edge','hips')
   tube('shoulder harness',[(side*.16,1.05,.24),(side*.16,1.24,.22),(side*.16,1.34,.10),(side*.16,1.34,-.09),(side*.16,1.20,-.23)],.016,'leather')
   buckle('shoulder buckle',side*.16,1.24,.242,w=.045,h=.052)
   box('belt fastener',(side*.16,1.0,.235),(.045,.045,.012),'iron','hips')
  tube('apron lower binding',[(-.27,.58,.262),(0,.58,.286),(.27,.58,.262)],.005,'edge','hips')
  buckle('belt buckle',0,1.0,.258,bone='hips',w=.065,h=.045)
  box('kiln door',(0,1.23,-.34),(.23,.27,.025),'iron')
  box('fired door inset',(0,1.23,-.358),(.185,.22,.012),'terra')
  for x in [-.062,-.021,.021,.062]:box('kiln vent',(x,1.23,-.368),(.012,.155,.008),'iron')
  for side in [-1,1]:
   for y in [1.13,1.33]:box('door hinge',(side*.12,y,-.37),(.026,.035,.025),'iron')
 elif key=='oath-03-sorcerer':
  V=[];F=[];N=80;M=18
  for k in range(M+1):
   t=k/M;y=1.365-.29*t;rx=.13+.29*math.sin(t*math.pi/2);rz=.12+.14*math.sin(t*math.pi/2)
   for n in range(N+1):
    a=n/N*2*math.pi;fold=.005*math.sin(a*14)*(t**1.5)
    V.append(((rx+fold)*math.cos(a)*f,y*f,(rz+fold)*math.sin(a)*f))
  for k in range(M):
   for n in range(N):a=k*(N+1)+n;F.append((a,a+1,a+N+2,a+N+1))
  me=bpy.data.meshes.new('draped relay cape');me.from_pydata(V,[],F);me.update();o=bpy.data.objects.new(me.name,me);bpy.context.collection.objects.link(o)
  for p in me.polygons:p.use_smooth=True
  so=o.modifiers.new('cloth thickness','SOLIDIFY');so.thickness=.004;register(o,'navy')
  for y,rx,rz in [(1.365,.132,.122),(1.075,.423,.263)]:tube('copper cape binding',[(rx*math.cos(i/N*2*math.pi),y,rz*math.sin(i/N*2*math.pi)) for i in range(N+1)],.005,'copper')
  for side in [-1,1]:
   box('belt pouch',(side*.24,.96,.20),(.11,.15,.06),'navy','hips')
   buckle('pouch clasp',side*.24,.99,.236,'copper','hips',.035,.03)
  buckle('relay belt',0,.985,.225,'copper','hips',.065,.05)
 elif key=='oath-14-sorcerer':
  panel('angular crossing lapel',[(1.31,-.16,-.08,.145),(1.27,-.18,.14,.17),(1.20,-.09,.16,.19),(1.10,.075,.13,.19)],'teal')
  tube('lapel brass edge',[(-.16,1.31,.15),(-.18,1.27,.175),(-.09,1.20,.195),(.075,1.10,.195)],.0035,'brass')
  panel('left asymmetric coat skirt',[(.98,-.21,-.025,.21),(.84,-.235,.01,.245),(.65,-.25,.03,.26),(.51,-.20,.04,.255)],'teal','hips',.003)
  panel('right asymmetric coat skirt',[(.98,.015,.20,.225),(.85,.02,.23,.255),(.69,.04,.25,.27),(.62,.09,.25,.27)],'teal','hips',.002)
  for pts in [[(-.21,.98,.22),(-.235,.84,.25),(-.25,.65,.265),(-.20,.51,.26),(.04,.51,.26)],[(.20,.98,.23),(.23,.85,.26),(.25,.69,.275),(.25,.62,.275),(.09,.62,.275)]]:tube('tailored brass hem',pts,.003,'brass','hips')
  buckle('escapement belt',.025,1.0,.238,'brass','hips',.06,.045)
  for x,y in [(-.13,1.27),(.12,1.22),(.1,1.12)]:box('lapel button',(x,y,.197),(.012,.012,.008),'brass')
 # Evaluate Blender modifiers and append one primitive per material/skin-weight
 # policy. Coordinates remain in original bind space; original bytes are untouched.
 deps=bpy.context.evaluated_depsgraph_get();groups={}
 for o in objects:
  ev=o.evaluated_get(deps);me=ev.to_mesh();me.calc_loop_triangles();kind=o['kind'];bone=o['joint'];g=groups.setdefault(kind,dict(p=[],n=[],c=[],uv=[],j=[],w=[],i=[]));joint=jointNames.index(bone)
  for tri in me.loop_triangles:
   for li in tri.loops:
    loop=me.loops[li];v=me.vertices[loop.vertex_index];p=ev.matrix_world@v.co
    if key=='oath-14-sorcerer':p.z*=.55
    elif key=='oath-01-sorcerer' and p.z>0:p.z*=.82
    n=ev.matrix_world.to_3x3()@me.corner_normals[li].vector;
    if key=='oath-14-sorcerer':n.z/=.55
    elif key=='oath-01-sorcerer' and p.z>0:n.z/=.82
    n.normalize();ix=len(g['p'])//3
    g['p']+=list(p);g['n']+=list(n);g['i'].append(ix);g['uv'] += [p.x*7+p.z*3,p.y*7]
    grain=.92+.08*math.sin(p.x*733+p.y*919)*math.sin(p.z*811+p.x*433)
    if kind=='terra':grain=.78+.22*math.sin(p.x*200+p.y*311)**2
    g['c'] += [grain]*3
    if bone=='hips' and p.y/f<.95 and kind in ['terra','teal','edge','brass']:
     t=min(.7,max(0,(.95-p.y/f)/.40)*.7);leg=jointNames.index('thigh.L' if p.x>0 else 'thigh.R')
     g['j'] += [joint,leg,0,0];g['w'] += [1-t,t,0,0]
    else:
     g['j'] += [joint,0,0,0];g['w'] += [1,0,0,0]
  ev.to_mesh_clear()
 if key=='oath-01-sorcerer':
  for primitive in j['meshes'][0]['primitives']:
   pa=j['accessors'][primitive['attributes']['POSITION']];pv=j['bufferViews'][pa['bufferView']]
   ia=j['accessors'][primitive['indices']];iv=j['bufferViews'][ia['bufferView']]
   typ={5123:'H',5125:'I'}[ia['componentType']]
   ids=struct.unpack_from('<'+typ*ia['count'],b,iv.get('byteOffset',0)+ia.get('byteOffset',0));keep=[]
   for k in range(0,len(ids),3):
    tri=ids[k:k+3];pts=[struct.unpack_from('<fff',b,pv.get('byteOffset',0)+pa.get('byteOffset',0)+ix*12) for ix in tri]
    covered=all(abs(x)<.25 and .58<y<.99 and z>.17 for x,y,z in pts)
    if not covered:keep.extend(tri)
   if len(keep)!=len(ids):primitive['indices']=accessor(j,b,keep,'SCALAR',1,ia['componentType'])
 added=0
 for kind,g in groups.items():
  attrs={name:accessor(j,b,g[field],typ,n,code) for name,field,typ,n,code in [('POSITION','p','VEC3',3,5126),('NORMAL','n','VEC3',3,5126),('TEXCOORD_0','uv','VEC2',2,5126),('COLOR_0','c','VEC3',3,5126),('JOINTS_0','j','VEC4',4,5123),('WEIGHTS_0','w','VEC4',4,5126)]}
  prim=dict(attributes=attrs,indices=accessor(j,b,g['i'],'SCALAR',1,5125),material=material(kind),mode=4)
  j['meshes'][0]['primitives'].append(prim);added+=len(g['i'])//3
 j.setdefault('extras',{})['reconstruction']={'sourceCommit':BASE,'method':'Blender costume meshes appended in bind space','reference':{'oath-01-sorcerer':91,'oath-03-sorcerer':87,'oath-14-sorcerer':64}[key]}
 target=OUT/f'{key}.glb';target.write_bytes(pack(j,b))
 report=dict(character=key,sourceCommit=BASE,sourceSha256=hashlib.sha256(src).hexdigest(),outputSha256=hashlib.sha256(target.read_bytes()).hexdigest(),addedTriangles=added,addedPrimitives=len(groups),animations=len(j.get('animations',[])),originalBinaryPrefixPreserved=bytes(b[:len(unpack(src)[1])])==bytes(unpack(src)[1]),fidelity='requires multi-angle review; not reference-exact acceptance')
 (REPORT/f'{key}-build.json').write_text(json.dumps(report,indent=2)+'\n');print(json.dumps(report))
