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

def wrist(state):
 # Backplate and wearable open cuff are fixed, hinged curved blades are bone-driven.
 profile('Clockwork wrist backing',[(-.047,-.046),(.043,-.05),(.053,.023),(.031,.055),(-.031,.055),(-.053,.023)],.015,'brass')
 ring_xy('Wrist pivot bezel',(0,0,.020),.035,.012,'brass',.025,20);disc('Wrist pivot cap',(0,0,.024),.022,.013,'steel',16)
 # cuff as an open curved section in XZ, rather than solid intersecting wrist block
 K.sector('Open leather wrist cuff',-.035,.035,.046,.15,math.pi-.15,'leather',.009,10).location.z=-.050
 blades=[]
 for sign in [-1,1]:
  pts=[(sign*.026,-.014),(sign*.061,.030),(sign*.077,.070),(sign*.060,.099),(sign*.033,.115),(sign*.052,.076),(sign*.041,.047),(sign*.017,.017)]
  ob=profile('Deploying curved wrist blade',pts,.009,'steel',offset=(0,0,.016));blades.append(ob)
  edge=profile('Wrist cutting bevel',[(sign*.033,.115),(sign*.052,.076),(sign*.041,.047),(sign*.017,.017),(sign*.029,.020),(sign*.049,.052),(sign*.060,.079)],.010,'edge',offset=(0,0,.016));blades.append(edge)
 ar=bpy.data.armatures.new('Wrist deploy skeleton');rig=bpy.data.objects.new('Wrist blade hinges',ar);bpy.context.collection.objects.link(rig);bpy.context.view_layer.objects.active=rig;bpy.ops.object.select_all(action='DESELECT');rig.select_set(True);bpy.ops.object.mode_set(mode='EDIT')
 for name in ['left_hinge','right_hinge']:
  b=ar.edit_bones.new(name);b.head=(0,0,.016);b.tail=(0,.035,.016)
 bpy.ops.object.mode_set(mode='OBJECT')
 for i,o in enumerate(blades):
  g=o.vertex_groups.new(name='left_hinge' if i<2 else 'right_hinge');g.add(list(range(len(o.data.vertices))),1,'REPLACE');m=o.modifiers.new('Mechanical hinge weights','ARMATURE');m.object=rig;o.parent=rig
 for i,p in enumerate(rig.pose.bones):
  p.rotation_mode='XYZ'
  for frame,v in [(1,0),(16,math.radians(120)),(32,math.radians(120)),(48,0)]:p.rotation_euler.z=v*(1 if i==0 else -1);p.keyframe_insert(data_path='rotation_euler',frame=frame)
 rig.animation_data.action.name='wrist_deploy_retract';bpy.context.scene.frame_end=48;bpy.context.scene.frame_set(1);K.socket('grip_primary',(0,0,0));K.socket('wrist_mount',(0,0,-.070))

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
