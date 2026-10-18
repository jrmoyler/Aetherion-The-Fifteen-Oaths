// WebAudio core: context (created on first user gesture), buses, procedural noise and reverb.
export function createEngine() {
  const E = {
    ac: null, master: null, music: null, sfx: null, amb: null, reverb: null, reverbSend: null, comp: null,
    noise: {}, ready: false, vol: { master: 0.8, music: 0.55, sfx: 0.8, ambience: 0.7 },
  };

  function makeNoise(ac, kind, seconds = 4) {
    const len = Math.floor(ac.sampleRate * seconds);
    const buf = ac.createBuffer(2, len, ac.sampleRate);
    for (let ch = 0; ch < 2; ch++) {
      const d = buf.getChannelData(ch);
      let b0 = 0, b1 = 0, b2 = 0, b3 = 0, b4 = 0, b5 = 0, b6 = 0, last = 0;
      for (let i = 0; i < len; i++) {
        const w = Math.random() * 2 - 1;
        if (kind === 'white') d[i] = w * 0.5;
        else if (kind === 'pink') {
          b0 = 0.99886 * b0 + w * 0.0555179; b1 = 0.99332 * b1 + w * 0.0750759; b2 = 0.969 * b2 + w * 0.153852;
          b3 = 0.8665 * b3 + w * 0.3104856; b4 = 0.55 * b4 + w * 0.5329522; b5 = -0.7616 * b5 - w * 0.016898;
          d[i] = (b0 + b1 + b2 + b3 + b4 + b5 + b6 + w * 0.5362) * 0.11; b6 = w * 0.115926;
        } else { last = (last + 0.02 * w) / 1.02; d[i] = last * 3.5; } // brown
      }
    }
    return buf;
  }

  function makeIR(ac, seconds = 2.8, decay = 3.2) {
    const len = Math.floor(ac.sampleRate * seconds);
    const buf = ac.createBuffer(2, len, ac.sampleRate);
    for (let ch = 0; ch < 2; ch++) {
      const d = buf.getChannelData(ch);
      for (let i = 0; i < len; i++) { const t = i / len; d[i] = (Math.random() * 2 - 1) * Math.pow(1 - t, decay) * (i < 80 ? i / 80 : 1); }
    }
    return buf;
  }

  E.unlock = () => {
    try {
      if (!E.ac) {
        const AC = window.AudioContext || window.webkitAudioContext;
        if (!AC) return false;
        const ac = new AC({ latencyHint: 'interactive' });
        E.ac = ac;
        E.comp = ac.createDynamicsCompressor();
        E.comp.threshold.value = -14; E.comp.knee.value = 12; E.comp.ratio.value = 3; E.comp.attack.value = 0.005; E.comp.release.value = 0.25;
        E.master = ac.createGain(); E.master.connect(E.comp); E.comp.connect(ac.destination);
        E.music = ac.createGain(); E.sfx = ac.createGain(); E.amb = ac.createGain();
        E.music.connect(E.master); E.sfx.connect(E.master); E.amb.connect(E.master);
        E.reverb = ac.createConvolver(); E.reverb.buffer = makeIR(ac);
        E.reverbSend = ac.createGain(); E.reverbSend.gain.value = 0.9;
        E.reverbSend.connect(E.reverb); E.reverb.connect(E.master);
        E.noise.white = makeNoise(ac, 'white'); E.noise.pink = makeNoise(ac, 'pink'); E.noise.brown = makeNoise(ac, 'brown');
        E.applyVolumes();
        E.ready = true;
      }
      if (E.ac.state === 'suspended') E.ac.resume();
      return true;
    } catch (err) { console.warn('[audio] unlock failed', err); return false; }
  };

  E.setVolumes = (v) => { Object.assign(E.vol, v); E.applyVolumes(); };
  E.applyVolumes = () => {
    if (!E.ac) return;
    const t = E.ac.currentTime;
    const sq = (x) => Math.max(0, Math.min(1, x)) ** 1.6; // perceptual curve
    E.master.gain.setTargetAtTime(sq(E.vol.master), t, 0.05);
    E.music.gain.setTargetAtTime(sq(E.vol.music) * 0.55, t, 0.05);
    E.sfx.gain.setTargetAtTime(sq(E.vol.sfx), t, 0.05);
    E.amb.gain.setTargetAtTime(sq(E.vol.ambience) * 0.7, t, 0.05);
  };

  /** Looping noise source. */
  E.noiseSrc = (kind = 'pink') => {
    const s = E.ac.createBufferSource(); s.buffer = E.noise[kind] || E.noise.pink; s.loop = true;
    s.loopStart = Math.random(); s.loopEnd = s.buffer.duration;
    return s;
  };
  E.now = () => (E.ac ? E.ac.currentTime : 0);
  E.mtof = (m) => 440 * Math.pow(2, (m - 69) / 12);
  return E;
}
