#!/usr/bin/env python3
"""Static contract checks only. No engine, navmesh or performance validation."""
import json, pathlib, re, copy
import jsonschema
P=pathlib.Path(__file__).resolve().parents[1]
checks=[]
def check(label,condition):
 if not condition: raise AssertionError(label)
 checks.append(label)
e=json.loads((P/'WORLD_EVENT_REGISTRY.json').read_text());b=json.loads((P/'REGIONAL_ECOLOGY_PROFILES.json').read_text())
for name,data,sname in [('events',e,'world_event_registry'),('ecology',b,'regional_ecology_profiles')]:
 schema=json.loads((P/'schemas'/f'{sname}.schema.json').read_text());jsonschema.Draft202012Validator.check_schema(schema);jsonschema.validate(data,schema);check(name+' schema',True)
 bad=copy.deepcopy(data);bad['records'][0]['unknown_property']='reject me';check(name+' rejects unknown record property',not jsonschema.Draft202012Validator(schema).is_valid(bad))
 check(name+' unique IDs',len({r['id'] for r in data['records']})==15)
for i,r in enumerate(e['records'],1):
 n=f'{i:02d}';check(n+' identity',r['id']==r['refinement_of']==f'world-event-{n}' and r['region_id']==f'region-{n}' and r['oath_id']==f'oath-{n}' and r['poi_id']==f'poi-{n}-event')
 check(n+' phases', [p['name'] for p in r['phases']]==['forecast','activation','response','resolution','reconstruction','cooldown'])
 check(n+' positive bounded timers',all(0<p['duration_ms']<=900000 for p in r['phases']))
 check(n+' predicate variables',set(re.findall(r'([a-z_]+) ==',r['success_predicate']))=={v['name'] for v in r['state_variables']})
 check(n+' public alternatives',all(x['binding_required'] is False for x in r['player_roles']))
 check(n+' source adapters disabled',all(x['enabled'] is False and x['status']=='PROPOSED_ADAPTER_DISABLED' for x in r['castable_interactions']))
 check(n+' fixed thresholds', 'fixed named success counts never change' in r['recovery']['low_participation'])
 check(n+' source evidence',all(x['source_line']>0 and x['source_path'].startswith('runtime/ability-matrix/') for x in r['castable_interactions']))
check('all event predicates distinct',len({x['success_predicate'] for x in e['records']})==15)
check('all event narratives distinct',len({x['narrative'] for x in e['records']})==15)
check('all ecological transects distinct',len({x['habitat_sequence'] for x in b['records']})==15)
report={'status':'PASS_STATIC_ONLY','checks_passed':len(checks),'checks':checks,'not_executed':['Source gameplay/GPU validation','Server simulation','Economic conservation runtime','Final terrain and navmesh playthrough','Accessibility player sessions','Performance profiling']}
(P/'validation'/'LIVING_WORLD_STATIC_CHECKS.json').write_text(json.dumps(report,indent=2)+'\n')
print(f'{len(checks)} checks passed; runtime and production gates remain open.')
