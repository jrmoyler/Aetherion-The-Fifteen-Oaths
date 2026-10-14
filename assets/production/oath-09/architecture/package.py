from pathlib import Path
import json,hashlib,html,shutil,os
from PIL import Image,ImageDraw
O=Path(__file__).resolve().parent;R=Path(os.environ.get('AETHERION_REPOSITORY','/workspace/Aetherion-The-Fifteen-Oaths'));kit=json.loads((O/'source-kit-record.json').read_text());rows=[]
original=O/'references';original.mkdir(exist_ok=True)
refs=[R/'assets/references/reference-105/original.png']+[R/'assets/references/proposed-expansion-2026-10-13/generated'/name for name in ['p2-arch-09-daybreak-arcades-proposed-v01.png','daybreak-foundation-floor-proposed-v01.png','daybreak-wall-window-corner-proposed-v01.png','daybreak-surface-trim-proposed-v01.png','daybreak-clinic-threshold-door-proposed-v01.png','daybreak-roof-canopy-proposed-v01.png','daybreak-stair-ramp-proposed-v01.png','daybreak-daylight-baffle-proposed-v02.png']]
refrows=[]
for p in refs:
 name='reference-105-original.png' if p.name=='original.png' else p.name;dst=original/name;shutil.copyfile(p,dst);refrows.append({'source_repository_path':str(p.relative_to(R)),'local_review_copy':'references/'+name,'sha256':hashlib.sha256(p.read_bytes()).hexdigest(),'status':'ORIGINAL_BINDING_VISUAL_REFERENCE' if p.name=='original.png' else 'PROPOSED_NOT_APPROVED','pixels_inspected':True})
for i,spec in enumerate(kit['modules']):
 slug=spec['name'].replace(' ','-');D=O/'modules'/slug;m=json.loads((D/'module.json').read_text());a=D/'lod0.glb';prefix='modules/'+slug+'/';files={'blend':prefix+'source.blend','glb':prefix+'lod0.glb','lod1':prefix+'lod1.glb','lod2':prefix+'lod2.glb','textures':[str(p.relative_to(O)) for p in sorted((O/'textures').glob('*.png'))],'renders':[prefix+'hero.png']}
 if (D/'collision.glb').exists():files['collision']=prefix+'collision.glb'
 for level in [1,2]:
  if (D/f'lod{level}.png').exists():files['renders'].append(prefix+f'lod{level}.png')
 if (D/'open.png').exists():files['renders'].append(prefix+'open.png')
 rows.append({'id':kit['baseline_asset_id']+'__'+slug+'__'+('candidate-r03' if (D/'lod1.png').exists() else 'candidate-r01'),'archetypeId':kit['baseline_asset_id']+'__'+slug,'idScope':'Derived production-artifact identity, not a new canon family/module ID','name':'Daybreak '+spec['name'],'type':'architecture','status':'PRODUCTION_CANDIDATE_UNREVIEWED','baseline_asset_id':kit['baseline_asset_id'],'specification_ids':[kit['id']],'originalModuleName':spec['name'],'sourcePointer':f'AETHERION_CANON/21_WORLD_CONSTRUCTION_PHASE_II/ARCHITECTURAL_KIT_REGISTRY.json#/records/8/modules/{i}','referenceIds':['reference-105'],'files':files,'dimensionsCoordinateSystem':'BLENDER_Z_UP','dimensionsMeters':[b-a for a,b in zip(*m['actual_bounds_blender_m'])],'proposedTargetExtentMeters':spec['target_extent_m'],'triangles':{k.replace('lod0','glb'):v for k,v in m['lod_triangle_counts'].items()},'rig':{'type':'Three rigid louver pivot nodes; no artificial skeletal rig' if slug=='daylight-baffle' else 'Static architectural shell; no rig','bones':0},'animations':['daylight_baffle_open_close'] if slug=='daylight-baffle' else [],'sockets':m['sockets'],'remainingGates':['Exact visual reference fidelity and review','Full semantic socket fit / mixed-family and stacked-floor fixtures','All event/repair/damage/restoration variants','Runtime collision/nav/controller traversal','Unreal real import; browser GPU parity; hardware performance','Physical mip/texel-density target and source texture refinement']+(['Mechanism occupancy/reservation/state authority, hard-stop swept-contact tests and floor-reachable manual release'] if slug=='daylight-baffle' else [])})
(O/'manifest.json').write_text(json.dumps({'schemaVersion':1,'familyId':kit['baseline_asset_id'],'oath_id':'oath-09','specification_ids':[kit['id']],'revision':'candidate-r03','status':'PRODUCTION_CANDIDATE_UNREVIEWED','referenceIds':['reference-105'],'axes':'Blender Z-up meters; glTF exporter converts to Y-up exactly once','assets':rows,'fixtureCountingPolicy':'5 derivative assembly fixtures are not additional module designs. 17 original module requirements are mapped; zero full family/visual approvals.','referenceEvidence':refrows},indent=2)+'\n')
work=json.loads((O/'work-list.json').read_text());work['status']='ALL_17_MODULE_REQUIREMENTS_HAVE_UNAPPROVED_CANDIDATES_FULL_KIT_INCOMPLETE'
for m in work['modules']:m['status']='AUTHORED_CANDIDATE_UNAPPROVED'
(O/'work-list.json').write_text(json.dumps(work,indent=2)+'\n')
ims=sorted((O/'modules').glob('*/hero.png'));sheet=Image.new('RGB',(960,1620),(235,235,233));draw=ImageDraw.Draw(sheet)
for i,p in enumerate(ims):
 im=Image.open(p).convert('RGB');im.thumbnail((310,238));x=(i%3)*320;y=(i//3)*270;sheet.paste(im,(x+(320-im.width)//2,y));draw.text((x+8,y+241),p.parent.name,fill=(20,20,20))
sheet.save(O/'module-contact-sheet.png')
parts=['<!doctype html><meta charset="utf-8"><meta name="viewport" content="width=device-width"><title>Daybreak architecture candidate r03</title><style>body{font:17px system-ui;background:#202124;color:#eee;max-width:1350px;margin:auto;padding:24px}a{color:#9fd6ff}.grid{display:grid;grid-template-columns:repeat(auto-fit,minmax(300px,1fr));gap:20px}img{width:100%;height:auto}figure{margin:0}small{color:#ddd}</style><h1>Daybreak architecture — candidate r03</h1><p>17 required modules, 5 derivative assembly fixtures. Zero accepted designs. Sources, typed interfaces and exports are review candidates; gameplay, event variants and final visual matching remain incomplete.</p><p><a href="README.md">Scope and evidence</a> · <a href="manifest.json">Runtime manifest</a> · <a href="work-list.json">Original requirement mapping</a></p><h2>Reference evidence</h2><div class="grid">']
for r in refrows:parts.append(f'<figure><a href="{r["local_review_copy"]}"><img loading="lazy" src="{r["local_review_copy"]}"></a><figcaption>{html.escape(r["status"])}<br><small>{html.escape(r["source_repository_path"])}</small></figcaption></figure>')
parts.append('</div><h2>Actual Blender CPU module renders</h2><div class="grid">')
for p in ims:
 slug=p.parent.name;parts.append(f'<figure><a href="modules/{slug}/hero.png"><img loading="lazy" src="modules/{slug}/hero.png"></a><figcaption>{slug} · UNAPPROVED<br><a href="modules/{slug}/source.blend">Blender source</a> · <a href="modules/{slug}/lod0.glb">GLB</a> · <a href="modules/{slug}/module.json">Sockets/bounds</a></figcaption></figure>')
parts.append('</div><h2>Derivative fixtures — not finished buildings</h2><div class="grid">')
for p in sorted((O/'fixtures').glob('*/hero.png')):parts.append(f'<figure><img loading="lazy" src="fixtures/{p.parent.name}/hero.png"><figcaption>{p.parent.name} · UNVALIDATED TRAVERSAL</figcaption></figure>')
parts.append('</div><h2>Articulated baffle open state</h2><img style="max-width:900px" src="modules/daylight-baffle/open.png">');(O/'index.html').write_text(''.join(parts))
print('Manifest/galleries prepared')

exec((O/'finalize-metadata.py').read_text())
