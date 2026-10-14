import { proposedAlignment } from './equipment.js';
export function productionURL(repositoryPath) {
  if (typeof repositoryPath !== 'string' || !repositoryPath.startsWith('assets/production/') || repositoryPath.includes('\\') || repositoryPath.split('/').some(p => p === '..' || p === '.') || /[?#]/.test(repositoryPath)) throw new Error('Invalid production asset path');
  return `./production-assets/${repositoryPath.slice('assets/production/'.length).split('/').map(encodeURIComponent).join('/')}`;
}
export async function loadEquipmentCatalog(fetcher = fetch) {
  const get = async url => { const response = await fetcher(url); if (!response.ok) throw new Error(`Equipment catalog request failed (${response.status})`); return response.json(); };
  const catalog = await get('./production-assets/catalog.json'), records = [], ids = new Set();
  for (const manifestPath of catalog.manifests) {
    const manifest = await get(productionURL(`assets/production/${manifestPath}`));
    for (const asset of manifest.assets ?? []) {
      if (!['equipment', 'static_equipment', 'articulated_equipment', 'weapon', 'focus'].includes(asset.type) || !asset.files?.glb) continue;
      if (ids.has(asset.id)) throw new Error(`Duplicate equipment ID ${asset.id}`); ids.add(asset.id);
      records.push({ id: asset.id, name: asset.name, familyId: manifest.familyId, manifestPath, url: productionURL(asset.files.glb), alignment: proposedAlignment(asset), status: asset.status });
    }
  }
  return records;
}
