import bpy,json,hashlib
from pathlib import Path
P=Path('/workspace/scratch/ninja-v16');B=Path('/workspace/scratch/ninja-v15/kiln-ninja-ensemble-candidate/kiln-ninja-ensemble-candidate.blend');bpy.ops.wm.open_mainfile(filepath=str(B));o=bpy.data.objects['Kiln_ninja_weighted_lowpoly'];m=o.data;adj=[set() for _ in m.vertices]
for e in m.edges:a,b=e.vertices;adj[a].add(b);adj[b].add(a)
rows=[]
for receipt in json.loads((P/'source-removal.json').read_text())['components']:
 wanted=set(receipt['indices']);seen=set();queue=[next(iter(wanted))]
 while queue:
  v=queue.pop()
  if v in seen:continue
  seen.add(v);queue.extend(adj[v]-seen)
 vertices=[m.vertices[i].co for i in seen];faces=[p for p in m.polygons if any(i in seen for i in p.vertices)];rows.append({'claimedVertices':len(wanted),'actualDisconnectedVertices':len(seen),'exactWholeDisconnectedComponent':seen==wanted,'faces':len(faces),'materialNames':sorted(set(m.materials[f.material_index].name for f in faces)),'boundsBlender':[[min(v[k] for v in vertices) for k in range(3)],[max(v[k] for v in vertices) for k in range(3)]]})
Path(__file__).with_suffix('.json').write_text(json.dumps({'baselineSourceSha256':hashlib.sha256(B.read_bytes()).hexdigest(),'removedComponents':rows,'passed':all(r['exactWholeDisconnectedComponent'] for r in rows)},indent=2)+'\n');print(len(rows),all(r['exactWholeDisconnectedComponent'] for r in rows))
