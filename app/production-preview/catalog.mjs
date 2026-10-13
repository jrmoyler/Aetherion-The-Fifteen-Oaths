export function assetURL(manifest, relative) {
  if (typeof relative === 'string' && relative.startsWith('assets/production/')) relative = '/' + relative.slice('assets/production/'.length);
  const productionRoot = typeof relative === 'string' && relative.startsWith('/');
  if (typeof relative !== 'string' || !relative || relative.includes('\\') || /^[a-z]+:/i.test(relative)) throw new Error('Asset path must be inside production assets');
  const base = new URL(`https://preview.invalid/production-assets/${manifest}`);
  const result = new URL(productionRoot ? `/production-assets${relative}` : relative, base);
  if (!result.pathname.startsWith('/production-assets/') || result.search || result.hash || !result.pathname.endsWith('.glb')) throw new Error('Expected a local production GLB');
  return `.${result.pathname}`;
}

export function normalizeManifest(data, manifest) {
  const rows = data.assets;
  if (!Array.isArray(rows)) throw new Error(`${manifest}: assets array is required`);
  return rows.map(row => {
    if (typeof row.id !== 'string' || !row.id) throw new Error(`${manifest}: asset id missing`);
    const lods = row.files ? [{level: 0, path: row.files.glb}, ...['lod1','lod2'].flatMap((key, i) => row.files[key] ? [{level:i+1,path:row.files[key]}] : [])] : [{ level: 0, path: row.glb }, ...(row.lods || [])];
    const levels = new Set();
    const normalizedLODs = lods.map(lod => {
        if (!Number.isInteger(lod.level) || lod.level < 0 || levels.has(lod.level)) throw new Error(`${row.id}: duplicate or invalid LOD`);
        levels.add(lod.level);
        return { level: lod.level, url: assetURL(manifest, lod.path) };
      }).sort((a, b) => a.level - b.level);
    const primaryState = row.variant || 'ready';
    const states = [{ value: primaryState, label: `${primaryState} · manifest entry`, lods: normalizedLODs }];
    for (const state of ['damaged', 'stowed']) {
      if (row.files?.[state] && state !== primaryState) states.push({value: state, label: `${state} · separate export`, lods: [{level:0,url:assetURL(manifest,row.files[state])}]});
    }
    return { ...row, key: `${manifest}:${row.id}`, name: row.name || row.id, referenceIds: [...new Set([...(data.referenceIds || []), ...(row.referenceIds || [])])], oath: data.oath_id || manifest.split('/')[0], lods:normalizedLODs, states };
  });
}
