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
 # Reference-032: split cast housing, armored end cages, seated plates and service hardware.
 # Exact overall longitudinal envelopes:1.40m long grip /0.75m short grip.
 long=state=='long-grip';headY=.944 if long else .294
 def head_panel(name,x0,x1,a,r,t,mat,half=.048):
  # Clipped cast panel follows one face of the octagonal housing, rather than a whole drum.
  pts=[(x0+.012,-half),(x1-.013,-half),(x1,-half+.014),(x1,half-.015),(x1-.014,half),(x0+.014,half),(x0,half-.015),(x0,-half+.014)];vs=[]
  for rr in [r,r+t]:vs += [(x,headY+math.cos(a)*rr-math.sin(a)*v,math.sin(a)*rr+math.cos(a)*v) for x,v in pts]
  n=len(pts);fs=[tuple(reversed(range(n))),tuple(range(n,2*n))]+[(i,(i+1)%n,(i+1)%n+n,i+n) for i in range(n)];return K.mesh(name,vs,fs,mat)
 def radial_pin(x,a,r=.138,size=.007):
  ob=K.cyl('Recessed housing hex fastener',(x,headY+math.cos(a)*r,math.sin(a)*r),size,.008,'steel',8)
  ob.rotation_euler=Vector((0,math.cos(a),math.sin(a))).to_track_quat('Z','Y').to_euler()
  return ob
 # Actual metal core, continuous below separately replaceable grip and shaft shells.
 shaftTop=headY-.124;shaftBottom=-.224
 K.cyl('Continuous steel haft',(0,(shaftTop+shaftBottom)/2,0),.024,shaftTop-shaftBottom,'steel',20)
 end=min(.25,headY-.150);start=-.174
 K.cyl('Molded rubber handgrip',(0,(start+end)/2,0),.032,end-start,'rubber',20)
 # Wound raised grip follows a helical path, interrupted by machined joint rings.
 turns=max(6,int((end-start)/.026))
 for i in range(turns):
  yy=start+(end-start)*i/turns;vs=[];n=20
  for j in range(n+1):
   a=j*2*math.pi/n
   for off in [-.006,.006]:vs.append((.0335*math.cos(a),yy+.022*a/(2*math.pi)+off,.0335*math.sin(a)))
  K.mesh('Helical grip traction rib',vs,[(2*j,2*j+1,2*j+3,2*j+2) for j in range(n)],'rubber')
 for y in [start-.013,end+.014]:
  K.ring('Knurled grip end collar',y,.036,.020,'steel',.026,20)
  for i in range(12):
   a=i*math.pi/6;o=K.cube('Collar machined groove',(.036*math.cos(a),y,.036*math.sin(a)),(.002,.018,.002),'rubber',0)
 if long:
  K.cyl('Upper machined shaft segment',(0,.533,0),.027,.51,'iron',16)
  for yy in [.33,.50,.70]:
   K.ring('Upper shaft joint shoulder',yy,.033,.026,'steel',.024,16)
   for z in [-.029,.029]:
    K.cube('Upper shaft recessed rail',(0,yy+.061,z),(.028,.083,.007),'rubber',.006)
    for x in [-.017,.017]:K.cube('Raised shaft rail border',(x,yy+.061,z),(.006,.079,.008),'steel',.002)
 # Flared mechanical neck, split orange release blocks, and a fitted exposed eye.
 for yy in [-.221,headY-.159]:
  K.cyl('Octagonal haft coupling',(0,yy,0),.047,.060,'iron',8)
  for z in [-.044,.044]:
   K.cube('Coupling steel face',(0,yy,z),(.045,.044,.011),'steel',.005)
   K.cube('Safety orange release',(0,yy,z+(.007 if z>0 else -.007)),(.026,.028,.004),'orange',.004)
   screw('Release screw',0,yy,z+(.011 if z>0 else -.011),.004)
 eye=K.ring('Solid pommel carrying eye',0,.035,.015,'steel',.023,20);eye.rotation_euler.x=math.pi/2;eye.location=(0,-.275,0)
 # Split replaceable housing halves expose a central compression seam.
 core=K.cyl('Octagonal inner impulse housing',(0,headY,0),.112,.382,'iron',8);core.rotation_euler.z=math.pi/2
 for i in range(8):
  a=math.pi/8+i*math.pi/4
  for x0,x1 in [(-.176,-.018),(.018,.176)]:
   head_panel('Cast steel panel seat',x0-.005,x1+.005,a,.109,.013,'steel',.046)
   head_panel('Inset charcoal armor panel',x0,x1,a,.123,.007,'iron',.039)
   # UV-facing mechanical seams and service bolts are aligned to each individual panel.
   for xx in [x0+.024,x1-.024]:radial_pin(xx,a,.135,.0055)
  head_panel('Center gasket bridge',-.013,.013,a,.114,.013,'rubber',.035)
  if i%2==0:
   for x0,x1 in [(-.183,-.149),(.149,.183)]:
    head_panel('End safety orange cassette',x0,x1,a,.130,.008,'orange',.032)
  else:
   # Independently raised narrow locking spine over the panel seams.
   head_panel('Cast panel locking rib',-.154,.154,a,.127,.008,'steel',.014)
 # Endcaps: outer steel cage, dark shock gasket, striking core and inspectable concentric seats.
 for sign in [-1,1]:
  xx=sign*.215
  ring_x('Octagonal end cage',(xx,headY,0),.146,.033,'steel',.117,8)
  ring_x('Endcap shock gasket',(xx+sign*.019,headY,0),.117,.007,'rubber',.097,20)
  core=K.cyl('Recessed impact contact',(xx+sign*.017,headY,0),.096,.025,'iron',24);core.rotation_euler.z=math.pi/2
  ring_x('Impact machined steel rim',(xx+sign*.031,headY,0),.089,.008,'steel',.076,24)
  ring_x('Inner damping seal',(xx+sign*.036,headY,0),.074,.006,'rubber',.064,24)
  face=K.cyl('Hardened striking puck',(xx+sign*.037,headY,0),.061,.007,'steel',24);face.rotation_euler.z=math.pi/2
  for i in range(8):
   a=math.pi/8+i*math.pi/4
   ob=K.cyl('End cage captive fastener',(xx+sign*.022,headY+.131*math.cos(a),.131*math.sin(a)),.008,.009,'iron',8);ob.rotation_euler.z=math.pi/2
 # A small layered service bearing replaces the previous oversized orange button.
 disc('Service bearing steel surround',(0,headY,.129),.034,.016,'steel',20)
 disc('Service bearing graphite recess',(0,headY,.140),.024,.009,'rubber',20)
 disc('Service center orange key',(0,headY,.147),.012,.008,'orange',12)
 for a in [0,math.pi/2,math.pi,3*math.pi/2]:screw('Service cover screw',.027*math.cos(a),headY+.027*math.sin(a),.141,.0035)
 K.cube('Neck load-transfer yoke',(0,headY-.124,0),(.076,.078,.070),'steel',.008)
 for z in [-.041,.041]:
  K.cube('Yoke inset side plate',(0,headY-.125,z),(.053,.057,.008),'iron',.005)
  for y in [headY-.142,headY-.107]:screw('Yoke pin',0,y,z+(.008 if z>0 else -.008),.006)
 K.socket('grip_primary',(0,0,0));K.socket('impact_center',(.258,headY,0))

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
