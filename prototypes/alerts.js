/* F3 Alerts (round 2): four clearly different objects on the campaign table.
   follow   -> small brass tag hung on a walnut rail by one nail (one hammer tap)
   sub      -> walnut plaque, large brass plate, velvet ribbon + red wax seal (crossed swords / shield)
   bits     -> gold coins onto a brass tray; <100 a few, 100-999 a pile, 1000+ a chest opening
   donation -> sealed scroll: wax breaks, parchment unrolls, the message is written in ink
   URL: ?alert=follow|sub|gift|bits|donation &name= &bits= &amount= &msg= (msg=long for a sample)
        &tier=1|2|3|prime &months= &gift=N &sound=1 &shot=1&t=<s> */
import { createWarTable, makeWoodCanvases, fitStage, THREE, _util } from './shared/war-table.js';
import { RoundedBoxGeometry } from 'three/addons/geometries/RoundedBoxGeometry.js';

const q = new URLSearchParams(location.search);
const SHOT = q.get('shot') === '1';
const SOUND = q.get('sound') === '1';
const NAME = q.get('name') || 'Bogdan_RO';
const SHOT_T = +(q.get('t') || 3);
const LONG_MSG = 'GG on that Arabia game! The scout rush into a fast castle was brilliant, and the trebuchet push at the end had the whole chat on its feet. Keep the campaign going, commander, here is a little gold for the war chest. Greetings from Cluj!';
const MSG = q.get('msg') === 'long' ? LONG_MSG : (q.get('msg') || 'Great stream, commander! Here is some gold for the next castle.');
if (SHOT) document.body.classList.add('shot');
if (q.get('bg') === '0') document.body.classList.add('nobg');
fitStage(document.getElementById('stage'));

const { makeNoise2D } = _util;
const $ = (s) => document.querySelector(s);
const clamp01 = (v) => Math.min(1, Math.max(0, v));
const smooth = (a, b, x) => { const t = clamp01((x - a) / (b - a)); return t * t * (3 - 2 * t); };
const easeOut = (x) => 1 - Math.pow(1 - clamp01(x), 3);
const easeIn = (x) => { x = clamp01(x); return x * x; };
const easeInOut = (x) => { x = clamp01(x); return x < 0.5 ? 4 * x * x * x : 1 - Math.pow(-2 * x + 2, 3) / 2; };
const lerp = (a, b, t) => a + (b - a) * t;
const rng = (seed) => { let s = seed >>> 0 || 1; return () => { s = (s * 16807) % 2147483647; return s / 2147483647; }; };

/* ------------------------------------------------------------------ texture helpers */
function canvas(w, h) { const c = document.createElement('canvas'); c.width = w; c.height = h; return c; }
function canvasTex(c, srgb, rep) {
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = srgb ? THREE.SRGBColorSpace : THREE.NoColorSpace;
  t.anisotropy = 8;
  if (rep) { t.wrapS = t.wrapT = THREE.RepeatWrapping; t.repeat.set(rep[0], rep[1]); }
  t.needsUpdate = true; return t;
}
function softTex(inner = 'rgba(255,214,150,1)', mid = 'rgba(255,170,80,0.38)', outer = 'rgba(255,140,40,0)') {
  const c = canvas(128, 128), g = c.getContext('2d'), gr = g.createRadialGradient(64, 64, 0, 64, 64, 64);
  gr.addColorStop(0, inner); gr.addColorStop(0.3, mid); gr.addColorStop(1, outer);
  g.fillStyle = gr; g.fillRect(0, 0, 128, 128); return canvasTex(c, true);
}
function woodMat(seed, dark, light, rep, coat = 1) {
  const w = makeWoodCanvases({ width: 512, height: 256, rings: 6, warp: 1.6, seed, dark, light });
  return new THREE.MeshPhysicalMaterial({
    map: canvasTex(w.color, true, rep), roughnessMap: canvasTex(w.rough, false, rep), roughness: 1,
    bumpMap: canvasTex(w.bump, false, rep), bumpScale: 0.8, clearcoat: coat, clearcoatRoughness: 0.14,
  });
}
let _brass = null;
function brassMat(color = 0xb48a50, rough = 0.32) {
  if (!_brass) { // shared micro-scratch for brass parts
    const c = canvas(256, 256), g = c.getContext('2d'), r = rng(11);
    g.fillStyle = '#808080'; g.fillRect(0, 0, 256, 256);
    for (let i = 0; i < 260; i++) { const v = 90 + r() * 90; g.strokeStyle = `rgba(${v},${v},${v},0.35)`; g.beginPath(); const x = r() * 256, y = r() * 256; g.moveTo(x, y); g.lineTo(x + (r() - 0.5) * 60, y + (r() - 0.5) * 8); g.stroke(); }
    _brass = canvasTex(c, false, [2, 2]);
  }
  return new THREE.MeshPhysicalMaterial({ color, metalness: 1, roughness: rough, roughnessMap: _brass, bumpMap: _brass, bumpScale: 0.25, clearcoat: 0.25, clearcoatRoughness: 0.3 });
}

/* brushed brass with engraved content: draw(engrave) paints into colour/bump/roughness at once */
function engravedBrass(W, H, seed, draw) {
  const col = canvas(W, H), bmp = canvas(W, H), rgh = canvas(W, H);
  const gc = col.getContext('2d'), gb = bmp.getContext('2d'), gr = rgh.getContext('2d');
  gc.fillStyle = '#fff'; gc.fillRect(0, 0, W, H);
  gb.fillStyle = '#9a9a9a'; gb.fillRect(0, 0, W, H);
  gr.fillStyle = '#6a6a6a'; gr.fillRect(0, 0, W, H);
  const r = rng(seed);
  for (let i = 0; i < W * 0.6; i++) {
    const y = r() * H, x = r() * W, l = 100 + r() * 700, v = 110 + r() * 90;
    gb.strokeStyle = `rgba(${v},${v},${v},0.16)`; gb.lineWidth = 1; gb.beginPath(); gb.moveTo(x, y); gb.lineTo(x + l, y + (r() - 0.5) * 2); gb.stroke();
    gr.strokeStyle = `rgba(${v + 40},${v + 40},${v + 40},0.12)`; gr.beginPath(); gr.moveTo(x, y); gr.lineTo(x + l, y); gr.stroke();
  }
  // darker tarnish towards the edges + a few fingerprints of patina
  const vg = gc.createRadialGradient(W / 2, H / 2, H * 0.3, W / 2, H / 2, W * 0.62);
  vg.addColorStop(0, 'rgba(0,0,0,0)'); vg.addColorStop(1, 'rgba(60,38,10,0.32)'); gc.fillStyle = vg; gc.fillRect(0, 0, W, H);
  for (let i = 0; i < 5; i++) { const x = r() * W, y = r() * H, rr = 30 + r() * 60; const p = gc.createRadialGradient(x, y, 0, x, y, rr); p.addColorStop(0, 'rgba(70,50,20,0.10)'); p.addColorStop(1, 'rgba(70,50,20,0)'); gc.fillStyle = p; gc.fillRect(x - rr, y - rr, rr * 2, rr * 2); }
  const engrave = (fn) => {
    gc.save(); gc.fillStyle = 'rgb(52,34,10)'; gc.strokeStyle = 'rgb(52,34,10)'; fn(gc); gc.restore();
    gb.save(); gb.fillStyle = '#101010'; gb.strokeStyle = '#101010'; fn(gb); gb.restore();
    gr.save(); gr.fillStyle = '#e0e0e0'; gr.strokeStyle = '#e0e0e0'; fn(gr); gr.restore();
  };
  draw(engrave, W, H);
  return { col, bmp, rgh };
}
const spW = (ctx, str, sp) => { let w = 0; for (const ch of str) w += ctx.measureText(ch).width + sp; return w - sp; };
const spaced = (ctx, str, x, y, sp) => { ctx.textAlign = 'left'; let cx = x; for (const ch of str) { ctx.fillText(ch, cx, y); cx += ctx.measureText(ch).width + sp; } };
function fitFont(ctx, str, sp, max, size, min, fam) { ctx.font = `${fam.replace('$', size)}`; let w = spW(ctx, str, sp); while (w > max && size > min) { size -= 3; ctx.font = fam.replace('$', size); w = spW(ctx, str, sp); } return w; }
function brassMaterial(cv, opts = {}) {
  return new THREE.MeshPhysicalMaterial({
    color: opts.color ?? 0xd9b373, metalness: 1, roughness: 0.4, clearcoat: 0.25, clearcoatRoughness: 0.25,
    map: canvasTex(cv.col, true), bumpMap: canvasTex(cv.bmp, false), roughnessMap: canvasTex(cv.rgh, false), bumpScale: opts.bump ?? 2.2,
  });
}

/* wax seal height + alpha; device: 'swords' (crossed swords behind a heater shield) or 'star' */
function sealCanvases(device, seed = 3) {
  const S = 512, hc = canvas(S, S), ac = canvas(S, S);
  const h = hc.getContext('2d'), al = ac.getContext('2d');
  const blob = (ctx, r, fill, blur = 0) => {
    ctx.save(); if (blur) ctx.filter = `blur(${blur}px)`; ctx.fillStyle = fill; ctx.beginPath();
    for (let i = 0; i <= 120; i++) {
      const a = (i / 120) * Math.PI * 2;
      const k = 1 + 0.04 * Math.sin(a * 5 + seed) + 0.028 * Math.sin(a * 9 + 0.4 * seed) + 0.016 * Math.sin(a * 17 + 2);
      const x = S / 2 + Math.cos(a) * r * k, y = S / 2 + Math.sin(a) * r * k;
      i ? ctx.lineTo(x, y) : ctx.moveTo(x, y);
    }
    ctx.closePath(); ctx.fill(); ctx.restore();
  };
  al.fillStyle = '#000'; al.fillRect(0, 0, S, S); blob(al, 232, '#fff');
  h.fillStyle = '#000'; h.fillRect(0, 0, S, S);
  blob(h, 228, '#8a8a8a', 16);
  h.save(); h.filter = 'blur(5px)'; h.strokeStyle = '#d4d4d4'; h.lineWidth = 18; h.beginPath(); h.arc(S / 2, S / 2, 170, 0, Math.PI * 2); h.stroke(); h.restore();
  h.save(); h.filter = 'blur(4px)'; h.fillStyle = '#464646'; h.beginPath(); h.arc(S / 2, S / 2, 156, 0, Math.PI * 2); h.fill(); h.restore();
  // ring of beads inside the rim
  h.save(); h.filter = 'blur(1.5px)'; h.fillStyle = '#9c9c9c';
  for (let i = 0; i < 40; i++) { const a = i / 40 * Math.PI * 2; h.beginPath(); h.arc(S / 2 + Math.cos(a) * 140, S / 2 + Math.sin(a) * 140, 4.5, 0, Math.PI * 2); h.fill(); }
  h.restore();
  h.save(); h.translate(S / 2, S / 2); h.filter = 'blur(1.6px)';
  if (device === 'swords') {
    const sword = (rot) => {
      h.save(); h.rotate(rot);
      h.fillStyle = '#a8a8a8';
      h.beginPath(); h.moveTo(-9, 70); h.lineTo(-9, -96); h.lineTo(0, -122); h.lineTo(9, -96); h.lineTo(9, 70); h.closePath(); h.fill(); // blade
      h.fillStyle = '#c8c8c8'; h.fillRect(-2, -100, 4, 160);                                     // fuller ridge
      h.fillStyle = '#d6d6d6'; h.beginPath(); h.roundRect(-38, 66, 76, 13, 5); h.fill();          // cross-guard
      h.fillStyle = '#b0b0b0'; h.fillRect(-6, 78, 12, 36);                                      // grip
      h.fillStyle = '#d6d6d6'; h.beginPath(); h.arc(0, 120, 11, 0, Math.PI * 2); h.fill();      // pommel
      h.restore();
    };
    sword(-0.62); sword(0.62);
    // heater shield in front
    const shield = (scale, fill) => {
      h.save(); h.scale(scale, scale); h.fillStyle = fill; h.beginPath();
      h.moveTo(-62, -64); h.lineTo(62, -64); h.lineTo(62, -6);
      h.bezierCurveTo(62, 44, 30, 74, 0, 92); h.bezierCurveTo(-30, 74, -62, 44, -62, -6); h.closePath(); h.fill(); h.restore();
    };
    shield(1.08, '#5a5a5a'); shield(1.0, '#c4c4c4'); shield(0.86, '#a2a2a2');
    // chevron + star device on the shield (original)
    h.fillStyle = '#d8d8d8';
    h.beginPath(); h.moveTo(-46, 30); h.lineTo(0, -6); h.lineTo(46, 30); h.lineTo(46, 46); h.lineTo(0, 10); h.lineTo(-46, 46); h.closePath(); h.fill();
    star(h, 0, -36, 15, 6.5, 5, '#dcdcdc');
  } else {
    star(h, 0, 0, 92, 38, 8, '#c8c8c8');
    h.fillStyle = '#9a9a9a'; h.beginPath(); h.arc(0, 0, 26, 0, Math.PI * 2); h.fill();
    star(h, 0, 0, 20, 9, 8, '#dcdcdc');
  }
  h.restore();
  return { hc, ac };
}
function star(g, x, y, R, r, n, fill) {
  g.fillStyle = fill; g.beginPath();
  for (let i = 0; i < n * 2; i++) { const a = -Math.PI / 2 + i * Math.PI / n, rr = i % 2 ? r : R; g.lineTo(x + Math.cos(a) * rr, y + Math.sin(a) * rr); }
  g.closePath(); g.fill();
}
function sealMaterial(colour, cv, alphaCanvas) {
  const hm = canvasTex(cv.hc, false);
  return new THREE.MeshPhysicalMaterial({
    color: colour, roughness: 0.36, clearcoat: 0.55, clearcoatRoughness: 0.22,
    sheen: 0.3, sheenColor: new THREE.Color(colour).lerp(new THREE.Color(0xffffff), 0.3), sheenRoughness: 0.4,
    displacementMap: hm, displacementScale: 0.09, displacementBias: -0.01, bumpMap: hm, bumpScale: 3.0,
    alphaMap: canvasTex(alphaCanvas || cv.ac, false), alphaTest: 0.5, side: THREE.DoubleSide,
  });
}

/* gold dust burst (additive, analytic in time) */
function makeBurst(n, seed = 3, color = 0xffc66b) {
  const r = rng(seed);
  const pos = new Float32Array(n * 3), al = new Float32Array(n), sz = new Float32Array(n);
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  geo.setAttribute('aA', new THREE.BufferAttribute(al, 1));
  geo.setAttribute('aS', new THREE.BufferAttribute(sz, 1));
  const mat = new THREE.ShaderMaterial({
    uniforms: { uPix: { value: 640 }, uColor: { value: new THREE.Color(color) } },
    vertexShader: 'attribute float aA; attribute float aS; uniform float uPix; varying float vA; void main(){ vA=aA; vec4 mv=modelViewMatrix*vec4(position,1.0); gl_PointSize=aS*uPix*1.9/max(0.1,-mv.z); gl_Position=projectionMatrix*mv; }',
    fragmentShader: 'uniform vec3 uColor; varying float vA; void main(){ float d=length(gl_PointCoord-0.5); float a=smoothstep(0.5,0.0,d)*vA; gl_FragColor=vec4(uColor*a*1.2,a); }',
    transparent: true, depthWrite: false, blending: THREE.AdditiveBlending,
  });
  const pts = new THREE.Points(geo, mat); pts.frustumCulled = false; pts.renderOrder = 6;
  const P = Array.from({ length: n }, () => ({ a: r() * Math.PI * 2, v: 0.6 + r() * 1.6, up: 0.2 + r() * 1.4, rr: 0.1 + r() * 0.35, life: 0.7 + r() * 1.0, d: r() * 0.1, size: 0.016 + r() * 0.03 }));
  const shots = [];
  return {
    points: pts,
    fire(o, time, pw = 1, rg = 1) { shots.push({ o: o.clone(), t0: time, pw, rg }); },
    reset() { shots.length = 0; },
    update(t) {
      const per = Math.max(1, shots.length);
      for (let i = 0; i < n; i++) {
        const s = shots[i % per], p = P[i];
        const a = s ? t - s.t0 - p.d : -1;
        if (!s || a < 0 || a > p.life) { al[i] = 0; pos[i * 3 + 1] = -50; continue; }
        const sp = p.v * s.pw * (1 - Math.exp(-a * 2.2)) * 0.55;
        pos[i * 3] = s.o.x + Math.cos(p.a) * (p.rr * s.rg + sp);
        pos[i * 3 + 1] = s.o.y + Math.sin(p.a) * (p.rr * s.rg + sp) * 0.6 + p.up * s.pw * 0.25 * (1 - Math.exp(-a * 2.6)) - 0.3 * a * a;
        pos[i * 3 + 2] = s.o.z + 0.05 + Math.abs(Math.sin(p.a * 3)) * 0.2 * s.pw;
        al[i] = Math.pow(1 - a / p.life, 1.6) * smooth(0, 0.05, a) * 0.8;
        sz[i] = p.size * (0.7 + 0.5 * s.pw);
      }
      geo.attributes.position.needsUpdate = true; geo.attributes.aA.needsUpdate = true; geo.attributes.aS.needsUpdate = true;
    },
  };
}

/* ------------------------------------------------------------------ sound (WebAudio placeholders, ?sound=1 only) */
let AC = null;
function ac() {
  if (!SOUND || SHOT) return null;
  try { AC ??= new (window.AudioContext || window.webkitAudioContext)(); if (AC.state === 'suspended') AC.resume(); } catch (e) { return null; }
  return AC;
}
function noise(c, dur) { const b = c.createBuffer(1, Math.ceil(c.sampleRate * dur), c.sampleRate), d = b.getChannelData(0); for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1; const s = c.createBufferSource(); s.buffer = b; return s; }
function env(c, g, t0, a, peak, dec) { g.gain.setValueAtTime(0.0001, t0); g.gain.exponentialRampToValueAtTime(peak, t0 + a); g.gain.exponentialRampToValueAtTime(0.0001, t0 + a + dec); }
const sfx = {
  tap() { const c = ac(); if (!c) return; const t = c.currentTime;
    const o = c.createOscillator(), g = c.createGain(); o.frequency.setValueAtTime(190, t); o.frequency.exponentialRampToValueAtTime(70, t + 0.12); env(c, g, t, 0.003, 0.5, 0.16); o.connect(g).connect(c.destination); o.start(t); o.stop(t + 0.25);
    const n = noise(c, 0.08), f = c.createBiquadFilter(), g2 = c.createGain(); f.type = 'bandpass'; f.frequency.value = 3200; f.Q.value = 2; env(c, g2, t, 0.001, 0.35, 0.05); n.connect(f).connect(g2).connect(c.destination); n.start(t);
    for (const fr of [2950, 4480]) { const m = c.createOscillator(), mg = c.createGain(); m.frequency.value = fr; env(c, mg, t, 0.002, 0.05, 0.3); m.connect(mg).connect(c.destination); m.start(t); m.stop(t + 0.4); } },
  thud() { const c = ac(); if (!c) return; const t = c.currentTime;
    const o = c.createOscillator(), g = c.createGain(); o.frequency.setValueAtTime(110, t); o.frequency.exponentialRampToValueAtTime(48, t + 0.25); env(c, g, t, 0.004, 0.6, 0.3); o.connect(g).connect(c.destination); o.start(t); o.stop(t + 0.4); },
  hiss() { const c = ac(); if (!c) return; const t = c.currentTime;
    const n = noise(c, 1.2), f = c.createBiquadFilter(), g = c.createGain(); f.type = 'highpass'; f.frequency.value = 4200; env(c, g, t, 0.05, 0.06, 1.0); n.connect(f).connect(g).connect(c.destination); n.start(t); },
  clink(p = 1, v = 1) { const c = ac(); if (!c) return; const t = c.currentTime;
    for (const [k, a] of [[1, 0.16], [2.71, 0.08], [5.2, 0.05]]) { const o = c.createOscillator(), g = c.createGain(); o.frequency.value = 2300 * p * k; env(c, g, t, 0.001, a * v, 0.18 + 0.2 / k); o.connect(g).connect(c.destination); o.start(t); o.stop(t + 0.5); } },
  creak() { const c = ac(); if (!c) return; const t = c.currentTime;
    const o = c.createOscillator(), f = c.createBiquadFilter(), g = c.createGain(); o.type = 'sawtooth'; o.frequency.setValueAtTime(70, t); o.frequency.linearRampToValueAtTime(130, t + 0.8);
    f.type = 'bandpass'; f.frequency.value = 900; f.Q.value = 6; env(c, g, t, 0.1, 0.08, 0.8); o.connect(f).connect(g).connect(c.destination); o.start(t); o.stop(t + 1.0); },
  crack() { const c = ac(); if (!c) return; const t = c.currentTime;
    const n = noise(c, 0.1), f = c.createBiquadFilter(), g = c.createGain(); f.type = 'bandpass'; f.frequency.value = 1500; f.Q.value = 1.2; env(c, g, t, 0.001, 0.5, 0.07); n.connect(f).connect(g).connect(c.destination); n.start(t); },
  rustle(d = 1.4) { const c = ac(); if (!c) return; const t = c.currentTime;
    const n = noise(c, d), f = c.createBiquadFilter(), g = c.createGain(), l = c.createOscillator(), lg = c.createGain(); f.type = 'bandpass'; f.frequency.value = 2100; f.Q.value = 0.7;
    g.gain.value = 0.05; l.frequency.value = 13; lg.gain.value = 0.04; l.connect(lg).connect(g.gain); n.connect(f).connect(g).connect(c.destination); n.start(t); l.start(t); l.stop(t + d); g.gain.setTargetAtTime(0, t + d * 0.8, 0.1); },
  scratch() { const c = ac(); if (!c) return; const t = c.currentTime;
    const n = noise(c, 0.05), f = c.createBiquadFilter(), g = c.createGain(); f.type = 'highpass'; f.frequency.value = 5000; env(c, g, t, 0.005, 0.025, 0.04); n.connect(f).connect(g).connect(c.destination); n.start(t); },
};

/* ------------------------------------------------------------------ fonts */
async function waitFonts() {
  try {
    await Promise.race([
      Promise.all([document.fonts.load('600 40px Cinzel'), document.fonts.load('italic 500 40px "Cormorant Garamond"'), document.fonts.load('italic 400 40px "IM Fell English"'), document.fonts.load('400 40px "IM Fell English"'), document.fonts.load('500 20px Inter')]),
      new Promise((r) => setTimeout(r, 4000)),
    ]);
  } catch (e) { /* fonts optional */ }
}

/* ------------------------------------------------------------------ shared scene state */
const glEl = $('#gl'), txt = $('#txt'), cam = $('#cam');
const camBase = getComputedStyle(cam).boxShadow;
const BW = 1050, BH = 640;
let wt, burst, key;
function camEcho(e) {
  if (e < 0.002) { cam.style.boxShadow = ''; return; }
  cam.style.boxShadow = `0 0 ${46 * e}px ${6 * e}px rgba(255,179,71,${0.5 * e}), inset 0 0 ${34 * e}px rgba(255,179,71,${0.32 * e}), ${camBase}`;
}
function shake(y) { wt.camera.setViewOffset(BW, BH, 0, y, BW, BH); }
function cues() { const done = new Set(); return (name, t, at) => { if (t >= at && !done.has(name)) { done.add(name); return true; } return false; }; }
function nail(scale = 1) {
  const g = new THREE.Group(), m = brassMat(0xc19a5c, 0.26);
  const head = new THREE.Mesh(new THREE.SphereGeometry(0.075 * scale, 24, 12, 0, Math.PI * 2, 0, Math.PI / 2), m);
  head.rotation.x = Math.PI / 2; head.scale.set(1, 0.5, 1); head.castShadow = true; g.add(head);
  const shank = new THREE.Mesh(new THREE.CylinderGeometry(0.018 * scale, 0.012 * scale, 0.3, 8), m); shank.rotation.x = Math.PI / 2; shank.position.z = -0.15; g.add(shank);
  return g;
}

/* ================================================================== FOLLOW: brass tag on a walnut rail */
function buildFollow(a) {
  const root = new THREE.Group();
  const RAIL_Y = 1.74;
  const rail = new THREE.Group(); root.add(rail);
  const railMesh = new THREE.Mesh(new RoundedBoxGeometry(3.1, 0.3, 0.16, 4, 0.05), woodMat(37, 0x0f0703, 0x3a2210, [2.4, 0.4]));
  railMesh.castShadow = railMesh.receiveShadow = true; rail.add(railMesh);
  // moulding lip along the rail's lower edge
  const lip = new THREE.Mesh(new RoundedBoxGeometry(3.18, 0.07, 0.2, 3, 0.03), railMesh.material); lip.position.y = -0.15; lip.castShadow = true; rail.add(lip);
  for (const sx of [-1, 1]) { const s = nail(0.75); s.position.set(sx * 1.38, 0, 0.08); rail.add(s); }
  rail.position.set(0, RAIL_Y, 0);

  const TW = 2.8, TH = 0.8;
  const cv = engravedBrass(1280, 368, 9, (eng, W, H) => {
    eng((c) => { c.lineWidth = 3; c.beginPath(); c.roundRect(20, 20, W - 40, H - 40, 26); c.stroke(); });
    eng((c) => { c.lineWidth = 2; c.beginPath(); c.arc(W / 2, 52, 30, 0, Math.PI * 2); c.stroke(); });
    eng((c) => {
      const nm = a.name.toUpperCase(); const w = fitFont(c, nm, 5, W - 170, 112, 48, '600 $px Cinzel, serif');
      spaced(c, nm, (W - w) / 2, 212, 5);
      c.font = '600 42px Cinzel, serif'; const k = 'NEW FOLLOWER', kw = spW(c, k, 12); spaced(c, k, (W - kw) / 2, 300, 12);
      c.lineWidth = 2.5; for (const [x1, x2] of [[W / 2 - kw / 2 - 170, W / 2 - kw / 2 - 30], [W / 2 + kw / 2 + 30, W / 2 + kw / 2 + 170]]) { c.beginPath(); c.moveTo(x1, 285); c.lineTo(x2, 285); c.stroke(); }
    });
  });
  const tagMat = brassMaterial(cv, { color: 0xd5ad6a, bump: 2.4 });
  const pivot = new THREE.Group(); root.add(pivot);         // the nail point
  const tag = new THREE.Mesh(new RoundedBoxGeometry(TW, TH, 0.035, 4, 0.03), tagMat);
  tag.castShadow = tag.receiveShadow = true;
  const hole = 52 / 368 * TH;                                 // hole centre below the tag's top edge
  tag.position.set(0, -(TH / 2 - hole), 0); pivot.add(tag);
  const grommet = new THREE.Mesh(new THREE.TorusGeometry(0.058, 0.016, 10, 28), brassMat(0x8a6a3a, 0.4)); grommet.position.z = 0.02; pivot.add(grommet);
  const nl = nail(1); root.add(nl);
  pivot.position.set(0, RAIL_Y + 0.02, 0.1);

  const cue = cues();
  return {
    root, duration: 4.6,
    update(t) {
      glEl.style.opacity = smooth(0, 0.15, t) * (1 - smooth(3.9, 4.6, t));
      rail.position.y = RAIL_Y + 1.5 * (1 - easeOut(t / 0.5));
      // tag is placed (falls the last few cm), then nailed with one tap, then swings heavy to rest
      const u = easeIn((t - 0.42) / 0.36);
      pivot.visible = t > 0.42;
      const T0 = 0.86, s = t - T0;
      pivot.position.y = RAIL_Y + 0.02 + 1.1 * (1 - u) + 1.5 * (1 - easeOut(t / 0.5)) * 0;
      pivot.rotation.z = s < 0 ? lerp(0.4, 0.14, u) : 0.14 * Math.exp(-2.1 * s) * Math.cos(6.4 * s);
      nl.visible = t > 0.64;
      nl.position.set(0, RAIL_Y + 0.02, 0.1 + 0.28 * (1 - smooth(T0 - 0.06, T0, t)) + 0.012);
      if (cue('tap', t, T0)) { burst.fire(new THREE.Vector3(0, RAIL_Y, 0.15), t, 0.35, 0.25); sfx.tap(); }
      shake(s >= 0 ? 2.4 * Math.exp(-s * 24) * Math.cos(s * 60) : 0);
    },
  };
}

/* ================================================================== SUB: plaque, plate, velvet ribbon, wax seal */
function ribbonGeometry(pts, width, segs = 60) {
  const curve = new THREE.CatmullRomCurve3(pts.map((p) => new THREE.Vector3(...p)));
  const pos = [], uv = [], idx = [];
  for (let i = 0; i <= segs; i++) {
    const v = i / segs, p = curve.getPointAt(v), tg = curve.getTangentAt(v);
    const side = new THREE.Vector3(0, 0, 1).cross(tg).normalize();
    const twist = Math.sin(v * 5.2) * 0.07;
    const cup = 0.03 * (0.4 + 0.6 * smooth(0.25, 0.6, v));   // the cloth cups across its width as it hangs free
    const fold = Math.sin(v * 9.0 + 0.6) * 0.018 * smooth(0.3, 0.7, v);   // soft lengthwise wave
    const U = 8;
    for (let j = 0; j <= U; j++) {
      const u = j / U, o = (u - 0.5) * width;
      const dz = (u - 0.5) * twist + Math.sin(Math.PI * u) * cup + Math.sin(u * Math.PI * 2) * fold;
      pos.push(p.x + side.x * o, p.y + side.y * o, p.z + side.z * o + dz);
      uv.push(u, 1 - v);
    }
    if (i < segs) for (let j = 0; j < U; j++) { const k = i * (U + 1) + j, n = k + U + 1; idx.push(k, n, k + 1, k + 1, n, n + 1); }
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
  g.setIndex(idx); g.computeVertexNormals(); return g;
}
let _velvet = null;
function velvetMat() {
  if (!_velvet) {
    // alpha: swallow-tail notch at the free end (uv.y 0 = end)
    const c = canvas(128, 512), g = c.getContext('2d');
    g.fillStyle = '#000'; g.fillRect(0, 0, 128, 512); g.fillStyle = '#fff';
    g.beginPath(); g.moveTo(0, 0); g.lineTo(128, 0); g.lineTo(128, 512); g.lineTo(64, 512 - 46); g.lineTo(0, 512); g.closePath(); g.fill();
    const w = canvas(128, 512), wg = w.getContext('2d'), r = rng(4);  // pile / weave
    wg.fillStyle = '#808080'; wg.fillRect(0, 0, 128, 512);
    for (let y = 0; y < 512; y += 2) { wg.fillStyle = `rgba(${r() > 0.5 ? 255 : 0},${0},${0},0)`; }
    for (let i = 0; i < 3000; i++) { const v = 100 + r() * 60; wg.fillStyle = `rgba(${v},${v},${v},0.5)`; wg.fillRect(r() * 128, r() * 512, 1, 2 + r() * 3); }
    for (const x of [7, 121]) { wg.fillStyle = '#5a5a5a'; wg.fillRect(x - 2, 0, 4, 512); }  // woven selvedge
    // colour: deep claret velvet with a woven gold edge stripe that catches the key light
    const cm = canvas(128, 512), cg = cm.getContext('2d');
    const gr = cg.createLinearGradient(0, 0, 128, 0);
    gr.addColorStop(0, '#4a0b14'); gr.addColorStop(0.5, '#62121e'); gr.addColorStop(1, '#4a0b14');
    cg.fillStyle = gr; cg.fillRect(0, 0, 128, 512);
    for (const x of [8, 120]) { cg.fillStyle = '#d6a64e'; cg.fillRect(x - 3, 0, 6, 512); cg.fillStyle = '#8a6224'; for (let y = 0; y < 512; y += 6) cg.fillRect(x - 3, y, 6, 2); }
    _velvet = { alpha: canvasTex(c, false), bump: canvasTex(w, false), map: canvasTex(cm, true) };
  }
  return new THREE.MeshPhysicalMaterial({
    color: 0xffffff, map: _velvet.map, roughness: 0.78, sheen: 1, sheenColor: new THREE.Color(0xe0708a), sheenRoughness: 0.42,
    bumpMap: _velvet.bump, bumpScale: 0.6, alphaMap: _velvet.alpha, alphaTest: 0.5, side: THREE.DoubleSide,
  });
}
function steam() {
  const tex = softTex('rgba(240,234,226,0.9)', 'rgba(230,222,212,0.35)', 'rgba(220,210,200,0)');
  const g = new THREE.Group(), r = rng(21), parts = [];
  for (let i = 0; i < 9; i++) {
    const m = new THREE.Mesh(new THREE.PlaneGeometry(1, 1), new THREE.MeshBasicMaterial({ map: tex, transparent: true, opacity: 0, depthWrite: false, color: 0xd8d0c6 }));
    m.renderOrder = 7; g.add(m); parts.push({ m, d: i * 0.14 + r() * 0.08, dx: (r() - 0.3) * 0.5, sp: 0.5 + r() * 0.4, ph: r() * 6 });
  }
  return { g, update(s) {
    for (const p of parts) {
      const a = s - p.d, life = 1.6;
      if (a < 0 || a > life) { p.m.material.opacity = 0; continue; }
      const k = a / life;
      p.m.position.set(p.dx * k + Math.sin(a * 3 + p.ph) * 0.05, a * p.sp, 0.25 + a * 0.1);
      p.m.scale.setScalar(0.18 + k * 0.6);
      p.m.material.opacity = 0.2 * Math.sin(Math.PI * k) * (1 - k * 0.4);
    }
  } };
}
function buildSub(a) {
  const root = new THREE.Group();
  const W = 6.4, H = 1.72, D = 0.16, CY = 1.16;
  const grp = new THREE.Group(); root.add(grp);
  const plaque = new THREE.Mesh(new RoundedBoxGeometry(W, H, D, 5, 0.06), woodMat(91, 0x100803, 0x341e0e, [2, 1]));
  plaque.castShadow = plaque.receiveShadow = true; grp.add(plaque);
  // raised bevel frame on the plaque face
  const frameMat = woodMat(92, 0x0c0602, 0x2a170a, [3, 0.3]);
  for (const [w, h, x, y] of [[W - 0.16, 0.06, 0, H / 2 - 0.1], [W - 0.16, 0.06, 0, -H / 2 + 0.1], [0.06, H - 0.26, -W / 2 + 0.1, 0], [0.06, H - 0.26, W / 2 - 0.1, 0]]) {
    const b = new THREE.Mesh(new RoundedBoxGeometry(w, h, 0.05, 2, 0.02), frameMat); b.position.set(x, y, D / 2 + 0.01); b.castShadow = true; grp.add(b);
  }
  grp.position.set(0, CY, 0);
  const isGift = a.gift > 0;
  const line3 = isGift ? `gifted ${a.gift} subs` : a.tier === 'prime' ? 'Prime' : `Tier ${a.tier}${a.months > 1 ? ` · ${a.months} months` : ''}`;
  const kicker = isGift ? 'GIFTED SUBSCRIPTIONS' : 'NEW SUBSCRIBER';
  const PW = 4.3, PH = 1.06, PD = 0.05;
  const cv = engravedBrass(1568, 386, 5, (eng, CW, CH) => {
    for (const [inset, lw] of [[22, 3], [36, 1.5]]) eng((c) => { c.lineWidth = lw; c.strokeRect(inset, inset, CW - 2 * inset, CH - 2 * inset); });
    eng((c) => {
      c.textBaseline = 'alphabetic'; c.font = '600 44px Cinzel, serif';
      const kw = spW(c, kicker, 12); spaced(c, kicker, (CW - kw) / 2, 106, 12);
      c.lineWidth = 2.5; for (const [x1, x2] of [[CW / 2 - kw / 2 - 230, CW / 2 - kw / 2 - 34], [CW / 2 + kw / 2 + 34, CW / 2 + kw / 2 + 230]]) { c.beginPath(); c.moveTo(x1, 91); c.lineTo(x2, 91); c.stroke(); }
      const nm = a.name.toUpperCase(); const nw = fitFont(c, nm, 6, CW - 200, 120, 50, '600 $px Cinzel, serif');
      spaced(c, nm, (CW - nw) / 2, 234, 6);
      c.font = 'italic 600 74px "Cormorant Garamond", serif'; c.textAlign = 'center'; c.fillText(line3, CW / 2, 328);
    });
  });
  const plateMat = brassMaterial(cv);
  const plateG = new THREE.Group(); grp.add(plateG);
  const plate = new THREE.Mesh(new RoundedBoxGeometry(PW, PH, PD, 4, 0.025), plateMat); plate.castShadow = plate.receiveShadow = true; plateG.add(plate);
  const nails = [];
  for (const [sx, sy] of [[-1, 1], [1, 1], [1, -1], [-1, -1]]) { const n = nail(0.95); n.userData.base = new THREE.Vector3(sx * (PW / 2 - 0.17), sy * (PH / 2 - 0.16), PD / 2); plateG.add(n); nails.push(n); }
  const PX = 0.82; plateG.position.set(PX, 0, D / 2 + PD / 2 + 0.02);
  // velvet ribbon: two tails from under the seal, over the plaque's lower edge, hanging free
  const SX = -2.25, SY = 0.08, f = D / 2 + 0.035;
  const rib = velvetMat();
  const tailA = new THREE.Mesh(ribbonGeometry([[SX, SY + 0.2, f], [SX - 0.13, -0.3, f], [SX - 0.24, -H / 2 + 0.03, f + 0.004], [SX - 0.3, -H / 2 - 0.08, f - 0.02], [SX - 0.36, -H / 2 - 0.5, f - 0.04], [SX - 0.42, -H / 2 - 0.86, f - 0.02]], 0.36), rib);
  const tailB = new THREE.Mesh(ribbonGeometry([[SX + 0.02, SY + 0.2, f + 0.006], [SX + 0.16, -0.3, f + 0.006], [SX + 0.3, -H / 2 + 0.03, f + 0.01], [SX + 0.36, -H / 2 - 0.08, f - 0.01], [SX + 0.41, -H / 2 - 0.42, f - 0.03], [SX + 0.45, -H / 2 - 0.74, f - 0.01]], 0.36), rib);
  for (const m of [tailA, tailB]) { m.castShadow = m.receiveShadow = true; grp.add(m); }
  // short loop of ribbon above the seal (the bow under the wax)
  // wax seal
  const sc = sealCanvases('swords', 3);
  const sealMat = sealMaterial(0x6a0e15, sc);
  const sealG = new THREE.Group(); grp.add(sealG);
  const seal = new THREE.Mesh(new THREE.PlaneGeometry(0.98, 0.98, 200, 200), sealMat); seal.castShadow = true; sealG.add(seal);
  const sealPos = new THREE.Vector3(SX, SY, f + 0.06);
  const st = steam(); st.g.position.set(SX, SY + 0.3, f); grp.add(st.g);

  const NT = [1.15, 1.34, 1.53, 1.72], PT = 0.62, ST = 2.25, PRESS = ST + 0.3;
  const cue = cues();
  return {
    root, duration: 6.8,
    update(t) {
      glEl.style.opacity = smooth(0, 0.12, t) * (1 - smooth(6.0, 6.8, t));
      grp.position.y = CY + 2.4 * (1 - easeOut(t / 0.55));
      wt.scene.environmentRotation.y = -0.6 + t * 0.2;
      const u = clamp01((t - PT) / 0.3), tilt = (1 - u) * 0.12;
      plateG.visible = t >= PT;
      plateG.position.z = D / 2 + PD / 2 + 0.02 + 1.1 * (1 - u * u);
      plateG.scale.setScalar(1 + 0.1 * (1 - u));
      plateG.rotation.set(tilt * 0.6, -tilt, tilt * 0.3);
      let sh = 0;
      nails.forEach((n, i) => {
        const b = n.userData.base;
        n.visible = t >= NT[i] - 0.35;
        n.position.set(b.x, b.y, b.z + 0.012 + 0.24 * (1 - smooth(NT[i] - 0.06, NT[i], t)));
        if (cue('n' + i, t, NT[i])) { const wp = new THREE.Vector3(); n.getWorldPosition(wp); burst.fire(wp, t, 0.3, 0.25); sfx.tap(); }
        const s = t - NT[i]; if (s >= 0) sh += 0.8 * Math.exp(-s * 26) * (i % 2 ? 1 : -1);
      });
      const ss = t - PT - 0.3; if (ss >= 0) sh += 1.4 * Math.exp(-ss * 22);
      if (cue('plate', t, PT + 0.3)) sfx.thud();
      const sp = t - PRESS; if (sp >= 0) sh += 1.8 * Math.exp(-sp * 18);
      shake(sh * 2.2);
      // seal: drop of soft wax, then pressed flat by the (unseen) signet
      const su = clamp01((t - ST) / 0.3);
      sealG.visible = t >= ST;
      sealG.position.set(sealPos.x, sealPos.y, sealPos.z + 1.3 * (1 - su * su));
      sealG.rotation.z = (1 - su) * 0.7 + 0.1;
      const press = easeOut((t - PRESS) / 0.22);
      sealG.scale.setScalar(lerp(0.78, 1.0, press) * (1.2 - 0.2 * su));
      sealMat.displacementScale = lerp(0.2, 0.085, press);
      if (cue('press', t, PRESS)) { const wp = new THREE.Vector3(); sealG.getWorldPosition(wp); burst.fire(wp, t, 0.55, 0.45); sfx.thud(); sfx.hiss(); }
      st.update(t - PRESS - 0.05);
      camEcho(smooth(PRESS - 0.05, PRESS + 0.1, t) * (1 - smooth(PRESS + 0.25, PRESS + 1.6, t)));
    },
  };
}

/* ================================================================== BITS: coins onto a brass tray (or a chest) */
let _coinTex = null;
function coinTex() {
  if (_coinTex) return _coinTex;
  const S = 256, c = canvas(S, S), g = c.getContext('2d');
  g.fillStyle = '#7a7a7a'; g.fillRect(0, 0, S, S);
  g.save(); g.filter = 'blur(1.2px)';
  g.strokeStyle = '#d8d8d8'; g.lineWidth = 12; g.beginPath(); g.arc(128, 128, 114, 0, Math.PI * 2); g.stroke();
  g.fillStyle = '#c6c6c6'; for (let i = 0; i < 36; i++) { const a = i / 36 * Math.PI * 2; g.beginPath(); g.arc(128 + Math.cos(a) * 96, 128 + Math.sin(a) * 96, 3.4, 0, Math.PI * 2); g.fill(); }
  star(g, 128, 128, 58, 24, 6, '#d2d2d2'); g.fillStyle = '#8c8c8c'; g.beginPath(); g.arc(128, 128, 14, 0, Math.PI * 2); g.fill();
  g.restore();
  _coinTex = canvasTex(c, false); return _coinTex;
}
function goldMat() { return new THREE.MeshPhysicalMaterial({ color: 0xf6dc92, metalness: 1, roughness: 0.34, bumpMap: coinTex(), bumpScale: 2.2, clearcoat: 0.3, clearcoatRoughness: 0.2 }); }
function trayMesh(R) {
  const prof = [[0, 0], [R * 0.78, 0], [R * 0.86, 0.012], [R * 0.93, 0.05], [R * 0.98, 0.1], [R * 1.02, 0.135], [R * 1.055, 0.15], [R * 1.075, 0.14], [R * 1.07, 0.115], [R * 1.03, 0.11], [R * 0.95, 0.04], [R * 0.86, -0.012], [R * 0.6, -0.02], [0, -0.02]];
  const geo = new THREE.LatheGeometry(prof.reverse().map(([x, y]) => new THREE.Vector2(x, y)), 96);
  const c = canvas(64, 512), g = c.getContext('2d'), r = rng(8);   // spun rings
  g.fillStyle = '#808080'; g.fillRect(0, 0, 64, 512);
  for (let y = 0; y < 512; y++) { const v = 128 + (r() - 0.5) * 50; g.fillStyle = `rgba(${v},${v},${v},0.5)`; g.fillRect(0, y, 64, 1); }
  const m = new THREE.MeshPhysicalMaterial({ color: 0xe8d29e, metalness: 1, roughness: 0.32, bumpMap: canvasTex(c, false), bumpScale: 0.4, roughnessMap: canvasTex(c, false), clearcoat: 0.35, clearcoatRoughness: 0.25 });
  const mesh = new THREE.Mesh(geo, m); mesh.castShadow = mesh.receiveShadow = true;
  // engraved ring in the floor
  const ring = new THREE.Mesh(new THREE.RingGeometry(R * 0.66, R * 0.672, 96), new THREE.MeshPhysicalMaterial({ color: 0x5a3e18, metalness: 1, roughness: 0.5 }));
  ring.rotation.x = -Math.PI / 2; ring.position.y = 0.002; mesh.add(ring);
  return mesh;
}
function chest() {
  const g = new THREE.Group(), w = 1.24, h = 0.5, d = 0.68;
  const wood = woodMat(55, 0x2a1609, 0x6e4426, [1, 0.6], 0.6), brass = brassMat(0xae8448, 0.36);
  const box = new THREE.Mesh(new RoundedBoxGeometry(w, h, d, 3, 0.03), wood); box.position.y = h / 2; box.castShadow = box.receiveShadow = true; g.add(box);
  const inner = new THREE.Mesh(new THREE.BoxGeometry(w - 0.1, 0.02, d - 0.1), new THREE.MeshStandardMaterial({ color: 0x1a0d06, roughness: 1 })); inner.position.y = h + 0.003; g.add(inner);
  // heaped coins filling the chest (static instances)
  const HN = 70, heap = new THREE.InstancedMesh(new THREE.CylinderGeometry(0.11, 0.11, 0.02, 28), goldMat(), HN), hr = rng(77);
  const hm = new THREE.Matrix4(), hq = new THREE.Quaternion(), hp = new THREE.Vector3(), hs = new THREE.Vector3(1, 1, 1);
  for (let i = 0; i < HN; i++) {
    const x = (hr() - 0.5) * (w - 0.2), z = (hr() - 0.5) * (d - 0.2);
    const dome = 0.09 * (1 - (x * x) / 0.4 - (z * z) / 0.12) + hr() * 0.03;
    hp.set(x, h - 0.03 + Math.max(0, dome), z);
    hq.setFromEuler(new THREE.Euler((hr() - 0.5) * 0.9, hr() * 6.28, (hr() - 0.5) * 0.9));
    hm.compose(hp, hq, hs); heap.setMatrixAt(i, hm);
  }
  heap.castShadow = heap.receiveShadow = true; g.add(heap);
  for (const x of [-0.42, 0.42]) {   // brass straps
    const s = new THREE.Mesh(new THREE.BoxGeometry(0.07, h + 0.01, d + 0.02), brass); s.position.set(x, h / 2, 0); s.castShadow = true; g.add(s);
  }
  const lock = new THREE.Mesh(new RoundedBoxGeometry(0.16, 0.2, 0.04, 2, 0.015), brass); lock.position.set(0, h - 0.12, d / 2 + 0.015); g.add(lock);
  const hinge = new THREE.Group(); hinge.position.set(0, h, -d / 2); g.add(hinge);
  const lid = new THREE.Group(); lid.position.z = d / 2; hinge.add(lid);
  const shell = new THREE.Mesh(new THREE.CylinderGeometry(d / 2, d / 2, w, 32, 1, false, 0, Math.PI), wood); shell.rotation.z = Math.PI / 2; shell.scale.set(0.62, 1, 1); shell.castShadow = shell.receiveShadow = true; lid.add(shell);
  const under = new THREE.Mesh(new THREE.BoxGeometry(w - 0.02, 0.02, d - 0.02), new THREE.MeshStandardMaterial({ color: 0x2a160a, roughness: 0.9 })); lid.add(under);
  for (const x of [-0.42, 0.42]) { const b = new THREE.Mesh(new THREE.TorusGeometry(d / 2 + 0.005, 0.022, 8, 32, Math.PI), brass); b.rotation.y = Math.PI / 2; b.scale.set(1, 0.62, 1); b.position.x = x; lid.add(b); }
  const glow = new THREE.PointLight(0xffb45a, 0, 3.2, 2); glow.position.set(0, h + 0.2, 0); g.add(glow);
  const halo = new THREE.Mesh(new THREE.PlaneGeometry(1.8, 0.9), new THREE.MeshBasicMaterial({ map: softTex(), transparent: true, opacity: 0, depthWrite: false, blending: THREE.AdditiveBlending, color: 0xffa040 }));
  halo.position.set(0, h + 0.2, 0.05); halo.renderOrder = 5; g.add(halo);
  g.userData = { hinge, glow, halo, h, d };
  return g;
}
function buildBits(a) {
  const n = a.amount, size = n >= 1000 ? 'chest' : n >= 100 ? 'pile' : 'few';
  const root = new THREE.Group();
  const R = size === 'chest' ? 1.22 : 1.0;
  const trayG = new THREE.Group(); root.add(trayG);
  const BASE = new THREE.Vector3(size === 'chest' ? -1.85 : -2.05, size === 'chest' ? 0.55 : 1.0, 0);
  trayG.position.copy(BASE); trayG.rotation.x = 0.8; trayG.rotation.y = 0.0;
  trayG.add(trayMesh(R));
  // candle-side light pooled on the tray floor: same warm gold on coins and brass at every tier
  const pool = new THREE.PointLight(0xffdcaa, 5, 4.5, 2); pool.position.set(-0.6, 1.3, 0.9); trayG.add(pool);
  const envWas = wt.scene.environmentIntensity; wt.scene.environmentIntensity = 1.3;
  let ch = null;
  if (size === 'chest') { ch = chest(); ch.position.set(0, 0, -0.42); trayG.add(ch); }
  const N = size === 'few' ? 7 : size === 'pile' ? 44 : 34;
  const coins = new THREE.InstancedMesh(new THREE.CylinderGeometry(0.13, 0.13, 0.024, 36), goldMat(), N);
  coins.castShadow = coins.receiveShadow = true; coins.frustumCulled = false; trayG.add(coins);
  const r = rng(n + 7), rest = [];
  const FLOOR = 0.012;
  for (let i = 0; i < N; i++) {
    let x, z;
    if (size === 'few') { const ang = i * 2.4 + r() * 0.6, rr = 0.15 + r() * R * 0.5; x = Math.cos(ang) * rr; z = Math.sin(ang) * rr * 0.8; }
    else if (size === 'pile') { const ang = r() * Math.PI * 2, rr = R * 0.56 * Math.pow(r(), 0.7); x = Math.cos(ang) * rr; z = Math.sin(ang) * rr; }
    else { const ang = r() * Math.PI - Math.PI, rr = 0.15 + R * 0.55 * Math.sqrt(r()); x = Math.cos(ang) * rr * 1.1; z = 0.28 + Math.abs(Math.sin(ang)) * rr * 0.55; }
    let y = FLOOR, on = false;
    for (const p of rest) { const dd = Math.hypot(p.x - x, p.z - z); if (dd < 0.24) { y = Math.max(y, p.y + 0.023 + (0.24 - dd) * 0.05); on = true; } }
    const tilt = on ? 0.06 + r() * 0.28 : r() * 0.04, ax = r() * Math.PI * 2;
    const q = new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(Math.cos(ax), 0, Math.sin(ax)), tilt)
      .multiply(new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 1, 0), r() * 6.28));
    const tl = size === 'few' ? 0.7 + i * 0.24 + r() * 0.08 : size === 'pile' ? 0.6 + 2.3 * Math.pow(i / N, 0.85) + r() * 0.05 : 2.05 + i * 0.045 + r() * 0.05;
    rest.push({ x, y: y + 0.011 + Math.sin(tilt) * 0.05, z, q, tl, spin: new THREE.Vector3(r() - 0.5, r() - 0.5, r() - 0.5).normalize(), sr: 8 + r() * 10, dx: (r() - 0.5) * 0.5, sx: (r() - 0.5) * 0.8 });
  }
  // world "up" expressed in tray space (coins fall straight down on screen)
  const upL = new THREE.Vector3(0, 1, 0).applyQuaternion(new THREE.Quaternion().setFromEuler(trayG.rotation).invert());
  const M = new THREE.Matrix4(), P = new THREE.Vector3(), Q = new THREE.Quaternion(), S1 = new THREE.Vector3(1, 1, 1), S0 = new THREE.Vector3(0, 0, 0), tq = new THREE.Quaternion();
  const FALL = 0.42;
  const dur = size === 'few' ? 5.4 : size === 'pile' ? 6.8 : 8.2;
  // text (HTML, crisp) to the right of the tray
  const left = size === 'chest' ? 500 : 430;
  txt.innerHTML = `<div class="b-kicker" style="left:${left}px">${size === 'chest' ? 'A CHEST OF BITS' : 'BITS'}</div>`
    + `<div class="b-name" style="left:${left}px">${esc(a.name)}</div>`
    + `<div class="b-amt" style="left:${left}px"><span>${n.toLocaleString('en-US')}</span> bits</div>`
    + `<div class="t-hair b-hair" style="left:${left}px"></div>`;
  // keep every line inside the band (x 625-1675): shrink the font to fit, floor 30px, then ellipsis
  const maxW = 1050 - left - 12;
  for (const el of txt.querySelectorAll('.b-kicker, .b-name, .b-amt')) {
    el.style.maxWidth = maxW + 'px';
    let fs = parseFloat(getComputedStyle(el).fontSize);
    while (el.scrollWidth > maxW && fs > 30) { fs -= 2; el.style.fontSize = fs + 'px'; }
    if (el.scrollWidth > maxW) Object.assign(el.style, { overflow: 'hidden', textOverflow: 'ellipsis' });  // only then: overflow clips the glow
  }
  const tEls = [...txt.children];
  const cue = cues();
  return {
    root, duration: dur,
    update(t) {
      const fade = smooth(0, 0.15, t) * (1 - smooth(dur - 0.8, dur, t));
      glEl.style.opacity = fade;
      trayG.position.y = BASE.y + 1.8 * (1 - easeOut(t / 0.55));
      wt.scene.environmentRotation.y = -0.4 + t * 0.15;
      tEls.forEach((el, i) => { const e = easeOut((t - 0.45 - i * 0.12) / 0.6); el.style.opacity = e * (1 - smooth(dur - 0.8, dur, t)); el.style.transform = `translateX(${(1 - e) * -18}px)`; });
      let sh = 0;
      if (ch) {
        const o = easeInOut((t - 0.9) / 1.0);
        ch.userData.hinge.rotation.x = -1.85 * o;
        ch.userData.glow.intensity = 3 * smooth(0.95, 1.6, t) * (0.9 + 0.1 * Math.sin(t * 9));
        ch.userData.halo.material.opacity = 0.28 * smooth(1.0, 1.7, t) * (1 - 0.4 * smooth(4, 7, t));
        if (cue('creak', t, 0.9)) sfx.creak();
        if (cue('open', t, 1.5)) { const wp = new THREE.Vector3(); ch.getWorldPosition(wp); wp.y += 0.4; burst.fire(wp, t, 0.9, 0.6); }
      }
      for (let i = 0; i < N; i++) {
        const c = rest[i], s = t - c.tl;
        if (s < -FALL) { M.compose(P.set(0, -50, 0), Q.identity(), S0); coins.setMatrixAt(i, M); continue; }
        if (s < 0) {
          const u = 1 + s / FALL;
          if (size === 'chest') {    // flung out of the chest mouth in an arc
            const st = new THREE.Vector3(c.sx, ch.userData.h + 0.15, -0.42);
            P.lerpVectors(st, new THREE.Vector3(c.x, c.y, c.z), u).addScaledVector(upL, Math.sin(Math.PI * u) * 0.55);
          } else {
            P.set(c.x + c.dx * (1 - u), c.y, c.z).addScaledVector(upL, 3.2 * (1 - u * u));
          }
          Q.setFromAxisAngle(c.spin, s * c.sr).slerp(c.q, u * u);
        } else {
          const hop = 0.035 * Math.exp(-s * 10) * Math.abs(Math.sin(s * 26));
          P.set(c.x, c.y, c.z).addScaledVector(upL, hop);
          tq.setFromAxisAngle(c.spin, 0.25 * Math.exp(-s * 9) * Math.sin(s * 40));
          Q.copy(c.q).premultiply(tq);
          if (cue('c' + i, t, c.tl)) { sfx.clink(0.85 + (i % 5) * 0.08, size === 'pile' ? 0.6 : 1); if (size !== 'pile' || i % 6 === 0) sh += 0.25; }
        }
        M.compose(P, Q, S1); coins.setMatrixAt(i, M);
      }
      coins.instanceMatrix.needsUpdate = true;
      shake(0);
    },
    dispose() { txt.innerHTML = ''; wt.scene.environmentIntensity = envWas; },
  };
}
const esc = (s) => String(s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));

/* ================================================================== DONATION: sealed scroll, ink letter */
function parchmentBase(W, H, seed) {
  const n = makeNoise2D(seed), lw = Math.round(W / 4), lh = Math.round(H / 4);
  const lo = canvas(lw, lh), lg = lo.getContext('2d'), d = lg.createImageData(lw, lh);
  const bump = canvas(lw, lh), bg = bump.getContext('2d'), bd = bg.createImageData(lw, lh);
  for (let y = 0; y < lh; y++) for (let x = 0; x < lw; x++) {
    const f = n.fbm(x / 38, y / 38, 5), f2 = n.fbm(x / 9 + 40, y / 9, 3);
    const ex = Math.min(x, lw - 1 - x) / lw, ey = Math.min(y, lh - 1 - y) / lh;
    const edge = 1 - smooth(0, 0.16, Math.min(ex * 1.4, ey * 1.4 * lh / lw * 1.2 + 0.0));
    let r = 236, g = 220, b = 186;
    const m = 0.5 + 0.5 * f;
    r -= 28 * (1 - m) + 8 * f2; g -= 34 * (1 - m) + 9 * f2; b -= 46 * (1 - m) + 10 * f2;
    r -= 70 * edge; g -= 90 * edge; b -= 100 * edge;     // aged, darker edges
    const i = (y * lw + x) * 4;
    d.data[i] = r; d.data[i + 1] = g; d.data[i + 2] = b; d.data[i + 3] = 255;
    const bv = 128 + 50 * f2 + 30 * f; bd.data[i] = bd.data[i + 1] = bd.data[i + 2] = bv; bd.data[i + 3] = 255;
  }
  lg.putImageData(d, 0, 0); bg.putImageData(bd, 0, 0);
  const c = canvas(W, H), g = c.getContext('2d');
  g.imageSmoothingQuality = 'high'; g.drawImage(lo, 0, 0, W, H);
  const r = rng(seed);
  for (let i = 0; i < 900; i++) { const x = r() * W, y = r() * H, l = 6 + r() * 30, a = r() * Math.PI; g.strokeStyle = `rgba(${120 + r() * 60},${90 + r() * 50},${50},${0.06 + r() * 0.06})`; g.lineWidth = 0.8; g.beginPath(); g.moveTo(x, y); g.lineTo(x + Math.cos(a) * l, y + Math.sin(a) * l); g.stroke(); }
  for (let i = 0; i < 7; i++) { const x = r() * W, y = r() * H, rr = 10 + r() * 50; const p = g.createRadialGradient(x, y, rr * 0.6, x, y, rr); p.addColorStop(0, 'rgba(140,90,45,0.09)'); p.addColorStop(0.6, 'rgba(130,85,42,0.05)'); p.addColorStop(1, 'rgba(120,80,40,0)'); g.fillStyle = p; g.beginPath(); g.arc(x, y, rr, 0, Math.PI * 2); g.fill(); }
  // deckled edge alpha
  const al = canvas(512, Math.round(512 * H / W)), ag = al.getContext('2d'), AW = al.width, AH = al.height;
  ag.fillStyle = '#000'; ag.fillRect(0, 0, AW, AH); ag.fillStyle = '#fff'; ag.beginPath();
  const j = (k) => 3 + 4 * (0.5 + 0.5 * n(k * 0.35, 9.1)) + 2 * r();
  for (let x = 0; x <= AW; x += 4) ag.lineTo(x, j(x));
  for (let y = 0; y <= AH; y += 4) ag.lineTo(AW - j(y + 300), y);
  for (let x = AW; x >= 0; x -= 4) ag.lineTo(x, AH - j(x + 700));
  for (let y = AH; y >= 0; y -= 4) ag.lineTo(j(y + 1100), y);
  ag.closePath(); ag.fill();
  return { color: c, bump, alpha: al };
}
function scrollMaterial(maps, U) {
  const m = new THREE.MeshStandardMaterial({ map: maps.map, bumpMap: maps.bump, bumpScale: 1.2, alphaMap: maps.alpha, alphaTest: 0.5, roughness: 0.86, side: THREE.DoubleSide });
  m.onBeforeCompile = (sh) => {
    Object.assign(sh.uniforms, U);
    const fn = `uniform float uL; uniform float uR; uniform float uEps; uniform float uTime;
      vec3 scrollPos(vec3 p, out vec3 nrm){
        float d = -p.y; float s = d - uL; nrm = vec3(0.0, 0.0, 1.0);
        vec3 o = p;
        float wave = 0.018 * sin(p.x * 1.6 + 0.7) * smoothstep(0.0, 0.5, d) + 0.03 * (1.0 - smoothstep(0.0, 0.14, d));
        o.z = -wave;
        if (s > 0.0) {
          float phi = s / uR; float r = max(uR - uEps * phi / 6.2831853, 0.03);
          o.y = -uL - r * sin(phi); o.z = uR - r * cos(phi) - wave * (1.0 - smoothstep(0.0, 0.4, s));
          nrm = vec3(0.0, sin(phi), cos(phi));
        }
        return o;
      }`;
    sh.vertexShader = sh.vertexShader
      .replace('#include <common>', '#include <common>\n' + fn)
      .replace('#include <beginnormal_vertex>', 'vec3 sN; vec3 sP = scrollPos(position, sN); vec3 objectNormal = sN;')
      .replace('#include <begin_vertex>', 'vec3 transformed = sP;');
  };
  return m;
}
function wrapLines(ctx, text, max) {
  const words = text.split(/\s+/).filter(Boolean), lines = []; let cur = '';
  for (const w of words) { const tr = cur ? cur + ' ' + w : w; if (ctx.measureText(tr).width > max && cur) { lines.push(cur); cur = w; } else cur = tr; }
  if (cur) lines.push(cur); return lines;
}
function buildDonation(a) {
  const root = new THREE.Group();
  const W = 3.9, PPU = 320, CW = Math.round(W * PPU);
  const amount = a.amountText;
  // layout the message to choose the paper height
  const meas = canvas(8, 8).getContext('2d');
  let size = 52, lines = [];
  for (; size >= 34; size -= 2) { meas.font = `italic 400 ${size}px "IM Fell English", "Cormorant Garamond", serif`; lines = wrapLines(meas, a.msg, CW - 230); if (lines.length * size * 1.3 <= 1500 - 520) break; }
  const LH = Math.round(size * 1.32);
  const ROLLED = 0.7;                          // paper left rolled at the bottom
  const textBottom = 300 + lines.length * LH + 40;
  const CH = Math.round(Math.max(2.3 * PPU, textBottom + ROLLED * PPU));
  const H = CH / PPU;
  const base = parchmentBase(CW, CH, 5);
  const cv = canvas(CW, CH), g = cv.getContext('2d');
  const map = canvasTex(cv, true); map.anisotropy = 8;
  const maps = { map, bump: canvasTex(base.bump, false), alpha: canvasTex(base.alpha, false) };
  const U = { uL: { value: 0 }, uR: { value: 0.17 }, uEps: { value: 0.012 }, uTime: { value: 0 } };
  const paper = new THREE.Mesh(new THREE.PlaneGeometry(W, H, 12, 260).translate(0, -H / 2, 0), scrollMaterial(maps, U));
  paper.frustumCulled = false; paper.castShadow = false;
  const TOP = 2.02;
  const scrollG = new THREE.Group(); scrollG.position.set(0, TOP, 0); root.add(scrollG); scrollG.add(paper);
  // ink glyph layout (char positions) -------------------------------------------
  const glyphs = [];
  const header = (ctx) => { ctx.font = '600 64px Cinzel, serif'; };
  header(g);
  const nm = a.name.toUpperCase(), am = amount; const sep = '  ·  ';
  let hs = 64; let hw; do { g.font = `600 ${hs}px Cinzel, serif`; hw = spW(g, nm, 3) + g.measureText(sep).width + spW(g, am, 3); hs -= 4; } while (hw > CW - 220 && hs > 34);
  hs += 4; g.font = `600 ${hs}px Cinzel, serif`;
  let x = (CW - hw) / 2;
  for (const ch of nm) { glyphs.push({ ch, x, y: 158, font: g.font, col: '38,24,12' }); x += g.measureText(ch).width + 3; }
  x += g.measureText(sep).width / 2 - g.measureText('·').width / 2; glyphs.push({ ch: '·', x, y: 158, font: g.font, col: '38,24,12' });
  x += g.measureText(sep).width / 2 + g.measureText('·').width / 2;
  for (const ch of am) { glyphs.push({ ch, x, y: 158, font: g.font, col: '92,24,16' }); x += g.measureText(ch).width + 3; }
  const headerN = glyphs.length;
  const mf = `italic 400 ${size}px "IM Fell English", "Cormorant Garamond", serif`;
  g.font = mf;
  lines.forEach((ln, li) => {
    const lw = g.measureText(ln).width; let lx = (CW - lw) / 2; const y = 300 + size * 0.9 + li * LH;
    for (let k = 0; k < ln.length; k++) { glyphs.push({ ch: ln[k], x: lx + g.measureText(ln.slice(0, k)).width, y, font: mf, col: '34,22,12' }); }
  });
  // timeline
  const T_ARR = 0.8, T_CRACK = 1.05, T_UN0 = 1.3, T_UN = 1.1 + H * 0.3, T_W0 = T_UN0 + T_UN + 0.15;
  const T_HDR = 0.8, CPS = 36, T_MSG0 = T_W0 + T_HDR + 0.25, T_MSG = (glyphs.length - headerN) / CPS;
  const dur = Math.max(8.5, T_MSG0 + T_MSG + 3.6 + 0.8);
  let lastKey = -1;
  const draw = (t) => {
    let shown = 0, key = 0;
    if (t >= T_W0) { const hp = clamp01((t - T_W0) / T_HDR); shown = headerN * hp; }
    if (t >= T_MSG0) shown = headerN + (t - T_MSG0) * CPS;
    key = Math.round(shown * 4);
    if (key === lastKey) return false; lastKey = key;
    g.globalAlpha = 1; g.drawImage(base.color, 0, 0);
    // rule with a small diamond under the header
    const ra = clamp01((t - T_W0 - 0.3) / 0.6);
    if (ra > 0) {
      g.strokeStyle = `rgba(60,38,18,${0.75 * ra})`; g.lineWidth = 2.2; const hw2 = 240 * ra;
      g.beginPath(); g.moveTo(CW / 2 - hw2, 214); g.lineTo(CW / 2 - 14, 214); g.moveTo(CW / 2 + 14, 214); g.lineTo(CW / 2 + hw2, 214); g.stroke();
      g.fillStyle = `rgba(60,38,18,${0.8 * ra})`; g.beginPath(); g.moveTo(CW / 2, 205); g.lineTo(CW / 2 + 8, 214); g.lineTo(CW / 2, 223); g.lineTo(CW / 2 - 8, 214); g.closePath(); g.fill();
    }
    g.textAlign = 'left'; g.textBaseline = 'alphabetic';
    for (let i = 0; i < glyphs.length && i < shown + 1; i++) {
      const gl = glyphs[i], al = clamp01(shown - i);       // fresh letters fade in as the ink lands
      if (al <= 0) break;
      g.font = gl.font;
      g.fillStyle = `rgba(${gl.col},${0.16 * al})`; g.fillText(gl.ch, gl.x + 0.8, gl.y + 0.8);  // ink bleed
      g.fillStyle = `rgba(${gl.col},${0.9 * al})`; g.fillText(gl.ch, gl.x, gl.y);
    }
    map.needsUpdate = true; return true;
  };
  draw(0);
  // seal on the roll, cracking into two halves
  const sc = sealCanvases('star', 6);
  const half = (side) => {      // alpha = blob limited to one side of a jagged crack
    const c = canvas(512, 512), h = c.getContext('2d'); h.drawImage(sc.ac, 0, 0);
    h.globalCompositeOperation = 'destination-in'; h.fillStyle = '#fff'; h.beginPath();
    const r = rng(17); const pts = []; for (let y = -10; y <= 522; y += 32) pts.push([256 + (r() - 0.5) * 60, y]);
    if (side < 0) { h.moveTo(0, -10); pts.forEach(([px, py]) => h.lineTo(px, py)); h.lineTo(0, 522); }
    else { h.moveTo(512, -10); pts.forEach(([px, py]) => h.lineTo(px, py)); h.lineTo(512, 522); }
    h.closePath(); h.fill(); return c;
  };
  const sealG = new THREE.Group(); scrollG.add(sealG);
  const halves = [-1, 1].map((sd) => {
    const geo = new THREE.PlaneGeometry(0.4, 0.4, 140, 140);
    const p = geo.attributes.position; const RB = 0.185;
    for (let i = 0; i < p.count; i++) { const y = p.getY(i); p.setZ(i, Math.sqrt(Math.max(RB * RB - y * y, 0)) - RB); }
    geo.computeVertexNormals();
    const mat = sealMaterial(0x2f5a3e, sc, half(sd)); mat.displacementScale = 0.045; mat.transparent = true;
    const m = new THREE.Mesh(geo, mat); m.castShadow = true; sealG.add(m); return { m, mat, sd };
  });
  sealG.position.set(0, 0, 0.36);
  const cue = cues();
  return {
    root, duration: dur,
    update(t) {
      glEl.style.opacity = smooth(0, 0.15, t) * (1 - smooth(dur - 0.8, dur, t));
      wt.scene.environmentRotation.y = -0.5 + t * 0.1;
      // arrival: the sealed roll is lowered in
      const ar = easeOut(t / T_ARR);
      scrollG.position.y = TOP + 1.9 * (1 - ar);
      scrollG.rotation.z = 0.1 * (1 - ar);
      scrollG.rotation.x = -0.25 * (1 - ar);
      // seal cracks; halves fall away
      const s = t - T_CRACK;
      halves.forEach(({ m, mat, sd }) => {
        if (s < 0) { m.position.set(0, 0, 0); m.rotation.set(0, 0, 0); mat.opacity = 1; m.visible = true; return; }
        m.position.set(sd * (0.05 * s + 0.5 * s * s * 0.6), -1.8 * s * s - 0.02 * s, 0.25 * s);
        m.rotation.set(-1.4 * s, sd * 1.2 * s, sd * 1.8 * s);
        mat.opacity = 1 - smooth(0.25, 0.7, s); m.visible = s < 0.75;
      });
      if (cue('crack', t, T_CRACK)) { const wp = new THREE.Vector3(); sealG.getWorldPosition(wp); burst.fire(wp, t, 0.35, 0.2); sfx.crack(); }
      // unroll
      const un = easeInOut((t - T_UN0) / T_UN);
      U.uL.value = (H - ROLLED) * un;
      if (cue('rustle', t, T_UN0)) sfx.rustle(T_UN);
      if (cue('thud', t, T_UN0 + T_UN - 0.05)) sfx.thud();
      // ink
      if (draw(t) && t > T_W0 && t < T_MSG0 + T_MSG && Math.floor(t * 9) !== Math.floor((t - 0.02) * 9)) sfx.scratch();
      shake(0);
    },
  };
}

/* ------------------------------------------------------------------ main */
let cur = null; const queue = [];
const BUILD = { follow: buildFollow, sub: buildSub, bits: buildBits, donation: buildDonation };
const OPTS = {
  transparent: true, shadows: true, bloom: false, vignette: false, pixelRatio: 1,
  exposure: 1.05, env: 0.5, table: false, board: false, candle: false, dust: false, rim: 0.4, ambient: 0.4, fog: false, autoStart: false,
};
function disposeTree(o) {
  o.traverse((m) => {
    m.geometry?.dispose?.();
    const mats = Array.isArray(m.material) ? m.material : m.material ? [m.material] : [];
    for (const mt of mats) { for (const k of ['map', 'bumpMap', 'roughnessMap', 'alphaMap', 'displacementMap']) if (mt[k] && mt[k] !== _brass && mt[k] !== _coinTex && !(_velvet && (mt[k] === _velvet.alpha || mt[k] === _velvet.bump || mt[k] === _velvet.map))) mt[k].dispose(); mt.dispose(); }
  });
}
function mkAlert(type, extra = {}) {
  const amt = +(q.get('amount') || 10);
  return {
    type: type === 'gift' ? 'sub' : type, name: q.get('name') || NAME,
    amount: +(extra.bits ?? q.get('bits') ?? 500),
    tier: q.get('tier') || '1', months: +(q.get('months') || 1), gift: type === 'gift' ? +(q.get('gift') || extra.gift || 5) : +(q.get('gift') || 0),
    amountText: extra.amountText || (q.get('cur') === 'eur' ? `€${amt}` : `$${amt}`),
    msg: extra.msg || MSG,
  };
}
function trigger(type, extra) {
  const a = mkAlert(type, extra);
  if (cur) { queue.push(a); return; }
  begin(a);
}
function begin(a) {
  burst.reset();
  const al = BUILD[a.type](a);
  wt.scene.add(al.root);
  cur = { a, al, t: 0 };
  al.update(0);
  if (!SHOT) wt.start();
}
function finish() {
  wt.scene.remove(cur.al.root); cur.al.dispose?.(); disposeTree(cur.al.root);
  cur = null; glEl.style.opacity = 0; txt.innerHTML = ''; cam.style.boxShadow = ''; shake(0);
  wt.stop();
  if (queue.length) begin(queue.shift());
}

async function main() {
  await waitFonts();
  wt = createWarTable(glEl, OPTS);
  // warm "candle room" environment instead of the neutral grey studio: brass reads golden, clearcoats reflect warm light
  {
    const es = new THREE.Scene();
    const room = new THREE.Mesh(new THREE.BoxGeometry(20, 12, 20), new THREE.MeshBasicMaterial({ color: 0x140c07, side: THREE.BackSide })); es.add(room);
    const panel = (w, h, col, k, pos) => { const m = new THREE.Mesh(new THREE.PlaneGeometry(w, h), new THREE.MeshBasicMaterial({ color: new THREE.Color(col).multiplyScalar(k), side: THREE.DoubleSide })); m.position.set(...pos); m.lookAt(0, 0, 0); es.add(m); };
    panel(5, 3, 0xffb066, 9, [-6, 4, 6]);       // the candle, upper left front
    panel(14, 7, 0xffdcac, 1.6, [-1, 1.5, 9.5]);
    panel(5, 4, 0xffe6c4, 1.3, [-3.5, 5.6, 2.5]);     // dim warm ceiling (what tilted trays mirror) // broad warm glow behind the viewer (what flat brass mirrors)
    panel(3, 2, 0xff9a4a, 2.2, [7, 1, 5]);      // warm bounce right
    panel(7, 6, 0xffdcae, 2.4, [0.5, 5.9, 0.5]);  // warm overhead bounce: what the tilted bits tray and its coins mirror
    panel(12, 1.2, 0x5a3a22, 1.2, [0, -5.5, 2]); // table glow below
    panel(4, 3, 0x6c7c96, 0.5, [3, 6, -8]);     // faint cool window behind
    const pm = new THREE.PMREMGenerator(wt.renderer);
    wt.scene.environment = pm.fromScene(es, 0.03).texture;
  }
  wt.scene.environmentIntensity = 0.8;
  wt.hemi.intensity = 0.3;
  key = new THREE.DirectionalLight(0xffc790, 2.9);
  key.position.set(-3.5, 4.2, 5.5); key.castShadow = true;
  key.shadow.mapSize.set(2048, 2048); key.shadow.bias = -0.0003; key.shadow.normalBias = 0.015; key.shadow.radius = 4;
  Object.assign(key.shadow.camera, { left: -5, right: 5, top: 4, bottom: -4, near: 0.5, far: 20 });
  wt.scene.add(key, key.target);
  const fill = new THREE.PointLight(0xffa860, 6, 14, 2); fill.position.set(4.5, 1.5, 4); wt.scene.add(fill);   // warm bounce from the candle side
  wt.camera.fov = 24; wt.camera.near = 0.5; wt.camera.far = 40; wt.camera.updateProjectionMatrix();
  wt.camera.position.set(0.45, 0.6, 10); wt.camera.lookAt(0, 0.2, 0);
  shake(0);
  burst = makeBurst(90, 5); wt.scene.add(burst.points);
  wt.onTick((dt) => {
    if (!cur) return;
    cur.t += dt;
    cur.al.update(cur.t); burst.update(cur.t);
    if (cur.t > cur.al.duration) finish();
  });
  document.querySelectorAll('#panel [data-a]').forEach((b) => {
    b.onclick = () => { ac(); trigger(b.dataset.a, b.dataset.bits ? { bits: +b.dataset.bits } : b.dataset.gift ? { gift: +b.dataset.gift } : undefined); };
  });
  window.__alerts = { trigger, wt };
  if (SHOT) {
    setTimeout(() => {
      const t = q.get('alert') || 'sub';
      trigger(BUILD[t] || t === 'gift' ? t : 'sub');
      wt.advance(SHOT_T);
      document.title = 'ready t=' + cur?.t?.toFixed(2);
      console.log('alerts ready alert=' + t + ' t=' + (cur?.t ?? 0).toFixed(2));
    }, 600);
  }
}
main().catch((e) => console.log('alerts error ' + e + (e.stack ? '\n' + e.stack : '')));
