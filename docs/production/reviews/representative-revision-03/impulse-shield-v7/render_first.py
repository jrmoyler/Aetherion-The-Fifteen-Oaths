import bpy
from pathlib import Path
from mathutils import Vector
OUT=Path(__file__).resolve().parent
bpy.ops.wm.open_mainfile(filepath=str(OUT/'impulse-shield-lateral-review07.blend'))
scene=bpy.context.scene;obs=list(scene.objects)
def bounds(fr):
 scene.frame_set(fr);dg=bpy.context.evaluated_depsgraph_get();vs=[]
 for ob in obs:
  if ob.type!='MESH':continue
  eo=ob.evaluated_get(dg);me=eo.to_mesh();vs.extend(eo.matrix_world@v.co for v in me.vertices);eo.to_mesh_clear()
 mn=[min(v[k] for v in vs) for k in range(3)];mx=[max(v[k] for v in vs) for k in range(3)];return {'frame':fr,'min':mn,'max':mx,'dimensions':[mx[k]-mn[k] for k in range(3)]}
def render(name,fr,view):
 bb=bounds(fr);mn=Vector(bb['min']);mx=Vector(bb['max']);center=(mn+mx)/2;size=max(mx-mn)
 scene.render.engine='CYCLES';scene.cycles.device='CPU';scene.cycles.samples=48;scene.cycles.use_denoising=False;scene.render.threads_mode='FIXED';scene.render.threads=2;scene.render.resolution_x=900;scene.render.resolution_y=900;scene.render.resolution_percentage=100;scene.world.color=(.15,.15,.15)
 bpy.ops.object.camera_add();cam=bpy.context.object;cam.location=center+Vector(view)*size;cam.rotation_euler=(center-cam.location).to_track_quat('-Z','Y').to_euler();cam.data.type='ORTHO';cam.data.ortho_scale=size*1.30;scene.camera=cam;lights=[]
 for pos,pow,sz in [((1,0,2),115,1.7),((-1,-1,1),85,1.2),((0,1,-1),70,1)]:
  bpy.ops.object.light_add(type='AREA',location=center+Vector(pos)*size);o=bpy.context.object;o.data.energy=pow*size*size;o.data.size=size*sz;o.rotation_euler=(center-o.location).to_track_quat('-Z','Y').to_euler();lights.append(o)
 scene.view_settings.view_transform='AgX';scene.render.image_settings.file_format='PNG';scene.render.filepath=str(OUT/(name+'.png'));bpy.ops.render.render(write_still=True)
 for o in [cam]+lights:bpy.data.objects.remove(o,do_unlink=True)
for name,fr,view in [('deployed-front',1,(0,0,2)),('deployed-hero',1,(1,.7,2)),('intermediate',61,(1,.7,2)),('stowed-front',91,(0,0,2)),('stowed-hero',91,(1,.7,2))]:render(name,fr,view)
