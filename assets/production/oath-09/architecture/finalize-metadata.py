from pathlib import Path
import json,hashlib
P=Path(__file__).resolve().parent
report=P/'source-validation.json';data=json.loads(report.read_text());records={r['module']:r for r in data['reports']};m=json.loads((P/'manifest.json').read_text());m['filePathBase']='MANIFEST_DIRECTORY'
for asset in m['assets']:
 slug=asset['originalModuleName'].replace(' ','-');record=records[slug];assert record['opened'] is True and not record['errors'];assert hashlib.sha256((P/asset['files']['blend']).read_bytes()).hexdigest()==record['source_sha256']
 asset['sourceValidation']={'report':'assets/production/oath-09/architecture/source-validation.json','reportSha256':hashlib.sha256(report.read_bytes()).hexdigest(),'recordId':slug}
 if slug=='shade-canopy':asset['collisionPolicy']={'mode':'NONE','reason':'Non-solid overhead woven shade; the separate supporting colonnade supplies movement collision. Fabric does not provide a walkable or blocking gameplay surface.'}
 elif slug=='daylight-baffle':
  asset['collisionPolicy']={'mode':'PENDING','reason':'State-specific moving-body and interaction collision are not authored; the decorative animation is not a collision-ready gameplay mechanism.','remainingGate':'State-specific interaction/collision and runtime authority validation'}
  asset['status']='CANDIDATE_INCOMPLETE_MISSING_REQUIRED_COLLISION'
  if asset['collisionPolicy']['remainingGate'] not in asset['remainingGates']:asset['remainingGates'].append(asset['collisionPolicy']['remainingGate'])
 else:asset['collisionPolicy']={'mode':'REQUIRED','reason':'Separate authored movement proxy supplied; actual engine physics assignment and controller traversal remain unvalidated.'}
(P/'manifest.json').write_text(json.dumps(m,indent=2)+'\n')
# Preserve source identity across review metadata filename migration.
old=json.loads((P/'lineage/r01-FREEZE.json').read_text());changed=[];unchanged=[]
for row in old['files']:
 if not row['path'].startswith(('modules/','fixtures/','textures/','references/')):continue
 newpath=row['path']
 if newpath.startswith('modules/') and newpath.endswith('/manifest.json'):newpath=newpath[:-13]+'module.json'
 elif newpath.startswith('fixtures/') and newpath.endswith('/manifest.json'):newpath=newpath[:-13]+'fixture.json'
 f=P/newpath;sha=hashlib.sha256(f.read_bytes()).hexdigest();entry={'path':newpath,'r01_path':row['path'],'sha256':sha,'bytes':f.stat().st_size,'r01_sha256':row['sha256'],'metadataPathRenamed':newpath!=row['path']};(changed if sha!=row['sha256'] else unchanged).append(entry)
receipt={'status':'GEOMETRY_FROZEN_R02_UNAPPROVED_METADATA_PATHS_FINAL','lineage':'r01 FREEZE 1e0017444b1c84cce5538de38843d3f87766f0a308aa541b8cbbb29ac4fb0092','previousR02GeometryReceipt':'4ee710084709215ee0376613d6f5f8975b8c64dd514f3353f2109ff129c0730f','policy':'Nine full300mm exposed treads; tenth riser belongs receiving160mm landing fascia at y2.70,z1.44..1.60. Proxy endpoint/socket unchanged. No intrusive terminal riser body.','metadataNaming':'Only runtime root uses manifest.json; nested construction metadata renamed module.json and fixture.json without geometry changes. r01_path preserves provenance.','changed':changed,'unchanged':unchanged};(P/'GEOMETRY_FREEZE.json').write_text(json.dumps(receipt,indent=2)+'\n')
print('Truthful collision policy and compressed-source report pins finalized; lineage',len(changed),'changed-content',len(unchanged),'unchanged-content')
