import bpy,hashlib,json
from pathlib import Path
from mathutils import Vector
P=Path(__file__).resolve().parent;ID='kiln-ninja-ensemble-candidate';OUT=P/'renders';OUT.mkdir(exist_ok=True);records=json.loads((P/'render-evidence.json').read_text()) if (P/'render-evidence.json').exists() else []
for label,source in [('before',P/'baseline'/(ID+'.blend')),('after',P/ID/(ID+'.blend'))]:
 digest=hashlib.sha256(source.read_bytes()).hexdigest();bpy.ops.wm.open_mainfile(filepath=str(source));s=bpy.context.scene;r=next(o for o in bpy.data.objects if o.type=='ARMATURE');r.animation_data.action=bpy.data.actions['walk_in_place'];s.render.engine='CYCLES';s.cycles.device='CPU';s.cycles.samples=32;s.cycles.use_denoising=False;s.render.resolution_x=750;s.render.resolution_y=900;s.render.resolution_percentage=100;s.render.image_settings.file_format='PNG';s.world.color=(.14,.14,.14);s.view_settings.view_transform='AgX';s.render.film_transparent=False
 bpy.ops.mesh.primitive_plane_add(size=10,location=(0,0,.012));floor=bpy.context.object;fm=bpy.data.materials.new('Unchanged review floor Z012');fm.diffuse_color=(.10,.11,.12,1);floor.data.materials.append(fm)
 for loc,power,size in [((2,-3,4),380,3),((-2,-1,2.5),240,2),((0,2,3),420,2)]:
  bpy.ops.object.light_add(type='AREA',location=loc);o=bpy.context.object;o.data.energy=power;o.data.size=size;o.rotation_euler=(Vector((0,0,1))-o.location).to_track_quat('-Z','Y').to_euler()
 for frame in [9,25]:
  s.frame_set(frame);bpy.context.view_layer.update()
  for view,loc,target,scale in [('hero',(2.7,-5,1.75),(0,0,.916),1.88),('feet',(1,-2,.11),(0,-.04,.095),.85)]:
   if view=='hero' and '--feet-only' in __import__('sys').argv:continue
   s.render.resolution_x=1200 if view=='feet' else 750;s.render.resolution_y=700 if view=='feet' else 900
   bpy.ops.object.camera_add(location=loc);cam=bpy.context.object;cam.rotation_euler=(Vector(target)-cam.location).to_track_quat('-Z','Y').to_euler();cam.data.type='ORTHO';cam.data.ortho_scale=scale;s.camera=cam;file=OUT/('%s-walk-%02d-%s.png'%(label,frame,view));s.render.filepath=str(file);bpy.ops.render.render(write_still=True);bpy.data.objects.remove(cam,do_unlink=True);records=[x for x in records if x['file']!=str(file.relative_to(P))];records.append({'file':str(file.relative_to(P)),'sha256':hashlib.sha256(file.read_bytes()).hexdigest(),'variant':label,'frame':frame,'view':view,'sourceSha256':digest,'floorZ':.012});(P/'render-evidence.json').write_text(json.dumps(records,indent=2)+'\n')
 assert digest==hashlib.sha256(source.read_bytes()).hexdigest()
