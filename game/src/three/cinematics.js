// Arrival is rendered in the live world. No video, image planes, or disconnected scene.
import * as THREE from 'three';
import { OATH_BY_ID } from '../../../shared/oaths.js';

const clamp = (v, a = 0, b = 1) => Math.max(a, Math.min(b, v));
const ease = t => { t = clamp(t); return t * t * (3 - 2 * t); };
export const ARRIVAL_SECONDS = 10;
const activeArrivals = new WeakMap();
const WORDS = {
  fire: ['The kilns still burn.', 'Carry the flame. Answer for what it consumes.'],
  frost: ['The archive remembers.', 'Hold what the thaw would take.'],
  storm: ['The relays are listening.', 'Become the current between distant shores.'],
  water: ['Every tide returns.', 'Give the waters a path. Accept their return.'],
  earth: ['The stone carries a song.', 'Stand where the fracture would open.'],
  wind: ['The cliffs are never silent.', 'Hear the breath between every note.'],
  nature: ['The sanctuary is growing.', 'What you take must become life again.'],
  poison: ['The glass holds its secret.', 'Know the measure between remedy and ruin.'],
  light: ['Daybreak has found you.', 'Let your promise endure beyond the light.'],
  cosmic: ['The observatory turns.', 'Even the distant stars have weight.'],
  shadow: ['The court keeps its absence.', 'Walk where the world refuses to look.'],
  blood: ['The covenant remembers its kin.', 'Every gift leaves a mark.'],
  arcane: ['The theatre opens another door.', 'Choose which truth you will carry.'],
  time: ['The road counts every step.', 'The moment is yours. Its cost will follow.'],
  tech: ['The foundry wakes.', 'Give force a purpose. Give invention a limit.'],
};

export function arrivalPlan(oath, position, yaw = 0, duration = ARRIVAL_SECONDS) {
  const hero = new THREE.Vector3(position.x, position.y, position.z);
  const forward = new THREE.Vector3(Math.sin(yaw), 0, Math.cos(yaw));
  const right = new THREE.Vector3(Math.cos(yaw), 0, -Math.sin(yaw));
  const point = (f, r, y) => hero.clone().addScaledVector(forward, f).addScaledVector(right, r).add(new THREE.Vector3(0, y, 0));
  const [opening, covenant] = WORDS[oath.element] || WORDS.light;
  return { oath, hero, yaw, duration, shots: [
    { title: oath.name, subtitle: opening, from: point(-39, 26, 21), to: point(-24, 16, 13), lookFrom: point(19, 0, 5), lookTo: point(8, 0, 3), fov: [56, 49] },
    { title: 'A covenant takes form', subtitle: covenant, from: point(5.1, 3.8, 2.4), to: point(4.5, -2.7, 2.1), lookFrom: point(0, 0, 1.15), lookTo: point(0, 0, 1.3), fov: [43, 39] },
    { title: 'Your story begins', subtitle: 'Every force has a covenant. Every covenant has a price.', from: point(-10, 5.4, 5.2), to: point(-5.92, .38, 3.42), lookFrom: point(1, 0, 1.8), lookTo: point(0, .38, 1.65), fov: [48, 51.5662] },
  ] };
}

export function sampleArrival(plan, seconds) {
  const progress = clamp(seconds / plan.duration), cuts = [.34, .72, 1];
  const index = progress < cuts[0] ? 0 : progress < cuts[1] ? 1 : 2;
  const start = index ? cuts[index - 1] : 0, fraction = (progress - start) / (cuts[index] - start), t = ease(fraction), shot = plan.shots[index];
  return { index, progress, title: shot.title, subtitle: shot.subtitle,
    position: shot.from.clone().lerp(shot.to, t), look: shot.lookFrom.clone().lerp(shot.lookTo, t),
    fov: THREE.MathUtils.lerp(...shot.fov, t), effect: index === 1 ? Math.sin(Math.PI * clamp(fraction)) : index === 2 ? .28 * (1 - t) : 0 };
}

/** Bounded, oath-specific, solid ribbon/crystal geometry; every resource is owned here. */
export function createCovenantEffect(oath, hero, quality = 'high') {
  const group = new THREE.Group(); group.name = `${oath.name} arrival covenant`; group.position.copy(hero);
  const material = new THREE.MeshBasicMaterial({ color: oath.accent, transparent: true, opacity: 0, depthWrite: false, side: THREE.DoubleSide, blending: THREE.AdditiveBlending, toneMapped: false });
  const count = quality === 'low' ? 6 : 12, segments = quality === 'low' ? 28 : 56;
  const geometries = new Set(), pieces = [];
  const add = (geometry, phase, tilt = 0) => { geometries.add(geometry); const mesh = new THREE.Mesh(geometry, material); mesh.rotation.z = tilt; group.add(mesh); pieces.push({ mesh, phase }); return mesh; };
  const element = oath.element;
  if (['frost', 'earth', 'tech', 'time', 'poison'].includes(element)) {
    const geometry = element === 'tech' ? new THREE.BoxGeometry(.12, .72, .12) : element === 'time' ? new THREE.BoxGeometry(.045, .4, .12) : new THREE.OctahedronGeometry(.23);
    for (let i = 0; i < count; i++) {
      const angle = i / count * Math.PI * 2, mesh = add(geometry, angle);
      mesh.position.set(Math.sin(angle) * 1.25, .65 + (i % 3) * .27, Math.cos(angle) * 1.25);
      mesh.scale.y = element === 'frost' ? 2.6 : element === 'poison' ? 1.5 : 1;
    }
  } else {
    const bands = ['cosmic', 'arcane', 'shadow'].includes(element) ? 3 : 2;
    for (let j = 0; j < bands; j++) {
      const points = [];
      for (let i = 0; i <= segments; i++) {
        const t = i / segments, a = t * Math.PI * 2;
        const r = element === 'fire' ? .45 + t * .95 : element === 'blood' ? 1.1 + Math.sin(a * 3) * .12 : 1.25;
        const rise = ['fire', 'wind', 'nature', 'storm'].includes(element) ? t * 2.2 : .6 + Math.sin(a * (element === 'water' ? 3 : 1)) * .16;
        points.push(new THREE.Vector3(Math.sin(a) * r, rise, Math.cos(a) * r));
      }
      const curve = new THREE.CatmullRomCurve3(points);
      const mesh = add(new THREE.TubeGeometry(curve, segments, element === 'storm' ? .012 : .022, 4, false), j * Math.PI, ['cosmic', 'arcane', 'shadow'].includes(element) ? j * Math.PI / 3 : 0);
      mesh.rotation.y = j * Math.PI;
      if (element === 'light') { mesh.rotation.x = j ? Math.PI / 2 : 0; mesh.position.y = .6; }
    }
  }
  let disposed = false;
  return { group, update(time, strength) { if (disposed) return; group.visible = strength > .005; material.opacity = clamp(strength) * .65; for (const { mesh, phase } of pieces) { mesh.rotation.y = phase + time * (element === 'time' ? .18 : .35); if (pieces.length > 3) mesh.position.y = .8 + Math.sin(time * 1.6 + phase) * .25; } },
    dispose() { if (disposed) return; disposed = true; group.removeFromParent(); for (const geometry of geometries) geometry.dispose(); material.dispose(); } };
}

function overlayFor(oath) {
  const el = document.createElement('section'); el.className = 'ae-arrival'; el.setAttribute('aria-label', `${oath.name} arrival`);
  el.style.setProperty('--arrival-accent', oath.accent);
  const top = document.createElement('div'); top.className = 'ae-arrival__top'; top.textContent = `AETHERION / COVENANT ${String(oath.index).padStart(2, '0')}`;
  const copy = document.createElement('div'); copy.className = 'ae-arrival__copy';
  const chapter = document.createElement('span'); chapter.className = 'ae-arrival__chapter';
  const title = document.createElement('h1'), subtitle = document.createElement('p'); subtitle.setAttribute('aria-live', 'polite');
  const progress = document.createElement('progress'); progress.max = 1; progress.value = 0; progress.setAttribute('aria-label', 'Arrival progress');
  const skip = document.createElement('button'); skip.type = 'button'; skip.className = 'ae-arrival__skip'; skip.textContent = 'Enter the realm'; skip.setAttribute('aria-label', 'Skip arrival and enter the realm');
  const hint = document.createElement('span'); hint.className = 'ae-arrival__hint'; hint.textContent = 'Space / Esc to skip';
  copy.append(chapter, title, subtitle, progress); el.append(top, copy, skip, hint);
  return { el, skip, update(frame) { chapter.textContent = `${String(frame.index + 1).padStart(2, '0')} / 03`; if (title.textContent !== frame.title) { title.textContent = frame.title; subtitle.textContent = frame.subtitle; } progress.value = frame.progress; } };
}

/** Resolves on completion, skip, abort, context loss, or supersession. Never leaves input locked. */
export async function playArrival(ctx, character, { signal, duration = ARRIVAL_SECONDS } = {}) {
  const previousArrival = activeArrivals.get(ctx);
  if (previousArrival) { previousArrival.cancel(); await previousArrival.closed; }
  const oath = OATH_BY_ID[character?.oath], player = ctx.actors?.player;
  const reduced = typeof matchMedia === 'function' && matchMedia('(prefers-reduced-motion: reduce)').matches;
  if (!oath || !player || reduced || ctx.params?.get('nointro') === '1' || signal?.aborted) { if (ctx.actors?.orbit) ctx.actors.orbit.intro = null; return { reason: signal?.aborted ? 'aborted' : 'bypassed' }; }
  const orbit = ctx.actors.orbit, camera = ctx.camera, wasEnabled = ctx.input?.padCaptureReason?.enabled ?? false;
  const previousFocus = document.activeElement, ui = document.getElementById('ui'), priorInert = ui?.inert;
  const restore = { position: camera.position.clone(), quaternion: camera.quaternion.clone(), fov: camera.fov };
  const yaw = Math.atan2(oath.center[0] - player.position.x, oath.center[1] - 43 - player.position.z);
  const plan = arrivalPlan(oath, player.position, yaw, Math.max(.1, duration));
  const effect = createCovenantEffect(oath, plan.hero, ctx.quality?.name);
  const overlay = overlayFor(oath), cleanup = [];
  let finished = false, finish, reason = 'completed', last = performance.now(), elapsed = 0;
  const done = new Promise(resolve => { finish = why => { if (finished) return; finished = true; reason = why; resolve(); }; });
  const cancel = () => finish('cancelled'); ctx.cancelArrival = cancel;
  let closeSession; const closed = new Promise(resolve => { closeSession = resolve; });
  const session = { cancel, closed }; activeArrivals.set(ctx, session);
  const listen = (target, type, fn, opts) => { target?.addEventListener(type, fn, opts); cleanup.push(() => target?.removeEventListener(type, fn, opts)); };
  try {
    ctx.cinematicActive = true; ctx.input?.setEnabled(false); if (orbit) orbit.intro = null;
    player.fade = 1; player.body?.setFade?.(1);
    if (ui) ui.inert = true; document.body.classList.add('ae-arrival-active'); document.body.append(overlay.el); ctx.scene.add(effect.group);
    document.exitPointerLock?.(); overlay.skip.focus({ preventScroll: true });
    listen(overlay.skip, 'click', () => finish('skipped'));
    listen(document, 'keydown', e => { if (['Space', 'Escape', 'Enter'].includes(e.code)) { e.preventDefault(); e.stopImmediatePropagation(); finish('skipped'); } else if (e.code === 'Tab') { e.preventDefault(); overlay.skip.focus(); } }, true);
    listen(signal, 'abort', () => finish('aborted'));
    listen(ctx.canvas, 'webglcontextlost', () => finish('context-lost'));
    listen(globalThis, 'pagehide', cancel);
    const update = () => {
      const now = performance.now(), dt = Math.min(.1, Math.max(0, (now - last) / 1000)); last = now;
      if (finished || document.hidden) return;
      elapsed += dt;
      const frame = sampleArrival(plan, elapsed);
      camera.position.copy(frame.position);
      const floor = ctx.world?.heightAt?.(camera.position.x, camera.position.z);
      if (Number.isFinite(floor)) camera.position.y = Math.max(camera.position.y, floor + 1.6);
      camera.lookAt(frame.look); camera.fov = frame.fov; camera.updateProjectionMatrix();
      if (ctx.net?.paused) player.body?.animator?.update?.(dt);
      effect.update(elapsed, frame.effect); overlay.update(frame);
      overlay.el.dataset.shot = String(frame.index + 1);
      if (elapsed >= plan.duration) finish('completed');
    };
    update(); cleanup.push(ctx.addUpdate(update, 0));
    ctx.bus?.emit('cinematic:start', { oath: oath.id, duration: plan.duration });
    await done;
    return { reason };
  } finally {
    for (const off of cleanup.reverse()) off?.(); effect.dispose(); overlay.el.remove();
    document.body.classList.remove('ae-arrival-active'); if (ui) ui.inert = priorInert;
    ctx.cinematicActive = false; if (ctx.cancelArrival === cancel) delete ctx.cancelArrival;
    if (orbit) { orbit.intro = null; orbit.yaw = yaw; orbit.pivotInit = false; orbit.curDist = orbit.dist; orbit.update(1 / 60); }
    else { camera.position.copy(restore.position); camera.quaternion.copy(restore.quaternion); camera.fov = restore.fov; camera.updateProjectionMatrix(); }
    ctx.input?.setEnabled(wasEnabled); if (previousFocus?.isConnected) previousFocus.focus?.({ preventScroll: true });
    if (activeArrivals.get(ctx) === session) activeArrivals.delete(ctx); closeSession();
    ctx.bus?.emit('cinematic:end', { oath: oath.id, reason });
  }
}
