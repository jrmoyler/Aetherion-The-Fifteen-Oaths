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
# Pin all inherited payloads and exact changes against frozen r02.
old=json.loads((P/'lineage/r04-final-FREEZE.json').read_text());changed=[];unchanged=[]
for row in old['files']:
 if not row['path'].startswith(('modules/','fixtures/','textures/','references/')):continue
 f=P/row['path'];sha=hashlib.sha256(f.read_bytes()).hexdigest();entry={'path':row['path'],'sha256':sha,'bytes':f.stat().st_size,'r04_sha256':row['sha256']};(changed if sha!=row['sha256'] else unchanged).append(entry)
receipt={'status':'GEOMETRY_FROZEN_R05_UNAPPROVED','lineage':'r04 FREEZE b08331817661347462f07d96e586fbaccbd51751b77493ef17bb012bcbe22fd8','policy':'R05 socket identity/membership/adapter-transform repair only. Two module sources and four lowerLOD exports carry canonical socket identity; allfive fixture sources/exports checked and repaired. Visible mesh/material/texture/animation and sourcecollision geometry preserved. LOD0, movementproxyGLBs and primaryrender bytes identical to r04. Earlier socket-check omissions recorded in lineage. No art/physics acceptance','changed':changed,'unchanged':unchanged}
(P/'GEOMETRY_FREEZE.json').write_text(json.dumps(receipt,indent=2)+'\n')
print('Geometry lineage',len(changed),'changed',len(unchanged),'unchanged')
