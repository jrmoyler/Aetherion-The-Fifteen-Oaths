import bpy,json,hashlib
from pathlib import Path
r=Path('/workspace/scratch/aetherion-daybreak-architecture-r05');b=Path(__file__).parent;imported=json.loads((b/'anchor-positions.json').read_text());rows=[]
for record in imported['rows']:
 if not record['file'].startswith('fixtures/'):continue
 p=(r/record['file']).with_name('source.blend');sha=hashlib.sha256(p.read_bytes()).hexdigest();bpy.ops.wm.open_mainfile(filepath=str(p));bpy.context.view_layer.update();sockets=[o for o in bpy.context.scene.objects if o.name.startswith('SOCKET__')];checks=[]
 for item in record['checks']:
  ob=bpy.data.objects.get(item['name']);assert ob is not None,item['name'];v=ob.matrix_world.translation;world=[v.x,v.z,-v.y];error=max(abs(a-c) for a,c in zip(world,item['actual']));checks.append({'name':ob.name,'sourceCanonical':ob.get('canonical_socket_name'),'sourceWorldGltf':world,'exportWorld':item['actual'],'errorMeters':error,'passed':error<1e-5 and bool(ob.get('canonical_socket_name'))})
 rows.append({'path':str(p),'sha256':sha,'sourceUnchanged':sha==hashlib.sha256(p.read_bytes()).hexdigest(),'sourceSocketCount':len(sockets),'exportSocketCount':len(record['checks']),'checks':checks,'passed':len(sockets)==len(record['checks']) and all(x['passed'] for x in checks)})
(b/'fixture-source-anchors.json').write_text(json.dumps({'reports':rows,'passed':all(x['passed'] for x in rows)},indent=2)+'\n')
