import bpy,json
from pathlib import Path
P=Path(__file__).resolve().parent;S=P/'baseline'/'kiln-ninja-ensemble-candidate.blend';bpy.ops.wm.open_mainfile(filepath=str(S));o=bpy.data.objects['Kiln_ninja_weighted_lowpoly'];m=o.data
parent=list(range(len(m.vertices)))
def root(i):
 while parent[i]!=i:parent[i]=parent[parent[i]];i=parent[i]
 return i
for e in m.edges:
 a,b=map(root,e.vertices);parent[b]=a
cs={}
for v in m.vertices:cs.setdefault(root(v.index),[]).append(v.index)
out=[]
for vs in cs.values():
 pts=[m.vertices[i].co for i in vs];mi=[min(v[k] for v in pts) for k in range(3)];ma=[max(v[k] for v in pts) for k in range(3)]
 if mi[0]>.25 and mi[2]>.99 and ma[2]<1.23:
  ps=[p for p in m.polygons if p.vertices[0] in set(vs)];uv=[tuple(m.uv_layers.active.data[l].uv) for p in ps for l in p.loop_indices];out.append({'min':mi,'max':ma,'vertices':len(vs),'indices':vs,'polygons':len(ps),'uvmean':[sum(u[k] for u in uv)/len(uv) for k in range(2)]})
(P/'baseline-components.json').write_text(json.dumps(out,indent=2));print([(x['vertices'],x['min'],x['max'],x['uvmean']) for x in out])
