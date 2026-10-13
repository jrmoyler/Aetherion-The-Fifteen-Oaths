"""Reference032 lateral folding shield; review-only. No longitudinal collapse."""
import bpy,bmesh,math,sys,json,hashlib
import numpy as np
from pathlib import Path
from mathutils import Vector,Matrix
OUT=Path(__file__).resolve().parent;sys.path.insert(0,str(OUT/'recipe'));import kiln_weapons as K
K.ROOT=OUT;K.OUT=OUT;K.TEX=OUT/'textures';K.TEX.mkdir(exist_ok=True)
bpy.context.preferences.filepaths.save_version=0
bpy.ops.object.select_all(action='SELECT');bpy.ops.object.delete(use_global=False)
# Quiet brushed material base. Most seams, recesses and fasteners are modeled relief.
n=512;yy,xx=np.mgrid[:n,:n];rng=np.random.default_rng(3203)
for name,col,metal,rough in [('steel',(.31,.33,.35),.92,.36),('iron',(.064,.071,.08),.82,.49),('cast',(.16,.17,.185),.88,.43),('orange',(.91,.255,.022),.08,.48),('rubber',(.018,.021,.024),0,.84)]:
 noise=rng.random((n,n));a=np.ones((n,n,4));a[:,:,:3]=np.array(col)*(1+(noise[:,:,None]-.5)*.035)
 # Fine brushed grain instead of sparkly uniform speckling.
 if name in ['steel','iron']:a[:,:,:3]*=(1+.015*np.sin(xx*.57))[:,:,None]
 bc=K.image_file(name+'_basecolor',a);a=np.ones((n,n,4));a[:,:,1]=rough+(noise-.5)*.026;a[:,:,2]=metal;orm=K.image_file(name+'_orm',a)
 a=np.ones((n,n,4));a[:,:,0]=.5;a[:,:,1]=.5;nm=K.image_file(name+'_normal',a)
 m=bpy.data.materials.new(name);m.use_nodes=True;ns=m.node_tree.nodes;ln=m.node_tree.links;bs=ns.get('Principled BSDF')
 for im in [bc,orm,nm]:im.pack()
 t=ns.new('ShaderNodeTexImage');t.image=bc;ln.new(t.outputs['Color'],bs.inputs['Base Color']);t=ns.new('ShaderNodeTexImage');t.image=orm;s=ns.new('ShaderNodeSeparateColor');ln.new(t.outputs[0],s.inputs[0]);ln.new(s.outputs['Green'],bs.inputs['Roughness']);ln.new(s.outputs['Blue'],bs.inputs['Metallic']);t=ns.new('ShaderNodeTexImage');t.image=nm;q=ns.new('ShaderNodeNormalMap');ln.new(t.outputs[0],q.inputs['Color']);ln.new(q.outputs[0],bs.inputs['Normal']);K.M[name]=m

def plate(name,points,z,t,mat):
 ob=K.flat_profile(name,points,t,mat);ob.location.z=z;return ob

def disc(name,x,y,z,r,d,mat,n=16):
 ob=K.cyl(name,(x,y,z),r,d,mat,n);ob.rotation_euler=(0,0,0);return ob

def bolt(name,x,y,z,r=.004):
 disc(name,x,y,z,r,.0035,'steel',8);disc(name+' socket',x,y,z+.002,r*.43,.001,'iron',6)

def bar(name,a,b,width,depth,mat):
 a=Vector(a);b=Vector(b);ob=K.cube(name,(a+b)/2,(width,(b-a).length,depth),mat,.002);ob.rotation_euler=(b-a).to_track_quat('Y','Z').to_euler();return ob

def beveled_plate(name,points,z,t,mat,bevel=.0012):
 ob=plate(name,points,z,t,mat)
 bpy.context.view_layer.objects.active=ob;md=ob.modifiers.new('Cast edge break','BEVEL');md.width=bevel;md.segments=2;bpy.ops.object.modifier_apply(modifier=md.name)
 return ob

def recessed_fastener(plate_ob,x,y,z):
 bpy.ops.mesh.primitive_cone_add(vertices=16,radius1=.003,radius2=.0058,depth=.006,location=(x,y,z+.001))
 cutter=bpy.context.object;bpy.context.view_layer.objects.active=plate_ob;md=plate_ob.modifiers.new('Countersunk actual recess','BOOLEAN');md.operation='DIFFERENCE';md.solver='EXACT';md.object=cutter;bpy.ops.object.modifier_apply(modifier=md.name);bpy.data.objects.remove(cutter,do_unlink=True)
 disc('Casing fastener recessed seat',x,y,z-.0017,.0038,.001,'iron',16)
 disc('Casing captive fastener head',x,y,z-.0012,.0027,.0015,'steel',12)
 disc('Casing captive hex socket',x,y,z-.00035,.0014,.00035,'iron',6)

def face_sector(name,r0,r1,a0,a1,z,t,mat):
 n=8;angles=np.linspace(math.radians(a0),math.radians(a1),n+1);vs=[]
 for h in [z-t/2,z+t/2]:
  for r in [r0,r1]:vs.extend((r*math.cos(a),r*math.sin(a),h) for a in angles)
 k=n+1;fs=[]
 for i in range(n):fs.extend([(i,i+1,k+i+1,k+i),(2*k+i,3*k+i,3*k+i+1,2*k+i+1),(i,2*k+i,2*k+i+1,i+1),(k+i,k+i+1,3*k+i+1,3*k+i)])
 fs.extend([(0,k,3*k,2*k),(n,2*k+n,3*k+n,k+n)])
 return K.mesh(name,vs,fs,mat)

parts={};root_before=set(bpy.context.scene.objects)
spine=[(-.048,-.475),(.048,-.475),(.060,-.455),(.060,.455),(.048,.475),(-.048,.475),(-.060,.455),(-.060,-.455)]
plate('Continuous machined central spine',spine,0,.016,'steel')
plate('Recessed center armor',[(-.037,-.449),(.037,-.449),(.045,-.429),(.045,.429),(.037,.449),(-.037,.449),(-.045,.429),(-.045,-.429)],.009,.007,'iron')
for sign in [-1,1]:
 x=sign*.051
 K.cube('Longitudinal housing gasket',(x,0,.010),(.004,.840,.004),'rubber',.001)
 for y in [-.415,-.315,.315,.415]:bolt('Spine armor countersunk bolt',sign*.028,y,.016,.0037)
for y in [-.407,.407]:
 K.cube('Spine mechanical latch casting',(0,y,.006),(.050,.068,.012),'steel',.006)
 K.cube('Orange inset safety latch',(0,y,.014),(.030,.044,.006),'orange',.004)
 disc('Latch recessed pin',0,y,.019,.009,.004,'iron',16);bolt('Latch retaining fastener',0,y,.022,.003)
# Visible center service channel and narrow mount rails, traced from source front.
for sy in [-1,1]:
 for sx in [-1,1]:
  beveled_plate('Central service channel mounting rail',[(sx*x,sy*y) for x,y in [(.026,.151),(.042,.165),(.042,.373),(.026,.386)]],.011,.006,'cast',.001)
 K.cube('Central recessed sliding guide',(0,sy*.268,.014),(.020,.218,.004),'iron',.002)
 for sx in [-1,1]:K.cube('Central narrow guide casing',(sx*.014,sy*.268,.014),(.004,.213,.005),'cast',.001)
 for yy0 in [.191,.343]:
  K.cube('Central guide cross stop',(0,sy*yy0,.016),(.020,.007,.003),'cast',.001)
# Reference032 pressure head: broken outer casing, recessed orange arcs and guarded tabs.
for z,r,d,mat in [(.014,.092,.018,'cast'),(.023,.085,.008,'iron'),(.029,.073,.008,'steel'),(.034,.058,.006,'iron'),(.037,.046,.005,'cast'),(.041,.033,.007,'steel'),(.045,.023,.005,'iron')]:disc('Pressure disc stepped bearing housing',0,0,z,r,d,mat,48)
for a0,a1 in [(8,42),(48,83),(97,132),(138,173),(187,222),(228,263),(277,312),(318,353)]:
 face_sector('Pressure outer cast segment',.086,.092,a0,a1,.025,.004,'cast')
 face_sector('Pressure polished segment lip',.090,.092,a0+2,a1-2,.028,.0015,'steel')
for a0,a1 in [(23,68),(112,157),(204,246),(294,336)]:face_sector('Orange segmented hub arc',.078,.0815,a0,a1,.028,.002,'orange')
for a in [0,45,90,135,180,225,270,315]:
 q=math.radians(a);x=.066*math.cos(q);y=.066*math.sin(q)
 disc('Pressure cover dark countersink',x,y,.0335,.0038,.0015,'iron',16)
 disc('Pressure cover captive screw',x,y,.0340,.0026,.0013,'steel',12)
 disc('Pressure cover hex socket',x,y,.0348,.0014,.0004,'iron',6)
for sy in [-1,1]:
 K.cube('Pressure radial guard', (0,sy*.084,.030),(.026,.017,.014),'iron',.003)
 K.cube('Orange segmented hub guard inset',(0,sy*.086,.038),(.017,.010,.0018),'orange',.001)
 disc('Pressure guard captive screw',0,sy*.074,.038,.003,.003,'steel',10)
disc('Pressure spindle machined hexagon',0,0,.047,.014,.004,'cast',6)
disc('Pressure spindle recessed seat',0,0,.049,.0065,.001,'iron',16)
disc('Orange segmented hub spindle index',0,0,.0498,.003,.0012,'orange',12)
# Fixed open straps sit within center relief, away from wing sweeps; fit is still proposed.
for y in [-.200,.200]:
 for x in [-.044,.044]:K.cube('Back strap machined stand-off',(x,y,-.052),(.015,.034,.073),'steel',.004)
 K.cube('Adjustable rear rubber forearm strap',(0,y,-.094),(.113,.037,.012),'rubber',.004)
 K.cube('Strap release buckle',(.029,y,-.083),(.027,.033,.025),'steel',.004)
 K.cube('Orange strap locking slider',(.044,y,-.079),(.006,.022,.012),'orange',.002)
# Source hub proportion: larger protective disc without arbitrary wholeasset scaling.
for ob in list(set(bpy.context.scene.objects)-root_before):
 if ob.name.startswith('Pressure') or ob.name.startswith('Orange segmented hub'):
  ob.location.x*=1.30;ob.location.y*=1.30
  if ob.type=='MESH' and not 'fastener' in ob.name:
   for v in ob.data.vertices:v.co.x*=1.30;v.co.y*=1.30
parts['carrier']=list(set(bpy.context.scene.objects)-root_before)
# Long continuous panels preserve outer silhouette. Relief around disc also clears opposingfold.
for sign in [-1,1]:
 hx=sign*.070;hz=.018;start=set(bpy.context.scene.objects)
 # Concave inner relief leaves an outside waist rib; no multiplied short cassettes.
 raw=[(.077,-.468),(.177,-.468),(.265,-.353),(.265,.353),(.177,.468),(.077,.468),(.077,.142)]
 raw +=[(max(.077,math.sqrt(max(0,.133**2-y*y))),y) for y in np.linspace(.133,-.133,29)]
 raw +=[(.077,-.142)]
 plate('Left continuous wing casting' if sign<0 else 'Right continuous wing casting',[(sign*x,y) for x,y in raw],0,.010,'cast')
 for sy in [-1,1]:
  pp=[(.137,.145),(.249,.225),(.249,.347),(.171,.452),(.137,.452)]
  beveled_plate('Recessed upper armor panel' if sy>0 else 'Recessed lower armor panel',[(sign*x,sy*y) for x,y in pp],.0055,.005,'iron',.001)
  waist=[(.146,.129),(.158,.012),(.249,.012),(.249,.211)]
  beveled_plate('Reference diagonal waist armor',[(sign*x,sy*y) for x,y in waist],.0055,.005,'iron',.001)
  casing=[(.084,.165),(.107,.150),(.127,.138),(.132,.157),(.132,.448),(.123,.461),(.084,.461)]
  shell=beveled_plate('Paired inner cast mounting plate',[(sign*x,sy*y) for x,y in casing],.009,.012,'steel',.0015)
  for yy0 in [.181,.428]:recessed_fastener(shell,sign*.110,sy*yy0,.015)
  # Narrow two-step outer casing follows the source shoulder and perimeter.
  path=[(.081,.463),(.175,.463),(.261,.350),(.261,.016)]
  for a,b in zip(path,path[1:]):
   bar('Cast perimeter stepped casing',(sign*a[0],sy*a[1],.006),(sign*b[0],sy*b[1],.006),.007,.008,'cast')
   bar('Narrow polished casing edge',(sign*a[0],sy*a[1],.0105),(sign*b[0],sy*b[1],.0105),.002,.0015,'steel')
  # Real reverse-side armor and recessed locking cassette remain visible when folded.
  reverse_outline=[(.090,.153),(.116,.110),(.132,.075),(.144,.023),(.250,.023),(.250,.347),(.171,.452),(.090,.452)]
  plate('Reverse charcoal armor insert',[(sign*x,sy*y) for x,y in reverse_outline],-.006,.005,'iron')
  K.cube('Reverse hinge service housing',(sign*.102,sy*.310,-.013),(.027,.169,.010),'steel',.005)
  K.cube('Reverse inset locking channel',(sign*.102,sy*.310,-.019),(.017,.135,.004),'iron',.003)
  K.cube('Reverse orange safety slider',(sign*.102,sy*.354,-.022),(.012,.037,.003),'orange',.002)
  for y in [.249,.371]:
   disc('Reverse captive locking screw',sign*.102,sy*y,-.024,.0035,.003,'steel',8)
   disc('Reverse captive screw socket',sign*.102,sy*y,-.0258,.0017,.0005,'iron',6)
  for x,y in [(.151,.427),(.233,.332),(.165,.134),(.230,.028)]:
   disc('Outer panel recessed fastener seat',sign*x,sy*y,.0083,.004,.001,'iron',16)
   disc('Outer panel low captive screw',sign*x,sy*y,.0089,.0025,.0012,'cast',12)
   disc('Outer panel hex socket',sign*x,sy*y,.0096,.0011,.0004,'iron',6)
  K.cube('Orange replaceable edge insert',(sign*.258,sy*.237,.007),(.009,.075,.007),'orange',.002)
  # Service seam is an actual thin recessed strip between authored armor zones.
  bar('Reference diagonal recessed junction',(sign*.139,sy*.140,.007),(sign*.249,sy*.218,.007),.002,.001,'rubber')
 # Thin outside waist links mechanically connect both lobes around centralhub.
 for y in [-.065,.065]:bolt('Waist link bolt',sign*.255,y,.009,.003)
 for cy in [-.350,-.220,.220,.350]:
  # Rotating annular knuckle has a true bore and a separate shaft; rigid component skin.
  ring=K.ring('Rotating bored hinge knuckle',cy,.0115,.024,'steel',.0048,20);ring.location.x=hx;ring.location.z=hz;ring['interface']='hinge_rotor'
  bar('Angled cast hinge leaf',(hx+sign*.012,cy,hz-.006),(sign*.105,cy,0),.018,.011,'steel')
  K.cube('Hinge leaf recessed cover',(sign*.101,cy,.011),(.024,.041,.004),'iron',.003)
  bolt('Hinge leaf cover screw',sign*.101,cy,.014,.003)
 parts['left_wing' if sign<0 else 'right_wing']=list(set(bpy.context.scene.objects)-start)
 # Fixed fork knuckles alternate along axis, genuine bore clearance rather than intersectingdrums.
 start=set(bpy.context.scene.objects)
 for cy in [-.350,-.220,.220,.350]:
  pin=K.cyl('Fixed hinge axle',(hx,cy,hz),.0045,.063,'steel',16);pin['interface']='hinge_axle'
  for off in [-.023,.023]:
   r=K.ring('Fixed bored fork knuckle',cy+off,.0115,.014,'steel',.0048,20);r.location.x=hx;r.location.z=hz;r['interface']='hinge_fork'
   bar('Fixed housing fork cast link',(hx,cy+off,hz),(sign*.049,cy+off,0),.011,.007,'steel')
  for y in [cy-.034,cy+.034]:
   o=K.cyl('Axle retaining end collar',(hx,y,hz),.008,.005,'iron',12);o['interface']='hinge_axle_cap'
 parts.setdefault('left_lift' if sign<0 else 'carrier',[]).extend(list(set(bpy.context.scene.objects)-start))
# Hub is a separate rigid translating cover. Source-visible front proportions are retained.
hub=[o for o in parts['carrier'] if o.name.startswith('Pressure') or o.name.startswith('Orange segmented hub')]
parts['hub_slide']=hub;parts['carrier']=[o for o in parts['carrier'] if o not in hub]
# Bored central load frame receives the retracted cover, rather than colliding with a solid spine.
def bore(ob,cutter):
 bpy.context.view_layer.objects.active=ob;md=ob.modifiers.new('Machined working clearance','BOOLEAN');md.operation='DIFFERENCE';md.solver='EXACT';md.object=cutter;bpy.ops.object.modifier_apply(modifier=md.name)
cut=disc('Temporary central bearing bore',0,0,0,.123,.35,'iron',64)
for ob in parts['carrier']:
 if any(ob.name.startswith(n) for n in ['Continuous machined','Recessed center','Longitudinal housing']):bore(ob,cut)
bpy.data.objects.remove(cut,do_unlink=True)
start=set(bpy.context.scene.objects)
r=K.ring('Fixed annular hub slide guide',0,.125,.016,'cast',.123,64);r.rotation_euler.x=math.pi/2;r.location.z=-.006
parts['carrier']+=list(set(bpy.context.scene.objects)-start)
# Hollow nested sleeves provide actual normal-to-shield travel for left hinge carriage.
# A temporary raised folded leaf clears the other leaf's sweep; it returns to its slim stack.
for cy in [-.460,.460]:
 cx=-.056
 cut=disc('Temporary lift guide bore',cx,cy,0,.0115,.30,'iron',32)
 for ob in parts['carrier']:
  if any(ob.name.startswith(n) for n in ['Continuous machined','Recessed center','Longitudinal housing']):bore(ob,cut)
 bpy.data.objects.remove(cut,do_unlink=True)
 start=set(bpy.context.scene.objects)
 r=K.ring('Fixed hollow lift bearing body',0,.01088,.074,'steel',.00864,24);r.rotation_euler.x=math.pi/2;r.location=(cx,cy,-.035)
 parts['carrier']+=list(set(bpy.context.scene.objects)-start)
 for idx,outer,inner,top in [(1,.00832,.00672,.002),(2,.0064,.00512,.006),(3,.0048,.00352,.010)]:
  start=set(bpy.context.scene.objects);r=K.ring(f'Nested hollow lift sleeve {idx}',0,outer,.074,'steel',inner,24);r.rotation_euler.x=math.pi/2;r.location=(cx,cy,top-.037)
  parts.setdefault(f'lift_stage_{idx}',[]).extend(set(bpy.context.scene.objects)-start)
 start=set(bpy.context.scene.objects)
 disc('Lift terminal solid rod',cx,cy,-.019,.0032,.062,'steel',20)
 bar('Moving hinge carriage bridge',(cx,cy,.014),(-.049,cy-math.copysign(.030,cy),.014),.006,.004,'steel')
 bar('Moving hinge carriage drop',(-.049,cy-math.copysign(.030,cy),.014),(-.049,cy-math.copysign(.030,cy),-.005),.006,.004,'steel')
 parts['left_lift']+=list(set(bpy.context.scene.objects)-start)
start=set(bpy.context.scene.objects)
for sy in [-1,1]:
 bar('Longitudinal moving fork support',(-.049,sy*.15,-.005),(-.049,sy*.43,-.005),.006,.004,'steel')
parts['left_lift']+=list(set(bpy.context.scene.objects)-start)
for ob in parts['left_lift']:
 if ob.name.startswith(('Fixed housing fork cast link','Longitudinal moving fork support','Moving hinge carriage drop')):
  bpy.context.view_layer.update()
  points=[ob.matrix_world@v.co for v in ob.data.vertices]
  lo=Vector([min(v[k] for v in points) for k in range(3)]);hi=Vector([max(v[k] for v in points) for k in range(3)])
  cutter=K.cube('Temporary machined travel slot',((lo.x+hi.x)/2,(lo.y+hi.y)/2,0),(hi.x-lo.x+.002,hi.y-lo.y+.002,.30),'iron',.0002)
  for fixed in parts['carrier']:
   if fixed.type=='MESH' and fixed.name.startswith(('Continuous machined','Recessed center','Longitudinal housing')):bore(fixed,cutter)
  bpy.data.objects.remove(cutter,do_unlink=True)
# Eight rigid bones. Pivots/meshes remain separate; no scale animation.
ar=bpy.data.armatures.new('Retracting hub and staged lateral shield rig');rig=bpy.data.objects.new('Impulse shield reference coverage mechanism',ar);bpy.context.collection.objects.link(rig);bpy.context.view_layer.objects.active=rig;bpy.ops.object.select_all(action='DESELECT');rig.select_set(True);bpy.ops.object.mode_set(mode='EDIT')
r=ar.edit_bones.new('carrier');r.head=(0,0,0);r.tail=(0,.10,0)
for name in ['hub_slide','left_lift','lift_stage_1','lift_stage_2','lift_stage_3']:
 b=ar.edit_bones.new(name);b.head=(0,0,0);b.tail=(0,.10,0);b.parent=r
for sign,name in [(-1,'left_wing'),(1,'right_wing')]:
 b=ar.edit_bones.new(name);b.head=(sign*.070,0,.018);b.tail=(sign*.070,.10,.018);b.parent=ar.edit_bones['left_lift'] if sign<0 else r
bpy.ops.object.mode_set(mode='OBJECT')
for name,items in parts.items():
 for ob in items:
  if ob.type!='MESH':continue
  ob['mechanicalGroup']=name;g=ob.vertex_groups.new(name=name);g.add(list(range(len(ob.data.vertices))),1,'REPLACE');md=ob.modifiers.new('Rigid component weighting','ARMATURE');md.object=rig
frames=[1,13,37,49,73,85,97,109,133,145,169,181]
lift=[0,.24,.24,.24,.24,.065,.065,.24,.24,.24,.24,0]
left=[0,0,math.pi,math.pi,math.pi,math.pi,math.pi,math.pi,math.pi,math.pi,0,0]
right=[0,0,0,0,-math.pi,-math.pi,-math.pi,-math.pi,0,0,0,0]
hub=[0,-.030,-.030,-.030,-.030,-.030,-.030,-.030,-.030,-.030,-.030,0]
for name,values in [('hub_slide',hub),('left_lift',lift)]+[(f'lift_stage_{i}',[v*i/4 for v in lift]) for i in [1,2,3]]:
 p=rig.pose.bones[name]
 for fr,v in zip(frames,values):p.location=(0,0,v);p.keyframe_insert(data_path='location',frame=fr)
for name,values in [('left_wing',left),('right_wing',right)]:
 p=rig.pose.bones[name];p.rotation_mode='XYZ'
 for fr,v in zip(frames,values):p.rotation_euler=(0,v,0);p.keyframe_insert(data_path='rotation_euler',frame=fr)
rig.animation_data.action.name='hub_retract_then_sequenced_lateral_fold'
for fc in rig.animation_data.action.fcurves:
 for kp in fc.keyframe_points:kp.interpolation='LINEAR'
scene=bpy.context.scene;scene.frame_start=1;scene.frame_end=181;scene.render.fps=24;scene.frame_set(1)
obs=list(scene.objects)
cleanup=[]
for ob in obs:
 if ob.type!='MESH':continue
 bm=bmesh.new();bm.from_mesh(ob.data);before=(len(bm.verts),len(bm.faces))
 bmesh.ops.remove_doubles(bm,verts=list(bm.verts),dist=.0000001)
 bmesh.ops.dissolve_degenerate(bm,dist=.0000001,edges=list(bm.edges))
 after=(len(bm.verts),len(bm.faces));bm.normal_update();bm.to_mesh(ob.data);bm.free();ob.data.update()
 if before!=after:cleanup.append({'object':ob.name,'beforeVerticesFaces':before,'afterVerticesFaces':after})
(OUT/'numerical-cleanup.json').write_text(json.dumps({'weldToleranceMeters':.0000001,'purpose':'Remove nanometer-thick bevel remnants and coincident vertices; no contact exclusions','changes':cleanup},indent=2)+'\n')
K.unwrap(obs)
# Model-space UV atlas for face wear: output baked PNG maps, not unsupported procedural shader nodes.
def localized_finish():
 targets=[o for o in obs if o.type=='MESH' and o.name.startswith(('Paired inner cast','Recessed upper armor','Recessed lower armor','Reference diagonal waist','Cast perimeter','Central service channel mounting'))]
 n=1024;gy,gx=np.mgrid[:n,:n];X=gx/(n-1)*.60-.30;Y=gy/(n-1)-.50
 distance=np.full((n,n),1.,dtype=np.float32)
 # Reference-visible outline junctions, in meters; wear is localized to real casing edges.
 shapes=[[(.084,.165),(.107,.150),(.127,.138),(.132,.157),(.132,.448),(.123,.461),(.084,.461)],[(.137,.145),(.249,.225),(.249,.347),(.171,.452),(.137,.452)],[(.146,.129),(.158,.012),(.249,.012),(.249,.211)]]
 for sx in [-1,1]:
  for sy in [-1,1]:
   for poly in shapes:
    q=[(sx*x,sy*y) for x,y in poly]
    for (ax,ay),(bx,by) in zip(q,q[1:]+q[:1]):
     dx=bx-ax;dy=by-ay;t=np.clip(((X-ax)*dx+(Y-ay)*dy)/(dx*dx+dy*dy),0,1)
     distance=np.minimum(distance,np.sqrt((X-ax-t*dx)**2+(Y-ay-t*dy)**2))
 rng=np.random.default_rng(3208);noise=rng.random((n,n));coarse=(np.sin(X*79+Y*13)+np.sin(Y*93-X*21))*.5
 edge=np.exp(-distance/.00085)*(noise>.44)
 # Sparse, fine-directional scuffs concentrate beside existing edges and lower handling zones.
 scratches=(np.sin((X+Y*.24)*4100+np.sin(Y*870))>.995)&(noise>.69)&(distance<.035)
 grime=np.exp(-distance/.003)*(1-edge)*(.4+.6*noise)
 for mat,col,metal,rough in [('steel',(.31,.33,.35),.92,.36),('cast',(.16,.17,.185),.88,.43),('iron',(.064,.071,.08),.82,.49)]:
  a=np.ones((n,n,4));base=np.array(col)[None,None,:]*(1+coarse[:,:,None]*.025+noise[:,:,None]*.015)
  a[:,:,:3]=np.clip(base*(1-.17*grime[:,:,None])+edge[:,:,None]*.035+scratches[:,:,None]*.025,0,1)
  bc=K.image_file(mat+'_localized_basecolor',a);a=np.ones((n,n,4));a[:,:,1]=np.clip(rough+grime*.10-edge*.13-scratches*.06,0,1);a[:,:,2]=metal;orm=K.image_file(mat+'_localized_orm',a)
  h=scratches.astype(float)*.012;dx=np.roll(h,1,1)-np.roll(h,-1,1);dy=np.roll(h,1,0)-np.roll(h,-1,0)
  a=np.ones((n,n,4));a[:,:,0]=.5+dx;a[:,:,1]=.5+dy;nm=K.image_file(mat+'_localized_normal',a)
  m=K.M[mat].copy();m.name=mat+' localized casing finish'
  for node in m.node_tree.nodes:
   if node.type=='TEX_IMAGE':
    old=node.image.name
    node.image=bc if 'basecolor' in old else orm if '_orm' in old else nm
  for image in [bc,orm,nm]:image.pack()
  for ob in targets:
   if ob.data.materials[0]!=K.M[mat]:continue
   ob.data.materials[0]=m;ob.data.materials.append(K.M[mat])
   uv=ob.data.uv_layers.active
   for polygon in ob.data.polygons:
    if abs(polygon.normal.z)<.5:
     polygon.material_index=1;continue
    for loop_i in polygon.loop_indices:
     v=ob.matrix_world@ob.data.vertices[ob.data.loops[loop_i].vertex_index].co
     uv.data[loop_i].uv=((v.x+.30)/.60,v.y+.50)
localized_finish()
# Repair collapsed UV islands on small automatically-unwrapped bevel faces.
def repair_collapsed_uvs():
 repairs=[]
 for ob in obs:
  if ob.type!='MESH':continue
  me=ob.data;uv=me.uv_layers.active;me.calc_loop_triangles();bad=set()
  for tri in me.loop_triangles:
   if tri.area<1e-11:continue
   a,b,c=[uv.data[i].uv for i in tri.loops]
   if abs((b.x-a.x)*(c.y-a.y)-(b.y-a.y)*(c.x-a.x))*.5<1e-12:bad.add(tri.polygon_index)
  for idx in bad:
   poly=me.polygons[idx];normal=poly.normal.normalized();reference=Vector((1,0,0)) if abs(normal.x)<.8 else Vector((0,1,0));u=normal.cross(reference).normalized();v=normal.cross(u).normalized()
   for li in poly.loop_indices:
    point=me.vertices[me.loops[li].vertex_index].co
    uv.data[li].uv=(.5+point.dot(u)*4,.5+point.dot(v)*4)
  if bad:repairs.append({'object':ob.name,'repairedPolygons':len(bad)})
 (OUT/'uv-repair-record.json').write_text(json.dumps({'method':'Polygon-local orthonormal projection for nonzero-area faces with collapsed UV triangles; 4 UV units per meter; geometry unchanged','repairs':repairs},indent=2)+'\n')
repair_collapsed_uvs()
def bounds(fr):
 scene.frame_set(fr);dg=bpy.context.evaluated_depsgraph_get();vs=[]
 for ob in obs:
  if ob.type!='MESH':continue
  eo=ob.evaluated_get(dg);me=eo.to_mesh();vs.extend(eo.matrix_world@v.co for v in me.vertices);eo.to_mesh_clear()
 mn=[min(v[k] for v in vs) for k in range(3)];mx=[max(v[k] for v in vs) for k in range(3)];return {'frame':fr,'min':mn,'max':mx,'dimensions':[mx[k]-mn[k] for k in range(3)]}
measure=[bounds(fr) for fr in range(1,182)]
(OUT/'measured-animation.json').write_text(json.dumps({'status':'UNAPPROVED_REFERENCE_COVERAGE_REPAIR','reference':'reference-032','coordinateSystem':'BlenderXYZmeters;GLB dimensionsXYZ=BlenderXZY','referenceInterpretation':'95cmheight;25cmstowedwidth;retractinghub andtemporaryhingelift are proposedhiddenengineering','bones':8,'scaleKeyframes':0,'triangles':K.triangles(obs),'bounds':measure,'remainingGates':['Exactreference artacceptance','Sweptvolume andcharacterfit','All-frameclearance','Independentengineimports','Localizedmanufacturingmaterials']},indent=2)+'\n')
scene.frame_set(1)
for im in bpy.data.images:
 if im.source=='FILE':im.pack()
bpy.ops.wm.save_as_mainfile(filepath=str(OUT/'impulse-shield-lateral-review08b.blend'))
bpy.ops.object.select_all(action='SELECT')
bpy.ops.export_scene.gltf(filepath=str(OUT/'impulse-shield-lateral-review08b.glb'),export_format='GLB',use_selection=True,export_apply=True,export_yup=True,export_extras=True,export_tangents=False)
print('REVIEW08B_GEOMETRY_COMPLETE')
