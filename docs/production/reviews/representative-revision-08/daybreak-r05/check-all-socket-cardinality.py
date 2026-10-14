from pathlib import Path
import json,struct,re,copy,hashlib
import numpy as np
P=Path(__file__).resolve().parent
clean=lambda n:re.sub(r'\.\d{3,}$','',n)
def read(p):
 b=p.read_bytes();return json.loads(b[20:20+struct.unpack_from('<I',b,12)[0]])
def matrices(j):
 parent={c:i for i,n in enumerate(j['nodes']) for c in n.get('children',[])};cache={}
 def world(i):
  if i in cache:return cache[i]
  n=j['nodes'][i]
  if 'matrix' in n:m=np.array(n['matrix']).reshape((4,4),order='F')
  else:
   x,y,z,w=n.get('rotation',[0,0,0,1]);m=np.eye(4);m[:3,:3]=np.array([[1-2*(y*y+z*z),2*(x*y-z*w),2*(x*z+y*w)],[2*(x*y+z*w),1-2*(x*x+z*z),2*(y*z-x*w)],[2*(x*z-y*w),2*(y*z+x*w),1-2*(x*x+y*y)]])@np.diag(n.get('scale',[1,1,1]));m[:3,3]=n.get('translation',[0,0,0])
  cache[i]=world(parent[i])@m if i in parent else m;return cache[i]
 return parent,world

def validate(j,fixture=None,module=None):
 parent,world=matrices(j);groups={};errors=[]
 for i,n in enumerate(j['nodes']):
  if not n.get('extras',{}).get('semantic_type'):continue
  owner=None;at=i
  while at in parent:
   at=parent[at]
   if j['nodes'][at].get('name','').startswith('INSTANCE__'):owner=at;break
  groups.setdefault(owner,[]).append(i)
 if module is not None:groups={None:[i for group in groups.values() for i in group]}
 group_reports=[]
 for owner,indices in groups.items():
  slug=module or (clean(j['nodes'][owner]['name'][len('INSTANCE__'):]) if owner is not None else None)
  if slug:expected=json.loads((P/'modules'/slug/'module.json').read_text())['sockets'];base=world(owner) if owner is not None else np.eye(4)
  else:
   spec=json.loads((P/'fixtures'/fixture/'fixture.json').read_text());extras=[x for x in spec['placements'] if 'extra_geometry' in x];assert len(extras)==1,(fixture,extras);desc=extras[0];w,d=desc['adapter_dimensions_m']['width'],desc['adapter_dimensions_m']['depth'];x,y,z=desc['translation_blender_m'];base=np.eye(4);base[:3,3]=[x,z,-y]
   expected=[{'name':n,'semantic_type':t,'position_gltf_xyz_m':[a,c,-b],'outward_normal_blender_xyz':v} for n,t,a,b,c,v in [('west','structural_edge',0,d/2,0,[-1,0,0]),('east','structural_edge',w,d/2,0,[1,0,0]),('south','structural_edge',w/2,0,0,[0,-1,0]),('north','structural_edge',w/2,d,0,[0,1,0]),('finished-floor','floor_datum',0,0,0,[0,0,1])]]
  names={};expected_by_name={'SOCKET__'+s['name']:s for s in expected}
  for i in indices:
   n=j['nodes'][i];raw=n['name'];explicit=n.get('extras',{}).get('canonical_socket_name')
   # Compare against complete declared names: coordinate decimals are meaningful.
   matches=[key for key in expected_by_name if raw==key or (fixture and raw.startswith(key+'.') and raw[len(key)+1:].isdigit() and len(raw[len(key)+1:])>=3)]
   key=explicit if explicit is not None else (matches[0] if len(matches)==1 else raw)
   if explicit is not None and (explicit not in expected_by_name or (module and raw!=explicit)):errors.append({'code':'CANONICAL_IDENTITY','name':raw,'canonical':explicit})
   names.setdefault(key,[]).append(i)
  if set(names)!=set(expected_by_name):errors.append({'code':'NAME_SET','owner':slug,'actual':sorted(names),'expected':sorted(expected_by_name)})
  if any(len(v)!=1 for v in names.values()):errors.append({'code':'DUPLICATE_ANCHOR','owner':slug,'counts':{k:len(v) for k,v in names.items()}})
  maxgap=0
  for key,ids in names.items():
   if key not in expected_by_name:continue
   e=expected_by_name[key]
   for i in ids:
    n=j['nodes'][i];ex=n['extras'];gap=float(np.linalg.norm(world(i)[:3,3]-(base@np.array(e['position_gltf_xyz_m']+[1]))[:3]));maxgap=max(maxgap,gap)
    if gap>1e-5:errors.append({'code':'POSITION','name':n['name'],'gap_m':gap})
    if ex.get('semantic_type')!=e['semantic_type']:errors.append({'code':'TYPE','name':n['name']})
    if ex.get('outward_normal')!=e['outward_normal_blender_xyz']:errors.append({'code':'NORMAL','name':n['name']})
  group_reports.append({'owner':j['nodes'][owner]['name'] if owner is not None else ('module' if module else 'extra floor adapter'),'module':slug,'expected':len(expected),'actual':len(indices),'maximum_position_gap_m':maxgap})
 if fixture:
  expected_roots=sum('module' in x for x in json.loads((P/'fixtures'/fixture/'fixture.json').read_text())['placements']);actual_roots=sum(n.get('name','').startswith('INSTANCE__') for n in j['nodes'])
  if actual_roots!=expected_roots:errors.append({'code':'INSTANCE_CARDINALITY','expected':expected_roots,'actual':actual_roots})
 return {'groups':group_reports,'errors':errors}
reports=[]
for p in sorted((P/'modules').glob('*/lod[012].glb')):
 result=validate(read(p),module=p.parent.name);reports.append({'path':str(p.relative_to(P)),'sha256':hashlib.sha256(p.read_bytes()).hexdigest(),**result})
for p in sorted((P/'fixtures').glob('*/assembly.glb')):
 j=read(p);result=validate(j,fixture=p.parent.name);target=next(i for i,n in enumerate(j['nodes']) if n.get('extras',{}).get('semantic_type'));negative=copy.deepcopy(j);duplicate=copy.deepcopy(negative['nodes'][target]);duplicate['name']+=' .999';duplicate['name']=duplicate['name'].replace(' .999','.999');idx=len(negative['nodes']);negative['nodes'].append(duplicate);parent={c:i for i,n in enumerate(negative['nodes']) for c in n.get('children',[])}
 if target in parent:negative['nodes'][parent[target]].setdefault('children',[]).append(idx)
 else:negative['scenes'][negative.get('scene',0)].setdefault('nodes',[]).append(idx)
 rejected=any(e['code']=='DUPLICATE_ANCHOR' for e in validate(negative,fixture=p.parent.name)['errors']);result['duplicate_negative_rejected']=rejected
 shifted=copy.deepcopy(j);shifted['nodes'][target]['translation']=list(shifted['nodes'][target].get('translation',[0,0,0]));shifted['nodes'][target]['translation'][0]+=.05;position_rejected=any(e['code']=='POSITION' for e in validate(shifted,fixture=p.parent.name)['errors']);result['displacement_5cm_negative_rejected']=position_rejected
 if not position_rejected:result['errors'].append({'code':'POSITION_NEGATIVE_NOT_REJECTED'})
 if not rejected:result['errors'].append({'code':'NEGATIVE_NOT_REJECTED'})
 reports.append({'path':str(p.relative_to(P)),'sha256':hashlib.sha256(p.read_bytes()).hexdigest(),**result})
result={'scope':'All51 actual visual module GLBs and all5 fixture exports, per-instance canonical typed-anchor cardinality/type/normal/position; same-position seam sockets across distinct instances remain legitimate','reports':reports,'error_count':sum(len(r['errors']) for r in reports)};(P/'r05-all-socket-validation.json').write_text(json.dumps(result,indent=2)+'\n');print('SOCKET EXPORTS',len(reports),'ERRORS',result['error_count']);print([(r['path'],r['errors']) for r in reports if r['errors']])
