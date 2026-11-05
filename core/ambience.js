// Generated ambience for full-screen stream scenes. WebAudio only, no samples.
// createAmbience(ac, opts) -> { output, set, setMaster, start, stop }
// Works on a live AudioContext (lookahead timer) and on an OfflineAudioContext
// (all events pre-scheduled for the whole render length on start()).

const rnd = (a, b) => a + Math.random() * (b - a);
const pick = (a) => a[Math.floor(Math.random() * a.length)];

// Per-layer calibration so a slider at 1 means "about equally present".
const CAL = { candle: 0.33, hearth: 0.55, quill: 0.6 }; // -5 dB after the real-browser level check (2026-11-05: RMS was -19…-22 dBFS at master 1)
const LAYER_NAMES = ['candle', 'hearth', 'quill'];

export const PRESETS = {
  starting: { layers: { candle: 0.55, hearth: 0.6, quill: 0.15 }, master: 0.6 },
  brb: { layers: { candle: 0.4, hearth: 0.45, quill: 0.6 }, master: 0.55 },
  ending: { layers: { candle: 0.65, hearth: 0.7, quill: 0 }, master: 0.55 },
};

// ---- noise buffers (12 s, seam cross-faded, cached per context) ----
const NOISE_SECONDS = 12;
const noiseCache = new WeakMap();

function makeNoise(ac, kind) {
  let c = noiseCache.get(ac);
  if (!c) { c = {}; noiseCache.set(ac, c); }
  if (c[kind]) return c[kind];
  const sr = ac.sampleRate;
  const n = Math.floor(NOISE_SECONDS * sr);
  const fade = Math.floor(0.6 * sr);
  const total = n + fade;
  const tmp = new Float32Array(total);
  if (kind === 'pink') {
    let b0 = 0, b1 = 0, b2 = 0, b3 = 0, b4 = 0, b5 = 0, b6 = 0;
    for (let i = 0; i < total; i++) {
      const w = Math.random() * 2 - 1;
      b0 = 0.99886 * b0 + w * 0.0555179;
      b1 = 0.99332 * b1 + w * 0.0750759;
      b2 = 0.96900 * b2 + w * 0.1538520;
      b3 = 0.86650 * b3 + w * 0.3104856;
      b4 = 0.55000 * b4 + w * 0.5329522;
      b5 = -0.7616 * b5 - w * 0.0168980;
      tmp[i] = (b0 + b1 + b2 + b3 + b4 + b5 + b6 + w * 0.5362) * 0.11;
      b6 = w * 0.115926;
    }
  } else {
    for (let i = 0; i < total; i++) tmp[i] = (Math.random() * 2 - 1) * 0.8;
  }
  // equal-power cross-fade of the tail into the head -> loop with no seam
  const buf = ac.createBuffer(1, n, sr);
  const d = buf.getChannelData(0);
  d.set(tmp.subarray(0, n));
  for (let i = 0; i < fade; i++) {
    const x = i / fade;
    d[i] = tmp[i] * Math.sin(x * Math.PI / 2) + tmp[n + i] * Math.cos(x * Math.PI / 2);
  }
  c[kind] = buf;
  return buf;
}

export function createAmbience(ac, { layers = { candle: 0.5, hearth: 0.5, quill: 0 }, master = 0.6 } = {}) {
  const offline = typeof OfflineAudioContext !== 'undefined' && ac instanceof OfflineAudioContext;
  const vols = { candle: 0, hearth: 0, quill: 0, ...layers };

  const output = ac.createGain();
  const masterGain = ac.createGain();
  masterGain.gain.value = master;
  const limiter = ac.createDynamicsCompressor(); // safety net only
  limiter.threshold.value = -12;
  limiter.knee.value = 6;
  limiter.ratio.value = 12;
  limiter.attack.value = 0.003;
  limiter.release.value = 0.25;
  const fadeGain = ac.createGain();
  fadeGain.gain.value = 0;
  masterGain.connect(limiter);
  limiter.connect(fadeGain);
  fadeGain.connect(output);

  const layerGain = {};
  for (const name of LAYER_NAMES) {
    const g = ac.createGain();
    g.gain.value = vols[name] * CAL[name];
    g.connect(masterGain);
    layerGain[name] = g;
  }

  let running = false;
  let timer = null;
  let live = []; // long-lived sources, stopped on stop()
  let state = null;

  const white = () => makeNoise(ac, 'white');
  const pink = () => makeNoise(ac, 'pink');

  function loopNoise(buf, dest, chain = []) {
    const src = ac.createBufferSource();
    src.buffer = buf;
    src.loop = true;
    let node = src;
    for (const n of chain) { node.connect(n); node = n; }
    node.connect(dest);
    src.start(0, Math.random() * NOISE_SECONDS);
    live.push(src);
    return src;
  }

  function filt(type, freq, q = 0.7) {
    const f = ac.createBiquadFilter();
    f.type = type; f.frequency.value = freq; f.Q.value = q;
    return f;
  }

  // One short filtered noise burst with a >=5 ms attack and a smooth decay.
  function burst(dest, t, { type = 'bandpass', freq = 2000, q = 1.5, attack = 0.006, decay = 0.05, level = 0.3, freqEnd = null, buf = null }) {
    const src = ac.createBufferSource();
    src.buffer = buf || white();
    const f = filt(type, freq, q);
    if (freqEnd) {
      f.frequency.setValueAtTime(freq, t);
      f.frequency.linearRampToValueAtTime(freqEnd, t + attack + decay);
    }
    const g = ac.createGain();
    g.gain.setValueAtTime(0, t);
    g.gain.linearRampToValueAtTime(level, t + attack);
    g.gain.setTargetAtTime(0, t + attack, decay / 5);
    src.connect(f); f.connect(g); g.connect(dest);
    src.start(t, Math.random() * (NOISE_SECONDS - 2));
    src.stop(t + attack + decay * 1.4 + 0.02);
  }

  function tone(dest, t, freq, level, decay) {
    const o = ac.createOscillator();
    o.type = 'sine';
    o.frequency.value = freq;
    const g = ac.createGain();
    g.gain.setValueAtTime(0, t);
    g.gain.linearRampToValueAtTime(level, t + 0.005);
    g.gain.setTargetAtTime(0, t + 0.005, decay / 5);
    o.connect(g); g.connect(dest);
    o.start(t);
    o.stop(t + decay * 1.4 + 0.02);
  }

  const audible = (name) => vols[name] * CAL[name] > 0.002;

  // ---------- layers: each has init(t0) and step(t) -> next time ----------
  const L = {};

  L.candle = {
    init() {
      const dest = layerGain.candle;
      this.flame = ac.createGain();
      this.flame.gain.value = 0.3;
      this.flame.connect(dest);
      loopNoise(pink(), this.flame, [filt('lowpass', 420, 0.5)]);
      // faint airy shimmer of the flame
      this.air = ac.createGain();
      this.air.gain.value = 0.05;
      this.air.connect(dest);
      loopNoise(white(), this.air, [filt('bandpass', 1600, 0.8)]);
    },
    step(t) {
      const now = Math.max(t, ac.currentTime);
      const target = rnd(0.08, 0.7);
      this.flame.gain.setTargetAtTime(target, now, rnd(0.08, 0.25));
      this.air.gain.setTargetAtTime(target * 0.12, now, 0.2);
      if (t >= this.popAt && audible('candle')) {
        burst(layerGain.candle, t, { freq: rnd(2200, 4200), q: 2, attack: 0.005, decay: rnd(0.012, 0.03), level: rnd(0.12, 0.3) });
        this.popAt = t + rnd(6, 20);
      }
      return t + rnd(0.12, 0.4);
    },
    first(t0) { this.popAt = t0 + rnd(3, 10); },
  };

  L.hearth = {
    init() {
      const dest = layerGain.hearth;
      this.roar = ac.createGain();
      this.roar.gain.value = 0.55;
      this.roar.connect(dest);
      loopNoise(pink(), this.roar, [filt('lowpass', 260, 0.6)]);
      this.body = ac.createGain();
      this.body.gain.value = 0.08;
      this.body.connect(dest);
      loopNoise(pink(), this.body, [filt('bandpass', 700, 0.5)]);
      this.hiss = ac.createGain();
      this.hiss.gain.value = 0.012;
      this.hiss.connect(dest);
      loopNoise(white(), this.hiss, [filt('highpass', 6000, 0.7)]);
    },
    first(t0) { this.nextThump = t0 + rnd(10, 30); this.nextSwell = t0; },
    step(t) {
      const now = Math.max(t, ac.currentTime);
      if (t >= this.nextSwell) {
        this.roar.gain.setTargetAtTime(rnd(0.35, 0.8), now, rnd(0.8, 2));
        this.hiss.gain.setTargetAtTime(rnd(0.006, 0.02), now, rnd(1, 3));
        this.nextSwell = t + rnd(1.5, 4);
      }
      if (audible('hearth')) {
        // a cluster of crackles
        const count = pick([1, 1, 2, 3, 4, 6]);
        let tt = t;
        const loud = rnd(0.15, 0.7);
        for (let i = 0; i < count; i++) {
          burst(layerGain.hearth, tt, {
            freq: rnd(700, 5500), q: rnd(1, 3.5),
            attack: 0.005, decay: rnd(0.008, 0.06),
            level: loud * rnd(0.3, 1), freqEnd: rnd(500, 4000),
          });
          tt += rnd(0.01, 0.09);
        }
        if (t >= this.nextThump) {
          burst(layerGain.hearth, t, { type: 'lowpass', freq: rnd(120, 200), q: 0.8, attack: 0.012, decay: rnd(0.25, 0.45), level: rnd(0.9, 1.4), buf: pink() });
          this.nextThump = t + rnd(20, 60);
        }
      }
      return t + rnd(0.25, 2.6);
    },
  };

  L.quill = {
    init() { },
    first(t0) {
      this.wordsLeft = Math.floor(rnd(3, 8));
      this.nextDip = t0 + rnd(15, 40);
    },
    step(t) {
      // one word = 3..7 strokes; returns time of the next word
      const strokes = Math.floor(rnd(3, 8));
      let tt = t;
      if (audible('quill')) {
        for (let i = 0; i < strokes; i++) {
          const dur = rnd(0.06, 0.18);
          const up = Math.random() < 0.5;
          burst(layerGain.quill, tt, {
            freq: up ? rnd(2200, 3200) : rnd(3200, 4500), freqEnd: up ? rnd(3200, 4600) : rnd(1800, 2800),
            q: rnd(1.2, 2.5), attack: 0.012, decay: dur, level: rnd(0.35, 0.9),
          });
          tt += dur + rnd(0.04, 0.1);
        }
      } else {
        tt += strokes * 0.2;
      }
      let next = tt + rnd(0.25, 0.6);
      this.wordsLeft -= 1;
      if (this.wordsLeft <= 0) { // thinking pause
        next += rnd(1.5, 4);
        this.wordsLeft = Math.floor(rnd(3, 9));
        if (audible('quill') && next - 0.4 >= this.nextDip) {
          const td = tt + rnd(0.3, 0.7);
          burst(layerGain.quill, td, { type: 'lowpass', freq: 900, q: 0.7, attack: 0.008, decay: 0.05, level: 0.5 });
          const base = rnd(2300, 2700);
          tone(layerGain.quill, td + 0.03, base, 0.22, 0.16);
          tone(layerGain.quill, td + 0.03, base * 1.52, 0.12, 0.1);
          tone(layerGain.quill, td + 0.03, base * 2.31, 0.06, 0.06);
          this.nextDip = next + rnd(20, 50);
        }
      }
      return next;
    },
  };

  function pump(until) {
    for (const name of LAYER_NAMES) {
      const l = state[name];
      let guard = 0;
      while (l.next < until && guard++ < 5000) l.next = L[name].step(l.next);
    }
  }

  function start() {
    if (running) return;
    running = true;
    live = [];
    const t0 = ac.currentTime + 0.05;
    state = {};
    for (const name of LAYER_NAMES) {
      L[name].init();
      L[name].first(t0);
      state[name] = { next: t0 + rnd(0.05, 0.6) };
    }
    fadeGain.gain.cancelScheduledValues(ac.currentTime);
    fadeGain.gain.setValueAtTime(0, ac.currentTime);
    fadeGain.gain.linearRampToValueAtTime(1, ac.currentTime + 1.5);
    if (offline) {
      pump(ac.length / ac.sampleRate + 1);
    } else {
      pump(ac.currentTime + 4);
      timer = setInterval(() => pump(ac.currentTime + 4), 500);
    }
  }

  function stop(fadeMs = 800) {
    if (!running) return;
    running = false;
    if (timer) { clearInterval(timer); timer = null; }
    const now = ac.currentTime;
    fadeGain.gain.cancelScheduledValues(now);
    fadeGain.gain.setValueAtTime(fadeGain.gain.value, now);
    fadeGain.gain.linearRampToValueAtTime(0, now + Math.max(0.02, fadeMs / 1000));
    const old = live;
    live = [];
    const stopAt = now + fadeMs / 1000 + 0.1;
    for (const s of old) { try { s.stop(stopAt); } catch (e) { /* already stopped */ } }
  }

  function set(layer, v) {
    if (!(layer in layerGain)) return;
    vols[layer] = Math.min(1, Math.max(0, v));
    layerGain[layer].gain.setTargetAtTime(vols[layer] * CAL[layer], ac.currentTime, 0.05);
  }

  function setMaster(v) {
    masterGain.gain.setTargetAtTime(Math.min(1, Math.max(0, v)), ac.currentTime, 0.05);
  }

  return { output, set, setMaster, start, stop };
}
