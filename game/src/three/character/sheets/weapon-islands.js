// The forge exports the held prop and body as separate welded islands in a single
// indexed primitive. Cutting faces by distance to the palm also cuts out the grip.
export function heldWeaponIndices(geometry, names, mount) {
  const {position, skinIndex, skinWeight} = geometry.attributes;
  const source = geometry.index.array;
  const parent = new Int32Array(position.count);
  const weld = new Map();
  for (let i = 0; i < position.count; i++) {
    const key = [position.getX(i), position.getY(i), position.getZ(i)].map(x => Math.round(x * 1e5)).join(',');
    if (!weld.has(key)) weld.set(key, i);
    parent[i] = weld.get(key);
  }
  function root(i) {
    while (parent[i] !== i) { parent[i] = parent[parent[i]]; i = parent[i]; }
    return i;
  }
  for (let i = 0; i < source.length; i += 3) {
    const a = root(source[i]);
    parent[root(source[i + 1])] = a;
    parent[root(source[i + 2])] = a;
  }
  const reject = new Uint8Array(position.count);
  for (const i of source) {
    let slot = 0;
    for (let j = 1; j < 4; j++) {
      if (skinWeight.getComponent(i, j) > skinWeight.getComponent(i, slot)) slot = j;
    }
    const owner = names[skinIndex.getComponent(i, slot)];
    if (owner !== 'hand.R' && owner !== 'hand.L' && owner !== mount) reject[root(i)] = 1;
  }
  return source.filter(i => !reject[root(i)]);
}
