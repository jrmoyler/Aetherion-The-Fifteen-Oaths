import fs from 'node:fs';
import validator from '/workspace/Aetherion-The-Fifteen-Oaths/tools/production/node_modules/gltf-validator/index.js';
const dir='/workspace/scratch/ninja-v15/kiln-ninja-ensemble-candidate';let out={};
for (const file of fs.readdirSync(dir).filter(x=>x.endsWith('.glb')))out[file]=await validator.validateBytes(new Uint8Array(fs.readFileSync(dir+'/'+file)),{uri:file,maxIssues:0,writeTimestamp:false});
fs.writeFileSync('/workspace/scratch/ninja-v15/khronos-author-check.json',JSON.stringify(out,null,2)+'\n');
console.log(Object.entries(out).map(([f,v])=>({file:f,errors:v.issues.numErrors,warnings:v.issues.numWarnings})));
