"""Reference032 lateral folding shield; review-only. No longitudinal collapse."""
import bpy,math,sys,json,hashlib
import numpy as np
from pathlib import Path
from mathutils import Vector,Matrix
OUT=Path(__file__).resolve().parent;sys.path.insert(0,str(OUT/'recipe'));import kiln_weapons as K
K.ROOT=OUT;K.OUT=OUT;K.TEX=OUT/'textures';K.TEX.mkdir(exist_ok=True)
bpy.context.preferences.filepaths.save_version=0
bpy.ops.object.select_all(action='SELECT');bpy.ops.object.delete(use_global=False)
# Quiet brushed material base. Most seams, recesses and fasteners are modeled relief.
n=512;yy,xx=np.mgrid[:n,:n];rng=np.random.default_rng(3203)
for name,col,metal,rough in [('steel',(.31,.33,.35),.92,.36),('iron',(.064,.071,.08),.82,.49),('orange',(.91,.255,.022),.08,.48),('rubber',(.018,.021,.024),0,.84)]:
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
# Compact recessed pressure disc, beveled surround, separate cover and concentric seats.
for z,r,d,mat in [(.014,.092,.018,'steel'),(.023,.083,.008,'rubber'),(.029,.079,.008,'steel'),(.034,.067,.006,'iron'),(.037,.050,.005,'steel'),(.041,.037,.007,'iron'),(.046,.021,.006,'steel')]:disc('Pressure disc stepped bearing housing',0,0,z,r,d,mat,40)
for a in np.arange(12)*math.pi/6:
 bolt('Pressure cover countersunk fastener',.073*math.cos(a),.073*math.sin(a),.035,.003)
 if int(round(a/(math.pi/6)))%2==0:
  ob=K.cube('Orange segmented hub index',(.087*math.cos(a),.087*math.sin(a),.026),(.009,.016,.005),'orange',.001);ob.rotation_euler.z=a
# Fixed open straps sit within center relief, away from wing sweeps; fit is still proposed.
for y in [-.200,.200]:
 for x in [-.044,.044]:K.cube('Back strap machined stand-off',(x,y,-.052),(.015,.034,.073),'steel',.004)
 K.cube('Adjustable rear rubber forearm strap',(0,y,-.094),(.113,.037,.012),'rubber',.004)
 K.cube('Strap release buckle',(.029,y,-.083),(.027,.033,.025),'steel',.004)
 K.cube('Orange strap locking slider',(.044,y,-.079),(.006,.022,.012),'orange',.002)
# Source hub proportion: larger protective disc without arbitrary wholeasset scaling.
for ob in list(set(bpy.context.scene.objects)-root_before):
 if ob.name.startswith('Pressure') or ob.name.startswith('Orange segmented hub'):
  ob.location.x*=1.10;ob.location.y*=1.10
  if ob.type=='MESH' and not 'fastener' in ob.name:
   for v in ob.data.vertices:v.co.x*=1.10;v.co.y*=1.10
parts['carrier']=list(set(bpy.context.scene.objects)-root_before)
# Long continuous panels preserve outer silhouette. Relief around disc also clears opposingfold.
for sign in [-1,1]:
 hx=sign*.070;hz=.018;start=set(bpy.context.scene.objects)
 # Concave inner relief leaves an outside waist rib; no multiplied short cassettes.
 raw=[(.077,-.468),(.177,-.468),(.265,-.353),(.265,.353),(.177,.468),(.077,.468),(.077,.142)]
 raw +=[(max(.077,math.sqrt(max(0,.115**2-y*y))),y) for y in np.linspace(.115,-.115,25)]
 raw +=[(.077,-.142)]
 plate('Left continuous wing casting' if sign<0 else 'Right continuous wing casting',[(sign*x,y) for x,y in raw],0,.010,'steel')
 for sy in [-1,1]:
  pp=[(.090,.153),(.116,.110),(.132,.075),(.144,.023),(.250,.023),(.250,.347),(.171,.452),(.090,.452)]
  plate('Recessed upper armor panel' if sy>0 else 'Recessed lower armor panel',[(sign*x,sy*y) for x,y in pp],.006,.005,'iron')
  # Real reverse-side armor and recessed locking cassette remain visible when folded.
  plate('Reverse charcoal armor insert',[(sign*x,sy*y) for x,y in pp],-.006,.005,'iron')
  K.cube('Reverse hinge service housing',(sign*.102,sy*.310,-.013),(.027,.169,.010),'steel',.005)
  K.cube('Reverse inset locking channel',(sign*.102,sy*.310,-.019),(.017,.135,.004),'iron',.003)
  K.cube('Reverse orange safety slider',(sign*.102,sy*.354,-.022),(.012,.037,.003),'orange',.002)
  for y in [.249,.371]:
   disc('Reverse captive locking screw',sign*.102,sy*y,-.024,.0035,.003,'steel',8)
   disc('Reverse captive screw socket',sign*.102,sy*y,-.0258,.0017,.0005,'iron',6)
  # Cast shallow ribs and split service covers, aligned to actual wing loadpath.
  for z in [-.012,.012]:
   bar('Long recessed armor boundary',(sign*.246,sy*.140,z),(sign*.246,sy*.343,z),.004,.003,'steel')
  plate('Front contoured service access cover',[(sign*x,sy*y) for x,y in [(.136,.215),(.194,.215),(.214,.241),(.214,.313),(.199,.330),(.136,.330)]],.010,.003,'iron')
  for y in [.227,.317]:bolt('Access cover countersunk screw',sign*.150,sy*y,.013,.0023)
  # Faceted rim and diagonal strengthened load path follow panel shape.
  bar('Outer shoulder sloping raised rib',(sign*.182,sy*.446,.011),(sign*.247,sy*.351,.011),.006,.004,'steel')
  bar('Inner load transfer reinforcement',(sign*.103,sy*.157,.011),(sign*.226,sy*.128,.011),.006,.004,'steel')
  for x,y in [(.112,.427),(.233,.332),(.112,.163),(.228,.137)]:bolt('Continuous panel perimeter fastener',sign*x,sy*y,.012,.0035)
  K.cube('Orange replaceable edge insert',(sign*.258,sy*.237,.007),(.009,.075,.007),'orange',.002)
  # Service seam is an actual thin recessed strip between authored armor zones.
  bar('Inset panel service seam',(sign*.111,sy*.315,.009),(sign*.239,sy*.281,.009),.0013,.0007,'rubber')
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
cut=disc('Temporary central bearing bore',0,0,0,.104,.35,'iron',64)
for ob in parts['carrier']:
 if any(ob.name.startswith(n) for n in ['Continuous machined','Recessed center','Longitudinal housing']):bore(ob,cut)
bpy.data.objects.remove(cut,do_unlink=True)
start=set(bpy.context.scene.objects)
r=K.ring('Fixed annular hub slide guide',0,.112,.016,'steel',.104,64);r.rotation_euler.x=math.pi/2;r.location.z=-.006
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
 disc('Lift terminal solid rod',cx,cy,-.019,.0032,.074,'steel',20)
 bar('Moving hinge carriage bridge',(cx,cy,.020),(-.049,cy-math.copysign(.030,cy),.020),.006,.004,'steel')
 bar('Moving hinge carriage drop',(-.049,cy-math.copysign(.030,cy),.020),(-.049,cy-math.copysign(.030,cy),-.005),.006,.004,'steel')
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
obs=list(scene.objects);K.unwrap(obs)
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
bpy.ops.wm.save_as_mainfile(filepath=str(OUT/'impulse-shield-lateral-review07.blend'))
bpy.ops.object.select_all(action='SELECT')
bpy.ops.export_scene.gltf(filepath=str(OUT/'impulse-shield-lateral-review07.glb'),export_format='GLB',use_selection=True,export_apply=True,export_yup=True,export_extras=True,export_tangents=False)
print('REVIEW07_GEOMETRY_COMPLETE')
