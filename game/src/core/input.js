// Unified input state. Three devices feed one action map:
//   - keyboard + mouse (wired here, BINDINGS),
//   - touch (the UI module feeds joystick / buttons through setVirtualMove / addVirtualLook / press()),
//   - gamepad (W3C Gamepad API, "standard" mapping, polled in poll(), PAD_DEFAULTS, rebindable).
// Consumers read ctx.input.state each frame and drain ctx.input.consume(action). Every device emits
// the same action names (slot0..5, jump, dodge, target, interact, map, menu, inventory, ...), so
// actors / combat never need to know which device is in use.
//
// Gamepad layout (Xbox names; PlayStation in brackets) — see PAD_DEFAULTS:
//   Left stick  move (analog)          L3 [L3]   sprint toggle (also: stick fully pushed, setting)
//   Right stick camera look            R3 [R3]   target nearest hostile
//   A [Cross]   jump                   B [Circle]   dodge
//   X [Square]  slot0 basic attack     Y [Triangle] slot1
//   RB [R1]     slot2                  LB [L1]      slot3
//   RT [R2]     slot4                  LT+RT [L2+R2] slot5 ultimate (LT is the Oath modifier)
//   LT + right stick vertical  camera zoom     LT + D-pad down  walk toggle
//   D-pad left  cycle target           D-pad right  interact
//   D-pad up    character / inventory  D-pad down   task log
//   Start [Options] menu               Back/View [Create] world map
// While a menu captures the pad (setPadCapture), gameplay gets nothing and the pad emits
// `gamepad:nav` bus events ({dir, src, repeat} or {btn}) for spatial navigation instead.

export const BINDINGS = {
  forward: ['KeyW', 'ArrowUp'], back: ['KeyS', 'ArrowDown'], left: ['KeyA', 'ArrowLeft'], right: ['KeyD', 'ArrowRight'],
  jump: ['Space'], sprint: ['ShiftLeft', 'ShiftRight'], dodge: ['KeyC', 'AltLeft'], interact: ['KeyF', 'KeyE'],
  slot0: ['Digit1'], slot1: ['Digit2'], slot2: ['Digit3'], slot3: ['Digit4'], slot4: ['Digit5'], slot5: ['KeyR'],
  target: ['Tab'], map: ['KeyM'], inventory: ['KeyI', 'KeyB'], chat: ['Enter'], menu: ['Escape'], quest: ['KeyJ'], walkToggle: ['KeyZ'],
};

/** Standard-mapping button names, indexed by Gamepad.buttons index. */
export const PAD_BUTTONS = ['A', 'B', 'X', 'Y', 'LB', 'RB', 'LT', 'RT', 'BACK', 'START', 'L3', 'R3', 'UP', 'DOWN', 'LEFT', 'RIGHT', 'HOME'];
const BTN_INDEX = Object.fromEntries(PAD_BUTTONS.map((n, i) => [n, i]));

/** action -> 'BUTTON' or 'MODIFIER+BUTTON'. 'sprint' toggles a latch; 'targetNearest' is a pad-only extra. */
export const PAD_DEFAULTS = Object.freeze({
  jump: 'A', dodge: 'B', slot0: 'X', slot1: 'Y', slot2: 'RB', slot3: 'LB', slot4: 'RT', slot5: 'LT+RT',
  target: 'LEFT', interact: 'RIGHT', inventory: 'UP', quest: 'DOWN', menu: 'START', map: 'BACK',
  sprint: 'L3', targetNearest: 'R3', walkToggle: 'LT+DOWN',
});
/** Actions a player may rebind from the settings screen (order = display order). */
export const PAD_REBINDABLE = ['jump', 'dodge', 'slot0', 'slot1', 'slot2', 'slot3', 'slot4', 'slot5', 'target', 'targetNearest', 'interact', 'sprint', 'inventory', 'quest', 'map', 'menu'];
const PAD_STORE = 'aetherion.padBindings';

/** 'ps' | 'xbox' glyph family from a Gamepad.id string. */
export function padStyle(id = '') {
  if (/xbox|xinput|045e/i.test(id)) return 'xbox';
  return /054c|playstation|dualshock|dualsense|sony|ps[345]|^wireless controller/i.test(id) ? 'ps' : 'xbox';
}

const clamp01 = (v) => Math.max(0, Math.min(1, v));

export function createInput(canvas, bus) {
  const down = new Set();
  const pressed = new Set();
  const state = { moveX: 0, moveY: 0, lookDX: 0, lookDY: 0, zoom: 0, sprint: false, jump: false, mouseLeft: false, mouseRight: false, pointerLocked: false };
  const virtual = { mx: 0, my: 0, active: false, lookDX: 0, lookDY: 0, sprint: false };
  let typing = false; // UI sets when chat input focused / a window is open
  let enabled = true;

  // ---------------------------------------------------------------- device tracking
  const coarse = typeof matchMedia === 'function' && matchMedia('(pointer: coarse)').matches;
  let device = coarse ? 'touch' : 'kbm';
  function setDevice(d) {
    if (d === device) return;
    const prev = device; device = d;
    try { bus.emit('input:device', { device: d, prev, style: pad.style, id: pad.id }); } catch (e) { console.warn('[input] device', e); }
  }

  const actionOf = (code) => Object.keys(BINDINGS).find((a) => BINDINGS[a].includes(code));

  addEventListener('keydown', (e) => {
    setDevice('kbm');
    if (typing || !enabled) return;
    const a = actionOf(e.code);
    if (!a) return;
    if (a === 'target' || a === 'jump') e.preventDefault();
    if (!down.has(a)) pressed.add(a);
    down.add(a);
    bus.emit('input:action', a);
  });
  addEventListener('keyup', (e) => { const a = actionOf(e.code); if (a) down.delete(a); });
  addEventListener('blur', () => down.clear());

  canvas.addEventListener('contextmenu', (e) => e.preventDefault());
  canvas.addEventListener('pointerdown', (e) => {
    if (e.pointerType !== 'mouse') return;
    if (e.button === 0) { state.mouseLeft = true; pressed.add('click'); }
    if (e.button === 2) state.mouseRight = true;
    canvas.focus();
  });
  addEventListener('pointerdown', (e) => setDevice(e.pointerType === 'mouse' ? 'kbm' : 'touch'), true);
  addEventListener('pointerup', (e) => { if (e.button === 0) state.mouseLeft = false; if (e.button === 2) state.mouseRight = false; });
  let mouseTravel = 0;
  addEventListener('pointermove', (e) => {
    if (e.pointerType !== 'mouse') return;
    if (device !== 'kbm') { mouseTravel += Math.abs(e.movementX || 0) + Math.abs(e.movementY || 0); if (mouseTravel > 24) { mouseTravel = 0; setDevice('kbm'); } }
    if (document.pointerLockElement === canvas || state.mouseRight) { state.lookDX += e.movementX; state.lookDY += e.movementY; }
  });
  canvas.addEventListener('wheel', (e) => { state.zoom += Math.sign(e.deltaY); e.preventDefault(); }, { passive: false });
  document.addEventListener('pointerlockchange', () => { state.pointerLocked = document.pointerLockElement === canvas; });

  // ---------------------------------------------------------------- gamepad
  const cfg = { deadzone: 0.16, outer: 0.96, moveCurve: 1.15, lookCurve: 1.9, lookSpeed: 1, invertY: false, vibration: true, autoSprint: true,
    lookRadX: 3.4, lookRadY: 2.1 /* rad/s at full deflection */ };
  let bindings = { ...PAD_DEFAULTS };
  try { const s = JSON.parse(localStorage.getItem(PAD_STORE) || 'null'); if (s && typeof s === 'object') bindings = { ...PAD_DEFAULTS, ...s }; } catch { /* private mode */ }

  const pad = {
    connected: false, id: '', style: 'xbox', index: -1, polls: 0,
    lx: 0, ly: 0, rx: 0, ry: 0, lt: 0, rt: 0, // shaped stick values (post deadzone) + trigger values, read-only
    held: (name) => padHeld[BTN_INDEX[name]] === true,
  };
  const padHeld = new Array(PAD_BUTTONS.length).fill(false);
  const suppressed = new Array(PAD_BUTTONS.length).fill(false); // held across a capture change: ignore until released
  const padDown = new Map(); // action -> button index holding it
  let padSprint = false, fullPushT = 0, lastPadPoll = 0, captureFn = null, wasCaptured = false, captureNext = null;
  const nav = { dir: null, src: null, next: 0 };

  addEventListener('gamepadconnected', (e) => {
    const g = e.gamepad;
    if (g && !pad.connected) adoptPad(g);
    try { bus.emit('input:pad', { connected: true, id: g?.id || '', style: padStyle(g?.id) }); } catch { /* ignore */ }
  });
  addEventListener('gamepaddisconnected', (e) => {
    if (e.gamepad && e.gamepad.index === pad.index) dropPad();
  });
  function adoptPad(g) {
    pad.connected = true; pad.index = g.index; pad.id = g.id || 'Gamepad';
    const st = padStyle(pad.id);
    if (st !== pad.style) { pad.style = st; }
  }
  function dropPad() {
    pad.connected = false; pad.index = -1; releasePad();
    try { bus.emit('input:pad', { connected: false, id: pad.id, style: pad.style }); } catch { /* ignore */ }
    if (device === 'gamepad') setDevice(coarse ? 'touch' : 'kbm');
  }
  function releasePad() {
    padDown.clear(); padSprint = false; fullPushT = 0;
    padHeld.fill(false); suppressed.fill(false);
    pad.lx = pad.ly = pad.rx = pad.ry = pad.lt = pad.rt = 0; pad.move = null; pad.sprint = false;
  }
  function readPads() {
    let list = [];
    try { list = navigator.getGamepads ? Array.from(navigator.getGamepads() || []) : []; } catch { return null; }
    let g = pad.index >= 0 ? list[pad.index] : null;
    if (!g || !g.connected) {
      // first connected pad, preferring the standard mapping
      g = list.find((p) => p && p.connected && p.mapping === 'standard') || list.find((p) => p && p.connected) || null;
      if (g) { adoptPad(g); try { bus.emit('input:pad', { connected: true, id: g.id, style: pad.style }); } catch { /* ignore */ } }
      else if (pad.connected) dropPad();
    } else if (g.id !== pad.id) { adoptPad(g); try { bus.emit('input:pad', { connected: true, id: g.id, style: pad.style }); } catch { /* ignore */ } }
    return g;
  }
  /** Radial deadzone + response curve. Returns [x, y, normalizedMagnitude]. */
  function shape(x, y, curve) {
    const m = Math.hypot(x, y);
    if (m < cfg.deadzone) return [0, 0, 0];
    const n = clamp01((m - cfg.deadzone) / (cfg.outer - cfg.deadzone));
    const c = Math.pow(n, curve);
    return [(x / m) * c, (y / m) * c, n];
  }
  const parse = (b) => { const p = String(b || '').split('+'); return p.length === 2 ? { mod: BTN_INDEX[p[0]], btn: BTN_INDEX[p[1]] } : { mod: -1, btn: BTN_INDEX[p[0]] }; };

  function fire(a) { pressed.add(a); try { bus.emit('input:action', a); } catch (e) { console.warn('[input] action', e); } }
  function padTrigger(action, b) {
    if (action === 'sprint') { padSprint = !padSprint; return; }
    padDown.set(action, b);
    fire(action);
  }
  function onPadPress(b, captured) {
    if (captureNext) { const r = captureNext; captureNext = null; r(PAD_BUTTONS[b]); return; }
    if (captured) { try { bus.emit('gamepad:nav', { btn: PAD_BUTTONS[b] }); } catch (e) { console.warn('[input] nav', e); } return; }
    // chords (modifier held) take priority over single bindings
    let hit = null;
    for (const [action, bind] of Object.entries(bindings)) {
      const p = parse(bind);
      if (p.mod >= 0 && p.btn === b && padHeld[p.mod]) { hit = action; break; }
    }
    if (hit) { padTrigger(hit, b); return; }
    for (const [action, bind] of Object.entries(bindings)) {
      const p = parse(bind);
      if (p.mod < 0 && p.btn === b) padTrigger(action, b);
    }
  }
  function emitNav(dir, src, repeat) { try { bus.emit('gamepad:nav', { dir, src, repeat }); } catch (e) { console.warn('[input] nav', e); } }

  function pollPad(now) {
    const g = readPads();
    if (!g) return;
    pad.polls++;
    const dt = Math.min(0.1, Math.max(0.001, lastPadPoll ? (now - lastPadPoll) / 1000 : 1 / 60));
    lastPadPoll = now;
    const captured = typing || !enabled || !!(captureFn && captureFn());
    if (captured !== wasCaptured) {
      // A press that opened/closed a menu must not leak into the other mode.
      for (let i = 0; i < padHeld.length; i++) suppressed[i] = padHeld[i];
      padDown.clear(); wasCaptured = captured; nav.dir = null;
    }
    const ax = g.axes || [];
    const [lx, ly, ln] = shape(ax[0] || 0, ax[1] || 0, cfg.moveCurve);
    const [rx, ry] = shape(ax[2] || 0, ax[3] || 0, cfg.lookCurve);
    pad.lx = lx; pad.ly = ly; pad.rx = rx; pad.ry = ry;
    let active = ln > 0 || rx !== 0 || ry !== 0;
    // buttons (edge detection, analog triggers with hysteresis)
    const btns = g.buttons || [];
    for (let i = 0; i < PAD_BUTTONS.length; i++) {
      const bt = btns[i];
      const val = bt ? (typeof bt === 'object' ? (bt.value || (bt.pressed ? 1 : 0)) : Number(bt)) : 0;
      if (i === 6) pad.lt = val; if (i === 7) pad.rt = val;
      const trig = i === 6 || i === 7;
      const on = trig ? val > (padHeld[i] ? 0.35 : 0.55) : (!!bt?.pressed || val > 0.5);
      if (on && !padHeld[i]) { padHeld[i] = true; active = true; if (!suppressed[i]) onPadPress(i, captured); }
      else if (!on && padHeld[i]) {
        padHeld[i] = false; suppressed[i] = false;
        for (const [a, bi] of padDown) if (bi === i) padDown.delete(a);
      }
    }
    if (active) setDevice('gamepad');

    if (captured) {
      // spatial navigation: D-pad first, then the left stick (hysteresis + auto-repeat)
      let dir = null, src = null;
      if (padHeld[12]) dir = 'up'; else if (padHeld[13]) dir = 'down'; else if (padHeld[14]) dir = 'left'; else if (padHeld[15]) dir = 'right';
      if (dir) src = 'dpad';
      else {
        const sx = ax[0] || 0, sy = ax[1] || 0, m = Math.hypot(sx, sy);
        const thr = nav.dir && nav.src === 'stick' ? 0.35 : 0.55;
        if (m > thr) { dir = Math.abs(sx) > Math.abs(sy) ? (sx > 0 ? 'right' : 'left') : (sy > 0 ? 'down' : 'up'); src = 'stick'; }
      }
      if (!dir) nav.dir = null;
      else if (dir !== nav.dir) { nav.dir = dir; nav.src = src; nav.next = now + 380; emitNav(dir, src, false); }
      else if (now >= nav.next) { nav.next = now + 110; emitNav(dir, src, true); }
      return;
    }

    // ---- gameplay: move, sprint, look, zoom
    if (ln < 0.15) padSprint = false;
    if (cfg.autoSprint && ln >= 0.97) fullPushT += dt; else fullPushT = 0;
    pad.move = ln > 0 ? { x: lx, y: -ly } : null;
    pad.sprint = padSprint || fullPushT > 0.3;
    const lt = padHeld[6];
    const camLocked = state.pointerLocked || state.mouseRight;
    const pxPerRad = 1 / (camLocked ? 0.0032 : 0.0045); // match camera.js sens so speed is device-consistent
    if (rx) state.lookDX += rx * cfg.lookRadX * cfg.lookSpeed * dt * pxPerRad;
    if (ry) {
      if (lt) state.zoom += ry * 7 * dt; // LT + right stick vertical = zoom
      else state.lookDY += ry * (cfg.invertY ? -1 : 1) * cfg.lookRadY * cfg.lookSpeed * dt * pxPerRad;
    }
  }

  function rumble(strong = 0.5, weak = 0.5, ms = 200) {
    if (!cfg.vibration || !pad.connected) return false;
    let g = null;
    try { g = navigator.getGamepads?.()?.[pad.index]; } catch { return false; }
    try {
      const act = g?.vibrationActuator;
      if (act?.playEffect) { act.playEffect('dual-rumble', { startDelay: 0, duration: Math.round(ms), strongMagnitude: clamp01(strong), weakMagnitude: clamp01(weak) })?.catch?.(() => {}); return true; }
      const h = g?.hapticActuators?.[0];
      if (h?.pulse) { h.pulse(clamp01(Math.max(strong, weak)), ms); return true; }
    } catch { /* unsupported */ }
    return false;
  }
  function saveBindings() {
    const diff = {};
    for (const [a, b] of Object.entries(bindings)) if (PAD_DEFAULTS[a] !== b) diff[a] = b;
    try { localStorage.setItem(PAD_STORE, JSON.stringify(diff)); } catch { /* ignore */ }
    try { bus.emit('input:bindings', { ...bindings }); } catch { /* ignore */ }
  }

  return {
    state,
    BINDINGS,
    get device() { return device; },
    pad,
    /** Called once per frame before gameplay updates. */
    poll() {
      pollPad(performance.now());
      const kx = (down.has('right') ? 1 : 0) - (down.has('left') ? 1 : 0);
      const ky = (down.has('forward') ? 1 : 0) - (down.has('back') ? 1 : 0);
      const pm = !wasCaptured && pad.move;
      state.moveX = virtual.active ? virtual.mx : (kx || ky || !pm) ? kx : pm.x;
      state.moveY = virtual.active ? virtual.my : (kx || ky || !pm) ? ky : pm.y;
      const len = Math.hypot(state.moveX, state.moveY);
      if (len > 1) { state.moveX /= len; state.moveY /= len; }
      state.sprint = down.has('sprint') || virtual.sprint || (!wasCaptured && !!pad.sprint && !!pm);
      state.jump = down.has('jump') || padDown.has('jump');
      state.lookDX += virtual.lookDX; state.lookDY += virtual.lookDY;
      virtual.lookDX = 0; virtual.lookDY = 0;
    },
    /** Called once per frame after gameplay updates. */
    endFrame() { state.lookDX = 0; state.lookDY = 0; state.zoom = 0; pressed.clear(); },
    isDown: (a) => down.has(a) || padDown.has(a),
    consume(a) { if (pressed.has(a)) { pressed.delete(a); return true; } return false; },
    press(a) { pressed.add(a); bus.emit('input:action', a); },
    hold(a, on) { if (on) { if (!down.has(a)) pressed.add(a); down.add(a); } else down.delete(a); },
    setVirtualMove(x, y) { virtual.mx = x; virtual.my = y; virtual.active = Math.hypot(x, y) > 0.02; if (virtual.active) setDevice('touch'); },
    setVirtualSprint(on) { virtual.sprint = on; },
    addVirtualLook(dx, dy) { virtual.lookDX += dx; virtual.lookDY += dy; },
    setTyping(v) { typing = v; if (v) down.clear(); },
    setEnabled(v) { enabled = v; if (!v) down.clear(); },
    requestPointerLock() { if (!matchMedia('(pointer: coarse)').matches) canvas.requestPointerLock?.(); },

    // ---- gamepad extras
    /** fn() -> true while a menu owns the pad (gameplay then gets nothing; `gamepad:nav` is emitted instead). */
    setPadCapture(fn) { captureFn = typeof fn === 'function' ? fn : (fn ? () => true : null); },
    /** True while a menu / chat owns the pad (diagnostics, QA). */
    get padCaptured() { return wasCaptured; },
    get padCaptureReason() { return { typing, enabled, menu: !!(captureFn && captureFn()) }; },
    padConfig: cfg,
    setPadConfig(partial) { Object.assign(cfg, partial || {}); },
    get padBindings() { return { ...bindings }; },
    setPadBinding(action, bind) {
      if (!(action in PAD_DEFAULTS) || !bind) return;
      // keep bindings unique: whoever had this exact input gets the old input of `action`
      const prev = bindings[action];
      for (const [a, b] of Object.entries(bindings)) if (a !== action && b === bind) bindings[a] = prev;
      bindings[action] = bind; saveBindings();
    },
    resetPadBindings() { bindings = { ...PAD_DEFAULTS }; saveBindings(); },
    /** Resolves with the next pad button name pressed (used by the rebind UI); swallows that press. */
    capturePadButton() { return new Promise((res) => { captureNext = res; }); },
    cancelPadCapture() { const r = captureNext; captureNext = null; r?.(null); },
    rumble,
  };
}
