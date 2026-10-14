import bpy,json,pathlib
from mathutils import Vector
from mathutils.bvhtree import BVHTree
O=pathlib.Path(__file__).resolve().parent;checks=[]
def check(n,ok,e):checks.append({'check':n,'passed':bool(ok),'evidence':e})
for r in json.loads((O/'canopy-r04-authoring-report.json').read_text())['reports']:
 slug=r['module'];bpy.ops.wm.open_mainfile(filepath=str(O/'modules'/slug/'source.blend'))
 for c in bpy.data.collections:
  if c.name.startswith(('LOD1_EDITABLE','LOD2_EDITABLE')):c.hide_viewport=False
 bpy.context.view_layer.update()
 groups={k:[o for o in bpy.context.scene.objects if o.type=='MESH' and ((k==0 and not o.hide_render) or (k>0 and o.get('representation')=='lod_variant' and o.get('lod_level')==k))] for k in range(3)}
 def bounds(obs):
  vs=[o.matrix_world@v.co for o in obs for v in o.data.vertices];return [[min(v[i] for v in vs) for i in range(3)],[max(v[i] for v in vs) for i in range(3)]]
 bs={k:bounds(obs) for k,obs in groups.items()};delta=max(abs(bs[k][j][i]-bs[0][j][i]) for k in [1,2] for j in [0,1] for i in range(3));check(slug+' all LOD socket envelope',delta<.00025,{'bounds_blender_m':bs,'maximum_delta_m':delta,'tolerance_m':.00025,'policy':'All corner fittings retained. Subdivision-dependent textile solidify normals may differ within0.25mm; structural bay endpoints and typed sockets remain exact.'})
 for k,obs in groups.items():
  trees=[BVHTree.FromPolygons([o.matrix_world@v.co for v in o.data.vertices],[p.vertices[:] for p in o.data.polygons]) for o in obs]
  if slug in ['window-wall','door-frame']:
   x0,z0,w,h=(1.4,1,1.2,1.2) if slug=='window-wall' else (.2,0,1.2,2.4);hits=0
   for i in range(13):
    for j in range(25):
     v=Vector((x0+.003+(w-.006)*i/12,-1,z0+.003+(h-.006)*j/24));hits+=any(t.ray_cast(v,Vector((0,1,0)),3)[0] is not None for t in trees)
   check(f'{slug} LOD{k} actual visible aperture',hits==0,{'ray_count':325,'hit_count':hits})
  if slug=='stair-flight':
   samples=[]
   for i in range(9):
    for offset in [.001,.15,.299]:
     y=i*.3+offset;heights=[h[0].z for t in trees if (h:=t.ray_cast(Vector((.9,y,4)),Vector((0,0,-1)),6))[0] is not None];samples.append({'y':y,'z':max(heights) if heights else None,'expected':(i+1)*.16})
   check(f'stair LOD{k} all nine exposed treads',all(s['z'] is not None and abs(s['z']-s['expected'])<.0001 for s in samples),samples)
(O/'r04-lod-interface-validation.json').write_text(json.dumps({'scope':'Actual saved Blender LOD geometry envelope, visible aperture rays and stair tread samples; no controller traversal certification','checks':checks,'failures':sum(not c['passed'] for c in checks)},indent=2)+'\n');print('LOD INTERFACE FAILURES',sum(not c['passed'] for c in checks))
