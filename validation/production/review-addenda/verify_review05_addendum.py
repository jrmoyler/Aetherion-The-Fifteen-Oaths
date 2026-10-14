"""Verify immutable review05 plus the one explicitly pinned parent addendum."""
from pathlib import Path
import argparse,hashlib,json,tempfile
HERE=Path(__file__).resolve().parent

def sha(p):return hashlib.sha256(p.read_bytes()).hexdigest()
def audit(root,expected):
 actual={str(p.relative_to(root)) for p in root.rglob('*') if p.is_file()}
 errors=[]
 for p in sorted(set(expected)-actual):errors.append('Missing: '+p)
 for p in sorted(actual-set(expected)):errors.append('Unexpected: '+p)
 for name in sorted(actual&set(expected)):
  p=root/name;r=expected[name]
  if p.stat().st_size!=r['bytes'] or sha(p)!=r['sha256']:errors.append('Tampered: '+name)
 return errors

def self_test():
 with tempfile.TemporaryDirectory(prefix='review05-addendum-fixture-') as d:
  root=Path(d);p=root/'original';p.write_text('original');q=root/'parent';q.write_text('parent')
  exp={x.name:{'bytes':x.stat().st_size,'sha256':sha(x)} for x in [p,q]}
  assert not audit(root,exp)
  extra=root/'unlisted';extra.write_text('extra');assert audit(root,exp)==['Unexpected: unlisted'];extra.unlink()
  q.unlink();assert audit(root,exp)==['Missing: parent'];q.write_text('parent')
  p.write_text('changed!');assert audit(root,exp)==['Tampered: original']
 return {'positive':1,'negativeExtraMissingTampered':3,'status':'PASS'}

def main():
 ap=argparse.ArgumentParser();ap.add_argument('--repository-root',type=Path,default=HERE.parents[2]);args=ap.parse_args()
 receipt=json.loads((HERE/'review05-parent-addendum.json').read_text());root=args.repository_root/receipt['bundle'];manifest=root/'evidence.json'
 assert sha(manifest)==receipt['originalManifestSha256'],'Frozen original evidence manifest changed'
 entries=json.loads(manifest.read_text())['files'];expected={r['path']:r for r in entries}
 expected['evidence.json']={'bytes':manifest.stat().st_size,'sha256':receipt['originalManifestSha256']}
 for row in receipt['addenda']:
  assert row['path'] not in expected,'Addendum collides with frozen original';expected[row['path']]=row
 errors=audit(root,expected);result={'status':'FAIL' if errors else 'PASS','scope':'Exact original frozen bundle plus explicit parent addendum only','originalFiles':len(entries)+1,'addenda':len(receipt['addenda']),'expectedUnionFiles':len(expected),'errors':errors,'fixtures':self_test()};print(json.dumps(result,indent=2));raise SystemExit(bool(errors))
if __name__=='__main__':main()
