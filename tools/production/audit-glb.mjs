import { readFile, readdir, mkdir, writeFile, realpath } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { gzipSync } from 'node:zlib';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { execFileSync } from 'node:child_process';
import validator from 'gltf-validator';

const here = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(here, '../..');
const sha256 = bytes => createHash('sha256').update(bytes).digest('hex');

export function inspectGlb(bytes) {
  if (bytes.length < 20 || bytes.readUInt32LE(0) !== 0x46546c67) throw new Error('Missing GLB header');
  if (bytes.readUInt32LE(4) !== 2) throw new Error('Unsupported GLB version');
  if (bytes.readUInt32LE(8) !== bytes.length) throw new Error('GLB declared length mismatch');
  const chunks = [];
  let offset = 12;
  while (offset < bytes.length) {
    if (offset + 8 > bytes.length) throw new Error('Truncated chunk header');
    const length = bytes.readUInt32LE(offset), type = bytes.readUInt32LE(offset + 4);
    if (length % 4 || offset + 8 + length > bytes.length) throw new Error('Invalid chunk bounds or alignment');
    chunks.push({ type, byteLength: length, offset: offset + 8 });
    offset += length + 8;
  }
  if (chunks[0]?.type !== 0x4e4f534a) throw new Error('First chunk must contain JSON');
  const json = JSON.parse(bytes.subarray(chunks[0].offset, chunks[0].offset + chunks[0].byteLength).toString());
  const arrays = ['scenes', 'nodes', 'meshes', 'materials', 'textures', 'images', 'skins', 'animations', 'accessors', 'bufferViews', 'buffers'];
  return {
    chunks, asset: json.asset,
    counts: Object.fromEntries(arrays.map(key => [key, json[key]?.length ?? 0])),
    primitives: (json.meshes ?? []).flatMap((m, mesh) => (m.primitives ?? []).map((p, primitive) => ({
      mesh, primitive, mode: p.mode ?? 4, material: p.material ?? null,
      vertices: json.accessors?.[p.attributes?.POSITION]?.count ?? null,
      indices: json.accessors?.[p.indices]?.count ?? null,
      attributes: Object.keys(p.attributes ?? {}), morphTargets: p.targets?.length ?? 0,
    }))),
    materials: (json.materials ?? []).map((m, index) => ({ index, name: m.name ?? null,
      pbrMetallicRoughness: m.pbrMetallicRoughness ?? {}, normalTexture: m.normalTexture ?? null,
      occlusionTexture: m.occlusionTexture ?? null, emissiveTexture: m.emissiveTexture ?? null,
      alphaMode: m.alphaMode ?? 'OPAQUE', doubleSided: m.doubleSided ?? false,
      extensions: Object.keys(m.extensions ?? {}),
    })),
    images: (json.images ?? []).map((i, index) => ({ index, mimeType: i.mimeType ?? null, bufferView: i.bufferView ?? null, uri: i.uri ?? null })),
    textures: json.textures ?? [],
    skins: (json.skins ?? []).map((s, index) => ({ index, name: s.name ?? null, joints: s.joints?.length ?? 0, inverseBindMatrices: s.inverseBindMatrices ?? null, skeleton: s.skeleton ?? null })),
    animations: (json.animations ?? []).map((a, index) => ({ index, name: a.name ?? null, channels: a.channels?.length ?? 0,
      targetPaths: [...new Set((a.channels ?? []).map(c => c.target?.path))],
      samplers: (a.samplers ?? []).map(s => ({ ...s, timeMin: json.accessors?.[s.input]?.min ?? null, timeMax: json.accessors?.[s.input]?.max ?? null })),
    })),
    extensionsUsed: json.extensionsUsed ?? [], extensionsRequired: json.extensionsRequired ?? [],
  };
}

async function walk(dir) {
  const found = [];
  for (const e of (await readdir(dir, { withFileTypes: true })).sort((a, b) => a.name.localeCompare(b.name))) {
    if (['.git', 'node_modules', 'dist', 'build'].includes(e.name)) continue;
    const p = path.join(dir, e.name);
    if (e.isDirectory()) found.push(...await walk(p));
    else if (e.isFile() && /\.glb$/i.test(e.name)) found.push(p);
  }
  return found;
}

export async function audit() {
  const groups = new Map(), paths = await walk(path.join(root, 'runtime/ability-matrix'));
  for (const p of paths) {
    const bytes = await readFile(p), hash = sha256(bytes);
    if (!groups.has(hash)) groups.set(hash, { sha256: hash, byteLength: bytes.length, paths: [] });
    groups.get(hash).paths.push(path.relative(root, p));
  }
  const records = [];
  for (const group of groups.values()) {
    const source = path.join(root, group.paths[0]), bytes = await readFile(source);
    let inventory = null, inventoryError = null;
    try { inventory = inspectGlb(bytes); } catch (e) { inventoryError = e.message; }
    const report = await validator.validateBytes(new Uint8Array(bytes), {
      uri: group.paths[0], format: 'glb', maxIssues: 0, writeTimestamp: false,
      externalResourceFunction: async uri => {
        if (/^[a-z][a-z0-9+.-]*:/i.test(uri)) throw new Error('External network resources are not fetched');
        const target = await realpath(path.resolve(path.dirname(source), decodeURIComponent(uri)));
        if (!target.startsWith(root + path.sep)) throw new Error('External resource escapes repository');
        return new Uint8Array(await readFile(target));
      },
    });
    records.push({ ...group, status: report.issues.numErrors || inventoryError ? 'STRUCTURAL_ERRORS' : 'STRUCTURALLY_VALID', inventory, inventoryError, validator: report });
  }
  for (const record of records) for (const p of record.paths) {
    if (sha256(await readFile(path.join(root, p))) !== record.sha256) throw new Error(`Source changed during audit: ${p}`);
  }
  const totals = key => records.reduce((n, r) => n + r.validator.issues[key], 0);
  const result = {
    schemaVersion: 1, generatedAt: new Date().toISOString(), sourceRevision: execFileSync('git', ['rev-parse', 'HEAD'], { cwd: root, encoding: 'utf8' }).trim(),
    scope: 'Existing source GLBs under runtime/ability-matrix; duplicate bytes validated once; paths and post-audit hashes checked individually.',
    validator: { name: 'KhronosGroup/glTF-Validator', version: validator.version(), supportedExtensions: validator.supportedExtensions(), node: process.version },
    acceptance: { structuralValidationOnly: true, renderedApproval: false, gameplayApproval: false, engineImportApproval: false, productionReadyAssets: 0 },
    summary: { paths: paths.length, uniqueIdentities: records.length, structurallyValid: records.filter(r => r.status === 'STRUCTURALLY_VALID').length,
      structuralErrors: records.filter(r => r.status === 'STRUCTURAL_ERRORS').length, errors: totals('numErrors'), warnings: totals('numWarnings'), infos: totals('numInfos'), hints: totals('numHints'), sourceBytesUnchanged: true },
    records,
  };
  const output = path.join(root, 'validation/production');
  await mkdir(output, { recursive: true });
  const completeIssues = records.map(r => ({ sha256: r.sha256, paths: r.paths, issues: r.validator.issues }));
  const compressed = gzipSync(Buffer.from(JSON.stringify({ schemaVersion: 1, validatorVersion: validator.version(), records: completeIssues }) + '\n'), { level: 9 });
  await writeFile(path.join(output, 'GLB_VALIDATOR_DETAILS.json.gz'), compressed);
  result.fullIssueEvidence = { path: 'GLB_VALIDATOR_DETAILS.json.gz', sha256: sha256(compressed), encoding: 'gzip-compressed UTF-8 JSON', complete: true };
  for (const r of records) {
    const byCode = new Map();
    for (const issue of r.validator.issues.messages) {
      const key = `${issue.severity}:${issue.code}`;
      if (!byCode.has(key)) byCode.set(key, { code: issue.code, severity: issue.severity, count: 0, examples: [] });
      const entry = byCode.get(key);
      entry.count++;
      if (entry.examples.length < 3) entry.examples.push(issue);
    }
    r.validator.issues.byCode = [...byCode.values()].sort((a, b) => a.severity - b.severity || a.code.localeCompare(b.code));
    r.validator.issues.messagesStoredIn = 'GLB_VALIDATOR_DETAILS.json.gz';
    delete r.validator.issues.messages;
  }
  await writeFile(path.join(output, 'GLB_AUDIT.json'), JSON.stringify(result, null, 2) + '\n');
  const lines = ['# Existing source GLB structural audit', '', `Generated: ${result.generatedAt}. Source revision: \`${result.sourceRevision}\`.`, '',
    `${paths.length} paths contain ${records.length} distinct SHA-256 identities. ${result.summary.structurallyValid} identities have no validator errors; ${result.summary.structuralErrors} have structural errors. ${totals('numErrors')} errors and ${totals('numWarnings')} warnings across unique identities. All source bytes remained unchanged during this audit.`, '',
    'This is format validation, not Blender/Unreal/Godot/Three.js import, visual review, performance measurement, rig suitability, licensing review or production approval. An error-free file may still be unsuitable for this project. No existing asset is promoted to production-ready by this report.', '',
    '| File (first path) | Copies | Meshes | Materials | Images | Skins | Animations | Errors | Warnings |', '| --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: |'];
  for (const r of records) {
    const c = r.inventory?.counts ?? {};
    lines.push(`| ${r.paths[0]} | ${r.paths.length} | ${c.meshes ?? '?'} | ${c.materials ?? '?'} | ${c.images ?? '?'} | ${c.skins ?? '?'} | ${c.animations ?? '?'} | ${r.validator.issues.numErrors} | ${r.validator.issues.numWarnings} |`);
  }
  lines.push('', 'Full paths, SHA-256 hashes, GLB chunk bounds, primitive attributes/counts, material parameters, embedded image locations, skins, animation targets/times, accessor and buffer validation, and aggregated Khronos issue counts with up to three examples per code are recorded in [GLB_AUDIT.json](GLB_AUDIT.json). Every unsuppressed issue is preserved losslessly in [GLB_VALIDATOR_DETAILS.json.gz](GLB_VALIDATOR_DETAILS.json.gz); the JSON audit records its checksum. Validation uses no issue limit or severity overrides.', '',
    'Reproduce from repository root:', '', '```sh', 'npm --cache /tmp/aetherion-production-npm-cache --prefix tools/production ci --ignore-scripts', 'npm --prefix tools/production test', 'npm --prefix tools/production run audit:glb', '```', '',
    'The audit exits with status 1 when any source identity has errors, after writing reports. Historical source errors are reported without modifying immutable source files. The tool uses the pinned official [Khronos validator](https://github.com/KhronosGroup/glTF-Validator/tree/main/node).', '');
  await writeFile(path.join(output, 'GLB_AUDIT.md'), lines.join('\n'));
  console.log(JSON.stringify(result.summary, null, 2));
  if (result.summary.structuralErrors) process.exitCode = 1;
  return result;
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) await audit();
