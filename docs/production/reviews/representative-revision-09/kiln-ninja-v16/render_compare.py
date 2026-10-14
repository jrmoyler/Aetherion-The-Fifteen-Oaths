import bpy,hashlib,json,sys
from pathlib import Path
from mathutils import Vector
P=Path(__file__).resolve().parent;ID='kiln-ninja-ensemble-candidate';OUT=P/'renders';OUT.mkdir(exist_ok=True);records=json.loads((P/'render-evidence.json').read_text()) if (P/'render-evidence.json').exists() else []
views=[('front',(0,-5,.916),(0,0,.916),1.88),('back',(0,5,.916),(0,0,.916),1.88),('side',(5,0,.916),(0,0,.916),1.88),('hero',(2.7,-5,1.75),(0,0,.916),1.88),('bracer-front',(.34,-2,1.125),(.34,-.005,1.125),.27),('bracer-near',(2,-1,1.17),(.34,-.005,1.125),.28),('bracer-far',(-1,-1,1.14),(.36,-.05,1.125),.32),('cast',(2.7,-5,1.75),(0,0,.916),1.88)]
if '--early' in sys.argv:views=[v for v in views if v[0] in ['front','bracer-front','bracer-near']]
if '--framing' in sys.argv:views=[v for v in views if v[0] in ['bracer-far','cast']]
for label,src in [('v15',P/'baseline'/(ID+'.blend')),('v16',P/ID/(ID+'.blend'))]:
 digest=hashlib.sha256(src.read_bytes()).hexdigest();bpy.ops.wm.open_mainfile(filepath=str(src));s=bpy.context.scene;rig=next(o for o in bpy.data.objects if o.type=='ARMATURE');s.render.engine='CYCLES';s.cycles.device='CPU';s.cycles.samples=24;s.cycles.use_denoising=False;s.render.resolution_percentage=100;s.render.image_settings.file_format='PNG';s.world.color=(.14,.14,.14);s.view_settings.view_transform='AgX';s.render.film_transparent=False
 bpy.ops.mesh.primitive_plane_add(size=10,location=(0,0,.012));fm=bpy.data.materials.new('Unchanged floor .012');fm.diffuse_color=(.1,.11,.12,1);bpy.context.object.data.materials.append(fm)
 for loc,power,size in [((2,-3,4),380,3),((-2,-1,2.5),240,2),((0,2,3),420,2)]:
  bpy.ops.object.light_add(type='AREA',location=loc);o=bpy.context.object;o.data.energy=power;o.data.size=size;o.rotation_euler=(Vector((0,0,1))-o.location).to_track_quat('-Z','Y').to_euler()
 for view,loc,target,scale in views:
  rig.animation_data.action=bpy.data.actions['cast_release'] if view=='cast' else None
  for bone in rig.pose.bones:bone.location=(0,0,0);bone.rotation_euler=(0,0,0)
  s.frame_set(25 if view=='cast' else 1);bpy.context.view_layer.update();s.render.resolution_x=650;s.render.resolution_y=750 if not view.startswith('bracer') else 650
  bpy.ops.object.camera_add(location=loc);cam=bpy.context.object;cam.rotation_euler=(Vector(target)-cam.location).to_track_quat('-Z','Y').to_euler();cam.data.type='ORTHO';cam.data.ortho_scale=scale;s.camera=cam;file=OUT/(label+'-'+view+'.png');s.render.filepath=str(file);bpy.ops.render.render(write_still=True);bpy.data.objects.remove(cam,do_unlink=True);records=[x for x in records if x['path']!=str(file.relative_to(P))];records.append({'path':str(file.relative_to(P)),'sha256':hashlib.sha256(file.read_bytes()).hexdigest(),'sourceSha256':digest,'view':view,'camera':loc,'target':target,'scale':scale,'floorWorldZ':.012,'clip':'cast_release' if view=='cast' else None,'frame':25 if view=='cast' else 1});(P/'render-evidence.json').write_text(json.dumps(records,indent=2)+'\n')
 assert hashlib.sha256(src.read_bytes()).hexdigest()==digest
