const fs=require('fs'); const path=require('path');
const v=require(process.env.GLTF_VALIDATOR_MODULE || '/workspace/Aetherion-The-Fifteen-Oaths/tools/production/node_modules/gltf-validator');
const f=path.join(__dirname,'amethyst-short-blade/review.glb');
v.validateBytes(new Uint8Array(fs.readFileSync(f)),{uri:'review.glb',maxIssues:0,writeTimestamp:false}).then(r=>{fs.writeFileSync(path.join(__dirname,'glb-validation.json'),JSON.stringify(r,null,2)+'\n'); console.log(JSON.stringify({errors:r.issues.numErrors,warnings:r.issues.numWarnings,infos:r.issues.numInfos}));process.exitCode=r.issues.numErrors?1:0;});
