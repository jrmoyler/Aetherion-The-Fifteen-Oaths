// Solid, tapered locks keep a readable silhouette under motion and oblique light.
// All measurements are fractions of chin-to-crown height, attached to the head bone.
import { CatmullRomCurve3, TubeGeometry, Vector3, Color, Float32BufferAttribute, BufferGeometry, MeshPhysicalMaterial } from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { cranium } from './head.js';
const supported = new Set(['oath-01-sorcerer','oath-03-sorcerer','oath-14-sorcerer']);
export function buildReferenceHair(key, P, H, quality) {
  if (!supported.has(key)) return null;
  const kiln = key === 'oath-01-sorcerer', storm = key === 'oath-03-sorcerer';
  const parts=[];
  function lock(points,radius,index) {
    const curve = new CatmullRomCurve3(points.map(p=>new Vector3(...p)));
    const segments=quality==='low'?12:20, radial=5;
    const g=new TubeGeometry(curve,segments,radius,radial,false), pos=g.attributes.position;
    for(let i=0;i<pos.count;i++){
      const t=Math.floor(i/(radial+1))/segments, center=curve.getPointAt(t);
      const taper=.25+.75*Math.sin(Math.PI*(.1+.8*t));
      const v=new Vector3().fromBufferAttribute(pos,i).sub(center).multiplyScalar(taper).add(center);
      pos.setXYZ(i,v.x*H,v.y*H,v.z*H);
    }
    g.computeVertexNormals();
    const c=new Color(kiln?(index%4===0?'#8c867d':index%3===0?'#67635c':'#48413a'):storm?(index%4===0?'#342b24':'#191512'):(index%5===0?'#514538':'#241e19'));
    const colors=[];for(let i=0;i<pos.count;i++)colors.push(c.r,c.g,c.b);
    g.setAttribute('color',new Float32BufferAttribute(colors,3));parts.push(g);
  }
  const capP=[],capI=[],capC=[]; const capColor=new Color(kiln?'#47413b':storm?'#191512':'#241e19');
  for(let j=0;j<=16;j++)for(let i=0;i<=64;i++){
    const a=i/64*Math.PI*2,front=Math.max(0,Math.sin(a)),bottom=-.68+.98*front;
    const y=bottom+(1-bottom)*j/16,r=Math.sqrt(Math.max(0,1-y*y));
    const p=cranium(new Vector3(Math.cos(a)*r,y,Math.sin(a)*r),P).multiplyScalar(1.035*H);
    capP.push(p.x,p.y,p.z);capC.push(capColor.r,capColor.g,capColor.b);
  }
  for(let j=0;j<16;j++)for(let i=0;i<64;i++){const a=j*65+i,b=a+65;capI.push(a,b,a+1,b,b+1,a+1);}
  const cap=new BufferGeometry();cap.setAttribute('position',new Float32BufferAttribute(capP,3));cap.setAttribute('color',new Float32BufferAttribute(capC,3));cap.setIndex(capI);cap.computeVertexNormals();
  // Supply UVs to match TubeGeometry for merging; these solid materials use vertex color.
  cap.setAttribute('uv',new Float32BufferAttribute(new Array(capP.length/3*2).fill(0),2));parts.push(cap);
  // Curved scalp locks converge on a rear crown bun. Front roots follow the
  // actual cranium, rather than a cone rising from the hairline.
  const n=storm?32:26;
  for(let i=0;i<n;i++){
    const a=(i/n)*Math.PI*2, points=[];
    for(let j=0;j<=8;j++){
      const t=j/8, y=.28+.62*t, angle=a*(1-.35*t);
      const p=cranium(new Vector3(Math.cos(angle)*Math.sqrt(1-y*y),y,Math.sin(angle)*Math.sqrt(1-y*y)),P);
      const wave=kiln?Math.sin(t*12+i)*.018:Math.sin(t*8+i)*.006;
      p.multiplyScalar(1.045);p.x+=wave;p.z+=.008;
      points.push(p.toArray());
    }
    lock(points,storm?.018:.016,i);
  }
  // Overlapping loops form a closed bun, with a distinct coiled silhouette.
  for(let i=0;i<18;i++){
    const a=i/18*Math.PI*2,points=[];
    for(let j=0;j<=16;j++){
      const t=j/16*Math.PI*2, r=storm?.125:.11;
      points.push([Math.cos(a)*(r+.035*Math.cos(t)),.47+.10*Math.sin(t),-.21+Math.sin(a)*(r+.035*Math.cos(t))]);
    }
    lock(points,storm?.025:.018,i+30);
  }
  if(kiln){
    for(const side of [-1,1])for(let i=0;i<7;i++){
      const points=[];for(let j=0;j<=12;j++){
        const t=j/12;points.push([side*(.26+.04*Math.sin(t*10+i)+i*.008),.27-t*(.55+i*.015),.19+.055*Math.cos(t*9+i)-.05*t]);
      }lock(points,.011,i);
    }
  }else if(!storm){
    for(let i=0;i<9;i++)lock([[.10+i*.012,.42,.24],[-.03,.32,.36],[-.21,.13,.31],[-.30,-.12,.21],[-.27,-.32,.17]],.012,i);
    for(const side of [-1,1])lock([[side*.27,.20,.24],[side*.34,-.03,.19],[side*.32,-.30,.17],[side*.29,-.42,.15]],.010,3);
  }
  const geometry=mergeGeometries(parts,false);parts.forEach(g=>g.dispose());
  const material=new MeshPhysicalMaterial({vertexColors:true,roughness:.74,metalness:0,sheen:.35,sheenRoughness:.6,sheenColor:'#8e7d68',specularIntensity:.16});
  material.name='reference-solid-locks';
  return {geometry,material};
}
