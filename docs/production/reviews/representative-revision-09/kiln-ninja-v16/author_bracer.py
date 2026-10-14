import bpy,bmesh,math,json,hashlib,shutil,importlib.util,os
from pathlib import Path
from mathutils import Vector
P=Path(__file__).resolve().parent;ID='kiln-ninja-ensemble-candidate';BASE=P/'baseline';D=P/ID;D.mkdir(exist_ok=True)
SOURCE=BASE/(ID+'.blend');bpy.ops.wm.open_mainfile(filepath=str(SOURCE));body=bpy.data.objects['Kiln_ninja_weighted_lowpoly'];rig=next(o for o in bpy.data.objects if o.type=='ARMATURE');rig.animation_data.action=None
for p in rig.pose.bones:p.rotation_euler=(0,0,0);p.location=(0,0,0)
bpy.context.scene.frame_set(1);bpy.context.view_layer.update()
# Frozen V15 disconnected bracer components, identified by exact vertex topology and bounds.
cs=json.loads((P/'baseline-components.json').read_text());old=[c for c in cs if c['uvmean'][1]<.5];remove=set(i for c in old for i in c['indices']);bm=bmesh.new();bm.from_mesh(body.data);bm.verts.ensure_lookup_table();bmesh.ops.delete(bm,geom=[bm.verts[i] for i in sorted(remove)],context='VERTS');bm.to_mesh(body.data);bm.free();body.data.update()
(P/'source-removal.json').write_text(json.dumps({'baselineSourceSha256':hashlib.sha256(SOURCE.read_bytes()).hexdigest(),'components':old,'removedVertices':len(remove),'scope':'Only 12 disconnected ceramic ladder and old hinge/clasp components. Leather underwrap retained.'},indent=2)+'\n')
mat=bpy.data.materials['Kiln firecloth / porous ceramic / oxidized iron atlas'];new=[]
def rounded(w,h,r,n=4):
 pts=[]
 for x,y,a in [(w/2-r,h/2-r,0),(-w/2+r,h/2-r,90),(-w/2+r,-h/2+r,180),(w/2-r,-h/2+r,270)]:
  for i in range(n+1):
   t=math.radians(a+i*90/n);pts.append((x+r*math.cos(t),y+r*math.sin(t)))
 return pts
def slab(name,poly,front,back):
 vs=[(u,v,z) for z in [front,back] for u,v in poly];n=len(poly);fs=[tuple(reversed(range(n))),tuple(range(n,2*n))]+[(i,(i+1)%n,(i+1)%n+n,i+n) for i in range(n)];m=bpy.data.meshes.new(name);m.from_pydata(vs,[],fs);m.update();o=bpy.data.objects.new(name,m);bpy.context.collection.objects.link(o);return o
def active(o):
 bpy.ops.object.select_all(action='DESELECT');o.select_set(True);bpy.context.view_layer.objects.active=o

def bevel(o,width,segments=2):
 active(o);m=o.modifiers.new('Purposeful softened manufactured edges','BEVEL');m.width=width;m.segments=segments;bpy.ops.object.modifier_apply(modifier=m.name)

def world(u,v,d):
 z=1.125+v;cx=.365-(z-1.013)*.265;rad=.049+v*.065+d;t=.42+u/.059
 return (cx+rad*math.sin(t),-.005-rad*math.cos(t),z)

def finish(o,cell,curved=True):
 active(o)
 if curved:
  # Subdivide before wrapping for genuine curved ceramic walls, preserving openings.
  bm=bmesh.new();bm.from_mesh(o.data);bmesh.ops.triangulate(bm,faces=list(bm.faces));edges=[e for e in bm.edges if e.calc_length()>.017];bmesh.ops.subdivide_edges(bm,edges=edges,cuts=2,use_grid_fill=True);bmesh.ops.triangulate(bm,faces=list(bm.faces));bm.to_mesh(o.data);bm.free()
  for v in o.data.vertices:v.co=world(*v.co)
 o.data.materials.append(mat)
 for p in o.data.polygons:p.use_smooth=True
 bpy.ops.object.mode_set(mode='EDIT');bpy.ops.mesh.select_all(action='SELECT');bpy.ops.mesh.normals_make_consistent(inside=False);bpy.ops.uv.smart_project(angle_limit=1.0,island_margin=.025);bpy.ops.object.mode_set(mode='OBJECT')
 for uv in o.data.uv_layers.active.data:uv.uv=((cell%4+.035+uv.uv.x*.93)/4,(cell//4+.035+uv.uv.y*.93)/2)
 g=o.vertex_groups.new(name='forearm.L');g.add(list(range(len(o.data.vertices))),1,'REPLACE');m=o.modifiers.new('Forearm rigid articulated attachment','ARMATURE');m.object=rig;o['v16_component']=o.name;o['reference']='reference-090: left bracer';new.append(o)
 return o
plate=slab('V16 continuous curved ceramic plate with three apertures',rounded(.089,.175,.010,5),0,.009)
for v in [-.050,0,.050]:
 hole=slab('Temporary rounded slot cutter',[(u,y+v) for u,y in rounded(.047,.019,.0045,5)],-.020,.030);active(plate);m=plate.modifiers.new('Actual enclosed slot','BOOLEAN');m.operation='DIFFERENCE';m.solver='EXACT';m.object=hole;bpy.ops.object.modifier_apply(modifier=m.name);bpy.data.objects.remove(hole,do_unlink=True)
bevel(plate,.0014,2);finish(plate,1)
# Iron side spine and fitted short crosswise latch; metal work conforms to shell.
spine=slab('V16 fitted iron side hinge spine',[(u+.048,v) for u,v in rounded(.014,.143,.003,3)],-.001,.004);bevel(spine,.0008,1);finish(spine,2)
for v in [-.070,.070]:
 latch=slab('V16 iron strap latch '+str(v),[(u+.036,y+v) for u,y in rounded(.035,.016,.003,3)],.009,.014);bevel(latch,.001,2);finish(latch,2)
 # Separate three-knuckle hinge barrel and through-pin; all fit the short side latch.
 for lo,hi,rr in [(-.012,-.0045,.0035),(-.0035,.0035,.004),(.0045,.012,.0035),(-.014,.014,.0017)]:
  pts=[];n=10
  for vv in [v+lo,v+hi]:
   for j in range(n):t=2*math.pi*j/n;pts.append((.049+rr*math.cos(t),vv,.014+rr*math.sin(t)))
  faces=[tuple(reversed(range(n))),tuple(range(n,2*n))]+[(j,(j+1)%n,(j+1)%n+n,j+n) for j in range(n)]
  me=bpy.data.meshes.new('Barrel and pin');me.from_pydata(pts,[],faces);me.update();ob=bpy.data.objects.new('V16 separate hinge knuckle and through-pin '+str(v)+' '+str(lo),me);bpy.context.collection.objects.link(ob);finish(ob,2)
 latchstud=slab('V16 seated latch stud '+str(v),[(.031+.0025*math.cos(j*math.pi/4),v+.0025*math.sin(j*math.pi/4)) for j in range(8)],.014,.016);finish(latchstud,2)
for v in [-.074,.074]:
 for u in [-.030,.030]:
  riv=slab('V16 ceramic corner iron fastening',[(u+.0025*math.cos(i*math.pi/4),v+.0025*math.sin(i*math.pi/4)) for i in range(8)],.009,.011);finish(riv,2)
# Closed leather retention bands wrap the complete forearm under the plate.
for z in [1.055,1.195]:
 vs=[];n=32
 for zz,dd in [(z-.011,0),(z+.011,0),(z-.011,.003),(z+.011,.003)]:
  r=.039+(zz-1.04)*.095+dd;cx=.365-(zz-1.013)*.265
  for i in range(n):t=2*math.pi*i/n;vs.append((cx+r*math.sin(t),-.005-r*math.cos(t),zz))
 fs=[]
 for i in range(n):j=(i+1)%n;fs.extend([(i,j,n+j,n+i),(2*n+i,3*n+i,3*n+j,2*n+j),(i,2*n+i,2*n+j,j),(n+i,n+j,3*n+j,3*n+i)])
 me=bpy.data.meshes.new('Band');me.from_pydata(vs,[],fs);me.update();ob=bpy.data.objects.new('V16 fitted leather retention band '+str(z),me);bpy.context.collection.objects.link(ob);finish(ob,4,False)
# Source keeps new parts separate for editability; baseline material graph/maps are untouched.
for im in bpy.data.images:
 if im.packed_file and im.source=='FILE':(D/Path(im.filepath).name).write_bytes(bytes(im.packed_file.data));im.filepath=str(D/Path(im.filepath).name)
bpy.context.preferences.filepaths.save_version=0;bpy.ops.wm.save_as_mainfile(filepath=str(D/(ID+'.blend')),compress=True)
(P/'new-components.json').write_text(json.dumps([{'name':o.name,'vertices':len(o.data.vertices),'polygons':len(o.data.polygons),'bounds':[[min(v.co[k] for v in o.data.vertices) for k in range(3)],[max(v.co[k] for v in o.data.vertices) for k in range(3)]],'weight':{'forearm.L':1.0}} for o in new],indent=2)+'\n');print('V16 SOURCE READY',len(new))
