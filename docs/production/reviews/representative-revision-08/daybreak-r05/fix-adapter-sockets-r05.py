import bpy,json,pathlib,hashlib
from mathutils import Vector
P=pathlib.Path(__file__).resolve().parent;s=(P/'author.py').read_text();exec(s[:s.index('\nreports=[]')]);bpy.context.preferences.filepaths.save_version=0;reports=[]
for name in ['civic','residential','work','stairs-with-landing','ramp-with-landing']:
 d=P/'fixtures'/name;m=json.loads((d/'fixture.json').read_text());extras=[r for r in m['placements'] if 'extra_geometry' in r]
 if not extras:continue
 row=extras[0];w,depth,thickness=(1.8,1.8,.16) if 'landing' in name else (4,1,.4);at=Vector(row['translation_blender_m']);row.update({'rotation_z_radians':0,'adapter_dimensions_m':{'width':w,'depth':depth,'thickness':thickness},'adapter_id':'floor-adapter'});bpy.ops.wm.open_mainfile(filepath=str(d/'source.blend'));expected={'west':(0,depth/2,0),'east':(w,depth/2,0),'south':(w/2,0,0),'north':(w/2,depth,0),'finished-floor':(0,0,0)};changes=[]
 for ob in bpy.context.scene.objects:
  if ob.type!='EMPTY' or ob.parent or not ob.get('semantic_type'):continue
  matches=[key for key in expected if ob.name=='SOCKET__'+key or (ob.name.startswith('SOCKET__'+key+'.') and ob.name[len('SOCKET__'+key)+1:].isdigit())];assert len(matches)==1,ob.name;key=matches[0];before=list(ob.location);ob.location=at+Vector(expected[key]);ob['canonical_socket_name']='SOCKET__'+key;ob['adapter_id']='floor-adapter';changes.append({'name':ob.name,'before_blender_m':before,'after_blender_m':list(ob.location)})
 assert len(changes)==5;bpy.context.view_layer.update();export(d/'assembly.glb',[o for o in bpy.context.scene.objects if (o.type=='MESH' and not o.hide_render) or o.type=='EMPTY']);bpy.ops.wm.save_as_mainfile(filepath=str(d/'source.blend'),compress=True);(d/'fixture.json').write_text(json.dumps(m,indent=2)+'\n');reports.append({'fixture':name,'adapter':row,'anchor_changes':changes})
(P/'r05-adapter-repair.json').write_text(json.dumps({'scope':'Anchor transforms only; adapter visual and collision geometry unchanged. Prior checks missed unparented adapter anchor transforms.','reports':reports},indent=2)+'\n')
