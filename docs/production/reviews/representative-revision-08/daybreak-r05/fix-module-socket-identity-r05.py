import bpy,pathlib,json,hashlib
from mathutils import Vector
P=pathlib.Path(__file__).resolve().parent;s=(P/'author.py').read_text();exec(s[:s.index('\nreports=[]')]);bpy.context.preferences.filepaths.save_version=0;reports=[]
for slug in ['shade-canopy','public-colonnade']:
 d=P/'modules'/slug;bpy.ops.wm.open_mainfile(filepath=str(d/'source.blend'));declared=json.loads((d/'module.json').read_text())['sockets'];records=[]
 for c in bpy.data.collections:
  if c.name.startswith(('LOD1_EDITABLE','LOD2_EDITABLE')):c.hide_viewport=False
 bpy.context.view_layer.update()
 for ob in bpy.context.scene.objects:
  if ob.type!='EMPTY' or not ob.get('semantic_type'):continue
  matches=[r for r in declared if r['semantic_type']==ob['semantic_type'] and (ob.location-Vector(r['position_blender_xyz_m'])).length<1e-6];assert len(matches)==1,(slug,ob.name,matches);canonical='SOCKET__'+matches[0]['name'];level=next((k for k in [1,2] if any(c.name.startswith(f'LOD{k}_EDITABLE') for c in ob.users_collection)),0);ob['canonical_socket_name']=canonical
  if level:ob['representation']='lod_variant';ob['lod_level']=level
  records.append((ob,canonical,level))
 for level in [1,2]:
  for i,(ob,canonical,k) in enumerate(records):ob.name=f'R05_INTERNAL_ANCHOR_{i}'
  roots=[ob for ob,canonical,k in records if k==level]
  for ob,canonical,k in records:
   if k==level:ob.name=canonical
  meshes=[ob for ob in bpy.context.scene.objects if ob.type=='MESH' and ob.get('representation')=='lod_variant' and ob.get('lod_level')==level];export(d/f'lod{level}.glb',meshes+roots)
 for i,(ob,canonical,k) in enumerate(records):ob.name=f'R05_INTERNAL_ANCHOR_{i}'
 for ob,canonical,k in records:ob.name=canonical if k==0 else f'LOD{k}__{canonical}'
 for ob in bpy.context.scene.objects:
  if ob.get('representation') in ['lod_variant','movement_proxy']:ob.hide_set(True)
 for c in bpy.data.collections:
  if c.name.startswith(('LOD1_EDITABLE','LOD2_EDITABLE')):c.hide_viewport=True;c.hide_render=True
 bpy.ops.wm.save_as_mainfile(filepath=str(d/'source.blend'),compress=True);reports.append({'module':slug,'canonical_socket_count':len(declared),'source_sha256':hashlib.sha256((d/'source.blend').read_bytes()).hexdigest(),'levels':[{ 'level':k,'source_object_name':ob.name,'canonical_socket_name':canonical} for ob,canonical,k in records]})
(P/'r05-module-identity-repair.json').write_text(json.dumps({'scope':'Metadata/anchor naming only, LOD0 and all visible geometry untouched','reports':reports},indent=2)+'\n')
