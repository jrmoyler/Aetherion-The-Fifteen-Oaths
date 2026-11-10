import { createConvergenceTelegraph } from './ConvergenceTelegraph.js';
import { Raycaster, Plane, Vector2, Vector3 } from 'three';
import { MechanicSystems } from './MechanicSystems.js';
import { MechanicPresentation } from './MechanicPresentation.js';
import { MechanicControls } from './MechanicControls.js';
import { MECHANIC_PRESETS as P, MECHANIC_VARIANTS } from './presets.js';
import { shapeContains } from '../CombatStateManager.js';
import { issueMechanicCast } from './MechanicCommand.js';
import { attachMechanicFeedback } from './ConvergenceCounterStanceFeedback.js';
import { weaveBeat } from './WeaveBeats.js';
import { worldshapeBeat } from './WorldshapeBeats.js';

/** Sandbox glue. All gameplay runs in UCSM; this owns input, audio and scene lifetime. */
export class MechanicHost {
  constructor(adapter) {
    this.adapter = adapter;
    this.app = adapter.app;
    this.systems = new MechanicSystems(adapter.manager);
    this.presentation = new MechanicPresentation(this.app.scene, this.systems);
    // Convergence, counter and stance beats shake, flash and punch the light through the ability context.
    attachMechanicFeedback(this.presentation, this.app.abilities?.ctx);
    this.selected = null;
    this.selectedUid = null;
    this.drill = false;
    this.sound = false;
    this.nextThreat = 0;
    this.threats = [];
    this.threatSequence = 0;
    this.controls = new MechanicControls(this);
    this.ray = new Raycaster();
    this.plane = new Plane(new Vector3(0, 1, 0), 0);
    this.pointer = new Vector2();
    this.target = new Vector3();
    this.onPointer = (e) => {
      if (!this.selected || e.button !== 0) return;
      e.stopImmediatePropagation();
      e.preventDefault();
      this.castAt(e.clientX, e.clientY);
    };
    this.preview = this.presentation.build('anticipation', { family: 'worldshape' });
    this.preview.name = 'MechanicAim';
    this.preview.visible = false;
    this.app.scene.add(this.preview);
    this.convergencePreview = null;
    this.convergencePreviewUid = null;
    this.onMove = (e) => {
      const rect = this.app.canvas.getBoundingClientRect();
      this.pointer.set(
        ((e.clientX - rect.left) / rect.width) * 2 - 1,
        1 - ((e.clientY - rect.top) / rect.height) * 2
      );
    };
    this.app.canvas.addEventListener('pointermove', this.onMove);
    this.app.canvas.addEventListener('pointerdown', this.onPointer, true);
  }
  /** Shared arena aiming for mouse clicks and touch cast gestures. */
  castAt(clientX, clientY) {
    if (!this.selected || !this.adapter.enabled || this.app.paused) return false;
    const rect = this.app.canvas.getBoundingClientRect();
    this.pointer.set(
      ((clientX - rect.left) / rect.width) * 2 - 1,
      1 - ((clientY - rect.top) / rect.height) * 2
    );
    this.ray.setFromCamera(this.pointer, this.app.camera);
    if (!this.ray.ray.intersectPlane(this.plane, this.target)) return false;
    const c = this.app.character.position,
      f = this.selected,
      p = MECHANIC_VARIANTS[this.selectedUid] ?? P[f];
    const direction = this.target.clone().sub(c).setY(0);
    const length = direction.length();
    if (length < 0.001) direction.set(0, 0, 1);
    else direction.normalize();
    const at = c.clone().addScaledVector(direction, Math.min(p.range, length));
    return this.cast(f, ['stance', 'counter'].includes(f) ? [c.x, c.y, c.z] : [at.x, 0, at.z], [
      direction.x,
      0,
      direction.z
    ]);
  }
  select(family, uid = null) {
    if (!P[family]) return false;
    if (uid && MECHANIC_VARIANTS[uid]?.family !== family) return false;
    if (this.app.paused || !this.adapter.enabled) return false;
    this.selectedUid = uid;
    if (family === 'convergence' && uid && this.convergencePreviewUid !== uid) {
      if (this.convergencePreview) {
        this.app.scene.remove(this.convergencePreview);
        this.convergencePreview.userData.dispose();
      }
      this.convergencePreview = createConvergenceTelegraph(MECHANIC_VARIANTS[uid]);
      this.convergencePreviewUid = uid;
      this.app.scene.add(this.convergencePreview);
    }
    if (family === 'stance' && this.systems.stance.active.has('caster')) {
      return this.cast(family, null, [0, 0, 1], 'finish', uid);
    }
    this.app.activeAim.cancel();
    this.selected = family;
    this.app.hud.showToast(`${(MECHANIC_VARIANTS[uid] ?? P[family]).name} · click arena to cast`, 2200);
    return true;
  }
  cast(family, position, direction = [0, 0, 1], action = 'cast', uid) {
    return issueMechanicCast(this, family, position, direction, action, uid);
  }
  // Called immediately before movement, keeping shared settings unmodified.
  movement(from, to) {
    return this.systems.worldshape.move(from, to);
  }
  beforeStep() {
    const m = this.systems.m;
    if (!this.drill) {
      for (const t of this.threats) this.presentation.remove(t.id);
      this.threats = [];
      return;
    }
    if (!m.entities.get('caster')?.alive) {
      // Practice reset is explicit to the opt-in drill; normal hosts retain their death policy.
      m.setAlive('caster', true);
      this.systems.cancel('caster');
      this.app.hud.showToast('Drill reset — dodge, block or counter the next strike');
    }
    if (m.tick >= this.nextThreat) {
      this.nextThreat = m.tick + m.ticksFor(3);
      const caster = m.entities.get('caster');
      const candidates = [...m.entities.values()]
        .filter((e) => e.id.startsWith('dummy:') && e.alive)
        .sort((a, b) => a.id.localeCompare(b.id));
      const source = candidates.find((e) => !this.systems.worldshape.blocked(e.position, caster.position));
      if (source) {
        const anchor = [...m.anchors.values()].sort((a, b) => a.id.localeCompare(b.id))[0];
        const attackAnchor = anchor && this.threatSequence % 2 === 1;
        const t = {
          id: `drill:${this.threatSequence++}`,
          ownerId: source.id,
          position: [...source.position],
          end: [...(attackAnchor ? anchor.position : caster.position)],
          targetAnchorId: attackAnchor ? anchor.id : null,
          start: m.tick,
          impact: m.tick + m.ticksFor(1.2)
        };
        this.threats.push(t);
        this.presentation.add(t.id, 'threat', t);
        this.app.hud.showToast(
          t.targetAnchorId
            ? 'Incoming · your anchor is under attack'
            : 'Incoming · guard as the ember reaches you',
          1200
        );
      }
    }
    this.threats = this.threats.filter((t) => {
      const u = Math.min(1, (m.tick - t.start) / Math.max(1, t.impact - t.start));
      const item = this.presentation.items.get(t.id);
      if (item)
        item.g.position.set(
          t.position[0] + (t.end[0] - t.position[0]) * u,
          0,
          t.position[2] + (t.end[2] - t.position[2]) * u
        );
      if (m.tick < t.impact) return true;
      this.presentation.remove(t.id);
      if (!m.entities.get(t.ownerId)?.alive || this.systems.worldshape.blocked(t.position, t.end))
        return false;
      const target = m.entities.get('caster'),
        shape = { kind: 'disc', x: t.end[0], z: t.end[2], r: 0.9 };
      if (t.targetAnchorId) {
        m.submit({
          eventId: t.id,
          type: 'terrain-impact',
          ownerId: t.ownerId,
          teamId: 'targets',
          abilityUid: 'practice/anchor-breaker',
          element: 'force',
          position: t.end,
          shape,
          intensity: 1
        });
        return false;
      }
      if (shapeContains(shape, target.position[0], target.position[2]))
        m.submit({
          eventId: t.id,
          type: 'hit',
          ownerId: t.ownerId,
          teamId: 'targets',
          abilityUid: 'practice/telegraphed-strike',
          element: 'fire',
          targetIds: ['caster'],
          position: t.position,
          shape,
          damage: 0.3,
          tags: ['projectile']
        });
      return false;
    });
  }
  cue(c) {
    this.presentation.cue(c);
    weaveBeat(this.app, c);
    worldshapeBeat(this.app, c);
    if (c.kind === 'mechanic' && c.phase === 'refused') this.app.hud.showToast(c.reason, 2000);
    if (
      !this.sound ||
      c.kind !== 'mechanic' ||
      !['anticipation', 'reversal', 'finisher', 'convergence', 'block', 'terrain-pulse'].includes(c.phase)
    )
      return;
    if (c.phase === 'terrain-pulse') {
      if (this.lastTerrainAudio !== undefined && c.tick - this.lastTerrainAudio < this.systems.m.ticksFor(0.25)) return;
      this.lastTerrainAudio = c.tick;
    }
    const Audio = window.AudioContext || window.webkitAudioContext;
    if (!Audio) return;
    this.audio ??= new Audio();
    if (this.audio.state === 'suspended') void this.audio.resume();
    const osc = this.audio.createOscillator(),
      gain = this.audio.createGain(),
      now = this.audio.currentTime;
    const element = MECHANIC_VARIANTS[c.uid]?.element;
    const freq = c.phase === 'terrain-pulse'
      ? ({ fire: 105, frost: 480, storm: 215, water: 150, crystal: 620 }[element] ?? 180)
      : ({ weave: 160, stance: 100, counter: 730, worldshape: 65, convergence: 330 }[c.family] ?? 220);
    osc.type = c.family === 'worldshape' ? 'triangle' : 'sine';
    osc.frequency.setValueAtTime(freq, now);
    osc.frequency.exponentialRampToValueAtTime(freq * 0.45, now + 0.25);
    gain.gain.setValueAtTime(0.0001, now);
    gain.gain.exponentialRampToValueAtTime(0.07, now + 0.015);
    gain.gain.exponentialRampToValueAtTime(0.0001, now + 0.3);
    osc.connect(gain);
    gain.connect(this.audio.destination);
    osc.start(now);
    osc.stop(now + 0.32);
    osc.onended = () => {
      osc.disconnect();
      gain.disconnect();
    };
  }
  update() {
    this.presentation.update();
    this.controls.update();
    const customPreview = this.selected === 'convergence' && this.selectedUid === this.convergencePreviewUid && this.convergencePreview;
    this.preview.visible = !!this.selected && !customPreview;
    if (this.convergencePreview) this.convergencePreview.visible = !!customPreview;
    if (this.selected) {
      this.ray.setFromCamera(this.pointer, this.app.camera);
      if (this.ray.ray.intersectPlane(this.plane, this.target)) {
        const p = MECHANIC_VARIANTS[this.selectedUid] ?? P[this.selected],
          origin = this.app.character.position;
        const delta = this.target.clone().sub(origin).setY(0);
        delta.clampLength(0, p.range);
        this.preview.position.copy(origin).add(delta).setY(0.06);
        if (customPreview) {
          this.convergencePreview.position.copy(this.preview.position);
          this.convergencePreview.rotation.y = Math.atan2(delta.x, delta.z);
        }
        if (['stance', 'counter'].includes(this.selected)) this.preview.position.copy(origin);
        this.preview.scale.setScalar(p.radius ?? 0.7);
      }
    }
  }
  clear() {
    this.systems.reset();
    this.presentation.clear();
    this.threats = [];
    this.selected = null;
    this.selectedUid = null;
    // PackAdapter returns immediately after disabling UCSM, so hide these
    // here rather than relying on another presentation update.
    this.preview.visible = false;
    if (this.convergencePreview) this.convergencePreview.visible = false;
  }
  dispose() {
    this.clear();
    this.controls.dispose();
    this.presentation.dispose();
    this.app.scene.remove(this.preview);
    if (this.convergencePreview) {
      this.app.scene.remove(this.convergencePreview);
      this.convergencePreview.userData.dispose();
      this.convergencePreview = null;
    }
    this.app.canvas.removeEventListener('pointermove', this.onMove);
    this.app.canvas.removeEventListener('pointerdown', this.onPointer, true);
    void this.audio?.close();
  }
}
