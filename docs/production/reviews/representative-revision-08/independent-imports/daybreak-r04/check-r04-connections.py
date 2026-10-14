import bpy,pathlib,json,math
from mathutils import Vector
P=pathlib.Path('/tmp/aetherion-daybreak-architecture-r04');checks=[]
def check(n,ok,e):checks.append({'check':n,'passed':bool(ok),'evidence':e})
for slug in ['shade-canopy','public-colonnade']:
 d=P/'modules'/slug;bpy.ops.wm.open_mainfile(filepath=str(d/'source.blend'));m=json.loads((d/'module.json').read_text());check(slug+' strictly reduced actual topology',m['lod_triangle_counts']['lod0']>m['lod_triangle_counts']['lod1']>m['lod_triangle_counts']['lod2'],m['lod_triangle_counts'])
 if slug=='public-colonnade':
  proxies=[o for o in bpy.context.scene.objects if o.type=='MESH' and o.get('representation')=='movement_proxy'];boxes=[]
  for o in proxies:
   vs=[o.matrix_world@v.co for v in o.data.vertices];boxes.append(([min(v[i] for v in vs) for i in range(3)],[max(v[i] for v in vs) for i in range(3)]))
  outside=[];total=0
  for o in bpy.context.scene.objects:
   if o.type!='MESH' or o.hide_render or 'curved colonnade arch' in o.name:continue
   for ve in o.data.vertices:
    v=o.matrix_world@ve.co;total+=1
    if not any(all(lo[i]-.0001<=v[i]<=hi[i]+.0001 for i in range(3)) for lo,hi in boxes):outside.append({'object':o.name,'vertex':list(v)})
  check('Pier surfaces conservatively covered by stepped movement proxies',not outside,{'vertices':total,'uncovered_vertices':len(outside),'examples':outside[:12],'proxy_meshes':len(proxies),'scope':'Axis-aligned proxy coverage only, not physics or controller testing; curved overhead arches excluded'})
 else:
  vs=[o.matrix_world@v.co for o in bpy.context.scene.objects if o.type=='MESH' and not o.hide_render for v in o.data.vertices];height=max(v.z for v in vs)-min(v.z for v in vs);check('Canopy bounded within proposed300mm envelope',height<=.3,{'height_m':height})
for name in ['civic','residential','work']:
 bpy.ops.wm.open_mainfile(filepath=str(P/'fixtures'/name/'source.blend'));bpy.context.view_layer.update();pairs=[]
 for x in [.3,3.7]:
  for y in [.3,3.7]:
   a=bpy.data.objects[f'SOCKET__canopy-seat-{x}-{y}'];b=bpy.data.objects[f'SOCKET__pier-seat-{x}-{y}'];gap=(a.matrix_world.translation-b.matrix_world.translation).length;norm=sum(a['outward_normal'][i]*b['outward_normal'][i] for i in range(3));pairs.append({'canopy':a.name,'support':b.name,'gap_m':gap,'normal_dot':norm})
 check(name+' four actual source sockets coincide and oppose',all(p['gap_m']<.00001 and p['normal_dot']==-1 for p in pairs),pairs)
 a.location.x+=.015;bpy.context.view_layer.update();gap=(a.matrix_world.translation-b.matrix_world.translation).length;check(name+' displaced15mm attachment negative rejected',gap>.005,{'gap_m':gap,'in_memory_only':True})
(pathlib.Path('/tmp/aetherion-daybreak-independent-checks/r04/connection-validation.json')).write_text(json.dumps({'scope':'Geometry/socket/proxy checks only; no structural safety, rigid-body gameplay or visual approval','checks':checks,'failures':sum(not c['passed'] for c in checks)},indent=2)+'\n');print('FAILURES',sum(not c['passed'] for c in checks))
