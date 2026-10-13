import bpy,json,pathlib,sys
from mathutils import Vector
O=pathlib.Path(__file__).resolve().parent
s=(O/'author.py').read_text();exec(s[:s.index('\nreports=[]')])
def clear():
 for o in list(bpy.context.scene.objects):bpy.data.objects.remove(o,do_unlink=True)
def append(slug,at=(0,0,0),rz=0):
 p=O/'modules'/slug/'source.blend'
 with bpy.data.libraries.load(str(p),link=False) as (src,dst):dst.objects=src.objects
 objs=[o for o in dst.objects if o]
 for o in objs:bpy.context.collection.objects.link(o)
 bpy.context.view_layer.update();root=bpy.data.objects.new('INSTANCE__'+slug,None);bpy.context.collection.objects.link(root)
 for o in objs:
  if not o.parent:o.parent=root
 root.location=at;root.rotation_euler.z=rz;bpy.context.view_layer.update()
 for o in objs:
  if o.type=='MESH' and o.name.startswith('COL_'):o.hide_render=True;o.hide_set(True)
 return [o for o in objs if o.type=='MESH' and not o.hide_render]
sc=bpy.context.scene;sc.unit_settings.system='METRIC';sc.unit_settings.scale_length=1
rows=[]
chosen=sys.argv[sys.argv.index('--')+1:] if '--' in sys.argv else []
for name in ['civic','residential','work','stairs-with-landing','ramp-with-landing']:
 if chosen and name not in chosen:continue
 clear();visible=[];placements=[]
 def put(slug,at=(0,0,0),rz=0):
  visible.extend(append(slug,at,rz));placements.append({'module':slug,'translation_blender_m':list(at),'rotation_z_radians':rz})
 if name in ['civic','residential','work']:
  for x in [0,4]:
   for y in [0,4]:
    if not (x==4 and y==0 and name in ['civic','residential']):put('floor-bay',(x,y,0))
  put('public-colonnade');put('shade-canopy',(0,0,3.48))
  if name in ['civic','residential']:
   visual=[];colliders=[];sockets=[];floor(4,1,.4)
   for o in visual+colliders:o.location+=Vector((4,3,0))
   for o in colliders:o.hide_render=True;o.hide_set(True)
   visible.extend(visual);placements.append({'extra_geometry':'4x1m flush circulation adapter','translation_blender_m':[4,3,0]})
  if name=='civic':put('clinic-threshold',(4.8,8,0));put('quiet-portico',(4,0,0));put('solid-wall',(0,7.65,0))
  if name=='residential':put('window-wall',(0,7.65,0));put('solid-wall',(4,7.65,0));put('quiet-portico',(4,0,0));put('service-chase',(7.4,5.5,0))
  if name=='work':put('window-wall',(4,7.65,0));put('daylight-baffle',(5,7.35,2));put('service-chase',(7.4,6.6,0));put('parapet',(4,0,0))
 else:
  ramp=name.startswith('ramp');put('ramp-run' if ramp else 'stair-flight');visual=[];colliders=[];sockets=[];floor(1.8,1.8,.16);rise=.4 if ramp else 1.6;run=4.8 if ramp else 2.7
  for o in visual+colliders:o.location+=Vector((0,run,rise))
  for o in colliders:o.hide_render=True;o.hide_set(True)
  visible.extend(visual);placements.append({'extra_geometry':'1.8m landing support adapter','translation_blender_m':[0,run,rise]})
 sc.frame_set(1);bpy.context.view_layer.update();D=O/'fixtures'/name;D.mkdir(parents=True,exist_ok=True)
 bpy.ops.wm.save_as_mainfile(filepath=str(D/'source.blend'),compress=True);export(D/'assembly.glb',visible+[o for o in bpy.context.scene.objects if o.type=='EMPTY']);render(D/'hero.png',visible)
 row={'fixture':name,'placements':placements,'status':'ASSEMBLY_REVIEW_CANDIDATE_NOT_GAMEPLAY_VALIDATED','bounds_blender_m':bounds(visible),'final_riser_ownership':('The receiving landing front fascia at y2.70 spans z1.44–1.60; flight tread9 remains y2.40–2.70' if name=='stairs-with-landing' else 'not applicable'),'gaps':['visual fidelity','connection and circulation review','event/restoration states','nav/controller traversal','source references are PROPOSED']};(D/'fixture.json').write_text(json.dumps(row,indent=2)+'\n');rows.append(row)
(O/'fixture-run.json').write_text(json.dumps(rows,indent=2)+'\n')
