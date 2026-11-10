import { Vector3 } from 'three';
import { ELEMENT_GROUPS } from '../../config/elements.js';
import { ELEMENT_LABEL, ELEMENT_OF_STATUS } from './ontology.js';

const ACCENT = Object.fromEntries(ELEMENT_GROUPS.map((g) => [g.id, g.accent]));
const TIER_LABEL = { 1: 'authored', 2: 'rule', 4: 'refused' };
const LINE_LIFE = 5;
const MAX_LINES = 5;
const MAX_BADGES = 16;
const _v = new Vector3();

/**
 * What the combat manager is doing, on screen: a short feed of reactions as
 * they land, and the statuses each body is carrying, as chips above it.
 * Plain DOM over the canvas; pointer events off so it never eats a cast.
 */
export class CombatFeed {
  constructor(parent) {
    this.visible = true;
    this.showBadges = true;
    this.root = document.createElement('div');
    this.root.className = 'ucsm-feed';
    this.root.setAttribute('aria-live', 'polite');
    this.layer = document.createElement('div');
    this.layer.className = 'ucsm-badges';
    parent.appendChild(this.layer);
    parent.appendChild(this.root);
    this.lines = [];
    this.pool = [];
    this._style(parent);
  }

  _style(parent) {
    if (document.getElementById('ucsm-style')) return;
    const style = document.createElement('style');
    style.id = 'ucsm-style';
    style.textContent = `
      .ucsm-feed { position: fixed; left: 16px; bottom: 96px; z-index: 30; display: flex; flex-direction: column; gap: 6px; pointer-events: none; max-width: min(360px, calc(100vw - 32px)); font: 500 12px/1.35 system-ui, sans-serif; color: #e8ecf4; }
      .ucsm-line { background: rgba(10, 14, 24, 0.72); border: 1px solid rgba(255,255,255,0.08); border-radius: 10px; padding: 6px 10px; backdrop-filter: blur(6px); transition: opacity .4s; }
      .ucsm-line b { font-weight: 650; }
      .ucsm-line small { display: block; opacity: .7; font-size: 11px; }
      .ucsm-dot { display: inline-block; width: 8px; height: 8px; border-radius: 50%; margin-right: 4px; vertical-align: 0; }
      .ucsm-badges { position: fixed; inset: 0; z-index: 25; pointer-events: none; }
      .ucsm-badge { position: absolute; transform: translate(-50%, -100%); display: flex; gap: 3px; flex-wrap: wrap; justify-content: center; max-width: 140px; }
      .ucsm-chip { font: 600 10px/1 system-ui, sans-serif; padding: 3px 5px; border-radius: 6px; background: rgba(10,14,24,.75); color: #fff; border: 1px solid currentColor; white-space: nowrap; }
    `;
    document.head.appendChild(style);
  }

  /** Add lines for the cues that matter; age the old ones. */
  update(dt, cues) {
    for (const cue of cues) {
      if (cue.kind !== 'reaction' && cue.kind !== 'refused') continue;
      const [a, b] = cue.elements;
      const el = document.createElement('div');
      el.className = 'ucsm-line';
      const dots = `<span class="ucsm-dot" style="background:${ACCENT[a]}"></span><span class="ucsm-dot" style="background:${ACCENT[b]}"></span>`;
      const tier = TIER_LABEL[cue.tier ?? 4];
      const depth = cue.depth > 1 ? ` · chain ${cue.depth}` : '';
      el.innerHTML = `${dots}<b>${cue.name}</b><small>${ELEMENT_LABEL[a]} → ${ELEMENT_LABEL[b]} · ${tier}${depth}${cue.kind === 'refused' ? ' · ' + cue.reason.split(' — ')[1] : ''}</small>`;
      this.root.appendChild(el);
      this.lines.push({ el, age: 0 });
    }
    while (this.lines.length > MAX_LINES) this.lines.shift().el.remove();
    for (let i = this.lines.length - 1; i >= 0; i--) {
      const line = this.lines[i];
      line.age += dt || 1 / 60;
      if (line.age > LINE_LIFE) {
        line.el.remove();
        this.lines.splice(i, 1);
      } else if (line.age > LINE_LIFE - 0.6) line.el.style.opacity = '0';
    }
    this.root.style.display = this.visible ? '' : 'none';
  }

  /** Chips above each body carrying statuses. */
  badges(camera, canvas, manager, dummies) {
    let used = 0;
    if (this.showBadges) {
      const rect = canvas.getBoundingClientRect();
      for (const [id, dummy] of dummies) {
        if (used >= MAX_BADGES) break;
        const entity = manager.entities.get(id);
        if (!entity || !entity.statuses.length) continue;
        dummy.bodyPoint?.(_v) ?? _v.copy(dummy.position);
        _v.y += 1.3;
        _v.project(camera);
        if (_v.z > 1 || Math.abs(_v.x) > 1.1 || Math.abs(_v.y) > 1.1) continue;
        const badge = this._badge(used++);
        badge.style.left = `${rect.left + ((_v.x + 1) / 2) * rect.width}px`;
        badge.style.top = `${rect.top + ((1 - _v.y) / 2) * rect.height}px`;
        const html = entity.statuses
          .slice(0, 4)
          .map((s) => `<span class="ucsm-chip" style="color:${ACCENT[ELEMENT_OF_STATUS[s.tag]] ?? '#ffffff'}">${s.tag}${s.stacks > 1 ? ' ×' + s.stacks : ''}</span>`)
          .join('');
        if (badge.__html !== html) {
          badge.innerHTML = html;
          badge.__html = html;
        }
        badge.style.display = '';
      }
    }
    for (let i = used; i < this.pool.length; i++) this.pool[i].style.display = 'none';
  }

  _badge(i) {
    if (!this.pool[i]) {
      const el = document.createElement('div');
      el.className = 'ucsm-badge';
      this.layer.appendChild(el);
      this.pool[i] = el;
    }
    return this.pool[i];
  }
}
