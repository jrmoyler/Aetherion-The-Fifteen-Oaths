#!/usr/bin/env python3
"""Run an isolated actual-proxy Godot physics test, writing evidence only to --output."""
import argparse,hashlib,json,math,os,shutil,subprocess
from pathlib import Path
parser=argparse.ArgumentParser();parser.add_argument('--output',required=True);parser.add_argument('--godot',default='godot');args=parser.parse_args()
project=Path(__file__).resolve().parent;output=Path(args.output).resolve();output.mkdir(parents=True,exist_ok=True)
sha=lambda p:hashlib.sha256(p.read_bytes()).hexdigest()
source=json.loads((project/'inputs/source-receipt.json').read_text())
for row in source:
 if sha(project/'inputs'/row['export'])!=row['sha256']:raise SystemExit('Input digest mismatch: '+row['export'])
env=os.environ.copy();env['XDG_CACHE_HOME']=str(output/'cache');env['XDG_DATA_HOME']=str(output/'data')
command=[args.godot,'--headless','--fixed-fps','60','--path',str(project),'--script','traverse.gd','--',str(output/'results.json')]
completed=subprocess.run(command,capture_output=True,text=True,env=env,timeout=120);(output/'godot.log').write_text(completed.stdout+completed.stderr)
if completed.returncode:raise SystemExit('Godot failed with '+str(completed.returncode)+': see '+str(output/'godot.log'))
result=json.loads((output/'results.json').read_text());assert result['failures']==0 and len(result['cases'])==8
assert sum(c['traversable']for c in result['cases'])==4
for case in result['cases']:
 assert case['passed_expectation'] and case['samples']
 assert all(abs(s['delta']-1/60)<1e-9 for s in case['samples'])
 assert len(case['imports'][0]['meshes'])==4 and len(case['imports'][1]['meshes'])==1
 assert sum(m['landing']for m in case['imports'][0]['meshes'])==1
receipt={'status':'PASS_SCOPED_ACTUAL_GODOT_PHYSICS','command':command,'godot_executable':shutil.which(args.godot),'cases':len(result['cases']),'expected_traversable':4,'expected_negative_refusals':4,'inputs':[{'path':p.relative_to(project).as_posix(),'sha256':sha(p),'bytes':p.stat().st_size}for p in sorted((project/'inputs').glob('*'))if p.is_file()],'implementation':[{'path':name,'sha256':sha(project/name)}for name in ['project.godot','traverse.gd','run.py','export_collision.py']],'results_sha256':sha(output/'results.json'),'log_sha256':sha(output/'godot.log'),'limitations':result['limitations']}
(output/'run-receipt.json').write_text(json.dumps(receipt,indent=2)+'\n');print(json.dumps({'passed':8,'traversable':4,'negative_refusals':4,'receipt_sha256':sha(output/'run-receipt.json')}))
