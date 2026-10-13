import bpy,sys,math
from pathlib import Path
from mathutils import Vector
ROOT=Path(__file__).resolve().parent;sys.path.insert(0,str(ROOT/'recipe'));import kiln_weapons as K,storm_weapons as S,chronal_weapons as C,impulse_weapons as I
OUT=Path(__file__).resolve().parent;OUT.mkdir(exist_ok=True);K.OUT=OUT;K.ROOT=OUT;K.TEX=OUT/'textures';K.TEX.mkdir(exist_ok=True);bpy.context.preferences.filepaths.save_version=0
bpy.ops.object.select_all(action='SELECT');bpy.ops.object.delete(use_global=False)
S.material_pack([('steel',(.15,.16,.17),.92,.39),('brass',(.43,.28,.10),.85,.42),('leather',(.038,.032,.026),0,.83),('edge',(.42,.43,.44),.97,.27)],34)
C.wrist('ready');obs=list(bpy.context.scene.objects);K.unwrap(obs);print(C.author_wrist_atlas(obs))
for im in bpy.data.images:
 if im.source=='FILE':im.pack()
bpy.ops.wm.save_as_mainfile(filepath=str(OUT/'chronal-wrist-tool-v6.blend'))
# Neutral studio comparison; actual camera follows evaluated animated bounds.
def render(name,view,frame=1):
 scene=bpy.context.scene;scene.frame_set(frame);dg=bpy.context.evaluated_depsgraph_get();coords=[]
 for ob in obs:
  if ob.type=='MESH':eo=ob.evaluated_get(dg);me=eo.to_mesh();coords += [eo.matrix_world@v.co for v in me.vertices];eo.to_mesh_clear()
 mn=Vector(tuple(min(v[k] for v in coords) for k in range(3)));mx=Vector(tuple(max(v[k] for v in coords) for k in range(3)));center=(mn+mx)/2;size=max(mx-mn)
 scene.render.engine='CYCLES';scene.cycles.device='CPU';scene.cycles.samples=96;scene.cycles.use_denoising=False;scene.render.threads_mode='FIXED';scene.render.threads=2;scene.render.resolution_x=900;scene.render.resolution_y=900;scene.render.resolution_percentage=100;scene.world.color=(.18,.18,.18)
 bpy.ops.object.camera_add();cam=bpy.context.object;cam.location=center+Vector(view)*size;cam.rotation_euler=(center-cam.location).to_track_quat('-Z','Y').to_euler();cam.data.type='ORTHO';cam.data.ortho_scale=size*1.72;scene.camera=cam;lights=[]
 for pos,power,scale in [((1,0,2),110,1.7),((-1,-1,.6),55,1.3),((.2,1,-.4),80,1)]:
  bpy.ops.object.light_add(type='AREA',location=center+Vector(pos)*size);l=bpy.context.object;l.data.energy=power*size*size;l.data.size=size*scale;l.rotation_euler=(center-l.location).to_track_quat('-Z','Y').to_euler();lights.append(l)
 scene.view_settings.view_transform='AgX';scene.render.image_settings.file_format='PNG';scene.render.filepath=str(OUT/(name+'.png'));bpy.ops.render.render(write_still=True)
 for o in [cam]+lights:bpy.data.objects.remove(o,do_unlink=True)
render('chronal-wrist-tool-v6-hero',(1,1.1,1.8))
render('chronal-wrist-tool-v6-front',(0,0,2))
render('chronal-wrist-tool-v6-side',(1.5,-.4,.7))
render('chronal-wrist-tool-v6-deployed',(1,1.1,1.8),18)
print('WRIST_REVIEW_COMPLETE')
