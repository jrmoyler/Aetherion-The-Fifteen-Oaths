"""Read-only literal module/asset reference inventory; not a dynamic URL proof."""
import pathlib,re,json,hashlib
root=pathlib.Path(__file__).resolve().parents[2]/'runtime/ability-matrix'
out=root.parents[1]/'validation'
imports=[];assets=[];bare={};
for p in root.rglob('*.js'):
 if any(x in p.parts for x in ['node_modules','dist','site','.git']):continue
 text=p.read_text()
 for m in re.finditer(r'''(?:\bfrom\s*|\bimport\s*\(\s*|\bimport\s*)["']([^"']+)["']''',text):
  s=m.group(1)
  if s.startswith('.'):
   target=(p.parent/s.split('?')[0]).resolve()
   imports.append({'source':str(p.relative_to(root)),'reference':s,'exists':target.exists(),'target':str(target.relative_to(root)) if target.is_relative_to(root) else str(target)})
  else:bare[s]=bare.get(s,0)+1
 for m in re.finditer(r'''["'](\./(?:models|textures|hdri)/[^"'`]+)["']''',text):
  s=m.group(1)
  # All sandbox vendor modules are intentionally served from sandbox/public.
  parts=p.relative_to(root).parts
  if len(parts)>2 and parts[0]=='packs':
   target=root/'packs'/parts[1]/'public'/s[2:]
   assets.append({'source':str(p.relative_to(root)),'reference':s,'publicFile':str(target.relative_to(root)),'exists':target.exists()})
licenses=[]
for p in root.glob('packs/*/LICENSE'):
 licenses.append({'path':str(p.relative_to(root)),'sha256':hashlib.sha256(p.read_bytes()).hexdigest(),'text':p.read_text()})
p=root/'presets/new/LICENSE';licenses.append({'path':str(p.relative_to(root)),'sha256':hashlib.sha256(p.read_bytes()).hexdigest(),'text':p.read_text()})
adj={}
for x in imports: adj.setdefault(x['source'],[]).append(x['target'])
reachable=set();pending=['packs/sandbox/src/main.js']
while pending:
 p=pending.pop()
 if p in reachable:continue
 reachable.add(p);pending.extend(adj.get(p,[]))
result={'reachableSandboxModules':len(reachable),'missingReachableSandboxImports':[x for x in imports if x['source'] in reachable and not x['exists']], 'missingReachableSandboxAssets':[x for x in assets if x['source'] in reachable and not x['exists']], 'method':'Static literal relative JS import paths and quoted ./models, ./textures, ./hdri references. Dynamic template URLs, CSS, HTML, FBX/GLB embedded asset references and remote URLs are outside coverage. Archive references included and marked by path.','moduleReferences':len(imports),'missingModuleReferences':[x for x in imports if not x['exists']],'bareSpecifiers':bare,'assetReferences':len(assets),'uniquePublicAssets':len(set(x['publicFile'] for x in assets)),'missingAssetReferences':[x for x in assets if not x['exists']],'licenseFiles':licenses,'licensingCaveat':'Source packs carry MIT notices; presets/new/LICENSE expressly does not relicense upstream code or third-party assets. README calls the character FBX files Mixamo exports and identifies only the ambientCG Rock030 texture scan as CC0, but no complete per-model/probe/texture provenance and license manifest was found. This inventory does not establish asset redistribution clearance.'}
(out/'static-reference-audit.json').write_text(json.dumps(result,indent=2)+'\n')
print(json.dumps({k:v for k,v in result.items() if k not in ['licenseFiles','bareSpecifiers','missingModuleReferences']},indent=2))
