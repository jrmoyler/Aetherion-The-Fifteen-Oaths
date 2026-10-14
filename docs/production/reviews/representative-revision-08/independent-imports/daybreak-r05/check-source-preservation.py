import bpy,json,pathlib,hashlib,os
P=pathlib.Path('/workspace/scratch/aetherion-daybreak-architecture-r05');B=pathlib.Path(os.environ.get('AETHERION_R04','/tmp/aetherion-daybreak-architecture-r04'))
def snapshot(p):
 bpy.ops.wm.open_mainfile(filepath=str(p));bpy.context.view_layer.update();groups={'visual':[],'collision':[]}
 for ob in bpy.context.scene.objects:
  if ob.type!='MESH' or ob.get('representation')=='lod_variant':continue
  m=ob.data;row={'name':ob.name,'matrix':[list(x) for x in ob.matrix_world],'vertices':[list(v.co) for v in m.vertices],'polygons':[list(f.vertices) for f in m.polygons],'uv':[list(x.uv) for x in m.uv_layers.active.data] if m.uv_layers.active else None,'materials':[x.name for x in m.materials]};groups['collision' if ob.hide_render else 'visual'].append(row)
 return {k:{'mesh_count':len(rows),'sha256':hashlib.sha256(json.dumps(sorted(rows,key=lambda r:r['name']),sort_keys=True).encode()).hexdigest()} for k,rows in groups.items()}
reports=[]
for rel in [f'modules/{n}/source.blend' for n in ['shade-canopy','public-colonnade']]+[f'fixtures/{n}/source.blend' for n in ['civic','residential','work','stairs-with-landing','ramp-with-landing']]:
 a=snapshot(B/rel);b=snapshot(P/rel);reports.append({'path':rel,'opened':True,'source_sha256':hashlib.sha256((P/rel).read_bytes()).hexdigest(),'r04':a,'r05':b,'visual_equal':a['visual']==b['visual'],'collision_equal':a['collision']==b['collision']})
pathlib.Path('/tmp/aetherion-daybreak-independent-checks/r05/source-preservation.json').write_text(json.dumps({'scope':'Actual Blender opens compare all primary visual and collision mesh topology/positions/UV/material slots/worldmatrices; hidden editable variants excluded from fixture-delivery checks','reports':reports,'failures':sum(not r['visual_equal'] or not r['collision_equal'] for r in reports)},indent=2)+'\n')
