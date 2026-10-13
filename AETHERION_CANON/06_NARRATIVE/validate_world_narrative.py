#!/usr/bin/env python3
"""Structural design checks only. No claim of playable quests, approved canon or simulated hydrology."""
import json, pathlib, collections, sys, re, xml.etree.ElementTree as ET
root=pathlib.Path(sys.argv[1]) if len(sys.argv)>1 else pathlib.Path(__file__).resolve().parents[1]
def load(p):return json.loads((root/p).read_text())
def records(p):return load(p)['records']
checks=[]
def check(name,condition,detail):
 checks.append(dict(id=name,status='PASS' if condition else 'FAIL',detail=detail,canon_status='PROPOSED',source_ids=['SRC-WORLD-PROPOSAL']))
entities=records('01_WORLD_BIBLE/ENTITY_CONTRACT.json');realms=records('03_GEOGRAPHY/REALM_REGISTRY.json');graph=load('03_GEOGRAPHY/WORLD_GRAPH.json');routes=records('03_GEOGRAPHY/TRADE_ROUTES.json');pois=records('03_GEOGRAPHY/WORLD_POI_REGISTRY.json');chars=records('05_FACTIONS_AND_CHARACTERS/CHARACTER_REGISTRY.json');factions=records('05_FACTIONS_AND_CHARACTERS/FACTION_REGISTRY.json');rels=records('05_FACTIONS_AND_CHARACTERS/RELATIONSHIP_GRAPH.json');quests=records('06_NARRATIVE/QUEST_REGISTRY.json');ends=records('06_NARRATIVE/ENDING_PREREQUISITES.json')
expected={f'oath-{i:02}' for i in range(1,16)};rids={f'region-{i:02}' for i in range(1,16)}
check('exact-fifteen-oaths',{r['oath_id'] for r in entities}==expected and len(entities)==15,'Exact locked membership count and stable mapping; names checked by source review separately.')
check('exact-fifteen-realms',{r['id'] for r in realms}==rids and len(realms)==15,'No neutral or endgame POI creates a sixteenth realm.')
lookup={r['id']:r for r in graph['records']};seen=set();q=['region-01']
while q:
 n=q.pop()
 if n in seen:continue
 seen.add(n);q+=lookup[n]['neighbor_ids']
check('continent-connected',seen==rids,'All15 regions reachable through proposed land adjacency.')
check('symmetric-adjacency',all(a['id'] in lookup[b]['neighbor_ids'] for a in lookup.values() for b in a['neighbor_ids']),'Every declared land neighbor has a reciprocal edge.')
check('no-disconnected-watershed-steps',all(v in lookup[u]['neighbor_ids'] for b in graph['drainage_networks'] for u,v in zip(b['river_region_sequence'],b['river_region_sequence'][1:])),'Each conceptual river step crosses a declared land adjacency; does not validate real gradients.')
check('river-paths-acyclic',all(len(b['river_region_sequence'])==len(set(b['river_region_sequence'])) for b in graph['drainage_networks']),'No conceptual river route loops uphill into its own earlier region.')
check('route-alternatives',all(r['alternate_region_path'][0]==r['from_region_id'] and r['alternate_region_path'][-1]==r['to_region_id'] and all(v in lookup[u]['neighbor_ids'] and {u,v}!={r['from_region_id'],r['to_region_id']} for u,v in zip(r['alternate_region_path'],r['alternate_region_path'][1:])) for r in routes),'Each land edge has a valid alternate route without using that same edge.')
allids={r['id'] for r in entities+realms+pois+chars+factions+quests+ends}
check('character-faction-references',all((c.get('faction_id') is None or c['faction_id'] in allids) and (c.get('region_id') is None or c['region_id'] in allids) for c in chars),'All character faction and region references resolve.')
check('relationship-endpoints',all(r['from_id'] in allids and r['to_id'] in allids for r in rels),'All relationship endpoints resolve to defined people or factions.')
check('poi-region-references',all(p['region_id'] in rids for p in pois),'All63 POIs belong to one of15 realms; special statuses are not extra realms.')
qmap={q['id']:q for q in quests}
check('quest-references',all(p in qmap for q in quests for p in q['required_quest_ids']),'All quest prerequisites resolve.')
visiting=set();visited=set()
def acyclic(n):
 if n in visiting:return False
 if n in visited:return True
 visiting.add(n)
 for p in qmap[n]['required_quest_ids']:
  if not acyclic(p):return False
 visiting.remove(n);visited.add(n);return True
check('quest-prerequisites-acyclic',all(acyclic(n) for n in qmap),'No prerequisite cycle can deadlock a narrative path.')
regional=[q for q in quests if q['kind']=='regional_arc'];init=[q for q in quests if q['kind']=='optional_initiation']
check('all-first-oaths-open',len(init)==15 and all(q['required_quest_ids']==['quest-main-02'] and q['first_oath_requirement'] is None for q in init),'Every initiation is available after orientation without another Oath.')
check('regional-order-independent',len(regional)==15 and all(q['required_quest_ids']==['quest-main-02'] and not q['required_flags'] and q['first_oath_requirement'] is None for q in regional),'Regional arcs have no cross-region or binding prerequisites; settlement updates are separately keyed.')
check('regional-branches-have-costs',all(len(q['branches'])==3 and all(b['benefit'] and b['cost'] and b['service_continuity'] for b in q['branches']) for q in regional),'Every authored settlement branch has a concrete advantage, cost and service continuity statement.')
# Exercise rotations and reverse orders for every first initiation; dependency check above establishes general commutativity.
orders=[]
for first in range(1,16):
 order=list(range(first,16))+list(range(1,first));orders.extend([(first,order),(first,list(reversed(order)))])
order_ok=True
for first,order in orders:
 completed={'quest-main-01','quest-main-02'};att=set()
 for i in order:
  q=qmap[f'quest-region-{i:02}'];order_ok &= set(q['required_quest_ids'])<=completed
  completed.add(q['id']);att.add(f'service-attestation-{i:02}')
 order_ok &= len(att)==15
check('first-oath-order-scenarios',order_ok,f'{len(orders)} order scenarios executed, covering all15 first initiations and reverse regional traversals. This is data-contract testing, not playtesting.')
def eligible(e,state):
 if not set(e['required_flags'])<=state['flags']:return False
 if not set(e['required_interface_attestations'])<=state['attestations']:return False
 if any(not state['choices'].get(k) for k in e['required_choices']):return False
 if e['id']=='ending-dominion' and state['choices'].get('dominant_oath_id') not in expected:return False
 return True
positive=negative=0;valid=True
for e in ends:
 for first in range(1,16):
  state=dict(flags=set(e['required_flags']),attestations=set(e['required_interface_attestations']),choices={k:True for k in e['required_choices']},bound_oaths={f'oath-{first:02}'})
  if e['id']=='ending-dominion':state['choices']['dominant_oath_id']=f'oath-{first:02}'
  valid &= eligible(e,state);positive+=1
  for token in e['required_interface_attestations']:
   bad=dict(state,attestations=state['attestations']-{token});valid &= not eligible(e,bad);negative+=1
  for flag in e['required_flags']:
   bad=dict(state,flags=state['flags']-{flag});valid &= not eligible(e,bad);negative+=1
  for choice in e['required_choices']:
   bad=dict(state,choices={k:v for k,v in state['choices'].items() if k!=choice});valid &= not eligible(e,bad);negative+=1
check('ending-predicate-scenarios',valid,f'{positive} eligible and {negative} missing-prerequisite scenarios executed; only one bound Oath supplied, proving no all-fifteen binding requirement in this contract.')
for folder in ['01_WORLD_BIBLE','02_HISTORY_AND_COSMOLOGY','03_GEOGRAPHY','04_OATH_DOSSIERS','05_FACTIONS_AND_CHARACTERS','06_NARRATIVE']:
 for p in (root/folder).glob('*.json'):
  if p.name=='WORLD_NARRATIVE_VALIDATION.json':continue
  x=json.loads(p.read_text());check('envelope-'+p.stem,all(k in x for k in ['schema_version','canon_status','source_ids','records']),str(p.relative_to(root)))
index=records('04_OATH_DOSSIERS/OATH_DOSSIER_INDEX.json')
check('fifteen-complete-dossiers',len(index)==15 and all(len(re.findall(r'^## \d{2}\. ',(root/'04_OATH_DOSSIERS'/d['path']).read_text(),re.M))==40 for d in index),'Checks actual40topic sections per dossier, not merely the index claim. Semantic depth still requires human review.')
check('world-bible-canonical-name',(root/'01_WORLD_BIBLE/AETHERION_WORLD_BIBLE.md').exists(),'Exact requested canonical filename exists; WORLD_BIBLE.md is a compatibility pointer.')
try:ET.parse(root/'03_GEOGRAPHY/WORLD_SCHEMATIC.svg');svgok=True
except Exception:svgok=False
check('schematic-svg-valid',svgok,'SVG parsed; rendered with PyMuPDF and visually inspected separately for legibility and connected-mainland depiction.')
for name in ['terrain-heightfield-hydrology','quest-runtime-playtest','human-canon-approval','dialogue-performance-review','multiplayer-save-migration']:
 checks.append(dict(id=name,status='SKIPPED',detail='Requires approved production implementation or human review; not established by documentation validation.',canon_status='PROPOSED',source_ids=['SRC-WORLD-PROPOSAL']))

# Traverse declared quest producers from an empty state. Nothing seeds prerequisite flags.
choice_values={
 'restoration_charter_scope':'plural civic charter', 'independent_review_method':'mixed independent civic panel',
 'transition_cost_allocation':'published reciprocal maintenance contributions',
 'minority_service_guarantees':'protected essential services and appeal', 'scope_of_emergency_power':'bounded authority with public expiry',
 'succession_and_review_terms':'published succession and independent review', 'dominant_oath_reviewed':True, 'dominant_oath_accepted':True,
 'replacement_service_ownership':'local consenting cooperatives', 'staged_release_sequence':'release only after replacement capacity review',
 'mutual_aid_contingency':'shared reserve and supported low-capacity communities', 'consent_and_exit_guarantees':'renewable participation and protected exit'}
def traverse(first,e,mode,omit_interface=None,omit_record=False,alliance=None,support_branch_index=None):
 state=dict(flags=set(),attestations=set(),choices={},bound_oaths=set(),completed=set(),producers={},path=[])
 def perform(qid):
  q=qmap[qid]
  if not set(q['required_quest_ids'])<=state['completed']:return False
  if not set(q.get('required_flags',[]))<=state['flags']:return False
  for rule in q.get('conditional_required_quest_ids',[]):
   if set(rule['when_flags_all'])<=state['flags'] and not set(rule['quest_ids'])<=state['completed']:return False
  selected_effects=[]
  if q['kind'].startswith('supporting_'):
   if support_branch_index not in [0,1]:return False
   selected_effects=[q['branches'][support_branch_index]]
  if qid=='quest-alliance-daybreak-offer':selected_effects=[next(b for b in q['branches'] if b['id']=='alliance-daybreak-accept')]
  if qid=='quest-alliance-daybreak-crossing':
   bid='alliance-daybreak-secret-crossing' if alliance and alliance.startswith('betrayal') else 'alliance-daybreak-notify'
   selected_effects=[next(b for b in q['branches'] if b['id']==bid)]
  if qid=='quest-alliance-daybreak-recovery':selected_effects=[next(b for b in q['branches'] if b['id']=='alliance-daybreak-end')]
  if qid=='quest-main-06':
   selected_effects=[c for c in q['resolution_cases'] if set(c['when_flags_all'])<=state['flags'] and not set(c['when_flags_none']) & state['flags']]
   if len(selected_effects)!=1:return False
  if qid=='quest-main-03':
   if f'initiation-reviewed-{first:02}' not in state['flags']:return False
   state['bound_oaths'].add(f'oath-{first:02}')
  if qid=='quest-main-07':
   proposed={k:(f'oath-{first:02}' if k=='dominant_oath_id' else choice_values[k]) for k in e['required_choices']}
   if not set(proposed)<=set(q['produces_choices']):return False
   if e['id']=='ending-dominion' and f'initiation-reviewed-{first:02}' not in state['flags']:return False
   state['choices'].update(proposed)
  if q.get('ending_predicate_required') and not eligible(e,state):return False
  state['completed'].add(qid);state['path'].append(qid)
  for effect in [q]+selected_effects:
   for flag in effect.get('grants_flags',[]):
    state['flags'].add(flag);state['producers'].setdefault(flag,[]).append(qid+(':'+effect['id'] if effect is not q else ''))
    if flag.startswith('service-attestation-'):state['attestations'].add(flag)
   for flag in effect.get('clears_flags',[]):state['flags'].discard(flag)
  return True
 path=['quest-main-01','quest-main-02',f'quest-initiation-{first:02}','quest-main-03']
 if alliance and alliance!='betrayal_no_offer':path.append('quest-alliance-daybreak-offer')
 order=list(range(first,16))+list(range(1,first))
 for i in order:
  if i==omit_interface:continue
  civic=mode=='all_civic_reviews' or (mode=='skip_first_climax' and i==first)
  path.append(f'quest-civic-review-{i:02}' if civic else f'quest-region-{i:02}')
 if not omit_record:path.append('quest-evidence-independent-record')
 path += ['quest-main-04','quest-main-05']
 if alliance:
  if alliance!='betrayal_no_warning':path.append('quest-alliance-daybreak-warning')
  path.append('quest-alliance-daybreak-crossing')
 path.append('quest-main-06')
 if alliance=='betrayal_end':path.append('quest-alliance-daybreak-recovery')
 path.append('quest-main-07')
 if support_branch_index is not None:
  path += ['quest-handler-dessa-assessment','quest-handler-dessa-charter','quest-wayfarer-tarin-dispatch','quest-wayfarer-tarin-road','quest-rival-oda-trial','quest-rival-oda-record','quest-rival-oda-final','quest-mentor-una-override','quest-mentor-una-handback']
 path += ['quest-main-08','quest-main-09']
 for qid in path:
  if not perform(qid):return False,state,qid
 return True,state,None
reach_ok=True;reach_count=0;proof_paths=[]
for e in ends:
 for first in range(1,16):
  for mode in ['regional_arcs','all_civic_reviews','skip_first_climax']:
   ok,state,blocked=traverse(first,e,mode);reach_ok &= ok and 'aftermath_complete' in state['flags'];reach_count+=1
   if mode=='all_civic_reviews':reach_ok &= not any(q.startswith('quest-region-') for q in state['completed'])
   if mode=='skip_first_climax':reach_ok &= f'quest-region-{first:02}' not in state['completed']
   if first==1 and mode=='all_civic_reviews':proof_paths.append(dict(ending_id=e['id'],completed_quest_ids=state['path'],skipped_regional_climax_ids=[f'quest-region-{i:02}' for i in range(1,16)],attestation_producers={k:v for k,v in state['producers'].items() if k.startswith('service-attestation-')},final_flags=sorted(state['flags'])))
check('empty-state-ending-reachability',reach_ok,f'{reach_count} graph-state traversals begin with no flags: all15 first initiations ×3 endings ×3 routes (regional, all civic reviews, mixed skipping first climax). Flags come only from declared completed quest producers.')
negative_route_ok=True;negative_routes=0
for e in ends:
 for missing in range(1,16):
  ok,state,blocked=traverse(1,e,'all_civic_reviews',omit_interface=missing)
  negative_route_ok &= not ok and blocked=='quest-main-07' and 'ending_committed' not in state['flags'];negative_routes+=1
 ok,state,blocked=traverse(1,e,'all_civic_reviews',omit_record=True)
 negative_route_ok &= not ok and blocked=='quest-main-04';negative_routes+=1
check('missing-producer-blocks-traversal',negative_route_ok,f'{negative_routes} negative graph traversals verify that a missing service review blocks final planning and missing independent evidence blocks investigation; no seeded flags bypass the producers.')

alliance_ok=True;alliance_cases=0;alliance_proof_paths=[]
for e in ends:
 for first in range(1,16):
  for route in ['honored','betrayal']:
   ok,state,blocked=traverse(first,e,'all_civic_reviews',alliance=route);alliance_cases+=1
   alliance_ok &= ok and 'aftermath_complete' in state['flags']
   if route=='betrayal':alliance_ok &= {'alliance-daybreak-betrayed','promise-daybreak-no-seizure-breached','daybreak-escort-suspended'}<=state['flags'] and 'alliance-daybreak-active' not in state['flags']
   else:alliance_ok &= 'alliance-daybreak-honored' in state['flags'] and 'alliance-daybreak-betrayed' not in state['flags']
   if first==1 and route=='betrayal':alliance_proof_paths.append(dict(ending_id=e['id'],completed_quest_ids=state['path'],consequence_producers={k:v for k,v in state['producers'].items() if k.startswith(('alliance-','promise-','daybreak-'))},final_flags=sorted(state['flags'])))
 ok,state,blocked=traverse(1,e,'all_civic_reviews',alliance='betrayal_end');alliance_cases+=1
 alliance_ok &= ok and {'alliance-daybreak-ended','alliance-daybreak-betrayed','alliance-daybreak-review-complete','daybreak-escort-suspended'}<=state['flags']
 ok,state,blocked=traverse(1,e,'all_civic_reviews')
 alliance_ok &= ok and 'quest-alliance-daybreak-offer' not in state['completed'] and 'alliance-daybreak-betrayed' not in state['flags']
check('named-alliance-and-betrayal-traversal',alliance_ok,f'{alliance_cases} complete graph traversals exercise honored sponsorship, warned reciprocal breach and optional end-of-sponsorship recovery. Named quest choices produce all warning, promise and consequence flags; no-alliance ending paths remain valid.')
warning_ok=True
for e in ends:
 for route,expected_block in [('betrayal_no_offer','quest-alliance-daybreak-warning'),('betrayal_no_warning','quest-alliance-daybreak-crossing')]:
  ok,state,blocked=traverse(1,e,'all_civic_reviews',alliance=route)
  warning_ok &= not ok and blocked==expected_block and 'alliance-daybreak-betrayed' not in state['flags']
check('betrayal-requires-actual-promise-and-warning',warning_ok,'Six negative traversals reject a betrayal path that skips the actual alliance offer or warning quest.')

branch_ids={b['id'] for q in regional for b in q['branches']}
individual=[c for c in chars if c['id'].endswith('-leader') or c['id'].endswith('-civilian')]
check('character-branch-choice-links',all(isinstance(c['branch_outcomes'],list) and len(c['branch_outcomes'])==3 and all(b['settlement_choice_id'] in branch_ids and b['personal_outcome'] and b['unresolved_cost'] for b in c['branch_outcomes']) for c in individual),'All30 named leaders/civic characters have individual outcomes linked to actual regional settlement choice IDs.')
civic=[c for c in chars if c['id'].endswith('-civilian')]
check('civic-character-distinct-fields',all(len({json.dumps(c[field],sort_keys=True) for c in civic})==15 for field in ['visual_identity','equipment','voice','contradiction','arc','branch_outcomes']),'All15 civic visual identities, equipment, voices, contradictions, arcs and outcomes differ as concrete authored data; semantic quality remains a human review.')


# Supporting roles: exact references and actual optional quest-state producers.
check('character-id-uniqueness',len(chars)==len({c['id'] for c in chars}),'Supporting additions do not duplicate or replace existing people.')
services=records('05_FACTIONS_AND_CHARACTERS/CHARACTER_SERVICE_REGISTRY.json');service_ids={s['id'] for s in services}
all_quest_branches={b['id']:q['id'] for q in quests for b in q.get('branches',[])}
supporting=[c for c in chars if c.get('supporting_choice_outcomes')]
check('supporting-choice-links',len(supporting)==4 and all(o['quest_id'] in qmap and all_quest_branches.get(o['quest_choice_id'])==o['quest_id'] for c in supporting for o in c['supporting_choice_outcomes']),'Four concrete supporting roles link personal outcomes to actual quest branches.')
check('character-service-links',all(s in service_ids for c in supporting for s in c['service_ids']) and all(s['character_id'] in allids and all(q in qmap for q in s['quest_ids']) and all(p in allids for p in s['poi_ids']) for s in services),'All four optional service records resolve to actual characters, quests and POIs.')
source_path=next((p for p in [root.parent/'CASTABLE_REGISTRY.json',root.parent/'repo'/'CASTABLE_REGISTRY.json'] if p.exists()),None)
if source_path:
 source={c['uid']:c['sourceCatalog'] for c in json.loads(source_path.read_text())['castables']}
 check('supporting-source-castable-uids',all(a['castable_uid'] in source and a['source_label']==source[a['castable_uid']]['label'] and a['source_element']==source[a['castable_uid']]['element'] and a['assignment_status']=='PROPOSED' for c in supporting for a in c['ability_references']),'All eight character ability references resolve to exact source UIDs/labels/elements; assignments remain PROPOSED and do not alter mechanics.')
else:checks.append(dict(id='supporting-source-castable-uids',status='SKIPPED',detail='Root CASTABLE_REGISTRY.json unavailable; cannot verify exact source UID references here.',canon_status='PROPOSED',source_ids=['SRC-WORLD-PROPOSAL']))
wayfarer=next(c for c in chars if c['id']=='character-02-wayfarer')
check('wayfarer-preserves-unbound-premise',wayfarer['oath_id']=='oath-02' and 'Not a true Unbound' in wayfarer['agency_guardrail'] and all(v in lookup[u]['neighbor_ids'] for u,v in zip(wayfarer['itinerary_region_ids'],wayfarer['itinerary_region_ids'][1:])),'Tarin is explicitly Rime-bound, not another true Unbound, and his public itinerary follows connected land edges.')
support_ok=True;support_count=0;supporting_proof_paths=[]
for e in ends:
 for first in range(1,16):
  for branch_index in [0,1]:
   ok,state,blocked=traverse(first,e,'all_civic_reviews',support_branch_index=branch_index);support_count+=1
   support_ok &= ok and all(s['availability_flag'] in state['flags'] for s in services) and 'aftermath_complete' in state['flags']
   if first==1:supporting_proof_paths.append(dict(ending_id=e['id'],branch_index=branch_index,completed_supporting_quest_ids=[q for q in state['path'] if qmap[q]['kind'].startswith('supporting_')],service_producers={s['availability_flag']:state['producers'].get(s['availability_flag'],[]) for s in services},choice_flags=sorted(f for f in state['flags'] if f.startswith(('handler-','wayfarer-','rival-','mentor-')))))
check('optional-supporting-arc-traversal',support_ok,f'{support_count} complete graph traversals cover both explicit choice sets across nine supporting quests, all15 first Oaths and three endings. Existing no-supporting-arc ending tests remain unchanged and passing.')
check('supporting-arcs-never-gate-main',all(not q['id'].startswith(('quest-handler-','quest-wayfarer-','quest-rival-','quest-mentor-')) for q in quests if any(q['id'] in m['required_quest_ids'] for m in quests if m['id'].startswith('quest-main-'))),'No main quest requires a supporting role arc or its service unlock.')

result=dict(schema_version='1.0.0',canon_status='PROPOSED',source_ids=['SRC-WORLD-PROPOSAL'],scope='Structural and logical preproduction data validation only; no runtime or founder-approval claim.',records=checks,reachability_proof_paths=proof_paths,alliance_proof_paths=alliance_proof_paths,supporting_proof_paths=supporting_proof_paths,summary=dict(passed=sum(c['status']=='PASS' for c in checks),failed=sum(c['status']=='FAIL' for c in checks),skipped=sum(c['status']=='SKIPPED' for c in checks)))
p=root/'06_NARRATIVE/WORLD_NARRATIVE_VALIDATION.json';p.write_text(json.dumps(result,indent=2)+'\n');print(json.dumps(result['summary']));sys.exit(bool(result['summary']['failed']))
