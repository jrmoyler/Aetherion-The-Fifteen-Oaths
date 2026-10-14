#!/usr/bin/env python3
"""Validate actual Daybreak runtime imports with isolated negative fixtures and external reports."""
import argparse, copy, hashlib, json, os, re, shutil, struct, subprocess
from pathlib import Path
parser=argparse.ArgumentParser(description=__doc__)
parser.add_argument('--manifest',type=Path,required=True)
parser.add_argument('--repo',type=Path)
parser.add_argument('--output',type=Path,required=True)
parser.add_argument('--godot',default='godot')
args=parser.parse_args();project=Path(__file__).resolve().parent;manifest=args.manifest.absolute();output=args.output.absolute()
if output.exists():parser.error('Choose a new output directory to preserve earlier evidence')
output.mkdir(parents=True);negative=output/'negative-fixtures';negative.mkdir()
if not manifest.is_file() or manifest.resolve()!=manifest or any(p.is_symlink()for p in [manifest,*manifest.parents]):parser.error('Manifest must be a normalized absolute file without symlinks')
original=json.loads(manifest.read_text())
if type(original.get('schemaVersion'))not in [int,float]or original['schemaVersion']!=1:parser.error('Unsupported numeric schemaVersion')
if original.get('filePathBase')=='MANIFEST_DIRECTORY':base=manifest.parent
elif original.get('filePathBase')=='REPOSITORY_ROOT'and args.repo:base=args.repo.absolute()
else:parser.error('Explicit supported filePathBase and optional --repo are required')
def safe_source(reference):
 if not isinstance(reference,str)or not reference or any(c in reference for c in ['\\',':','%'])or any(ord(c)<32 for c in reference)or any(part in ['', '.', '..']for part in reference.split('/')):parser.error('Unsafe source reference')
 path=base/reference
 if not path.is_file()or path.resolve()!=path or any(p.is_symlink()for p in [path,*path.parents]):parser.error('Missing or symlink source reference')
 return path
source_files=[manifest]
for row in original['assets']:
 for key in ['glb','lod1','lod2','collision']:
  if key in row['files']:source_files.append(safe_source(row['files'][key]))
sha=lambda path:hashlib.sha256(path.read_bytes()).hexdigest()
before={str(p):sha(p)for p in source_files}
# Small valid authored visual and collision copies allow genuine isolated import failures.
small=min(original['assets'],key=lambda row:(base/row['files']['glb']).stat().st_size)
for key in ['glb','lod1','lod2']:
 shutil.copyfile(base/small['files'][key],negative/(key+'.glb'))
shutil.copyfile(base/original['assets'][0]['files']['collision'],negative/'collision.glb')
fixture=copy.deepcopy(original);fixture['filePathBase']='MANIFEST_DIRECTORY';fixture['assets']=[copy.deepcopy(small)]
fixture['assets'][0]['files']={key:key+'.glb'for key in ['glb','lod1','lod2']};fixture['assets'][0]['collisionPolicy']={'mode':'NONE','reason':'Fixture explicitly omits physics'};fixture['assets'][0]['animations']=[]
def emit(name,mutate):
 data=copy.deepcopy(fixture);mutate(data)
 if name.startswith('import-'):
  good=copy.deepcopy(fixture['assets'][0]);good['id']+='__fixture-good';data['assets'].insert(0,good)
 (negative/name).write_text(json.dumps(data))
for i,path in enumerate(['../outside.glb','/tmp/absolute.glb','https://host/file.glb','folder\\file.glb','folder//file.glb','%2e%2e/file.glb','missing.glb']):
 emit(f'path-{i}.json',lambda d,p=path:d['assets'][0]['files'].__setitem__('glb',p))
(negative/'linked.glb').symlink_to(negative/'glb.glb')
emit('symlink.json',lambda d:d['assets'][0]['files'].__setitem__('glb','linked.glb'))
emit('missing-module-name.json',lambda d:d['assets'][0].pop('originalModuleName'))
emit('blank-module-name.json',lambda d:d['assets'][0].__setitem__('originalModuleName','  '))
emit('blank-asset-id.json',lambda d:d['assets'][0].__setitem__('id','  '))
emit('boolean-schema-version.json',lambda d:d.__setitem__('schemaVersion',True))
emit('blank-collision-reason.json',lambda d:d['assets'][0]['collisionPolicy'].__setitem__('reason','  '))
emit('pending-missing-gate.json',lambda d:d['assets'][0]['collisionPolicy'].__setitem__('mode','PENDING'))
emit('pending-blank-gate.json',lambda d:(d['assets'][0]['collisionPolicy'].__setitem__('mode','PENDING'),d['assets'][0]['collisionPolicy'].__setitem__('remainingGate','  ')))
emit('duplicate-id.json',lambda d:d['assets'].append(copy.deepcopy(d['assets'][0])))
emit('unknown-path-base.json',lambda d:d.__setitem__('filePathBase','GUESS'))
emit('required-missing-collision.json',lambda d:d['assets'][0]['collisionPolicy'].__setitem__('mode','REQUIRED'))
emit('pending-with-collision.json',lambda d:(d['assets'][0]['collisionPolicy'].__setitem__('mode','PENDING'),d['assets'][0]['files'].__setitem__('collision','collision.glb')))
emit('unknown-collision-policy.json',lambda d:d['assets'][0]['collisionPolicy'].__setitem__('mode','MAYBE'))
(negative/'malformed.glb').write_bytes(b'not a glb')
emit('import-malformed.json',lambda d:d['assets'][0]['files'].__setitem__('glb','malformed.glb'))
def glb_json(name,data):
 chunk=json.dumps(data).encode();chunk+=b' '*((-len(chunk))%4)
 (negative/name).write_bytes(struct.pack('<III',0x46546c67,2,28+len(chunk))+struct.pack('<II',len(chunk),0x4e4f534a)+chunk+struct.pack('<II',0,0x004e4942))
glb_json('external.glb',{'asset':{'version':'2.0'},'buffers':[{'uri':'../../outside.bin','byteLength':4}]})
emit('import-external-dependency.json',lambda d:d['assets'][0]['files'].__setitem__('glb','external.glb'))
glb_json('empty.glb',{'asset':{'version':'2.0'},'scenes':[{'nodes':[0]}],'scene':0,'nodes':[{'name':'NoMeshNegative'}]})
emit('import-empty-scene.json',lambda d:d['assets'][0]['files'].__setitem__('glb','empty.glb'))
glb_json('bad-buffers.glb',{'asset':{'version':'2.0'},'buffers':{}})
emit('import-malformed-buffers.json',lambda d:d['assets'][0]['files'].__setitem__('glb','bad-buffers.glb'))
glb_json('bad-images.glb',{'asset':{'version':'2.0'},'images':'bad'})
emit('import-malformed-images.json',lambda d:d['assets'][0]['files'].__setitem__('glb','bad-images.glb'))
env=os.environ.copy()
for key in ['XDG_CONFIG_HOME','XDG_CACHE_HOME','XDG_DATA_HOME']:
 location=output/key.lower();location.mkdir();env[key]=str(location)
command=[args.godot,'--headless','--fixed-fps','60','--path',str(project),'--script','tests.gd','--','--manifest',str(manifest),'--report',str(output/'results.json'),'--negative-dir',str(negative)]
if args.repo:command+=['--repo',str(args.repo.absolute())]
process=subprocess.run(command,env=env,capture_output=True,text=True,timeout=240)
console=process.stdout+process.stderr
(output/'godot.log').write_text(console)
diagnostics=[line for line in console.splitlines()if re.search(r'(?i)\b(error|fatal)\b|WARNING:',line)]
result=json.loads((output/'results.json').read_text())if(output/'results.json').exists()else {'failures':['Godot produced no report']}
after={str(p):sha(p)for p in source_files};drift=[p for p in before if before[p]!=after[p]]
receipt={'command':command,'process_exit_code':process.returncode,'unexpected_engine_diagnostics':diagnostics,'input_hashes':before,'changed_inputs':drift,'project_hashes':{p.name:sha(p)for p in project.iterdir()if p.is_file()},'result_sha256':sha(output/'results.json')if(output/'results.json').exists()else None,'log_sha256':sha(output/'godot.log')}
(output/'run-receipt.json').write_text(json.dumps(receipt,indent=2)+'\n')
print(process.stdout+process.stderr,end='');print(output)
raise SystemExit(1 if process.returncode or diagnostics or drift or result.get('failures') else 0)
