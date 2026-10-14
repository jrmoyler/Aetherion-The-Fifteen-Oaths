"""Storm Relay reference-057: jointed chain relay whip and fork conductor staff.
Blender4.3.2 CPU. Independent geometry, chain rig, original PBR maps.
"""
import bpy,math,json,sys
import numpy as np
from pathlib import Path
from mathutils import Vector
sys.path.insert(0,str(Path(__file__).parent));import kiln_weapons as K

def configure(oath):
 K.OUT=K.ROOT/f'assets/production/oath-{oath:02d}/weapons';K.OUT.mkdir(parents=True,exist_ok=True);K.TEX=K.OUT/'textures';K.TEX.mkdir(exist_ok=True);K.texture_paths.clear();K.M.clear();bpy.context.preferences.filepaths.save_version=0

def material_pack(palette,seed):
 rng=np.random.default_rng(seed);n=512;y,x=np.mgrid[:n,:n];noise=rng.random((n,n))
 for name,col,metal,rough in palette:
  a=np.ones((n,n,4));a[:,:,:3]=np.array(col)[None,None,:]*(.82+noise[:,:,None]*.3)
  scratches=(np.abs(np.sin(x*.051+y*.23+np.sin(y*.008)*5))>.998)&(noise>.25)
  if name in ['copper','brass','steel','iron']:a[scratches,:3]*=1.5
  if name in ['cloth','leather','rubber']:a[((x+y//2)%17)<2,:3]*=.55
  if name in ['ivory']:a[(np.abs(np.sin(x*.023+y*.043+np.sin(y*.021)))>.999),:3]*=.72
  bc=K.image_file(name+'_basecolor',a);a=np.ones((n,n,4));a[:,:,0]=1;a[:,:,1]=rough+(noise-.5)*.1;a[:,:,2]=metal;orm=K.image_file(name+'_orm',a)
  a=np.ones((n,n,4));a[:,:,0]=.5+(noise-.5)*.08;a[:,:,1]=.5+(np.roll(noise,1,0)-.5)*.08;a[:,:,2]=1;nm=K.image_file(name+'_normal',a)
  mat=bpy.data.materials.new(name);mat.use_nodes=True;ns=mat.node_tree.nodes;ln=mat.node_tree.links;bs=ns.get('Principled BSDF')
  t=ns.new('ShaderNodeTexImage');t.image=bc;ln.new(t.outputs['Color'],bs.inputs['Base Color']);t=ns.new('ShaderNodeTexImage');t.image=orm;s=ns.new('ShaderNodeSeparateColor');ln.new(t.outputs[0],s.inputs[0]);ln.new(s.outputs['Green'],bs.inputs['Roughness']);ln.new(s.outputs['Blue'],bs.inputs['Metallic']);t=ns.new('ShaderNodeTexImage');t.image=nm;m=ns.new('ShaderNodeNormalMap');m.inputs['Strength'].default_value=.3;ln.new(t.outputs[0],m.inputs['Color']);ln.new(m.outputs[0],bs.inputs['Normal']);K.M[name]=mat

def collision(kind,state):
 coords=[o.matrix_world@v.co for o in bpy.context.scene.objects if o.type=='MESH' for v in o.data.vertices];mn=Vector(tuple(min(v[k] for v in coords) for k in range(3)));mx=Vector(tuple(max(v[k] for v in coords) for k in range(3)));return K.cube('UCX_'+kind,(mn+mx)/2,mx-mn,next(iter(K.M)),0)
def sheet(assets,name):
 cols=min(len(assets),3);rows=math.ceil(len(assets)/cols);canvas=np.ones((rows*400,cols*400,4),dtype=np.float32);canvas[:,:,:3]=.047
 for i,a in enumerate(assets):
  im=bpy.data.images.load(str(K.ROOT/a['files']['renders'][0]),check_existing=False);im.scale(400,400);pix=np.array(im.pixels[:]).reshape(400,400,4);r=rows-1-i//cols;c=i%cols;canvas[r*400:(r+1)*400,c*400:(c+1)*400]=pix
 im=bpy.data.images.new(name,width=cols*400,height=rows*400,alpha=True);im.pixels.foreach_set(canvas.ravel());im.filepath_raw=str(K.OUT/'contact-sheet.png');im.file_format='PNG';im.save()
def save_manifest(assets,family,ref):
 (K.OUT/'manifest.json').write_text(json.dumps(dict(schemaVersion=1,familyId=family,referenceIds=[ref],status='PARTIAL_PRODUCTION_CANDIDATES_UNREVIEWED',coordinateContract='Blender meters +Y forward +Z up; GLB Y-up; grip origin proposed',assets=assets),indent=2)+'\n');sheet(assets,family)
def bind_rigid_chain(objects,points,name='chain_settle'):
 ar=bpy.data.armatures.new('Articulated relay link skeleton');rig=bpy.data.objects.new('Relay link rig',ar);bpy.context.collection.objects.link(rig);bpy.context.view_layer.objects.active=rig;bpy.ops.object.select_all(action='DESELECT');rig.select_set(True);bpy.ops.object.mode_set(mode='EDIT');prev=None
 for i,p in enumerate(points):
  b=ar.edit_bones.new('link_'+str(i));b.head=p;b.tail=Vector(p)+Vector((0,.03,0))
  if prev:b.parent=prev
  prev=b
 bpy.ops.object.mode_set(mode='OBJECT')
 for i,o in enumerate(objects):
  g=o.vertex_groups.new(name='link_'+str(i));g.add(list(range(len(o.data.vertices))),1,'REPLACE');m=o.modifiers.new('Rigid link bone weights','ARMATURE');m.object=rig;o.parent=rig
 for i,b in enumerate(rig.pose.bones):
  b.rotation_mode='XYZ'
  for f,v in [(1,0),(10,.016),(22,-.007),(36,.003),(48,0)]:b.rotation_euler.z=v*(1+.4*math.sin(i));b.keyframe_insert(data_path='rotation_euler',frame=f)
 rig.animation_data.action.name=name;bpy.context.scene.frame_end=48;bpy.context.scene.frame_set(1);return rig

def handle(y0,y1,r=.022):
 K.cyl('Dark woven shaft grip',(0,(y0+y1)/2,0),r,y1-y0,'cloth',16)
 for i in range(int((y1-y0)/.035)):
  y=y0+i*.035;vs=[]
  for j in range(17):
   a=j*math.pi*2/16
   for off in [-.003,.003]:vs.append(((r+.002)*math.cos(a),y+.021*a/(2*math.pi)+off,(r+.002)*math.sin(a)))
  K.mesh('Spiral grip wrap',vs,[(j*2,j*2+1,j*2+3,j*2+2) for j in range(16)],'cloth')
def orb(name,loc,r,mat):
 bpy.ops.mesh.primitive_uv_sphere_add(segments=16,ring_count=8,radius=r,location=loc);return K.finish(bpy.context.object,name,mat)
def fork(y,width,length):
 for sign in [-1,1]:
  pts=[(sign*.035,y),(sign*width,y+.055),(sign*(width+.015),y+length*.42),(sign*width*.64,y+length),(sign*(width-.015),y+length*.42),(sign*(width-.025),y+.080)]
  K.flat_profile('Copper fork tine shell',pts,.036,'copper')
  pts=[(sign*.048,y+.015),(sign*(width-.011),y+.073),(sign*(width+.003),y+length*.43),(sign*width*.64,y+length*.92),(sign*(width-.024),y+length*.43)];K.flat_profile('Dark fork tine inset',pts,.040,'cloth')
def chain(state):
 handle(-.35,.22,.019)
 for y in [-.35,-.20,.02,.20]:K.ring('Copper shaft collar',y,.030,.021,'copper',.018,14)
 # Relay chamber cage: cream insulating sleeve and copper contact stacks.
 K.cyl('Ivory relay dielectric',(0,.30,0),.043,.125,'ivory',16)
 for y in [.235,.366]:K.ring('Relay chamber copper rim',y,.055,.025,'copper',.035,16)
 for i in range(6):
  a=i*math.pi/3;K.cyl('Relay contact pin',(.041*math.cos(a),.30,.041*math.sin(a)),.006,.11,'copper',8)
 fork(.385,.071,.25);orb('Fork junction pearl',(0,.40,0),.024,'ivory')
 # Visible contiguous chain, alternating link planes. Stowed version forms a coil.
 count=26;pts=[]
 for i in range(count):
  t=i/(count-1)
  if state=='stowed':p=Vector((.105*math.sin(t*math.pi*3.1),-.30+t*.50,.08*math.cos(t*math.pi*3.1)))
  else:p=Vector((.055+.25*math.sin(t*math.pi),-.365+t*.89,-.02))
  pts.append(p)
 obs=[]
 for i,p in enumerate(pts):
  tangent=(pts[min(i+1,count-1)]-pts[max(0,i-1)]).normalized();axis=Vector((0,0,1)) if i%2 else Vector((tangent.y,-tangent.x,0)).normalized();vs=[];fs=[];n=12;m=6
  for j in range(n):
   a=j*math.pi*2/n;center=p+tangent*(.026*math.cos(a))+axis*(.014*math.sin(a));normal=(tangent*math.cos(a)+axis*math.sin(a)).normalized();binormal=tangent.cross(axis).normalized()
   for k in range(m):b=k*math.pi*2/m;v=center+.0042*(normal*math.cos(b)+binormal*math.sin(b));vs.append(tuple(v))
  for j in range(n):
   for k in range(m):fs.append((j*m+k,j*m+(k+1)%m,((j+1)%n)*m+(k+1)%m,((j+1)%n)*m+k))
  obs.append(K.mesh('Alternating relay chain link '+str(i),vs,fs,'copper' if i%3==0 else 'cloth'))
 eye=K.ring('Fixed chain pommel eye',0,.031,.009,'copper',.023,16);eye.rotation_euler.x=math.pi/2;eye.location=(.025,-.365,-.01)
 bind_rigid_chain(obs,pts)
 K.socket('grip_primary',(0,0,0));K.socket('relay_tip',(0,.635,0))
def staff(state):
 handle(-.68,.68,.021)
 for y in [-.70,-.43,-.06,.30,.65]:
  K.ring('Copper staff segmented ferrule',y,.029,.035,'copper',.019,16)
  for z in [-.033,.033]:K.bolt('Staff collar rivet',0,y,z)
 orb('Ivory conductor pearl',(0,.76,0),.067,'ivory');K.ring('Orb equatorial copper cradle',.76,.074,.018,'copper',.063,20)
 fork(.785,.155,.23)
 # Swept lower seat under conductor orb.
 for s in [-1,1]:K.flat_profile('Conductor cradle horn',[(s*.01,.65),(s*.069,.70),(s*.077,.77),(s*.056,.71)],.02,'copper')
 K.cyl('Staff flared pommel',(0,-.74,0),.038,.045,'copper')
 if state=='stowed':
  for y in [-.26,.30]:K.cube('Back carry clasp',(0,y,-.046),(.08,.07,.022),'copper',.005)
 K.socket('grip_primary',(0,0,0));K.socket('conductor',(0,.76,0))

if __name__=='__main__':
 configure(3);material_pack([('copper',(.52,.30,.105),.88,.40),('ivory',(.78,.73,.61),0,.3),('cloth',(.035,.065,.105),0,.79)],57);K.M['brass']=K.M['copper'];K.M['iron']=K.M['copper'];assets=[]
 for kind,fn in [('relay-whip',chain),('conductor-staff',staff)]:
  for state in ['ready','stowed']:
   a=K.build(kind,state,'storm',collision,fn,(0,0,0));a['referenceIds']=['reference-057'];a['remainingGates']=['Art approval and fine inlay/engraving matching','Hanging fabric tassels not authored','Whip glass relay chamber and internal electrical arcs not yet matched','Damaged state absent','Chain dynamics/collision requires gameplay solver; settle clip cosmetic only','Character hand/docking fit','Actual engine imports, LOD transitions and performance','Lightning VFX/audio and cast integration']
   if kind=='relay-whip':a['rig']={'applicability':'ARTICULATED_CHAIN','status':'AUTHORED_UNVERIFIED','boneCount':26};a['animations']=[{'name':'chain_settle','durationSeconds':47/24}]
   else:a['rig']={'applicability':'STATIC_RIGID_BODY','status':'NOT_APPLICABLE'};a['animations']=[]
   assets.append(a)
 save_manifest(assets,'asset-o03-e-weapons-family','reference-057');print('STORM_COMPLETE',len(assets))
