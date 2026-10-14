"""Reference-061 Kiln weapon candidates. Blender 4.3.2 --background --python this_file.
Reproducible deterministic geometry and original tileable material maps; no source mutations.
Meters; grip origin; +Y longitudinal forward, +Z sheet-face normal; glTF converts to Y-up.
"""
import bpy, math, json, random, sys
import numpy as np
from pathlib import Path
from mathutils import Vector
ROOT=Path(__file__).resolve().parents[1]
OUT=ROOT/'assets/production/oath-01/weapons'
OUT.mkdir(parents=True,exist_ok=True)
TEX=OUT/'textures'; TEX.mkdir(exist_ok=True)
random.seed(61)
M={}; texture_paths=[]
def image_file(name,a):
 p=TEX/(name+'.png'); im=bpy.data.images.new(name,width=a.shape[1],height=a.shape[0],alpha=True)
 im.colorspace_settings.name='Non-Color'; im.pixels.foreach_set(a.astype(np.float32).ravel()); im.filepath_raw=str(p); im.file_format='PNG'; im.save(); texture_paths.append(str(p.relative_to(ROOT))); bpy.data.images.remove(im); im=bpy.data.images.load(str(p),check_existing=False); im.colorspace_settings.name='sRGB' if name.endswith('basecolor') else 'Non-Color'; return im

def materials():
 rng=np.random.default_rng(61); n=512; yy,xx=np.mgrid[:n,:n]; noise=rng.random((n,n)); coarse=np.sin(xx*.068)*np.sin(yy*.047)
 for name,col,metal,rough in [('ceramic',(0.58,.19,.07),0,.71),('iron',(.105,.099,.091),.88,.59),('leather',(.12,.061,.028),0,.83),('brass',(.40,.24,.083),.82,.42)]:
  wear=((noise>.965)&(coarse>.15)) | ((np.sin(xx*.092+np.sin(yy*.055)*4)>.997)&(noise>.25))
  c=np.ones((n,n,4)); variation=.82+noise*.30+coarse*.08
  for k in range(3):c[:,:,k]=col[k]*variation
  if name=='ceramic':c[wear,:3]=(.13,.10,.077)
  elif name=='leather':
   seam=np.abs(np.sin((xx+yy*.62)*.21))<.08;c[seam,:3]*=.54
  else:c[wear,:3]*=1.5
  bc=image_file(name+'_basecolor',c)
  a=np.ones((n,n,4));a[:,:,0]=1;a[:,:,1]=np.clip(rough+noise*.12-.06,0,1);a[:,:,2]=metal
  orm=image_file(name+'_orm',a);orm.colorspace_settings.name='Non-Color'
  a=np.ones((n,n,4));a[:,:,0]=.5+(noise-.5)*.13;a[:,:,1]=.5+(np.roll(noise,1,axis=0)-.5)*.13;a[:,:,2]=1
  nm=image_file(name+'_normal',a);nm.colorspace_settings.name='Non-Color'
  mat=bpy.data.materials.new(name);mat.use_nodes=True;ns=mat.node_tree.nodes;ln=mat.node_tree.links;bs=ns.get('Principled BSDF');bs.inputs['Metallic'].default_value=metal;bs.inputs['Roughness'].default_value=rough
  t=ns.new('ShaderNodeTexImage');t.image=bc;ln.new(t.outputs['Color'],bs.inputs['Base Color'])
  t=ns.new('ShaderNodeTexImage');t.image=orm;s=ns.new('ShaderNodeSeparateColor');ln.new(t.outputs['Color'],s.inputs[0]);ln.new(s.outputs['Green'],bs.inputs['Roughness']);ln.new(s.outputs['Blue'],bs.inputs['Metallic'])
  t=ns.new('ShaderNodeTexImage');t.image=nm;nn=ns.new('ShaderNodeNormalMap');nn.inputs['Strength'].default_value=.38;ln.new(t.outputs['Color'],nn.inputs['Color']);ln.new(nn.outputs[0],bs.inputs['Normal']);M[name]=mat
 mat=bpy.data.materials.new('banked_ember');mat.use_nodes=True;bs=mat.node_tree.nodes.get('Principled BSDF');bs.inputs['Base Color'].default_value=(.52,.025,.001,1);bs.inputs['Emission Color'].default_value=(1,.055,.001,1);bs.inputs['Emission Strength'].default_value=1.8;M['ember']=mat

def finish(o,name,mat,bevel=0):
 o.name=name;o.data.materials.clear();o.data.materials.append(M[mat]);bpy.context.view_layer.objects.active=o;o.select_set(True)
 bpy.ops.object.transform_apply(location=False,rotation=False,scale=True)
 if bevel:
  m=o.modifiers.new('Edge chamfer','BEVEL');m.width=bevel;m.segments=1;bpy.ops.object.modifier_apply(modifier=m.name)
 return o

def cube(name,loc,scale,mat,bevel=.002):
 bpy.ops.object.select_all(action='DESELECT');bpy.ops.mesh.primitive_cube_add(size=1,location=loc);o=bpy.context.object;o.scale=scale;return finish(o,name,mat,bevel)
def cyl(name,loc,r,depth,mat,verts=16):
 bpy.ops.object.select_all(action='DESELECT');bpy.ops.mesh.primitive_cylinder_add(vertices=verts,radius=r,depth=depth,location=loc,rotation=(math.pi/2,0,0));return finish(bpy.context.object,name,mat,.0015)
def mesh(name,vs,fs,mat):
 me=bpy.data.meshes.new(name);me.from_pydata(vs,[],fs);me.update();ob=bpy.data.objects.new(name,me);bpy.context.collection.objects.link(ob);ob.data.materials.append(M[mat]);return ob

def ring(name,y,r,width,mat,inner=None,n=20):
 ri=inner if inner else r-.013;vs=[]
 for Y,R in [(y-width/2,r),(y+width/2,r),(y-width/2,ri),(y+width/2,ri)]:
  vs.extend([(math.cos(i*2*math.pi/n)*R,Y,math.sin(i*2*math.pi/n)*R) for i in range(n)])
 fs=[]
 for i in range(n):
  j=(i+1)%n
  fs.extend([(i,j,n+j,n+i),(2*n+i,3*n+i,3*n+j,2*n+j),(i,2*n+i,2*n+j,j),(n+i,n+j,3*n+j,3*n+i)])
 return mesh(name,vs,fs,mat)

def sector(name,y0,y1,r,a0,a1,mat,thick=.014,segments=2):
 vs=[]
 for y,R in [(y0,r),(y1,r),(y0,r-thick),(y1,r-thick)]:
  vs.extend([(math.cos(a0+(a1-a0)*i/segments)*R,y,math.sin(a0+(a1-a0)*i/segments)*R) for i in range(segments+1)])
 k=segments+1;fs=[]
 for i in range(segments):fs.extend([(i,i+1,k+i+1,k+i),(2*k+i,3*k+i,3*k+i+1,2*k+i+1),(i,2*k+i,2*k+i+1,i+1),(k+i,k+i+1,3*k+i+1,3*k+i)])
 fs.extend([(0,k,3*k,2*k),(k-1,3*k-1,4*k-1,2*k-1)])
 return mesh(name,vs,fs,mat)

def flat_profile(name,pts,t,mat):
 vs=[(x,y,z) for z in [-t/2,t/2] for x,y in pts];n=len(pts);fs=[tuple(reversed(range(n))),tuple(range(n,2*n))]+[(i,(i+1)%n,(i+1)%n+n,i+n) for i in range(n)];return mesh(name,vs,fs,mat)
def bolt(name,x,y,z):
 bpy.ops.object.select_all(action='DESELECT');bpy.ops.mesh.primitive_cylinder_add(vertices=8,radius=.006,depth=.004,location=(x,y,z));return finish(bpy.context.object,name,'brass')
def socket(name,loc):
 ob=bpy.data.objects.new(name,None);bpy.context.collection.objects.link(ob);ob.location=loc;ob.empty_display_size=.05;ob['purpose']='Proposed attachment socket; hand-fit unverified';return ob

def sword(state):
 damaged=state=='damaged';stowed=state=='stowed'
 pts=[(-.045,.18),(.049,.18),(.052,.40),(.028,.66),(-.012,.88),(-.10,1.075),(-.081,.88),(-.095,.65),(-.085,.39)]
 blade=flat_profile('Forged wedge blade',pts,.025,'iron')
 # Orange shell separated from exposed bevel. Slots are actual open boolean apertures.
 shell=flat_profile('Vented fired ceramic blade jacket',[(-.054,.21),(.041,.21),(.042,.40),(.017,.66),(-.021,.87),(-.080,1.025),(-.069,.86),(-.078,.65),(-.070,.39)],.032,'ceramic')
 bpy.context.view_layer.objects.active=shell;shell.select_set(True)
 for i in range(8):
  y=.285+i*.079;x=-.014- max(0,y-.40)**2*.23
  cut=cube('vent cutter',(x,y,0),(.027,.047,.09),'iron',.010)
  bpy.context.view_layer.objects.active=shell;mod=shell.modifiers.new('Open fired slot','BOOLEAN');mod.object=cut;mod.operation='DIFFERENCE';bpy.ops.object.modifier_apply(modifier=mod.name);bpy.data.objects.remove(cut,do_unlink=True)
 if damaged:
  for x,y in [(.028,.55),(-.066,.78),(.04,.31)]:
   cut=cube('Chip cutter',(x,y,.008),(.045,.039,.09),'iron',0);cut.rotation_euler[2]=.6
   bpy.context.view_layer.objects.active=shell;md=shell.modifiers.new('Broken ceramic edge','BOOLEAN');md.object=cut;md.operation='DIFFERENCE';bpy.ops.object.modifier_apply(modifier=md.name);bpy.data.objects.remove(cut,do_unlink=True)
 for y in [.24,.40,.58,.76,.87]:
  x=-.014-max(0,y-.40)**2*.23
  for z in [-.020,.020]:bolt('Jacket pin',x+.032,y,z)
 cyl('Grip core',(0,0,0),.031,.30,'leather')
 # Diagonal wrap ribbons are individual conforming leather strips, not texture-only.
 for j in range(14):
  y=-.142+j*.020
  vs=[]
  for i in range(17):
   a=i*math.pi*2/16
   for off in [-.0045,.0045]:vs.append((.033*math.cos(a),y+.018*a/(2*math.pi)+off,.033*math.sin(a)))
  mesh('Diagonal leather winding',vs,[(2*i,2*i+1,2*i+3,2*i+2) for i in range(16)],'leather')
 for y in [-.157,.16]:ring('Brass grip ferrule',y,.04,.025,'brass',.028,16)
 cube('Guard iron block',(0,.188,0),(.145,.033,.083),'iron',.008)
 for x in [-.062,.062]:
  cube('Ceramic guard cheek',(x,.19,0),(.025,.045,.077),'ceramic',.004)
  for z in [-.044,.044]:bolt('Guard fastener',x,.19,z)
 cube('Pommel iron cap',(0,-.183,0),(.082,.033,.075),'iron',.008)
 for z in [-.04,.04]:bolt('Pommel fastener',.02,-.183,z)
 # Fixed attachment eye; dangling link chain deliberately omitted pending rig.
 o=ring('Fixed pommel attachment eye',-.215,.017,.008,'brass',.010,12);o.rotation_euler[0]=math.pi/2;o.location=(0,-.215,.0); # ring initially centered y => reset vertices offset below
 for v in o.data.vertices:v.co.y+=.215
 if stowed:
  sheath=flat_profile('Forged fitted scabbard',[(-.065,.225),(.065,.225),(.068,.41),(.041,.67),(.001,.9),(-.10,1.10),(-.106,.91),(-.116,.66),(-.105,.39)],.063,'iron')
  for y in [.26,.51,.78]:
   x=-.016-max(0,y-.4)**2*.23
   for z in [-.036,.036]:
    cube('Ceramic scabbard strap',(x,y,z),(.15 if y<.6 else .125,.035,.009),'ceramic',.003)
    for dx in [-.048,.048]:bolt('Scabbard rivet',x+dx,y,z+(.006 if z>0 else -.006))
  socket('spine_mount',(0,.40,-.043))
 socket('grip_primary',(0,0,0));socket('blade_tip',(-.10,1.075,0))

def focus(state):
 damaged=state=='damaged';stowed=state=='stowed'
 cyl('Forged barrel core',(0,.08,0),.091,.62,'iron',20)
 for i in range(10):
  a=i*math.pi*2/10
  sector('Longitudinal iron stave',-.21,.37,.096,a-.10,a+.10,'iron',.007)
 for y,r in [(-.25,.107),(-.18,.108),(.12,.115),(.31,.128),(.47,.104),(.57,.086)]:ring('Machined barrel rim',y,r,.024,'iron',r-.016)
 # Forward fluted housing: three axial bands and narrow spokes leave through-vents.
 for y0,y1,r in [(.29,.43,.12),(.48,.555,.094),(-.245,-.14,.103),(.02,.14,.11)]:
  ring('Ceramic vent header',y0,r,.020,'ceramic',r-.012)
  ring('Ceramic vent footer',y1,r,.020,'ceramic',r-.012)
  for i in range(16):
   if damaged and y0==.29 and i in [1,2,3]:continue
   a=i*2*math.pi/16;sector('Ceramic vent separator',y0,y1,r,a-.045,a+.045,'ceramic',.012,1)
 for i in range(12):
  a=i*2*math.pi/12
  cyl('Front pressure tube',(.098*math.cos(a),.451,.098*math.sin(a)),.009,.06,'brass',8)
 ring('Muzzle lip',.583,.089,.024,'iron',.073,20)
 cyl('Banked ember recessed chamber',(0,.553,0),.073,.012,'ember',16)
 for x in [-.046,-.023,0,.023,.046]:
  h=math.sqrt(.072**2-x*x)*2;cube('Muzzle protective grille',(x,.594,0),(.011,.016,h),'iron',.002)
 for y in [-.23,.095,.32]:
  for i in range(8):
   a=i*2*math.pi/8;ob=cyl('Radial brass lock',(.119*math.cos(a),y,.119*math.sin(a)),.008,.006,'brass',8);ob.rotation_euler=(math.pi/2+a,0,math.pi/2)
 for y in [-.18,.085]:
  cube('Carry clamp',(0,y,-.107),(.075,.045,.055),'iron',.006)
  cube('Clamp ceramic facing',(0,y,-.137),(.060,.033,.009),'ceramic',.003)
 # Grip underside, leaving all muzzle vents legible.
 cube('Insulated palm grip',(0,-.065,-.137),(.065,.17,.045),'leather',.012)
 if stowed:
  for y in [-.18,.10]:
   cube('Backpack mount shoe',(0,y,-.165),(.12,.06,.025),'iron',.006)
   cube('Backpack leather bearing pad',(0,y,-.183),(.108,.05,.013),'leather',.004)
  socket('spine_mount',(0,-.04,-.195))
 socket('grip_primary',(0,-.065,-.137));socket('grip_secondary',(0,.20,-.103));socket('muzzle',(0,.61,0))

def unwrap(obs):
 bpy.ops.object.select_all(action='DESELECT')
 for o in obs:
  if o.type=='MESH':
   o.select_set(True);bpy.context.view_layer.objects.active=o
   bpy.ops.object.transform_apply(location=False,rotation=True,scale=True)
   bpy.ops.object.mode_set(mode='EDIT');bpy.ops.mesh.select_all(action='SELECT');bpy.ops.uv.smart_project(angle_limit=1.15,island_margin=.018);bpy.ops.object.mode_set(mode='OBJECT');o.select_set(False)
def export(path,obs):
 bpy.ops.object.select_all(action='DESELECT')
 for o in obs:o.select_set(True)
 bpy.context.view_layer.objects.active=next(o for o in obs if o.type=='MESH')
 bpy.ops.export_scene.gltf(filepath=str(path),export_format='GLB',use_selection=True,export_apply=True,export_yup=True,export_extras=True)
def triangles(obs):
 s=0
 for o in obs:
  if o.type=='MESH':o.data.calc_loop_triangles();s+=len(o.data.loop_triangles)
 return s

def render(path,obs,view):
 coords=[];dg=bpy.context.evaluated_depsgraph_get()
 for ob in obs:
  if ob.type=='MESH':
   eo=ob.evaluated_get(dg);me=eo.to_mesh();coords.extend([eo.matrix_world@v.co for v in me.vertices]);eo.to_mesh_clear()
 mn=Vector(tuple(min(v[k] for v in coords) for k in range(3)));mx=Vector(tuple(max(v[k] for v in coords) for k in range(3)));center=(mn+mx)/2;size=max(mx-mn)
 scene=bpy.context.scene;scene.render.threads_mode='FIXED';scene.render.threads=2;scene.render.engine='CYCLES';scene.cycles.device='CPU';scene.cycles.samples=20;scene.cycles.use_denoising=False;scene.render.resolution_x=600;scene.render.resolution_y=600;scene.render.resolution_percentage=100;scene.world.color=(.2,.2,.2)
 bpy.ops.object.camera_add();cam=bpy.context.object;cam.name='Review camera';cam.location=center+Vector({'hero':(1.0,1.1,1.55),'side':(0,0,2),'front':(0,2,.03)}[view])*size;cam.rotation_euler=(center-cam.location).to_track_quat('-Z','Y').to_euler();cam.data.type='ORTHO';cam.data.ortho_scale=size*1.28;scene.camera=cam
 lights=[]
 for pos,power,scale in [((1,1,2),120,2),((-1,-.5,1),80,1.5),((0,-1,-1),90,1)]:
  bpy.ops.object.light_add(type='AREA',location=center+Vector(pos)*size);l=bpy.context.object;l.data.energy=power*size*size;l.data.shape='DISK';l.data.size=size*scale;l.rotation_euler=(center-l.location).to_track_quat('-Z','Y').to_euler();lights.append(l)
 scene.view_settings.view_transform='AgX';scene.render.image_settings.file_format='PNG';scene.render.filepath=str(path);scene.render.film_transparent=False;bpy.ops.render.render(write_still=True)
 for o in [cam]+lights:bpy.data.objects.remove(o,do_unlink=True)

def build(kind,state,prefix='kiln',collisionFactory=None,geometryFactory=None,gripOffset=None):
 bpy.ops.object.select_all(action='SELECT');bpy.ops.object.delete(use_global=False)
 for action in list(bpy.data.actions):bpy.data.actions.remove(action)
 ident=prefix+'-'+kind+'-'+state;folder=OUT/ident;folder.mkdir(exist_ok=True)
 (geometryFactory if geometryFactory else (sword if kind=='sword' else focus))(state)
 obs=list(bpy.context.scene.objects)
 if gripOffset is not None:
  for ob in obs:ob.location+=Vector(gripOffset)
 elif kind=='focus':
  for ob in obs:ob.location+=Vector((0,.065,.137))
 unwrap(obs)
 for o in obs:o['asset_id']=ident
 dims=[]
 for k in range(3):
  vals=[(o.matrix_world@v.co)[k] for o in obs if o.type=='MESH' for v in o.data.vertices];dims.append(round(max(vals)-min(vals),5))
 tri={'glb':triangles(obs)}
 export(folder/(ident+'.glb'),obs)
 for level,ratio in [(1,.52),(2,.26)]:
  mods=[]
  for o in obs:
   if o.type=='MESH' and len(o.data.polygons)>12:
    m=o.modifiers.new('LOD reduction','DECIMATE');m.ratio=ratio;mods.append((o,m))
  export(folder/(ident+f'-lod{level}.glb'),obs)
  dg=bpy.context.evaluated_depsgraph_get();count=0
  for o in obs:
   if o.type=='MESH':
    me=o.evaluated_get(dg).to_mesh();me.calc_loop_triangles();count+=len(me.loop_triangles);o.evaluated_get(dg).to_mesh_clear()
  tri['lod'+str(level)]=count
  for o,m in mods:o.modifiers.remove(m)
 # Authored coarse pickup hull excludes vents, pins and attachment protrusions.
 if collisionFactory:col=collisionFactory(kind,state)
 elif kind=='sword':col=flat_profile('UCX_'+ident,[(-.065,-.20),(.075,-.20),(.075,.43),(.01,.88),(-.10,1.10),(-.12,.65)],.09,'iron')
 else:col=cyl('UCX_'+ident,(0,.18,0),.135,.87,'iron',10)
 col.data.materials.clear()
 col['collision_role']='pickup_interaction_only; authoritative combat hitboxes require gameplay calibration'
 tri['collision']=triangles([col]);export(folder/(ident+'-collision.glb'),[col]);bpy.data.objects.remove(col,do_unlink=True)
 # Save material textures packed while retaining exact external files.
 for im in bpy.data.images:
  if im.source=='FILE' and im.filepath:im.pack()
 bpy.ops.wm.save_as_mainfile(filepath=str(folder/(ident+'.blend')))
 renders=[]
 for view in ['hero','side','front']:
  path=folder/(ident+'-'+view+'.png');render(path,obs,view);renders.append(str(path.relative_to(ROOT)))
 if any(o.type=='ARMATURE' for o in obs):
  bpy.context.scene.frame_set(18);path=folder/(ident+'-animated-pose-frame18.png');render(path,obs,'hero');renders.append(str(path.relative_to(ROOT)));bpy.context.scene.frame_set(1)
 rel=lambda suffix:str((folder/(ident+suffix)).relative_to(ROOT))
 return dict(id=ident,archetypeId=prefix+'-'+kind,name=ident.replace('-',' ').title(),type='equipment',variant=state,status='PRODUCTION_CANDIDATE_UNREVIEWED',files=dict(blend=rel('.blend'),glb=rel('.glb'),lod1=rel('-lod1.glb'),lod2=rel('-lod2.glb'),collision=rel('-collision.glb'),textures=texture_paths.copy(),renders=renders),triangles=tri,dimensionsMeters=dims,dimensionsCoordinateSystem='BLENDER_Z_UP',rig={'applicability':'STATIC_RIGID_BODY','status':'NOT_APPLICABLE','requiredForRigidBody':False,'present':False,'omittedArticulatedDetails':['hanging chain and tassel']},animations=[],remainingGates=['Art approval against references 061 and 113','Hanging chain/tassel mesh, rig and settle animation','Character hand and stowed mount calibration','Real Three.js, Godot and Unreal import/runtime validation','LOD silhouette transition review and measured performance','Combat collision and elemental effects integration','Reference wear and fine engraved details refinement'])

if __name__=='__main__':
 bpy.context.preferences.filepaths.save_version=0
 materials();assets=[]
 for kind in ['sword','focus']:
  for state in ['ready','stowed','damaged']:
   assets.append(build(kind,state));(OUT/'manifest.json').write_text(json.dumps(dict(schemaVersion=1,familyId='asset-o01-e-weapons-family',referenceIds=['reference-061','reference-113'],status='PARTIAL_PRODUCTION_CANDIDATES_UNREVIEWED',coordinateContract='Blender meters +Y forward +Z up; grip reference origin; GLB standard Y-up conversion',assets=assets),indent=2)+'\n')
 # Contact sheet: top row sword ready/stowed/damaged, bottom focus same states.
 canvas=np.ones((800,1200,4),dtype=np.float32)
 for idx,a in enumerate(assets):
  im=bpy.data.images.load(str(ROOT/a['files']['renders'][0]),check_existing=False);im.scale(400,400)
  pix=np.array(im.pixels[:],dtype=np.float32).reshape(400,400,4)
  row=1-idx//3;col=idx%3;canvas[row*400:(row+1)*400,col*400:(col+1)*400]=pix
 sheet=bpy.data.images.new('Kiln weapons contact sheet',width=1200,height=800,alpha=True);sheet.pixels.foreach_set(canvas.ravel());sheet.filepath_raw=str(OUT/'contact-sheet.png');sheet.file_format='PNG';sheet.save()
 print('KILN_WEAPONS_COMPLETE',len(assets))
