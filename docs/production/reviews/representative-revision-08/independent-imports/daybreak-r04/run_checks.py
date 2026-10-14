import json,sys,subprocess,hashlib,os,time
from pathlib import Path
base=Path(__file__).parent
name=sys.argv[1]; request_path=base/(name+'-inputs.json'); request=json.loads(request_path.read_text())
inputs=request.get('blends',[])+request['glbs']
def hashes():return {p:{'sha256':hashlib.sha256(Path(p).read_bytes()).hexdigest(),'bytes':Path(p).stat().st_size} for p in inputs}
before=hashes();commands=[]
def run(label,args,env=None):
 log=base/(name+'-'+label+'.log');started=time.time()
 with log.open('w') as out:r=subprocess.run(args,stdout=out,stderr=subprocess.STDOUT,env=env)
 commands.append({'label':label,'command':args,'returncode':r.returncode,'seconds':round(time.time()-started,3),'log':str(log)})
 print(label,r.returncode,flush=True)
run('glb',['node',str(base/'check-glb.mjs'),str(request_path),str(base/(name+'-glb.json'))])
run('blender',['blender','-b','-t','2','--python',str(base/'check-blender.py'),'--',str(request_path),str(base/(name+'-blender.json'))])
if request.get('compareAnimationBounds',True) and (base/(name+'-blender.json')).exists():run('comparison',['python',str(base/'compare-bounds.py'),str(base/name)])
env=os.environ.copy()
for var in ['XDG_CONFIG_HOME','XDG_CACHE_HOME','XDG_DATA_HOME']:
 p=base/'godot-local'/var;p.mkdir(parents=True,exist_ok=True);env[var]=str(p)
godot=[]
for i,p in enumerate(request['glbs']):
 label='godot-'+str(i);run(label,['godot','--headless','--path',str(base),'--script',str(base/'godot_import.gd'),'--',p],env)
 log=(base/(name+'-'+label+'.log')).read_text();row={'path':p,'sha256':before[p]['sha256'],'returncode':commands[-1]['returncode'],'fullLog':str(base/(name+'-'+label+'.log'))}
 for line in log.splitlines():
  if line.startswith('AETHERION_PROBE_JSON '):row['result']=json.loads(line.removeprefix('AETHERION_PROBE_JSON '))
 row['success']=row['returncode']==0 and row.get('result',{}).get('scene_instantiated')==True
 godot.append(row)
after=hashes();report={'scope':'Frozen review assets only; real CPU/headless imports, no GPU/material-render/appearance/collision or gameplay approval','inputs':before,'inputsUnchanged':before==after,'commands':commands,'godot':godot,'allCommandsPassed':all(c['returncode']==0 for c in commands),'allGodotImportsPassed':all(x['success'] for x in godot)}
(base/(name+'-receipt.json')).write_text(json.dumps(report,indent=2)+'\n')
