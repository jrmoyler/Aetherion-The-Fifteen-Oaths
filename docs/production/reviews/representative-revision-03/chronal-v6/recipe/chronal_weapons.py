"""Time & Motion reference-034. Scythe, three-blade ring, deploying wrist tool, dart.
Original metric low-poly meshes matching the inspected sheet's explicit dimensions.
"""
import bpy,math,sys,json
from pathlib import Path
from mathutils import Vector
sys.path.insert(0,str(Path(__file__).parent));import kiln_weapons as K;import storm_weapons as S

def ring_xy(name,center,r,w,mat,inner=None,n=20):
 o=K.ring(name,0,r,w,mat,inner,n);o.rotation_euler[0]=math.pi/2;o.location=center;return o
def disc(name,center,r,h,mat,n=20):
 o=K.cyl(name,center,r,h,mat,n);o.rotation_euler=(0,0,0);return o
def profile(name,pts,t,mat,offset=(0,0,0),angle=0):
 o=K.flat_profile(name,pts,t,mat);o.rotation_euler.z=angle;o.location=offset;return o

def hub(center,r):
 ring_xy('Open brass clockwork hub',center,r,.017,'brass',r*.82,24)
 for i in range(8):
  a=i*math.pi/4
  o=K.cube('Clockwork radial spoke',(center[0]+r*.53*math.cos(a),center[1]+r*.53*math.sin(a),center[2]),(r*.61,.014,.018),'brass',.002);o.rotation_euler.z=a
  disc('Hub retaining stud',(center[0]+r*.92*math.cos(a),center[1]+r*.92*math.sin(a),center[2]+.014),.009,.009,'steel',8)
 disc('Clockwork axle',(center[0],center[1],center[2]),r*.28,.046,'steel');ring_xy('Axle brass bezel',(center[0],center[1],center[2]+.025),r*.30,.008,'brass',r*.23,16)
def scythe(state):
 K.cyl('Steel sectional scythe shaft',(0,-.02,0),.018,1.51,'steel',16)
 for lo,hi in [(-.70,-.37),(-.24,.09),(.22,.55)]:
  K.cyl('Leather hand section',(0,(lo+hi)/2,0),.023,hi-lo,'leather')
  for i in range(9):
   o=K.ring('Raised diagonal grip edging',lo+(hi-lo)*i/9,.024,.005,'leather',.021,12)
 for y in [-.78,-.70,-.37,-.24,.09,.22,.55,.65]:K.ring('Shaft brass ferrule',y,.030,.032,'brass',.017,16)
 hub((0,.745,0),.105)
 pts=[(-.035,.835),(-.135,.88),(-.27,.865),(-.40,.805),(-.52,.705),(-.61,.56),(-.66,.395),(-.51,.62),(-.36,.715),(-.18,.758),(-.044,.765)]
 profile('Swept dark scythe blade shell',pts,.029,'steel')
 profile('Honed silver cutting bevel',[(-.66,.395),(-.51,.62),(-.36,.715),(-.18,.758),(-.055,.765),(-.14,.782),(-.35,.743),(-.52,.656)],.031,'edge')
 profile('Brass root spline',[(-.043,.829),(-.139,.865),(-.17,.858),(-.153,.847),(-.049,.816)],.038,'brass')
 profile('Counterweight rear hooked spur',[(.082,.80),(.16,.75),(.18,.64),(.145,.705),(.09,.74)],.022,'brass')
 for x,y in [(-.10,.81),(-.17,.81),(-.27,.80)]:disc('Blade shell brass rivet',(x,y,.022),.006,.010,'brass',8)
 K.cyl('Scythe pommel',(0,-.824,0),.031,.070,'brass');K.socket('grip_primary',(0,0,0));K.socket('blade_tip',(-.66,.395,0))

def ring_weapon(state):
 ring_xy('Inner open throwing ring',(0,0,0),.079,.018,'brass',.064,24)
 for i in range(3):
  a=i*2*math.pi/3;x=.139*math.cos(a);y=.139*math.sin(a)
  pod=K.cyl('Tangential dark pod',(x,y,0),.029,.065,'steel',16);pod.rotation_euler.z=a
  for shift in [-.029,.029]:
   px=x-shift*math.sin(a);py=y+shift*math.cos(a);o=K.ring('Pod brass end collar',0,.034,.012,'brass',.026,16);o.location=(px,py,0);o.rotation_euler.z=a
  o=K.cube('Radial ring yoke',(.10*math.cos(a),.10*math.sin(a),0),(.085,.023,.018),'brass');o.rotation_euler.z=a
  disc('Pod top fastening screw',(x,y,.034),.012,.009,'brass',12)
  angles=[.05,.35,.7,1.05,1.43];pts=[(.18*math.cos(t),.18*math.sin(t)) for t in angles]+[(.147*math.cos(t),.147*math.sin(t)) for t in [1.3,1.0,.7,.35,.05]]
  profile('Sweeping ring blade',pts,.011,'steel',angle=a)
  pts=[(.18*math.cos(t),.18*math.sin(t)) for t in [.7,1.05,1.43]]+[(.17*math.cos(t),.17*math.sin(t)) for t in [1.31,1.0,.7]];profile('Ring honed silver rim',pts,.012,'edge',angle=a)
 K.socket('grip_primary',(0,0,0));K.socket('throw_axis',(0,0,.06))

def author_wrist_atlas(obs,resolution=1024):
 """Pack actual component UVs, rasterize material response in those UVs, paint worn sharp edges.
 No reference image projection. Atlas responds to measured geometry and named surface roles.
 """
 import numpy as np
 meshes=[o for o in obs if o.type=='MESH'];vs=[];fs=[];meta=[];parts=[]
 for o in meshes:
  off=len(vs);start=len(fs);vs.extend([tuple(o.matrix_world@v.co) for v in o.data.vertices])
  for p in o.data.polygons:
   fs.append(tuple(off+i for i in p.vertices));mat=o.data.materials[p.material_index].name.split('.')[0];meta.append((mat,o.name))
  parts.append((o,start,len(o.data.polygons)))
 me=bpy.data.meshes.new('Wrist atlas UV packing proxy');me.from_pydata(vs,[],fs);me.update();proxy=bpy.data.objects.new('Wrist atlas UV packing proxy',me);bpy.context.collection.objects.link(proxy)
 bpy.ops.object.select_all(action='DESELECT');proxy.select_set(True);bpy.context.view_layer.objects.active=proxy;bpy.ops.object.mode_set(mode='EDIT');bpy.ops.mesh.select_all(action='SELECT');bpy.ops.uv.smart_project(angle_limit=1.15,island_margin=.008,area_weight=.5);bpy.ops.uv.pack_islands(rotate=True,margin=.007);bpy.ops.object.mode_set(mode='OBJECT');me.calc_loop_triangles()
 uv=me.uv_layers.active.data;n=resolution;base=np.ones((n,n,4),dtype=np.float32);base[:,:,:3]=.03;orm=np.ones((n,n,4),dtype=np.float32);orm[:,:,2]=0;normal=np.ones((n,n,4),dtype=np.float32);normal[:,:,:2]=.5;mask=np.zeros((n,n),bool)
 palette={'steel':((.145,.16,.17),.91,.39),'edge':((.44,.47,.48),.96,.27),'brass':((.43,.275,.095),.84,.44),'leather':((.045,.032,.023),0,.84)}
 for tri in me.loop_triangles:
  t=np.array([uv[i].uv[:] for i in tri.loops])* (n-1);xmin=max(0,int(np.floor(t[:,0].min())));xmax=min(n-1,int(np.ceil(t[:,0].max())));ymin=max(0,int(np.floor(t[:,1].min())));ymax=min(n-1,int(np.ceil(t[:,1].max())))
  if xmax<xmin or ymax<ymin:continue
  yy,xx=np.mgrid[ymin:ymax+1,xmin:xmax+1];px=xx+.5;py=yy+.5;a,b,c=t;den=(b[1]-c[1])*(a[0]-c[0])+(c[0]-b[0])*(a[1]-c[1])
  if abs(den)<1e-8:continue
  wa=((b[1]-c[1])*(px-c[0])+(c[0]-b[0])*(py-c[1]))/den;wb=((c[1]-a[1])*(px-c[0])+(a[0]-c[0])*(py-c[1]))/den;wc=1-wa-wb;inside=(wa>=0)&(wb>=0)&(wc>=0)
  if not inside.any():continue
  world=np.array([me.vertices[i].co[:] for i in tri.vertices]);wp=wa[:,:,None]*world[0]+wb[:,:,None]*world[1]+wc[:,:,None]*world[2];wx,wy,wz=wp[:,:,0],wp[:,:,1],wp[:,:,2];mat,name=meta[tri.polygon_index];color,metal,rough=palette.get(mat,palette['steel'])
  fine=np.sin(wx*23331+wy*11713+wz*7121)*np.sin(wy*19717-wx*6713);low=np.sin(wx*371+wy*149)*np.sin(wy*283-wz*157);rgb=np.ones(wp.shape)*np.array(color);rgb*=1+fine[:,:,None]*.025+low[:,:,None]*.08;rr=np.full(wx.shape,rough)
  if mat=='brass':
   patina=(low>.82)&(fine>.05);rgb[patina]=(.17,.145,.072);rr[patina]=.63
   # Fine engraved concentric machining follows the actual axle, not arbitrary stripes.
   if any(s in name.lower() for s in ['rim','race','bearing']):
    rad=np.sqrt(wx*wx+wy*wy);engrave=(np.abs(rad-.024)<.00020)|(np.abs(rad-.0226)<.00016)|(np.abs(rad-.0118)<.00015);rgb[engrave]*=.40;rr[engrave]=.62
  elif mat in ['steel','edge']:
   brush=np.sin(wx*51237+wy*11)**12;rgb*=1+brush[:,:,None]*.04;rr+=brush*.025
   if 'blade' in name.lower():
    # Sparse dragged scratches follow blade length and concentrate away from hub.
    scratch=(np.abs(wx*1.4-wy-.015)<.00015)&(np.abs(wy)>.037)&(np.abs(wy)<.058);rgb[scratch]=(.37,.39,.40);rr[scratch]=.31
  else:
   pores=(fine>.82);rgb[pores]*=.72;rr+=fine*.025
  region=base[ymin:ymax+1,xmin:xmax+1,:3];region[inside]=rgb[inside];q=orm[ymin:ymax+1,xmin:xmax+1];q[:,:,1][inside]=rr[inside];q[:,:,2][inside]=metal;mask[ymin:ymax+1,xmin:xmax+1]|=inside
 # Only hard physical edges get chipped metal highlights; triangulation diagonals do not.
 adj={}
 for p in me.polygons:
  for e in p.edge_keys:adj.setdefault(tuple(sorted(e)),[]).append(p.index)
 for p in me.polygons:
  mat,name=meta[p.index]
  if mat not in ['steel','brass','edge']:continue
  for j,e in enumerate(p.edge_keys):
   linked=adj[tuple(sorted(e))]
   if len(linked)==2 and me.polygons[linked[0]].normal.dot(me.polygons[linked[1]].normal)>.72:continue
   i0=p.loop_indices[j];i1=p.loop_indices[(j+1)%len(p.loop_indices)];a=np.array(uv[i0].uv[:])*(n-1);b=np.array(uv[i1].uv[:])*(n-1);length=np.linalg.norm(b-a)
   if length<3:continue
   for t in np.linspace(0,1,max(2,int(length))):
    pos=a*(1-t)+b*t;x=int(round(pos[0]));y=int(round(pos[1]))
    if not(1<=x<n-1 and 1<=y<n-1):continue
    signal=math.sin(x*.093+y*.117+p.index*.731)
    if signal<.94:continue
    col=(.53,.37,.17) if mat=='brass' else (.31,.335,.35)
    for dx,dy in [(0,0),(1,0)]:
     if mask[y+dy,x+dx]:base[y+dy,x+dx,:3]=col;orm[y+dy,x+dx,1]=.30
 # Bleed each painted island two pixels to reduce mip seams; UVs remain separate.
 for _ in range(2):
  old=mask.copy()
  for dy,dx in [(1,0),(-1,0),(0,1),(0,-1)]:
   shifted=np.roll(old,(dy,dx),(0,1));sel=shifted&~mask
   for im in [base,orm,normal]:im[sel]=np.roll(im,(dy,dx),(0,1))[sel]
   mask|=sel
 images=[K.image_file('chronal_wrist_localized_'+suffix,a) for suffix,a in [('basecolor',base),('orm',orm),('normal',normal)]]
 mat=bpy.data.materials.new('Chronal wrist geometry-painted PBR atlas');mat.use_nodes=True;nodes=mat.node_tree.nodes;links=mat.node_tree.links;bs=nodes.get('Principled BSDF');t=nodes.new('ShaderNodeTexImage');t.image=images[0];links.new(t.outputs['Color'],bs.inputs['Base Color']);t=nodes.new('ShaderNodeTexImage');t.image=images[1];sep=nodes.new('ShaderNodeSeparateColor');links.new(t.outputs[0],sep.inputs[0]);links.new(sep.outputs['Green'],bs.inputs['Roughness']);links.new(sep.outputs['Blue'],bs.inputs['Metallic']);t=nodes.new('ShaderNodeTexImage');t.image=images[2];nm=nodes.new('ShaderNodeNormalMap');links.new(t.outputs[0],nm.inputs['Color']);links.new(nm.outputs[0],bs.inputs['Normal'])
 for ob,start,count in parts:
  if not ob.data.uv_layers:ob.data.uv_layers.new(name='UVMap')
  target=ob.data.uv_layers.active.data
  for i,p in enumerate(ob.data.polygons):
   pp=me.polygons[start+i]
   for dst,src in zip(p.loop_indices,pp.loop_indices):target[dst].uv=uv[src].uv
  ob['UV_POLICY']='Unique packed geometry-painted 1024 atlas; sharp-edge wear and surface-specific response';ob.data.materials.clear();ob.data.materials.append(mat)
  for p in ob.data.polygons:p.material_index=0
 bpy.data.objects.remove(proxy,do_unlink=True)
 return {'resolution':resolution,'method':'Unique packed UVs; geometry-indexed surface painting and sharp-edge wear','occupiedFraction':float(mask.mean())}

def wrist(state):
 # Reference-034: fitted curved wrist saddle, nested axle and opposed swept blades.
 # The base follows a wrist cylinder; there is no flat rectangular carrier slab.
 def bez(points,n=10):
  out=[]
  for i in range(n):
   t=i/(n-1);u=1-t;out.append(tuple(u**3*points[0][k]+3*u*u*t*points[1][k]+3*u*t*t*points[2][k]+t**3*points[3][k] for k in range(2)))
  return out
 def cuff_segment(name,y0,y1,r,a0,a1,mat,th=.004,n=20):
  o=K.sector(name,y0,y1,r,a0,a1,mat,th,n);o.location.z=-.018;return o
 def tiny_screw(x,y,z,r=.0022):
  disc('Recessed steel screw',(x,y,z),r,.0015,'steel',8)
  K.cube('Screw-driver kerf',(x,y,z+.00085),(r*1.12,r*.19,.00025),'leather',0)
 # Open C-shaped cuff: padded inner saddle, sheet steel body and two perimeter straps.
 cuff_segment('Curved padded leather wrist saddle',-.035,.035,.034,-.38,math.pi+.38,'leather',.005,24)
 cuff_segment('Fitted leather bracer backing',-.030,.030,.037,-.29,math.pi+.29,'leather',.0025,24)
 for y in [-.034,.027]:
  cuff_segment('Curved brass retaining band',y,y+.0045,.039,-.32,math.pi+.32,'brass',.0025,24)
  for x in [-.037,.037]:
   K.cube('Cuff strap end tab',(x,y+.0035,-.027),(.010,.010,.006),'brass',.002)
   tiny_screw(x,y+.0035,-.023,.0017)
 # Individually overlapping leather strips follow the curved wrist, with a slight diagonal lap.
 for j in range(5):
  ybase=-.030+j*.011;vs=[];n=20
  for radius,side in [(.0372,0),(.0372,1),(.0380,0),(.0380,1)]:
   for i in range(n+1):
    a=-.29+(math.pi+.58)*i/n;vs.append((radius*math.cos(a),ybase+side*.011+.003*i/n,radius*math.sin(a)-.018))
  k=n+1;fs=[]
  for i in range(n):fs.extend([(i,i+1,k+i+1,k+i),(2*k+i,3*k+i,3*k+i+1,2*k+i+1),(i,2*k+i,2*k+i+1,i+1),(k+i,k+i+1,3*k+i+1,3*k+i)])
  K.mesh('Lapped leather wrist binding',vs,fs,'leather')
 # Longitudinal ribbed backing follows the convex top of the bracer.
 for x in [-.026,.026]:
  zz=math.sqrt(.046**2-x*x)-.018
  outer=[(x-.003,-.030),(x+.003,-.030),(x+.006,-.020),(x+.006,.019),(x+.002,.029),(x-.003,.029),(x-.006,.019),(x-.006,-.020)]
  inner=[(x-.001,-.023),(x+.001,-.023),(x+.0025,-.017),(x+.0025,.016),(x+.001,.022),(x-.001,.022),(x-.0025,.016),(x-.0025,-.017)]
  vs=[]
  for z,loop in [(zz,outer),(zz+.004,outer),(zz,inner),(zz+.004,inner)]:vs.extend([(xx,yy,z) for xx,yy in loop])
  fs=[];n=8
  for i in range(n):
   jj=(i+1)%n;fs.extend([(i,jj,n+jj,n+i),(2*n+i,3*n+i,3*n+jj,2*n+jj),(i,2*n+i,2*n+jj,jj),(n+i,n+jj,3*n+jj,3*n+i)])
  K.mesh('Open cast saddle bearing link',vs,fs,'brass')
  for y in [-.024,.024]:tiny_screw(x,y,zz+.007,.002)
 # Narrow rounded lobed mechanism backplate; clipped ends expose the wrist shell.
 outline=[(-.020,-.038),(-.032,-.029),(-.031,-.013),(-.025,0),(-.031,.019),(-.022,.035),(.022,.035),(.031,.019),(.025,0),(.031,-.013),(.032,-.029),(.020,-.038)]
 outline=[(x*.83,y*.86) for x,y in outline]
 plate=profile('Contoured mechanical bridge',outline,.004,'brass',offset=(0,0,.030))
 inset=[(x*.88,y*.86) for x,y in outline];profile('Bridge inset dark steel liner',inset,.005,'steel',offset=(0,0,.030))
 # Axle stack: recessed bearing, brass retaining lip, black face, central open socket.
 disc('Lower bearing race',(0,0,.038),.021,.006,'steel',32)
 ring_xy('Brass bearing retaining rim',(0,0,.043),.023,.004,'brass',.0215,40)
 disc('Brass engraved bearing cover',(0,0,.044),.0215,.004,'brass',40)
 ring_xy('Engraved cover outer race',(0,0,.0462),.0198,.0006,'steel',.0194,40)
 ring_xy('Inner machined steel bearing',(0,0,.048),.0115,.0025,'steel',.0085,32)
 ring_xy('Central brass axle retaining lip',(0,0,.0492),.0086,.001,'brass',.0075,32)
 ring_xy('Open center axle socket',(0,0,.050),.0074,.0025,'steel',.0047,24)
 disc('Socket recessed shadow',(0,0,.048),.0054,.001,'leather',16)
 for i in range(6):
  a=i*math.pi/3;tiny_screw(.0175*math.cos(a),.0175*math.sin(a),.047,.0012)
 # Functional-looking lateral ratchet releases and supporting guide cleats.
 for sign in [-1,1]:
  pin=K.cyl('Lateral ratchet pin',(sign*.032,0,.038),.007,.014,'brass',12);pin.rotation_euler.z=math.pi/2
  cap=K.cyl('Steel ratchet push button',(sign*.041,0,.038),.0054,.004,'steel',12);cap.rotation_euler.z=math.pi/2
  for yy in [-.018,.019]:
   profile('Blade guide cleat',[(sign*.021,yy-.006),(sign*.030,yy-.008),(sign*.036,yy-.004),(sign*.037,yy+.001),(sign*.033,yy+.005),(sign*.028,yy+.006),(sign*.023,yy+.003)],.004,'brass',offset=(0,0,.039))
   tiny_screw(sign*.030,yy+.001,.042,.0014)
 groups=[]
 outer=bez([(.017,.014),(.067,-.002),(.085,.051),(.037,.080)],20)
 inner=bez([(.037,.080),(.062,.043),(.040,.034),(.014,.028)],20)
 for index,angle in enumerate([0,math.pi]):
  before=set(bpy.context.scene.objects)
  bladepts=outer+inner[1:]
  profile('Swept honed wrist blade shell',bladepts,.0028,'steel',offset=(0,0,.040+index*.004),angle=angle)
  # Tapered bevel follows the curved cutting edge instead of a white flat outline.
  inneredge=[(x*.965,y-.003*(1-i/(len(outer)-1))) for i,(x,y) in enumerate(outer)]
  profile('Curved polished blade bevel',outer+list(reversed(inneredge)),.0008,'edge',offset=(0,0,.042+index*.004),angle=angle)
  # Forked bronze root saddle, cut-out center, fitted studs and exposed guide track.
  root=bez([(.011,.016),(.020,.012),(.029,.013),(.039,.018)],12)
  rootin=[(x-.005,y+.003) for x,y in reversed(root)]
  profile('Forked brass blade root spline',root+rootin,.004,'brass',offset=(0,0,.044+index*.004),angle=angle)
  o=ring_xy('Moving blade root bearing',(0,0,.043+index*.004),.0205,.002,'brass',.0175,32)
  for x,y in [(.019,.017),(.029,.018),(.036,.022)]:
   xx=x*math.cos(angle)-y*math.sin(angle);yy=x*math.sin(angle)+y*math.cos(angle);tiny_screw(xx,yy,.048+index*.004,.0016)
  groups.append(list(set(bpy.context.scene.objects)-before))
 # Applied world-space height compression preserves actual cuff radius and blade guide fit.
 for obj in list(bpy.context.scene.objects):
  if obj.type!='MESH':continue
  inv=obj.matrix_world.inverted()
  for v in obj.data.vertices:
   co=obj.matrix_world@v.co
   if co.z>.025:co.z=.025+(co.z-.025)*.55
   v.co=inv@co
 ar=bpy.data.armatures.new('Wrist deploy skeleton');rig=bpy.data.objects.new('Wrist blade hinges',ar);bpy.context.collection.objects.link(rig);bpy.context.view_layer.objects.active=rig;bpy.ops.object.select_all(action='DESELECT');rig.select_set(True);bpy.ops.object.mode_set(mode='EDIT')
 for name in ['left_hinge','right_hinge']:
  b=ar.edit_bones.new(name);b.head=(0,0,.0349);b.tail=(0,.020,.0349)
 bpy.ops.object.mode_set(mode='OBJECT')
 for idx,obs in enumerate(groups):
  for o in obs:
   if o.type!='MESH':continue
   g=o.vertex_groups.new(name='left_hinge' if idx==0 else 'right_hinge');g.add(list(range(len(o.data.vertices))),1,'REPLACE');m=o.modifiers.new('Mechanical hinge weights','ARMATURE');m.object=rig;o.parent=rig
 for i,p in enumerate(rig.pose.bones):
  p.rotation_mode='XYZ'
  for frame,v in [(1,0),(16,math.radians(120)),(32,math.radians(120)),(48,0)]:p.rotation_euler.z=v*(1 if i==0 else -1);p.keyframe_insert(data_path='rotation_euler',frame=frame)
 rig.animation_data.action.name='wrist_deploy_retract';bpy.context.scene.frame_end=48;bpy.context.scene.frame_set(1);K.socket('grip_primary',(0,0,0));K.socket('wrist_mount',(0,0,-.018))

def dart(state):
 # 22 cm overall, pointed lathed profile, asymmetric external socket collar.
 rings=[(-.11,0),(-.087,.010),(-.060,.012),(-.04,.014),(.026,.014),(.041,.012),(.075,.009),(.11,0)];n=12;vs=[];fs=[]
 for y,r in rings:vs.extend([(r*math.cos(i*2*math.pi/n),y,r*math.sin(i*2*math.pi/n)) for i in range(n)])
 for j in range(len(rings)-1):
  for i in range(n):
   if j==0:fs.append((0,n+(i+1)%n,n+i))
   elif j==len(rings)-2:fs.append((j*n+i,j*n+(i+1)%n,(j+1)*n))
   else:fs.append((j*n+i,j*n+(i+1)%n,(j+1)*n+(i+1)%n,(j+1)*n+i))
 K.mesh('Compact double-ended dart',vs,fs,'steel')
 for y in [-.035,.005,.04]:K.ring('Dart brass locking collar',y,.017,.020,'brass',.012,12)
 for z in [-.017,.017]:K.bolt('Dart collar stud',0,.005,z)
 K.socket('grip_primary',(0,0,0));K.socket('belt_socket',(0,-.04,0))

if __name__=='__main__':
 S.configure(14);S.material_pack([('steel',(.18,.19,.20),.9,.42),('brass',(.50,.36,.17),.84,.44),('leather',(.055,.048,.04),0,.82),('edge',(.50,.51,.49),.96,.28)],34);assets=[]
 for kind,fn in [('scythe',scythe),('ring',ring_weapon),('wrist-tool',wrist),('compact-dart',dart)]:
  a=K.build(kind,'ready','chronal',S.collision,fn,(0,0,0));a['referenceIds']=['reference-034'];a['remainingGates']=['Individual art approval and engraved detail refinement','Stowed and damaged variants missing','Character grip/mount calibration','Runtime time-motion VFX/audio/combat integration','Actual engine imports, LOD transitions and performance']
  if kind=='wrist-tool':a['rig']={'applicability':'ARTICULATED_WRIST_BLADES','status':'AUTHORED_UNVERIFIED','boneCount':2};a['animations']=[{'name':'wrist_deploy_retract','durationSeconds':47/24}]
  else:a['rig']={'applicability':'STATIC_RIGID_BODY','status':'NOT_APPLICABLE'};a['animations']=[]
  if kind=='scythe':a['remainingGates'].append('Current length1.739m versus reference1.80m; nominal scale fit remains open')
  if kind=='wrist-tool':a['remainingGates'].append('Current length0.165m versus reference0.16m; wrist fit remains open')
  assets.append(a)
 S.save_manifest(assets,'asset-o14-e-weapons-family','reference-034');print('CHRONAL_COMPLETE',len(assets))
