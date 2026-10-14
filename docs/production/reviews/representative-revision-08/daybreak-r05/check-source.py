import bpy,json,math,pathlib,hashlib
from mathutils import Vector
O=pathlib.Path(__file__).resolve().parent;rows=[]
for p in sorted((O/'modules').glob('*/source.blend')):
 bpy.ops.wm.open_mainfile(filepath=str(p));man=json.loads(p.with_name('module.json').read_text());visual=[o for o in bpy.context.scene.objects if o.type=='MESH' and not o.hide_render];collision=[o for o in bpy.context.scene.objects if o.type=='MESH' and o.hide_render and o.get('representation')!='lod_variant'];lod_objects=[o for o in bpy.context.scene.objects if o.type=='MESH' and o.get('representation')=='lod_variant'];bad=[];densities=[];uvzero=0;tris=0
 saved_collection_flags={c.name:(c.hide_render,c.hide_viewport) for c in bpy.data.collections if c.name.startswith(('LOD1_EDITABLE','LOD2_EDITABLE'))}
 for c in bpy.data.collections:
  if c.name in saved_collection_flags:c.hide_viewport=False
 bpy.context.view_layer.update()
 for o in visual+lod_objects:
  m=o.data;m.calc_loop_triangles();uv=m.uv_layers.active
  if not uv:bad.append('UV_MISSING:'+o.name);continue
  for t in m.loop_triangles:
   a,b,c=[o.matrix_world@m.vertices[i].co for i in t.vertices];area=(b-a).cross(c-a).length/2;ua,ub,uc=[uv.data[i].uv for i in t.loops];uarea=abs((ub.x-ua.x)*(uc.y-ua.y)-(ub.y-ua.y)*(uc.x-ua.x))/2
   if o in visual:tris+=1
   if area>1e-12 and uarea<1e-12:uvzero+=1
   if area>1e-12:densities.append(512*math.sqrt(uarea/area))
  if any(not math.isfinite(v) for vert in m.vertices for v in vert.co):bad.append('NONFINITE')
  if any(abs(s-1)>1e-5 for s in o.scale):bad.append('NONUNIT_SCALE:'+o.name)
 collections=[{'name':c.name,'hide_render':saved_collection_flags[c.name][0],'hide_viewport':saved_collection_flags[c.name][1],'objects':len(c.objects)} for c in bpy.data.collections if c.name.startswith(('LOD1_EDITABLE','LOD2_EDITABLE'))]
 if lod_objects and (len(collections)!=2 or any(not c['hide_render'] or not c['hide_viewport'] for c in collections) or any(not o.hide_render for o in lod_objects)):bad.append('LOD_DEFAULT_VISIBILITY')
 if len(collision)!=man['collider_meshes']:bad.append('UNDECLARED_COLLIDER')
 if len(visual)!=man['visual_meshes']:bad.append('UNDECLARED_VISUAL')
 if uvzero:bad.append('ZERO_AREA_UV:'+str(uvzero))
 used_images={n.image for m in bpy.data.materials if m.use_nodes for n in m.node_tree.nodes if n.type=='TEX_IMAGE' and n.image and m.users>0}
 if any(not i.packed_file for i in used_images):bad.append('UNPACKED_IMAGE')
 rows.append({'module':p.parent.name,'source_sha256':hashlib.sha256(p.read_bytes()).hexdigest(),'opened':True,'visual_meshes':len(visual),'collider_meshes':len(collision),'triangles':tris,'lod_editable_meshes':len(lod_objects),'lod_hidden_collections':collections,'lod_triangles':{str(k):sum(len(o.data.loop_triangles) for o in lod_objects if o.get('lod_level')==k) for k in [1,2]},'zero_area_uv_triangles':uvzero,'measured_triangle_texel_density_px_per_m':{'minimum':min(densities),'median':sorted(densities)[len(densities)//2],'maximum':max(densities)},'density_limit':'Smart-unwrapped per-object islands; 512px textures. No 512px/m compliance claim; large faces fall below proposed close-view target.','all_used_images_packed':all(i.packed_file for i in used_images),'errors':bad})
(O/'source-validation.json').write_text(json.dumps({'scope':'Actual Blender source opens, mesh/UV/texture/scale checks; not acceptance','schemaVersion':1,'tool':{'name':'Blender','version':bpy.app.version_string},'reports':rows},indent=2)+'\n');print('ERRORS',sum(len(r['errors']) for r in rows))
