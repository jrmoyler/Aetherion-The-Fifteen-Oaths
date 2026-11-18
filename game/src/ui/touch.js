// Touch input keeps movement, camera and held actions on independent pointer captures.
import { h, clamp } from './dom.js';
import { ICONS } from './icons.js';
import { slotHTML } from './abilityView.js';
import './touch.css';

const KNOB_TRAVEL = 28;
const MOVE_DEADZONE = 6;
const RUN_DISTANCE = 38;
const SPRINT_START = 46;
const SPRINT_END = 36;
const LOOK_SLOP = 7;

const ACTIONS = [
  { id: 'jump', label: 'Jump', held: true },
  { id: 'dodge', label: 'Dodge' },
  { id: 'target', label: 'Target' },
  { id: 'interact', label: 'Interact' },
];

function releaseCapture(el, id) {
  if (el.hasPointerCapture(id)) el.releasePointerCapture(id);
}

const caption = text => h('span', { class: 'ae-touch-label', 'aria-hidden': 'true' }, text);

export function createTouch(ui) {
  const { ctx } = ui;
  const look = h('div', { class: 'ae-touch__look' });
  const knob = h('div', { class: 'ae-joy__knob' });
  const joy = h('div', { class: 'ae-joy' }, knob);
  const move = h('div', { class: 'ae-touch__move' }, joy);
  const cluster = h('div', { class: 'ae-cluster', role: 'group', 'aria-label': 'Combat controls' });
  const top = h('nav', { class: 'ae-touch__top', 'aria-label': 'Game menus' });
  const el = h('div', { class: 'ae-touch', hidden: true, 'aria-hidden': 'true' }, look, move);
  const ctrl = h('div', { class: 'ae-touch-ui', hidden: true }, cluster, top);

  const canStart = e => e.button === 0 && ctx.input?.gameplayEnabled !== false;
  let stick = null;
  const setKnob = (dx, dy) => { knob.style.transform = `translate(${dx}px, ${dy}px)`; };

  move.addEventListener('pointerdown', e => {
    if (stick || !canStart(e)) return;
    e.preventDefault();
    move.setPointerCapture(e.pointerId);
    stick = { id: e.pointerId, x: e.clientX, y: e.clientY, sprint: false };
    const bounds = move.getBoundingClientRect();
    const radius = joy.offsetWidth / 2;
    // The contact starts at neutral even when the drawing rests away from a screen edge.
    joy.style.left = `${clamp(e.clientX - bounds.left, radius, bounds.width - radius)}px`;
    joy.style.top = `${clamp(e.clientY - bounds.top, radius, bounds.height - radius)}px`;
    joy.classList.add('is-active');
  });
  move.addEventListener('pointermove', e => {
    if (e.pointerId !== stick?.id) return;
    const dx = e.clientX - stick.x, dy = e.clientY - stick.y;
    const distance = Math.hypot(dx, dy);
    const magnitude = clamp((distance - MOVE_DEADZONE) / (RUN_DISTANCE - MOVE_DEADZONE), 0, 1);
    const scale = distance ? magnitude / distance : 0;
    stick.sprint = distance >= (stick.sprint ? SPRINT_END : SPRINT_START);
    setKnob(dx * scale * KNOB_TRAVEL, dy * scale * KNOB_TRAVEL);
    ctx.input?.setVirtualMove?.(dx * scale, -dy * scale);
    ctx.input?.setVirtualSprint?.(stick.sprint);
    joy.classList.toggle('is-sprint', stick.sprint);
  });
  function endStick(id) {
    if (id !== stick?.id) return;
    stick = null;
    releaseCapture(move, id);
    joy.style.removeProperty('left');
    joy.style.removeProperty('top');
    joy.classList.remove('is-active', 'is-sprint');
    setKnob(0, 0);
    ctx.input?.setVirtualMove?.(0, 0);
    ctx.input?.setVirtualSprint?.(false);
  }

  // A short tap picks an actor without nudging the camera. A second finger opts into pinch zoom.
  const looks = new Map();
  look.addEventListener('pointerdown', e => {
    if (looks.size >= 2 || !canStart(e)) return;
    e.preventDefault();
    look.setPointerCapture(e.pointerId);
    const { clientX: x, clientY: y } = e;
    const point = { x, y, startX: x, startY: y, time: performance.now(), dragged: false, canTarget: !looks.size };
    for (const other of looks.values()) other.canTarget = false;
    looks.set(e.pointerId, point);
  });
  look.addEventListener('pointermove', e => {
    const point = looks.get(e.pointerId);
    if (!point) return;
    const { clientX: x, clientY: y } = e;
    if (looks.size === 2) {
      const [first, second] = looks.values();
      const other = first === point ? second : first;
      const before = Math.hypot(point.x - other.x, point.y - other.y);
      const after = Math.hypot(x - other.x, y - other.y);
      ctx.input?.addVirtualZoom?.((before - after) / 48);
      point.dragged = true;
      other.dragged = true;
    } else if (point.dragged) {
      ctx.input?.addVirtualLook?.((x - point.x) * 1.6, (y - point.y) * 1.6);
    } else if (Math.hypot(x - point.startX, y - point.startY) >= LOOK_SLOP) {
      point.dragged = true;
      ctx.input?.addVirtualLook?.((x - point.startX) * 1.6, (y - point.startY) * 1.6);
    }
    point.x = x;
    point.y = y;
  });
  function endLook(e) {
    const point = looks.get(e.pointerId);
    looks.delete(e.pointerId);
    if (!point?.canTarget || point.dragged || e.type !== 'pointerup' || performance.now() - point.time >= 300) return;
    const actor = ctx.actors?.pick?.(e.clientX, e.clientY);
    if (actor?.id != null) { ctx.combat?.setTarget?.(actor.id); ui.sfx('target'); }
  }

  const captures = new Map();
  function endAction(button) {
    const active = captures.get(button);
    if (!active) return;
    captures.delete(button);
    releaseCapture(button, active.id);
    button.classList.remove('is-down');
    if (active.held) ctx.input?.hold?.(active.action, false);
  }
  function bindAction(button, action, { held = false, onPress } = {}) {
    button.addEventListener('pointerdown', e => {
      if (captures.has(button) || !canStart(e)) return;
      e.preventDefault();
      button.setPointerCapture(e.pointerId);
      captures.set(button, { id: e.pointerId, action, held });
      button.classList.add('is-down');
      if (held) ctx.input?.hold?.(action, true);
      else ctx.input?.press?.(action);
      onPress?.();
    });
    for (const type of ['pointerup', 'pointercancel', 'lostpointercapture']) {
      button.addEventListener(type, e => { if (captures.get(button)?.id === e.pointerId) endAction(button); });
    }
    // Keyboard and assistive-technology activation do not send a pointerdown.
    button.addEventListener('click', e => {
      if (e.detail !== 0) return;
      ctx.input?.press?.(action);
      onPress?.();
    });
  }
  for (const type of ['pointerup', 'pointercancel', 'lostpointercapture']) {
    move.addEventListener(type, e => endStick(e.pointerId));
    look.addEventListener(type, endLook);
  }

  const slots = [];
  function build(view) {
    for (const slot of slots) { endAction(slot.button); slot.button.remove(); }
    slots.length = 0;
    view.slice(0, 6).forEach((v, i) => {
      const label = i === 0 ? 'Attack' : i === 5 ? 'Ultimate' : null;
      const button = h('button', {
        class: `ae-tbtn ae-slot ae-tbtn--slot-${i}${v.ult ? ' is-ult' : ''}`,
        type: 'button',
        'aria-label': label ? `${label} · ${v.name}` : v.name,
        style: `--ab:${v.accent};--ab-rgb:${v.accentRgb}`,
        html: slotHTML(v, { key: false }),
      });
      if (label) button.append(caption(label));
      bindAction(button, `slot${i}`, { held: i === 0, onPress: () => flash(i) });
      cluster.insertBefore(button, firstUtility);
      slots.push({ button, timer: button.querySelector('.cdt'), cooling: false });
    });
  }

  for (const { id, label, held } of ACTIONS) {
    const button = h('button', { class: `ae-tbtn ae-tbtn--${id}`, type: 'button', 'aria-label': label, html: ICONS[id] });
    button.append(caption(label));
    bindAction(button, id, { held });
    cluster.append(button);
  }
  const firstUtility = cluster.firstElementChild;
  function addShortcuts() {
    const middle = ctx.net?.mode === 'online' ? ['chat', 'chat', 'Chat'] : ['journal', 'quest', 'Journal'];
    const links = [['map', 'map', 'Map'], ['character', 'bag', 'Gear'], middle, ['settings', 'gear', 'Menu']];
    top.replaceChildren();
    for (const [id, icon, label] of links) {
      const button = h('button', { class: 'ae-iconbtn', type: 'button', 'aria-label': id === 'map' ? 'World map' : label, html: ICONS[icon] });
      button.append(caption(label));
      button.addEventListener('click', () => {
        if (id === 'chat') ui.chat.focus();
        else ui.toggleWindow(id);
      });
      top.append(button);
    }
  }

  function flash(i) {
    const button = slots[i]?.button;
    if (!button) return;
    button.classList.remove('is-flash');
    void button.offsetWidth;
    button.classList.add('is-flash');
  }

  // Block WebKit's page-scale gesture while leaving native scrolling in menus.
  const prevent = e => e.preventDefault();
  for (const layer of [el, ctrl]) {
    layer.addEventListener('gesturestart', prevent, { passive: false });
    layer.addEventListener('contextmenu', prevent);
  }

  function reset() {
    if (stick) endStick(stick.id);
    const looking = [...looks.keys()];
    looks.clear();
    for (const id of looking) releaseCapture(look, id);
    for (const button of captures.keys()) endAction(button);
  }
  addEventListener('resize', reset);
  addEventListener('blur', reset);
  document.addEventListener('visibilitychange', () => { if (document.hidden) reset(); });

  return {
    el, ctrl, build, flash, reset,
    show() { addShortcuts(); el.hidden = false; ctrl.hidden = false; },
    hide() { reset(); el.hidden = true; ctrl.hidden = true; },
    update(now, cds, view, mana) {
      if (el.hidden) return;
      for (let i = 0; i < slots.length; i++) {
        const slot = slots[i];
        const { button, timer } = slot;
        const c = cds[i], v = view[i];
        const rem = c?.active ? (c.end - now) / 1000 : 0;
        if (rem > 0) {
          button.style.setProperty('--cd', (rem / c.total).toFixed(3));
          timer.textContent = rem >= 1.5 ? Math.ceil(rem) : rem.toFixed(1);
          slot.cooling = true;
        } else if (slot.cooling) {
          slot.cooling = false;
          button.style.setProperty('--cd', '0');
          timer.textContent = '';
          button.classList.remove('is-ready');
          void button.offsetWidth;
          button.classList.add('is-ready');
        }
        button.classList.toggle('is-oom', !!(v?.mana && mana < v.mana));
      }
    },
  };
}
