import { Vector2 } from 'three';

/**
 * On-screen move / look / cast for any pointer that is not a mouse.
 *
 * The 3D pipeline is the same one the desktop uses. This only feeds it:
 * a stick writes `input.analog`, a drag orbits the rig, a tap arms and
 * casts through the same aim controller a click does. Nothing here swaps
 * in a cheaper scene.
 */
const ndc = new Vector2();

const raf = () => new Promise((resolve) => requestAnimationFrame(() => resolve()));

/** A look-pointer counts as a tap only if it never joined a second finger. */
export const TAP_SLOP = 14;

export function markLookPointer(pointers, id, x, y) {
  const rec = { x, y, moved: 0, multi: false };
  pointers.set(id, rec);
  if (pointers.size > 1) {
    for (const p of pointers.values()) p.multi = true;
  }
  return rec;
}

export function isTapCast(rec) {
  return !!rec && !rec.multi && rec.moved < TAP_SLOP;
}

function wantsTouch() {
  if (typeof window === 'undefined') return false;
  const coarse = window.matchMedia?.('(pointer: coarse)')?.matches;
  const noHover = window.matchMedia?.('(hover: none)')?.matches;
  return !!(coarse || noHover || (navigator.maxTouchPoints ?? 0) > 0);
}

export class TouchControls {
  constructor(app) {
    this.app = app;
    this._active = false;
    this._pointers = new Map();
    this._stickId = null;
    this._lookId = null;
    this._pinch = null;
    this._root = null;
    if (!wantsTouch()) return;
    this._build();
  }

  _build() {
    const root = document.createElement('div');
    root.className = 'touch-rig';
    root.innerHTML = `
      <div class="touch-look" data-look></div>
      <div class="touch-stick" data-stick>
        <div class="touch-stick__knob" data-knob></div>
      </div>
      <div class="touch-actions">
        <button type="button" class="touch-btn" data-run>Run</button>
        <button type="button" class="touch-btn" data-dash>Dash</button>
        <button type="button" class="touch-btn touch-btn--cast" data-cast>Cast</button>
      </div>
    `;
    document.body.appendChild(root);
    // Actions sit on the body, not inside the rig. The rig is one stacking
    // context under the VFX editor; a child cannot climb above lil-gui.
    // Hoisting the cluster lets Run / Dash / Cast stay tappable while the
    // look pad stays out of the editor column.
    const actions = root.querySelector('.touch-actions');
    document.body.appendChild(actions);
    this._root = root;
    this._actions = actions;
    this._stick = root.querySelector('[data-stick]');
    this._knob = root.querySelector('[data-knob]');
    this._look = root.querySelector('[data-look]');
    this._run = actions.querySelector('[data-run]');
    this._dash = actions.querySelector('[data-dash]');
    this._cast = actions.querySelector('[data-cast]');

    this._stick.addEventListener('pointerdown', this._onStickDown);
    this._look.addEventListener('pointerdown', this._onLookDown);
    root.addEventListener('pointermove', this._onMove);
    root.addEventListener('pointerup', this._onUp);
    root.addEventListener('pointercancel', this._onUp);
    this._run.addEventListener('click', () => {
      const input = this.app.input;
      input.runLock = !input.runLock;
      this._run.classList.toggle('is-on', input.runLock);
    });
    this._dash.addEventListener('click', (event) => {
      event.stopPropagation();
      this.app.locomotion?.requestDash();
    });
    this._cast.addEventListener('click', (event) => {
      event.stopPropagation();
      const rect = this.app.canvas.getBoundingClientRect();
      this._castAt(rect.left + rect.width * 0.5, rect.top + rect.height * 0.62);
    });
  }

  _localNDC(clientX, clientY) {
    const rect = this.app.canvas.getBoundingClientRect();
    const w = rect.width || 1;
    const h = rect.height || 1;
    ndc.set(((clientX - rect.left) / w) * 2 - 1, -((clientY - rect.top) / h) * 2 + 1);
    return ndc;
  }

  async _castAt(clientX, clientY) {
    const mechanics = this.app.combat?.mechanics;
    if (this.app.combat?.enabled && mechanics?.selected) {
      mechanics.castAt(clientX, clientY);
      return;
    }
    const aim = this.app.activeAim;
    if (!aim) return;
    const point = this._localNDC(clientX, clientY).clone();
    aim.point(point);
    this.app.input.emit('pointer:move', point);
    if (!aim.isArmed) await this.app.arm();
    aim.point(point);
    await raf();
    await raf();
    aim.point(point);
    await raf();
    aim.confirm();
  }

  _onStickDown = (event) => {
    event.preventDefault();
    event.stopPropagation();
    this._stick.setPointerCapture(event.pointerId);
    this._stickId = event.pointerId;
    this._moveStick(event);
  };

  _onLookDown = (event) => {
    if (event.target.closest('.touch-actions') || event.target.closest('.touch-stick')) return;
    event.preventDefault();
    this._look.setPointerCapture(event.pointerId);
    this._lookId = event.pointerId;
    markLookPointer(this._pointers, event.pointerId, event.clientX, event.clientY);
    this._localNDC(event.clientX, event.clientY);
    this.app.activeAim?.point(ndc.clone());
    this.app.input.emit('pointer:move', ndc.clone());
  };

  _onMove = (event) => {
    if (event.pointerId === this._stickId) {
      event.preventDefault();
      this._moveStick(event);
      return;
    }
    const look = this._pointers.get(event.pointerId);
    if (!look) return;
    event.preventDefault();
    const dx = event.clientX - look.x;
    const dy = event.clientY - look.y;
    look.x = event.clientX;
    look.y = event.clientY;
    look.moved += Math.abs(dx) + Math.abs(dy);
    this.app.rig.applyLook(dx, dy);
    this._pinchZoom();
  };

  _onUp = (event) => {
    if (event.pointerId === this._stickId) {
      this._stickId = null;
      this.app.input.analog.x = 0;
      this.app.input.analog.z = 0;
      this._knob.style.transform = 'translate(-50%, -50%)';
    }
    const look = this._pointers.get(event.pointerId);
    if (look) {
      this._pointers.delete(event.pointerId);
      if (event.pointerId === this._lookId) this._lookId = null;
      if (this._pointers.size < 2) this._pinch = null;
      if (isTapCast(look)) this._castAt(event.clientX, event.clientY);
    }
  };

  _moveStick(event) {
    const rect = this._stick.getBoundingClientRect();
    const cx = rect.left + rect.width / 2;
    const cy = rect.top + rect.height / 2;
    let x = (event.clientX - cx) / (rect.width * 0.42);
    let y = (event.clientY - cy) / (rect.height * 0.42);
    const len = Math.hypot(x, y) || 1;
    if (len > 1) {
      x /= len;
      y /= len;
    }
    this._knob.style.transform = `translate(-50%, -50%) translate(${x * rect.width * 0.28}px, ${y * rect.height * 0.28}px)`;
    // Screen up is forward (camera-relative +Z in locomotion).
    this.app.input.analog.x = x;
    this.app.input.analog.z = -y;
  }

  _pinchZoom() {
    const pts = [...this._pointers.values()];
    if (pts.length < 2) {
      this._pinch = null;
      return;
    }
    const d = Math.hypot(pts[0].x - pts[1].x, pts[0].y - pts[1].y);
    if (this._pinch != null && this._pinch > 1) this.app.rig.pinch(d / this._pinch);
    this._pinch = d;
  }

  dispose() {
    this._actions?.remove();
    this._root?.remove();
    this._actions = null;
    this._root = null;
  }
}
