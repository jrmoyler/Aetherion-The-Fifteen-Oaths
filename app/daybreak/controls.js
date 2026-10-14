import { filterCastables, replaceSlot, stickKeys } from './model.mjs';

export function installControls(app, adapter, catalog) {
  const byId = id => document.getElementById(id);
  const panel = byId('controls'), picker = byId('picker'), status = byId('status');
  const all = adapter.list();
  const elements = byId('element'), kind = byId('kind'), search = byId('search');
  const fire = byId('fire'), action = byId('action');
  const canvas = byId('viewport');
  let current = all[0], loadout = all.slice(0, 4).map(entry => entry.uid), busy = false;
  let stickPointer = null, movement = new Set(), heldSpace = false, disposed = false;
  const aim = app.input.pointer.clone().set(0, 0.15);
  const abort = new AbortController();
  const on = (target, type, handler, options = {}) => target.addEventListener(type, handler, { ...options, signal: abort.signal });
  const report = message => { status.textContent = message; };
  const input = app.input;
  const originalFrame = app.frame;
  const originalStand = app.dummies._stand;
  // Respawn around the courtyard origin while retaining the real player as the
  // dummy's look-at anchor. Never mutate source modules or their source bytes.
  app.dummies._stand = function(dummy) {
    const anchor = this._anchor.clone();
    this._anchor.set(0, 0, 0);
    try { return originalStand.call(this, dummy); } finally { this._anchor.copy(anchor); }
  };
  app.frame = function(...args) {
    const physical = input.keys;
    input.keys = new Set([...physical, ...movement, ...(heldSpace ? ['Space'] : [])]);
    try { return originalFrame.apply(this, args); } finally { input.keys = physical; }
  };
  function release() {
    movement.clear(); heldSpace = false; stickPointer = null;
    byId('knob').style.transform = '';
    input.keys.clear();
    for (const runtime of app.runtimes.values()) runtime.pointerFire?.(false);
  }
  function labels() {
    fire.textContent = current.kind === 'buff' ? 'Toggle buff' : current.kind === 'summon' ? 'Hold to fire' : 'Cast';
    action.style.display = current.kind === 'summon' ? 'block' : 'none';
    byId('loadout').replaceChildren(...loadout.map((uid, index) => {
      const button = document.createElement('button');
      button.textContent = `${index + 1} · ${adapter.describe(uid).label ?? uid}`;
      button.setAttribute('aria-pressed', String(current.uid === uid));
      button.disabled = busy;
      button.onclick = () => void choose(uid);
      return button;
    }));
  }
  function populate() {
    const visible = filterCastables(all, { search: search.value, element: elements.value, kind: kind.value });
    picker.replaceChildren(...visible.map(entry => {
      const option = document.createElement('option'); option.value = entry.uid;
      option.textContent = `${entry.label ?? entry.id} · ${entry.uid} · ${entry.kind}`;
      return option;
    }));
    picker.value = visible.some(entry => entry.uid === current.uid) ? current.uid : '';
    byId('count').textContent = `(${visible.length} / ${all.length})`;
    byId('assign').disabled = busy || !picker.value;
    // Filtering never changes or casts the equipped selection implicitly.
  }
  async function run(job) {
    if (busy || disposed) return;
    busy = true;
    for (const control of [picker, fire, action, byId('assign'), byId('reset'), byId('clear')]) control.disabled = true;
    labels();
    try { await job(); }
    catch (error) { console.error('[Daybreak action]', error); report(`Action failed: ${error.message}`); }
    finally {
      busy = false;
      if (!disposed) {
        for (const control of [picker, fire, action, byId('reset'), byId('clear')]) control.disabled = false;
        byId('assign').disabled = !picker.value;
        labels();
      }
    }
  }
  async function choose(uid) {
    await run(async () => {
      const next = adapter.describe(uid);
      for (const runtime of app.runtimes.values()) runtime.pointerFire?.(false);
      app.activeAim.cancel();
      if (next.kind !== 'buff') await adapter.select(uid);
      current = next;
      if (current.kind === 'ability') {
        await app.arm(uid); app.activeAim.point(aim);
      }
      populate();
      report(`${current.label ?? current.uid} · ${current.kind} · ${current.uid}`);
    });
  }
  async function cast() {
    await run(async () => {
      if (current.kind === 'summon') { report('Use Deploy / recall first, then hold Fire while the summon is active.'); return; }
      if (current.kind === 'buff') {
        const accepted = await adapter.cast(current.uid);
        report(`${current.label}: ${accepted ? 'source action accepted' : 'source declined action'}.`);
        return;
      }
      await adapter.select(current.uid);
      const armed = await app.arm(current.uid);
      if (!armed) { report(`${current.label}: cooling down or source runtime declined arming.`); return; }
      app.activeAim.setOrigin(app.character.position);
      app.activeAim.point(aim); app.activeAim.update(0);
      const accepted = app.activeAim.confirm();
      report(`${current.label}: ${accepted ? 'cast submitted' : 'aim rejected; aim on the ground within range'}.`);
    });
  }
  function point(event) {
    const rect = canvas.getBoundingClientRect();
    aim.set((event.clientX - rect.left) / rect.width * 2 - 1, -(event.clientY - rect.top) / rect.height * 2 + 1);
    input.pointer.copy(aim); input.emit('pointer:move', aim);
  }
  // Source's window-wide pointer listener also sees joystick drags. Replace
  // only this instance's listeners so UI input cannot change the world aim.
  canvas.removeEventListener('pointerdown', input._onPointerDown);
  window.removeEventListener('pointermove', input._onPointerMove);
  window.removeEventListener('keydown', input._onKeyDown);
  on(canvas, 'pointermove', point);
  on(canvas, 'pointerdown', event => {
    point(event);
    if (event.pointerType === 'touch') return; // two-finger OrbitControls remains intact
    if (event.button === 2) { app.activeAim.cancel(); return; }
    if (event.button !== 0) return;
    if (app.slot?.runtime?.capturesPointer?.()) app.slot.runtime.pointerFire(true);
    else void cast();
  });
  on(window, 'keydown', event => {
    if (event.target.closest?.('#controls, button, input, select, textarea') || event.target.isContentEditable) return;
    const slot = /^Digit([1-4])$/.exec(event.code);
    if (slot) { if (!event.repeat) void choose(loadout[Number(slot[1]) - 1]); event.preventDefault(); return; }
    // Retain source movement, run, dash, cancel, target reset, clear and pause.
    if (/^(Key[WASDCTP]|Arrow(Up|Down|Left|Right)|Shift(Left|Right)|Space|Escape)$/.test(event.code)) input._onKeyDown(event);
  });
  on(panel, 'keydown', event => event.stopPropagation());
  for (const element of catalog.elements) {
    const option = document.createElement('option'); option.value = element.id; option.textContent = element.label; elements.append(option);
  }
  for (const control of [elements, kind, search]) on(control, 'input', populate);
  on(picker, 'change', () => { if (picker.value) void choose(picker.value); });
  on(byId('assign'), 'click', () => {
    loadout = replaceSlot(loadout, Number(byId('slot').value), picker.value, all); labels();
    report(`Assigned ${adapter.describe(picker.value).label} to slot ${Number(byId('slot').value) + 1}.`);
  });
  on(byId('clear'), 'click', () => void run(async () => { await adapter.clear(); report('Source effects cleared.'); }));
  on(byId('reset'), 'click', () => void run(async () => {
    release(); await adapter.clear(); app.character.position.set(0, 0, 0); app.locomotion.reset(); app.dummies.reset();
    report('Player and practice targets reset.');
  }));
  on(action, 'click', () => void run(async () => {
    const accepted = await adapter.cast(current.uid);
    report(`${current.label}: ${accepted === false ? 'source declined deploy / recall' : 'deploy / recall requested'}.`);
  }));
  on(fire, 'pointerdown', event => {
    if (busy) return;
    if (current.kind === 'summon' && app.slot?.runtime?.capturesPointer?.()) {
      fire.setPointerCapture(event.pointerId); app.slot.runtime.pointerFire(true);
    }
  });
  const stopFire = () => { for (const runtime of app.runtimes.values()) runtime.pointerFire?.(false); };
  for (const type of ['pointerup', 'pointercancel', 'lostpointercapture']) on(fire, type, stopFire);
  on(fire, 'click', () => { if (current.kind !== 'summon') void cast(); });
  on(byId('dash'), 'pointerdown', event => { heldSpace = true; event.currentTarget.setPointerCapture(event.pointerId); });
  for (const type of ['pointerup', 'pointercancel', 'lostpointercapture']) on(byId('dash'), type, () => { heldSpace = false; });
  const stick = byId('stick');
  function moveStick(event) {
    if (event.pointerId !== stickPointer) return;
    const rect = stick.getBoundingClientRect(), radius = rect.width / 2;
    let x = (event.clientX - rect.left - radius) / radius, y = (event.clientY - rect.top - radius) / radius;
    const magnitude = Math.max(1, Math.hypot(x, y)); x /= magnitude; y /= magnitude;
    movement = stickKeys(x, y);
    byId('knob').style.transform = `translate(${x * radius * 0.6}px,${y * radius * 0.6}px)`;
  }
  on(stick, 'pointerdown', event => {
    if (stickPointer !== null) return;
    stickPointer = event.pointerId; stick.setPointerCapture(event.pointerId); moveStick(event);
  });
  on(stick, 'pointermove', moveStick);
  for (const type of ['pointerup', 'pointercancel', 'lostpointercapture']) on(stick, type, event => {
    if (event.pointerId === stickPointer) { movement.clear(); stickPointer = null; byId('knob').style.transform = ''; }
  });
  on(window, 'blur', release);
  on(document, 'visibilitychange', () => { if (document.hidden) release(); });
  populate(); labels();
  const ready = choose(current.uid);
  return { ready, get current() { return current.uid; }, get loadout() { return [...loadout]; }, dispose() {
    disposed = true; release(); abort.abort(); app.frame = originalFrame; app.dummies._stand = originalStand;
    canvas.addEventListener('pointerdown', input._onPointerDown);
    window.addEventListener('pointermove', input._onPointerMove);
    window.addEventListener('keydown', input._onKeyDown);
  } };
}
