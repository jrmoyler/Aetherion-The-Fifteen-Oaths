import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {fileURLToPath} from 'node:url';
import config from '../app/abilities/vite.config.mjs';
import {installAetherionRuntimeRepairs} from '../src/abilities/InstallRuntimeRepairs.js';

test('destination entry imports original App/CSS/bridge and installs repair before loading or URL bridge',()=>{
 const entry=readFileSync(new URL('../app/abilities/main.js',import.meta.url),'utf8');
 assert.match(entry,/runtime\/ability-matrix\/packs\/sandbox\/src\/core\/App\.js/);
 assert.match(entry,/runtime\/ability-matrix\/packs\/sandbox\/src\/ui\/styles\.css/);
 assert.match(entry,/runtime\/ability-matrix\/packs\/sandbox\/src\/bridge\/MatrixBridge\.js/);
 const repair=entry.indexOf('installAetherionRuntimeRepairs(app);');
 assert.ok(repair>0&&repair<entry.indexOf('await app.load();'));
 assert.ok(repair<entry.indexOf("installMatrixBridge(app, 'sandbox')"));
 assert.match(entry,/window\.aetherionAbilities = adapter/);
 assert.match(entry,/adapter\.list\(\)/);
 assert.match(entry,/entry\.kind === 'buff'/);
 assert.match(entry,/await adapter\.cast\(entry\.uid\)/);
 assert.match(entry,/await adapter\.clear\(\)/);
});

test('wrapper preserves source loading DOM and serves original asset directory',()=>{
 const html=readFileSync(new URL('../app/abilities/index.html',import.meta.url),'utf8');
 for(const id of ['viewport','hud','loader','loader-fill','loader-status','castable-select','cast-button','clear-button'])assert.ok(html.includes(`id="${id}"`),id);
 assert.equal(config.publicDir,fileURLToPath(new URL('../runtime/ability-matrix/packs/sandbox/public/',import.meta.url)));
 assert.equal(config.base,'./');
 const pkg=JSON.parse(readFileSync(new URL('../package.json',import.meta.url)));
 assert.equal(pkg.scripts['dev:abilities'],'node tools/run-abilities.mjs dev');
 assert.equal(pkg.scripts['build:abilities'],'node tools/run-abilities.mjs build');
});

test('App repair seam requires a real loadRuntime entry',()=>{
 assert.throws(()=>installAetherionRuntimeRepairs({}),TypeError);
 assert.throws(()=>installAetherionRuntimeRepairs(null),TypeError);
});
