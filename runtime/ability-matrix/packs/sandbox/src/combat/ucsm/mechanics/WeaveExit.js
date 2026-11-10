import { EventDispatcher } from 'three';
import { frame } from '../../../core/FrameUniforms.js';
import { settings } from '../../../config/settings.js';
import { WEAVE_LOOK } from './WeaveLook.js';

/**
 * WeaveExit — anchors and links burn out instead of popping.
 *
 * `MechanicPresentation` removes an anchor or link item on the very frame its
 * combat record disappears (expiry, a break taking its links with it, the
 * caster cancelling). The record is gone, so gameplay is right to forget it at
 * once, and the tests pin that the item leaves `presentation.items` on that
 * update. What should not happen is the pylon, helix, sigil, motes, shimmer
 * and every braid vanishing in one frame.
 *
 * So the root group of every anchor and link is *armed* when it is built: when
 * the presentation detaches it, the `removed` listener below puts the same
 * group straight back into the scene as a departing **ghost**, no longer owned
 * by the presentation. For `exitTime` seconds:
 *
 *  - every shader layer reads `weaveExit(root)` and burns away through noise
 *    with a hot edge (`uExit` in `WeaveShaders`), the shimmer and the motes
 *    fade with it;
 *  - the lit solids retract: an anchor's pylon sinks into its sigil, a link's
 *    core, strands and markers thin to nothing along their own axes.
 *
 * When the burn completes the ghost removes itself. Nothing is rebuilt — the
 * ghost is the original group with its pooled geometry and materials — and no
 * per-frame work exists outside the draws the ghost already makes.
 *
 * ### When a group does *not* ghost
 *
 *  - under `prefers-reduced-motion`, or with `exitTime` at 0: it leaves at
 *    once, as before;
 *  - when its combat record still exists (the presentation is being cleared
 *    or disposed around a live weave, not reporting an exit);
 *  - when the presentation already ran its own exit on the item
 *    (`item.exitStart`, the scheme worldshape uses) — the shaders then read
 *    that instead, and the group is not ghosted a second time.
 *
 * ### Clocks and cleanup
 *
 * A ghost advances on wall time scaled by `settings.global.timeScale` while
 * the simulation runs, and on plain wall time while it is paused, so a ghost
 * left by "clear effects" during a pause still finishes. `dispose()` of the
 * presentation removes any ghost still burning: the sweeper registered in
 * `presentation.resources` is an `EventDispatcher` that dispatches `dispose`
 * like the geometries and materials beside it.
 */

/** Root group → exit state. */
const EXIT = new WeakMap();
/** Presentation → its sweeper (one per presentation). */
const SWEEPERS = new WeakMap();

const now = () => (typeof performance !== 'undefined' ? performance.now() : Date.now());
const clamp01 = (x) => (x < 0 ? 0 : x > 1 ? 1 : x);

/** Removes the ghosts still burning when the presentation is disposed. */
class GhostSweeper extends EventDispatcher {
  constructor(view) {
    super();
    this.view = view;
    this.ghosts = new Set();
  }

  dispose() {
    for (const g of this.ghosts) {
      const st = EXIT.get(g);
      if (st) st.done = true;
      g.parent?.remove(g);
    }
    this.ghosts.clear();
    this.dispatchEvent({ type: 'dispose' });
  }
}

function sweeperOf(view) {
  let sweeper = SWEEPERS.get(view);
  if (!sweeper) {
    sweeper = new GhostSweeper(view);
    SWEEPERS.set(view, sweeper);
    view.resources.push(sweeper);
  }
  return sweeper;
}

/**
 * Arm a freshly built anchor (`kind = 'anchor'`) or link (`'link'`) root for
 * a graceful exit. Called once per build, at spawn.
 */
export function armWeaveExit(view, g, kind) {
  if (EXIT.has(g)) return;
  EXIT.set(g, {
    view,
    kind,
    item: null, // the presentation item, found once by its root
    departing: false,
    done: false,
    elapsed: 0,
    last: 0,
    solids: null, // link solids and their rest thickness, captured at exit
    rest: null
  });
  g.addEventListener('removed', onRemoved);
  sweeperOf(view);
}

/** The presentation item that owns `g`, cached on the exit state. */
export function weaveItemOf(view, g) {
  const st = EXIT.get(g);
  if (st?.item) return st.item;
  for (const item of view.items.values()) {
    if (item.g !== g) continue;
    if (st) st.item = item;
    return item;
  }
  return null;
}

/** True while the item's combat record still exists. */
function isLive(view, item) {
  const weave = view.s?.weave;
  if (!weave) return false;
  if (item.kind === 'anchor') return weave.anchors.has(item.id);
  for (const link of weave.links) if (link.id === item.id) return true;
  return false;
}

function onRemoved(event) {
  const g = event.target, st = EXIT.get(g);
  if (!st || st.departing || st.done) return;
  const view = st.view;
  if (view.reducedMotion || !(WEAVE_LOOK.exitTime > 0)) return;
  // At this point the presentation has detached the group but not yet
  // forgotten the item, so the item still identifies what is leaving.
  const item = weaveItemOf(view, g);
  if (!item || item.exitStart !== undefined || isLive(view, item)) return;

  st.departing = true;
  st.elapsed = 0;
  st.last = now();
  if (st.kind === 'link') {
    // Links are built in world space with the group at the origin, so they
    // retract per solid (core, strands, markers) rather than by group scale.
    // The solids are the lit presentation meshes; every shader layer dissolves
    // on its own and keeps its scale.
    const solids = [];
    g.traverse((n) => {
      if (n.isMesh && !n.material?.isShaderMaterial) solids.push(n);
    });
    st.solids = solids;
    st.rest = new Float32Array(solids.length * 2);
    for (let i = 0; i < solids.length; i++) {
      st.rest[i * 2] = solids[i].scale.x;
      st.rest[i * 2 + 1] = solids[i].scale.z;
    }
  }
  sweeperOf(view).ghosts.add(g);
  view.scene.add(g);
}

/** Retract the lit solids of a ghost to `exit` (1 standing → 0 gone). */
function retract(g, st, exit) {
  if (st.kind === 'anchor') {
    // The pylon sinks into its sigil; the ground layers narrow a little.
    g.scale.set(0.6 + 0.4 * exit, Math.max(0.01, exit), 0.6 + 0.4 * exit);
    return;
  }
  const { solids, rest } = st;
  for (let i = 0; i < solids.length; i++) {
    solids[i].scale.x = rest[i * 2] * Math.max(0.01, exit);
    solids[i].scale.z = rest[i * 2 + 1] * Math.max(0.01, exit);
  }
}

function finish(g, st) {
  if (st.done) return;
  st.done = true;
  // Removing during a draw is deferred to after the frame; the group is
  // already fully burnt out, so nothing is visible in between.
  queueMicrotask(() => {
    SWEEPERS.get(st.view)?.ghosts.delete(g);
    g.parent?.remove(g);
  });
}

/**
 * 1 while the anchor / link rooted at `g` stands, falling to 0 over
 * `exitTime` as it burns out. Called from every shader hook of the group, so
 * the ghost advances only while it is actually drawn.
 */
export function weaveExit(g) {
  const st = g && EXIT.get(g);
  if (!st) return 1;
  const life = Math.max(1e-3, WEAVE_LOOK.exitTime);
  if (!st.departing) {
    // The presentation's own exit scheme, if it ever runs one on this item.
    const item = st.item ?? weaveItemOf(st.view, g);
    if (item?.exitStart === undefined) return 1;
    const m = st.view.s.m;
    return clamp01(1 - (m.tick - item.exitStart) / m.budget.tickRate / life);
  }
  if (st.done) return 0;
  const t = now(), wall = (t - st.last) / 1000;
  st.last = t;
  st.elapsed += frame.uDelta.value > 0 ? wall * settings.global.timeScale : wall;
  const exit = clamp01(1 - st.elapsed / life);
  retract(g, st, exit);
  if (exit <= 0) finish(g, st);
  return exit;
}
