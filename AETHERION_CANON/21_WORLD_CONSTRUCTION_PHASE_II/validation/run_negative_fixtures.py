#!/usr/bin/env python3
"""Corruption tests in a temporary copy; never mutates the planning package."""
import copy,json,pathlib,shutil,tempfile
import jsonschema
from validate_phase2 import ROOT,run

def main():
 outcomes=[]
 def record(name,ok,detail):outcomes.append({'fixture':name,'status':'PASS' if ok else 'FAIL','expected':'Invalid content is rejected','observed':detail})
 with tempfile.TemporaryDirectory(prefix='phase2-negative-') as tmp:
  root=pathlib.Path(tmp)/'package';shutil.copytree(ROOT,root)
  def mutation(name,file,change,expected):
   path=root/file
   if not path.exists():record(name,False,'Required fixture source missing');return
   original=path.read_text()
   try:
    d=json.loads(original);change(d);path.write_text(json.dumps(d));r=run(root,write=False)
    failed=[c['check'] for c in r['checks'] if c['status']=='FAIL']
    record(name,any(x.startswith(expected) for x in failed),'; '.join(x for x in failed if x.startswith(expected)))
   except Exception as e:record(name,False,'Validator crashed: '+type(e).__name__+': '+str(e))
   finally:path.write_text(original)
  mutation('sixteenth_oath','WORLD_REGION_GRAPH.json',lambda d:d['records'][0].update(oath_id='oath-16'),'exact_fifteen_oaths')
  mutation('dropped_baseline_poi','WORLD_POI_REGISTRY.json',lambda d:d['records'].pop(0),'baseline_63_pois_preserved')
  mutation('changed_baseline_capital','WORLD_REGION_GRAPH.json',lambda d:d['records'][0].update(capital_id='poi-02-capital'),'baseline_capitals_preserved')
  mutation('uphill_drainage','WORLD_REGION_GRAPH.json',lambda d:d['drainage_networks'][0]['channel_stations'][1].update(target_elevation_m=99999),'conceptual_downhill:')
  mutation('broken_detour','TRANSPORT_ROUTE_REGISTRY.json',lambda d:d['records'][0].update(detour_region_ids=['region-01','region-15','region-02']),'detour:')
  mutation('mandatory_oath','TRANSPORT_ROUTE_REGISTRY.json',lambda d:d['records'][0].update(ordinary_oath_requirement='oath-01'),'ordinary_access:')
  mutation('unresolved_reference','WORLD_REGION_GRAPH.json',lambda d:d['records'][0]['baseline_poi_ids'].append('p2-poi-99-missing'),'cross_references_resolve')
  mutation('false_approval','WORLD_REGION_GRAPH.json',lambda d:d['records'][0].update(canon_status='APPROVED'),'record_metadata:')
  def cycle(d):
   a,b=d['records'][:2];a['dependencies']=[b['id']];b['dependencies']=[a['id']]
  mutation('dependency_cycle','ENVIRONMENT_ASSET_REGISTRY.json',cycle,'dependency_graph_acyclic')
  mutation('broken_capital_service_path','CAPITAL_LAYOUT_REGISTRY.json',lambda d:d['records'][0].update(service_route_district_ids=[d['records'][0]['districts'][0]['id'],'p2-district-99-missing']),'capital_service_path:')
  def steep_ramp(d):
   r=next(m for m in d['records'][0]['modules'] if m['name']=='ramp-run');r['slope']['rise_m']=100
  mutation('invalid_ramp_grade','ARCHITECTURAL_KIT_REGISTRY.json',steep_ramp,'kit_ramp_arithmetic:')
  mutation('false_built_asset','ENVIRONMENT_ASSET_REGISTRY.json',lambda d:d['records'][0].update(status='BUILT'),'assets_not_implemented')
  # All registry schemas must reject undeclared fields, including admin registries.
  for path in sorted((root/'schemas').glob('*.json')):
   s=json.loads(path.read_text());stem=path.name.replace('.schema.json','').replace('_schema.json','').replace('.json','').replace('-','_').upper();target=root/(stem+'.json')
   if not target.exists():target=root/(stem+'_REGISTRY.json')
   if not target.exists():continue
   d=json.loads(target.read_text());d['UNDECLARED_TEST_PROPERTY']=True
   errors=list(jsonschema.Draft202012Validator(s).iter_errors(d))
   record('schema_unknown_property:'+target.name,bool(errors),'Rejected' if errors else 'Accepted unknown field')
   missing=json.loads(target.read_text());missing.pop('schema_version',None);errors=list(jsonschema.Draft202012Validator(s).iter_errors(missing))
   record('schema_required_version:'+target.name,bool(errors),'Rejected' if errors else 'Accepted missing required version')
 result={'scope':'Negative fixtures in disposable copy; PASS means the intended corruption was detected.','counts':{x:sum(o['status']==x for o in outcomes) for x in ['PASS','FAIL']},'fixtures':outcomes}
 (ROOT/'validation/NEGATIVE_FIXTURE_REPORT.json').write_text(json.dumps(result,indent=2)+'\n');print(json.dumps(result['counts']));return result
if __name__=='__main__':main()
