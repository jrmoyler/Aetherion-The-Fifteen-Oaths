"""Read frozen V13 and render 19 previously defined views; never save source."""
import bpy,bmesh,json,hashlib,os,math,numpy as np
from pathlib import Path
from mathutils import Vector
HERE=Path(__file__).resolve().parent;OUT=Path(os.environ.get('AETHERION_REVIEW_OUT',str(HERE)));OUT.mkdir(parents=True,exist_ok=True);SOURCE=Path(os.environ.get('AETHERION_SOURCE','/tmp/ninja-v13/kiln-ninja-ensemble-candidate/kiln-ninja-ensemble-candidate.blend'));before=hashlib.sha256(SOURCE.read_bytes()).hexdigest();assert before=='5d1fb9fc7042a22dff33939baa3614adbde520c0e77d55d7aa5472e52b14e114'
bpy.ops.wm.open_mainfile(filepath=str(SOURCE));scene=bpy.context.scene;body=bpy.data.objects['Kiln_ninja_weighted_lowpoly'];rig=next(o for o in bpy.data.objects if o.type=='ARMATURE');actions={name:bpy.data.actions.get(name) for name in ['idle_breath','walk_in_place','cast_release']};assert all(actions.values())
source_objects=[{'name':o.name,'type':o.type,'parent':o.parent.name if o.parent else None,'parentBone':o.parent_bone} for o in bpy.data.objects]
scene.render.engine='CYCLES';scene.cycles.device='CPU';scene.cycles.samples=24;scene.cycles.use_denoising=False;scene.render.resolution_x=750;scene.render.resolution_y=900;scene.render.resolution_percentage=100;scene.render.image_settings.file_format='PNG';scene.world.color=(.14,.14,.14);scene.view_settings.view_transform='AgX';scene.render.film_transparent=False;scene.render.fps=24
bpy.ops.mesh.primitive_plane_add(size=10,location=(0,0,.012));floor=bpy.context.object;floor.name='Review stage only';fm=bpy.data.materials.new('Review floor');fm.diffuse_color=(.10,.11,.12,1);floor.data.materials.append(fm)
for loc,power,size in [((2,-3,4),380,3),((-2,-1,2.5),240,2),((0,2,3),420,2)]:
 bpy.ops.object.light_add(type='AREA',location=loc);light=bpy.context.object;light.data.energy=power;light.data.size=size;light.rotation_euler=(Vector((0,0,1))-light.location).to_track_quat('-Z','Y').to_euler()
weights={side:[v.index for v in body.data.vertices if any(body.vertex_groups[g.group].name=='foot.'+side and g.weight>.5 for g in v.groups)] for side in ['L','R']}
sockets=[n for n in ['grip_primary','cast_origin','hit_reference','stow'] if n in bpy.data.objects];rows=[]
def rest():
 rig.animation_data.action=None
 for p in rig.pose.bones:p.rotation_euler=(0,0,0);p.location=(0,0,0)
 scene.frame_set(1);bpy.context.view_layer.update()
def render(label,view='hero',clip=None,frame=1,unmasked=False):
 rest()
 if clip:rig.animation_data.action=actions[clip];scene.frame_set(frame);bpy.context.view_layer.update()
 camloc={'hero':(2.7,-5,1.75),'front':(0,-5,.916),'back':(0,5,1.15),'side':(5,0,.916),'portrait':(0,-2,1.680),'face_profile':(2,0,1.680)}[view];head=view in ['portrait','face_profile'];bpy.ops.object.camera_add(location=camloc);cam=bpy.context.object;cam.rotation_euler=(Vector((0,0,1.68) if head else (0,0,.916))-cam.location).to_track_quat('-Z','Y').to_euler();cam.data.type='ORTHO';cam.data.ortho_scale=.34 if head else 1.88;scene.camera=cam
 evaluated=body.evaluated_get(bpy.context.evaluated_depsgraph_get());me=evaluated.to_mesh();feet={}
 for side,indices in weights.items():
  xyz=[body.matrix_world@me.vertices[i].co for i in indices];z=[v.z for v in xyz];feet[side]={'minimumZ':min(z),'maximumZ':max(z),'floorZ':.012,'minimumClearance':min(z)-.012,'verticesBelowFloor':sum(v<.012-1e-5 for v in z),'footWeightedVertexCount':len(z)}
 evaluated.to_mesh_clear();record={'file':label+'.png','view':view,'clip':clip,'frame':frame,'unmasked':unmasked,'feet':feet,'socketWorldPositions':{n:list(bpy.data.objects[n].matrix_world.translation) for n in sockets}}
 scene.render.filepath=str(OUT/(label+'.png'));bpy.ops.render.render(write_still=True);bpy.data.objects.remove(cam,do_unlink=True);record['sha256']=hashlib.sha256((OUT/(label+'.png')).read_bytes()).hexdigest();rows.append(record);(OUT/'render-progress.json').write_text(json.dumps(rows,indent=2)+'\n');print('REVIEW_VIEW_DONE',label,flush=True)
for view in ['front','back','side','hero']:render('rest-'+view,view)
for clip in ['idle_breath','walk_in_place','cast_release']:
 for frame in ([1,9,17,25] if clip=='walk_in_place' else [1,13,25,37]):render(clip+'-%02d'%frame,clip=clip,frame=frame)
render('masked-portrait','portrait')
diagnostic=body.copy();diagnostic.data=body.data.copy();bpy.context.collection.objects.link(diagnostic);diagnostic.name='Unmasked temporary review';bm=bmesh.new();bm.from_mesh(diagnostic.data);bm.verts.ensure_lookup_table();mask=diagnostic.data.attributes.get('review_mask');removed=sum(v.value for v in mask.data);bmesh.ops.delete(bm,geom=[v for v in bm.verts if mask.data[v.index].value],context='VERTS');bm.to_mesh(diagnostic.data);bm.free();body.hide_render=True
for view in ['portrait','face_profile']:render('unmasked-'+view,view,unmasked=True)
body.hide_render=False;bpy.data.objects.remove(diagnostic,do_unlink=True);rest();after=hashlib.sha256(SOURCE.read_bytes()).hexdigest();assert before==after
(OUT/'render-evidence.json').write_text(json.dumps({'source':str(SOURCE),'sourceSha256Before':before,'sourceSha256After':after,'sourceUnchanged':before==after,'renderCount':len(rows),'expectedCount':19,'engine':'Blender4.3.2 Cycles CPU24samples','boneCount':len(rig.data.bones),'clips':list(actions),'sourceObjects':source_objects,'equipment':'No equipped weapon mesh authored in source; empty sockets are present, weapon grasp/clearance untested.','maskDiagnosticRemovedVertices':removed,'views':rows,'scope':'19 actual views from frozen source, sampled animation frames only; no art, gameplay, foot-contact or equipment-fit acceptance.'},indent=2)+'\n')
