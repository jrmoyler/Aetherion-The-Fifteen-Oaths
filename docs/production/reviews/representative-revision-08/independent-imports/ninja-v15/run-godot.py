import os,subprocess,json
from pathlib import Path
b=Path(__file__).parent;q=json.load(open('/tmp/aetherion-revision05-import-checks/ninja15-inputs.json'));env=os.environ.copy()
for k in ['XDG_CONFIG_HOME','XDG_CACHE_HOME','XDG_DATA_HOME']:env[k]='/tmp/aetherion-revision05-import-checks/godot-local/'+k
for p in q['glbs']:
 if 'collision' in p:continue
 name=Path(p).stem
 with (b/(name+'-godot-ground.log')).open('w') as f:r=subprocess.run(['godot','--headless','--path','/tmp/aetherion-revision05-import-checks','--script',str(b/'ground-godot.gd'),'--',p,str(b/(name+'-godot-ground.json'))],stdout=f,stderr=subprocess.STDOUT,env=env,timeout=240)
 print(name,r.returncode,flush=True)
