import { NATIVE_ABILITIES as COLLECTIVE_ABILITIES } from './sandbox.js';
import { ELEMENTS } from '../config/settings.js';
import { ObjectPool } from '../utils/ObjectPool.js';

/** Registry: adding an ability means adding one line here. */
const ABILITY_TYPES = Object.fromEntries(COLLECTIVE_ABILITIES.map((m) => [m.ID, m.Ability]));

const MAX_CONCURRENT = 4;

/**
 * Spawns, updates and recycles abilities.
 *
 * Instances are pooled per type: casting fifty times constructs at most a
 * handful of objects per ability, and every one of them keeps its meshes and
 * materials for the lifetime of the app. Nothing is built during a cast.
 *
 * `MAX_CONCURRENT` is shared across types, so mixing abilities retires the
 * oldest cast whichever element it was.
 */
export class AbilityManager {
  /**
   * @param {object} context shared systems handed to every ability:
   *   { scene, camera, environment, particles, lights, decals, bursts, shake, flash }
   */
  constructor(context) {
    this.ctx = context;
    this.active = [];
    this.selected = ELEMENTS[0];

    this.pools = new Map();
    this.registered = new Set();
    for (const [element, Type] of Object.entries(ABILITY_TYPES)) {
      this.pools.set(
        element,
        new ObjectPool(() => {
          const ability = new Type(this.ctx);
          this.ctx.scene.add(ability.group);
          ability.group.visible = false;
          return ability;
        })
      );
    }
  }

  select(element) {
    if (!this.pools.has(element)) return;
    this.selected = element;
  }

  /** Register an independently approved expansion without replacing a native pool. */
  register(element, Type) {
    if (!element || typeof Type !== 'function' || this.pools.has(element)) throw new Error(`Ability already registered: ${element}`);
    this.pools.set(element, new ObjectPool(() => {
      const ability = new Type(this.ctx);
      this.ctx.scene.add(ability.group);
      ability.group.visible = false;
      return ability;
    }));
    this.registered.add(element);
  }

  unregister(element) {
    if (!this.registered.has(element)) return false;
    if (this.active.some((ability) => ability.element === element)) throw new Error(`Ability is active: ${element}`);
    this.pools.get(element).dispose((ability) => ability.dispose());
    this.pools.delete(element);
    this.registered.delete(element);
    return true;
  }

  /** Registered ability ids, in the order the HUD lists them. */
  get elements() {
    return [...ELEMENTS.filter((element) => ABILITY_TYPES[element]), ...this.registered];
  }

  /**
   * Build one instance of an ability without casting it.
   *
   * The pools are lazy on purpose — nothing is constructed *during* a cast — but
   * something still has to pay for the first instance, and by default that is
   * the first cast: a few hundred milliseconds of geometry generation followed
   * by a GPU stall while the driver compiles the shaders those new meshes just
   * brought into the scene. `App#load` calls this for every element behind the
   * loading screen instead, so the first cast of a session costs what the
   * fiftieth does.
   *
   * The instance goes straight back into the pool, hidden and parented to the
   * scene, exactly as if it had been cast and retired.
   *
   * @returns {import('./Ability.js').Ability|null}
   */
  prewarm(element) {
    const pool = this.pools.get(element);
    if (!pool) return null;
    const ability = pool.acquire();
    pool.release(ability);
    return ability;
  }

  /**
   * Cast the selected ability along a line.
   *
   * A far cast takes the same three arguments and simply works from the far end
   * of that line — which is why adding zone targeting needed nothing here.
   *
   * @param {THREE.Vector3} origin     on the floor
   * @param {THREE.Vector3} direction  unit, flat
   * @param {number} distance          metres
   * @returns {import('./Ability.js').Ability|null}
   */
  cast(origin, direction, distance, element = this.selected) {
    if (!this.pools.has(element)) return null;

    // Retire the oldest cast rather than letting the scene grow without bound.
    if (this.active.length >= MAX_CONCURRENT) {
      const oldest = this.active.shift();
      oldest.destroy();
      this.pools.get(oldest.element).release(oldest);
    }

    const ability = this.pools.get(element).acquire();
    ability.spawn(origin, direction, distance);
    this.active.push(ability);
    return ability;
  }

  update(dt) {
    for (let i = this.active.length - 1; i >= 0; i--) {
      const ability = this.active[i];
      ability.update(dt);
      if (ability.isFinished) {
        this.active.splice(i, 1);
        ability.destroy();
        this.pools.get(ability.element).release(ability);
      }
    }
  }

  /** Cancel everything currently in flight. */
  clear() {
    for (const ability of this.active) {
      ability.destroy();
      this.pools.get(ability.element).release(ability);
    }
    this.active.length = 0;
  }

  /** The most recent still-running cast — used to frame the camera. */
  get focus() {
    for (let i = this.active.length - 1; i >= 0; i--) {
      if (this.active[i].isActive) return this.active[i];
    }
    return null;
  }

  dispose() {
    this.clear();
    for (const pool of this.pools.values()) pool.dispose((ability) => ability.dispose());
    this.pools.clear();
  }
}
