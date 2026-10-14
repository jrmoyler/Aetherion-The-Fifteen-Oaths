"""Author one Kiln ninja candidate from inspected references 090 and 060.
Blender 4.3.2: blender -b --python tools/production/authoring/kiln_ninja.py
Meters, Blender Z up, front -Y. Source identity and all artwork remain untouched.
Deliberately no imported/generative character stock; cross-section topology is authored here.
"""
import bpy, math, json, random, sys, hashlib
import numpy as np
from pathlib import Path
from mathutils import Vector, Matrix
ROOT=Path(__file__).resolve().parents[3]
OUT=ROOT/'assets/production/oath-01/characters';OUT.mkdir(parents=True,exist_ok=True)
ID='kiln-ninja-ensemble-candidate';D=OUT/ID;D.mkdir(exist_ok=True)
random.seed(90)
PARTS=[];MAT=None
CELLS={'cloth':0,'ceramic':1,'iron':2,'skin':3,'leather':4,'hair':5,'eye':6,'iris':7}
BONES={}

def atlas():
 global MAT
 n=1024;s=256;yy,xx=np.mgrid[:s,:s];rng=np.random.default_rng(90)
 bc=np.ones((n//2,n,4));orm=bc.copy();normal=bc.copy()
 colors=[(.051,.046,.042),(.62,.255,.128),(.15,.14,.13),(.54,.35,.245),(.105,.067,.043),(.028,.023,.021),(.69,.63,.51),(.07,.048,.031)]
 for i,col in enumerate(colors):
  noise=rng.random((s,s));r=(i//4)*s;c=(i%4)*s
  grain=.88+noise*.24
  if i==0: grain*=1+((xx%4==0)|(yy%4==0))*.12
  if i==1: grain[noise>.96]*=.48
  if i==4: grain*=.9+.1*np.sin(xx*.8+np.sin(yy*.2))
  if i==5: grain*=.82+.18*np.sin(xx*.24+np.sin(yy*.034)*2)
  for k in range(3):bc[r:r+s,c:c+s,k]=col[k]*grain
  orm[r:r+s,c:c+s,0]=1;orm[r:r+s,c:c+s,1]=([.84,.75,.55,.77,.81,.72,.28,.3][i]+(noise-.5)*.1);orm[r:r+s,c:c+s,2]=.83 if i==2 else 0
  normal[r:r+s,c:c+s,0]=.5+(noise-.5)*.11;normal[r:r+s,c:c+s,1]=.5+(np.roll(noise,1,0)-.5)*.11;normal[r:r+s,c:c+s,2]=1
 images=[]
 for name,pix in [('basecolor',bc),('orm',orm),('normal',normal)]:
  path=D/(ID+'-'+name+'.png');im=bpy.data.images.new('Kiln atlas '+name,width=n,height=n//2,alpha=True);im.colorspace_settings.name='Non-Color';im.pixels.foreach_set(pix.astype(np.float32).ravel());im.filepath_raw=str(path);im.file_format='PNG';im.save();bpy.data.images.remove(im);im=bpy.data.images.load(str(path),check_existing=False);im.colorspace_settings.name='sRGB' if name=='basecolor' else 'Non-Color';images.append(im)
 MAT=bpy.data.materials.new('Kiln firecloth / porous ceramic / oxidized iron atlas');MAT.use_nodes=True;nodes=MAT.node_tree.nodes;links=MAT.node_tree.links;bs=nodes.get('Principled BSDF')
 ts=[]
 for im in images:t=nodes.new('ShaderNodeTexImage');t.image=im;ts.append(t)
 links.new(ts[0].outputs['Color'],bs.inputs['Base Color']);sep=nodes.new('ShaderNodeSeparateColor');links.new(ts[1].outputs['Color'],sep.inputs[0]);links.new(sep.outputs['Green'],bs.inputs['Roughness']);links.new(sep.outputs['Blue'],bs.inputs['Metallic'])
 nm=nodes.new('ShaderNodeNormalMap');nm.inputs['Strength'].default_value=.3;links.new(ts[2].outputs['Color'],nm.inputs['Color']);links.new(nm.outputs[0],bs.inputs['Normal'])
 # Recognized glTF occlusion channel shares the packed ORM image.
 group=bpy.data.node_groups.new('glTF Material Output','ShaderNodeTree');group.interface.new_socket(name='Occlusion',in_out='INPUT',socket_type='NodeSocketFloat');gn=nodes.new('ShaderNodeGroup');gn.node_tree=group;links.new(sep.outputs['Red'],gn.inputs['Occlusion'])
 return [str((D/(ID+'-'+s+'.png')).relative_to(ROOT)) for s in ['basecolor','orm','normal']]

def mesh(name,verts,faces,mat,weights):
 me=bpy.data.meshes.new(name);me.from_pydata(verts,[],faces);me.update();ob=bpy.data.objects.new(name,me);bpy.context.collection.objects.link(ob);ob.data.materials.append(MAT)
 for i,v in enumerate(verts):
  w=weights(v) if callable(weights) else weights
  for bone,value in w.items():
   if value>1e-6:
    g=ob.vertex_groups.get(bone) or ob.vertex_groups.new(name=bone);g.add([i],value,'REPLACE')
 bpy.ops.object.select_all(action='DESELECT');ob.select_set(True);bpy.context.view_layer.objects.active=ob
 bpy.ops.object.mode_set(mode='EDIT');bpy.ops.mesh.select_all(action='SELECT');bpy.ops.mesh.normals_make_consistent(inside=False);bpy.ops.uv.smart_project(angle_limit=1.0,island_margin=.018);bpy.ops.object.mode_set(mode='OBJECT')
 cell=CELLS[mat]
 for uv in me.uv_layers.active.data:uv.uv=((cell%4+(.03+uv.uv.x*.94))/4,(cell//4+(.03+uv.uv.y*.94))/2)
 ob['authoring_component']=name;ob['material_region']=mat;PARTS.append(ob);return ob

def rings(name,sections,mat,weights,n=12):
 # section=(x,y,z,halfwidth,halfdepth); rings around Z for tailored torso, legs and head.
 vs=[]
 for x,y,z,rx,ry in sections:
  vs.extend([(x+rx*math.cos(2*math.pi*i/n),y+ry*math.sin(2*math.pi*i/n),z) for i in range(n)])
 fs=[tuple(reversed(range(n))),tuple((len(sections)-1)*n+i for i in range(n))]
 for k in range(len(sections)-1):
  for i in range(n):j=(i+1)%n;fs.append((k*n+i,k*n+j,(k+1)*n+j,(k+1)*n+i))
 return mesh(name,vs,fs,mat,weights)

def tube(name,points,radii,mat,weights,n=10):
 vs=[]
 for k,pt in enumerate(points):
  tangent=Vector(points[min(k+1,len(points)-1)])-Vector(points[max(0,k-1)])
  tangent.normalize();axis=Vector((0,1,0));u=tangent.cross(axis).normalized();v=tangent.cross(u).normalized()
  rad=radii[k];rx,ry=rad if isinstance(rad,tuple) else (rad,rad)
  vs.extend([Vector(pt)+u*(rx*math.cos(i*2*math.pi/n))+v*(ry*math.sin(i*2*math.pi/n)) for i in range(n)])
 fs=[tuple(reversed(range(n))),tuple((len(points)-1)*n+i for i in range(n))]
 for k in range(len(points)-1):
  for i in range(n):j=(i+1)%n;fs.append((k*n+i,k*n+j,(k+1)*n+j,(k+1)*n+i))
 return mesh(name,vs,fs,mat,weights)

def slab(name,polygon,depth,mat,weights):
 # Front profile in world-space, thickness extends backward +Y.
 vs=polygon+[(x,y+depth,z) for x,y,z in polygon];n=len(polygon)
 fs=[tuple(reversed(range(n))),tuple(range(n,n*2))]+[(i,(i+1)%n,(i+1)%n+n,i+n) for i in range(n)]
 return mesh(name,vs,fs,mat,weights)

def rect(name,c,size,mat,weights):
 x,y,z=c;w,d,h=size
 return slab(name,[(x-w/2,y-d/2,z-h/2),(x+w/2,y-d/2,z-h/2),(x+w/2,y-d/2,z+h/2),(x-w/2,y-d/2,z+h/2)],d,mat,weights)

def blend(v,lower,upper,z0,z1):
 t=max(0,min(1,(v[2]-z0)/(z1-z0)));return {lower:1-t,upper:t}
def torso(v):
 if v[2]<1.18:return blend(v,'pelvis','spine',1.02,1.18)
 return blend(v,'spine','chest',1.2,1.42)

def create_geometry():
 # Connected ring topology through torso and each limb, weighted across bending zones.
 rings('Fitted firecloth undershirt',[(0,0,.94,.137,.09),(0,0,1.02,.147,.095),(0,0,1.12,.155,.098),(0,0,1.22,.177,.108),(0,0,1.35,.215,.115),(0,0,1.44,.221,.106),(0,0,1.49,.178,.089),(0,0,1.51,.07,.062)],'cloth',torso,16)
 rings('Neck',[(0,0,1.47,.058,.048),(0,0,1.53,.057,.049),(0,-.004,1.61,.053,.048)],'skin',lambda v:blend(v,'chest','neck',1.50,1.55))
 rings('Tailored trouser pelvis',[(0,0,.91,.135,.09),(0,0,1.03,.159,.106),(0,0,1.075,.156,.098)],'cloth',{'pelvis':1},16)
 for side,sign in [('L',1),('R',-1)]:
  thigh='thigh.'+side;shin='shin.'+side;foot='foot.'+side;upper='upper_arm.'+side;fore='forearm.'+side;hand='hand.'+side
  x=.105*sign
  def legw(v,thigh=thigh,shin=shin):return blend(v,shin,thigh,.51,.61)
  rings('Bloused trouser leg '+side,[(x,0,.505,.063,.067),(x,0,.55,.078,.08),(x,0,.61,.0945,.105),(x,0,.70,.0963,.108),(x,0,.81,.0963,.12),(x,0,.94,.0981,.104),(x,0,1.02,.091,.08)],'cloth',legw,12)
  rings('Shin leather wrap '+side,[(x,-.008,.14,.058,.06),(x,0,.21,.056,.054),(x,0,.35,.061,.056),(x,0,.48,.07,.063),(x,0,.54,.062,.062)],'leather',lambda v,shin=shin,foot=foot:blend(v,foot,shin,.13,.22),12)
  slab('Angular shin guard '+side,[(x-.051,-.063,.19),(x+.051,-.063,.19),(x+.064,-.062,.43),(x+.037,-.066,.49),(x-.038,-.066,.49),(x-.063,-.062,.43)],.012,'cloth',{shin:1})
  for z in [.50,.525]:rings('Knee binding '+side,[(x,0,z-.009,.068,.065),(x,0,z+.009,.068,.065)],'leather',legw,12)
  # Last-shaped boot rings extend forward from ankle with flattened sole, not sphere feet.
  rings('Boot fitted last '+side,[(x,-.055,.025,.07,.145),(x,-.055,.055,.073,.145),(x,-.05,.105,.07,.126),(x,-.008,.17,.06,.068),(x,0,.24,.056,.055)],'leather',{foot:1},12)
  rings('Sole '+side,[(x,-.055,.016,.073,.147),(x,-.055,.04,.076,.15)],'iron',{foot:1},12)
  for z,y in [(.075,-.126),(.13,-.06),(.195,-.012),(.23,-.003)]:
   slab('Boot ceramic fastening '+side,[(x-.056,y-.018,z-.013),(x+.056,y-.018,z-.013),(x+.056,y-.018,z+.013),(x-.056,y-.018,z+.013)],.026,'ceramic',{foot:1})
   rect('Boot clasp '+side,(x+.046,y-.027,z),(.018,.014,.021),'iron',{foot:1})
  # Arms in relaxed A pose, bend topology concentrated on elbow and wrist.
  shoulder=(sign*.217,0,1.459);elbow=(sign*.326,0,1.235);wrist=(sign*.395,-.009,1.015)
  def armw(v,upper=upper,fore=fore):return blend(v,fore,upper,1.205,1.275)
  tube('Arm skin contiguous elbow '+side,[shoulder,(sign*.26,0,1.365),(sign*.31,0,1.275),elbow,(sign*.336,-.005,1.20),(sign*.368,-.009,1.1),wrist],[.059,.055,.051,.047,.048,.042,.033],'skin',armw,12)
  tube('Short tailored sleeve '+side,[shoulder,(sign*.253,0,1.395),(sign*.292,0,1.303)],[.066,.066,.058],'cloth',{upper:1},12)
  tube('Sleeve cuff '+side,[(sign*.29,0,1.31),(sign*.3,0,1.29)],[.065,.065],'leather',{upper:1},12)
  tube('Forearm wrap '+side,[(sign*.345,-.002,1.195),(sign*.369,-.009,1.105),(sign*.397,-.012,1.012)],[.054,.048,.039],'leather',{fore:1},12)
  # One large vented ceramic bracer and one lean wrapped arm as in turnaround.
  if side=='L':
   for z in [1.08,1.125,1.17]:
    cx=sign*(.395-(z-1.015)*.31)
    rect('Vented bracer crosspiece',(cx,-.060,z),(.095,.018,.016),'ceramic',{fore:1})
   for dx in [-.041,.041]:
    slab('Bracer ceramic longitudinal rail',[(.395+dx,-.051,1.04),(.395+dx+.013,-.051,1.04),(.342+dx+.013,-.051,1.20),(.342+dx,-.051,1.20)],.018,'ceramic',{fore:1})
   for z in [1.065,1.185]:rect('Iron bracer latch',(.395-(z-1.015)*.31+.047,-.06,z),(.022,.025,.018),'iron',{fore:1})
  else:
   for z in [1.07,1.115,1.16]:
    xx=sign*(.395-(z-1.015)*.31);tube('Diagonal forearm strap',[(xx,0,z-.013),(xx,0,z+.013)],[.051,.051],'cloth',{fore:1},10)
   slab('Slim ceramic forearm plate',[(-.42,-.045,1.025),(-.39,-.05,1.025),(-.33,-.056,1.175),(-.365,-.056,1.185)],.009,'ceramic',{fore:1})
  tube('Fingerless glove palm '+side,[wrist,(sign*.415,-.013,.972),(sign*.425,-.018,.937)],[.036,(.035,.046),(.028,.038)],'cloth',{hand:1},10)
  # Four distinct articulated finger chains and opposable thumb; restrained neutral curl.
  for j in range(4):
   y=-.051+j*.023;start=(sign*.426,y,.949);mid=(sign*(.435+.008*(j==1)),y-.009,.916-.008*(j in [1,2]));end=(sign*.430,y-.02,.889+.011*(j==3))
   b='finger%d.%s'%(j+1,side);bt='finger%d_tip.%s'%(j+1,side)
   BONES[b]=(start,mid,hand);BONES[bt]=(mid,end,b)
   tube('Finger %s %s'%(j+1,side),[start,mid,end],[.012,.01,.008],'skin',lambda v,b=b,bt=bt:blend(v,bt,b,.905,.931),8)
  start=(sign*.400,-.047,.974);mid=(sign*.390,-.069,.946);end=(sign*.399,-.078,.927);b='thumb.'+side
  BONES[b]=(start,end,hand);tube('Exposed thumb '+side,[start,mid,end],[.014,.013,.01],'skin',{b:1},8)
 # Chest four separate curved ceramic lames, dark gaps and alternating edge rivets.
 for k in range(4):
  z=1.15+k*.071;half=.151+k*.012
  poly=[(-half,-.103,z),(0,-.128,z-.005),(half,-.103,z),(half+.008,-.105,z+.053),(0,-.132,z+.059),(-half-.008,-.105,z+.053)]
  # Explicit quads follow chest curvature; avoid tessellating a nonplanar n-gon.
  vs=[]
  for rear in [0,.012]:
   for top in [0,.055]:
    for q in [-1,-.5,0,.5,1]:vs.append((q*half,-.117-.03*(1-q*q)+rear,z+top))
  fs=[]
  for j in range(4):fs.extend([(j,j+1,j+6,j+5),(10+j,15+j,16+j,11+j),(j,10+j,11+j,j+1),(5+j,6+j,16+j,15+j)])
  fs.extend([(0,5,15,10),(4,14,19,9)])
  mesh('Fired ceramic chest lame %d'%k,vs,fs,'ceramic',torso)
  for side in [-1,1]:rect('Iron plate rivet',(side*(half-.02),-.117,z+.031),(.008,.008,.008),'iron',torso)
  # Back bands visible below cape.
  slab('Rear ceramic chest band %d'%k,[(-half,.099,z),(half,.099,z),(half,.105,z+.055),(-half,.105,z+.055)],.012,'ceramic',torso)
 rings('Waist utility belt',[(0,0,1.062,.164,.112),(0,0,1.115,.164,.112)],'leather',{'pelvis':1},16)
 rect('Belt buckle outer',(0,-.120,1.087),(.069,.021,.051),'iron',{'pelvis':1});rect('Buckle inset',(0,-.134,1.087),(.047,.006,.032),'leather',{'pelvis':1});rect('Buckle tongue',(.013,-.141,1.087),(.034,.007,.006),'iron',{'pelvis':1})
 for sx in [-1,1]:
  slab('Hip tool pocket',[(sx*.127,-.084,.915),(sx*.197,-.059,.939),(sx*.183,-.071,1.033),(sx*.124,-.096,1.035)],.022,'leather',{'pelvis':1})
  slab('Trouser edge piping',[(sx*.045,-.099,1.063),(sx*.056,-.103,1.063),(sx*.145,-.103,.889),(sx*.136,-.103,.879)],.006,'ceramic',{'pelvis':1})
 # Asymmetrical hand-shaped cape surface, front and back drape; no rigid cylinder poncho.
 front=[(-.075,-.065,1.52),(.070,-.070,1.52),(.242,-.066,1.458),(.285,-.069,1.407),(.323,-.073,1.310),(.175,-.145,1.342),(.015,-.15,1.386),(-.188,-.105,1.465)]
 slab('Asymmetric firecloth shoulder cape',front,.012,'cloth',{'chest':1})
 slab('Cape terracotta lower binding',[front[4],front[5],front[6],front[7],(-.180,-.109,1.471),(.015,-.155,1.395),(.174,-.15,1.351),(.319,-.077,1.32)],.006,'ceramic',{'chest':1})
 back=[(-.07,.06,1.52),(.07,.06,1.52),(.24,.064,1.46),(.318,.08,1.315),(.17,.132,1.345),(-.07,.12,1.42),(-.19,.08,1.47)]
 slab('Rear asymmetric cape fall',back,.008,'cloth',{'chest':1})
 # Diagonal shoulder harness visible on high bare side.
 slab('Shoulder harness',[(-.211,-.105,1.48),(-.179,-.113,1.49),(-.092,-.145,1.277),(-.12,-.135,1.268)],.014,'leather',torso)
 rect('Cape shoulder buckle',(-.185,-.127,1.467),(.056,.018,.041),'iron',{'chest':1});rect('Cape buckle hole',(-.185,-.14,1.467),(.036,.006,.024),'leather',{'chest':1})
 rings('Layered neck cowl',[(0,0,1.486,.072,.068),(0,-.005,1.52,.083,.073),(0,-.004,1.555,.066,.060),(0,-.002,1.581,.063,.059)],'cloth',lambda v:blend(v,'chest','neck',1.515,1.57),16)
 # Faceted anatomical head rings: narrow jaw, cheekbone plane, cranial vault.
 rings('Low poly facial topology',[(0,-.010,1.587,.039,.041),(0,-.016,1.616,.064,.059),(0,-.010,1.654,.079,.07),(0,0,1.697,.086,.073),(0,.006,1.738,.080,.072),(0,.009,1.768,.061,.053),(0,.012,1.784,.024,.025)],'skin',{'head':1},16)
 # Eyelids and angled dark brows, nose bridge extending beyond facial plane.
 for sx in [-1,1]:
  slab('Eye socket lid',[(sx*.011,-.072,1.685),(sx*.066,-.062,1.691),(sx*.064,-.064,1.675),(sx*.014,-.075,1.674)],.006,'cloth',{'head':1})
  slab('Eye sclera',[(sx*.016,-.080,1.681),(sx*.059,-.071,1.686),(sx*.055,-.073,1.678),(sx*.019,-.081,1.675)],.004,'eye',{'head':1})
  rect('Iris',(sx*.034,-.082,1.68),(.011,.003,.011),'iris',{'head':1})
  slab('Expressive brow',[(sx*.010,-.077,1.696),(sx*.064,-.066,1.705),(sx*.067,-.066,1.697),(sx*.013,-.078,1.689)],.005,'hair',{'head':1})
  rings('Ear '+str(sx),[(sx*.079,.002,1.643,.013,.012),(sx*.089,.003,1.67,.012,.015),(sx*.080,.003,1.689,.011,.012)],'skin',{'head':1},8)
 slab('Nose bridge',[(-.012,-.079,1.681),(0,-.098,1.645),(.014,-.079,1.65),(.010,-.077,1.684)],.012,'skin',{'head':1})
 # Iron muzzle mask curves around mouth; ceramic vertical slats form distinct motif.
 slab('Iron half mask',[(-.071,-.059,1.645),(-.047,-.087,1.64),(0,-.099,1.637),(.047,-.087,1.64),(.071,-.059,1.645),(.06,-.062,1.596),(0,-.095,1.583),(-.06,-.062,1.596)],.009,'iron',{'head':1})
 for x in [-.047,-.03,-.013,.006,.025,.043]:
  y=-.106+abs(x)*.36;rect('Mask ceramic heat grille',(x,y,1.615),(.007,.006,.045-abs(x)*.16),'ceramic',{'head':1})
 # Hand-authored clumped hair cap and directional angular locks; no generic sphere haircut.
 rings('Faceted dark hair crown',[(0,.015,1.706,.087,.075),(0,.014,1.756,.085,.075),(0,.016,1.789,.064,.055),(0,.02,1.804,.032,.032)],'hair',{'head':1},12)
 for i in range(20):
  a=i*2*math.pi/20;r=.073;cx=math.cos(a)*r;cy=.012+math.sin(a)*r
  z=1.775+random.uniform(-.009,.017); tip=(cx+math.cos(a+.65)*.035,cy+math.sin(a+.65)*.035,z+random.uniform(.004,.032))
  base=[(cx-.022,cy-.019,z-.025),(cx+.022,cy-.015,z-.024),(cx+.018,cy+.02,z-.012),(cx-.02,cy+.018,z-.01)]
  mesh('Directional hair lock %02d'%i,base+[tip],[(0,1,4),(1,2,4),(2,3,4),(3,0,4),(3,2,1,0)],'hair',{'head':1})
 for i in range(7):
  x=-.072+i*.022;tip=(x+.018,-.085,1.70+random.uniform(-.006,.018))
  mesh('Angular front fringe %d'%i,[(x-.014,-.045,1.769),(x+.023,-.04,1.766),(x+.02,-.074,1.749),(x-.015,-.077,1.75),tip],[(0,1,2,3),(0,4,1),(1,4,2),(2,4,3),(3,4,0)],'hair',{'head':1})

def rig():
 BONES.update({'root':((0,0,0),(0,0,.15),None),'pelvis':((0,0,.95),(0,0,1.10),'root'),'spine':((0,0,1.10),(0,0,1.28),'pelvis'),'chest':((0,0,1.28),(0,0,1.49),'spine'),'neck':((0,0,1.49),(0,0,1.61),'chest'),'head':((0,0,1.61),(0,0,1.80),'neck')})
 for side,s in [('L',1),('R',-1)]:
  BONES.update({'clavicle.'+side:((s*.06,0,1.45),(s*.217,0,1.459),'chest'),'upper_arm.'+side:((s*.217,0,1.459),(s*.326,0,1.235),'clavicle.'+side),'forearm.'+side:((s*.326,0,1.235),(s*.395,-.009,1.015),'upper_arm.'+side),'hand.'+side:((s*.395,-.009,1.015),(s*.426,-.018,.942),'forearm.'+side),'thigh.'+side:((s*.105,0,.95),(s*.105,0,.55),'pelvis'),'shin.'+side:((s*.105,0,.55),(s*.105,-.008,.15),'thigh.'+side),'foot.'+side:((s*.105,-.008,.15),(s*.105,-.15,.075),'shin.'+side)})
 bpy.ops.object.select_all(action='DESELECT');a=bpy.data.armatures.new('Kiln humanoid articulation');ob=bpy.data.objects.new('Kiln_Ninja_Rig',a);bpy.context.collection.objects.link(ob);ob.select_set(True);bpy.context.view_layer.objects.active=ob;bpy.ops.object.mode_set(mode='EDIT')
 for name,(h,t,p) in BONES.items():b=a.edit_bones.new(name);b.head=h;b.tail=t
 for name,(h,t,p) in BONES.items():
  if p:a.edit_bones[name].parent=a.edit_bones[p]
 bpy.ops.object.mode_set(mode='OBJECT');ob.show_in_front=True
 for p in ob.pose.bones:p.rotation_mode='XYZ'
 return ob

def animation(rig):
 # Pure authored in-place clips, export all actions by explicit NLA strips.
 clips=[]
 for name,duration in [('idle_breath',48),('walk_in_place',32),('cast_release',48)]:
  rig.animation_data_create();rig.animation_data.action=bpy.data.actions.new(name);act=rig.animation_data.action
  for f in range(1,duration+1):
   t=(f-1)/(duration-1);phase=t*2*math.pi
   for p in rig.pose.bones:p.rotation_euler=(0,0,0);p.location=(0,0,0)
   if name=='idle_breath':
    rig.pose.bones['chest'].rotation_euler.x=.012*math.sin(phase);rig.pose.bones['spine'].rotation_euler.y=.009*math.sin(phase);rig.pose.bones['head'].rotation_euler.z=.025*math.sin(phase)
   elif name=='walk_in_place':
    for side,offset in [('L',0),('R',math.pi)]:
     q=phase+offset;rig.pose.bones['thigh.'+side].rotation_euler.x=.35*math.sin(q);rig.pose.bones['shin.'+side].rotation_euler.x=-.48*max(0,-math.sin(q));rig.pose.bones['foot.'+side].rotation_euler.x=.12*math.sin(q)
     rig.pose.bones['upper_arm.'+side].rotation_euler.x=-.25*math.sin(q);rig.pose.bones['forearm.'+side].rotation_euler.x=-.13+.07*math.sin(q)
    rig.pose.bones['pelvis'].location.y=.012*math.cos(phase*2);rig.pose.bones['chest'].rotation_euler.y=.055*math.sin(phase)
   else:
    lift=math.sin(math.pi*t)**1.3;release=max(0,math.sin(math.pi*(t-.28)/.72)) if t>.28 else 0
    rig.pose.bones['spine'].rotation_euler.y=-.15*lift;rig.pose.bones['chest'].rotation_euler.x=-.10*lift
    rig.pose.bones['upper_arm.R'].rotation_euler.x=-1.10*lift;rig.pose.bones['upper_arm.R'].rotation_euler.z=.10*lift;rig.pose.bones['forearm.R'].rotation_euler.x=-.9*lift+.64*release;rig.pose.bones['hand.R'].rotation_euler.x=-.24*release
    rig.pose.bones['upper_arm.L'].rotation_euler.x=-.65*lift;rig.pose.bones['forearm.L'].rotation_euler.x=-1.0*lift;rig.pose.bones['head'].rotation_euler.x=.07*lift
    for j in range(1,5):
     rig.pose.bones['finger%d.R'%j].rotation_euler.x=.24*lift-.25*release;rig.pose.bones['finger%d_tip.R'%j].rotation_euler.x=.3*lift-.27*release
   for p in rig.pose.bones:p.keyframe_insert('rotation_euler',frame=f);p.keyframe_insert('location',frame=f)
  for fc in act.fcurves:
   for kp in fc.keyframe_points:kp.interpolation='LINEAR'
  track=rig.animation_data.nla_tracks.new();track.name=name;strip=track.strips.new(name,1,act);track.mute=True;clips.append((name,duration,act))
 rig.animation_data.action=None
 for p in rig.pose.bones:p.rotation_euler=(0,0,0);p.location=(0,0,0)
 bpy.context.scene.frame_set(1)
 return clips

def sockets(r):
 ret=[]
 for name,bone,point in [('grip_primary','hand.R',(-.424,-.018,.945)),('cast_origin','hand.R',(-.428,-.088,.944)),('hit_reference','chest',(0,-.12,1.33)),('stow','chest',(0,.15,1.37))]:
  e=bpy.data.objects.new(name,None);bpy.context.collection.objects.link(e);e.empty_display_type='ARROWS';e.empty_display_size=.055;e.location=point;e['socket_semantics']=name;e['calibration']='PROPOSED_CANDIDATE_NEEDS_WEAPON_AND_GAMEPLAY_FIT';world=Matrix.Translation(Vector(point));e.parent=r;e.parent_type='BONE';e.parent_bone=bone;bpy.context.view_layer.update();e.matrix_world=world;ret.append(e)
 return ret

def tris(ob):ob.data.calc_loop_triangles();return len(ob.data.loop_triangles)
def export(path,obs):
 bpy.ops.object.select_all(action='DESELECT')
 for ob in obs:ob.select_set(True)
 bpy.context.view_layer.objects.active=obs[0]
 bpy.ops.export_scene.gltf(filepath=str(path),export_format='GLB',use_selection=True,export_yup=True,export_extras=True,export_apply=False,export_animations=True,export_animation_mode='ACTIONS',export_force_sampling=True,export_frame_range=False,export_skins=True,export_all_influences=False,export_tangents=True)

def render(path,rig,clip=None,frame=1,view='hero'):
 scene=bpy.context.scene;rig.animation_data.action=clip;scene.frame_set(frame)
 bpy.ops.object.camera_add(location={'hero':(2.7,-5,2.15),'front':(0,-5,1.1),'back':(0,5,1.15),'side':(5,0,1.1)}[view]);cam=bpy.context.object;target=Vector((0,0,.94));cam.rotation_euler=(target-cam.location).to_track_quat('-Z','Y').to_euler();cam.data.type='ORTHO';cam.data.ortho_scale=2.05;scene.camera=cam
 scene.render.filepath=str(path);bpy.ops.render.render(write_still=True);bpy.data.objects.remove(cam,do_unlink=True)

def main():
 bpy.context.preferences.filepaths.save_version=0;bpy.ops.object.select_all(action='SELECT');bpy.ops.object.delete(use_global=False)
 textures=atlas();create_geometry();r=rig()
 bpy.ops.object.select_all(action='DESELECT')
 for o in PARTS:o.select_set(True)
 bpy.context.view_layer.objects.active=PARTS[0];bpy.ops.object.join();body=bpy.context.object;body.name='Kiln_ninja_weighted_lowpoly'
 tri_mod=body.modifiers.new('Deterministic portable triangles','TRIANGULATE');bpy.ops.object.modifier_apply(modifier=tri_mod.name);body.data.validate(clean_customdata=True)
 mod=body.modifiers.new('Humanoid weighted deformation','ARMATURE');mod.object=r
 for poly in body.data.polygons:poly.use_smooth=False
 clips=animation(r);sock=sockets(r);obs=[r,body]+sock
 # Bone and vertex evidence; multiple nonzero influences exist at actual elbows/knees/spine.
 weights=[[(body.vertex_groups[g.group].name,g.weight) for g in v.groups if g.weight>1e-5] for v in body.data.vertices]
 evidence={'vertices':len(weights),'multiInfluenceVertices':sum(len(w)>1 for w in weights),'unweightedVertices':sum(not w for w in weights),'maximumWeightSumError':max(abs(sum(x[1] for x in w)-1) for w in weights),'boneCount':len(r.data.bones),'boneNames':list(BONES),'socketNames':[o.name for o in sock]}
 pose_checks=[]
 base=np.array([tuple(v.co) for v in body.data.vertices])
 for name,dur,act in clips:
  r.animation_data.action=act;bpy.context.scene.frame_set(dur//2)
  ev=body.evaluated_get(bpy.context.evaluated_depsgraph_get());me=ev.to_mesh();moved=np.array([tuple(v.co) for v in me.vertices]);ev.to_mesh_clear()
  delta=np.linalg.norm(moved-base,axis=1);pose_checks.append({'clip':name,'frame':dur//2,'finiteVertices':bool(np.isfinite(moved).all()),'movedVertexCount':int((delta>1e-5).sum()),'maximumDisplacementMeters':float(delta.max())})
 r.animation_data.action=None
 for p in r.pose.bones:p.rotation_euler=(0,0,0);p.location=(0,0,0)
 bpy.context.scene.frame_set(1);bpy.context.view_layer.update();evidence['evaluatedPoseChecks']=pose_checks
 if evidence['unweightedVertices'] or evidence['maximumWeightSumError']>1e-5 or not all(p['finiteVertices'] and p['movedVertexCount']>0 for p in pose_checks):raise RuntimeError('Weighted pose integrity failed')
 triangle={'glb':tris(body)};dims=[round(float(n),6) for n in body.dimensions]
 export(D/(ID+'.glb'),obs)
 for level,ratio in [(1,.61),(2,.34)]:
  low=body.copy();low.data=body.data.copy();bpy.context.collection.objects.link(low);low.name='Kiln_ninja_LOD'+str(level)
  for m in list(low.modifiers):low.modifiers.remove(m)
  bpy.context.view_layer.objects.active=low;low.select_set(True);m=low.modifiers.new('Silhouette reduction','DECIMATE');m.ratio=ratio;m.use_collapse_triangulate=True;bpy.ops.object.modifier_apply(modifier=m.name);low.data.validate(clean_customdata=True)
  m=low.modifiers.new('Humanoid weighted deformation','ARMATURE');m.object=r
  triangle['lod'+str(level)]=tris(low);export(D/(ID+'-lod%d.glb'%level),[r,low]+sock);bpy.data.objects.remove(low,do_unlink=True)
 # Authored coarse body navigation hull; no fabricated skeletal hitbox certification.
 collision=rings('UCX_KilnNinja_navigation',[(0,0,.035,.10,.09),(0,0,.18,.19,.13),(0,0,1.5,.23,.14),(0,0,1.81,.075,.075)],'cloth',{},10);collision.data.materials.clear();collision['collision_role']='Candidate coarse navigation capsule-like hull; not animated combat hitboxes';triangle['collision']=tris(collision);export(D/(ID+'-collision.glb'),[collision]);bpy.data.objects.remove(collision,do_unlink=True)
 # Packed editable source saved in rest pose, with material maps, all clips, weights and sockets.
 for im in bpy.data.images:
  if im.source=='FILE':im.pack()
 r.animation_data.action=None
 for p in r.pose.bones:p.rotation_euler=(0,0,0);p.location=(0,0,0)
 bpy.context.scene.frame_set(1);bpy.ops.wm.save_as_mainfile(filepath=str(D/(ID+'.blend')),compress=False)
 scene=bpy.context.scene;scene.render.engine='CYCLES';scene.cycles.device='CPU';scene.cycles.samples=24;scene.cycles.use_denoising=False;scene.render.resolution_x=600;scene.render.resolution_y=720;scene.render.resolution_percentage=100;scene.render.image_settings.file_format='PNG';scene.world.color=(.14,.14,.14);scene.view_settings.view_transform='AgX';scene.render.film_transparent=False;scene.render.fps=24
 bpy.ops.mesh.primitive_plane_add(size=10,location=(0,0,.012));floor=bpy.context.object;floor.name='Render stage only';fm=bpy.data.materials.new('Review floor');fm.diffuse_color=(.10,.11,.12,1);floor.data.materials.append(fm)
 for loc,power,size in [((2,-3,4),380,3),((-2,-1,2.5),240,2),((0,2,3),420,2)]:
  bpy.ops.object.light_add(type='AREA',location=loc);light=bpy.context.object;light.data.energy=power;light.data.size=size;light.rotation_euler=(Vector((0,0,1))-light.location).to_track_quat('-Z','Y').to_euler()
 renders=[]
 for view in ['front','back','side','hero']:
  path=D/(ID+'-'+view+'.png');render(path,r,view=view);renders.append(str(path.relative_to(ROOT)))
 for name,dur,act in clips:
  for f in ([1,9,17,25] if name=='walk_in_place' else [1,13,25,37]):
   path=D/(ID+'-'+name+'-%02d.png'%f);render(path,r,act,f);renders.append(str(path.relative_to(ROOT)))
 # Contact sheet combines rest views and real rendered poses; no claimed visual pass.
 sheet=np.ones((1440,1200,4),dtype=np.float32)
 for i,path in enumerate(renders):
  im=bpy.data.images.load(str(ROOT/path),check_existing=False);im.scale(300,360);pixels=np.array(im.pixels[:],dtype=np.float32).reshape(360,300,4);row=3-i//4;col=i%4;sheet[row*360:(row+1)*360,col*300:(col+1)*300]=pixels
 im=bpy.data.images.new('Character pose contact sheet',width=1200,height=1440,alpha=True);im.pixels.foreach_set(sheet.ravel());im.filepath_raw=str(D/'pose-contact-sheet.png');im.file_format='PNG';im.save();renders.append(str((D/'pose-contact-sheet.png').relative_to(ROOT)))
 rel=lambda suffix:str((D/(ID+suffix)).relative_to(ROOT))
 asset={'id':ID,'archetypeId':'kiln-ninja','name':'Kiln oath ninja — rigged ensemble candidate','type':'character','status':'PRODUCTION_CANDIDATE_UNREVIEWED','files':{'blend':rel('.blend'),'glb':rel('.glb'),'lod1':rel('-lod1.glb'),'lod2':rel('-lod2.glb'),'collision':rel('-collision.glb'),'textures':textures,'renders':renders},'triangles':triangle,'dimensionsMeters':dims,'dimensionsCoordinateSystem':'BLENDER_Z_UP','rig':{'applicability':'HUMANOID_WEIGHTED_DEFORMATION','present':True,'bones':len(r.data.bones),'evidence':evidence,'facialRig':False},'animations':[{'name':name,'frames':dur,'fps':24,'rootMotion':'IN_PLACE','status':'AUTHORED_POSE_RENDER_REVIEW_REQUIRED'} for name,dur,a in clips],'remainingGates':['Exact art approval and face likeness refinement against references090/060','Facial expressions and speech rig absent; full ensemble/customization not delivered','Cape is chest-weighted; cloth deformation/collision refinement required','Hand grasp fit and socket calibration against actual equipped weapons','Animation foot-contact/grounding and interruption gameplay tests','Authored-character retargeting of source castable timing; no source animation replaced','Godot Unreal and Three.js real import/render/runtime tests','Collision navigation/hitbox and LOD transition gameplay validation','Measured device performance and accessibility review']}
 (OUT/'manifest.json').write_text(json.dumps({'schemaVersion':1,'familyId':'asset-o01-a-characters-family','referenceIds':['reference-090','reference-060'],'status':'PARTIAL_PRODUCTION_CANDIDATES_UNREVIEWED','assets':[asset]},indent=2)+'\n')
 (D/'rig-evidence.json').write_text(json.dumps(evidence,indent=2)+'\n')
 print('KILN_NINJA_COMPLETE',triangle,evidence)
def verify_outputs():
 """Fresh Blender source-open and actual portable imports; no engine parity claim."""
 report={'scope':'Blender 4.3.2 CPU source open and actual GLB import / evaluated animation checks; not Unreal/Godot/Three.js validation','files':[]}
 for suffix in ['.blend','.glb','-lod1.glb','-lod2.glb','-collision.glb']:
  path=D/(ID+suffix)
  bpy.ops.wm.read_factory_settings(use_empty=True)
  if suffix=='.blend':bpy.ops.wm.open_mainfile(filepath=str(path))
  else:bpy.ops.import_scene.gltf(filepath=str(path))
  rigs=[o for o in bpy.context.scene.objects if o.type=='ARMATURE'];meshes=[o for o in bpy.context.scene.objects if o.type=='MESH']
  row={'path':str(path.relative_to(ROOT)),'sha256':hashlib.sha256(path.read_bytes()).hexdigest(),'meshObjects':len(meshes),'armatures':len(rigs),'boneCounts':[len(r.data.bones) for r in rigs],'actionNames':[a.name for a in bpy.data.actions],'images':len([i for i in bpy.data.images if i.type=='IMAGE']),'finitePoses':[]}
  assert meshes
  if suffix!='-collision.glb':
   assert len(rigs)==1 and len(rigs[0].data.bones)==38
   assert row['images']>=3
   for name in ['idle_breath','walk_in_place','cast_release']:
    actions=[a for a in bpy.data.actions if name in a.name];assert actions
    r=rigs[0];r.animation_data_create();r.animation_data.action=actions[0];bpy.context.scene.frame_set(12)
    dg=bpy.context.evaluated_depsgraph_get();finite=True;count=0
    for ob in meshes:
     ev=ob.evaluated_get(dg);me=ev.to_mesh();finite=finite and all(math.isfinite(c) for v in me.vertices for c in v.co);count+=len(me.vertices);ev.to_mesh_clear()
    assert finite;row['finitePoses'].append({'clip':name,'frame':12,'vertices':count,'finite':finite})
   r.animation_data.action=None
   for b in r.pose.bones:b.rotation_euler=(0,0,0);b.rotation_quaternion=(1,0,0,0);b.location=(0,0,0)
   bpy.context.scene.frame_set(1);bpy.context.view_layer.update()
   row['socketWorldPositions']={name:list(bpy.context.scene.objects[name].matrix_world.translation) for name in ['grip_primary','cast_origin','hit_reference','stow']}
   assert all(Vector(x).length>.5 for x in row['socketWorldPositions'].values())
  else:assert not rigs
  report['files'].append(row)
 (D/'blender-import-evidence.json').write_text(json.dumps(report,indent=2)+'\n')
 print('KILN_NINJA_IMPORT_VERIFIED',len(report['files']))

if __name__=='__main__':
 if '--verify' in sys.argv:verify_outputs()
 else:main()
