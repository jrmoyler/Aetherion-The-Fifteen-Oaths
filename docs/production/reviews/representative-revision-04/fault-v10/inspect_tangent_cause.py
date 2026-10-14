import bpy,json,math
from pathlib import Path
p=Path(__file__).resolve().parent;bpy.ops.wm.open_mainfile(filepath=str(p/'amethyst-short-blade/source.blend'))
rows=[]
for ob in bpy.context.scene.objects:
 if ob.type!='MESH':continue
 tri=ob.modifiers.new('Diagnostic_triangulate','TRIANGULATE');tri.keep_custom_normals=True
 dep=bpy.context.evaluated_depsgraph_get();eo=ob.evaluated_get(dep);me=eo.to_mesh(preserve_all_data_layers=True,depsgraph=dep)
 try:me.calc_tangents()
 except Exception as e:rows.append({'object':ob.name,'error':str(e)});eo.to_mesh_clear();continue
 uv=me.uv_layers.active.data
 for f in me.polygons:
  bad=[i for i in f.loop_indices if me.loops[i].tangent.length<.9]
  if not bad:continue
  u=[tuple(uv[i].uv) for i in f.loop_indices];a,b,c=u[:3];area=abs((b[0]-a[0])*(c[1]-a[1])-(b[1]-a[1])*(c[0]-a[0]))*.5
  rows.append({'object':ob.name,'polygon':f.index,'geometryArea':f.area,'uvArea':area,'uv':u,'vertices':[list(me.vertices[me.loops[i].vertex_index].co) for i in f.loop_indices],'zeroTangentLoops':bad,'modifiers':[m.type for m in ob.modifiers]})
 eo.to_mesh_clear()
(p/'tangent-root-cause.json').write_text(json.dumps(rows,indent=2)+'\n');print(json.dumps(rows,indent=2))
