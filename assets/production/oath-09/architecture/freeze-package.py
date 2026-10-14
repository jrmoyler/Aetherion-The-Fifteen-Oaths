from pathlib import Path
import json,hashlib,datetime
P=Path(__file__).resolve().parent
old=json.loads((P/'lineage/r02-final-FREEZE.json').read_text());allow={r['path'] for r in old['files']}
allow.update(['lineage/r02-final-FREEZE.json','lineage/r02-final-GEOMETRY_FREEZE.json','author-lods.py','group-lod-sources.py','check-lod-interfaces.py','freeze-package.py','lod-authoring-report.json','lod-glb-request.json','lod-glb-validation.json','lod-glb-validation-validator-details.json','lod-godot-validation.json','lod-interface-validation.json','lod-comparison-1.png','lod-comparison-2.png'])
allow.update(str(f.relative_to(P)) for f in (P/'modules').glob('*/lod[12].png'))
rows=[]
for name in sorted(allow):
 f=P/name;rows.append({'path':name,'bytes':f.stat().st_size,'sha256':hashlib.sha256(f.read_bytes()).hexdigest()})
receipt={'schemaVersion':1,'status':'FROZEN_R03_UNAPPROVED_CANDIDATE','createdAt':datetime.datetime.now(datetime.timezone.utc).isoformat(),'scope':'17 module candidates /51 visual GLBs/15 proxies;5 derivative fixtures;22 total source blend files/71 GLBs. Ten strict LOD repairs, no completed family/visual acceptance.','proposedPublicationRoot':'assets/production/oath-09/architecture','previousFreezeSha256':hashlib.sha256((P/'lineage/r02-final-FREEZE.json').read_bytes()).hexdigest(),'geometryFreezeSha256':hashlib.sha256((P/'GEOMETRY_FREEZE.json').read_bytes()).hexdigest(),'files':rows,'fileCount':len(rows),'totalBytes':sum(r['bytes'] for r in rows),'excluded':['.blend1 backups','unlisted transient logs/cache','FREEZE.json and SHA256SUMS are receipts copied separately']}
(P/'FREEZE.json').write_text(json.dumps(receipt,indent=2)+'\n');(P/'SHA256SUMS').write_text(''.join(r['sha256']+'  '+r['path']+'\n' for r in rows));print(receipt['fileCount'],receipt['totalBytes'],hashlib.sha256((P/'FREEZE.json').read_bytes()).hexdigest())
