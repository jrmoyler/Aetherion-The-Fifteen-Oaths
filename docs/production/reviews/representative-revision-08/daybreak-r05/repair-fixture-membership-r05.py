import bpy,json,pathlib,hashlib,re
P=pathlib.Path(__file__).resolve().parent
s=(P/'author.py').read_text();exec(s[:s.index('\nreports=[]')]);bpy.context.preferences.filepaths.save_version=0
expected={'SOCKET__'+r['name'] for slug in ['shade-canopy','public-colonnade'] for r in json.loads((P/'modules'/slug/'module.json').read_text())['sockets'] if r['name'].startswith(('canopy-seat','pier-seat'))};reports=[]
for name in ['civic','residential','work']:
 d=P/'fixtures'/name;before=hashlib.sha256((d/'source.blend').read_bytes()).hexdigest();bpy.ops.wm.open_mainfile(filepath=str(d/'source.blend'));removed=[]
 for o in list(bpy.context.scene.objects):
  duplicate=o.type=='EMPTY' and o.name.startswith(('SOCKET__canopy-seat','SOCKET__pier-seat')) and o.name not in expected
  if o.get('representation')=='lod_variant' or duplicate:removed.append({'name':o.name,'type':o.type,'reason':'duplicate LOD anchor' if duplicate else 'hidden editable LOD construction mesh'});bpy.data.objects.remove(o,do_unlink=True)
 # Validate and deduplicate every typed socket within its source-module instance.
 for instance in [o for o in bpy.context.scene.objects if o.name.startswith('INSTANCE__')]:
  slug=re.sub(r'\.\d{3,}$','',instance.name[len('INSTANCE__'):]);declared={'SOCKET__'+r['name'] for r in json.loads((P/'modules'/slug/'module.json').read_text())['sockets']};groups={}
  for ob in list(instance.children):
   if ob.type=='EMPTY' and ob.get('semantic_type'):
    matches=[key for key in declared if ob.name==key or (ob.name.startswith(key+'.') and ob.name[len(key)+1:].isdigit() and len(ob.name[len(key)+1:])>=3)];assert len(matches)==1,(slug,ob.name,matches);key=matches[0];ob['canonical_socket_name']=key;groups.setdefault(key,[]).append(ob)
  assert set(groups)==declared,(slug,set(groups),declared)
  for key,objects in groups.items():
   for ob in sorted(objects,key=lambda q:q.name)[1:]:removed.append({'name':ob.name,'type':ob.type,'reason':'duplicate typed LOD construction anchor within module instance'});bpy.data.objects.remove(ob,do_unlink=True)
 visible=[o for o in bpy.context.scene.objects if o.type=='MESH' and not o.hide_render];roots=[o for o in bpy.context.scene.objects if o.type=='EMPTY'];anchors=[o for o in roots if o.name.startswith(('SOCKET__canopy-seat','SOCKET__pier-seat'))];assert {o.name for o in anchors}==expected and len(anchors)==8
 export(d/'assembly.glb',visible+roots)
 bpy.ops.wm.save_as_mainfile(filepath=str(d/'source.blend'),compress=True)
 # Re-render the actual remaining scene using unchanged CPU camera/light setup.
 render(d/'hero.png',visible)
 reports.append({'fixture':name,'r04_source_sha256':before,'source_sha256':hashlib.sha256((d/'source.blend').read_bytes()).hexdigest(),'removed':removed,'remaining_canopy_seats':sum(o.name.startswith('SOCKET__canopy-seat') for o in anchors),'remaining_pier_seats':sum(o.name.startswith('SOCKET__pier-seat') for o in anchors),'visible_meshes':len(visible)})
(P/'r05-membership-repair.json').write_text(json.dumps({'scope':'Three fixture sources/exports remove hidden LOD construction objects and duplicate anchors; all module source/export bytes preserved','reports':reports},indent=2)+'\n')
