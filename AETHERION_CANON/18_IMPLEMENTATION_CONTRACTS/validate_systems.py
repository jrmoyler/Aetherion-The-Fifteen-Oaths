#!/usr/bin/env python3
"""Static systems data validation only; does not execute proposed gameplay."""
import argparse,json,pathlib,sys
from itertools import combinations_with_replacement
import jsonschema
p=argparse.ArgumentParser();p.add_argument('--canon-root',type=pathlib.Path,default=pathlib.Path(__file__).resolve().parents[1]);p.add_argument('--repo-root',type=pathlib.Path,required=True);p.add_argument('--output',type=pathlib.Path);a=p.parse_args();root=a.canon_root;checks=[]
def load(path):return json.loads((root/path).read_text())
def check(name,condition,detail=''):
 checks.append({'id':name,'status':'PASS' if condition else 'FAIL','detail':detail})
def records(path):return load(path)['records']
I=records('07_GAMEPLAY_SYSTEMS/INTERACTION_RULES.json');E=['fire','frost','storm','water','earth','wind','nature','poison','light','cosmic','shadow','blood','arcane','time','tech']
pairs=[tuple(sorted(r['elements'],key=E.index)) for r in I]
check('all-120-element-pairs',len(I)==120 and set(pairs)==set(combinations_with_replacement(E,2)) and len(set(pairs))==120)
check('all-225-directed-entries',sum(len(r['directed_effects']) for r in I)==225)
check('neutral-defaults',all(r['default_result']=='NEUTRAL_COEXISTENCE' for r in I))
check('individual-directional-predicates',all(d['required_context']['target_material_tags_all'] and d['required_context']['source_phenomenon_tags_all'] and d['required_context']['capability_key']==d['transition_key'] for r in I for d in r['directed_effects']))
check('fire-frost-distinct-target-gates',I[1]['directed_effects'][0]['required_context']['target_material_tags_all']==['meltable_ice'] and I[1]['directed_effects'][1]['required_context']['target_material_tags_all']==['hot_surface'])
check('bounded-interaction-cascades',all(r['max_chain_depth']==2 and r['max_children']==3 and r['scope_ceiling']=='instance' for r in I))
check('no-universal-damage-advantage',all(d['damage_multiplier']==1.0 for r in I for d in r['directed_effects']))
C=records('18_IMPLEMENTATION_CONTRACTS/IMPLEMENTATION_CONTRACTS.json');ids={c['id'] for c in C};byid={c['id']:c for c in C}
try:jsonschema.Draft202012Validator(load('18_IMPLEMENTATION_CONTRACTS/schemas/implementation-contracts.schema.json')).validate(load('18_IMPLEMENTATION_CONTRACTS/IMPLEMENTATION_CONTRACTS.json'));schema_ok=True;schema_detail='Draft 2020-12 validator; structural pass only'
except jsonschema.ValidationError as e:schema_ok=False;schema_detail=str(e)
check('contract-json-schema',schema_ok,schema_detail)
check('contract-reference-integrity',len(ids)==len(C) and all(d in ids for c in C for d in c['dependencies']))
visited=set();visiting=set()
def visit(id):
 if id in visiting:raise ValueError(id)
 if id in visited:return
 visiting.add(id)
 for d in byid[id]['dependencies']:visit(d)
 visiting.remove(id);visited.add(id)
try:
 for id in ids:visit(id)
 dag=True
except (KeyError,ValueError):dag=False
check('contract-dependency-dag',dag)
check('contract-state-references',all(t['from'] in c['state']['states'] and t['to'] in c['state']['states'] for c in C for t in c['transitions']))
check('contract-tests-honestly-unexecuted',all(t['status']=='SPECIFIED_NOT_EXECUTED' for c in C for t in c['acceptance_tests']))
W=records('01_WORLD_BIBLE/ENTITY_CONTRACT.json');adj={w['region_id']:set(w['neighbor_ids']) for w in W};F=records('14_LIFE_SKILLS_AND_ECONOMY/WORLD_RESOURCE_FLOWS.json');P=records('14_LIFE_SKILLS_AND_ECONOMY/PRODUCTION_RECIPES.json');fi={f['id']:f for f in F};pi={r['id']:r for r in P};resources={r['output']['resource_id'] for r in P}
def valid_route(route):return all(y in adj[x] for x,y in zip(route,route[1:]))
check('all-trade-routes-follow-geography',all(valid_route(f['primary_route']) and valid_route(f['fallback_route']) for f in F))
check('trade-detours-exclude-interrupted-edge',all(all({x,y}!={f['origin_region_id'],f['destination_region_id']} for x,y in zip(f['fallback_route'],f['fallback_route'][1:])) for f in F))
check('all-15-realms-have-typed-recipes',len(P)==15 and {r['region_id'] for r in P}==set(adj))
check('recipe-imports-resolve-to-output-and-route',all(v['resource_id'] in resources and v['flow_id'] in fi and fi[v['flow_id']]['destination_region_id']==r['region_id'] and fi[v['flow_id']]['resource_id']==v['resource_id'] for r in P for v in r['imported_inputs']))
check('each-recipe-has-two-foreign-inputs',all(len(r['imported_inputs'])==2 and all(v['supplier_region_id']!=r['region_id'] for v in r['imported_inputs']) for r in P))
check('every-refined-resource-has-consumer',all(r['output']['consumers'] and all(c in pi for c in r['output']['consumers']) for r in P))
check('actual-demand-is-separated-from-route-capacity',sum(f['demand_class']=='RECIPE_INPUT_DEMAND' for f in F)==30 and all(bool(f['consumer_recipe_ids'])==(f['demand_class']=='RECIPE_INPUT_DEMAND') for f in F))
check('production-has-nonzero-raw-and-labor-cost',all(r['local_raw_input']['quantity']>0 and r['labor']['objectives']>0 and r['fallback']['inputs'][0]['quantity']>0 for r in P))
check('fallback-cannot-feed-refined-loop',all('ineligible as another standard recipe input' in r['fallback']['restriction'] for r in P))
A=records('10_ASSET_REGISTRY/MASTER_ASSET_REGISTRY.json');assetids={r['id'] for r in A};L=records('07_GAMEPLAY_SYSTEMS/CASTABLE_WORLD_LINKS.json');source=json.loads((a.repo_root/'CASTABLE_REGISTRY.json').read_text())['castables'];src={r['uid']:r for r in source}
check('all-100-real-castables-world-linked',len(L)==100 and {r['source_uid'] for r in L}==set(src))
check('castable-source-identity-preserved',all(r['source_name']==src[r['source_uid']]['sourceCatalog']['label'] and r['source_element_id']==src[r['source_uid']]['sourceCatalog']['element'] for r in L))
check('castable-asset-family-references',all(r['source_asset_id'] in assetids and all(r['requirements'][k] in assetids for k in ['vfx_asset_family_id','animation_asset_family_id','ui_asset_family_id']) and all(r['equipment_compatibility'][k] in assetids for k in ['weapon_asset_family_id','sorcerer_asset_family_id','stealth_asset_family_id']) for r in L))
check('castable-candidate-interaction-references',all(len(r['interaction_candidates']['rule_ids'])==15 and all(id in {i['id'] for i in I} for id in r['interaction_candidates']['rule_ids']) and not r['interaction_candidates']['active_rule_ids'] for r in L))
check('castable-implementation-contract-references',all(all(id in ids for id in r['implementation_contract_ids']) for r in L))
missing=[]
for r in L:
 s=r['source_paths']
 for f in [s['implementation'],s['preset']]+s['vfx_modules']+s['animation_clips']:
  if not (a.repo_root/f).is_file():missing.append(f)
check('castable-source-paths-exist',not missing,'Missing: '+str(sorted(set(missing))) if missing else 'Source file presence only; no GPU or visual inference')
for folder,file,key in [('07_GAMEPLAY_SYSTEMS','OATH_SYSTEM_PROFILES.json','oath_id'),('13_WORLD_EVENTS','WORLD_EVENT_REGISTRY.json','oath_id'),('14_LIFE_SKILLS_AND_ECONOMY','ECONOMY_REGISTRY.json','oath_id'),('15_HOUSING','HOUSING_PROFILES.json','oath_id')]:
 r=records(folder+'/'+file);check(file+'-all-fifteen',len(r)==15 and {x[key] for x in r}=={f'oath-{i:02}' for i in range(1,16)})
report={'schema_version':'1.0.0','canon_status':'PROPOSED','source_ids':['SRC-SYSTEMS-PROPOSAL'],'validation_scope':'STATIC_DATA_ONLY_NOT_GAMEPLAY_IMPLEMENTATION','checks':checks,'summary':{'pass':sum(c['status']=='PASS' for c in checks),'fail':sum(c['status']=='FAIL' for c in checks),'runtime_acceptance':'NOT_EXECUTED','human_review':'REQUIRED','gpu_visual':'NOT_TESTED_BY_THIS_SCRIPT'}}
if a.output:a.output.write_text(json.dumps(report,indent=2)+'\n')
print(json.dumps(report,indent=2));sys.exit(bool(report['summary']['fail']))
