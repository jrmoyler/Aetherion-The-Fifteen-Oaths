// Unified input state. Keyboard + mouse are wired here; the UI module feeds touch
// joystick / buttons through setVirtualMove / setVirtualLook / press().
// Consumers read ctx.input.state each frame and drain ctx.input.consume(action).

export const BINDINGS = {
  forward: ['KeyW', 'ArrowUp'], back: ['KeyS', 'ArrowDown'], left: ['KeyA', 'ArrowLeft'], right: ['KeyD', 'ArrowRight'],
  jump: ['Space'], sprint: ['ShiftLeft', 'ShiftRight'], dodge: ['KeyC', 'AltLeft'], interact: ['KeyF', 'KeyE'],
  slot0: ['Digit1'], slot1: ['Digit2'], slot2: ['Digit3'], slot3: ['Digit4'], slot4: ['Digit5'], slot5: ['KeyR'],
  target: ['Tab'], map: ['KeyM'], inventory: ['KeyI', 'KeyB'], chat: ['Enter'], menu: ['Escape'], quest: ['KeyJ'], walkToggle: ['KeyZ'],
};

export function createInput(canvas, bus) {
  const down = new Set();
  const pressed = new Set();
  const state = { moveX: 0, moveY: 0, lookDX: 0, lookDY: 0, zoom: 0, sprint: false, jump: false, mouseLeft: false, mouseRight: false, pointerLocked: false };
  const virtual = { mx: 0, my: 0, active: false, lookDX: 0, lookDY: 0, sprint: false };
  let typing = false; // UI sets when chat input focused
  let enabled = true;

  const actionOf = (code) => Object.keys(BINDINGS).find((a) => BINDINGS[a].includes(code));

  addEventListener('keydown', (e) => {
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
  addEventListener('pointerup', (e) => { if (e.button === 0) state.mouseLeft = false; if (e.button === 2) state.mouseRight = false; });
  addEventListener('pointermove', (e) => {
    if (e.pointerType !== 'mouse') return;
    if (document.pointerLockElement === canvas || state.mouseRight) { state.lookDX += e.movementX; state.lookDY += e.movementY; }
  });
  canvas.addEventListener('wheel', (e) => { state.zoom += Math.sign(e.deltaY); e.preventDefault(); }, { passive: false });
  document.addEventListener('pointerlockchange', () => { state.pointerLocked = document.pointerLockElement === canvas; });

  return {
    state,
    BINDINGS,
    /** Called once per frame before gameplay updates. */
    poll() {
      const kx = (down.has('right') ? 1 : 0) - (down.has('left') ? 1 : 0);
      const ky = (down.has('forward') ? 1 : 0) - (down.has('back') ? 1 : 0);
      state.moveX = virtual.active ? virtual.mx : kx;
      state.moveY = virtual.active ? virtual.my : ky;
      const len = Math.hypot(state.moveX, state.moveY);
      if (len > 1) { state.moveX /= len; state.moveY /= len; }
      state.sprint = down.has('sprint') || virtual.sprint;
      state.jump = down.has('jump');
      state.lookDX += virtual.lookDX; state.lookDY += virtual.lookDY;
      virtual.lookDX = 0; virtual.lookDY = 0;
    },
    /** Called once per frame after gameplay updates. */
    endFrame() { state.lookDX = 0; state.lookDY = 0; state.zoom = 0; pressed.clear(); },
    isDown: (a) => down.has(a),
    consume(a) { if (pressed.has(a)) { pressed.delete(a); return true; } return false; },
    press(a) { pressed.add(a); bus.emit('input:action', a); },
    hold(a, on) { if (on) { if (!down.has(a)) pressed.add(a); down.add(a); } else down.delete(a); },
    setVirtualMove(x, y) { virtual.mx = x; virtual.my = y; virtual.active = Math.hypot(x, y) > 0.02; },
    setVirtualSprint(on) { virtual.sprint = on; },
    addVirtualLook(dx, dy) { virtual.lookDX += dx; virtual.lookDY += dy; },
    setTyping(v) { typing = v; if (v) down.clear(); },
    setEnabled(v) { enabled = v; if (!v) down.clear(); },
    requestPointerLock() { if (!matchMedia('(pointer: coarse)').matches) canvas.requestPointerLock?.(); },
  };
}
