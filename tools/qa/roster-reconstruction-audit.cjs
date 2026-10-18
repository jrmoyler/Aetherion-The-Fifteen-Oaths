'use strict';
// Coverage audit: technical identity and file presence, not likeness or art sign-off.
const fs = require('node:fs');
const path = require('node:path');
const assert = require('node:assert/strict');
const root = path.resolve(__dirname, '../..');
const read = p => JSON.parse(fs.readFileSync(path.join(root,p),'utf8'));
const exists = p => fs.existsSync(path.join(root,p));
const heroes = read('game/public/assets/characters/manifest.json');
const enemies = read('game/public/assets/creatures/manifest.json');
const roster = read('assets/production/intake/ROSTER_AND_EXISTING_CANDIDATES.json');
const pack = read('assets/prototype-intake/named-character-creature-v01/ROSTER_REBUILD_MANIFEST.json');
const canon = read('AETHERION_CANON/05_FACTIONS_AND_CHARACTERS/CHARACTER_REGISTRY.json');
assert.equal(heroes.length,30);
assert.equal(roster.characters.length,34);
assert.equal(roster.creatures.length,94);
assert.equal(canon.records.length,34);
assert.equal(pack.assets.length,128);
const byId = new Map(pack.assets.map(a => [a.identity_id,a]));
assert.equal(byId.size,128,'duplicate packaged identity');
const issues=[];
const player_archetypes=heroes.map(h=>{
  const no=Number(h.oath.slice(5)),ref='assets/references/reference-'+String(114-no).padStart(3,'0')+'/original.png';
  const file='game/public/assets/characters/'+h.file;
  const row={id:h.id,reference:ref,runtime_asset:file,reference_present:exists(ref),asset_present:exists(file),clips:h.clips.length,art_approved:false};
  if(!row.reference_present||!row.asset_present) issues.push(h.id+' missing source/reference');
  return row;
});
const named_characters=[],creature_identities=[];
for(const identity of [...roster.characters,...roster.creatures]){
  const asset=byId.get(identity.id);
  assert.ok(asset,'missing candidate '+identity.id);
  const staged='assets/prototype-intake/named-character-creature-v01/'+asset.glb_path;
  const approved=identity.visual_approval==='APPROVED' && !!identity.approved_model_id && asset.production_approved===true;
  const row={id:identity.id,name:identity.name,oath:identity.oath_id,references:identity.visual_reference_source_ids??identity.references??[],staged_glb:staged,staged_present:exists(staged),approved,gameplay_asset:approved?identity.approved_model_id:null,clips:asset.clip_names?.length??0,status:approved?'REQUIRES_GAMEPLAY_VERIFICATION':'UNAPPROVED_PROTOTYPE'};
  if(!row.staged_present) issues.push(identity.id+' prototype missing');
  (asset.category==='character'?named_characters:creature_identities).push(row);
}
for(const c of enemies) if(!exists('game/public'+c.file)) issues.push(c.id+' creature GLB missing');
const summary={
  playable_archetypes:player_archetypes.filter(c=>c.asset_present).length,
  concept_sheets_for_archetypes:player_archetypes.filter(c=>c.reference_present).length/2,
  named_characters:named_characters.length,
  named_creature_and_manifestation_roles:creature_identities.length,
  named_candidate_glbs:named_characters.concat(creature_identities).filter(x=>x.staged_present).length,
  approved_named_models:named_characters.concat(creature_identities).filter(x=>x.approved).length,
  shipped_creature_variants:enemies.length,
  shipped_creature_archetypes:new Set(enemies.map(x=>x.archetype)).size,
  inventory_errors:issues.length
};
const output={schema:'aetherion.roster-coverage.v1',acceptance:'TECHNICAL INVENTORY ONLY — no reference fidelity or gameplay/GPU signoff',summary,player_archetypes,named_characters,creature_identities,issues};
console.log(process.argv.includes('--json')?JSON.stringify(output,null,2):JSON.stringify(summary,null,2));
if(process.argv.includes('--check')&&issues.length) process.exitCode=1;
if(process.argv.includes('--strict-art')&&(summary.approved_named_models!==128||issues.length)) process.exitCode=1;
