import bpy,json
from pathlib import Path
from mathutils.bvhtree import BVHTree
P=Path(__file__).resolve().parent;bpy.ops.wm.open_mainfile(filepath=str(P/'impulse-shield-lateral-review08b.blend'))
records=[]
for frame in range(1,182):
 bpy.context.scene.frame_set(frame);dg=bpy.context.evaluated_depsgraph_get();groups={}
 for o in bpy.context.scene.objects:
  if o.type!='MESH':continue
  group=o.get('mechanicalGroup','carrier');vs,fs,labels=groups.setdefault(group,([],[],[]));eo=o.evaluated_get(dg);me=eo.to_mesh();off=len(vs);vs.extend(eo.matrix_world@v.co for v in me.vertices);me.calc_loop_triangles();fs.extend(tuple(off+i for i in t.vertices) for t in me.loop_triangles);labels.extend([o.name]*len(me.loop_triangles));eo.to_mesh_clear()
 trees={g:BVHTree.FromPolygons(v,f,all_triangles=True,epsilon=.000001) for g,(v,f,l) in groups.items()};names=list(trees);hits=[]
 for i,a in enumerate(names):
  for b in names[i+1:]:
   pairs={}
   for x,y in trees[a].overlap(trees[b]):
    key=(groups[a][2][x],groups[b][2][y]);pairs[key]=pairs.get(key,0)+1
   for (x,y),n in pairs.items():hits.append({'groupA':a,'groupB':b,'objectA':x,'objectB':y,'trianglePairs':n})
 records.append({'frame':frame,'intersections':hits})
(P/'clearance-audit.json').write_text(json.dumps({'status':'FAIL_INTERSECTIONS' if any(r['intersections'] for r in records) else 'PASS_SAMPLED_SURFACE_INTERSECTIONS','method':'Evaluated worldspace triangleBVH,all181integerframes,epsilon1micrometer; allintergroupcontacts included,no exclusions','limitation':'No betweenframe swept-volume, containment,loadbearingforce, character/glove tests; same-rigid-group assembly contacts excluded','frames':records},indent=2)+'\n');print('CLEARANCE_COMPLETE',sum(bool(r['intersections']) for r in records),'frames with intersections')
