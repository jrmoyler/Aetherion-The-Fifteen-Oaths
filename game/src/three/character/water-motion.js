import { AnimationClip, Box3, Euler, Quaternion, QuaternionKeyframeTrack, Vector3, VectorKeyframeTrack } from 'three';

// Symmetric breaststroke. Each pair of directions aims elbow then wrist
// in the torso frame. Reach, catch, pull, recover, and glide are timed
// separately from the kick, which starts as the hands return forward.
const STROKE = [
  [0,    [.12,.60,.80], [.04,.56,.84], [.10,-.95,-.27], [.08,-.94,-.33]],
  [.18,  [.55,.35,.72], [.35,.40,.84], [.10,-.95,-.27], [.08,-.94,-.33]],
  [.36,  [.86,-.05,.45], [.18,-.41,.89], [.18,-.96,.22], [.26,-.53,-.80]],
  [.48,  [.52,-.70,.46], [-.60,.35,.68], [.34,-.84,.43], [.42,-.30,-.86]],
  [.60,  [.30,-.32,.90], [-.28,.42,.86], [.46,-.88,.06], [.48,-.78,-.42]],
  [.75,  [.14,.49,.86], [.02,.51,.86], [.12,-.96,-.23], [.12,-.94,-.32]],
  [1,    [.12,.60,.80], [.04,.56,.84], [.10,-.95,-.27], [.08,-.94,-.33]],
];

// At rest, scull just below the surface and alternate the support leg.
const SCULL = [
  [0,    [.80,-.51,.30], [.49,.03,.87], [.32,-.86,.39], [.24,-.58,-.78]],
  [.25,  [.87,-.45,.18], [.82,.08,.56], [.45,-.85,.13], [.45,-.87,-.20]],
  [.50,  [.72,-.61,.32], [.50,-.08,.86], [.12,-.98,-.12], [.08,-.94,-.34]],
  [.75,  [.63,-.65,.42], [.08,-.12,.99], [.22,-.92,.33], [.20,-.56,-.80]],
  [1,    [.80,-.51,.30], [.49,.03,.87], [.32,-.86,.39], [.24,-.58,-.78]],
];

const library = new WeakMap();
const radians = Math.PI / 180;

function sampleDirection(keys, phase, index, mirror) {
  let i = 1;
  while (i < keys.length - 1 && keys[i][0] < phase) i++;
  const start = keys[i - 1], end = keys[i];
  const t = (phase - start[0]) / (end[0] - start[0]);
  const direction = new Vector3().fromArray(start[index]).lerp(
    new Vector3().fromArray(end[index]), t * t * (3 - 2 * t));
  direction.x *= mirror;
  return direction.normalize();
}

function authorCycle(bones, moving, height) {
  const duration = moving ? 1.56 : 2.2;
  const tracks = new Map();
  const frames = 32;
  const times = Array.from({ length: frames + 1 }, (_, i) => duration * i / frames);
  const locations = [];
  const append = (bone, q) => {
    if (!tracks.has(bone)) tracks.set(bone, []);
    q.toArray(tracks.get(bone), tracks.get(bone).length);
  };
  // +Y points from each upper limb bone toward its child in the shipped rig;
  // derive the actual axis from its child to retain per-model joint placement.
  const pairs = [['upperarm','forearm'], ['forearm','hand'], ['thigh','shin'], ['shin','foot']];
  const pitch = moving ? 51 : 7;
  for (let frame = 0; frame <= frames; frame++) {
    const phase = frame / frames, wave = Math.cos(phase * 2 * Math.PI);
    const tilt = new Quaternion().setFromEuler(new Euler((pitch + (moving ? 5 : 2) * wave) * radians, 0, 0));
    const pose = new Map();
    function world(bone) {
      if (!bone) return new Quaternion();
      if (!pose.has(bone)) pose.set(bone, world(bone.parent).clone().multiply(bone.quaternion));
      return pose.get(bone);
    }
    function setWorld(bone, rotation) {
      const local = world(bone.parent).clone().invert().multiply(rotation);
      pose.set(bone, rotation);
      append(bone, local);
    }
    const hips = bones.get('hips'), neck = bones.get('neck');
    setWorld(hips, tilt.clone().multiply(hips.getWorldQuaternion(new Quaternion())));
    const neckPitch = new Quaternion().setFromEuler(new Euler((moving ? 17 : 2) * radians, 0, 0));
    setWorld(neck, neckPitch.multiply(neck.getWorldQuaternion(new Quaternion())));
    // Keep the controller's 60%-submerged capsule and fit the pose within it.
    // The mesh bounds can include hair or a raised staff: resolve the actual
    // base of the skull through this frame's FK chain rather than using a
    // fixed fraction of model height to place the waterline.
    const head = bones.get('head'), headPoint = new Vector3();
    const scale = new Vector3(), step = new Vector3();
    for (let joint = head; joint.parent; joint = joint.parent) {
      joint.parent.getWorldScale(scale);
      step.copy(joint.position).multiply(scale).applyQuaternion(world(joint.parent));
      headPoint.add(step);
    }
    const freeboard = moving ? .03 - .035 * wave : .025 + .014 * wave;
    const elevation = height * .6 + freeboard - headPoint.y;
    const hipVertical = hips.parent.getWorldScale(scale).y;
    locations.push(hips.position.x, hips.position.y + elevation / hipVertical, hips.position.z);
    for (const [side, mirror] of [['L', 1], ['R', -1]]) {
      pairs.forEach(([joint, tip], i) => {
        const bone = bones.get(joint + side), child = bones.get(tip + side);
        const bind = bone.getWorldQuaternion(new Quaternion());
        const axis = child.position.clone().normalize().applyQuaternion(bind);
        const legPhase = !moving && i >= 2 && side === 'R' ? (phase + .5) % 1 : phase;
        const target = sampleDirection(moving ? STROKE : SCULL, legPhase, i + 1, mirror).applyQuaternion(tilt);
        setWorld(bone, new Quaternion().setFromUnitVectors(axis, target).multiply(bind));
      });
    }
  }
  const keys = Array.from(tracks, ([bone, values]) => new QuaternionKeyframeTrack(bone.name + '.quaternion', times, values));
  keys.push(new VectorKeyframeTrack(bones.get('hips').name + '.position', times, locations));
  return new AnimationClip(moving ? 'swim' : 'tread_water', duration, keys);
}

export function waterClips(scene, height) {
  if (library.has(scene)) return library.get(scene);
  const bones = new Map();
  scene.traverse(node => { if (node.isBone) bones.set(node.name.replace(/\./g, ''), node); });
  const required = ['hips','neck','head',...['L','R'].flatMap(s => ['upperarm','forearm','hand','thigh','shin','foot'].map(b => b + s))];
  height ??= new Box3().setFromObject(scene).getSize(new Vector3()).y;
  const clips = required.every(name => bones.has(name))
    ? [authorCycle(bones, true, height), authorCycle(bones, false, height)] : [];
  library.set(scene, clips);
  return clips;
}
