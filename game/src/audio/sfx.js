// Synthesized UI sounds, per-element spell casts / impacts and footsteps.
const R = (a, b) => a + Math.random() * (b - a);

export function createSfx(E) {
  const out = () => E.sfx;
  const voices = new Set();
  function attach(dest, source, nodes) {
    dest._sources?.add(source);
    source.onended = () => {
      for (const node of [source, ...nodes]) { try { node.disconnect(); } catch {} }
      dest._sources?.delete(source);
      if (dest._sources?.size === 0) dest._dispose?.();
    };
  }

  function chain(dest, pan = 0, gain = 1, wet = 0) {
    while (voices.size >= 32) voices.values().next().value._dispose();
    const g = E.ac.createGain(); g.gain.value = gain;
    const nodes = []; g._sources = new Set();
    g._dispose = () => {
      for (const source of g._sources) { try { source.stop(); source.disconnect(); } catch {} }
      g._sources.clear();
      for (const node of [g, ...nodes]) { try { node.disconnect(); } catch {} }
      voices.delete(g);
    };
    voices.add(g);
    const p = E.ac.createStereoPanner(); p.pan.value = Math.max(-1, Math.min(1, pan));
    g.connect(p); p.connect(dest || out()); nodes.push(p);
    if (wet > 0) { const w = E.ac.createGain(); w.gain.value = wet; g.connect(w); w.connect(E.sfxSend || E.reverbSend); nodes.push(w); }
    return g;
  }
  function tone(dest, { type = 'sine', f0, f1 = f0, t = E.now(), a = 0.005, d = 0.2, g = 0.2, det = 0, curve = 'exp' }) {
    const o = E.ac.createOscillator(); o.type = type; o.detune.value = det; o.frequency.setValueAtTime(f0, t);
    if (f1 !== f0) curve === 'exp' ? o.frequency.exponentialRampToValueAtTime(Math.max(1, f1), t + a + d) : o.frequency.linearRampToValueAtTime(f1, t + a + d);
    const e = E.ac.createGain(); e.gain.setValueAtTime(0, t); e.gain.linearRampToValueAtTime(g, t + a); e.gain.exponentialRampToValueAtTime(0.0001, t + a + d);
    attach(dest, o, [e]); o.connect(e); e.connect(dest); o.start(t); o.stop(t + a + d + 0.05);
    return o;
  }
  function noise(dest, { kind = 'white', type = 'bandpass', f0 = 1000, f1 = f0, q = 1, t = E.now(), a = 0.005, d = 0.2, g = 0.2 }) {
    const s = E.ac.createBufferSource(); s.buffer = E.noise[kind];
    const f = E.ac.createBiquadFilter(); f.type = type; f.Q.value = q; f.frequency.setValueAtTime(f0, t);
    if (f1 !== f0) f.frequency.exponentialRampToValueAtTime(Math.max(20, f1), t + a + d);
    const e = E.ac.createGain(); e.gain.setValueAtTime(0, t); e.gain.linearRampToValueAtTime(g, t + a); e.gain.exponentialRampToValueAtTime(0.0001, t + a + d);
    attach(dest, s, [f, e]); s.connect(f); f.connect(e); e.connect(dest); s.start(t, Math.random() * 2); s.stop(t + a + d + 0.05);
  }
  function fm(dest, { f, ratio = 2, index = 2, t = E.now(), a = 0.005, d = 0.5, g = 0.15 }) {
    const c = E.ac.createOscillator(); const m = E.ac.createOscillator(); const mg = E.ac.createGain();
    c.frequency.value = f; m.frequency.value = f * ratio; mg.gain.setValueAtTime(f * index, t); mg.gain.exponentialRampToValueAtTime(f * 0.05, t + d);
    m.connect(mg); mg.connect(c.frequency);
    const e = E.ac.createGain(); e.gain.setValueAtTime(0, t); e.gain.linearRampToValueAtTime(g, t + a); e.gain.exponentialRampToValueAtTime(0.0001, t + a + d);
    attach(dest, c, [e]); attach(dest, m, [mg]); c.connect(e); e.connect(dest); c.start(t); m.start(t); c.stop(t + a + d + 0.05); m.stop(t + a + d + 0.05);
  }
  const crackle = (dest, n, t, dur, f = 3000, g = 0.08) => { for (let i = 0; i < n; i++) noise(dest, { f0: f * R(0.7, 1.4), q: 4, t: t + Math.random() * dur, a: 0.001, d: 0.015, g: g * R(0.5, 1) }); };

  // ---------------- UI
  const UI = {
    hover: () => tone(chain(null, 0, 1), { f0: 2600, f1: 2400, d: 0.03, g: 0.025 }),
    click: () => { const c = chain(null, 0, 1); tone(c, { type: 'triangle', f0: 1400, f1: 900, d: 0.05, g: 0.08 }); noise(c, { f0: 4000, q: 2, d: 0.02, g: 0.04 }); },
    open: () => noise(chain(null, 0, 1, 0.2), { kind: 'pink', f0: 300, f1: 2400, q: 1.2, a: 0.02, d: 0.22, g: 0.12 }),
    close: () => noise(chain(null, 0, 1, 0.1), { kind: 'pink', f0: 2000, f1: 300, q: 1.2, a: 0.01, d: 0.18, g: 0.1 }),
    confirm: () => { const c = chain(null, 0, 1, 0.3); const t = E.now(); tone(c, { type: 'triangle', f0: 660, t, d: 0.4, g: 0.1 }); tone(c, { type: 'triangle', f0: 990, t: t + 0.09, d: 0.6, g: 0.09 }); },
    error: () => { const c = chain(null, 0, 1); const t = E.now(); tone(c, { type: 'square', f0: 140, t, d: 0.08, g: 0.05 }); tone(c, { type: 'square', f0: 120, t: t + 0.11, d: 0.1, g: 0.05 }); },
    chat: () => tone(chain(null, 0, 1), { f0: 1800, f1: 2200, d: 0.05, g: 0.03 }),
    target: () => tone(chain(null, 0, 1), { type: 'triangle', f0: 1200, f1: 1600, d: 0.05, g: 0.05 }),
    quest: () => { const c = chain(null, 0, 1, 0.4); const t = E.now(); [72, 76, 79].forEach((n, i) => tone(c, { type: 'triangle', f0: E.mtof(n), t: t + i * 0.12, d: 0.5, g: 0.07 })); },
    questDone: () => { const c = chain(null, 0, 1, 0.5); const t = E.now(); [72, 76, 79, 84].forEach((n, i) => fm(c, { f: E.mtof(n), ratio: 3.5, index: 1, t: t + i * 0.1, d: 1.2, g: 0.06 })); },
    levelup: () => {
      const c = chain(null, 0, 1, 0.6); const t = E.now();
      [60, 64, 67, 72, 76, 79, 84].forEach((n, i) => tone(c, { type: 'triangle', f0: E.mtof(n), t: t + i * 0.07, d: 1.4, g: 0.06 }));
      [48, 55, 60].forEach((n) => tone(c, { type: 'sawtooth', f0: E.mtof(n), t: t + 0.4, a: 0.3, d: 2.2, g: 0.025 }));
      noise(c, { kind: 'pink', type: 'highpass', f0: 4000, t: t + 0.3, a: 0.4, d: 1.8, g: 0.05 });
    },
    loot: () => { const c = chain(null, 0, 1, 0.5); const t = E.now(); [88, 91, 96].forEach((n, i) => fm(c, { f: E.mtof(n), ratio: 2.76, index: 0.8, t: t + i * 0.06, d: 0.7, g: 0.04 })); },
    region: () => { const c = chain(null, 0, 1, 0.9); const t = E.now(); fm(c, { f: 65, ratio: 1.41, index: 2.5, t, a: 0.01, d: 3.5, g: 0.12 }); noise(c, { kind: 'pink', type: 'highpass', f0: 3000, t: t + 0.2, a: 1, d: 2, g: 0.03 }); },
    death: () => { const c = chain(null, 0, 1, 0.8); const t = E.now(); tone(c, { type: 'sawtooth', f0: 110, f1: 40, t, a: 0.2, d: 3, g: 0.08 }); tone(c, { type: 'sine', f0: 220, f1: 80, t, a: 0.1, d: 2.5, g: 0.06 }); },
    travel: () => { const c = chain(null, 0, 1, 0.8); const t = E.now(); noise(c, { kind: 'pink', f0: 200, f1: 6000, q: 2, t, a: 0.6, d: 0.9, g: 0.12 }); [84, 88, 91].forEach((n, i) => tone(c, { f0: E.mtof(n), t: t + 0.4 + i * 0.08, d: 1, g: 0.04 })); },
  };

  // ---------------- elements: cast (release) & impact
  const CAST = {
    fire: (c, t, k) => { noise(c, { kind: 'pink', type: 'bandpass', f0: 300, f1: 1800, q: 0.8, t, a: 0.05, d: 0.45 * k, g: 0.22 }); crackle(c, 10, t, 0.4, 2500, 0.06); tone(c, { type: 'sawtooth', f0: 90, f1: 60, t, d: 0.4, g: 0.05 }); },
    frost: (c, t, k) => { fm(c, { f: R(1800, 2400), ratio: 3.01, index: 1.4, t, d: 0.6 * k, g: 0.06 }); noise(c, { f0: 6000, f1: 3000, q: 3, t, d: 0.3, g: 0.08 }); },
    storm: (c, t, k) => { tone(c, { type: 'sawtooth', f0: 1800, f1: 80, t, a: 0.002, d: 0.18 * k, g: 0.12 }); crackle(c, 16, t, 0.25, 4500, 0.09); noise(c, { kind: 'white', f0: 2000, q: 0.5, t, a: 0.002, d: 0.12, g: 0.1 }); },
    water: (c, t, k) => { noise(c, { kind: 'pink', type: 'lowpass', f0: 400, f1: 2400, q: 4, t, a: 0.08, d: 0.4 * k, g: 0.2 }); for (let i = 0; i < 5; i++) tone(c, { f0: R(500, 900), f1: R(1200, 1800), t: t + i * 0.05, d: 0.06, g: 0.04 }); },
    earth: (c, t, k) => { tone(c, { f0: 80, f1: 40, t, a: 0.005, d: 0.35 * k, g: 0.25 }); noise(c, { kind: 'brown', type: 'lowpass', f0: 600, f1: 120, t, d: 0.5, g: 0.3 }); crackle(c, 6, t + 0.05, 0.2, 1200, 0.06); },
    wind: (c, t, k) => noise(c, { kind: 'pink', type: 'bandpass', f0: 400, f1: 3000, q: 1.6, t, a: 0.12, d: 0.45 * k, g: 0.2 }),
    nature: (c, t, k) => { tone(c, { type: 'triangle', f0: 330, f1: 300, t, d: 0.25, g: 0.08 }); noise(c, { kind: 'pink', f0: 3000, q: 0.8, t, a: 0.05, d: 0.3 * k, g: 0.08 }); },
    poison: (c, t, k) => { for (let i = 0; i < 7; i++) tone(c, { f0: R(200, 400), f1: R(600, 1000), t: t + i * 0.045, d: 0.07, g: 0.05 }); noise(c, { kind: 'pink', type: 'lowpass', f0: 800, t, d: 0.4 * k, g: 0.1 }); },
    light: (c, t, k) => { [76, 83, 88].forEach((n, i) => tone(c, { type: 'triangle', f0: E.mtof(n), t: t + i * 0.02, a: 0.02, d: 0.8 * k, g: 0.05 })); noise(c, { kind: 'white', type: 'highpass', f0: 6000, t, a: 0.05, d: 0.5, g: 0.04 }); },
    cosmic: (c, t, k) => { tone(c, { f0: 220, f1: 55, t, a: 0.05, d: 0.7 * k, g: 0.14 }); fm(c, { f: 880, ratio: 1.5, index: 3, t, d: 0.6, g: 0.03 }); },
    shadow: (c, t, k) => { tone(c, { type: 'sawtooth', f0: 70, f1: 140, t, a: 0.25, d: 0.35 * k, g: 0.08 }); noise(c, { kind: 'brown', type: 'bandpass', f0: 200, f1: 600, q: 2, t, a: 0.25, d: 0.3, g: 0.2 }); },
    blood: (c, t, k) => { tone(c, { f0: 120, f1: 50, t, d: 0.25, g: 0.2 }); noise(c, { kind: 'pink', type: 'lowpass', f0: 1200, f1: 300, q: 6, t, d: 0.35 * k, g: 0.15 }); },
    arcane: (c, t, k) => { for (let i = 0; i < 5; i++) tone(c, { f0: E.mtof(84 + [0, 3, 7, 10, 14][i]), t: t + i * 0.035, d: 0.4 * k, g: 0.035, det: R(-15, 15) }); },
    time: (c, t, k) => { for (let i = 0; i < 4; i++) noise(c, { f0: i % 2 ? 2400 : 3400, q: 14, t: t + i * 0.09, a: 0.001, d: 0.03, g: 0.12 }); fm(c, { f: 660, ratio: 2, index: 1, t: t + 0.36, d: 0.4 * k, g: 0.05 }); },
    tech: (c, t, k) => { tone(c, { type: 'square', f0: 220, f1: 880, t, a: 0.01, d: 0.18, g: 0.05 }); noise(c, { kind: 'white', type: 'bandpass', f0: 1200, q: 3, t: t + 0.12, d: 0.25 * k, g: 0.12 }); tone(c, { f0: 60, f1: 40, t: t + 0.12, d: 0.3, g: 0.2 }); },
    basic_ninja: (c, t) => noise(c, { kind: 'pink', type: 'bandpass', f0: 1200, f1: 4000, q: 1.5, t, a: 0.02, d: 0.14, g: 0.16 }),
    basic_sorcerer: (c, t) => { tone(c, { type: 'triangle', f0: 600, f1: 1400, t, d: 0.15, g: 0.06 }); noise(c, { f0: 2500, q: 2, t, d: 0.15, g: 0.05 }); },
  };

  const clamp = (v, a, b) => Math.min(b, Math.max(a, v));
  /** pos -> {pan, gain} relative to listener, or null when too far. */
  function spatial(pos, listener) {
    if (!pos || !listener) return { pan: 0, gain: 1 };
    const dx = pos.x - listener.x, dz = pos.z - listener.z; const d = Math.hypot(dx, dz);
    if (d > 90) return null;
    const rel = Math.atan2(dx, dz) - listener.heading;
    return { pan: clamp(Math.sin(rel) * 0.8, -1, 1), gain: 1 / (1 + d / 14) };
  }

  return {
    dispose() { for (const voice of [...voices]) voice._dispose(); },
    get activeVoices() { return voices.size; },
    ui(name) { if (!E.ready) return; try { UI[name]?.(); } catch { /* ignore */ } },
    cast(element, pos, listener, scale = 1) {
      if (!E.ready) return; const s = spatial(pos, listener); if (!s) return;
      try { (CAST[element] || CAST.arcane)(chain(null, s.pan, s.gain * 0.9, 0.25), E.now() + 0.01, scale); } catch { /* ignore */ }
    },
    impact(element, pos, listener, crit = false) {
      if (!E.ready) return; const s = spatial(pos, listener); if (!s) return;
      try {
        const c = chain(null, s.pan, s.gain * (crit ? 1.2 : 0.8), 0.2); const t = E.now() + 0.01;
        tone(c, { f0: crit ? 160 : 120, f1: 45, t, d: 0.18, g: 0.22 });
        noise(c, { kind: 'pink', type: 'lowpass', f0: 2500, f1: 400, t, d: 0.12, g: 0.18 });
        (CAST[element] || (() => {}))(c, t, 0.45);
      } catch { /* ignore */ }
    },
    footstep(surface, speed = 1) {
      if (!E.ready) return;
      const c = chain(null, R(-0.12, 0.12), 0.5 + speed * 0.15); const t = E.now() + 0.005;
      switch (surface) {
        case 'snow': noise(c, { kind: 'white', f0: 2500, q: 0.7, t, a: 0.01, d: 0.12, g: 0.06 }); noise(c, { kind: 'pink', type: 'lowpass', f0: 500, t, d: 0.08, g: 0.08 }); break;
        case 'sand': noise(c, { kind: 'pink', type: 'lowpass', f0: 900, q: 0.5, t, a: 0.015, d: 0.12, g: 0.07 }); break;
        case 'water': noise(c, { kind: 'pink', type: 'bandpass', f0: 900, f1: 1800, q: 2, t, a: 0.01, d: 0.16, g: 0.08 }); break;
        case 'stone': tone(c, { f0: 180, f1: 90, t, d: 0.05, g: 0.08 }); noise(c, { f0: 3200, q: 3, t, a: 0.001, d: 0.03, g: 0.05 }); break;
        default: tone(c, { f0: 110, f1: 60, t, d: 0.07, g: 0.08 }); noise(c, { kind: 'pink', type: 'lowpass', f0: 1200, t, d: 0.06, g: 0.06 });
      }
    },
  };
}
