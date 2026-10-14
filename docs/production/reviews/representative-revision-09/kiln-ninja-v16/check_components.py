import bpy,bmesh,json
from pathlib import Path
P=Path(__file__).resolve().parent;ID='kiln-ninja-ensemble-candidate';bpy.ops.wm.open_mainfile(filepath=str(P/ID/(ID+'.blend')));out=[]
for o in bpy.data.objects:
 if not o.get('v16_component'):continue
 bm=bmesh.new();bm.from_mesh(o.data);r={'name':o.name,'vertices':len(bm.verts),'edges':len(bm.edges),'faces':len(bm.faces),'boundaryEdges':sum(e.is_boundary for e in bm.edges),'nonManifoldEdges':sum(not e.is_manifold for e in bm.edges),'signedVolume':bm.calc_volume(signed=True)};bm.free();out.append(r)
assert all(x['nonManifoldEdges']==0 for x in out),out
(P/'component-topology.json').write_text(json.dumps(out,indent=2)+'\n');print('CLOSED COMPONENTS',len(out))
