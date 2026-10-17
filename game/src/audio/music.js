// Evolving modal music: a slow pad, a sparse melodic voice and bell sprinkles. Each Oath owns a
// mode, root and instrument timbre; the music morphs (scale, tempo, pad) when the region changes.
const MODES = {
  ionian: [0, 2, 4, 5, 7, 9, 11], dorian: [0, 2, 3, 5, 7, 9, 10], phrygian: [0, 1, 3, 5, 7, 8, 10], lydian: [0, 2, 4, 6, 7, 9, 11],
  mixolydian: [0, 2, 4, 5, 7, 9, 10], aeolian: [0, 2, 3, 5, 7, 8, 10], locrian: [0, 1, 3, 5, 6, 8, 10],
  hirajoshi: [0, 2, 3, 7, 8], insen: [0, 1, 5, 7, 10], pentaMajor: [0, 2, 4, 7, 9], whole: [0, 2, 4, 6, 8, 10],
  harmonicMinor: [0, 2, 3, 5, 7, 8, 11], doubleHarmonic: [0, 1, 4, 5, 7, 8, 11],
};

export const PROFILES = {
  title: { mode: 'lydian', root: 48, voice: 'bowed', tempo: 56, density: 0.35, bells: 0.5 },
  'oath-01': { mode: 'phrygian', root: 38, voice: 'brass', tempo: 62, density: 0.4, bells: 0.1 },
  'oath-02': { mode: 'aeolian', root: 40, voice: 'glass', tempo: 52, density: 0.35, bells: 0.6 },
  'oath-03': { mode: 'lydian', root: 41, voice: 'pluck', tempo: 72, density: 0.5, bells: 0.3 },
  'oath-04': { mode: 'dorian', root: 45, voice: 'flute', tempo: 58, density: 0.4, bells: 0.3 },
  'oath-05': { mode: 'harmonicMinor', root: 36, voice: 'mallet', tempo: 60, density: 0.45, bells: 0.4 },
  'oath-06': { mode: 'pentaMajor', root: 43, voice: 'flute', tempo: 64, density: 0.45, bells: 0.2 },
  'oath-07': { mode: 'mixolydian', root: 38, voice: 'pluck', tempo: 66, density: 0.45, bells: 0.25 },
  'oath-08': { mode: 'locrian', root: 35, voice: 'reed', tempo: 54, density: 0.3, bells: 0.15 },
  'oath-09': { mode: 'ionian', root: 48, voice: 'bowed', tempo: 58, density: 0.35, bells: 0.5 },
  'oath-10': { mode: 'whole', root: 39, voice: 'glass', tempo: 50, density: 0.3, bells: 0.7 },
  'oath-11': { mode: 'insen', root: 37, voice: 'bowed', tempo: 48, density: 0.25, bells: 0.2 },
  'oath-12': { mode: 'doubleHarmonic', root: 38, voice: 'reed', tempo: 56, density: 0.35, bells: 0.15 },
  'oath-13': { mode: 'hirajoshi', root: 42, voice: 'mallet', tempo: 62, density: 0.4, bells: 0.5 },
  'oath-14': { mode: 'dorian', root: 45, voice: 'pluck', tempo: 76, density: 0.55, bells: 0.35 },
  'oath-15': { mode: 'aeolian', root: 40, voice: 'brass', tempo: 70, density: 0.45, bells: 0.1 },
};

export function createMusic(E) {
  let prof = PROFILES.title;
  let pending = null;
  let timer = null;
  let nextBeat = 0, beat = 0, degree = 0, chordIdx = 0;
  let pad = null;
  let bus = null;

  const scaleNote = (p, deg, oct = 0) => {
    const m = MODES[p.mode]; const n = m.length;
    const o = Math.floor(deg / n); const i = ((deg % n) + n) % n;
    return p.root + 12 * (o + oct) + m[i];
  };

  function voice(note, t, dur, vel, kind) {
    const f = E.mtof(note);
    const out = E.ac.createGain(); out.gain.value = 0; out.connect(bus); out.connect(E.reverbSend);
    const nodes = [];
    const osc = (type, freq, det = 0) => { const o = E.ac.createOscillator(); o.type = type; o.frequency.value = freq; o.detune.value = det; nodes.push(o); return o; };
    let attack = 0.02, release = dur;
    const lp = E.ac.createBiquadFilter(); lp.type = 'lowpass'; lp.connect(out);
    switch (kind) {
      case 'pluck': { const o = osc('triangle', f); const o2 = osc('square', f, 4); const g2 = E.ac.createGain(); g2.gain.value = 0.15; o.connect(lp); o2.connect(g2); g2.connect(lp);
        lp.frequency.setValueAtTime(f * 8, t); lp.frequency.exponentialRampToValueAtTime(f * 1.5, t + 0.4); attack = 0.004; release = Math.min(dur, 1.4); break; }
      case 'mallet': { const o = osc('sine', f); const o2 = osc('sine', f * 3.99); const g2 = E.ac.createGain(); g2.gain.setValueAtTime(0.4, t); g2.gain.exponentialRampToValueAtTime(0.001, t + 0.15);
        o.connect(lp); o2.connect(g2); g2.connect(lp); lp.frequency.value = 5000; attack = 0.003; release = Math.min(dur, 1.2); break; }
      case 'glass': { const o = osc('sine', f); const o2 = osc('sine', f * 2.01); const g2 = E.ac.createGain(); g2.gain.value = 0.25; o.connect(lp); o2.connect(g2); g2.connect(lp);
        lp.frequency.value = 6000; attack = 0.05; release = dur * 1.4; break; }
      case 'flute': { const o = osc('sine', f); const vib = osc('sine', 5.2); const vg = E.ac.createGain(); vg.gain.value = f * 0.006; vib.connect(vg); vg.connect(o.frequency);
        const n = E.noiseSrc('white'); nodes.push(n); const nb = E.ac.createBiquadFilter(); nb.type = 'bandpass'; nb.frequency.value = f * 2; nb.Q.value = 2; const ng = E.ac.createGain(); ng.gain.value = 0.05;
        n.connect(nb); nb.connect(ng); ng.connect(lp); o.connect(lp); lp.frequency.value = f * 6; attack = 0.12; break; }
      case 'reed': { const o = osc('sawtooth', f); const o2 = osc('square', f * 0.5, -6); const g2 = E.ac.createGain(); g2.gain.value = 0.2; o.connect(lp); o2.connect(g2); g2.connect(lp);
        lp.frequency.value = f * 3; lp.Q.value = 5; attack = 0.08; break; }
      case 'brass': { const o = osc('sawtooth', f); const o2 = osc('sawtooth', f, 9); o.connect(lp); o2.connect(lp);
        lp.frequency.setValueAtTime(f * 1.2, t); lp.frequency.linearRampToValueAtTime(f * 4, t + 0.25); lp.frequency.linearRampToValueAtTime(f * 2, t + dur); attack = 0.1; break; }
      default: { const o = osc('sawtooth', f, -5); const o2 = osc('sawtooth', f, 5); o.connect(lp); o2.connect(lp); lp.frequency.value = f * 2.5; attack = 0.35; release = dur * 1.3; } // bowed
    }
    const peak = vel * 0.13;
    out.gain.setValueAtTime(0, t); out.gain.linearRampToValueAtTime(peak, t + attack);
    out.gain.setTargetAtTime(peak * 0.7, t + attack, dur * 0.3);
    out.gain.setTargetAtTime(0.0001, t + Math.max(attack, release * 0.6), release * 0.35);
    const end = t + release * 1.8 + 0.4;
    nodes.forEach((n) => { n.start(t); n.stop(end); });
    setTimeout(() => { try { out.disconnect(); } catch { /* ignore */ } }, (end - E.now() + 0.5) * 1000);
  }

  function bell(note, t, vel) {
    const f = E.mtof(note);
    for (const [mul, gm, d] of [[1, 1, 3.2], [2.76, 0.35, 1.6], [5.4, 0.15, 0.8]]) {
      const o = E.ac.createOscillator(); o.frequency.value = f * mul; const g = E.ac.createGain();
      g.gain.setValueAtTime(0, t); g.gain.linearRampToValueAtTime(vel * 0.05 * gm, t + 0.004); g.gain.exponentialRampToValueAtTime(0.0001, t + d);
      o.connect(g); g.connect(bus); g.connect(E.reverbSend); o.start(t); o.stop(t + d + 0.05);
    }
  }

  function startPad(p, t) {
    const old = pad;
    const g = E.ac.createGain(); g.gain.value = 0; g.connect(bus); g.connect(E.reverbSend);
    const lp = E.ac.createBiquadFilter(); lp.type = 'lowpass'; lp.frequency.value = 520; lp.Q.value = 0.6; lp.connect(g);
    const lfo = E.ac.createOscillator(); lfo.frequency.value = 0.07; const lg = E.ac.createGain(); lg.gain.value = 220; lfo.connect(lg); lg.connect(lp.frequency); lfo.start(t);
    const oscs = [];
    const chord = [0, 4, 7].map((d) => scaleNote(p, chordIdx + d, 0));
    chord.forEach((n, i) => {
      for (const det of [-7, 6]) { const o = E.ac.createOscillator(); o.type = i === 0 ? 'sawtooth' : 'triangle'; o.frequency.value = E.mtof(n); o.detune.value = det; o.connect(lp); o.start(t); oscs.push(o); }
    });
    g.gain.setValueAtTime(0, t); g.gain.linearRampToValueAtTime(0.045, t + 4);
    pad = { g, oscs, lfo, notes: chord };
    if (old) { old.g.gain.cancelScheduledValues(t); old.g.gain.setValueAtTime(old.g.gain.value, t); old.g.gain.linearRampToValueAtTime(0, t + 4); old.oscs.forEach((o) => o.stop(t + 4.2)); old.lfo.stop(t + 4.2); }
  }

  function schedule() {
    if (!E.ready || E.ac.state !== 'running') return;
    const ahead = E.now() + 0.45;
    while (nextBeat < ahead) {
      const t = Math.max(nextBeat, E.now() + 0.02);
      const spb = 60 / prof.tempo;
      // chord change every 8 beats; region changes land here
      if (beat % 8 === 0) {
        if (pending) { prof = pending; pending = null; }
        const prog = [0, 3, 5, 4, 0, 5, 3, 6];
        chordIdx = prog[(beat / 8) % prog.length];
        startPad(prof, t);
      }
      // melody: random walk on the mode with rests and phrase shape
      if (Math.random() < prof.density * (beat % 4 === 0 ? 1.4 : 1)) {
        degree += [-2, -1, -1, 0, 1, 1, 2, 3][Math.floor(Math.random() * 8)];
        if (degree < 2) degree += 2; if (degree > 13) degree -= 3;
        const dur = spb * [1, 1, 2, 2, 3, 4][Math.floor(Math.random() * 6)];
        voice(scaleNote(prof, degree + chordIdx, 1), t, dur, 0.5 + Math.random() * 0.4, prof.voice);
      }
      if (Math.random() < prof.bells * 0.12) bell(scaleNote(prof, chordIdx + [0, 2, 4, 7][Math.floor(Math.random() * 4)], 3), t + spb * 0.5, 0.6);
      nextBeat = t + spb; beat++;
    }
  }

  return {
    start() {
      if (!E.ready || timer) return;
      bus = E.ac.createGain(); bus.gain.value = 1; bus.connect(E.music);
      nextBeat = E.now() + 0.3; beat = 0;
      timer = setInterval(() => { try { schedule(); } catch (e) { console.warn('[audio] music', e); } }, 120);
    },
    setProfile(key) { const p = PROFILES[key]; if (p && p !== prof) pending = p; },
    stop() { clearInterval(timer); timer = null; },
  };
}
