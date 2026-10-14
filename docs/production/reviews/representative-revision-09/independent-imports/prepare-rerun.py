"""Prepare relocatable verification scripts and request; never modify candidate assets."""
import argparse,json
from pathlib import Path
p=argparse.ArgumentParser();p.add_argument('--repository',required=True);p.add_argument('--candidate',required=True);p.add_argument('--baseline-v15',required=True);p.add_argument('--output',required=True);a=p.parse_args();src=Path(__file__).resolve().parent;out=Path(a.output).resolve();out.mkdir(parents=True,exist_ok=True)
if any(out.iterdir()):raise SystemExit('Use an empty output directory to preserve earlier evidence')
changes={'/workspace/Aetherion-The-Fifteen-Oaths':str(Path(a.repository).resolve()),'/workspace/scratch/ninja-v16':str(Path(a.candidate).resolve()),'/workspace/scratch/ninja-v15':str(Path(a.baseline_v15).resolve()),'/tmp/aetherion-ninja-v16-independent':str(out),'/tmp/aetherion-revision05-import-checks':str(out)}
written=[]
for f in src.iterdir():
 if f.name=='prepare-rerun.py' or not (f.suffix in ['.py','.mjs','.gd'] or f.name in ['project.godot','ninja16-inputs.json']):continue
 s=f.read_text()
 for old,new in changes.items():s=s.replace(old,new)
 (out/f.name).write_text(s);written.append(f.name)
(out/'rerun-configuration.json').write_text(json.dumps({'replacements':changes,'preparedFiles':sorted(written),'note':'Preparation only. No checks executed; no candidate files changed.'},indent=2)+'\n')
print('Prepared',len(written),'files in',out)
