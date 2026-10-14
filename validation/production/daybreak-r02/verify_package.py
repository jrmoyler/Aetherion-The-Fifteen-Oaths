"""Validate the curated Daybreak r01/r02 evidence package; no engine claims."""
from pathlib import Path
import hashlib,json,re
from PIL import Image
ROOT=Path(__file__).resolve().parent

def sha(p):return hashlib.sha256(p.read_bytes()).hexdigest()
def verify():
 evidence=json.loads((ROOT/'evidence.json').read_text());expected={r['path']:r for r in evidence['files']};actual={str(p.relative_to(ROOT)) for p in ROOT.rglob('*') if p.is_file() and p!=ROOT/'evidence.json'}
 assert actual==set(expected),{'missing':sorted(set(expected)-actual),'extra':sorted(actual-set(expected))}
 for name,row in expected.items():
  p=ROOT/name;assert p.stat().st_size==row['bytes'] and sha(p)==row['sha256'],name
  assert p.suffix not in ('.blend','.glb','.gltf','.import') and '.godot' not in p.parts and '__pycache__' not in p.parts,'Disallowed asset/cache: '+name
 index=json.loads((ROOT/'imports/EVIDENCE_INDEX.json').read_text())
 for row in index['files']:
  p=ROOT/'imports'/row['path'];assert p.stat().st_size==row['bytes'] and sha(p)==row['sha256'],row['path']
 json_count=0;png_count=0
 for p in ROOT.rglob('*.json'):json.loads(p.read_text());json_count+=1
 for p in ROOT.rglob('*.png'):
  with Image.open(p) as im:im.load();png_count+=1
 links=re.findall(r'\]\(([^)]+)\)',(ROOT/'README.md').read_text())
 for link in links:assert (ROOT/link).is_file(),link
 issues=json.loads((ROOT/'imports/r02/project-validator-errors.json').read_text());failures=[(r['id'],e['code']) for r in issues for e in r.get('errors',[])];assert len(failures)==10 and all(code=='LOD_NOT_REDUCED' for _,code in failures),failures
 print(json.dumps({'status':'PASS','listedFiles':len(expected),'listedBytes':sum(r['bytes'] for r in expected.values()),'curatedImportRowsVerified':len(index['files']),'jsonDecoded':json_count,'pngDecoded':png_count,'readmeLinks':len(links),'preservedProjectErrors':len(failures)},indent=2))
if __name__=='__main__':verify()
