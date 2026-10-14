"""Bounded exact-closure regression fixtures; temporary files only."""
from pathlib import Path
import hashlib,json,runpy,tempfile
verify=runpy.run_path(str(Path(__file__).with_name('verify_bundle.py')))['verify_closure']
with tempfile.TemporaryDirectory() as directory:
 root=Path(directory);(root/'nested').mkdir();p=root/'nested/evidence.json';p.write_text('nested receipt')
 row={'path':'nested/evidence.json','bytes':p.stat().st_size,'sha256':hashlib.sha256(p.read_bytes()).hexdigest()}; evidence={'files':[row]};verify(root,evidence)
 rejected=[]
 for name,bad in [('duplicate',{'files':[row,row]}),('escape',{'files':[{**row,'path':'../escape'}]}),('tamper',{'files':[{**row,'sha256':'0'*64}]}),('extra',{'files':[]})]:
  try:verify(root,bad)
  except AssertionError:rejected.append(name)
  else:raise AssertionError(name+' was accepted')
 p.unlink()
 try:verify(root,evidence)
 except AssertionError:rejected.append('missing')
 else:raise AssertionError('missing accepted')
 p.symlink_to('/etc/hosts')
 try:verify(root,evidence)
 except AssertionError:rejected.append('symlink')
 else:raise AssertionError('symlink accepted')
 print(json.dumps({'status':'PASS','positiveFixtures':1,'negativeFixturesRejected':rejected},indent=2))
