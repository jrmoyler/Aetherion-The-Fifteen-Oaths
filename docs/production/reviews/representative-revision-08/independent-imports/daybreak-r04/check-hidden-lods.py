import bpy,json,math,hashlib
from pathlib import Path
root=Path('/tmp/aetherion-daybreak-architecture-r04');out=Path('/tmp/aetherion-daybreak-independent-checks/r04');request=json.loads((out/'source-inputs.json').read_text());rows=[]
for f in request['blends']:
 p=Path(f);before=hashlib.sha256(p.read_bytes()).hexdigest();bpy.ops.wm.open_mainfile(filepath=str(p));module=json.loads(p.with_name('module.json').read_text());groups={0:[],1:[],2:[]};errors=[]
 for ob in bpy.context.scene.objects:
  if ob.type!='MESH':continue
  if ob.get('representation')=='lod_variant':
   level=ob.get('lod_level');groups[level].append(ob)
   expected=f'LOD{level}_EDITABLE_HIDDEN';col=bpy.data.collections.get(expected)
   if not col or ob not in list(col.objects) or not col.hide_render or not col.hide_viewport or not ob.hide_render or not ob.hide_get():errors.append('LOD_NOT_HIDDEN:'+ob.name)
  elif not ob.hide_render:groups[0].append(ob)
 for level in [1,2]:bpy.data.collections[f'LOD{level}_EDITABLE_HIDDEN'].hide_viewport=False
 bpy.context.view_layer.update()
 report=[]
 for level,obs in groups.items():
  if not obs:errors.append('MISSING_EDITABLE_LEVEL:'+str(level))
  triangles=0;uvbad=0
  for ob in obs:
   mesh=ob.data;mesh.calc_loop_triangles();triangles+=len(mesh.loop_triangles);uv=mesh.uv_layers.active
   if not uv:errors.append('MISSING_UV:'+ob.name);continue
   for t in mesh.loop_triangles:
    a,b,c=[ob.matrix_world@mesh.vertices[v].co for v in t.vertices];ua,ub,uc=[uv.data[v].uv for v in t.loops];area=(b-a).cross(c-a).length/2;uarea=abs((ub.x-ua.x)*(uc.y-ua.y)-(ub.y-ua.y)*(uc.x-ua.x))/2
    if area>1e-12 and uarea<1e-12:uvbad+=1
   if any(not math.isfinite(v) for vert in mesh.vertices for v in vert.co):errors.append('NONFINITE:'+ob.name)
   if not mesh.materials:errors.append('NO_MATERIAL:'+ob.name)
  if uvbad:errors.append(f'COLLAPSED_UV:{level}:{uvbad}')
  claim=module['lod_triangle_counts'][f'lod{level}']
  if triangles!=claim:errors.append(f'TRIANGLE_MISMATCH:{level}:{triangles}:{claim}')
  points=[ob.matrix_world@v.co for ob in obs for v in ob.data.vertices];bounds={'min':[min(v[i] for v in points) for i in range(3)],'max':[max(v[i] for v in points) for i in range(3)]};bound_error=None
  if level:
   imported=next(r for r in json.loads((out/'changed-glb.json').read_text())['reports'] if r['path']==str(p.parent/f'lod{level}.glb'));b=imported['rest']['bounds'];mapped=[b['min'][0],-b['max'][2],b['min'][1],b['max'][0],-b['min'][2],b['max'][1]];bound_error=max(abs(a-b) for a,b in zip(mapped,bounds['min']+bounds['max']))
   if bound_error>.0001:errors.append(f'SOURCE_EXPORT_BOUNDS:{level}:{bound_error}')
  report.append({'level':level,'meshes':len(obs),'triangles':triangles,'collapsedUvTriangles':uvbad,'sourceBoundsBlender':bounds,'maxExportBoundsErrorMeters':bound_error})
 used={n.image for m in bpy.data.materials if m.use_nodes and m.users>0 for n in m.node_tree.nodes if n.type=='TEX_IMAGE' and n.image}
 if any(not i.packed_file for i in used):errors.append('UNPACKED_IMAGE')
 rows.append({'source':str(p),'sha256':before,'sourceUnchanged':hashlib.sha256(p.read_bytes()).hexdigest()==before,'levels':report,'packedImageCount':len(used),'errors':errors})
(out/'hidden-lod-sources.json').write_text(json.dumps({'scope':'Actual source open and direct editable meshes/collection flags/UV/material/image checks; no source saves','reports':rows,'allPass':all(not r['errors'] and r['sourceUnchanged'] for r in rows)},indent=2)+'\n')
