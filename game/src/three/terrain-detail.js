import {IcosahedronGeometry,BufferAttribute} from 'three';
import {mergeVertices} from 'three/addons/utils/BufferGeometryUtils.js';
// Distance bands preserve near-ground contours without multiplying every distant
// tile's triangle count. All resolutions divide the tile edge; skirts seal LOD joins.
export function terrainResolution(tier, distanceInTiles) {
  const near=distanceInTiles<=1, middle=distanceInTiles<=2;
  if(tier==='low') return near?40:20;
  if(tier==='medium') return near?80:middle?40:20;
  return near?128:middle?64:32;
}
export function weatheredRock(detail=3, variant=0) {
  const source=new IcosahedronGeometry(1,detail);source.deleteAttribute('uv');
  const g=mergeVertices(source,1e-5);source.dispose();
  const p=g.attributes.position;
  for(let i=0;i<p.count;i++){
    const x=p.getX(i),y=p.getY(i),z=p.getZ(i),s=variant*1.713;
    // Broad fracture planes, sediment shelves and small erosion, not a faceted ball.
    const broad=Math.sin(x*3.7+s)*Math.cos(z*4.1-s)*.13;
    const shelf=Math.sin(y*13+Math.sin(x*3+z*2))*.035;
    const chips=Math.sin(x*29+z*17+s)*Math.sin(y*23-z*11)*.018;
    const r=1+broad+shelf+chips;
    p.setXYZ(i,x*r,Math.max(-.72,y*r),z*r*(1+.08*Math.sin(y*5+s)));
  }
  g.computeVertexNormals();g.computeBoundingSphere();return g;
}

// Duplicate the perimeter downwards: adjacent LODs cannot reveal the sky through
// T-junctions, and walkable surface heights remain identical to shared collision.
export function addTerrainSkirt(geometry,resolution,depth=6){
  const stride=resolution+1,edge=[];
  for(let i=0;i<resolution;i++)edge.push(i);
  for(let i=0;i<resolution;i++)edge.push(i*stride+resolution);
  for(let i=resolution;i>0;i--)edge.push(resolution*stride+i);
  for(let i=resolution;i>0;i--)edge.push(i*stride);
  const count=geometry.attributes.position.count;
  for(const [name,attribute] of Object.entries(geometry.attributes)){
    const values=new attribute.array.constructor((count+edge.length)*attribute.itemSize);values.set(attribute.array);
    edge.forEach((source,i)=>{for(let c=0;c<attribute.itemSize;c++)values[(count+i)*attribute.itemSize+c]=attribute.array[source*attribute.itemSize+c]-(name==='position'&&c===1?depth:0);});
    geometry.setAttribute(name,new BufferAttribute(values,attribute.itemSize,attribute.normalized));
  }
  const indices=Array.from(geometry.index.array);
  for(let i=0;i<edge.length;i++){const j=(i+1)%edge.length;indices.push(edge[i],count+i,edge[j],edge[j],count+i,count+j);}
  geometry.setIndex(indices);geometry.computeBoundingSphere();return geometry;
}
