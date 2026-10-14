/** Explicit opt-in allowlist for frozen review GLBs; never a production promotion. */
import fs from 'node:fs';
import path from 'node:path';
import { createHash } from 'node:crypto';
import { normalizeManifest } from './catalog.mjs';
import { externalGLBDependencies } from './runtime-assets.mjs';
export const REVIEW_ROOT = 'docs/production/reviews';
export const REVIEW_MANIFEST = '__reviews/manifest.json';
export function appendReviewAssets(catalog, repositoryRoot) {
 const manifestPath=path.resolve(repositoryRoot,'app/production-preview/review-manifest.json');
 const manifestBytes=fs.readFileSync(manifestPath);
 const data=JSON.parse(manifestBytes.toString('utf8'));
 if(data.status!=='UNAPPROVED_REVIEW_ONLY')throw new Error('Review status must remain explicit');
 const root=path.resolve(repositoryRoot,REVIEW_ROOT),realRoot=fs.realpathSync(root);
 const files=new Map(catalog.files),references=[...catalog.references],reviewBuffers=new Map(catalog.reviewBuffers||[]);
 if(files.has(REVIEW_MANIFEST)||catalog.manifests.includes(REVIEW_MANIFEST))throw new Error('Review namespace collides with existing catalog');
 const rows=normalizeManifest(data,REVIEW_MANIFEST);
 const ids=new Set();
 for(const row of rows){
  if(ids.has(row.id))throw new Error(`Duplicate review asset ID: ${row.id}`);
  ids.add(row.id);
  if(row.status!=='UNAPPROVED_REVIEW_ONLY_NOT_PRODUCTION_PROMOTED')throw new Error(`Review asset status must remain explicit: ${row.id}`);
  for(const id of row.referenceIds)if(!references.some(r=>r.id===id||r.canonicalId===id))throw new Error(`Review reference is not available in original-reference catalog: ${id}`);
  for(const state of row.states)for(const lod of state.lods){
   const logical=decodeURIComponent(lod.url.replace('./production-assets/',''));
   if(!logical.startsWith('__reviews/'))throw new Error('Review path escapes its namespace');
   const relative=logical.slice('__reviews/'.length),full=path.resolve(root,relative);
   if(!full.startsWith(root+path.sep))throw new Error('Review path escapes frozen bundle');
   const real=fs.realpathSync(full);
   if(!real.startsWith(realRoot+path.sep)||!fs.statSync(real).isFile())throw new Error('Review file escapes frozen bundle');
   const bytes=fs.readFileSync(real),hash=createHash('sha256').update(bytes).digest('hex');
   if(data.sha256?.[relative]!==hash)throw new Error(`Review GLB hash mismatch: ${relative}`);
   if(externalGLBDependencies(bytes).length)throw new Error('Review GLBs must embed all runtime resources');
   if(files.has(logical))throw new Error('Review namespace collides with existing asset');
   files.set(logical,real);reviewBuffers.set(logical,bytes);
  }
 }
 files.set(REVIEW_MANIFEST,manifestPath);reviewBuffers.set(REVIEW_MANIFEST,manifestBytes);
 return {...catalog,files,references,reviewBuffers,manifests:[...catalog.manifests,REVIEW_MANIFEST]};
}
