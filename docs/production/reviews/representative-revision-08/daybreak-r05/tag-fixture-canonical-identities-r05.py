import bpy,json,pathlib,hashlib,re
P=pathlib.Path(__file__).resolve().parent;s=(P/'author.py').read_text();exec(s[:s.index('\nreports=[]')]);bpy.context.preferences.filepaths.save_version=0
for name in ['civic','residential','work','stairs-with-landing','ramp-with-landing']:
 d=P/'fixtures'/name;bpy.ops.wm.open_mainfile(filepath=str(d/'source.blend'))
 for ob in bpy.context.scene.objects:
  if ob.type!='EMPTY' or not ob.get('semantic_type'):continue
  if ob.parent and ob.parent.name.startswith('INSTANCE__'):
   slug=ob.parent.name[len('INSTANCE__'):].split('.')[0];declared=['SOCKET__'+r['name'] for r in json.loads((P/'modules'/slug/'module.json').read_text())['sockets']]
  else:declared=['SOCKET__'+n for n in ['west','east','south','north','finished-floor']]
  matches=[key for key in declared if ob.name==key or (ob.name.startswith(key+'.') and ob.name[len(key)+1:].isdigit() and len(ob.name[len(key)+1:])>=3)];assert len(matches)==1,(ob.name,matches);ob['canonical_socket_name']=matches[0]
 export(d/'assembly.glb',[o for o in bpy.context.scene.objects if (o.type=='MESH' and not o.hide_render) or o.type=='EMPTY']);bpy.ops.wm.save_as_mainfile(filepath=str(d/'source.blend'),compress=True)
r=json.loads((P/'r05-membership-repair.json').read_text())
for row in r['reports']:row['source_sha256']=hashlib.sha256((P/'fixtures'/row['fixture']/'source.blend').read_bytes()).hexdigest()
(P/'r05-membership-repair.json').write_text(json.dumps(r,indent=2)+'\n')
