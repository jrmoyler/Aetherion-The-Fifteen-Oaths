// Generative ambient beds per biome: wind, surf, lava rumble, rain, synthesized birdsong,
// insects, thunder, chimes, industrial hum. Beds crossfade when the region changes.
const R = (a, b) => a + Math.random() * (b - a);

export const BIOME_BEDS = {
  volcanic: { wind: 0.35, rumble: 0.9, pops: 1 },
  glacial: { wind: 0.8, whistle: 0.6, creak: 0.6 },
  alpine: { wind: 1, whistle: 0.3, thunder: 0.5, crackle: 0.5 },
  coast: { surf: 1, wind: 0.35, gulls: 0.7 },
  canyon: { wind: 0.6, chimes: 0.6 },
  cliffs: { wind: 1, surf: 0.35, gulls: 0.4, whistle: 0.25 },
  forest: { birds: 1, leaves: 0.6, insects: 0.25, wind: 0.2 },
  marsh: { insects: 1, frogs: 0.8, rain: 0.25, wind: 0.15 },
  meadow: { birds: 0.8, leaves: 0.4, insects: 0.45, wind: 0.3 },
  highland: { wind: 0.75, hum: 0.25, chimes: 0.25 },
  badlands: { wind: 0.7, drone: 0.35 },
  crimson: { drone: 0.6, wind: 0.4, pulse: 0.5 },
  terraces: { chimes: 0.8, wind: 0.35 },
  plateau: { wind: 0.55, tick: 0.6 },
  industrial: { hum: 0.7, clank: 0.8, wind: 0.2 },
  title: { wind: 0.45, chimes: 0.25 },
};

export function createAmbience(E) {
  let bed = null;
  let weather = null; // {layer, kind}

  function envGain(start = 0) { const g = E.ac.createGain(); g.gain.value = start; return g; }

  // ---- continuous layers: return {out, stop, tick?}
  const LAYERS = {
    wind(level) {
      const src = E.noiseSrc('pink'); const bp = E.ac.createBiquadFilter(); bp.type = 'bandpass'; bp.frequency.value = 500; bp.Q.value = 0.6;
      const lp = E.ac.createBiquadFilter(); lp.type = 'lowpass'; lp.frequency.value = 1800;
      const g = envGain(level * 0.35); src.connect(bp); bp.connect(lp); lp.connect(g); src.start();
      return { out: g, stop: (t) => src.stop(t), tick: () => { const t = E.now(); const gust = R(0.4, 1.2); g.gain.setTargetAtTime(level * 0.35 * gust, t, R(1, 3)); bp.frequency.setTargetAtTime(R(320, 900) * (0.7 + gust * 0.4), t, R(1.5, 3)); }, every: [1.8, 4] };
    },
    whistle(level) {
      const src = E.noiseSrc('white'); const bp = E.ac.createBiquadFilter(); bp.type = 'bandpass'; bp.frequency.value = 1500; bp.Q.value = 18;
      const g = envGain(level * 0.12); src.connect(bp); bp.connect(g); src.start();
      return { out: g, stop: (t) => src.stop(t), tick: () => { const t = E.now(); bp.frequency.setTargetAtTime(R(900, 2400), t, R(2, 4)); g.gain.setTargetAtTime(level * R(0.04, 0.16), t, 2); }, every: [3, 6] };
    },
    surf(level) {
      const src = E.noiseSrc('brown'); const lp = E.ac.createBiquadFilter(); lp.type = 'lowpass'; lp.frequency.value = 500;
      const src2 = E.noiseSrc('white'); const hp = E.ac.createBiquadFilter(); hp.type = 'bandpass'; hp.frequency.value = 2500; hp.Q.value = 0.5;
      const foam = envGain(0); src2.connect(hp); hp.connect(foam);
      const g = envGain(level * 0.25); src.connect(lp); lp.connect(g); foam.connect(g); src.start(); src2.start();
      return { out: g, stop: (t) => { src.stop(t); src2.stop(t); }, tick: () => {
        const t = E.now(); const dur = R(5, 8);
        g.gain.cancelScheduledValues(t); g.gain.setValueAtTime(g.gain.value, t);
        g.gain.linearRampToValueAtTime(level * R(0.45, 0.7), t + dur * 0.45); g.gain.linearRampToValueAtTime(level * 0.18, t + dur);
        lp.frequency.setTargetAtTime(900, t, dur * 0.2); lp.frequency.setTargetAtTime(380, t + dur * 0.5, dur * 0.2);
        foam.gain.setValueAtTime(0, t + dur * 0.38); foam.gain.linearRampToValueAtTime(level * 0.08, t + dur * 0.5); foam.gain.linearRampToValueAtTime(0, t + dur * 0.95);
      }, every: [5.5, 8.5] };
    },
    rumble(level) {
      const src = E.noiseSrc('brown'); const lp = E.ac.createBiquadFilter(); lp.type = 'lowpass'; lp.frequency.value = 90; lp.Q.value = 2;
      const g = envGain(level * 0.6); src.connect(lp); lp.connect(g); src.start();
      return { out: g, stop: (t) => src.stop(t), tick: () => { const t = E.now(); g.gain.setTargetAtTime(level * R(0.4, 0.8), t, 2); lp.frequency.setTargetAtTime(R(60, 130), t, 2); }, every: [2, 5] };
    },
    rain(level) {
      const src = E.noiseSrc('white'); const hp = E.ac.createBiquadFilter(); hp.type = 'highpass'; hp.frequency.value = 1400;
      const lp = E.ac.createBiquadFilter(); lp.type = 'lowpass'; lp.frequency.value = 8000;
      const g = envGain(level * 0.22); src.connect(hp); hp.connect(lp); lp.connect(g); src.start();
      return { out: g, stop: (t) => src.stop(t), tick: () => g.gain.setTargetAtTime(level * R(0.16, 0.28), E.now(), 1.5), every: [2, 4] };
    },
    leaves(level) {
      const src = E.noiseSrc('pink'); const bp = E.ac.createBiquadFilter(); bp.type = 'bandpass'; bp.frequency.value = 3200; bp.Q.value = 0.8;
      const g = envGain(level * 0.05); src.connect(bp); bp.connect(g); src.start();
      return { out: g, stop: (t) => src.stop(t), tick: () => g.gain.setTargetAtTime(level * R(0.01, 0.1), E.now(), R(0.6, 2)), every: [1.2, 3] };
    },
    insects(level) {
      const o = E.ac.createOscillator(); o.type = 'sine'; o.frequency.value = R(4200, 5200);
      const am = E.ac.createGain(); am.gain.value = 0; const lfo = E.ac.createOscillator(); lfo.type = 'square'; lfo.frequency.value = R(24, 34);
      const lfoG = E.ac.createGain(); lfoG.gain.value = 0.5; lfo.connect(lfoG); lfoG.connect(am.gain);
      const g = envGain(level * 0.018); o.connect(am); am.connect(g); o.start(); lfo.start();
      return { out: g, stop: (t) => { o.stop(t); lfo.stop(t); }, tick: () => { const t = E.now(); g.gain.setTargetAtTime(Math.random() < 0.3 ? 0 : level * 0.018, t, 0.3); o.frequency.setTargetAtTime(R(4200, 5200), t, 1); }, every: [0.8, 2.5] };
    },
    hum(level) {
      const a = E.ac.createOscillator(); a.type = 'sawtooth'; a.frequency.value = 55;
      const b = E.ac.createOscillator(); b.type = 'sine'; b.frequency.value = 110.4;
      const lp = E.ac.createBiquadFilter(); lp.type = 'lowpass'; lp.frequency.value = 220;
      const g = envGain(level * 0.05); a.connect(lp); b.connect(lp); lp.connect(g); a.start(); b.start();
      return { out: g, stop: (t) => { a.stop(t); b.stop(t); }, tick: () => lp.frequency.setTargetAtTime(R(160, 320), E.now(), 2), every: [3, 6] };
    },
    drone(level) {
      const a = E.ac.createOscillator(); a.type = 'sawtooth'; a.frequency.value = 41.2;
      const b = E.ac.createOscillator(); b.type = 'sawtooth'; b.frequency.value = 41.2 * 1.498; b.detune.value = 7;
      const lp = E.ac.createBiquadFilter(); lp.type = 'lowpass'; lp.frequency.value = 160; lp.Q.value = 4;
      const g = envGain(level * 0.06); a.connect(lp); b.connect(lp); lp.connect(g); a.start(); b.start();
      return { out: g, stop: (t) => { a.stop(t); b.stop(t); }, tick: () => lp.frequency.setTargetAtTime(R(100, 300), E.now(), 3), every: [4, 8] };
    },
  };

  // ---- one-shot events scheduled at random intervals
  const EVENTS = {
    birds: { every: [1.5, 6], fn(out, lv) { // two-to-five-note chirp phrase, FM sine
      const t0 = E.now() + 0.05; const base = R(2200, 4200); const n = 2 + Math.floor(Math.random() * 4);
      const pan = E.ac.createStereoPanner(); pan.pan.value = R(-0.9, 0.9); pan.connect(out);
      for (let i = 0; i < n; i++) {
        const t = t0 + i * R(0.08, 0.16); const o = E.ac.createOscillator(); const g = E.ac.createGain();
        o.frequency.setValueAtTime(base * R(0.85, 1.2), t); o.frequency.exponentialRampToValueAtTime(base * R(1.1, 1.6), t + 0.05); o.frequency.exponentialRampToValueAtTime(base * R(0.7, 1), t + 0.09);
        g.gain.setValueAtTime(0, t); g.gain.linearRampToValueAtTime(lv * 0.05, t + 0.01); g.gain.exponentialRampToValueAtTime(0.0001, t + 0.1);
        o.connect(g); g.connect(pan); o.start(t); o.stop(t + 0.12);
      }
    } },
    gulls: { every: [5, 14], fn(out, lv) {
      const t = E.now() + 0.05; const o = E.ac.createOscillator(); o.type = 'sawtooth'; const bp = E.ac.createBiquadFilter(); bp.type = 'bandpass'; bp.frequency.value = 1600; bp.Q.value = 6;
      const g = E.ac.createGain(); const pan = E.ac.createStereoPanner(); pan.pan.value = R(-0.8, 0.8);
      o.frequency.setValueAtTime(1300, t); o.frequency.exponentialRampToValueAtTime(800, t + 0.45);
      g.gain.setValueAtTime(0, t); g.gain.linearRampToValueAtTime(lv * 0.03, t + 0.05); g.gain.exponentialRampToValueAtTime(0.0001, t + 0.5);
      o.connect(bp); bp.connect(g); g.connect(pan); pan.connect(out); o.start(t); o.stop(t + 0.55);
    } },
    frogs: { every: [1.2, 4], fn(out, lv) {
      const t = E.now() + 0.05; const o = E.ac.createOscillator(); o.type = 'square'; o.frequency.value = R(90, 150);
      const lp = E.ac.createBiquadFilter(); lp.type = 'lowpass'; lp.frequency.value = 600; const g = E.ac.createGain();
      const reps = 2 + Math.floor(Math.random() * 3);
      g.gain.setValueAtTime(0, t);
      for (let i = 0; i < reps; i++) { const s = t + i * 0.12; g.gain.linearRampToValueAtTime(lv * 0.05, s + 0.02); g.gain.linearRampToValueAtTime(0, s + 0.08); }
      o.connect(lp); lp.connect(g); g.connect(out); o.start(t); o.stop(t + reps * 0.12 + 0.1);
    } },
    pops: { every: [0.6, 3], fn(out, lv) { burst(out, 'brown', 'bandpass', R(200, 700), 3, 0.005, R(0.05, 0.14), lv * 0.4); } },
    crackle: { every: [3, 9], fn(out, lv) { for (let i = 0; i < 6; i++) setTimeout(() => burst(out, 'white', 'highpass', 3000, 1, 0.001, 0.02, lv * 0.12), i * R(15, 50)); } },
    creak: { every: [6, 16], fn(out, lv) {
      const t = E.now() + 0.05; const o = E.ac.createOscillator(); o.type = 'sawtooth'; o.frequency.setValueAtTime(R(60, 90), t); o.frequency.linearRampToValueAtTime(R(40, 70), t + 1.2);
      const bp = E.ac.createBiquadFilter(); bp.type = 'bandpass'; bp.frequency.value = 400; bp.Q.value = 8; const g = E.ac.createGain();
      g.gain.setValueAtTime(0, t); g.gain.linearRampToValueAtTime(lv * 0.05, t + 0.3); g.gain.linearRampToValueAtTime(0, t + 1.3);
      o.connect(bp); bp.connect(g); g.connect(out); g.connect(E.reverbSend); o.start(t); o.stop(t + 1.4);
    } },
    thunder: { every: [14, 40], fn(out, lv) {
      const t = E.now() + 0.05; const s = E.noiseSrc('brown'); const lp = E.ac.createBiquadFilter(); lp.type = 'lowpass';
      lp.frequency.setValueAtTime(900, t); lp.frequency.exponentialRampToValueAtTime(70, t + 4);
      const g = E.ac.createGain(); g.gain.setValueAtTime(0, t); g.gain.linearRampToValueAtTime(lv * 0.9, t + 0.08); g.gain.exponentialRampToValueAtTime(0.0001, t + R(3.5, 6));
      s.connect(lp); lp.connect(g); g.connect(out); g.connect(E.reverbSend); s.start(t); s.stop(t + 6.5);
    } },
    chimes: { every: [3, 10], fn(out, lv) {
      const scale = [0, 2, 4, 7, 9]; const base = 84;
      const n = 1 + Math.floor(Math.random() * 3);
      for (let i = 0; i < n; i++) bell(out, E.mtof(base + scale[Math.floor(Math.random() * 5)] + (Math.random() < 0.3 ? 12 : 0)), E.now() + 0.05 + i * R(0.15, 0.5), lv * 0.03, 3);
    } },
    clank: { every: [2, 7], fn(out, lv) {
      const t = E.now() + 0.05; const c = E.ac.createOscillator(); const m = E.ac.createOscillator(); const mg = E.ac.createGain();
      c.frequency.value = R(180, 400); m.frequency.value = c.frequency.value * 2.76; mg.gain.value = c.frequency.value * 3;
      m.connect(mg); mg.connect(c.frequency); const g = E.ac.createGain(); g.gain.setValueAtTime(lv * 0.06, t); g.gain.exponentialRampToValueAtTime(0.0001, t + 0.6);
      const pan = E.ac.createStereoPanner(); pan.pan.value = R(-0.7, 0.7);
      c.connect(g); g.connect(pan); pan.connect(out); g.connect(E.reverbSend); c.start(t); m.start(t); c.stop(t + 0.7); m.stop(t + 0.7);
    } },
    tick: { every: [0.9, 1.1], fn(out, lv) { const t = E.now() + 0.02; click(out, t, 3200, lv * 0.035); click(out, t + 0.5, 2400, lv * 0.03); } },
    pulse: { every: [1.1, 1.3], fn(out, lv) { const t = E.now() + 0.02; thump(out, t, 55, lv * 0.12); thump(out, t + 0.28, 50, lv * 0.08); } },
  };

  function burst(out, kind, ftype, f, q, a, d, gain, t = E.now() + 0.01) {
    const s = E.ac.createBufferSource(); s.buffer = E.noise[kind]; const flt = E.ac.createBiquadFilter(); flt.type = ftype; flt.frequency.value = f; flt.Q.value = q;
    const g = E.ac.createGain(); g.gain.setValueAtTime(0, t); g.gain.linearRampToValueAtTime(gain, t + a); g.gain.exponentialRampToValueAtTime(0.0001, t + a + d);
    s.connect(flt); flt.connect(g); g.connect(out); s.start(t, Math.random() * 2); s.stop(t + a + d + 0.05);
  }
  function bell(out, f, t, gain, dur) {
    for (const [mul, gm] of [[1, 1], [2.76, 0.4], [5.4, 0.2]]) {
      const o = E.ac.createOscillator(); o.frequency.value = f * mul; const g = E.ac.createGain();
      g.gain.setValueAtTime(0, t); g.gain.linearRampToValueAtTime(gain * gm, t + 0.005); g.gain.exponentialRampToValueAtTime(0.0001, t + dur / mul);
      o.connect(g); g.connect(out); g.connect(E.reverbSend); o.start(t); o.stop(t + dur);
    }
  }
  function click(out, t, f, gain) { burst(out, 'white', 'bandpass', f, 12, 0.001, 0.03, gain, t); }
  function thump(out, t, f, gain) {
    const o = E.ac.createOscillator(); o.frequency.setValueAtTime(f * 1.6, t); o.frequency.exponentialRampToValueAtTime(f, t + 0.08);
    const g = E.ac.createGain(); g.gain.setValueAtTime(0, t); g.gain.linearRampToValueAtTime(gain, t + 0.01); g.gain.exponentialRampToValueAtTime(0.0001, t + 0.3);
    o.connect(g); g.connect(out); o.start(t); o.stop(t + 0.35);
  }

  function startBed(name) {
    const spec = BIOME_BEDS[name] || BIOME_BEDS.meadow;
    const bus = E.ac.createGain(); bus.gain.value = 0; bus.connect(E.amb);
    const layers = []; const timers = [];
    let alive = true;
    for (const [k, lv] of Object.entries(spec)) {
      if (LAYERS[k]) {
        const L = LAYERS[k](lv); L.out.connect(bus); layers.push(L);
        if (L.tick) { const loop = () => { if (!alive) return; try { L.tick(); } catch { /* ignore */ } timers.push(setTimeout(loop, R(...L.every) * 1000)); }; loop(); }
      } else if (EVENTS[k]) {
        const ev = EVENTS[k];
        const loop = () => { if (!alive) return; if (!document.hidden) { try { ev.fn(bus, lv); } catch { /* ignore */ } } timers.push(setTimeout(loop, R(...ev.every) * 1000)); };
        timers.push(setTimeout(loop, R(0.3, 2) * 1000));
      }
    }
    const t = E.now(); bus.gain.setValueAtTime(0, t); bus.gain.linearRampToValueAtTime(1, t + 3);
    return {
      name,
      stop() {
        alive = false; timers.forEach(clearTimeout);
        const t2 = E.now(); bus.gain.cancelScheduledValues(t2); bus.gain.setValueAtTime(bus.gain.value, t2); bus.gain.linearRampToValueAtTime(0, t2 + 3);
        for (const L of layers) { try { L.stop(t2 + 3.2); } catch { /* ignore */ } }
        setTimeout(() => { try { bus.disconnect(); } catch { /* ignore */ } }, 3500);
      },
    };
  }

  return {
    dispose() { bed?.stop(); weather?.stop(); bed = null; weather = null; },
    setBiome(name) {
      if (!E.ready || bed?.name === name) return;
      bed?.stop(); bed = startBed(name);
    },
    setWeather(kind, intensity = 1) {
      if (!E.ready) return;
      if (weather) { weather.stop(); weather = null; }
      if (kind === 'rain' || kind === 'storm') weather = startBed(kind === 'storm' ? '__storm' : '__rain');
      void intensity;
    },
    oneShot: { burst, bell, click, thump },
    get current() { return bed?.name; },
  };
}
BIOME_BEDS.__rain = { rain: 1 };
BIOME_BEDS.__storm = { rain: 1.2, thunder: 1, wind: 0.6 };
