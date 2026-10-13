#!/usr/bin/env python3
"""Validate authored canon/data, never substitute for runtime, visual or founder review.
Usage: python AETHERION_CANON/19_VALIDATION/validate_canon.py --repo .
Requires jsonschema (requirements-validation.txt). Nonzero exit means a failing check.
"""
import argparse,collections,hashlib,itertools,json,pathlib,sys,re,urllib.parse
import jsonschema
p=argparse.ArgumentParser();p.add_argument('--repo',type=pathlib.Path,required=True);p.add_argument('--canon',type=pathlib.Path);p.add_argument('--output',type=pathlib.Path);args=p.parse_args()
repo=args.repo.resolve();root=(args.canon or repo/'AETHERION_CANON').resolve();checks=[];data={}
def check(id,ok,detail):checks.append({'id':id,'status':'PASS' if ok else 'FAIL','detail':detail})
def read(rel):
 try:return json.loads((root/rel).read_text())
 except Exception as e:check('load:'+rel,False,str(e));return {}
def walk(v,path=()):
 yield path,v
 if isinstance(v,dict):
  for k,x in v.items():yield from walk(x,path+(str(k),))
 elif isinstance(v,list):
  for i,x in enumerate(v):yield from walk(x,path+(str(i),))
for f in sorted(root.rglob('*.json')):
 if '/schemas/' in str(f) or f.name.startswith('CANON_VALIDATION'):continue
 try:data[str(f.relative_to(root))]=json.loads(f.read_text())
 except Exception as e:check('json:'+str(f.relative_to(root)),False,str(e))
check('json-parse',bool(data),f'{len(data)} JSON documents parsed; individual failures listed separately')
contracts={'source-asset-index':'10_ASSET_REGISTRY/SOURCE_ASSET_INDEX.json','source-inventory':'00_GOVERNANCE/SOURCE_INVENTORY.json','asset-registry':'10_ASSET_REGISTRY/MASTER_ASSET_REGISTRY.json','asset-dependencies':'10_ASSET_REGISTRY/ASSET_DEPENDENCIES.json','interaction-rules':'07_GAMEPLAY_SYSTEMS/INTERACTION_RULES.json','world-events':'13_WORLD_EVENTS/WORLD_EVENT_REGISTRY.json','creatures':'12_CREATURES_AND_MOUNTS/CREATURE_MOUNT_MORPH_REGISTRY.json','backlog':'20_PRODUCTION_ROADMAP/IMPLEMENTATION_BACKLOG.json','reference-index':'11_REFERENCE_SHEETS/REFERENCE_INDEX.json'}
for name,file in contracts.items():
 schema=read('00_GOVERNANCE/schemas/'+name+'.schema.json');d=data.get(file)
 if d is None:check('schema:'+name,False,'Missing '+file);continue
 errors=list(jsonschema.Draft202012Validator(schema).iter_errors(d));check('schema:'+name,not errors,[str(list(e.path))+': '+e.message for e in errors[:20]] or 'Field-level schema passed')
world_schema_map=read('00_GOVERNANCE/schemas/world-schema-map.json').get('mappings',[])
check('world-schema-map-coverage',len(world_schema_map)==13,'Thirteen strict world/narrative registry schemas required')
for mapping in world_schema_map:
 schema=read('00_GOVERNANCE/schemas/'+mapping['schema']);registry=data.get(mapping['registry'])
 errors=list(jsonschema.Draft202012Validator(schema).iter_errors(registry))
 check('schema:world:'+mapping['schema'],not errors,[str(list(e.path))+': '+e.message for e in errors[:15]] or 'Strict field-level world schema passed')
# Domain implementation contracts are design specifications, validated with their separately authored strict schema.
contract=data.get('18_IMPLEMENTATION_CONTRACTS/IMPLEMENTATION_CONTRACTS.json')
if contract is not None:
 schema=read('18_IMPLEMENTATION_CONTRACTS/schemas/implementation-contracts.schema.json');errors=list(jsonschema.Draft202012Validator(schema).iter_errors(contract));check('schema:implementation-contracts',not errors,[e.message for e in errors[:20]] or 'Strict proposed interface contract schema passed')
else:check('schema:implementation-contracts',False,'Missing implementation contracts')
# Every list-level id must be unique. Same entity may be referenced/described in separate registries.
for file,d in data.items():
 for path,v in walk(d):
  if isinstance(v,list) and v and all(isinstance(x,dict) and 'id' in x for x in v):
   ids=[x['id'] for x in v];dup=[x for x,n in collections.Counter(ids).items() if n>1];check('unique:'+file+':'+'.'.join(path),not dup,dup or f'{len(ids)} unique IDs')
trace=data.get('00_GOVERNANCE/SOURCE_TRACEABILITY.json',{}).get('records',[]);inv=data.get('00_GOVERNANCE/SOURCE_INVENTORY.json',{}).get('sources',[])
sourceids={x['id'] for x in trace}|{x['source_id'] for x in inv}
unknown=[]
for file,d in data.items():
 for path,v in walk(d):
  if isinstance(v,dict) and isinstance(v.get('source_ids'),list):
   for s in v['source_ids']:
    if s not in sourceids:unknown.append(file+':'+'.'.join(path)+':'+str(s))
check('source-traceability',not unknown,unknown[:40] or f'{len(sourceids)} declared sources; all source_ids resolve')
entities=data.get('01_WORLD_BIBLE/ENTITY_CONTRACT.json',{}).get('records',[])
locked=['KILN OATH','RIME ARCHIVE','STORM RELAY','TIDAL COVENANT','FAULT CHOIR','REED RESONANCE','GRAFT SANCTUARY','BITTERGLASS GUILD','OATH OF DAYBREAK','TIDAL OBSERVATORY','THE MISSING COURT','SANGUINE COVENANT','FOLDED THEATRE','ESCAPEMENT ROAD','IMPULSE FOUNDRY']
check('exact-fifteen-oaths',len(entities)==15 and [x.get('oath_name','').upper() for x in entities]==locked,'Founder order and names must match exactly')
oaths={x['oath_id'] for x in entities};regions={x['region_id'] for x in entities};neighbors={x['region_id']:set(x.get('neighbor_ids',[])) for x in entities};bad=[(a,b) for a,bs in neighbors.items() for b in bs if b not in neighbors or a not in neighbors[b]]
check('symmetric-borders',not bad,bad or 'All conceptual borders reciprocal')
visited=set();todo=list(regions)[:1]
while todo:
 x=todo.pop()
 if x not in visited:visited.add(x);todo+=list(neighbors.get(x,set())-visited)
check('continuous-continent',visited==regions and len(regions)==15,f'{len(visited)}/15 regions reachable via land adjacency')
unknown=[]
for file,d in data.items():
 for path,v in walk(d):
  if isinstance(v,dict):
   for field,valid in [('oath_id',oaths),('region_id',regions)]:
    if field in v and v[field] is not None and v[field] not in valid:unknown.append((file,'.'.join(path),field,v[field]))
   if isinstance(v.get('oath_ids'),list):
    for x in v['oath_ids']:
     if x not in oaths:unknown.append((file,'.'.join(path),'oath_ids',x))
check('oath-region-references',not unknown,unknown[:40] or 'All declared oath/region references resolve')
interactions=data.get('07_GAMEPLAY_SYSTEMS/INTERACTION_RULES.json',{}).get('records',[]);pairs=[tuple(sorted(x.get('oath_ids',[]))) for x in interactions];expected=set(itertools.combinations_with_replacement(sorted(oaths),2))
check('all-element-pairs',len(pairs)==120 and len(set(pairs))==120 and set(pairs)==expected,'120 unique unordered pairs including 15 self-pairs')
directions=[v for r in interactions for v in r.get('directed_effects',[])];keys=[v.get('transition_key') for v in directions]
check('directional-interaction-coverage',len(directions)==225 and len(set(keys))==225,'225 individually identified directed transitions, each checked by field schema')
assets=data.get('10_ASSET_REGISTRY/MASTER_ASSET_REGISTRY.json',{}).get('records',[]);assetids={x['id'] for x in assets};deps=data.get('10_ASSET_REGISTRY/ASSET_DEPENDENCIES.json',{}).get('records',[])
bad=[e for e in deps if e.get('from_id') not in assetids or e.get('to_id') not in assetids];check('asset-dependency-targets',not bad,bad[:10] or f'{len(deps)} edges resolve')
graph=collections.defaultdict(list)
for e in deps:graph[e['from_id']].append(e['to_id'])
state={};cycles=[]
def visit(x):
 if state.get(x)==1:cycles.append(x);return
 if state.get(x)==2:return
 state[x]=1
 for y in graph[x]:visit(y)
 state[x]=2
for x in assetids:visit(x)
check('asset-dependency-dag',not cycles,cycles[:10] or 'No production prerequisite cycle')
refs=data.get('11_REFERENCE_SHEETS/REFERENCE_INDEX.json',{}).get('records',[]);check('reference-count',len(inv)==len(refs)==114,f'inventory {len(inv)} / reference index {len(refs)}')
bad=[]
for x in inv:
 f=repo/x['reference_path']
 if not f.is_file():bad.append(x['id']+': missing')
 elif hashlib.sha256(f.read_bytes()).hexdigest()!=x['sha256']:bad.append(x['id']+': hash mismatch')
check('reference-file-hashes',not bad,bad or '114 original PNG byte hashes match inventory')
# Only physical references may be Referenced; conceptual requirements may not claim finished production.
bad=[x['id'] for x in assets if x.get('record_kind') in ['production_requirement','production_family_requirement','reference_image'] and x.get('production_status') in ['Implemented','Validated']]
check('no-concept-implementation-claims',not bad,bad or 'Concept requirements do not assert implementation')
source_assets=data.get('10_ASSET_REGISTRY/SOURCE_ASSET_INDEX.json',{});source_records=source_assets.get('records',[])
screenshot_bad=[r['id'] for r in source_records if 'source_screenshot' in r.get('asset_kinds',[]) and (r.get('production_status')!='Referenced' or r.get('delivery_tier')!='concept' or r.get('validation',{}).get('production_validation') is not False)]
check('source-screenshot-status',not screenshot_bad,screenshot_bad or 'Source screenshots remain Referenced/concept; file presence does not implement an effect')
path_bad=[];hash_bad=[]
for r in source_records:
 if r.get('path_count')!=len(r.get('source_paths',[])) or len(r.get('source_paths',[]))!=len(r.get('repository_paths',[])):path_bad.append(r['id'])
 if r.get('primary_sandbox_asset_id') is not None and r['primary_sandbox_asset_id'] not in assetids:path_bad.append(r['id']+':unknown primary asset')
 for source_path,repository_path in zip(r.get('source_paths',[]),r.get('repository_paths',[])):
  if repository_path!='runtime/ability-matrix/'+source_path:path_bad.append(r['id']+':source path mismatch')
  f=repo/repository_path
  if not f.is_file() or f.stat().st_size!=r['size_bytes'] or hashlib.sha256(f.read_bytes()).hexdigest()!=r['sha256']:hash_bad.append(repository_path)
check('source-asset-index-paths',not path_bad,path_bad[:20] or 'All grouped source paths and primary asset references resolve')
check('source-asset-index-hashes',not hash_bad,hash_bad[:20] or 'All indexed source asset bytes match grouped SHA-256 and size')
evidence_bad=[]
for r in source_records:
 if r.get('production_status')=='Implemented' and not r.get('validation',{}).get('implementation_evidence'):evidence_bad.append(r['id']+':missing implementation evidence')
 for evidence in r.get('validation',{}).get('implementation_evidence',[]):
  f=repo/evidence['repository_path']
  if not f.is_file():evidence_bad.append(r['id']+':missing evidence path');continue
  lines=f.read_text(errors='replace').splitlines();n=evidence['line']
  if n<1 or n>len(lines) or not all(literal in lines[n-1] for literal in evidence['matched_literals']):evidence_bad.append(r['id']+':evidence literal or line mismatch')
check('source-asset-implementation-evidence',not evidence_bad,evidence_bad[:20] or 'Implemented source identities have resolvable static loader/UI/support evidence; no runtime inference')
counts=source_assets.get('counts',{})
check('source-asset-index-counts',len(source_records)==counts.get('unique_byte_identities') and sum(r.get('path_count',0) for r in source_records)==counts.get('source_asset_paths'),'Declared unique-identity and source-path counts match records')
try:
 cast=json.loads((repo/'CASTABLE_REGISTRY.json').read_text());schema=read('00_GOVERNANCE/schemas/castable-source.schema.json');errors=list(jsonschema.Draft202012Validator(schema).iter_errors(cast));check('castable-source-schema',not errors,[e.message for e in errors[:10]] or 'Preserved source schema valid');uids=[x['uid'] for x in cast['castables']];check('castable-unique-count',len(uids)==len(set(uids))==100,f'{len(uids)} records / {len(set(uids))} IDs')
 links=data.get('11_REFERENCE_SHEETS/REFERENCE_CASTABLE_LINKS.json',{}).get('records',[]);bad=[x['id'] for x in links if x.get('castable_uid') not in set(uids)];check('reference-castable-links',not bad,bad or f'{len(links)} reference links resolve to actual castable UIDs')
except Exception as e:check('castable-registry-load',False,str(e))
# Cross-registry identity and authored dependency checks, independent of document headings.
realms=data.get('03_GEOGRAPHY/REALM_REGISTRY.json',{}).get('records',[]);realmmap={r['id']:r for r in realms}
world=data.get('03_GEOGRAPHY/WORLD_GRAPH.json',{});worldmap={r['id']:r for r in world.get('records',[])}
pois=data.get('03_GEOGRAPHY/WORLD_POI_REGISTRY.json',{}).get('records',[]);poimap={r['id']:r for r in pois}
characters=data.get('05_FACTIONS_AND_CHARACTERS/CHARACTER_REGISTRY.json',{}).get('records',[]);charmap={r['id']:r for r in characters}
factions=data.get('05_FACTIONS_AND_CHARACTERS/FACTION_REGISTRY.json',{}).get('records',[]);factionmap={r['id']:r for r in factions}
quests=data.get('06_NARRATIVE/QUEST_REGISTRY.json',{}).get('records',[]);questmap={r['id']:r for r in quests}
creaturemap={r['id']:r for r in data.get('12_CREATURES_AND_MOUNTS/CREATURE_MOUNT_MORPH_REGISTRY.json',{}).get('records',[])}
basins={r['id'] for r in world.get('drainage_networks',[])}
errors=[]
for e in entities:
 rid=e['region_id'];r=realmmap.get(rid,{});g=worldmap.get(rid,{})
 if not r or not g or r.get('oath_id')!=e['oath_id'] or g.get('oath_id')!=e['oath_id'] or r.get('capital_id')!=e['capital_id'] or g.get('capital_id')!=e['capital_id'] or set(r.get('neighbor_ids',[]))!=set(e['neighbor_ids']) or set(g.get('neighbor_ids',[]))!=set(e['neighbor_ids']):errors.append(rid)
check('world-registry-identity-agreement',not errors,errors or 'Entity, realm and world graph agree on all fifteen Oaths, capitals and borders')
errors=[]
for r in realms:
 for field in ['capital_id']:
  if r.get(field) not in poimap:errors.append(r['id']+':'+field)
 for field in ['settlement_ids','dungeon_ids','event_location_ids']:
  for id in r.get(field,[]):
   if id not in poimap or poimap[id]['region_id']!=r['id']:errors.append(r['id']+':'+field+':'+id)
 for id in [r.get('leader_id')]+r.get('civilian_character_ids',[]):
  if id not in charmap:errors.append(r['id']+':character:'+str(id))
 if r.get('faction_id') not in factionmap or r.get('regional_quest_id') not in questmap:errors.append(r['id']+':faction or quest')
 if not set(r.get('drainage_basin_ids',[]))<=basins:errors.append(r['id']+':basin')
check('realm-civic-cross-references',not errors,errors or 'Realm settlements, dungeons, event locations, people, institutions, quests and watersheds resolve')
routes=data.get('03_GEOGRAPHY/TRADE_ROUTES.json',{}).get('records',[]);routemap={r['id']:r for r in routes};errors=[]
for r in routes:
 for side in ['from','to']:
  pid=r[side+'_poi_id'];rid=r[side+'_region_id']
  if rid not in realmmap or pid not in poimap or poimap[pid]['region_id']!=rid:errors.append(r['id']+':'+side)
for edge in world.get('edges',[]):
 route=routemap.get(edge.get('route_id'),{})
 if not route or edge.get('from_region_id')!=route.get('from_region_id') or edge.get('to_region_id')!=route.get('to_region_id'):errors.append(edge['id'])
check('world-route-endpoint-references',not errors,errors or 'Graph edges and named route/POI endpoints agree')
settlements={b['id'] for q in quests for b in q.get('branches',[])};errors=[]
for c in characters:
 if c.get('faction_id') is not None and c['faction_id'] not in factionmap:errors.append(c['id']+':faction')
 for rel in c.get('relationships',[]):
  if rel.get('character_id') not in charmap:errors.append(c['id']+':relationship')
 for branch in c.get('branch_outcomes',[]) if isinstance(c.get('branch_outcomes'),list) else []:
  if isinstance(branch,dict) and branch.get('settlement_choice_id') not in settlements:errors.append(c['id']+':settlement choice')
for f in factions:
 for key in ['leadership_id','civic_counterpoint_id']:
  if f.get(key) not in charmap:errors.append(f['id']+':'+key)
 if f.get('regional_quest_id') not in questmap:errors.append(f['id']+':quest')
service_records=data.get('05_FACTIONS_AND_CHARACTERS/CHARACTER_SERVICE_REGISTRY.json',{}).get('records',[]);service_ids={record['id'] for record in service_records}
source_by_uid={record['uid']:record for record in cast.get('castables',[])} if 'cast' in globals() else {}
for c in characters:
 for service_id in c.get('service_ids',[]):
  if service_id not in service_ids:errors.append(c['id']+':service:'+service_id)
 for outcome in c.get('supporting_choice_outcomes',[]):
  quest=questmap.get(outcome.get('quest_id'),{})
  if not quest or outcome.get('quest_choice_id') not in {branch['id'] for branch in quest.get('branches',[])}:errors.append(c['id']+':supporting choice')
 for ability in c.get('ability_references',[]):
  if ability.get('castable_uid') not in source_by_uid:errors.append(c['id']+':unknown source castable')
for service in service_records:
 for _,node in walk(service):
  if not isinstance(node,dict):continue
  if 'character_id' in node and node['character_id'] not in charmap:errors.append(service['id']+':character')
  if 'quest_id' in node and node['quest_id'] not in questmap:errors.append(service['id']+':quest')
check('character-faction-settlement-crossrefs',not errors,errors or 'Individual character outcomes link to authored settlement choices and faction roles')
errors=[]
for q in quests:
 for field,valid in [('required_quest_ids',questmap),('involved_character_ids',charmap),('poi_ids',poimap),('region_ids',realmmap)]:
  for id in q.get(field,[]):
   if id not in valid:errors.append(q['id']+':'+field+':'+id)
 if q.get('encounter_id') is not None and q['encounter_id'] not in creaturemap:errors.append(q['id']+':encounter')
for q in quests:
 for conditional in q.get('conditional_required_quest_ids',[]):
  for id in conditional.get('quest_ids',[]):
   if id not in questmap:errors.append(q['id']+':conditional predecessor:'+id)
promise_ids={record['id'] for q in quests for record in q.get('promise_records',[])}
relationships=data.get('05_FACTIONS_AND_CHARACTERS/RELATIONSHIP_GRAPH.json',{}).get('records',[])
for relationship in relationships:
 for id in relationship.get('promise_ids',[]):
  if id not in promise_ids:errors.append(relationship['id']+':promise:'+id)
check('quest-external-and-internal-crossrefs',not errors,errors or 'Quests resolve actual characters, regions, POIs, predecessors and proposed creature encounter records')
producers={flag for q in quests for _,v in walk(q) if isinstance(v,dict) for flag in v.get('grants_flags',[])}
endings=data.get('06_NARRATIVE/ENDING_PREREQUISITES.json',{}).get('records',[]);errors=[]
for ending in endings:
 for flag in ending.get('required_flags',[])+ending.get('required_interface_attestations',[]):
  if flag not in producers:errors.append(ending['id']+':'+flag)
check('ending-flags-have-authored-producers',not errors,errors or 'Every required ending flag/attestation has at least one actual quest producer; reachability separately exercised by world validator')
events=data.get('13_WORLD_EVENTS/WORLD_EVENT_REGISTRY.json',{}).get('records',[])
check('event-location-crossrefs',all(e.get('poi_id') in poimap and poimap[e['poi_id']]['region_id']==e['region_id'] for e in events),'All fifteen event definitions reference the correct regional event POI')
manifest=data.get('00_GOVERNANCE/DELIVERABLE_MANIFEST.json',{}).get('records',[])
missing=[]
for delivery in manifest:
 for rel in delivery['paths']:
  target=(root/rel)
  if rel.startswith('../'):target=repo/rel[3:]
  elif rel.startswith('08_ABILITY_MATRIX/') and not target.exists():target=repo/'AETHERION_CANON'/rel
  if not target.is_file():missing.append(delivery['id']+':'+rel)
check('deliverable-file-presence',len(manifest)==28 and not missing,missing or '28 requested artifact families have their mandatory paths; presence is not semantic approval')
backlog=data.get('20_PRODUCTION_ROADMAP/IMPLEMENTATION_BACKLOG.json',{}).get('records',[]);workmap={r['id']:r for r in backlog}
bad=[(r['id'],d) for r in backlog for d in r.get('depends_on',[]) if d not in workmap]
check('backlog-dependency-targets',not bad,bad or f'{len(backlog)} work items have resolvable dependency targets')
workstate={};workcycles=[]
def work_visit(id):
 if workstate.get(id)==1:workcycles.append(id);return
 if workstate.get(id)==2:return
 workstate[id]=1
 for d in workmap.get(id,{}).get('depends_on',[]):
  if d in workmap:work_visit(d)
 workstate[id]=2
for id in workmap:work_visit(id)
check('backlog-dependency-dag',not workcycles,workcycles or 'No production work prerequisite cycle')
link_errors=[];links_checked=0
markdowns=list(root.rglob('*.md'))+[repo/x for x in ['README.md','CANON_INDEX.md','ELEMENTAL_INTERACTION_MATRIX.md','ABILITY_MATRIX_INTEGRATION.md','CASTABLE_MIGRATION_REPORT.md','CASTABLE_VALIDATION_REPORT.md'] if (repo/x).exists()]
for file in markdowns:
 text=file.read_text();text=re.sub(r'```.*?```','',text,flags=re.S)
 for raw in re.findall(r'!?\[[^\]]*\]\(([^)]+)\)',text):
  target=raw.strip().split(' "',1)[0].strip('<>')
  if not target or target.startswith(('#','http://','https://','mailto:','data:','urn:')):continue
  target=urllib.parse.unquote(target.split('#',1)[0].split('?',1)[0])
  if not target:continue
  links_checked+=1;resolved=(file.parent/target).resolve()
  if not resolved.exists():link_errors.append(str(file.relative_to(repo) if file.is_relative_to(repo) else file.relative_to(root))+':'+target)
check('relative-document-links',not link_errors,link_errors[:50] or f'{links_checked} local Markdown link targets exist; remote URLs and anchor spelling are outside this file-integrity gate')
private_locator_pattern=re.compile(r'https?://(?:[^/\s]+\.)?chatgpt\.com/[^\s<>]+|\b(?:libfile_[A-Za-z0-9_-]+|Sentinel_[A-Za-z0-9_-]+)\b',re.I)
private_fields={'source_file_id','library_file_id','library_path','original_library_path','source_conversation_url','message_id','user_message_id','public_sharing_approval_message_id','generation_history'}
privacy_errors=[]
for file,d in data.items():
 for path,v in walk(d):
  if isinstance(v,str) and private_locator_pattern.search(v):privacy_errors.append(file+':'+'.'.join(path)+':private locator')
  if isinstance(v,dict):
   for key in private_fields.intersection(v):privacy_errors.append(file+':'+'.'.join(path)+':private metadata field '+key)
for file in markdowns:
 if private_locator_pattern.search(file.read_text()):privacy_errors.append(str(file.relative_to(repo) if file.is_relative_to(repo) else file.relative_to(root))+':private locator')
check('public-provenance-minimization',not privacy_errors,privacy_errors[:30] or 'Authored public metadata contains no detected private ChatGPT/Library locators, message/file identifiers or retrieval fields; owner-side originals retained separately')
checks += [{'id':'gpu-visual-parity','status':'SKIPPED','detail':'Requires functioning WebGL renderer and source-matched visual comparisons; no pass inferred from CPU tests.'},{'id':'founder-proposed-canon-approval','status':'HUMAN_REVIEW','detail':'New lore, systems, topology, art extensions and balances remain PROPOSED.'},{'id':'art-final-production-approval','status':'HUMAN_REVIEW','detail':'Public sharing permission does not establish individual final-art approval, mesh/rig/animation or performance validation.'}]
report={'schema_version':'1.0.0','validation_scope':'Static canon schemas, identity, topology, references and file integrity only','counts':dict(collections.Counter(x['status'] for x in checks)),'checks':checks}
out=args.output or root/'19_VALIDATION/CANON_VALIDATION_REPORT.json';out.parent.mkdir(parents=True,exist_ok=True);out.write_text(json.dumps(report,indent=2)+'\n');print(json.dumps(report['counts']));
for c in checks:
 if c['status']=='FAIL':print(c['id'],str(c['detail'])[:1200])
sys.exit(any(c['status']=='FAIL' for c in checks))
