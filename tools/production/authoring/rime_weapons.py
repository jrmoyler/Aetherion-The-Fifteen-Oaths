"""Rime Archive weapon candidate authoring, reference-059 inspected.
Blender 4.3.2 background. Unique faceted saber and three-prong repeater geometry.
Uses shared UV/export/render functions from kiln_weapons; not Kiln mesh templates.
"""
import bpy,math,json,sys
import numpy as np
from pathlib import Path
from mathutils import Vector
sys.path.insert(0,str(Path(__file__).parent));import kiln_weapons as K
K.OUT=K.ROOT/'assets/production/oath-02/weapons';K.OUT.mkdir(parents=True,exist_ok=True);K.TEX=K.OUT/'textures';K.TEX.mkdir(exist_ok=True)
bpy.context.preferences.filepaths.save_version=0

def materials():
 rng=np.random.default_rng(59);n=512;y,x=np.mgrid[:n,:n];noise=rng.random((n,n))
 vein=np.zeros((n,n),bool)
 for i in range(13):
  m=rng.uniform(-1.4,1.4);b=rng.uniform(-300,700);line=np.abs(y-m*x-b+3*np.sin(x*.047+i))<rng.uniform(.6,1.7);vein|=line
 for name,col,metal,rough in [('ice',(.22,.53,.71),.08,.22),('silver',(.34,.38,.40),.88,.44),('cloth',(.055,.075,.11),0,.82),('brass',(.34,.26,.16),.8,.43)]:
  a=np.ones((n,n,4));a[:,:,:3]=np.array(col)[None,None,:]*(.85+noise[:,:,None]*.25)
  if name=='ice':a[vein,:3]=(.79,.94,.98)
  if name=='cloth':a[(np.mod(x+y,15)<2),:3]*=.6
  bc=K.image_file(name+'_basecolor',a);a=np.ones((n,n,4));a[:,:,0]=1;a[:,:,1]=rough+(noise-.5)*.09;a[:,:,2]=metal;orm=K.image_file(name+'_orm',a)
  a=np.ones((n,n,4));a[:,:,0]=.5+(noise-.5)*.06;a[:,:,1]=.5+(np.roll(noise,1,0)-.5)*.06;a[:,:,2]=1;nm=K.image_file(name+'_normal',a)
  mat=bpy.data.materials.new('rime_'+name);mat.use_nodes=True;ns=mat.node_tree.nodes;ln=mat.node_tree.links;bs=ns.get('Principled BSDF')
  t=ns.new('ShaderNodeTexImage');t.image=bc;ln.new(t.outputs['Color'],bs.inputs['Base Color']);t=ns.new('ShaderNodeTexImage');t.image=orm;s=ns.new('ShaderNodeSeparateColor');ln.new(t.outputs[0],s.inputs[0]);ln.new(s.outputs['Green'],bs.inputs['Roughness']);ln.new(s.outputs['Blue'],bs.inputs['Metallic']);t=ns.new('ShaderNodeTexImage');t.image=nm;m=ns.new('ShaderNodeNormalMap');ln.new(t.outputs[0],m.inputs['Color']);ln.new(m.outputs[0],bs.inputs['Normal'])
  if name=='ice':bs.inputs['Transmission Weight'].default_value=.55;bs.inputs['IOR'].default_value=1.31
  K.M[name]=mat
 # Shared collision helpers require iron alias; no kiln material used.
 K.M['iron']=K.M['silver']

def crystal(name,center,width,length,depth,damage=False):
 x,y,z=center;w=width/2;d=depth/2;l=length
 vs=[(x,y,z),(x-w,y+l*.12,z),(x,y+l*.12,z+d),(x+w,y+l*.12,z),(x,y+l*.12,z-d),(x-w*.78,y+l*.83,z),(x,y+l*.83,z+d*.8),(x+w*.78,y+l*.83,z),(x,y+l*.83,z-d*.8),(x+(w*.4 if damage else 0),y+l*(.92 if damage else 1),z)]
 fs=[(0,2,1),(0,3,2),(0,4,3),(0,1,4),(1,2,6,5),(2,3,7,6),(3,4,8,7),(4,1,5,8),(5,6,9),(6,7,9),(7,8,9),(8,5,9)]
 return K.mesh(name,vs,fs,'ice')
def winding(y0,y1,r):
 K.cyl('Slate wrapped grip',(0,(y0+y1)/2,0),r,y1-y0,'cloth')
 for i in range(12):
  yy=y0+(y1-y0)*i/12;vs=[]
  for j in range(17):
   a=j*2*math.pi/16
   for off in [-.004,.004]:vs.append(((r+.002)*math.cos(a),yy+.02*a/(2*math.pi)+off,(r+.002)*math.sin(a)))
  K.mesh('Diagonal wrap seam',vs,[(j*2,j*2+1,j*2+3,j*2+2) for j in range(16)],'cloth')
def tassel():
 # Four rigidly weighted, smoothly blended cloth sections with four-bone settle clip.
 vs=[];fs=[];n=8;rows=5;yy=-.232
 for row in range(rows):
  z=-.025-row*.048;r=.008+row*.006
  for j in range(n):
   a=j*math.pi*2/n;rr=r*(.73 if j%2 else 1);vs.append((rr*math.cos(a),yy+rr*math.sin(a),z))
 for row in range(rows-1):
  for j in range(n):q=row*n+j;fs.append((q,row*n+(j+1)%n,(row+1)*n+(j+1)%n,q+n))
 ob=K.mesh('Pleated hanging slate tassel',vs,fs,'cloth')
 ar=bpy.data.armatures.new('Rime tassel skeleton');rig=bpy.data.objects.new('Rime tassel rig',ar);bpy.context.collection.objects.link(rig);bpy.context.view_layer.objects.active=rig;rig.select_set(True);bpy.ops.object.mode_set(mode='EDIT')
 previous=None
 for i in range(4):
  b=ar.edit_bones.new('tassel_'+str(i));b.head=(0,yy,-.025-i*.048);b.tail=(0,yy,-.025-(i+1)*.048)
  if previous:b.parent=previous;b.use_connect=True
  previous=b
 bpy.ops.object.mode_set(mode='OBJECT')
 for i in range(4):ob.vertex_groups.new(name='tassel_'+str(i))
 for row in range(rows):
  for j in range(n):ob.vertex_groups[min(row,3)].add([row*n+j],1,'REPLACE')
 mod=ob.modifiers.new('Weighted cloth settle','ARMATURE');mod.object=rig;ob.parent=rig
 for i,p in enumerate(rig.pose.bones):
  p.rotation_mode='XYZ'
  for frame,angle in [(1,0),(10,.13),(22,-.055),(36,.022),(48,0)]:p.rotation_euler[1]=angle*(1+i*.25);p.keyframe_insert(data_path='rotation_euler',frame=frame)
 rig.animation_data.action.name='tassel_settle';bpy.context.scene.frame_end=48;bpy.context.scene.frame_set(1)

def saber(state):
 crystal('Long tapered ice saber',(0,.16,0),.069,1.02,.030,state=='damaged');winding(-.16,.10,.027)
 for y in [-.18,.12]:K.ring('Silver grip collar',y,.039,.024,'silver',.023,12)
 # angular four-point guard with inlaid faceted crystal centre
 for sign in [-1,1]:
  pts=[(0,.12),(sign*.065,.14),(sign*.108,.10),(sign*.073,.22),(sign*.038,.255),(0,.21)]
  K.flat_profile('Swept silver guard quillon',pts,.055,'silver')
  pts=[(sign*.013,.16),(sign*.055,.17),(sign*.075,.14),(sign*.052,.205)];K.flat_profile('Guard slate inset',pts,.059,'cloth')
 crystal('Guard centre ice jewel',(0,.095,.032),.047,.16,.030)
 crystal('Pommel ice lozenge',(0,-.26,0),.054,.075,.038)
 K.ring('Pommel brass collar',-.204,.031,.018,'brass',.021,12);tassel()
 if state=='stowed':
  K.flat_profile('Silver-lined fitted sheath',[(-.05,.20),(.05,.20),(.041,1.10),(0,1.20),(-.041,1.10)],.066,'silver')
  K.flat_profile('Slate sheath facing',[(-.038,.24),(.038,.24),(.027,1.08),(0,1.16),(-.027,1.08)],.069,'cloth')
  for y in [.29,.75]:K.cube('Docking strap',(0,y,-.045),(.13,.04,.025),'brass')
 K.socket('grip_primary',(0,0,0));K.socket('blade_tip',(0,1.18,0))

def repeater(state):
 # Three ice cartridge blades arranged in a triangular muzzle cluster.
 for x,z,l in [(0,.046,.47),(-.071,-.030,.39),(.071,-.030,.39)]:crystal('Independent ice cartridge',(x,.19,z),.077,l,.060,state=='damaged' and x<0)
 crystal('Rear dorsal ice conduit',(0,-.12,.023),.052,.43,.028)
 # Open, sculpted receiver silhouette, with inset slate negative shape.
 pts=[(-.043,-.20),(.044,-.20),(.069,.03),(.118,.18),(.082,.34),(.06,.25),(-.060,.25),(-.085,.34),(-.105,.16),(-.057,.015)]
 # Extruded perimeter frame with a genuine open receiver window.
 n=len(pts);inner=[(x*.68,.075+(y-.075)*.79) for x,y in pts];vs=[]
 for z,loop in [(-.026,pts),(.026,pts),(-.026,inner),(.026,inner)]:vs.extend([(x,y,z) for x,y in loop])
 fs=[]
 for i in range(n):
  j=(i+1)%n;fs.extend([(i,j,n+j,n+i),(2*n+i,3*n+i,3*n+j,2*n+j),(i,2*n+i,2*n+j,j),(n+i,n+j,3*n+j,3*n+i)])
 K.mesh('Sculpted open silver receiver',vs,fs,'silver')
 for x in [-.037,.037]:K.cube('Slate receiver spine',(x,.025,0),(.018,.30,.035),'cloth',.004)
 for y in [.24,.49]:
  K.cube('Cartridge clamp bridge',(0,y,0),(.233,.038,.036),'silver',.005)
  for x in [-.104,.104]:K.cube('Locking cartridge side bracket',(x,y,.005),(.027,.05,.148),'brass',.004)
  for x in [-.065,0,.065]:K.bolt('Cartridge lock rivet',x,y,.079)
 # Dorsal blade fins and side receiver rails.
 for x in [-.054,.054]:
  ob=K.flat_profile('Swept receiver fin',[(x,-.10),(x*1.2,.14),(x*1.6,.28),(x*1.2,.10)],.125,'silver')
 # Trigger guard is a real open loop, mounted beneath receiver.
 loop=K.ring('Open trigger guard',.01,.047,.014,'silver',.037,16);loop.rotation_euler[0]=math.pi/2;loop.location=(0,-.005,-.073)
 K.cube('Trigger tongue',(0,.03,-.067),(.011,.010,.038),'brass',.003)
 grip=K.cube('Angled slate pistol grip',(0,-.090,-.138),(.064,.125,.064),'cloth',.010);grip.rotation_euler[0]=-.42
 for j in range(5):K.cube('Grip wrap ridge',(0,-.13+j*.019,-.176),(.066,.008,.007),'cloth',.002)
 K.cube('Silver flared grip heel',(0,-.15,-.174),(.087,.031,.04),'silver',.006)
 if state=='stowed':
  K.cube('Hip docking socket',(0,-.045,-.20),(.115,.17,.034),'silver',.006)
  K.cube('Slate mount cushion',(0,-.045,-.223),(.10,.15,.016),'cloth',.005)
 K.socket('grip_primary',(0,-.065,-.137));K.socket('muzzle',(0,.66,0))

def collision(kind,state):
 coords=[o.matrix_world@v.co for o in bpy.context.scene.objects if o.type=='MESH' for v in o.data.vertices];mn=Vector(tuple(min(v[k] for v in coords) for k in range(3)));mx=Vector(tuple(max(v[k] for v in coords) for k in range(3)))
 return K.cube('UCX_rime_'+kind,(mn+mx)/2,mx-mn,'silver',0)
materials();K.sword=saber;K.focus=repeater;assets=[]
for kind in ['sword','focus']:
 for state in ['ready','stowed','damaged']:
  a=K.build(kind,state,prefix='rime',collisionFactory=collision)
  a['referenceIds']=['reference-059'];a['archetypeId']='rime-'+('frost-saber' if kind=='sword' else 'repeater');a['name']=('Frost Saber ' if kind=='sword' else 'Rime Repeater ')+state.title()
  a['remainingGates']=['Reference art review; finer silver engraving and frost edge wear','Character grip and docking calibration','Runtime frost effects, combat animation, audio integration','Actual engine import/runtime checks and measured performance','LOD transition and damaged-state acceptance']
  if kind=='sword':a['rig']={'applicability':'ARTICULATED_TASSEL','status':'AUTHORED_UNVERIFIED','boneCount':4};a['animations']=[{'name':next(o for o in bpy.context.scene.objects if o.type=='ARMATURE').animation_data.action.name,'durationSeconds':47/24,'purpose':'Damped cloth accessory settle, not combat clip'}]
  else:a['rig']={'applicability':'STATIC_RIGID_BODY','status':'NOT_APPLICABLE'};a['animations']=[]
  assets.append(a)
manifest=dict(schemaVersion=1,familyId='asset-o02-e-weapons-family',referenceIds=['reference-059'],status='PARTIAL_PRODUCTION_CANDIDATES_UNREVIEWED',coordinateContract='Blender meters +Y forward +Z up; GLB Y-up; grip socket at origin',assets=assets)
(K.OUT/'manifest.json').write_text(json.dumps(manifest,indent=2)+'\n')
canvas=np.ones((800,1200,4),dtype=np.float32)
for idx,a in enumerate(assets):
 im=bpy.data.images.load(str(K.ROOT/a['files']['renders'][0]),check_existing=False);im.scale(400,400);pix=np.array(im.pixels[:]).reshape(400,400,4);row=1-idx//3;col=idx%3;canvas[row*400:(row+1)*400,col*400:(col+1)*400]=pix
sheet=bpy.data.images.new('Rime weapons contact sheet',width=1200,height=800,alpha=True);sheet.pixels.foreach_set(canvas.ravel());sheet.filepath_raw=str(K.OUT/'contact-sheet.png');sheet.file_format='PNG';sheet.save()
print('RIME_COMPLETE',len(assets))
