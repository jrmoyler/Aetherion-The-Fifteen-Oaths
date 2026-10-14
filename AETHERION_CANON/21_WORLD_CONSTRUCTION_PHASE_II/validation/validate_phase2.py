#!/usr/bin/env python3
"""Independent static contract validation. Requires Python 3 and jsonschema.
Usage: python validation/validate_phase2.py [--baseline-repo PATH] [--source-repo PATH]
Static passes do not certify terrain, playability, production assets or performance.
"""
import argparse,collections,copy,datetime,hashlib,json,math,pathlib,re,subprocess,sys
import jsonschema
ROOT=pathlib.Path(__file__).resolve().parents[1]
REQUIRED=['CONTINENT_MASTER_PLAN.md','CONTINENT_GEOGRAPHY.md','CONTINENT_MAP_SPECIFICATION.md','WORLD_REGION_GRAPH.json','FIFTEEN_REGION_BLUEPRINTS','CAPITAL_CITY_BLUEPRINTS','SETTLEMENT_REGISTRY.json','WORLD_POI_REGISTRY.json','TRANSPORTATION_NETWORK.md','REGIONAL_BIOME_SPECIFICATIONS.md','WORLD_ECOLOGY_SYSTEM.md','DYNAMIC_WEATHER_SYSTEM.md','NPC_CIVILIZATION_SYSTEM.md','WORLD_EVENT_REGISTRY.json','DUNGEON_AND_EXPLORATION_PLAN.md','ARCHITECTURAL_KIT_REGISTRY.json','ENVIRONMENT_ASSET_REGISTRY.json','WORLD_STREAMING_ARCHITECTURE.md','WORLD_CONSTRUCTION_ROADMAP.md','CANON_ALIGNMENT_AND_GAP_REPORT.md']
def walk(x,path=''):
 yield path,x
 if isinstance(x,dict):
  for k,v in x.items():yield from walk(v,path+'/'+k)
 elif isinstance(x,list):
  for i,v in enumerate(x):yield from walk(v,path+'/'+str(i))
def connected(nodes,edges,removed=None):
 if not nodes:return False
 adj=collections.defaultdict(set)
 for e in edges:
  if e.get('id')==removed:continue
  a,b=e['from_region_id'],e['to_region_id'];adj[a].add(b);adj[b].add(a)
 seen=set();todo=[next(iter(nodes))]
 while todo:
  n=todo.pop()
  if n not in seen:seen.add(n);todo.extend(adj[n]-seen)
 return set(nodes)<=seen
def acyclic(edges):
 adj=collections.defaultdict(set)
 for a,b in edges:adj[a].add(b)
 visiting=set();done=set()
 def visit(n):
  if n in visiting:return False
  if n in done:return True
  visiting.add(n)
  if not all(visit(v) for v in adj.get(n,())):return False
  visiting.remove(n);done.add(n);return True
 return all(visit(n) for n in list(adj))
def run(root=ROOT,baseline_repo=None,source_repo=None,write=True):
 checks=[]
 def check(name,ok,detail='',status=None):checks.append({'check':name,'status':status or ('PASS' if ok else 'FAIL'),'detail':detail})
 base=json.loads((root/'validation/baseline_contract.json').read_text())
 files={p.relative_to(root).as_posix():p for p in root.rglob('*') if p.is_file()}
 for n in REQUIRED:check('deliverable:'+n,(root/n).exists())
 for n in ['FIFTEEN_REGION_BLUEPRINTS','CAPITAL_CITY_BLUEPRINTS']:
  docs=list((root/n).glob('*.md'));check('document_count:'+n,len(docs)==15,f'{len(docs)}; expected 15')
 data={};schemas={}
 for name,p in files.items():
  if p.suffix!='.json' or name.startswith('validation/'):continue
  try:
   d=json.loads(p.read_text(),parse_constant=lambda value: (_ for _ in ()).throw(ValueError('Non-finite JSON number: '+value)));(schemas if name.startswith('schemas/') else data)[name]=d
  except Exception as e:check('json_parse:'+name,False,str(e))
 for name,s in schemas.items():
  try:jsonschema.Draft202012Validator.check_schema(s);check('schema_valid:'+name,True)
  except Exception as e:check('schema_valid:'+name,False,str(e))
  loose=[p for p,x in walk(s) if isinstance(x,dict) and x.get('type')=='object' and x.get('additionalProperties') is not False]
  check('schema_strict:'+name,not loose,', '.join(loose))
 for name,d in data.items():
  stem=pathlib.Path(name).stem.lower().replace('_','-')
  candidates=[(n,s) for n,s in schemas.items() if pathlib.Path(n).name.lower().replace('.schema.json','').replace('_schema.json','').replace('.json','').replace('_','-') in [stem,stem.removesuffix('-registry')]]
  if not candidates:
   candidates=[(n,s) for n,s in schemas.items() if s.get('x-registry')==name]
  check('schema_present:'+name,len(candidates)==1,', '.join(n for n,_ in candidates))
  if len(candidates)==1:
   errors=list(jsonschema.Draft202012Validator(candidates[0][1]).iter_errors(d))
   check('schema_instance:'+name,not errors,'; '.join('/'.join(map(str,e.path))+': '+e.message for e in errors[:20]))
  if isinstance(d,dict) and 'records' in d and name != 'SOURCE_INVENTORY.json':
   check('envelope:'+name,d.get('schema_version')=='1.0.0' and d.get('canon_status')=='PROPOSED')
   rs=d['records'];check('records_nonempty:'+name,bool(rs))
   check('record_metadata:'+name,all(isinstance(r,dict) and r.get('id') and r.get('canon_status')=='PROPOSED' and r.get('source_ids') for r in rs))
   check('unique_ids:'+name,len({r.get('id') for r in rs})==len(rs))
 known=set(base['known_baseline_ids'])|{'P2-SRC-FOUNDATION','P2-SRC-DIRECTIVE','P2-SRC-PROPOSAL'}
 for d in data.values():
  known.update(x['id'] for _,x in walk(d) if isinstance(x,dict) and isinstance(x.get('id'),str))
 refs=[]
 id_prefixes={re.sub(r'-[^-]+$','',i) for i in known if '-' in i}
 for name,d in data.items():
  for p,x in walk(d):
   if isinstance(x,str) and re.fullmatch(r'(?:p2-[a-z0-9-]+|region-\d+|oath-\d+|poi-[a-z0-9-]+|route-\d+-\d+|basin-[a-z-]+|REF-\d+|P2-SRC-[A-Z-]+|character-[a-z0-9-]+|economy-\d+|recipe-\d+|world-event-\d+|castable-world-[a-z0-9-]+|contract-[a-z0-9-]+|asset-[a-z0-9-]+)',x) and x not in known:refs.append(name+p+'='+x)
 check('cross_references_resolve',not refs,'; '.join(refs[:40]))
 source_unknown=[name+p+': '+v for name,d in data.items() for p,x in walk(d) if isinstance(x,dict) for v in x.get('source_ids',[]) if v not in known]
 check('source_ids_resolve',not source_unknown,'; '.join(source_unknown[:30]))
 graph=data.get('WORLD_REGION_GRAPH.json',{});rs=graph.get('records',[]);edges=graph.get('edges',[])
 check('exact_fifteen_regions',{r.get('id') for r in rs}=={f'region-{i:02d}' for i in range(1,16)})
 check('exact_fifteen_oaths',{r.get('oath_id') for r in rs}=={f'oath-{i:02d}' for i in range(1,16)})
 old={r['id']:r for r in base['regions']};new={r.get('id'):r for r in rs}
 check('baseline_capitals_preserved',all(new.get(i,{}).get('capital_id')==r['capital_id'] for i,r in old.items()))
 check('baseline_adjacencies_preserved',{(e['id'],e['from_region_id'],e['to_region_id']) for e in edges}=={(e['id'],e['from_region_id'],e['to_region_id']) for e in base['edges']})
 check('land_connected',connected(set(new),edges))
 check('single_edge_loss_connected',bool(edges) and all(connected(set(new),edges,e['id']) for e in edges))
 pois=data.get('WORLD_POI_REGISTRY.json',{}).get('records',[]);np={r['id']:r for r in pois}
 check('baseline_63_pois_preserved',len(base['pois'])==63 and all(i['id'] in np and all(np[i['id']].get(k)==v for k,v in i.items()) for i in base['pois']))
 basins=graph.get('drainage_networks',[]);nb={b['id']:b for b in basins}
 check('baseline_four_basins_preserved',len(basins)==4 and all(nb.get(b['id'],{}).get('river_region_sequence')==b['river_region_sequence'] for b in base['basins']))
 edge_pairs={frozenset([e['from_region_id'],e['to_region_id']]) for e in edges}
 for b in basins:
  seq=b.get('river_region_sequence',[]);stations=b.get('channel_stations',[]);heights=[x.get('target_elevation_m') for x in stations]+[b.get('terminal_ocean_target_m')]
  check('drainage_adjacency:'+b['id'],all(frozenset([a,z]) in edge_pairs for a,z in zip(seq,seq[1:])))
  check('conceptual_downhill:'+b['id'],[x.get('region_id') for x in stations]==seq and all(isinstance(x,(int,float)) for x in heights) and all(a>z for a,z in zip(heights,heights[1:])))
 routes=data.get('TRANSPORT_ROUTE_REGISTRY.json',{}).get('records',[])
 check('ordinary_route_coverage',{r.get('baseline_route_id') for r in routes}=={e['id'] for e in edges})
 edge_by_pair={frozenset([e['from_region_id'],e['to_region_id']]):e['id'] for e in edges}
 for r in routes:
  check('ordinary_access:'+r['id'],r.get('ordinary_oath_requirement')=='NONE' and 'walkable_routes' in r.get('baseline_modes',[]) and bool(r.get('protected_local_bypass')))
  seq=r.get('detour_region_ids',[]);pairs=[frozenset([a,z]) for a,z in zip(seq,seq[1:])]
  check('detour:'+r['id'],len(seq)>=3 and seq[0]==r.get('from_region_id') and seq[-1]==r.get('to_region_id') and all(q in edge_by_pair and edge_by_pair[q]!=r.get('baseline_route_id') for q in pairs) and r.get('detour_baseline_route_ids')==[edge_by_pair.get(q) for q in pairs])
 deps=[]
 for name,d in data.items():
  for _,x in walk(d):
   if isinstance(x,dict) and 'id' in x and isinstance(x.get('dependencies'),list):
    deps.extend((x['id'],z) for z in x['dependencies'] if isinstance(z,str))
 check('dependency_graph_acyclic',acyclic(deps+base.get('asset_dependency_edges',[])),f'{len(deps)} package prerequisite edges plus {len(base.get("asset_dependency_edges",[]))} foundation prerequisite edges checked; semantic association links excluded.')
 events=data.get('WORLD_EVENT_REGISTRY.json',{}).get('records',[])
 event_fields=['trigger','location','narrative','phases','npc_roles','player_roles','castable_interactions','failure_predicate','success_predicate','rewards','consequences','reset','recovery']
 check('event_field_coverage',len(events)>=15 and all(all(r.get(k) for k in event_fields) for r in events))
 check('event_ordinary_player_roles',bool(events) and all(any(v.get('binding_required') is False for v in r.get('player_roles',[])) for r in events))
 check('event_adapters_not_implemented',bool(events) and all(v.get('enabled') is False and v.get('status')=='PROPOSED_ADAPTER_DISABLED' for r in events for v in r.get('castable_interactions',[])))
 check('event_regional_distinction',len({r.get('success_predicate') for r in events})==15 and len({r.get('narrative') for r in events})==15)
 ecology=data.get('REGIONAL_ECOLOGY_PROFILES.json',{}).get('records',[])
 ecology_fields=['substrate','habitat_sequence','seasonal_cycle','land_use_loop','pressure','migration','recovery']
 check('ecology_field_coverage',len(ecology)==15 and all(all(len(str(r.get(k,'')))>=20 for k in ecology_fields) for r in ecology))
 check('ecology_regional_distinction',len(ecology)==15 and all(len({r.get(k) for r in ecology})>=12 for k in ecology_fields))
 if baseline_repo:
  missing_source=[]
  for name,d in data.items():
   for p,x in walk(d):
    if '/source_refs/' in p and isinstance(x,str) and not '://' in x:
     rel=x.split('#')[0]
     if not (pathlib.Path(baseline_repo)/rel).exists() and not (root/rel).exists():missing_source.append(name+': '+x)
  check('source_reference_paths',not missing_source,'; '.join(missing_source[:30]))
 else:check('source_reference_paths',None,'Supply --foundation to check baseline source paths.','SKIPPED')
 kits=data.get('ARCHITECTURAL_KIT_REGISTRY.json',{}).get('records',[]);assets=data.get('ENVIRONMENT_ASSET_REGISTRY.json',{}).get('records',[])
 check('architecture_fifteen_oaths',len(kits)==15 and {r.get('oath_id') for r in kits}=={f'oath-{i:02d}' for i in range(1,16)})
 family_set={'terrain','geology','vegetation','bridges','roads','walls','residential','shops','workshops','institutions','towers','interiors','dungeons','clutter','vehicles','transit','wildlife','environment-vfx','weather-vfx','mechanisms','destructible','housing','lighting','materials'}
 check('asset_family_coverage',family_set<={r.get('family_category') for r in assets})
 asset_fields=['id','purpose','reference_evidence','construction','proposed_physical_scale','materials','variants','collision','animation','lod','interactions','dependencies','priority']
 check('asset_required_fields',bool(kits) and bool(assets) and all(all((k in r and isinstance(r[k],list)) if k=='dependencies' else bool(r.get(k)) for k in asset_fields) for r in kits+assets))
 check('assets_not_implemented',bool(kits) and bool(assets) and all(r.get('status')=='PROPOSED_NOT_BUILT' for r in kits+assets))
 check('architecture_distinct_construction',len(kits)==15 and len({r.get('construction') for r in kits})==15 and len({tuple(r.get('signature_modules',[])) for r in kits})==15)
 prototypes=data.get('STREAMING_PROTOTYPE_CONTRACTS.json',{}).get('records',[])
 check('prototype_tests_not_executed',len(prototypes)>=10 and all(r.get('acceptance_status')=='SPECIFIED_NOT_EXECUTED' and r.get('interface_status')=='PROPOSED_NOT_EXISTING_API' for r in prototypes))
 reference_evidence=data.get('ENVIRONMENT_REFERENCE_EVIDENCE.json',{}).get('records',[])
 check('reference_evidence_114',len(reference_evidence)==114 and {r.get('id') for r in reference_evidence}==set(base['reference_source_ids']) and all(r.get('decode_verified') and r.get('baseline_hash_match') and not r.get('copied_into_package') for r in reference_evidence))
 check('reference_review_scope_honest',len(reference_evidence)==114 and sum(r.get('direct_visual_review_this_phase') is True for r in reference_evidence)==15 and all(r.get('review_depth') and r.get('limitations') for r in reference_evidence))
 if baseline_repo:
  hash_errors=[]
  for r in reference_evidence:
   f=pathlib.Path(baseline_repo)/r.get('repository_path','')
   if not f.is_file() or hashlib.sha256(f.read_bytes()).hexdigest()!=r.get('sha256'):hash_errors.append(r.get('id'))
  check('reference_hashes_independently_verified',len(reference_evidence)==114 and not hash_errors,', '.join(hash_errors))
  inventory=data.get('SOURCE_INVENTORY.json',{}).get('files',[]);bad=[]
  for r in inventory:
   f=pathlib.Path(baseline_repo)/r.get('path','')
   if not f.is_file() or hashlib.sha256(f.read_bytes()).hexdigest()!=r.get('sha256'):bad.append(r.get('path'))
  check('source_inventory_hashes_verified',bool(inventory) and not bad,'; '.join(bad))
 else:
  check('reference_hashes_independently_verified',None,'Supply baseline repository to recompute hashes.','SKIPPED')
  check('source_inventory_hashes_verified',None,'Supply baseline repository to recompute hashes.','SKIPPED')
 capitals=data.get('CAPITAL_LAYOUT_REGISTRY.json',{}).get('records',[])
 check('capital_layout_coverage',len(capitals)==15 and {r.get('capital_id') for r in capitals}=={r['capital_id'] for r in base['regions']})
 for c in capitals:
  districts={d['id']:d for d in c.get('districts',[])};ce=c.get('adjacency_edges',[]);pairs={frozenset([e['from_district_id'],e['to_district_id']]) for e in ce};seq=c.get('service_route_district_ids',[])
  check('capital_service_path:'+c['id'],len(seq)>=2 and all(x in districts for x in seq) and all(frozenset([a,b]) in pairs for a,b in zip(seq,seq[1:])))
  converted=[{'id':str(i),'from_region_id':e['from_district_id'],'to_region_id':e['to_district_id']} for i,e in enumerate(ce)]
  check('capital_connected:'+c['id'],connected(set(districts),converted))
  check('capital_adjacency_consistent:'+c['id'],all(set(d.get('adjacent_district_ids',[]))=={next(iter(pair-{i})) for pair in pairs if i in pair and len(pair)==2} for i,d in districts.items()))
  check('capital_interior_parents:'+c['id'],all(v.get('parent_district_id') in districts for v in c.get('interiors',[])))
  check('capital_refuge_resolves:'+c['id'],c.get('public_refuge_district_id') in districts)
 settlements=data.get('SETTLEMENT_REGISTRY.json',{}).get('records',[])
 check('settlement_roles_by_region',all({'capital','exchange_town','village','outpost'}<={s.get('kind') for s in settlements if s.get('region_id')==f'region-{i:02d}'} for i in range(1,16)))
 check('settlement_functional_fields',bool(settlements) and all(len(str(s.get('function','')))>=10 and s.get('siting') and s.get('public_access') and s.get('failure_response') for s in settlements))
 check('settlement_dependency_acyclic',acyclic([(s['id'],d) for s in settlements for d in s.get('service_dependencies',[]) if isinstance(d,str)]))
 index=data.get('REGION_BLUEPRINT_INDEX.json',{}).get('records',[])
 for r in index:
  for key in ['region_document','capital_document']:
   f=root/r.get(key,'_missing_')
   check('blueprint_document:'+r['id']+':'+key,f.is_file() and len(f.read_text().split())>=650)
 for name,d in data.items():
  mismatches=[p for p,x in walk(d) if isinstance(x,dict) and isinstance(x.get('region_id'),str) and isinstance(x.get('oath_id'),str) and x['region_id'].split('-')[-1]!=x['oath_id'].split('-')[-1]]
  check('region_oath_alignment:'+name,not mismatches,', '.join(mismatches))
 check('settlement_poi_consistency',bool(settlements) and all(s.get('poi_id') in np and np[s['poi_id']].get('name')==s.get('name') and np[s['poi_id']].get('region_id')==s.get('region_id') for s in settlements))
 check('capital_district_poi_consistency',bool(capitals) and all(v['id'] in np and np[v['id']].get('name')==v.get('name') and np[v['id']].get('region_id')==c.get('region_id') for c in capitals for v in c.get('districts',[])))
 route_by_baseline={r.get('baseline_route_id'):r for r in routes}
 check('detour_time_targets_sum',bool(routes) and all(r.get('detour_target_walk_minutes')==[sum(route_by_baseline.get(i,{}).get('target_walk_minutes',[0,0])[j] for i in r.get('detour_baseline_route_ids',[])) for j in [0,1]] for r in routes))
 for r in index:
  f=root/r.get('region_document','_missing_')
  if not f.is_file():continue
  parts=re.split(r'^## +(.+)$',f.read_text(),flags=re.M);sections={parts[i].strip().lower().replace(' ','_'):parts[i+1].strip() for i in range(1,len(parts)-1,2)}
  needed=['terrain','capital','settlements','villages','outposts','architecture','infrastructure','civilian','commercial','military','institution','underground','landmarks','routes','habitats','resources','dungeon','worldboss','secret','housing','events','pvp','hazards','weather','daynight','ambient','npc_routines']
  missing=[k for k in needed if len(sections.get(k,'').split())<25]
  check('region_substantive_sections:'+r['id'],not missing,', '.join(missing))
  check('region_sacred_or_commemorative_space:'+r['id'],bool(re.search(r'sacred|ritual|shrine|temple|commemorative',f.read_text(),re.I)))
 known_filenames=set(base.get('baseline_file_names',[]))|{p.name for p in files.values()};dangling=[]
 for name,p in files.items():
  if p.suffix!='.md':continue
  for line in p.read_text().splitlines():
   if 'if present in manifest' in line:continue
   for token in re.findall(r'\b[A-Z][A-Z0-9_/-]+\.(?:md|json)\b',line):
    if pathlib.Path(token).name not in known_filenames:dangling.append(name+': '+token)
 check('prose_file_references',not dangling,'; '.join(dangling[:35]))
 for k in kits:
  modules={m['name']:m for m in k.get('modules',[])};ramp=modules.get('ramp-run',{});stair=modules.get('stair-flight',{});door=modules.get('door-frame',{})
  slope=ramp.get('slope',{});ss=stair.get('slope',{});clear=door.get('clearance',{});ext=door.get('target_extent_m',[0,0,0])
  check('kit_ramp_arithmetic:'+k['id'],bool(slope.get('run_m')) and slope.get('rise_m',999)/slope['run_m']<=slope.get('maximum_ramp_grade',0)+1e-9 and ramp.get('target_extent_m',[0,0,0])[1:]==[slope.get('run_m'),slope.get('rise_m')])
  check('kit_stair_arithmetic:'+k['id'],bool(ss.get('riser_count')) and math.isclose(ss.get('riser_m',0)*ss['riser_count'],ss.get('rise_m',999)) and math.isclose(ss.get('tread_m',0)*(ss['riser_count']-1),ss.get('run_m',999)))
  check('kit_aperture_envelope:'+k['id'],0<clear.get('door_width_m',0)<ext[0] and 0<clear.get('door_height_m',0)<ext[2])
  check('kit_role_dimensions:'+k['id'],len({tuple(m.get('target_extent_m',[])) for m in modules.values()})>=8)
 exploration=root/'DUNGEON_AND_EXPLORATION_PLAN.md';et=exploration.read_text().lower() if exploration.exists() else ''
 terms={'beginner':r'beginner','midgame':r'mid.?game','dangerous frontier':r'frontier','high-level dungeon':r'high.level','endgame contested':r'endgame','rare discovery':r'rare','mystery':r'myster','achievement':r'achievement','treasure':r'treasure'}
 absent=[k for k,v in terms.items() if not re.search(v,et)]
 check('exploration_readiness_discovery_coverage',not absent,', '.join(absent))
 check('founder_canon_art_approval',None,'All additions are proposals; static review cannot grant founder approval or commercial asset rights.','HUMAN_REVIEW')
 prose_unknown=[]
 for name,p in files.items():
  if p.suffix!='.md' or name.startswith('validation/'):continue
  for token in re.findall(r'\b(?:p2-[a-z0-9-]+|poi-[a-z0-9-]+|route-\d+-\d+|region-\d+|oath-\d+|REF-\d+)\b',p.read_text()):
   if token not in known and token not in {'p2-streaming-09','p2-arch-','p2-env-09-shared','p2-poi-'}:prose_unknown.append(name+': '+token)
 check('prose_ids_resolve',not prose_unknown,'; '.join(prose_unknown[:30]))
 # Actual coordinates, collision and terrain are intentionally human/runtime gates.
 for n,detail in [('terrain_derived_drainage','No authored heightfield exists; conceptual sequence checks cannot verify terrain.'),('runtime_navigation_and_service_access','Requires navmesh, movement agents and event-state tests.'),('performance_and_multiplayer','Requires engine prototype, target devices and multiplayer load tests.'),('visual_asset_implementation','Specifications and references are not meshes, textures, rigs or shipped assets.')]:check(n,None,detail,'HUMAN_REVIEW')
 privacy=[]
 pattern=re.compile(r'https?://(?:chatgpt\.com/(?:c|backend-api)|[^\s/]*oaiusercontent\.com)|sediment://|library://|/workspace/|/root/\.codex|file-[A-Za-z0-9]{12,}')
 for name,p in files.items():
  if name.startswith('validation/') or p.suffix not in ['.md','.json','.svg','.mmd','.txt']:continue
  if pattern.search(p.read_text()):privacy.append(name)
 check('public_provenance_privacy',not privacy,', '.join(privacy))
 broken=[]
 for name,p in files.items():
  if p.suffix!='.md':continue
  for url in re.findall(r'\]\(([^)]+)\)',p.read_text()):
   url=url.split('#')[0]
   if not url or '://' in url or url.startswith('mailto:'):continue
   if not (p.parent/url).exists():broken.append(name+': '+url)
 check('local_markdown_links',not broken,'; '.join(broken[:30]))
 for label,path,commit in [('destination',baseline_repo,base['baseline_commit']),('source',source_repo,base['source_commit'])]:
  if not path:check('repository_unchanged:'+label,None,'Supply optional repository path to verify locally.','SKIPPED');continue
  try:
   head=subprocess.check_output(['git','-C',str(path),'rev-parse','HEAD'],text=True).strip();status=subprocess.check_output(['git','-C',str(path),'status','--porcelain'],text=True)
   check('repository_unchanged:'+label,head==commit and not status,'HEAD '+head+'; worktree '+('clean' if not status else 'changed'))
  except Exception:check('repository_unchanged:'+label,False,'Repository verification unavailable.')
 result={'generated_at_utc':datetime.datetime.now(datetime.timezone.utc).isoformat(),'input_sha256':{n:hashlib.sha256(p.read_bytes()).hexdigest() for n,p in files.items() if p.suffix=='.json' and not n.startswith('validation/')},'scope':'Static specification validation only; no implementation or founder approval implied.','counts':{state:sum(c['status']==state for c in checks) for state in ['PASS','FAIL','SKIPPED','HUMAN_REVIEW']},'checks':checks}
 if write:(root/'validation/VALIDATION_REPORT.json').write_text(json.dumps(result,indent=2)+'\n')
 return result
if __name__=='__main__':
 p=argparse.ArgumentParser();p.add_argument('--baseline-repo','--foundation',dest='baseline_repo');p.add_argument('--source-repo');a=p.parse_args();r=run(baseline_repo=a.baseline_repo,source_repo=a.source_repo);print(json.dumps(r['counts']));sys.exit(bool(r['counts'].get('FAIL')))
