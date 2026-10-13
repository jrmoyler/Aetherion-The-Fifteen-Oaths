import argparse, gzip, json, hashlib, re, collections, subprocess, sys
import PIL
from pathlib import Path
from PIL import Image
parser = argparse.ArgumentParser(description="Read-only registry reference coverage inventory and first-wave construction briefs")
parser.add_argument('--root', type=Path, default=Path(__file__).resolve().parents[2])
parser.add_argument('--output-dir', type=Path, required=True, help='External output directory, outside the input repository')
args = parser.parse_args()
ROOT = args.root.resolve()
OUT = args.output_dir.resolve()
if OUT == ROOT or ROOT in OUT.parents:
    parser.error('--output-dir must be outside --root; this tool never writes source registries')
OUT.mkdir(parents=True, exist_ok=True)
inputs = {}
cache = {}
def read(p):
 if p not in cache:
  b=(ROOT/p).read_bytes();inputs[p]=hashlib.sha256(b).hexdigest();cache[p]=json.loads(b)
 return cache[p]
def resolve(p,pointer):
 v=read(p)
 for t in pointer.strip('/').split('/'):v=v[int(t)] if isinstance(v,list) else v[t.replace('~1','/').replace('~0','~')]
 return v
def refs(v):
 out=set()
 if isinstance(v,str):
  out.update('reference-'+n for n in re.findall(r'(?:reference-|REF-)(\d{3})',v))
 elif isinstance(v,list):
  for a in v:out.update(refs(a))
 elif isinstance(v,dict):
  for k,a in v.items():
   if k in ['references','reference_ids','reference_id','reference_source_ids','related_reference_images','visual_reference_source_ids','reference_evidence','reference_scope','source_ids']:out.update(refs(a))
 return sorted(out)
inv=read('validation/production/inventory.json'); guides={r['oath_id']:r for r in read('AETHERION_CANON/09_ART_DIRECTION/FIFTEEN_OATH_ART_GUIDE.json')['records']};refrows=read('AETHERION_CANON/11_REFERENCE_SHEETS/REFERENCE_INDEX.json')['records'];images={}
for r in refrows:
 p=ROOT/r['repository_path'];b=p.read_bytes();inputs[r['repository_path']]=hashlib.sha256(b).hexdigest();im=Image.open(p);im.verify();decoded=Image.open(p);decoded.load();images[r['id']]={'id':r['id'],'name':r['name'],'path':r['repository_path'],'sha256':hashlib.sha256(b).hexdigest(),'bytes':len(b),'dimensions':list(decoded.size),'fileVerified':True,'currentPixelReview':'NOT_PERFORMED_BY_AUTOMATED_INVENTORY','historicalPixelReview':r.get('pixel_review'),'approval':r['approval']}
fams={r['id']:r for r in inv['production_requirements']}; raw={};records={}; incoming=collections.Counter()
for r in fams.values():
 for dep in r['dependencies']:incoming[dep]+=1

def make(key,name,kind,oaths,sources,data,reference_ids=None):
 rs=reference_ids if reference_ids is not None else refs(data);oaths=sorted(set(o for o in oaths if o));style=sorted(set(v for o in oaths for v in guides.get(o,{}).get('reference_ids',[]) if v in images));valid=[v for v in rs if v in images]
 rec={'id':key,'name':name,'scopeKind':kind,'oathIds':oaths,'sources':sources,'explicitReferenceIds':rs,'verifiedExplicitImagePaths':[images[v]['path'] for v in valid],'referenceCoverage':'NOMINAL_CONTEXT_LINK_ONLY' if valid else 'NO_EXPLICIT_IMAGE_MAPPING','constructionViews':'UNRESOLVED_NOT_VISUALLY_CERTIFIED','description':{k:data[k] for k in ['description','purpose','visual_identity','equipment','anatomy','visual_signature','construction','reference_scope','role','model_construction','design_coverage','reference_evidence'] if k in data},'requiredViews':['front/back/both profiles/three-quarter','hidden faces and attachment sections','scale companion and proposed dimensions','material separation/swatch detail','moving parts and state extremes where applicable'],'oathStyleConstraints':[{ 'oathId':o,'name':guides[o]['name'],'observed':guides[o]['observed_reference_traits']} for o in oaths if o in guides],'relevantExistingStyleImagePaths':[images[v]['path'] for v in style],'stylePathsAreNotDedicatedCoverage':True,'dependencyPriority':incoming[key],'generationGroup':oaths[0] if len(oaths)==1 else 'shared-continent','visualScope':'VISUAL_REQUIREMENT','rawSourceSpecification':data}
 records[key]=rec;raw[key]=data;return rec
for key,f in fams.items():
 d=resolve(f['source_record']['path'],f['source_record']['json_pointer']);r=make(key,f['name'],'phase_i_family',[f['oath_id']],[f['source_record']],d,f['references']);r['componentLabels']=f['component_scope'];r['dependencies']=f['dependencies'];r['requiredViews']=[f['acceptance_focus']];r['category']=f['category_id'];r['generationGroup']=f['oath_id']+'/'+f['category_id'];r['referenceCoverage']='FAMILY_REFERENCE_ONLY_NO_DESCENDANT_COVERAGE' if r['verifiedExplicitImagePaths'] else 'NO_EXPLICIT_IMAGE_MAPPING'
 if f['category_id']=='AA':r['visualScope']='NONVISUAL_AUDIO_REQUIREMENT';r['requiredViews']=[];r['constructionViews']='NOT_APPLICABLE_AUDIO'
for d in inv['combined_detail_scope_links']:
 source=d['source_records'];vals=[resolve(s['registry_path'],s['json_pointer']) for s in source];val={}
 for v in vals:val.update(v)
 key=d['id'];paths=' '.join(s['registry_path'] for s in source);oaths=[v.get('oath_id') for v in vals];oaths += val.get('oath_ids',[])
 kind='semantic_or_runtime_contract';visual=False
 for filename,k in [('CHARACTER_REGISTRY.json','named_character'),('CREATURE_MOUNT_MORPH_REGISTRY.json','creature_mount_morph'),('WORLD_POI_REGISTRY.json','poi'),('SETTLEMENT_REGISTRY.json','physical_settlement'),('CAPITAL_LAYOUT_REGISTRY.json','capital_or_district'),('ARCHITECTURAL_KIT_REGISTRY.json','architecture_kit'),('ENVIRONMENT_ASSET_REGISTRY.json','environment_family'),('REGIONAL_ECOLOGY_PROFILES.json','ecology_profile'),('REGION_BLUEPRINT_INDEX.json','region_blueprint'),('HOUSING_PROFILES.json','housing_profile'),('FACTION_REGISTRY.json','faction_visual_identity')]:
  if filename in paths:kind=k;visual=True;break
 r=make(key,val.get('name',val.get('title',source[0].get('name',key))),kind,oaths,source,val,sorted(set(v for q in vals for v in refs(q))))
 if not visual:r['visualScope']='NONVISUAL_OR_MIXED_SYSTEM_REQUIRES_SCOPE_REVIEW';r['requiredViews']=[];r['constructionViews']='NOT_AUTOMATIC_IMAGE_COMMISSION'
 if kind=='named_character':r['referenceCoverage']='REALM_STYLE_ONLY_NO_PERSON_SHEET' if r['verifiedExplicitImagePaths'] else 'NO_EXPLICIT_IMAGE_MAPPING'
 if kind=='creature_mount_morph':
  r['referenceCoverage']='DEDICATED_SEQUENCE_NOMINAL_NOT_TURNAROUND' if val.get('role')=='summon_visual_reference' else ('REALM_STYLE_ONLY_NO_CREATURE_SHEET' if r['verifiedExplicitImagePaths'] else 'NO_EXPLICIT_IMAGE_MAPPING');r['requiredViews']=val.get('model_construction',{}).get('requirements',r['requiredViews'])
 if kind in ['architecture_kit','environment_family']:r['referenceCoverage']='OVERVIEW_CONTEXT_CONSTRUCTION_SHEETS_MISSING';r['constructionViews']='EXPLICITLY_MISSING_IN_REGISTRY';r['requiredViews']=val.get('reference_evidence',{}).get('missing',r['requiredViews'])
for category,rows in inv['phase_ii']['item_level_inventory'].items():
 for row in rows:
  p,pointer=row['inventory_key'].split('#');d=resolve(p,pointer);r=make(row['inventory_key'],d.get('name',d.get('region_id',row['parent_id'])),row['scope_kind'],[row.get('oath_id')],[{'registry_path':p,'json_pointer':pointer}],d,refs(d));r['stableParentId']=row['parent_id'];r['identityPolicy']='SOURCE_POINTER_NOT_NEW_ASSET_ID';r['baselineFamilyIds']=row['baseline_family_ids'];r['referenceCoverage']='PARENT_OVERVIEW_ONLY_NO_ITEM_SHEET';r['constructionViews']='EXPLICITLY_MISSING_PARENT_CONSTRUCTION_REQUIREMENT';r['generationGroup']=row['parent_id'];r['dependencyPriority']=sum(incoming[v] for v in row['baseline_family_ids'] if not row.get('oath_id') or v.startswith('asset-o'+row['oath_id'][-2:]+'-'))
links=read('AETHERION_CANON/11_REFERENCE_SHEETS/REFERENCE_CASTABLE_LINKS.json')['records'];uidlinks=collections.defaultdict(list)
for link in links:uidlinks[link['castable_uid']].append(link['reference_id'])
for cast in inv['source_castable_ledger']:
 uid=cast['uid'];r=make(uid,uid,'source_castable',[cast.get('oath_id')],[{'inventory':'source_castable_ledger','uid':uid}],{'kind':cast['kind']},uidlinks[uid]);r['referenceCoverage']='EXACT_UID_SEQUENCE_LINK_NOMINAL' if uidlinks[uid] else 'NO_EXPLICIT_IMAGE_MAPPING';r['requiredViews']=['source-faithful anticipation/travel/impact/recovery sequence','effect layers, footprint and scale','keep exact source behavior and timing authority'];r['generationGroup']=cast.get('oath_id','shared')+'/castable-sequences'
components=[]
for f in fams.values():
 for i,label in enumerate(f['component_scope']):components.append({'inventoryKey':f['id']+'#/component_scope/'+str(i),'stableParentId':f['id'],'label':label,'identityPolicy':'SCOPE_LABEL_NOT_STABLE_ASSET_ID','coverage':'FAMILY_MAPPING_DOES_NOT_ESTABLISH_COMPONENT_COVERAGE','visualScope':'NONVISUAL_AUDIO_REQUIREMENT' if f['category_id']=='AA' else 'VISUAL_SCOPE_LABEL','generationGroup':f['oath_id']+'/'+f['category_id']})
diagrams=[]
for p in sorted((ROOT/'AETHERION_CANON/21_WORLD_CONSTRUCTION_PHASE_II').rglob('*.svg')):
 b=p.read_bytes();inputs[str(p.relative_to(ROOT))]=hashlib.sha256(b).hexdigest();diagrams.append({'path':str(p.relative_to(ROOT)),'sha256':hashlib.sha256(b).hexdigest(),'coverage':'ACTUAL_LAYOUT_DIAGRAM_NOT_APPEARANCE_OR_CONSTRUCTION_SHEET'})
counts={'originalReferenceImages':len(images),'originalImageUniqueHashes':len(set(i['sha256'] for i in images.values())),'phaseIProductionFamilies':len(fams),'phaseIFamilyComponentLabelsNotAssetIDs':len(components),'combinedDetailStableIDs':len(inv['combined_detail_scope_links']),'phaseIIArchitectureModulePointers':len(inv['phase_ii']['item_level_inventory']['architecture_modules']),'phaseIIEnvironmentVariantPointers':len(inv['phase_ii']['item_level_inventory']['regional_environment_variants']),'sourceCastableUIDs':len(inv['source_castable_ledger']),'unionInventoryRowsNotMeshCount':len(records),'coverageByScopeKind':{},'phaseIIDiagrams':len(diagrams),'phaseIICapitalDiagrams':sum('CAPITAL_CITY_BLUEPRINTS' in d['path'] for d in diagrams),'phaseIIContinentDiagrams':sum('/maps/' in d['path'] for d in diagrams)}
for kind in sorted(set(r['scopeKind'] for r in records.values())):
 rr=[r for r in records.values() if r['scopeKind']==kind];counts['coverageByScopeKind'][kind]={'rows':len(rr),'coverage':dict(collections.Counter(r['referenceCoverage'] for r in rr)),'visualScope':dict(collections.Counter(r['visualScope'] for r in rr))}
for r in records.values():
 r['nextReferenceAction']='NO_AUTOMATIC_ART_COMMISSION' if r['visualScope']!='VISUAL_REQUIREMENT' else ('PIXEL_AND_PANEL_AUDIT_BEFORE_NEW_IMAGE' if r['scopeKind']=='phase_i_family' or r['referenceCoverage'] in ['EXACT_UID_SEQUENCE_LINK_NOMINAL','FAMILY_REFERENCE_ONLY_NO_DESCENDANT_COVERAGE'] else ('SUPPLEMENT_MISSING_CONSTRUCTION_VIEWS' if r['referenceCoverage'] in ['DEDICATED_SEQUENCE_NOMINAL_NOT_TURNAROUND','OVERVIEW_CONTEXT_CONSTRUCTION_SHEETS_MISSING','PARENT_OVERVIEW_ONLY_NO_ITEM_SHEET'] else 'DEDICATED_ID_SHEET_NEEDED_SUBJECT_TO_GROUPING'))
queue=sorted([r for r in records.values() if r['visualScope']=='VISUAL_REQUIREMENT' and r['referenceCoverage']!='EXACT_UID_SEQUENCE_LINK_NOMINAL'],key=lambda r:(-r['dependencyPriority'],0 if r['scopeKind'] in ['architecture_kit','named_character','creature_mount_morph'] else 1,r['id']))
groups=collections.defaultdict(list)
for r in queue:
 if r['nextReferenceAction']!='PIXEL_AND_PANEL_AUDIT_BEFORE_NEW_IMAGE':groups[r['generationGroup']].append(r['id'])
result={'format':'aetherion-reference-gap-inventory@1','head':subprocess.check_output(['git','rev-parse','HEAD'],cwd=ROOT,text=True).strip(),'inputSha256':inputs,'countingPolicy':['Rows are requirement identities, not mesh counts or image quotas.','510 families contain 2865 component labels; detail IDs and Phase II pointers refine overlapping families and are not additive asset counts.','1177 detail IDs include nonvisual systems, narrative choices and route contracts; these do not automatically require artwork.','No descendant inherits dedicated coverage from a family/realm image.','Explicit textual links plus decoded local images establish nominal mapping only, not current visual sufficiency or approval.','Existing candidate renders are implementation review artifacts, not replacements for canonical reference coverage.'],'counts':counts,'originalImages':list(images.values()),'phaseIIDiagrams':diagrams,'records':list(records.values()),'phaseIComponentCoverage':components,'overlapEvidence':{'physicalSettlementIdsAlsoPOIs':sorted(r['id'] for r in records.values() if any('SETTLEMENT_REGISTRY.json' in q.get('registry_path','') for q in r['sources']) and any('WORLD_POI_REGISTRY.json' in q.get('registry_path','') for q in r['sources'])),'districtIdsAlsoPOIs':sorted(r['id'] for r in records.values() if any('/districts/' in q.get('json_pointer','') for q in r['sources']) and any('WORLD_POI_REGISTRY.json' in q.get('registry_path','') for q in r['sources']))},'generationGroups':[{'group':k,'requirementIds':v,'oneSheetMayCoverMultipleExplicitlyLabelledIDs':True,'mustNotInferCoverageFromStyleOnly':True} for k,v in sorted(groups.items())],'dependencyPriorityQueue':[r['id'] for r in queue],'stableIdPriorityQueue':[r['id'] for r in queue if '#' not in r['id'] and r['nextReferenceAction']!='PIXEL_AND_PANEL_AUDIT_BEFORE_NEW_IMAGE'],'reviewRequiredPriorityQueue':[r['id'] for r in queue if r['nextReferenceAction']=='PIXEL_AND_PANEL_AUDIT_BEFORE_NEW_IMAGE'],'unknowns':['Exact finished asset decomposition and new image count remain unresolved; component labels have no stable per-mesh IDs.','No registry provides complete current per-image per-panel construction sufficiency; all nominal mappings need view audit before declaring covered.','All original art approval states remain unresolved.','Mixed system records require selective visual deliverable mapping rather than one image per contract.'],'referenceActionCounts':dict(collections.Counter(r['nextReferenceAction'] for r in records.values())),'historicalHumanObservationNotAnAutomatedFinding':{'reference-113':'Prior review on source head 5a30e8d inspected original pixels: ninja/sorcerer front/back, armor/items/weapons/asset motifs and environment overview; no exact named Mara Venn sheet, six-limbed burrower sheet or dimensioned module faces. This proves realm sheet cannot cover every descendant.'}}
(OUT/'aetherion-missing-reference-inventory.json').write_text(json.dumps(result,indent=2)+'\n')
md=['# Aetherion reference gap inventory','',f'Published working head: `{result["head"]}`. Read-only; all 114 originals preserved.','', 'Counts below are overlapping requirement scopes, not a sum of meshes or image commissions.','', '| Scope | Rows |','|---|---:|']
for k,v in counts.items():
 if isinstance(v,int):md.append(f'| {k} | {v} |')
md+=['','## Coverage by scope','','| Scope | Coverage counts |','|---|---|']
for k,v in counts['coverageByScopeKind'].items():md.append('| '+k+' | '+str(v['coverage'])+' |')
md+=['','All 114 image files were decoded and hashed. This automated run makes no visual assessment; historical human observations are separately labelled and all mappings remain nominal. The 16 SVGs (15 capital plans/sections and one continent concept) are layout diagrams, not appearance/construction sheets. Named people and most creatures only link realm motifs. No family image automatically covers its descendants.','', '## Highest dependency priority gaps','']
for r in [v for v in queue if '#' not in v['id'] and v['nextReferenceAction']!='PIXEL_AND_PANEL_AUDIT_BEFORE_NEW_IMAGE'][:50]:md.append(f'- `{r["id"]}` — {r["name"]}; referenced by {r["dependencyPriority"]} family dependencies; {r["referenceCoverage"]}.')
md+=['','The JSON includes every inventory record, every Phase I component label, Phase II module/variant source pointer, original image hash/path, Oath material/shape constraints, required views, proposed grouped commissioning IDs, complete priority queue and explicit nonvisual exclusions. Reproduce with `python tools/production/reference_inventory.py --output-dir /tmp/reference-inventory`.','', 'No complete production-reference coverage or visual approval is claimed. Exact image quantity is unresolved because a labelled shared-kit sheet can cover several IDs and a single articulated asset may need multiple sheets.']
(OUT/'aetherion-missing-reference-inventory.md').write_text('\n'.join(md)+'\n')


# Construction briefs consume the exact inventory built above.
root=ROOT;inv=result;rows={r['id']:r for r in inv['records']};images={r['id']:r for r in inv['originalImages']};briefs=[]
for r in inv['records']:
 if r['scopeKind']!='architecture_kit':continue
 spec=r['rawSourceSpecification'];modules=[v for v in inv['records'] if v.get('stableParentId')==r['id'] and v['scopeKind']=='architecture_module'];assert len(modules)==17
 references=[images[v] for v in r['explicitReferenceIds'] if v in images]
 brief={'stableKitId':r['id'],'name':r['name'],'oathIds':r['oathIds'],'baselineFamilyId':spec['baseline_asset_id'],'status':'GENERATION_READY_CONFIRMED_CONSTRUCTION_GAP','scope':'New supplementary construction views, preserve all recovered original art; no automatic model authorization or design approval','gapEvidence':spec['reference_evidence'],'sourceRecordPointers':r['sources'],'oathIdentity':r['oathStyleConstraints'],'purpose':spec['purpose'],'construction':spec['construction'],'materials':spec.get('materials'),'proposedScaleNotApproved':spec.get('proposed_physical_scale'),'existingStyleImages':[{'id':v['id'],'name':v['name'],'path':v['path'],'sha256':v['sha256'],'bytes':v['bytes'],'pixelInspection':v['currentPixelReview']} for v in references],'moduleCount':17,'coveredModuleRequirements':[{'pointerId':m['id'],'name':m['name'],'sourceSpecification':m['rawSourceSpecification']} for m in modules],'requiredSheetSet':[{'view':'Kit overview and connection grammar','content':'Preserve regional visible structure and palette from original pixels; show all seventeen modules with exact source names and pointer-to-panel mapping; human scale and assembly example.'},{'view':'Orthographic module faces','content':'Front, rear, left/right, top and undersides as needed; aligned consistent proposed meter grid; resolve hidden surfaces rather than copying the overview perspective.'},{'view':'Sections and interfaces','content':'Exploded load-bearing assembly, foundation/terrain contact, structural-edge connections, floor datum, roof seats, doors/windows, service routes, fasteners and trim boundaries.'},{'view':'Material and state details','content':'Separated structural/material regions with source-faithful finish; repair and weather exposure states; moving parts, pivots and swept clearances only where specified.'}],'generationInstructions':['Use original style image pixels as the primary visual anchor; inspect them before generation.','Keep the Oath distinct; do not recolor another region’s architecture or invent replacement approved silhouettes.','Explicitly identify each covered stable kit ID and module pointer in the companion coverage ledger; a kit image alone does not close seventeen module records.','Use enough readable sheets to resolve every module; do not cram unreadable detail into a quota image.','All numerical dimensions in the source are proposed and uncalibrated; label them accordingly.','Do not depict new disconnected continents or change the Unbound/Archivist/Weave premise.','Generated sheets remain PROPOSED until exact-art review; no construction gate passes from file existence.']}
 briefs.append(brief)
result={'format':'aetherion-reference-first-wave@1','sourceHead':inv['head'],'scope':'Fifteen confirmed missing Phase II architecture construction suites, 255 module pointers; not fifteen completed images','firstWaveOrder':['p2-arch-01-kiln-courts','p2-arch-03-relay-frames','p2-arch-04-tidal-reservoirs','p2-arch-05-fault-vaults'],'firstWaveOrderPolicy':'Start requested Kiln/Storm/Tidal/Fault identity anchors, then remaining Oaths; use actual IDs below if names differ. Order is workflow proposal, not canon.','reviewRequiredNotAutomaticGeneration':[r['id'] for r in inv['records'] if r['nextReferenceAction']=='PIXEL_AND_PANEL_AUDIT_BEFORE_NEW_IMAGE'],'briefs':briefs}
result['firstWaveOrder']=[b['stableKitId'] for oath in ['oath-01','oath-03','oath-04','oath-05'] for b in briefs if oath in b['oathIds']]+[b['stableKitId'] for b in briefs if not any(o in b['oathIds'] for o in ['oath-01','oath-03','oath-04','oath-05'])]
(OUT/'aetherion-reference-generation-first-wave.json').write_text(json.dumps(result,indent=2)+'\n');md=['# First reference generation wave','','15 architecture kits /255 explicit module pointers. These are confirmed missing construction suites, not replacement overview art and not a fixed fifteen-image quota. Existing material, weapon and turnaround families stay REVIEW_REQUIRED until their panel coverage is inspected.','']
for bid in result['firstWaveOrder']:
 b=next(v for v in briefs if v['stableKitId']==bid);md += [f'## {bid} — {b["name"]}','',b['purpose'],'',f'Baseline: `{b["baselineFamilyId"]}`. Materials: '+str(b['materials'])+'.','', 'Existing original anchors: '+', '.join('`'+r['path']+'` ('+r['sha256']+')' for r in b['existingStyleImages']), '', 'Explicit module coverage: '+', '.join('`'+m['name']+'`' for m in b['coveredModuleRequirements'])+'.','', 'Required: aligned orthographic faces, hidden-side sections, load paths and snap connections, human scale, material regions, terrain/foundation contact and relevant repair/motion states. All dimensions proposed, not approved. Full module specifications and pointer mappings are in the JSON.','']
(OUT/'aetherion-reference-generation-first-wave.md').write_text('\n'.join(md)+'\n')


# Fail loudly on identity, scope and input-integrity regressions. No approval inference.
assert len({r['id'] for r in inv['records']}) == len(inv['records'])
assert len(images) == inv['counts']['originalReferenceImages'] == 114
for source_image in read('validation/production/inventory.json')['reference_image_ledger']:
    assert images[source_image['reference_id']]['sha256'] == source_image['artifact']['sha256'], 'Original image differs from published inventory'
assert len(briefs) == 15 and sum(len(b['coveredModuleRequirements']) for b in briefs) == 255
assert len(inv['overlapEvidence']['physicalSettlementIdsAlsoPOIs']) == 60
assert len(inv['overlapEvidence']['districtIdsAlsoPOIs']) == 90
review_ids = set(inv['reviewRequiredPriorityQueue'])
assert all(not review_ids.intersection(g['requirementIds']) for g in inv['generationGroups'])
for brief in briefs:
    assert len(brief['coveredModuleRequirements']) == 17
    assert brief['existingStyleImages']
    for image in brief['existingStyleImages']:
        assert image['sha256'] == inputs[image['path']]
for relative, expected in inputs.items():
    assert hashlib.sha256((ROOT / relative).read_bytes()).hexdigest() == expected, f'Input changed: {relative}'
for filename in ('aetherion-missing-reference-inventory.json', 'aetherion-reference-generation-first-wave.json'):
    p = OUT / filename
    p.with_suffix(p.suffix + '.gz').write_bytes(gzip.compress(p.read_bytes(), compresslevel=9, mtime=0))
receipt = {
    'status': 'CONSISTENCY_AND_BYTE_INTEGRITY_CHECKS_PASS_NOT_VISUAL_APPROVAL',
    'sourceHead': inv['head'],
    'python': sys.version.split()[0],
    'pillow': PIL.__version__,
    'generatorSha256': hashlib.sha256(Path(__file__).read_bytes()).hexdigest(),
    'inputSha256': inputs,
    'checks': ['unique identity rows', '114 decodable originals', '15 kits and 255 modules',
               '60 settlement and 90 district overlaps', 'no review-required automatic commissions',
               'brief image hashes match decoded originals', 'all inputs unchanged during run'],
    'outputSha256': {p.name: hashlib.sha256(p.read_bytes()).hexdigest() for p in sorted(OUT.iterdir())
                     if p.is_file() and p.name.startswith('aetherion-')},
}
(OUT / 'reference-inventory-verification.json').write_text(json.dumps(receipt, indent=2) + '\n')
print(json.dumps({'outputDir': str(OUT), 'rows': len(inv['records']), 'kits': len(briefs), 'status': receipt['status']}))
