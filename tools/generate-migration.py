#!/usr/bin/env python3
"""Build source-preserving migration evidence from an explicitly pinned local source.
Only reads source; writes generated evidence to destination. Does not use the network.
"""
import pathlib, json, hashlib, subprocess, re, collections, sys
ROOT=pathlib.Path(__file__).resolve().parents[1]
SOURCE=pathlib.Path(sys.argv[1]).resolve() if len(sys.argv)>1 else ROOT.parent/'source'
PREFIX=pathlib.Path('runtime/ability-matrix')
SHA='4c4a1eb6de6b17fba94c6a074d28cb6b9f32d451'
assert subprocess.check_output(['git','-C',str(SOURCE),'rev-parse','HEAD'],text=True).strip()==SHA
assert not subprocess.check_output(['git','-C',str(SOURCE),'status','--porcelain'],text=True).strip(), 'Source must be unmodified'
paths=subprocess.check_output(['git','-C',str(SOURCE),'ls-files','-z']).decode().split('\0')[:-1]
sha256=lambda data:hashlib.sha256(data).hexdigest()
source_modes={line.split('\t',1)[1]:line.split()[0] for line in subprocess.check_output(['git','-C',str(SOURCE),'ls-tree','-r','HEAD'],text=True).splitlines()}
def write(name,value):
 p=ROOT/name;p.parent.mkdir(parents=True,exist_ok=True);p.write_text(json.dumps(value,indent=2)+'\n')
files=[]
for p in paths:
 data=(SOURCE/p).read_bytes(); dest=ROOT/PREFIX/p
 assert dest.read_bytes()==data,p
 files.append({'sourcePath':p,'destinationPath':str(PREFIX/p),'bytes':len(data),'sha256':sha256(data),'mode':source_modes[p],'category':'asset' if pathlib.Path(p).suffix.lower() in ['.png','.jpg','.hdr','.fbx','.glb','.wasm','.task'] else 'source-or-support'})
catalog=json.loads((SOURCE/'presets/catalog.json').read_text());library=json.loads((SOURCE/'presets/library.json').read_text())
entries=[a for a in catalog['abilities'] if a['status']=='live' and a['kind'] in ['ability','buff','summon']]
oaths=['KILN OATH','RIME ARCHIVE','STORM RELAY','TIDAL COVENANT','FAULT CHOIR','REED RESONANCE','GRAFT SANCTUARY','BITTERGLASS GUILD','OATH OF DAYBREAK','TIDAL OBSERVATORY','THE MISSING COURT','SANGUINE COVENANT','FOLDED THEATRE','ESCAPEMENT ROAD','IMPULSE FOUNDRY']
mapping=[{'sourceElementId':e['id'],'sourceElementLabel':e['label'],'sourceCount':e['count'],'oathId':f'oath-{i+1:02d}','oathName':oaths[i],'mappingStatus':'LOCKED_ELEMENT_TO_OATH; PROPOSED_TECHNICAL_ID'} for i,e in enumerate(catalog['elements'])]
by_element={m['sourceElementId']:m for m in mapping}
native=['collective','matrix-new','atlas','codex']
imports=re.compile(r'(?:\bfrom\s*|\bimport\s*\(\s*|\bimport\s*)[\'\"]([^\'\"]+)[\'\"]')
def dependencies(p,seen=None):
 seen=set() if seen is None else seen
 if p in seen:return seen
 seen.add(p)
 for match in imports.finditer((SOURCE/p).read_text()):
  spec=match[1]
  if spec.startswith('.'):
   target=(SOURCE/p).parent/spec
   target=target.resolve()
   if target.is_file():dependencies(str(target.relative_to(SOURCE)),seen)
 return seen
source_entries={}
for group in native:
 for p in (SOURCE/f'packs/sandbox/src/abilities/{group}').glob('*.js'):
  code=p.read_text();m=re.search(r"export const ID\s*=\s*['\"]([^'\"]+)['\"]",code)
  if m:source_entries[f'{group}/{m[1]}']=str(p.relative_to(SOURCE))
for group in ['linear','linear-ext','linear-extended','handcast','casting']:
 path=f'packs/sandbox/src/vendor/{group}/abilities/AbilityManager.js';code=(SOURCE/path).read_text()
 binding={name.strip():str((pathlib.Path(path).parent/spec)) for name,spec in re.findall(r"import\s*\{\s*(\w+)\s*\}\s*from\s*['\"]([^'\"]+)['\"]",code)}
 block=re.search(r'const ABILITY_TYPES\s*=\s*\{(.*?)\};',code,re.S)[1]
 for key,name in re.findall(r'(\w+)\s*:\s*(\w+)',block):source_entries[f'{group}/{key}']=str(pathlib.Path(binding[name]))
for id,name in [('boost','ElectricBoost'),('magic','MagicBoost'),('fire','FireBoost')]:source_entries[f'linear-ext/{id}']=f'packs/sandbox/src/vendor/linear-ext/effects/{name}.js'
assert set(source_entries)=={e['uid'] for e in entries}, (set(source_entries)-{e['uid'] for e in entries}, {e['uid'] for e in entries}-set(source_entries))
# Public files are preserved at original relative URLs. Required model sets below
# are traced to sandbox App.load and source runtime loaders, not imagined art.
host=['models/Idle.fbx','models/cast1.fbx','models/cast2.fbx','models/cast3.fbx','models/dummy.fbx','models/diffuse.png','hdri/spruit_sunrise.hdr','textures/cathedral/ao.jpg','textures/cathedral/color.jpg','textures/cathedral/normal.jpg','textures/cathedral/roughness.jpg']
packmodels={'linear':[],'linear-ext':[],'linear-extended':['snake.glb'],'handcast':['drone.glb','monowheelArmyBot.glb','phoenix_bird.glb'],'casting':['shark.glb','wolf.glb','dragon.glb','magical_gyroscope.glb','amethyst_stones.glb','arcane_tome.glb','wildroot_reliquary.glb']}
records=[]
for e in entries:
 uid=e['uid'];p=source_entries[uid];deps=sorted(dependencies(p));mm=by_element[e['element']]
 paths_assets=[f'packs/sandbox/public/{x}' for x in host]+[f'packs/sandbox/public/models/{x}' for x in packmodels.get(e['pack'],[])]
 assert all((SOURCE/a).is_file() for a in paths_assets)
 record={'uid':uid,'sourceCatalog':e,'sourcePreset':library['presets'][uid],
  'provenance':{'sourceId':'SRC-ABILITY-MATRIX-4c4a1eb','repository':'https://github.com/jrmoyler/Ability-Matrix','commit':SHA,'presetPath':f'presets/{uid}.json','implementationPath':p,'implementationURL':f'https://github.com/jrmoyler/Ability-Matrix/blob/{SHA}/{p}'},
  'implementation':{'destinationPath':str(PREFIX/p),'runtime':'native-sandbox' if e['pack'] in native else 'vendored-source-pack','adapterCall':f"runAction('{e['pack']}', '{e.get('action',e['id'])}')" if e['kind']=='buff' else f"cast('{uid}')",'sourceModuleDependencies':[str(PREFIX/x) for x in deps], 'vfxModuleDependencies':[str(PREFIX/x) for x in deps if any(f'/{k}/' in x for k in ['materials','assets','particles','effects'])], 'animation':{'castClip':e.get('castAnim'), 'characterClips':[str(PREFIX/f'packs/sandbox/public/models/{x}.fbx') for x in ['Idle','cast1','cast2','cast3']], 'status':'SOURCE_IMPLEMENTED; VISUAL_REVIEW_PENDING'},'sharedHostAndLazyPackAssets':[str(PREFIX/a) for a in paths_assets],'assetScope':'Conservative shared-host plus full lazy-pack model requirements; not an assertion that each spell uses every listed model. Model-internal textures and clips remain embedded in unchanged binary assets.','audio':{'status':'MISSING','detail':'No audio file or implemented audio service was identified; sound direction is proposed canon.'}},
  'proposedAetherion':{'status':'PROPOSED','oathId':mm['oathId'],'oathName':mm['oathName'],'combat':'Preserved source sandbox cast and dummy interaction. Production combat/balance not validated.','environment':'PROPOSED: consult elemental interaction rules; not executed by source','crafting':'PROPOSED: realm profession integrations; not executed by source','progression':'PROPOSED: multi-Oath progression and permissions; not executed by source','network':'PROPOSED: authoritative command/effect contract; source is local sandbox'},
  'validation':{'status':'IMPORTED','reason':'Byte-preserved source/preset and dispatch routing verified; complete GPU, hit, animation, and interactive behavior still require validation.','evidence':['CASTABLE_SOURCE_MANIFEST.json','tests/ability-adapter.test.mjs','tests/migration-integrity.test.mjs'],'sourceIdentity':'VERIFIED','sourceBytes':'VERIFIED','adapterDispatch':'VERIFIED_ROUTING_ONLY','cpuLifecycle':'PENDING','gpuVisual':'NOT_RUN','audio':'MISSING','productionIntegration':'PROPOSED'}}
 records.append(record)
# Attach measured CPU evidence without promoting incomplete GPU/gameplay validation.
raw_path=ROOT/'validation/cpu-lifecycle-audit.json'
fixture_path=ROOT/'validation/texture-fixture-cpu-audit.json'
if raw_path.exists():
 raw_report=json.loads(raw_path.read_text());raw_results={r['uid']:r for r in raw_report['results']}
 fixtures={r['uid']:r for r in json.loads(fixture_path.read_text())['results']} if fixture_path.exists() else {}
 for record in records:
  uid=record['uid'];result=raw_results.get(uid)
  if not result:continue
  v=record['validation'];v['moduleImport']='VERIFIED' if result.get('import')=='passed' else 'FAILED'
  v['rawSourceCpuOutcome']=result['status'];v['cpuEvidence']='validation/cpu-lifecycle-audit.json';v['cpuChecks']=result.get('checks',[]);v['limitations']=result.get('limitations',[])
  v['cpuLifecycle']='VERIFIED_RAW_CPU_SCOPE' if result['status']=='passed-cpu-lifecycle-only' else 'BLOCKED_OR_FAILED_RAW_SOURCE'
  if uid=='linear/meteor':
   v['cpuLifecycle']='VERIFIED_REPAIRED_CPU_SCOPE';v['cpuEvidence']='tests/adapter-meteor-runtime.test.mjs';v['sourceDefect']='Original hosted Linear runtime omits ctx.fissures; destination restores original FissureSystem outside source snapshot.';v['evidence']+=['validation/meteor-source-defect.json','tests/linear-fissures-integration.test.mjs','tests/adapter-meteor-runtime.test.mjs'];record['implementation']['destinationOverlay']='src/abilities/LinearFissuresIntegration.js'
  if uid in fixtures and fixtures[uid]['status']=='passed-cpu-lifecycle-only':
   v['cpuLifecycle']='VERIFIED_CPU_WITH_REAL_IMAGE_DECODE_FIXTURE';v['cpuEvidence']='validation/texture-fixture-cpu-audit.json';v['cpuChecks']=fixtures[uid].get('checks',[]);v['limitations'].append('Test-only source JPEG-to-DataTexture image decode boundary; browser decode/GPU sampling not validated.');v['evidence'].append('validation/texture-fixture-cpu-audit.json')
  v['evidence'].append('validation/cpu-lifecycle-audit.json');v['gpuVisual']='BLOCKED';v['status']='IMPORTED';v['reason']='Original source and dependencies preserved; scoped CPU evidence exists, but full GPU, populated-target, authored-character and interactive gameplay validation remains incomplete.'
write('CASTABLE_SOURCE_MANIFEST.json',{'format':'aetherion-source-manifest@1','sourceId':'SRC-ABILITY-MATRIX-4c4a1eb','sourceRepository':'https://github.com/jrmoyler/Ability-Matrix','sourceCommit':SHA,'destinationRepository':'https://github.com/jrmoyler/Aetherion-The-Fifteen-Oaths','destinationAtDiscovery':{'state':'EMPTY','commit':None,'existingCastables':0,'existingAssets':0,'existingCanon':0},'migrationMode':'complete-byte-preserved-tracked-snapshot','sourceReadOnly':True,'fileCount':len(files),'totalBytes':sum(f['bytes'] for f in files),'files':files})
write('CASTABLE_REGISTRY.json',{'format':'aetherion-castable-registry@1','sourceId':'SRC-ABILITY-MATRIX-4c4a1eb','sourceCommit':SHA,'statusPolicy':{'VERIFIED':'Only explicitly scoped behavior actually exercised by recorded tests; never inferred from code presence.','IMPORTED':'Original implementation and dependencies copied; full applicable behavior not validated.','BLOCKED':'An identified missing dependency or failed applicable gate prevents use.','MISSING':'No source implementation exists.'},'castableCount':len(records),'kindCounts':dict(collections.Counter(e['kind'] for e in entries)),'excludedFromCastableCount':{'moves':11,'archived':7,'detail':'Preserved in source snapshot, not promoted to castables.'},'elements':mapping,'castables':records})
print(json.dumps({'sourceSHA':SHA,'files':len(files),'bytes':sum(f['bytes'] for f in files),'castables':len(records),'kinds':dict(collections.Counter(e['kind'] for e in entries)),'elements':len(mapping)}))
