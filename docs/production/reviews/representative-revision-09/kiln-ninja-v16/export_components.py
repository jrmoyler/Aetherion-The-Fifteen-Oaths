import bpy,json
from pathlib import Path
P=Path(__file__).resolve().parent;ID='kiln-ninja-ensemble-candidate';D=P/ID;OUT=P/'component-exports';OUT.mkdir(exist_ok=True);bpy.ops.wm.open_mainfile(filepath=str(D/(ID+'.blend')));r=next(o for o in bpy.data.objects if o.type=='ARMATURE');r.animation_data.action=None
new=[o for o in bpy.data.objects if o.get('v16_component')];copies=[]
for o in new:
 c=o.copy();c.data=o.data.copy();bpy.context.collection.objects.link(c)
 for m in list(c.modifiers):c.modifiers.remove(m)
 copies.append(c)
bpy.ops.object.select_all(action='DESELECT')
for c in copies:c.select_set(True)
bpy.context.view_layer.objects.active=copies[0];bpy.ops.object.join();body=bpy.context.object;body.name='V16 replacement bracer'
result=[]
for level,ratio in [(0,1),(1,.65),(2,.40)]:
 c=body.copy();c.data=body.data.copy();bpy.context.collection.objects.link(c);bpy.ops.object.select_all(action='DESELECT');c.select_set(True);bpy.context.view_layer.objects.active=c
 if level:
  m=c.modifiers.new('Local bracer LOD simplification','DECIMATE');m.ratio=ratio;m.use_collapse_triangulate=True;bpy.ops.object.modifier_apply(modifier=m.name)
 m=c.modifiers.new('Armature','ARMATURE');m.object=r;r.select_set(True);c.data.calc_loop_triangles();result.append({'level':level,'triangles':len(c.data.loop_triangles),'vertices':len(c.data.vertices),'ratio':ratio});bpy.ops.export_scene.gltf(filepath=str(OUT/('bracer-lod%d.glb'%level)),export_format='GLB',use_selection=True,export_yup=True,export_apply=False,export_animations=False,export_skins=True,export_all_influences=False,export_tangents=True,export_extras=True);bpy.data.objects.remove(c,do_unlink=True)
(P/'component-lods.json').write_text(json.dumps(result,indent=2)+'\n');print(result)
