from pathlib import Path
import json,hashlib,datetime
p=Path(__file__).parent
rows=[]
for f in sorted(p.rglob('*')):
 if f.is_file() and f.name not in ['REVIEW_EVIDENCE.json','SHA256SUMS']:
  rows.append({'path':str(f.relative_to(p)),'bytes':f.stat().st_size,'sha256':hashlib.sha256(f.read_bytes()).hexdigest()})
e={'status':'FROZEN_FOCUSED_DIAGNOSTIC_NOT_EXACT_REFERENCE_ACCEPTED','generatedAt':datetime.datetime.now(datetime.timezone.utc).isoformat(),'reference':'reference-053.original.png','referenceAndFinalPixelsInspected':True,'finalRenders':['amethyst-short-blade/matched-front-review.png','amethyst-short-blade/matched-profile-review.png'],'renderScope':'Two actual Blender Cycles CPU views, 256 samples; no full render set or engine/GPU appearance acceptance','sourceInspection':json.loads((p/'source-inspection.json').read_text()),'localImport':json.loads((p/'blender-glb-import.json').read_text()),'uv':json.loads((p/'uv-audit.json').read_text()),'gltfIssues':json.loads((p/'glb-validation.json').read_text())['issues'],'remainingVisualGates':['Broad primary stone cells still read as tiles','Long substrate rails in profile','Continuous longitudinal crystal insert','Bulky simplified collar','Simplified pommel and regular grip'],'fileCount':len(rows),'totalBytes':sum(x['bytes'] for x in rows),'files':rows}
(p/'REVIEW_EVIDENCE.json').write_text(json.dumps(e,indent=2)+'\n')
rows.append({'path':'REVIEW_EVIDENCE.json','sha256':hashlib.sha256((p/'REVIEW_EVIDENCE.json').read_bytes()).hexdigest()})
(p/'SHA256SUMS').write_text(''.join(x['sha256']+'  '+x['path']+'\n' for x in rows))
print(e['fileCount'],e['totalBytes'],rows[-1]['sha256'])
