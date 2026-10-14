import json,struct,sys,hashlib,re
from pathlib import Path
root=Path(sys.argv[1]);out=Path(sys.argv[2]);reports=[]
def glb(p):
 b=p.read_bytes();return json.loads(b[20:20+struct.unpack_from('<I',b,12)[0]])
def sockets(j,ids):return [j['nodes'][i] for i in ids if j['nodes'][i].get('name','').startswith('SOCKET__')]
def descendants(j,i):
 ids=[]
 for c in j['nodes'][i].get('children',[]):ids+=[c]+descendants(j,c)
 return ids
def audit(nodes,expected,fixture=False):
 actual=[((n.get('extras',{}).get('canonical_socket_name','MISSING_CANONICAL_ID') if fixture else n['name'])[8:],n.get('extras',{}).get('semantic_type')) for n in nodes]
 wanted=[(s['name'],s['semantic_type']) for s in expected]
 errors=[]
 for k in set(actual+wanted):
  if actual.count(k)!=wanted.count(k):errors.append({'socket':k,'expected':wanted.count(k),'actual':actual.count(k)})
 return {'actualCount':len(actual),'expectedCount':len(wanted),'errors':errors,'passed':not errors}
for module in sorted((root/'modules').iterdir()):
 if not (module/'module.json').exists():continue
 meta=json.loads((module/'module.json').read_text())
 for p in sorted(module.glob('*.glb')):
  if 'collision' in p.name:continue
  j=glb(p);r=audit(sockets(j,range(len(j['nodes']))),meta['sockets']);reports.append({'path':str(p.relative_to(root)),'sha256':hashlib.sha256(p.read_bytes()).hexdigest(),**r})
for p in sorted((root/'fixtures').glob('*/assembly.glb')):
 j=glb(p);covered=set();owners=[]
 for i,n in enumerate(j['nodes']):
  if n.get('name','').startswith('INSTANCE__'):
   module=re.sub(r'\.\d{3}$','',n['name'][10:]);meta=json.loads((root/'modules'/module/'module.json').read_text());ids=descendants(j,i);covered.update(ids);owned=sockets(j,ids);owners.append({'owner':n['name'],**audit(owned,meta['sockets'],True),'duplicatedNodeNegativeRejected':not audit(owned+[owned[0]],meta['sockets'],True)['passed']})
 loose=sockets(j,[i for i in range(len(j['nodes'])) if i not in covered]);expected=[]
 if any('adapter_dimensions_m' in x for x in json.loads(p.with_name('fixture.json').read_text())['placements']):
  expected=json.loads((root/'modules'/'floor-bay'/'module.json').read_text())['sockets']
 r=audit(loose,expected,True);reports.append({'path':str(p.relative_to(root)),'sha256':hashlib.sha256(p.read_bytes()).hexdigest(),'owners':owners,'looseAdapter':r,'passed':r['passed'] and all(o['passed'] for o in owners)})
result={'scope':'Raw final GLB nodes, canonical name/type cardinality per owning module instance; coincident sockets across distinct instances remain legitimate','reports':reports,'passed':all(r['passed'] for r in reports)}
# Negative fixture duplicates one real typed node within the same owner.
p=next((root/'modules').glob('*/module.json'));expected=json.loads(p.read_text())['sockets'];synthetic=[{'name':'SOCKET__'+s['name'],'extras':{'semantic_type':s['semantic_type']}} for s in expected]
result['duplicateWithinOwnerNegativeRejected']=not audit(synthetic+[synthetic[0]],expected)['passed']
out.write_text(json.dumps(result,indent=2)+'\n');print(len(reports),result['passed']);print([r['path'] for r in reports if not r['passed']])
