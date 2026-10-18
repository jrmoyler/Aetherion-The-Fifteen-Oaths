// Bounded Three.js combat effects. Gameplay damage remains server authoritative.
import {
  Group, Vector3, Color, BufferGeometry, Float32BufferAttribute, Points, ShaderMaterial,
  Mesh, MeshBasicMaterial, RingGeometry, IcosahedronGeometry, TorusGeometry,
  Line, LineBasicMaterial, AdditiveBlending, DoubleSide,
} from 'three';

export const ELEMENT_STYLES = {
  fire: { color: '#ff6b24', core: '#ffefad', motion: 'rise', form: 'flame' },
  frost: { color: '#8bdfff', core: '#efffff', motion: 'shard', form: 'crystal' },
  storm: { color: '#828fff', core: '#f3f7ff', motion: 'jitter', form: 'lightning' },
  water: { color: '#20bacd', core: '#b8fff4', motion: 'wave', form: 'ripple' },
  earth: { color: '#d0a36b', core: '#fff0c2', motion: 'shard', form: 'rock' },
  wind: { color: '#b5e2d1', core: '#f3fff8', motion: 'orbit', form: 'spiral' },
  nature: { color: '#6fbf5b', core: '#e7ff98', motion: 'orbit', form: 'leaf' },
  poison: { color: '#a3ce38', core: '#e0ff9e', motion: 'rise', form: 'mist' },
  light: { color: '#ffd477', core: '#ffffff', motion: 'rise', form: 'halo' },
  cosmic: { color: '#9a72f4', core: '#d8c7ff', motion: 'orbit', form: 'orbit' },
  shadow: { color: '#766098', core: '#c3a4ee', motion: 'collapse', form: 'void' },
  blood: { color: '#bd263e', core: '#ffb7a6', motion: 'fall', form: 'shard' },
  arcane: { color: '#c679e6', core: '#f4d1ff', motion: 'orbit', form: 'sigil' },
  time: { color: '#d9b86f', core: '#fff1c3', motion: 'orbit', form: 'clock' },
  tech: { color: '#45dbe1', core: '#d4ffff', motion: 'jitter', form: 'grid' },
};
import { PALETTES } from '../vfx/palettes.generated.js';

const STATUS_ELEMENT = { burning:'fire', chilled:'frost', shocked:'storm', soaked:'water', rooted:'nature', poisoned:'poison', gravity:'cosmic', cursed:'shadow', bleeding:'blood', hexed:'arcane', slowed:'time', sundered:'earth', shielded:'light', haste:'wind', blessed:'nature', empowered:'tech' };
const pointVertex = `attribute float seed; varying float vSeed; uniform float size; void main(){vSeed=seed; vec4 mv=modelViewMatrix*vec4(position,1.);gl_Position=projectionMatrix*mv;gl_PointSize=clamp(size*240./max(1.,-mv.z),1.,38.);}`;
const pointFragment = `uniform vec3 tint; uniform vec3 core; uniform float opacity; varying float vSeed; void main(){float d=length(gl_PointCoord-.5)*2.; if(d>1.)discard;float a=pow(1.-d,2.);gl_FragColor=vec4(mix(tint,core,pow(1.-d,5.)),a*opacity);}`;
const vec = (p) => new Vector3(p?.x ?? 0, p?.y ?? 0, p?.z ?? 0);

export async function initVFX(ctx) {
  const active = new Set(); const MAX_EFFECTS = 64;
  const scene = ctx.scene;
  function material(color, opacity = 1) { return new MeshBasicMaterial({ color, transparent: true, opacity, depthWrite: false, side: DoubleSide, blending: AdditiveBlending }); }
  function make(element, kind, opts = {}) {
    if (active.size >= MAX_EFFECTS) active.values().next().value.stop();
    const base = ELEMENT_STYLES[element] ?? ELEMENT_STYLES.arcane;
    const palette = opts.palette;
    const colors = (palette?.c ?? []).map(c => new Color(c)).sort((a,b) => (b.r+b.g+b.b)-(a.r+a.g+a.b));
    const style = { ...base, color: colors[2]?.getHexString() ? `#${colors[2].getHexString()}` : base.color, core: colors[0] ? `#${colors[0].getHexString()}` : base.core };
    const root = new Group(); scene.add(root);
    const origin = vec(opts.pos ?? opts.caster?.position), target = vec(opts.target ?? origin);
    const radius = Math.min(10, Math.max(.4, opts.radius ?? 2));
    const anticipation = Math.min(4, Math.max(0, opts.ant ?? opts.castTime ?? 0));
    const projectile = kind === 'projectile';
    const travel = projectile ? Math.min(.85, Math.max(.18, origin.distanceTo(target) / Math.max(12, Math.min(100, palette?.s ?? 25)))) : 0;
    const life = opts.duration ?? (anticipation + travel + (kind === 'status' ? 3 : kind === 'zone' ? Math.min(3, palette?.l ?? 1.65) : Math.min(1.6, palette?.l ?? .8)));
    let age = 0; let done = false;
    root.position.copy(kind === 'zone' ? target : origin);
    const signature = [...(opts.abilityId ?? '')].reduce((n,c)=>n+c.charCodeAt(0),0);
    const n = kind === 'status' ? 18 : opts.ultimate ? 60 : 28 + signature % 20;
    const positions = new Float32Array(n * 3), seeds = new Float32Array(n), velocities = [];
    for (let i = 0; i < n; i++) { seeds[i] = Math.random(); const angle = i * 2.399963; velocities.push(new Vector3(Math.cos(angle), .3 + Math.random() * 1.7, Math.sin(angle)).multiplyScalar(.5 + Math.random())); }
    const geo = new BufferGeometry(); geo.setAttribute('position', new Float32BufferAttribute(positions, 3)); geo.setAttribute('seed', new Float32BufferAttribute(seeds, 1));
    const shader = new ShaderMaterial({ uniforms: { tint: { value: new Color(style.color) }, core: { value: new Color(style.core) }, opacity: { value: 1 }, size: { value: style.form === 'mist' ? .75 : .23 } }, vertexShader: pointVertex, fragmentShader: pointFragment, transparent: true, depthWrite: false, blending: AdditiveBlending });
    const points = new Points(geo, shader); points.frustumCulled = false; root.add(points);
    const accents = [];
    function ring(r, thickness, tilt = -Math.PI / 2) { const m = new Mesh(new RingGeometry(r, r + thickness, 56), material(style.color,.65)); m.rotation.x = tilt; m.position.y = .08; root.add(m); accents.push(m); return m; }
    // Topology varies with the force rather than recolouring one generic particle cloud.
    if (kind === 'melee') {
      const slash = new Mesh(new TorusGeometry(1.5,.055,5,36,Math.PI * 1.3),material(style.core));
      slash.rotation.x = Math.PI / 2.7; slash.position.y = 1; root.add(slash); accents.push(slash);
    } else if (['crystal','rock','leaf','shard','grid'].includes(style.form)) {
      for (let i=0;i<7;i++) { const m=new Mesh(new IcosahedronGeometry(style.form==='rock'?.3:.16,0),material(i%2?style.color:style.core)); const a=i/7*Math.PI*2;m.position.set(Math.cos(a)*radius*.6,.2,Math.sin(a)*radius*.6);m.scale.set(.5,style.form==='leaf'?.4:2.5,.5);m.rotation.z=a;root.add(m);accents.push(m); }
    } else if (style.form === 'lightning') {
      for(let branch=0;branch<3;branch++){ const pts=[];for(let i=0;i<13;i++)pts.push(new Vector3((i%2?.25:-.25)*(1+branch*.3),i/12*2.8,branch*.2));const g=new BufferGeometry().setFromPoints(pts);const line=new Line(g,new LineBasicMaterial({color:style.core,transparent:true,opacity:.85,blending:AdditiveBlending,depthWrite:false}));root.add(line);accents.push(line); }
    } else if (['orbit','sigil','clock','halo','void','ripple','spiral'].includes(style.form)) {
      ring(radius*.6,.035); ring(radius*.85,.025,style.form==='orbit'?Math.PI/3:-Math.PI/2);
      if(style.form==='clock'||style.form==='sigil')for(let i=0;i<12;i++){const a=i/12*Math.PI*2;const g=new BufferGeometry().setFromPoints([new Vector3(Math.cos(a)*radius*.72,.1,Math.sin(a)*radius*.72),new Vector3(Math.cos(a)*radius*.84,.1,Math.sin(a)*radius*.84)]);const line=new Line(g,new LineBasicMaterial({color:style.core,transparent:true,opacity:.8}));root.add(line);accents.push(line);}
    }
    // Telegraph footprint only; clearly separates the cast windup from release.
    const telegraph = kind === 'zone' ? ring(radius,.035) : null;
    if (projectile) { const core=new Mesh(new IcosahedronGeometry(.13,1),material(style.core));core.position.y=1.15;root.add(core);accents.push(core); }
    function stop() { if(done)return;done=true;active.delete(handle);root.removeFromParent();root.traverse(o=>{o.geometry?.dispose();if(o.material){const ms=Array.isArray(o.material)?o.material:[o.material];ms.forEach(m=>m.dispose());}}); }
    const handle = { get done(){return done;}, stop, update(dt) {
      age += dt; if(age >= life){stop();return;}
      const windup=age<anticipation, phase=Math.max(0,age-anticipation), fade=Math.min(1,(life-age)/.45);
      const following = opts.follow?.() ?? (kind==='status'?opts.caster?.position:null);
      if(following)root.position.copy(following);
      if(projectile)root.position.copy(origin).lerp(target,Math.min(1,phase/travel));
      if(kind==='melee' && opts.dir)root.rotation.y=Math.atan2(opts.dir.x,opts.dir.z);
      shader.uniforms.opacity.value=(windup?.18:1)*fade;
      const attr=geo.attributes.position;
      for(let i=0;i<n;i++) {
        const v=velocities[i], seed=seeds[i], t=kind==='status'?(age+seed*2)%1.6:Math.min(phase,1.5), a=i*2.399963+age*(style.motion==='orbit'?2:0);
        let x=v.x*t*radius,y=v.y*t,z=v.z*t*radius;
        if(style.motion==='rise'){x*=.5;z*=.5;y=t*2+seed*.4;}
        if(style.motion==='fall'||style.motion==='shard')y=v.y*t*2-2*t*t;
        if(style.motion==='orbit'){const r=radius*(.3+seed*.4);x=Math.cos(a)*r;z=Math.sin(a)*r;y=.3+seed*1.4+Math.sin(age*3+seed*6)*.15;}
        if(style.motion==='wave'){x=Math.cos(a)*(t+seed)*radius;z=Math.sin(a)*(t+seed)*radius;y=.1+Math.sin(t*8+seed*6)*.15;}
        if(style.motion==='collapse'){const r=Math.max(0,1-t)*radius;x=Math.cos(a)*r;z=Math.sin(a)*r;y=.4+seed;}
        if(style.motion==='jitter'){x=Math.sin(age*31+i)*t*radius;z=Math.cos(age*27+i)*t*radius;y=seed*2;}
        if(projectile){x*=.2;z*=.2;y=1.15+y*.2;}
        attr.setXYZ(i,x,Math.max(.06,y),z);
      }
      attr.needsUpdate=true;
      accents.forEach((m,i)=>{m.material.opacity=(windup?.2:.75)*fade;if(m===telegraph){m.material.opacity=(windup?.35:.65)*fade;return;}if(m.isLine&&style.form==='lightning')m.rotation.y=Math.sin(age*36+i)*1.2;else if(kind==='melee'){m.rotation.z=phase*8;m.scale.setScalar(.65+phase*.8);}else {m.rotation.y+=dt*(i%2?1:-1);if(['crystal','rock','leaf','shard','grid'].includes(style.form)){m.position.y=.15+Math.sin(Math.min(1,phase)*Math.PI)*(i%2?.9:1.4);}}});
    } };
    active.add(handle);return handle;
  }
  const api = {
    castEffect(ab, opts={}) { const shape=ab.shape??'projectile';const kind=shape==='line'?'projectile':shape==='self'||shape==='summon'?'burst':shape;return make(opts.element??ab.element??'arcane',kind,{...opts,palette:PALETTES[ab.id],abilityId:ab.id,radius:ab.radius??opts.radius??(opts.ultimate?5:2)}); },
    play(key,opts={}) {const parts=String(key).split(':');let element=parts.find(p=>ELEMENT_STYLES[p])??(key==='heal'?'nature':'light');let kind=parts[0];if(kind==='basic')kind=parts[1]==='ninja'?'melee':'projectile';if(kind==='ultimate')kind='zone';return make(element,kind,{...opts,ultimate:parts[0]==='ultimate',duration:opts.duration??(key==='levelup'?2.2:undefined)});},
    impact(element,pos,strength=1,opts={}) { return make(element,'impact',{...opts,pos,radius:Math.max(.5,strength*2),duration:.7}); },
    status(actor,kind,duration=3){return make(STATUS_ELEMENT[kind]??'arcane','status',{caster:actor,duration:Math.min(60,duration),radius:1});},
    stopAll(){for(const h of [...active])h.stop();},
    get activeCount(){return active.size;},
  };
  ctx.addUpdate?.(dt=>{for(const h of [...active])h.update(Math.min(.1,Math.max(0,dt)));},35);
  return api;
}
export const init = initVFX;
