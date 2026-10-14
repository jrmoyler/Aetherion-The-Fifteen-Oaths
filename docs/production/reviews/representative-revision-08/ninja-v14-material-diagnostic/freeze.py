from pathlib import Path
import json,hashlib,datetime
p=Path(__file__).resolve().parent;d=p/'kiln-ninja-ensemble-candidate'
def row(f):return {'path':str(f.relative_to(p)),'bytes':f.stat().st_size,'sha256':hashlib.sha256(f.read_bytes()).hexdigest()}
files=[p/'material_diagnostic.py']+sorted((p/'baseline').glob('*'))+sorted(d.glob('*.blend'))+sorted(d.glob('*.glb'))+sorted(d.glob('*.png'))
receipt={'status':'FROZEN_MATERIAL_ONLY_DIAGNOSTIC_UNAPPROVED_PENDING_INDEPENDENT_REVIEW','utc':datetime.datetime.now(datetime.timezone.utc).isoformat(),'baseline':'Frozen V13 geometry; embedded baseline files are part of this receipt.','note':'No geometry, UV, rig or animation change; procedural material bake and resource-only GLB patch. No visual acceptance or engine parity claim. Do not mutate these inputs.','files':[row(f) for f in files]}
(p/'material-freeze-receipt.json').write_text(json.dumps(receipt,indent=2)+'\n')
files=[f for f in p.rglob('*') if f.is_file() and 'diagnostic-pass1' not in f.parts and f.name!='SHA256SUMS.json'];rows=[row(f) for f in sorted(files)];(p/'SHA256SUMS.json').write_text(json.dumps({'totalFiles':len(rows),'totalBytes':sum(r['bytes'] for r in rows),'files':rows},indent=2)+'\n')
print('receipt',len(receipt['files']),hashlib.sha256((p/'material-freeze-receipt.json').read_bytes()).hexdigest());print('manifest',len(rows),sum(r['bytes'] for r in rows),hashlib.sha256((p/'SHA256SUMS.json').read_bytes()).hexdigest());print(next(r for r in rows if r['path']=='kiln-ninja-ensemble-candidate/kiln-ninja-ensemble-candidate.blend'))
