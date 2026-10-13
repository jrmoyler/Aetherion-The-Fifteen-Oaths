"""Tech & Force reference-032: modular impulse hammer, hinge shield, belt module.
Blender4.3.2 low-poly candidate sources, UV/PBR, weighted mechanical shield.
"""
import bpy,math,json,sys
from pathlib import Path
from mathutils import Vector
sys.path.insert(0,str(Path(__file__).parent));import kiln_weapons as K;import storm_weapons as S

def ring_x(name,center,r,w,mat,inner=None,n=16):
 o=K.ring(name,0,r,w,mat,inner,n);o.rotation_euler.z=math.pi/2;o.location=center;return o
def disc(name,loc,r,d,mat,n=16):
 o=K.cyl(name,loc,r,d,mat,n);o.rotation_euler=(0,0,0);return o
def screw(name,x,y,z,r=.008):
 o=disc(name,(x,y,z),r,.006,'steel',8);K.cube(name+' slot',(x,y,z+.004),(r*1.1,r*.19,.001),'rubber',0);return o

def hammer(state):
 long=state=='long-grip';headY=1.03 if long else .38
 K.cyl('Machined central haft',(0,(headY-.24)/2,0),.027,headY+.24,'steel',16)
 for y in ([.0,.16,.46,.74] if long else [-.05,.08]):
  K.cyl('Rubber impact grip sleeve',(0,y,0),.035,.13,'rubber',16)
  for j in range(4):K.ring('Grip traction ridge',y-.05+j*.033,.037,.007,'rubber',.033,16)
 for y in [-.22,headY-.16]:
  K.cyl('Locking haft joint',(0,y,0),.046,.068,'iron',12)
  for z in [-.047,.047]:K.cube('Orange joint latch',(0,y,z),(.032,.042,.007),'orange',.003)
 eye=K.ring('Fixed pommel carry eye',0,.035,.015,'steel',.024,16);eye.rotation_euler.x=math.pi/2;eye.location=(0,-.275,0)
 # Octagonal cross-axis impact shell with separate clamp rings/endcaps.
 head=K.cyl('Octagonal impulse housing',(0,headY,0),.132,.39,'iron',8);head.rotation_euler.z=math.pi/2
 for x in [-.216,.216]:
  ring_x('Heavy endcap steel cage',(x,headY,0),.146,.043,'steel',.120,8)
  body=K.cyl('Recessed striking plate',(x,headY,0),.112,.035,'rubber',16);body.rotation_euler.z=math.pi/2
  ring_x('Endcap orange indicator lip',(x+(.022 if x>0 else -.022),headY,0),.104,.006,'orange',.090,16)
  for j in range(8):
   a=j*math.pi/4;y=headY+.132*math.cos(a);z=.132*math.sin(a);o=K.cyl('Endcap clamp fastener',(x,y,z),.011,.048,'steel',8);o.rotation_euler.z=math.pi/2
 for x in [-.106,.106]:
  ring_x('Steel housing compression band',(x,headY,0),.138,.028,'steel',.125,8)
 for z in [-.129,.129]:
  K.cube('Central orange service panel',(0,headY,z),(.082,.13,.010),'orange',.010)
  K.cube('Recessed status stripe',(0,headY,z+(.006 if z>0 else -.006)),(.031,.09,.006),'rubber',.002)
  for x in [-.067,.067]:
   K.cube('Dark service access cover',(x,headY,z),(.041,.126,.009),'iron',.004)
   for y in [headY-.052,headY+.052]:screw('Service screw',x,y,z+(.007 if z>0 else -.007),.006)
 K.cube('Hammer neck yoke',(0,headY-.15,0),(.08,.088,.065),'iron',.01);K.socket('grip_primary',(0,0,0));K.socket('impact_center',(.24,headY,0))

def shield(state):
 # 95 cm vertical unfolded contour. Center spine and two articulated outer wings.
 K.cube('Shield center spine',(0,0,0),(.12,.93,.056),'iron',.015)
 for y in [-.41,.41]:K.cube('Spine orange end latch',(0,y,.037),(.063,.06,.013),'orange',.008)
 groups=[]
 for sign in [-1,1]:
  before=set(bpy.context.scene.objects)
  pts=[(sign*.065,-.46),(sign*.175,-.46),(sign*.25,-.36),(sign*.25,.35),(sign*.17,.46),(sign*.065,.46)]
  o=K.flat_profile('Outer shield steel frame',pts,.051,'steel')
  pts=[(sign*.088,-.421),(sign*.157,-.421),(sign*.215,-.336),(sign*.215,.328),(sign*.151,.42),(sign*.088,.42)]
  K.flat_profile('Recessed dark shield armor',pts,.061,'iron')
  for y in [-.19,.19]:
   K.cube('Panel armored seam',(sign*.154,y,.035),(.14,.014,.009),'steel',.003)
   K.cube('Panel orange edge marker',(sign*.24,y,.03),(.012,.087,.009),'orange',.003)
  for y in [-.40,-.26,0,.26,.40]:
   K.cyl('Exposed mechanical hinge knuckle',(sign*.071,y,0),.026,.054,'steel',12)
   K.cube('Hinge orange inspection tab',(sign*.076,y,.032),(.027,.033,.010),'orange',.003)
  for x,y in [(sign*.13,-.4),(sign*.19,-.31),(sign*.19,.30),(sign*.13,.4)]:screw('Panel edge rivet',x,y,.040,.006)
  groups.append(list(set(bpy.context.scene.objects)-before))
 disc('Central shield pressure disc',(0,0,.047),.087,.055,'steel',24);disc('Pressure disc inset',(0,0,.078),.067,.013,'iron',24)
 for i in range(8):
  a=i*math.pi/4;screw('Disc bolt',.076*math.cos(a),.076*math.sin(a),.083,.005)
  o=K.cube('Orange disc index',(.058*math.cos(a),.058*math.sin(a),.086),(.015,.006,.004),'orange',.001);o.rotation_euler.z=a
 disc('Central orange index ring',(0,0,.088),.032,.007,'orange',16);disc('Center actuator cap',(0,0,.094),.026,.009,'steel',16)
 # Raised open back straps with bridging arches, clear arm passage.
 for y in [-.20,.20]:
  K.cube('Forearm strap bridge',(0,y,-.115),(.14,.067,.018),'rubber',.006)
  for x in [-.067,.067]:K.cube('Forearm strap riser',(x,y,-.078),(.018,.067,.075),'rubber',.005)
  K.cube('Strap latch housing',(.075,y,-.105),(.035,.042,.025),'steel',.004)
  K.cube('Strap orange latch',(.094,y,-.112),(.009,.025,.009),'orange',.002)
 ar=bpy.data.armatures.new('Shield hinge skeleton');rig=bpy.data.objects.new('Shield folding rig',ar);bpy.context.collection.objects.link(rig);bpy.context.view_layer.objects.active=rig;bpy.ops.object.select_all(action='DESELECT');rig.select_set(True);bpy.ops.object.mode_set(mode='EDIT')
 for sign,name in [(-1,'left_wing'),(1,'right_wing')]:
  b=ar.edit_bones.new(name);b.head=(sign*.065,0,0);b.tail=(sign*.065,.20,0)
 bpy.ops.object.mode_set(mode='OBJECT')
 for idx,obs in enumerate(groups):
  for o in obs:
   if o.type!='MESH':continue
   g=o.vertex_groups.new(name='left_wing' if idx==0 else 'right_wing');g.add(list(range(len(o.data.vertices))),1,'REPLACE');m=o.modifiers.new('Mechanical panel weighting','ARMATURE');m.object=rig;o.parent=rig
 for i,p in enumerate(rig.pose.bones):
  p.rotation_mode='XYZ'
  for frame,v in [(1,0),(18,math.radians(92)),(32,math.radians(92)),(48,0)]:p.rotation_euler.y=v*(1 if i==0 else -1);p.keyframe_insert(data_path='rotation_euler',frame=frame)
 rig.animation_data.action.name='shield_fold_unfold';bpy.context.scene.frame_end=48;bpy.context.scene.frame_set(1);K.socket('grip_primary',(0,0,0));K.socket('forearm_mount',(0,0,-.10))

def module(state):
 pts=[(-.032,-.14),(.032,-.14),(.047,-.116),(.047,.10),(.025,.14),(-.025,.14),(-.047,.10),(-.047,-.116)]
 K.flat_profile('Belt module steel armor',pts,.035,'steel')
 K.flat_profile('Recessed charcoal module plate',[(-.024,-.123),(.023,-.123),(.032,-.102),(.032,.094),(.018,.124),(-.018,.124),(-.032,.094),(-.032,-.103)],.043,'iron')
 for x in [-.028,.028]:K.cube('Orange status rail',(x,0,.026),(.008,.186,.008),'orange',.002)
 for y in [-.112,.091]:
  K.cube('Steel module cross brace',(0,y,.031),(.079,.02,.014),'steel',.003)
  for x in [-.028,.028]:screw('Module brace screw',x,y,.042,.004)
 disc('Top module socket',(0,.066,.029),.018,.025,'steel',12);disc('Socket orange insert',(0,.066,.045),.011,.01,'orange',12)
 K.cube('Belt retaining clip',(0,0,-.030),(.027,.16,.015),'rubber',.004)
 for y in [-.065,.065]:K.cube('Belt clip foot',(0,y,-.018),(.027,.022,.025),'steel',.003)
 K.socket('grip_primary',(0,0,0));K.socket('belt_mount',(0,0,-.04))

if __name__=='__main__':
 S.configure(15);S.material_pack([('steel',(.36,.38,.39),.9,.40),('iron',(.080,.085,.088),.8,.53),('orange',(.88,.26,.014),.1,.55),('rubber',(.026,.027,.029),0,.89)],32);assets=[]
 for kind,state,fn in [('hammer','long-grip',hammer),('hammer','short-grip',hammer),('folding-shield','unfolded',shield),('belt-module','ready',module)]:
  a=K.build(kind,state,'impulse',S.collision,fn,(0,0,0));a['referenceIds']=['reference-032'];a['remainingGates']=['Art approval; finer manufacturing seams and scuffed edge fidelity','Character grip/forearm and belt-fit calibration','Damaged states absent','Actual engine imports, LOD transitions and performance','Impulse VFX/audio and gameplay integration']
  if kind=='folding-shield':a['rig']={'applicability':'ARTICULATED_MECHANICAL_SHIELD','status':'AUTHORED_UNVERIFIED','boneCount':2};a['animations']=[{'name':'shield_fold_unfold','durationSeconds':47/24}];a['remainingGates']+=['Reference25cm folded length needs longitudinal telescoping mechanism; current clip folds width only','Animation clearance/collision checks on representative arm']
  else:a['rig']={'applicability':'STATIC_RIGID_BODY','status':'NOT_APPLICABLE'};a['animations']=[]
  if kind=='hammer':a['remainingGates'].append('Current lengths1.486m long/0.836m short versus reference1.40m/0.75m; nominal scale adjustment remains open')
  if kind=='folding-shield':a['remainingGates'].append('Current unfolded length0.93m versus reference0.95m; nominal scale adjustment remains open')
  assets.append(a)
 S.save_manifest(assets,'asset-o15-e-weapons-family','reference-032');print('IMPULSE_COMPLETE',len(assets))
