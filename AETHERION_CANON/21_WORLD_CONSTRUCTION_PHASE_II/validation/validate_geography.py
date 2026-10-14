#!/usr/bin/env python3
"""Reproducible dependency-light conceptual geography checks; no terrain simulation."""
import json, pathlib, collections, math
from jsonschema import Draft202012Validator
ROOT=pathlib.Path(__file__).resolve().parents[1]
def load(f):return json.loads((ROOT/f).read_text())
g=load('WORLD_REGION_GRAPH.json');t=load('TRANSPORT_ROUTE_REGISTRY.json');checks=[]
def check(name,ok,detail):
 checks.append({'check':name,'passed':bool(ok),'detail':detail})
 if not ok:print('FAIL',name,detail)
def area(poly):return sum(a[0]*b[1]-b[0]*a[1] for a,b in zip(poly,poly[1:]+poly[:1]))/2
cross=lambda a,b,c:(b[0]-a[0])*(c[1]-a[1])-(b[1]-a[1])*(c[0]-a[0])
def intersects(a,b,c,d):return cross(a,b,c)*cross(a,b,d)<-1e-7 and cross(c,d,a)*cross(c,d,b)<-1e-7
for fn,sn in [('WORLD_REGION_GRAPH.json','world-region-graph.schema.json'),('TRANSPORT_ROUTE_REGISTRY.json','transport-route-registry.schema.json')]:
 errors=list(Draft202012Validator(load('schemas/'+sn)).iter_errors(load(fn)));check('schema '+fn,not errors,[e.message for e in errors])
rs=g['records'];edges=g['edges'];P={r['id']:(r['relative_anchor']['x'],r['relative_anchor']['y']) for r in rs};adj={u:set() for u in P};expected=set()
for e in edges:
 a,b=e['from_region_id'],e['to_region_id'];adj[a].add(b);adj[b].add(a);expected.add(tuple(sorted((a,b))))
check('unique counts',len(rs)==15 and len(P)==15 and len(edges)==30 and len(expected)==30 and len(g['drainage_networks'])==4 and len(g['baseline_poi_manifest'])==63,'15 unique regions,30 unique undirected edges,4 basins,63 preserved POIs')
check('capital and POI uniqueness',len({p['id'] for p in g['baseline_poi_manifest']})==63 and all(r['capital_id'] in {p['id'] for p in g['baseline_poi_manifest']} for r in rs),'63 distinct POIs and15 matching capitals')
check('neighbor reciprocity',all(set(r['neighbor_ids'])==adj[r['id']] for r in rs),'Record neighbors match bidirectional edges')
def reach(start,blocked=None):
 seen={start};q=[start]
 for u in q:
  for v in adj[u]:
   if tuple(sorted((u,v)))==blocked:continue
   if v not in seen:seen.add(v);q.append(v)
 return seen
check('ordinary connectivity',len(reach('region-01'))==15,'One connected ordinary graph')
check('all single-edge failures',all(len(reach('region-01',p))==15 for p in expected),'All30 edge removals preserve all15 regions')
cr=[]
for i,e in enumerate(edges):
 for f in edges[i+1:]:
  ns=[e['from_region_id'],e['to_region_id'],f['from_region_id'],f['to_region_id']]
  if len(set(ns))==4 and intersects(*[P[n] for n in ns]):cr.append([e['id'],f['id']])
check('straight-line planarity',not cr,cr)
segments=collections.defaultdict(list);bad=[];all_polyedges=[]
for r in rs:
 poly=[tuple(x) for x in r['conceptual_territory_polygon']];pe=list(zip(poly,poly[1:]+poly[:1]));
 for i,(a,b) in enumerate(pe):
  segments[tuple(sorted((a,b)))].append(r['id']);all_polyedges.append((r['id'],a,b))
  for c,d in pe[i+1:]:
   if len({a,b,c,d})==4 and intersects(a,b,c,d):bad.append(r['id'])
check('territory simple positive rings',not bad and all(area(r['conceptual_territory_polygon'])>0 for r in rs),bad)
shared={tuple(sorted(set(owners))) for owners in segments.values() if len(set(owners))==2}
check('exact physical shared-border pairs',shared==expected,{'missing':sorted(expected-shared),'extra':sorted(shared-expected)})
check('no three-way shared segments',all(len(set(v))<=2 for v in segments.values()),'Junction points may be triple; positive-length borders have at most2 owners')
cr=[]
for i,(u,a,b) in enumerate(all_polyedges):
 for v,c,d in all_polyedges[i+1:]:
  if u!=v and len({a,b,c,d})==4 and intersects(a,b,c,d):cr.append((u,v))
check('territory interior noncrossing',not cr,cr)
coast=[tuple(x) for x in g['coastline_polygon']];cpe=list(zip(coast,coast[1:]+coast[:1]));csimple=all(not intersects(a,b,c,d) for i,(a,b) in enumerate(cpe) for c,d in cpe[i+1:] if len({a,b,c,d})==4)
check('single simple coastline',csimple and area(coast)>0,'One ordered positive-area outer ring')
external={s for s,own in segments.items() if len(own)==1};check('coast equals territory perimeter',external=={tuple(sorted(e)) for e in cpe},'No unexplained internal hole or detached perimeter edge')
pa=sum(area(r['conceptual_territory_polygon']) for r in rs);ca=area(coast);check('land area conserved',abs(pa-ca)<0.02,{'territories':pa,'coast':ca,'units':'editorial square units'})
for b in g['drainage_networks']:
 seq=b['river_region_sequence'];heights=[s['target_elevation_m'] for s in b['channel_stations']]+[b['terminal_ocean_target_m']]
 check('drainage '+b['id'],[s['region_id'] for s in b['channel_stations']]==seq and all(tuple(sorted((a,c))) in expected for a,c in zip(seq,seq[1:])) and all(a>c for a,c in zip(heights,heights[1:])),{'sequence':seq,'descending_targets_m':heights})
for r in t['records']:
 p=r['detour_region_ids'];pairs=[tuple(sorted((a,b))) for a,b in zip(p,p[1:])];orig=tuple(sorted((r['from_region_id'],r['to_region_id'])));valid=p[0]==r['from_region_id'] and p[-1]==r['to_region_id'] and orig not in pairs and all(x in expected for x in pairs)
 check('detour '+r['baseline_route_id'],valid,p)
required={'walkable_routes','roads','bridges','mountain_passes','climbing_paths','rivers','canals','maritime_routes','gliding_routes','underground_passages','mount_paths','trade_highways','teleportation_infrastructure','storm_relay_transportation','escapement_road_vehicles','observatory_gravity_traversal','hidden_court_void_passages'};keys={x['mode_key'] for x in t['mode_catalog']};check('all17 requested modes',required<=keys,sorted(required-keys))
report={'status':'PASS' if all(x['passed'] for x in checks) else 'FAIL','scope':'Conceptual topology, schemas, drainage control-station targets and detours; not actual terrain or runtime validation.','checks':checks}
(ROOT/'validation/GEOGRAPHY_VALIDATION.json').write_text(json.dumps(report,indent=2)+'\n');print(report['status'],len(checks),'checks')
raise SystemExit(0 if report['status']=='PASS' else 1)
