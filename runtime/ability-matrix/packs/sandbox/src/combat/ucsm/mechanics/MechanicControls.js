import { MECHANIC_PRESETS as P, CRYOSTASIS_MESH, COUNTER_VARIANTS } from './presets.js';
import { STANCE_VARIANTS } from './stance-presets.js';
import { WEAVE_VARIANTS, weaveHint } from './WeaveVariants.js';
import { CONVERGENCE_VARIANTS } from './ConvergenceVariants.js';
import { WORLDSHAPE_VARIANTS } from './worldshapeVariants.js';
import './mechanics.css';
const families = Object.keys(P);
const hints = {
  weave: weaveHint(),
  stance: 'Armor slows movement, banks impact. Press again to release the wave.',
  counter: 'Time the frost guard just before a telegraphed strike lands.',
  worldshape: 'Aim at clear ground. Ridges block movement and line attacks for 10 s.',
  convergence: 'Cast onto a compatible elemental imprint, such as water. The imprint is consumed; shaped terrain remains.'
};
export class MechanicControls {
  constructor(host) {
    this.host = host;
    this.buttons = [];
    this.root = document.createElement('details');
    this.root.className = 'mechanic-controls';
    // A compact closed control keeps the casting area visible at every size.
    // Native <details> keeps the full controls available by mouse, touch and keyboard.
    this.root.open = false;
    const title = document.createElement('summary');
    title.textContent = 'Combat mechanics';
    this.root.append(title);
    this.status = document.createElement('p');
    this.status.setAttribute('aria-live', 'polite');
    this.root.append(this.status);
    for (const [i, f] of families.entries()) {
      const b = document.createElement('button');
      b.type = 'button';
      b.dataset.mechanic = f;
      b.title = hints[f];
      b.addEventListener('click', () => host.select(f));
      this.root.append(b);
      this.buttons.push(b);
    }
    this.frost = document.createElement('button');
    this.frost.type = 'button';
    this.frost.textContent = CRYOSTASIS_MESH.name;
    this.frost.title = weaveHint(CRYOSTASIS_MESH.uid);
    this.frost.addEventListener('click', () => host.select('weave', CRYOSTASIS_MESH.uid));
    this.root.append(this.frost);
    this.counterButtons = COUNTER_VARIANTS.map((p) => {
      const b = document.createElement('button');
      b.type = 'button';
      b.textContent = p.name;
      b.dataset.mechanicUid = p.uid;
      b.title = `Time ${p.name} against an incoming attack.`;
      b.addEventListener('click', () => host.select('counter', p.uid));
      this.root.append(b);
      return b;
    });
    this.stanceButtons = STANCE_VARIANTS.map((p) => {
      const button = document.createElement('button');
      button.type = 'button';
      button.textContent = p.name;
      button.title = p.detail;
      button.dataset.variant = p.uid;
      button.addEventListener('click', () => host.select('stance', p.uid));
      this.root.append(button);
      return button;
    });
    this.weaves = WEAVE_VARIANTS.map((p) => {
      const b = document.createElement('button');
      b.type = 'button'; b.textContent = p.name;
      b.dataset.mechanicUid = p.uid;
      b.title = weaveHint(p.uid);
      b.addEventListener('click', () => host.select('weave', p.uid));
      this.root.append(b); return b;
    });
    this.convergenceButtons = CONVERGENCE_VARIANTS.map((p) => {
      const b = document.createElement('button');
      b.type = 'button'; b.textContent = p.name;
      b.title = `Cast on a compatible elemental imprint, such as ${p.ingredientExample}. The imprint is consumed; shaped terrain remains.`;
      b.addEventListener('click', () => host.select('convergence', p.uid));
      this.root.append(b); return b;
    });
    this.worldshapeButtons = WORLDSHAPE_VARIANTS.map((preset) => {
      const button = document.createElement('button');
      button.type = 'button';
      button.textContent = preset.name;
      button.dataset.uid = preset.uid;
      button.title = `Shape ${preset.element} terrain; aim at a clear area.`;
      button.addEventListener('click', () => host.select('worldshape', preset.uid));
      this.root.append(button);
      return button;
    });
    const clear = document.createElement('button');
    clear.type = 'button';
    clear.textContent = 'Clear my active mechanics';
    clear.title = 'Remove active anchors and other mechanics before selecting a different weave.';
    clear.addEventListener('click', () => {
      host.systems.cancel('caster');
      host.selected = null;
      host.selectedUid = null;
    });
    this.root.append(clear);
    this.hint = document.createElement('p');
    this.hint.textContent = 'Alt+Z/X/C/V/B select · click arena to cast · Esc cancel';
    this.root.append(this.hint);
    const drill = document.createElement('button');
    drill.textContent = 'Incoming attack drill: off';
    drill.dataset.drill = 'toggle';
    drill.onclick = () => {
      host.drill = !host.drill;
      drill.textContent = `Incoming attack drill: ${host.drill ? 'on' : 'off'}`;
    };
    this.root.append(drill);
    const sound = document.createElement('button');
    sound.textContent = 'Mechanic sound: off';
    sound.onclick = () => {
      host.sound = !host.sound;
      sound.textContent = `Mechanic sound: ${host.sound ? 'on' : 'off'}`;
    };
    this.root.append(sound);
    this.key = (e) => {
      if (e.repeat || /INPUT|TEXTAREA|SELECT/.test(e.target.tagName) || e.ctrlKey || e.metaKey) return;
      const i = ['KeyZ', 'KeyX', 'KeyC', 'KeyV', 'KeyB'].indexOf(e.code);
      if (i >= 0 && e.altKey) {
        e.preventDefault();
        e.stopImmediatePropagation();
        host.select(families[i]);
      }
      if (e.code === 'Escape') { host.selected = null; host.selectedUid = null; }
    };
    window.addEventListener('keydown', this.key, true);
    document.body.append(this.root);
    this.lastText = '';
  }
  update() {
    const h = this.host,
      s = h.systems,
      a = s.actor('caster'),
      e = s.m.entities.get('caster');
    const outcome = s.results.at(-1);
    const text = `Sovereignty ${Math.floor(a.energy)} · Health ${Math.round((e?.health ?? 1) * 100)}%${outcome?.reason ? ` · ${outcome.reason}` : ''}`;
    if (text !== this.lastText) {
      this.status.textContent = text;
      this.lastText = text;
    }
    families.forEach((f, i) => {
      const cooldown = Math.max(0, ((a.cooldowns[f] ?? 0) - s.m.tick) / s.m.budget.tickRate);
      const label = `Alt+${['Z', 'X', 'C', 'V', 'B'][i]} · ${P[f].name}${cooldown > 0 ? ` · ${cooldown.toFixed(1)}s` : ''}`;
      if (this.buttons[i].textContent !== label) this.buttons[i].textContent = label;
      this.buttons[i].setAttribute('aria-pressed', String(h.selected === f && !h.selectedUid));
    });
    this.frost.setAttribute('aria-pressed', String(h.selected === 'weave' && h.selectedUid === CRYOSTASIS_MESH.uid));
    this.counterButtons.forEach((b, i) => b.setAttribute('aria-pressed', String(h.selected === 'counter' && h.selectedUid === COUNTER_VARIANTS[i].uid)));
    this.stanceButtons.forEach((button, i) => button.setAttribute('aria-pressed',
      String((h.selected === 'stance' && h.selectedUid === STANCE_VARIANTS[i].uid) ||
        s.stance.active.get('caster')?.uid === STANCE_VARIANTS[i].uid)));
    this.weaves.forEach((b, i) => b.setAttribute('aria-pressed', String(h.selected === 'weave' && h.selectedUid === WEAVE_VARIANTS[i].uid)));
    CONVERGENCE_VARIANTS.forEach((p, i) => this.convergenceButtons[i].setAttribute('aria-pressed', String(h.selected === 'convergence' && h.selectedUid === p.uid)));
    for (const b of this.worldshapeButtons) b.setAttribute('aria-pressed', String(h.selected === 'worldshape' && h.selectedUid === b.dataset.uid));
    const convergence = CONVERGENCE_VARIANTS.find((p) => p.uid === h.selectedUid);
    const hint = h.selected === 'weave' ? weaveHint(h.selectedUid) :
      h.selected === 'convergence' && convergence
        ? `Cast on a compatible elemental imprint, such as ${convergence.ingredientExample}. Cyan shows ingredient range; gold shows strike area. The imprint is consumed; shaped terrain remains.`
        : h.selected ? hints[h.selected] : 'Alt+Z/X/C/V/B select · click arena to cast · Esc cancel';
    if (this.hint.textContent !== hint) this.hint.textContent = hint;
  }
  dispose() {
    window.removeEventListener('keydown', this.key, true);
    this.root.remove();
  }
}
