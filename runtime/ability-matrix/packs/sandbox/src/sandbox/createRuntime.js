/**
 * Hosts one source pack's engine inside the sandbox scene.
 *
 * The five source repos each ship their own copies of the shared systems —
 * particles, ground decals, burst shells, the aim indicator, the ability pool —
 * and those copies drifted apart as the author built each pack. Their abilities
 * are written against *their* copies, so the sandbox does not port them onto
 * one engine. It runs each pack's own, verbatim, from `src/vendor/<pack>/`:
 *
 *   - its AbilityManager (pooling, concurrency) and every ability file
 *   - its ParticleEngine, DecalSystem and BurstSystem, added to the shared scene
 *   - its AimController, so gate / ring / scribe / snap aims stay its own
 *   - its settings module, so presets and editor folders are the originals
 *
 * What the packs have in common byte-for-byte (lights, camera shake, screen
 * flash, the frame-uniform contract, the render layers) is shared with the host,
 * and so are the scene, camera, environment, character and target dummies — one
 * sandbox, one set of bodies every ability hits.
 *
 * Each frame the host copies its frame uniforms and global multipliers into the
 * pack's own copies, so a pack's shaders see the same clock, depth buffer and
 * light direction as everything else.
 */

/**
 * @param {object} spec
 * @param {string} spec.pack                 pack id ('linear', 'handcast', …)
 * @param {object} spec.host                 shared sandbox services (see App#_vendorHost)
 * @param {object} spec.config               the pack's config/settings.js namespace
 * @param {Function} spec.AbilityManager
 * @param {Function} spec.ParticleEngine
 * @param {Function} spec.DecalSystem
 * @param {Function} spec.BurstSystem
 * @param {Function} spec.AimController
 * @param {object} spec.frame                the pack's core/FrameUniforms.js `frame`
 * @param {object} spec.sigils               the pack's ui/glyphs.js ELEMENT_SIGILS
 * @param {Function} spec.Editor             the pack's ui/Editor.js class
 * @param {object} spec.builders             ability id → Editor method name ('_buildIce')
 * @param {boolean} [spec.flushWithTime]     ParticleEngine#flush takes the clock
 * @param {boolean} [spec.lateUpdate]        AbilityManager has lateUpdate (casting)
 * @param {boolean} [spec.aimTargets]        AimController snaps to dummies (casting)
 * @param {object} [spec.systems]            extra ctx systems the pack's own App
 *                                           builds (name → class taking the scene,
 *                                           with update/clear/dispose), e.g. the
 *                                           Linear pack's `fissures`
 */
export function createRuntime(spec) {
  const { pack, host, config } = spec;
  const { settings, ELEMENTS, ELEMENT_META, DEFAULT_SETTINGS, applySettings } = config;
  const castShapeOf = config.castShapeOf ?? ((id) => ELEMENT_META[id]?.cast ?? 'line');
  const zoneRadiusOf = config.zoneRadiusOf ?? ((id) => settings[id]?.zoneRadius ?? 0);

  const scene = host.scene;
  const particles = new spec.ParticleEngine(scene);
  const decals = new spec.DecalSystem(scene);
  const bursts = new spec.BurstSystem(scene);
  const models = {};
  /** Pack-only systems its abilities read off ctx; hosted here so they exist. */
  const systems = Object.entries(spec.systems ?? {}).map(([name, System]) => [name, new System(scene)]);

  const ctx = {
    scene,
    camera: host.camera,
    environment: host.environment,
    particles,
    lights: host.lights,
    decals,
    bursts,
    shake: host.shake,
    flash: host.flash,
    dummies: host.dummies,
    models,
    character: host.character,
    ...Object.fromEntries(systems)
  };
  const manager = new spec.AbilityManager(ctx);

  const aim = new spec.AimController(host.camera);
  if (spec.aimTargets) aim.targets = host.dummies;
  aim.object3D.visible = false;
  scene.add(aim.object3D);

  /** Copy every host frame uniform the pack also declares. */
  function syncFrame() {
    const ours = spec.frame;
    const theirs = host.frame;
    for (const key of Object.keys(ours)) {
      const src = theirs[key];
      if (!src) continue;
      const value = src.value;
      if (value && typeof value.copy === 'function' && ours[key].value && typeof ours[key].value.copy === 'function') {
        ours[key].value.copy(value);
      } else {
        ours[key].value = value;
      }
    }
  }

  /** The host's global sliders drive every pack's globals. */
  function syncGlobals() {
    const g = settings.global;
    const h = host.settings.global;
    if (!g || !h) return;
    for (const key of Object.keys(g)) if (key in h) g[key] = h[key];
  }

  function meta(id) {
    const m = ELEMENT_META[id] ?? {};
    const block = settings[id] ?? {};
    return {
      label: m.label ?? id,
      hint: m.hint ?? '',
      key: m.key ?? '',
      accent: m.accent ?? '#ffffff',
      cast: castShapeOf(id),
      castAnim: block.castAnim ?? null,
      cooldown: block.cooldown ?? null,
      range: block.range ?? null,
      minRange: block.minRange ?? null,
      zoneRadius: block.zoneRadius ?? null,
      glyph: spec.sigils?.[id] ?? ''
    };
  }

  const runtime = {
    pack,
    ids: [...ELEMENTS],
    settings,
    defaults: DEFAULT_SETTINGS,
    applySettings,
    manager,
    aim,
    models,
    ctx,
    castShapeOf,
    meta,
    /** Non-slot actions (boosts); filled in by a pack's own runtime. */
    extras: [],

    /** Called by the host after the pack's models are in `models`. */
    async load() {},

    isSummon(id) {
      return castShapeOf(id) === 'summon';
    },

    /** Build one instance of an ability now, so its first cast does not hitch. */
    prewarm(id) {
      return manager.prewarm?.(id) ?? null;
    },

    select(id) {
      manager.select(id);
      aim.setElement(id);
    },

    cast(id, origin, direction, distance) {
      return manager.cast(origin, direction, distance, id);
    },

    update(dt, raw) {
      syncFrame();
      syncGlobals();
      manager.update(dt);
    },

    /** After the dummies have been stepped: hits, then anything drawn on bodies. */
    afterBodies(dt, time) {
      host.dummies.applyHitsWith(manager.active, castShapeOf, zoneRadiusOf);
      if (spec.lateUpdate) manager.lateUpdate?.(dt);
      if (spec.flushWithTime) particles.flush(time);
      else particles.flush();
      decals.update(dt);
      bursts.update(dt);
      for (const [, system] of systems) system.update(dt);
    },

    get focus() {
      return manager.focus;
    },

    get active() {
      return manager.active;
    },

    clear() {
      aim.cancel();
      manager.clear();
      particles.reset();
      decals.clear();
      bursts.clear();
      for (const [, system] of systems) system.clear();
    },

    countParticles(time) {
      return particles.countLive?.(time) ?? 0;
    },

    /**
     * The pack's own editor folders, built into `folder`.
     *
     * Each pack's Editor builds its ability folders with methods that only use
     * `this.gui` and the pack's own settings, so the sandbox borrows them on an
     * object whose `gui` is the sandbox folder — the original sliders, labels
     * and ranges, without a second editor window.
     */
    buildEditor(folder) {
      const editor = Object.create(spec.Editor.prototype);
      editor.gui = folder;
      editor.hooks = {};
      for (const id of ELEMENTS) {
        const name = spec.builders[id];
        if (name && typeof editor[name] === 'function') editor[name]();
      }
      for (const name of spec.extraBuilders ?? []) {
        if (typeof editor[name] === 'function') editor[name]();
      }
    },

    preset(id) {
      return settings[id];
    },

    applyPreset(id, block) {
      if (!settings[id] || !block) return false;
      applySettings({ [id]: block });
      return true;
    },

    resetPreset(id) {
      if (!DEFAULT_SETTINGS[id]) return false;
      applySettings({ [id]: structuredClone(DEFAULT_SETTINGS[id]) });
      return true;
    },

    dispose() {
      manager.dispose();
      particles.dispose();
      decals.dispose();
      bursts.dispose();
      for (const [, system] of systems) system.dispose();
      aim.dispose();
    }
  };

  return runtime;
}
