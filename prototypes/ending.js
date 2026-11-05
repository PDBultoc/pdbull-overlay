// Ending scene prototype ("Thanks for watching", shown after the stream while chat keeps going).
//   ?v=1  "Candle out": the candle gutters and goes out (smoke thread, ember on the wick), the room cools and dims;
//         a letter on the table is written in ink: "Thanks for watching" / "See you next time".
//   ?v=2  "Map rolled up": tokens slide into a wooden box, the map rolls into a scroll tied with a red ribbon and a wax
//         seal, a brass plate settles on the table; the candle, burnt low, still burns.
// Opening beat <= 8 s, then a steady state that can run for hours (bounded drift/flicker only, nothing accumulates).
// Review-only query (off by default): ?shot=1 (deterministic frame) &t=<seconds> &demo=1 (sample chat) &q=low
//   &moon=<k> (v1 cool light multiplier) &lamp=<k> (v2 plate lamp multiplier)
import { createWarTable, makeTable, fitStage, THREE } from '../shared/war-table.js';
import { makeCampaignMap, makeToken, makeBanner, makeProp, AGES } from '../shared/campaign.js';
import { createScene } from '../core/scene.js';
import { connect } from '../core/twitchchat.js';
import { addLine } from '../core/brbchat.js';

const Q = new URLSearchParams(location.search);
const V = Q.get('v') === '2' ? 2 : 1;
const LOW = Q.get('q') === 'low'; // quality knob (OBS source URL): fewer dust/smoke particles, smaller shadow map
console.log('ending quality=' + (LOW ? 'low' : 'full') + ' variant=' + V);
const SHOT = Q.get('shot') === '1';
if (SHOT) document.body.classList.add('shot');
fitStage(document.getElementById('stage'));
for (const b of document.querySelectorAll('#panel button')) {
  b.classList.toggle('on', +b.dataset.v === V);
  b.addEventListener('click', () => { const p = new URLSearchParams(location.search); p.set('v', b.dataset.v); location.search = p.toString(); });
}

/* ------------------------------------------------------------------ utils */
const clamp01 = (x) => Math.min(1, Math.max(0, x));
const smooth = (a, b, x) => { const t = clamp01((x - a) / (b - a)); return t * t * (3 - 2 * t); };
const easeOut3 = (x) => 1 - Math.pow(1 - clamp01(x), 3);
const easeIO = (x) => { const t = clamp01(x); return t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2; };
function rng(seed) { return () => { seed |= 0; seed = (seed + 0x6d2b79f5) | 0; let t = Math.imul(seed ^ (seed >>> 15), 1 | seed); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; }; }
function canvas(w, h) { const c = document.createElement('canvas'); c.width = w; c.height = h; return c; }
async function fontsReady() {
  const wait = Promise.all([
    document.fonts.load('italic 500 120px "Cormorant Garamond"'), document.fonts.load('italic 600 40px "Cormorant Garamond"'),
    document.fonts.load('600 40px "Cinzel"'), document.fonts.load('500 20px "Inter"'),
  ]).catch(() => {});
  await Promise.race([wait, new Promise((r) => setTimeout(r, 2500))]);
}
function canvasTexture(c, { srgb = true, aniso = 8 } = {}) {
  const t = new THREE.CanvasTexture(c);
  if (srgb) t.colorSpace = THREE.SRGBColorSpace;
  t.anisotropy = aniso; t.needsUpdate = true;
  return t;
}

/* ------------------------------------------------------------------ chat (same markup/behaviour as scenes/brb.js) */
const CHAT_MAX = 3;
let chatLines = [];
function pushChat(msg) {
  const next = addLine(chatLines, msg, CHAT_MAX);
  if (next === chatLines) return;
  chatLines = next;
  const l = next[next.length - 1], box = document.getElementById('chat');
  const d = document.createElement('div'); d.className = 'msg';
  const b = document.createElement('b'); b.style.color = l.color; b.textContent = l.user;
  d.append(b, document.createTextNode(l.text)); box.append(d);
  while (box.children.length > CHAT_MAX) box.firstChild.remove();
  [...box.children].forEach((m, i, arr) => m.classList.toggle('old', i < arr.length - 1));
}

/* ------------------------------------------------------------------ parchment canvas (own, used by letter and scroll) */
function parchmentCanvas(w, h, seed = 5, { dark = 1 } = {}) {
  const c = canvas(w, h), g = c.getContext('2d'), r = rng(seed);
  const base = g.createRadialGradient(w * 0.45, h * 0.42, h * 0.1, w / 2, h / 2, Math.hypot(w, h) * 0.55);
  base.addColorStop(0, '#e6d3a8'); base.addColorStop(0.7, '#d4bb88'); base.addColorStop(1, '#b99a63');
  g.fillStyle = base; g.fillRect(0, 0, w, h);
  for (let i = 0; i < 26; i++) { // soft stains
    const x = r() * w, y = r() * h, rad = (0.05 + r() * 0.16) * w;
    const s = g.createRadialGradient(x, y, 0, x, y, rad);
    s.addColorStop(0, `rgba(120,84,36,${0.05 + r() * 0.07})`); s.addColorStop(1, 'rgba(120,84,36,0)');
    g.fillStyle = s; g.fillRect(x - rad, y - rad, rad * 2, rad * 2);
  }
  for (let i = 0; i < Math.floor(w * h / 900); i++) { // fibres / speckle
    g.fillStyle = `rgba(${r() < 0.5 ? '90,60,26' : '250,236,200'},${0.03 + r() * 0.07})`;
    g.fillRect(r() * w, r() * h, 1 + r() * 3, 1);
  }
  const edge = g.createLinearGradient(0, 0, w, 0); // burnt-in edge darkening
  for (const [a, b] of [[0, 0.5], [1, 0.5]]) edge.addColorStop(a, `rgba(70,40,14,${0.34 * dark})`);
  edge.addColorStop(0.07, 'rgba(70,40,14,0)'); edge.addColorStop(0.93, 'rgba(70,40,14,0)');
  g.fillStyle = edge; g.fillRect(0, 0, w, h);
  const edgeV = g.createLinearGradient(0, 0, 0, h);
  edgeV.addColorStop(0, `rgba(70,40,14,${0.34 * dark})`); edgeV.addColorStop(0.09, 'rgba(70,40,14,0)'); edgeV.addColorStop(0.91, 'rgba(70,40,14,0)'); edgeV.addColorStop(1, `rgba(70,40,14,${0.34 * dark})`);
  g.fillStyle = edgeV; g.fillRect(0, 0, w, h);
  g.strokeStyle = 'rgba(80,52,22,0.16)'; g.lineWidth = 2; // old fold creases
  g.beginPath(); g.moveTo(0, h * 0.5); g.lineTo(w, h * 0.5 + 3); g.moveTo(w * 0.34, 0); g.lineTo(w * 0.34 - 4, h); g.stroke();
  return c;
}

/* ------------------------------------------------------------------ dressing shared by both variants */
function dressRoom(wt) {
  wt.candle.updateMatrixWorld(true); // aimDrips/flameWorldPos read matrixWorld before the first render
  wt.hemi.intensity = 0.07; if (wt.rim) { wt.rim.intensity = 0; wt.rim.visible = false; }
  const warm = []; // [light, baseIntensity] for the v1 dimming
  const L = (light, pos) => { light.position.set(...pos); wt.scene.add(light); warm.push([light, light.intensity]); return light; };
  const ext = makeTable({ width: 60, depth: 40, seed: 17 }); ext.position.set(0, -0.61, -30.4); wt.scene.add(ext);
  const wall = new THREE.Mesh(new THREE.PlaneGeometry(80, 18), new THREE.MeshStandardMaterial({ color: 0x4a2f1c, roughness: 0.9 }));
  wall.position.set(0, 8, -50.4); wt.scene.add(wall);
  L(new THREE.PointLight(0xff9a52, 22, 0, 2), [5.6, 1.5, -6.2]);
  L(new THREE.PointLight(0xff9448, 60, 0, 2), [-3, 1.2, -9]);
  L(new THREE.PointLight(0xffa05a, 14, 0, 2), [6.5, 3.4, 0.6]);
  L(new THREE.PointLight(0xff8a40, 280, 0, 2), [0, 7, -41]);
  // the walnut's clearcoat mirrored every point light as a hot glint at this camera angle: tame it
  for (const tb of [wt.table, ext]) if (tb && tb.material) { tb.material.clearcoat = 0.25; tb.material.specularIntensity = 0.3; }
  const bgWarm = new THREE.Color(0x140c07);
  wt.scene.background = bgWarm.clone(); if (wt.scene.fog) wt.scene.fog.color.copy(bgWarm);
  wt.candle.userData.waxGlow.value = 0.35;
  wt.candle.userData.glow.visible = false;
  // bounded dust drift: the shared dust shader drifts +0.02*t in x, which would carry it out of the room within an hour
  if (wt.dust) {
    const m = wt.dust.material; m.vertexShader = m.vertexShader.replace('uTime * 0.02', 'sin(uTime * 0.0131) * 1.5'); m.needsUpdate = true;
  }
  return { warm, bgWarm };
}

function mapSetup(wt, { width, depth, x, z, seed = 3 }) {
  const map = makeCampaignMap({ width, depth, seed, colour: 'red' });
  const LIFT = 0.006; map.position.set(x, LIFT, z);
  wt.scene.add(map); map.userData.attach(wt);
  const U = map.userData, F = U.features, Y = (px, pz) => U.surfaceY(px, pz) + LIFT;
  const bw = U.width + 0.7, bd = U.depth + 0.7;
  const blot = new THREE.Mesh(new THREE.BoxGeometry(bw, 0.02, bd), new THREE.MeshPhysicalMaterial({ color: 0x2c1a10, roughness: 0.62, clearcoat: 0.2, clearcoatRoughness: 0.7 }));
  blot.position.set(x, -0.008, z); blot.receiveShadow = true; wt.scene.add(blot);
  const brass = new THREE.MeshPhysicalMaterial({ color: 0xb48a48, metalness: 1, roughness: 0.38 });
  for (const [w, d, ox, oz] of [[bw, 0.05, 0, bd / 2], [bw, 0.05, 0, -bd / 2], [0.05, bd, bw / 2, 0], [0.05, bd, -bw / 2, 0]]) {
    const e = new THREE.Mesh(new THREE.BoxGeometry(w, 0.026, d), brass); e.position.set(x + ox, 0.002, z + oz); e.receiveShadow = true; wt.scene.add(e);
  }
  U.setAge('castle', { duration: 0 });
  return { map, U, F, Y, LIFT };
}

/* ================================================================== VARIANT 1: candle out + letter */
const T_OUT = 3.2;      // the flame goes out
const INK_T0 = 2.6;     // letter starts being written
const INK_TITLE = 3.5;  // seconds the title takes
const INK_SUB0 = 6.4, INK_SUB = 1.5;

const THREAD_VS = /* glsl */`
uniform float uTime; uniform float uOut; uniform vec3 uSrc; uniform float uPix; uniform float uSize; uniform float uOn;
attribute float aSeed;
varying float vA; varying float vSeed;
void main(){
  float since = uTime - uOut;
  float life = 7.0;
  float k = fract(uTime / life + aSeed);
  float y = k * 1.9;
  float turb = smoothstep(0.12, 1.0, k);
  float puff = exp(-max(since, 0.0) * 0.8);
  vec3 pos = uSrc + vec3(0.0, 0.03 + y, 0.0);
  float ph = y * 5.5 - uTime * 0.9 + aSeed * 6.283;
  float curl = sin(ph) * 0.010 * (0.2 + turb * 2.4);
  pos.x += curl + sin(y * 3.1 - uTime * 0.55) * 0.05 * turb * turb + 0.06 * turb * turb;
  pos.z += cos(ph) * 0.010 * (0.2 + turb * 2.4) + cos(y * 2.7 - uTime * 0.45) * 0.04 * turb * turb;
  float front = smoothstep(0.0, 0.25, since * 0.55 - y);          // the thread climbs from the wick at ~0.55 u/s
  vA = smoothstep(0.0, 0.05, k) * (1.0 - smoothstep(0.5, 1.0, k)) * uOn * front * (1.0 + 2.2 * puff * (1.0 - turb));
  vSeed = aSeed;
  vec4 mv = modelViewMatrix * vec4(pos, 1.0);
  gl_PointSize = uSize * (1.0 + turb * 2.6 + puff * 1.0) * uPix / -mv.z;
  gl_Position = projectionMatrix * mv;
}`;
const THREAD_FS = /* glsl */`
uniform vec3 uColor; uniform float uOpacity;
varying float vA; varying float vSeed;
void main(){
  vec2 c = gl_PointCoord - 0.5; float r2 = dot(c, c) * 4.0;
  float a = exp(-r2 * 2.8) * (0.75 + 0.5 * fract(sin(vSeed * 91.3) * 437.5)) * vA * uOpacity;
  if (a < 0.002) discard;
  gl_FragColor = vec4(uColor, a);
}`;

function makeThread(wt, src) {
  const n = LOW ? 260 : 520, r = rng(21), ws = new Float32Array(n);
  for (let i = 0; i < n; i++) ws[i] = (i + r()) / n;
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.BufferAttribute(new Float32Array(n * 3), 3));
  geo.setAttribute('aSeed', new THREE.BufferAttribute(ws, 1));
  const pixK = () => wt.renderer.domElement.height / (2 * Math.tan(THREE.MathUtils.degToRad(wt.camera.fov / 2)));
  const mat = new THREE.ShaderMaterial({
    uniforms: { uTime: { value: 0 }, uOut: { value: 1e9 }, uSrc: { value: src.clone() }, uPix: { value: pixK() }, uSize: { value: 0.024 }, uOn: { value: 0 },
      uColor: { value: new THREE.Color(0.34, 0.35, 0.40) }, uOpacity: { value: 0.2 } },
    vertexShader: THREAD_VS, fragmentShader: THREAD_FS, transparent: true, depthWrite: false,
  });
  const pts = new THREE.Points(geo, mat); pts.frustumCulled = false; pts.renderOrder = 12; wt.scene.add(pts);
  return { mat, pts, pixK };
}

// Letter: the ink is a "reveal-time map" (R = ink coverage, G = time the pen reaches that pixel, 0..12 s)
function buildInkMaps(W, H, fonts) {
  const tc = canvas(W, H), g = tc.getContext('2d');
  const lines = [
    { text: 'Thanks for watching', cy: H * 0.40, wFrac: 0.80, t0: INK_T0, dur: INK_TITLE },
    { text: 'See you next time', cy: H * 0.70, wFrac: 0.40, t0: INK_SUB0, dur: INK_SUB },
  ];
  const ink = ctxInk(W, H);
  for (const ln of lines) {
    g.clearRect(0, 0, W, H);
    let size = 200; g.font = `italic 500 ${size}px ${fonts}`;
    size = Math.floor(size * (W * ln.wFrac) / g.measureText(ln.text).width); g.font = `italic 500 ${size}px ${fonts}`;
    g.fillStyle = '#fff'; g.textBaseline = 'middle'; g.textAlign = 'left';
    const total = g.measureText(ln.text).width, x0 = (W - total) / 2;
    g.fillText(ln.text, x0, ln.cy);
    const xs = []; for (let i = 0; i <= ln.text.length; i++) xs.push(x0 + g.measureText(ln.text.slice(0, i)).width);
    const wts = []; let sum = 0;
    for (let i = 0; i < ln.text.length; i++) { const w = ln.text[i] === ' ' ? (xs[i + 1] - xs[i]) * 0.5 : (xs[i + 1] - xs[i]) + size * 0.12; wts.push(w); sum += w; }
    const ts = []; let acc = 0; for (let i = 0; i < wts.length; i++) { ts.push(ln.t0 + ln.dur * acc / sum); acc += wts[i]; }
    const y0 = Math.max(0, Math.floor(ln.cy - size * 0.75)), y1 = Math.min(H, Math.ceil(ln.cy + size * 0.75));
    const px = g.getImageData(0, y0, W, y1 - y0).data;
    let gi = 0;
    for (let y = y0; y < y1; y++) {
      const ly = clamp01((y - (ln.cy - size * 0.62)) / (size * 1.2));
      gi = 0;
      // G (pen time) is filled over the whole text band, not only on ink pixels: bilinear filtering then never
      // blends a real time with 0 at a glyph edge (that would draw a ghost outline of the text before it is written)
      for (let x = Math.max(0, Math.floor(xs[0]) - 14); x < Math.min(W, Math.ceil(xs[xs.length - 1]) + 14); x++) {
        const a = px[((y - y0) * W + x) * 4 + 3];
        while (gi < ln.text.length - 1 && x >= xs[gi + 1]) gi++;
        const lx = clamp01((x - xs[gi]) / Math.max(1, xs[gi + 1] - xs[gi]));
        const f = 0.62 * lx + 0.38 * ly;                      // pen sweeps across the glyph, down-and-right
        const tt = ts[gi] + (wts[gi] / sum) * ln.dur * f * 1.15;
        const o = (y * W + x) * 4;
        ink.data[o] = Math.max(ink.data[o], a); ink.data[o + 1] = Math.min(255, Math.round(tt / 12 * 255)); ink.data[o + 3] = 255;
      }
    }
  }
  for (let i = 3; i < ink.data.length; i += 4) ink.data[i] = 255;
  const out = canvas(W, H); out.getContext('2d').putImageData(ink, 0, 0);
  return out;
}
function ctxInk(W, H) { return new ImageData(W, H); }

function makeLetter(wt, uNow) {
  const W = 1664, H = 1008, fonts = '"Cormorant Garamond", Georgia, serif';
  const paper = canvasTexture(parchmentCanvas(W, H, 8));
  const inkTex = canvasTexture(buildInkMaps(W, H, fonts), { srgb: false });
  const mat = new THREE.MeshStandardMaterial({ map: paper, roughness: 0.92, envMapIntensity: 0.3 });
  mat.onBeforeCompile = (sh) => {
    sh.uniforms.uInk = { value: inkTex }; sh.uniforms.uNow = uNow;
    sh.fragmentShader = sh.fragmentShader.replace('#include <common>', '#include <common>\nuniform sampler2D uInk; uniform float uNow;')
      .replace('#include <map_fragment>', `#include <map_fragment>
        { vec4 ik = texture2D(uInk, vMapUv); float tI = ik.g * 12.0; float a = ik.r * smoothstep(0.0, 0.07, uNow - tI);
          vec3 inkC = mix(vec3(0.004, 0.005, 0.012), vec3(0.085, 0.055, 0.034), smoothstep(0.0, 4.0, uNow - tI));
          diffuseColor.rgb = mix(diffuseColor.rgb, inkC, a * 0.97); }`);
  };
  mat.customProgramCacheKey = () => 'ending-letter';
  const SX = 4.8, SZ = 2.91, geo = new THREE.PlaneGeometry(SX, SZ, 64, 40);
  geo.rotateX(-Math.PI / 2);
  const p = geo.attributes.position, r = rng(4);
  for (let i = 0; i < p.count; i++) {
    const u = p.getX(i) / (SX / 2), v = p.getZ(i) / (SZ / 2);
    const e = Math.max(0, Math.abs(u) - 0.86) / 0.14, e2 = Math.max(0, Math.abs(v) - 0.86) / 0.14;
    p.setY(i, 0.004 + 0.012 * e * e + 0.012 * e2 * e2 + 0.003 * Math.sin(u * 3.1 + v * 2.2));
  }
  geo.computeVertexNormals();
  const m = new THREE.Mesh(geo, mat); m.castShadow = true; m.receiveShadow = true;
  m.position.set(-0.2, 0.012, 5.15); m.rotation.y = 0.04;
  wt.scene.add(m);
  return m;
}

function makeInkwell() {
  const g = new THREE.Group();
  const glass = new THREE.MeshPhysicalMaterial({ color: 0x0c0a09, roughness: 0.12, clearcoat: 1, clearcoatRoughness: 0.08 });
  const brass = new THREE.MeshPhysicalMaterial({ color: 0xb48a48, metalness: 1, roughness: 0.38 });
  const body = new THREE.Mesh(new THREE.CylinderGeometry(0.13, 0.15, 0.15, 36), glass); body.position.y = 0.075; body.castShadow = true; g.add(body);
  const neck = new THREE.Mesh(new THREE.CylinderGeometry(0.075, 0.09, 0.05, 28), glass); neck.position.y = 0.175; neck.castShadow = true; g.add(neck);
  const ring = new THREE.Mesh(new THREE.TorusGeometry(0.078, 0.012, 10, 28), brass); ring.rotation.x = Math.PI / 2; ring.position.y = 0.205; g.add(ring);
  const quill = new THREE.Group();
  const shaft = new THREE.Mesh(new THREE.CylinderGeometry(0.004, 0.009, 1.05, 8), new THREE.MeshStandardMaterial({ color: 0xe2d4b4, roughness: 0.6 }));
  shaft.castShadow = true; quill.add(shaft);
  const vane = new THREE.Mesh(new THREE.PlaneGeometry(0.14, 0.78, 1, 6), new THREE.MeshStandardMaterial({ color: 0xcfc2a2, roughness: 0.85, side: THREE.DoubleSide }));
  vane.position.set(0.05, 0.16, 0); vane.castShadow = true; quill.add(vane);
  quill.position.set(0.18, 0.3, 0.1); quill.rotation.set(0.3, 0.4, -1.12);
  g.add(quill);
  return g;
}

function buildV1Full(wt, room) {
  const cam = new THREE.Vector3(1.2, 6.8, 10.6), look = new THREE.Vector3(0.9, 0.0, 4.6);
  wt.camera.position.copy(cam); wt.camera.lookAt(look);
  wt.candle.userData.aimDrips(cam);
  const { map, U, F, Y } = mapSetup(wt, { width: 11, depth: 7.4, x: 0, z: -1.4 });
  const [vx, vz] = F.village;
  U.reveal(vx, vz, 2.3, { duration: 0 }); U.reveal(F.gold[0][0] + 0.2, F.gold[0][1], 1.2, { duration: 0 });
  U.reveal(-1.2, 2.2, 2.6, { duration: 0 }); U.reveal(1.9, 2.4, 2.1, { duration: 0 });
  U.setFogOpacity(0.8);
  const flame = wt.candle.userData.flameWorldPos();
  const place = (obj, x, z, ry = 0) => { obj.position.set(map.position.x + x, Y(x, z), map.position.z + z); obj.rotation.y = ry; wt.scene.add(obj); return obj; };
  const toks = [place(makeToken('knight', 'red'), vx + 0.35, vz + 1.5), place(makeToken('archer', 'red'), vx - 1.1, vz + 1.05),
    place(makeToken('monk', 'red'), vx - 0.45, vz + 1.6), place(makeToken('knight', 'blue'), 3.9, -2.2), place(makeToken('archer', 'blue'), 4.4, -1.7)];
  for (const tk of toks) tk.userData.faceToward(cam, cam, flame);
  const prop = (type, x, z, ry, s, seed = 1) => { const p = makeProp(type, { seed }); p.scale.setScalar(s); p.position.set(x, 0, z); p.rotation.y = ry; wt.scene.add(p); return p; };
  prop('gold', 4.3, 3.0, 0.3, 1.4); prop('stone', 3.6, 1.4, 0.2, 1.5, 3);

  const uNow = { value: 0 };
  makeLetter(wt, uNow);
  const iw = makeInkwell(); iw.position.set(2.9, 0, 4.4); iw.rotation.y = 2.4; wt.scene.add(iw);

  // cool "moon" light on the letter + a low cool directional fill + a very low warm fill (all ramp in while the candle dies)
  const moonK = +(Q.get('moon') || 0.6);
  const moon = new THREE.SpotLight(0xa6b8da, 0, 0, 0.5, 0.9, 2); moon.position.set(-3.5, 7.5, 7.5); moon.target.position.set(-0.2, 0, 5.1);
  wt.scene.add(moon, moon.target);
  const fill = new THREE.DirectionalLight(0x7388b0, 0); fill.position.set(-6, 9, 5); wt.scene.add(fill);
  const warmFill = new THREE.PointLight(0xff9248, 0, 0, 2); warmFill.position.set(-0.4, 3.0, 4.8); wt.scene.add(warmFill);
  const ember = new THREE.PointLight(0xff7a30, 0, 0, 2); wt.scene.add(ember);

  // ember on the wick: a tiny hot core + a faint halo
  const glowTex = (() => { const c = canvas(64, 64), g = c.getContext('2d'); const gr = g.createRadialGradient(32, 32, 0, 32, 32, 32);
    gr.addColorStop(0, 'rgba(255,170,90,1)'); gr.addColorStop(0.3, 'rgba(255,110,40,0.5)'); gr.addColorStop(1, 'rgba(255,80,20,0)'); g.fillStyle = gr; g.fillRect(0, 0, 64, 64); return new THREE.CanvasTexture(c); })();
  const mkSprite = (scale) => { const s = new THREE.Sprite(new THREE.SpriteMaterial({ map: glowTex, blending: THREE.AdditiveBlending, depthWrite: false, transparent: true, opacity: 0 })); s.scale.set(scale, scale, 1); s.renderOrder = 11; wt.scene.add(s); return s; };
  const emberCore = mkSprite(0.05), emberHalo = mkSprite(0.24);
  const wick = flame.clone(); wick.y -= 0.006;
  emberCore.position.copy(wick); emberHalo.position.copy(wick); ember.position.copy(wick).add(new THREE.Vector3(0, 0.05, 0));
  const thread = makeThread(wt, wick);

  const fl = wt.candle.userData.flame, cu = wt.candle.userData, base = cu.baseIntensity;
  const cool = new THREE.Color(0x6f86b0), warmH = new THREE.Color(0x5a3a22), bgCool = new THREE.Color(0x0a0d15);
  const dust = wt.dust ? { m: wt.dust.material, c: wt.dust.material.uniforms.uColor.value.clone() } : null;
  let lit = true;
  wt.onTick((dt, t) => {
    uNow.value = t;
    // candle gutters, then goes out at T_OUT
    if (lit) {
      const g = smooth(0.7, T_OUT, t);
      const f1 = 0.5 + 0.5 * Math.sin(t * 27 + Math.sin(t * 9) * 2.0), f2 = 0.5 + 0.5 * Math.sin(t * 41 + 1.3);
      const dip = 1 - 0.55 * Math.exp(-Math.pow((t - 2.1) * 6, 2)); // a deep gasp, then it recovers a little
      fl.scale.set(0.035 * (1 - 0.45 * g) * (1 + 0.25 * g * f2), 0.065 * (1 - 0.7 * g) * (1 - 0.3 * g * f1) * dip, 0.035 * (1 - 0.45 * g));
      fl.rotation.z = 0.55 * g * Math.sin(t * 3.3 + 0.4);
      cu.baseIntensity = base * (1 - 0.86 * g) * (0.82 + 0.18 * f1) * dip;
      if (t >= T_OUT) { lit = false; cu.setLit(false); fl.rotation.z = 0; thread.mat.uniforms.uOut.value = t; }
    }
    // the room cools and dims
    const dim = smooth(1.2, 4.6, t), m = smooth(1.6, 5.0, t);
    for (const [l, k] of room.warm) l.intensity = k * (1 - 0.88 * dim);
    wt.hemi.color.copy(warmH).lerp(cool, m); wt.hemi.intensity = 0.07 + 0.11 * m;
    moon.intensity = 170 * moonK * m; fill.intensity = 3.4 * m; warmFill.intensity = 0;
    wt.scene.background.copy(room.bgWarm).lerp(bgCool, m); wt.scene.fog.color.copy(wt.scene.background);
    if (dust) dust.m.uniforms.uColor.value.copy(dust.c).multiplyScalar(1 - 0.65 * dim);
    // ember: slow breathing, never dies
    const on = smooth(T_OUT, T_OUT + 0.4, t);
    const br = 0.78 + 0.22 * Math.sin(t * 1.15) + 0.08 * Math.sin(t * 3.7 + 1.0);
    emberCore.material.opacity = 0.95 * on * br; emberHalo.material.opacity = 0.32 * on * br;
    ember.intensity = 0.9 * on * br;
    // smoke thread: thin steady wisp
    thread.mat.uniforms.uTime.value = t; thread.mat.uniforms.uOn.value = on; thread.mat.uniforms.uPix.value = thread.pixK();
  });
  // steady camera drift: bounded, hours-safe
  wt.onTick((dt, t) => {
    wt.camera.position.set(cam.x + Math.sin(t * 0.0757) * 0.2, cam.y + Math.sin(t * 0.103) * 0.07, cam.z + Math.sin(t * 0.065) * 0.1);
    wt.camera.lookAt(look.x + Math.sin(t * 0.05) * 0.1, look.y, look.z);
  });
}

/* ================================================================== VARIANT 2: map rolled up */
function brassPlateTextures(W, H, fonts) {
  const c = canvas(W, H), g = c.getContext('2d'), r = rng(9);
  const grad = g.createLinearGradient(0, 0, W, H);
  grad.addColorStop(0, '#c49b58'); grad.addColorStop(0.45, '#a98443'); grad.addColorStop(1, '#94722f');
  g.fillStyle = grad; g.fillRect(0, 0, W, H);
  for (let i = 0; i < 1800; i++) { g.fillStyle = `rgba(${r() < 0.5 ? '255,236,190' : '70,46,14'},${0.03 + r() * 0.06})`; g.fillRect(r() * W, r() * H, 40 + r() * 260, 1); } // brushed grain
  g.strokeStyle = 'rgba(60,40,12,0.75)'; g.lineWidth = 5; g.strokeRect(34, 34, W - 68, H - 68);
  g.strokeStyle = 'rgba(255,236,190,0.55)'; g.lineWidth = 2; g.strokeRect(40, 40, W - 80, H - 80); g.strokeRect(24, 24, W - 48, H - 48);
  for (const [sx, sy] of [[78, 78], [W - 78, 78], [78, H - 78], [W - 78, H - 78]]) { // four screws
    const s = g.createRadialGradient(sx - 3, sy - 3, 1, sx, sy, 17); s.addColorStop(0, '#e6c98f'); s.addColorStop(1, '#7d6036');
    g.fillStyle = s; g.beginPath(); g.arc(sx, sy, 17, 0, 7); g.fill();
    g.strokeStyle = 'rgba(40,26,8,0.85)'; g.lineWidth = 4; g.beginPath(); g.moveTo(sx - 11, sy + 3); g.lineTo(sx + 11, sy - 3); g.stroke();
  }
  const bump = canvas(W, H), b = bump.getContext('2d'); b.fillStyle = '#808080'; b.fillRect(0, 0, W, H);
  const engrave = (text, font, cx, cy, maxW) => {
    for (const ctx of [g, b]) { ctx.font = font; ctx.textAlign = 'center'; ctx.textBaseline = 'middle'; }
    let size = parseInt(font.match(/(\d+)px/)[1], 10); const mw = g.measureText(text).width;
    size = Math.floor(size * maxW / mw); const f = font.replace(/\d+px/, size + 'px');
    for (const ctx of [g, b]) ctx.font = f;
    g.fillStyle = 'rgba(255,238,196,0.6)'; g.fillText(text, cx + 2.5, cy + 3);     // lit lower lip of the cut
    g.fillStyle = '#34240c'; g.fillText(text, cx, cy);                              // dark floor of the cut
    g.fillStyle = 'rgba(0,0,0,0.25)'; g.fillText(text, cx - 1.2, cy - 1.5);        // upper wall shadow
    b.fillStyle = '#000'; b.fillText(text, cx, cy);
    return size;
  };
  engrave('Thanks for watching', '600 150px "Cinzel", "Cormorant Garamond", serif', W / 2, H * 0.38, W * 0.80);
  // small divider
  g.strokeStyle = '#34240c'; g.lineWidth = 3; g.beginPath(); g.moveTo(W * 0.36, H * 0.62); g.lineTo(W * 0.47, H * 0.62); g.moveTo(W * 0.53, H * 0.62); g.lineTo(W * 0.64, H * 0.62); g.stroke();
  g.fillStyle = '#34240c'; g.save(); g.translate(W / 2, H * 0.62); g.rotate(Math.PI / 4); g.fillRect(-6, -6, 12, 12); g.restore();
  engrave('See you next time', 'italic 600 100px "Cormorant Garamond", serif', W / 2, H * 0.79, W * 0.27);
  const bb = bump.getContext('2d'); bb.filter = 'blur(1.5px)'; bb.drawImage(bump, 0, 0);
  return { color: c, bump };
}

function makePlate(wt, lampK) {
  const g = new THREE.Group();
  const walnut = new THREE.MeshStandardMaterial({ color: 0x4a2c18, roughness: 0.5 });
  const sh = new THREE.Shape(); sh.moveTo(-0.6, 0); sh.lineTo(0.6, 0); sh.lineTo(0.6, 0.6); sh.lineTo(-0.6, 0.10); sh.closePath();
  const wg = new THREE.ExtrudeGeometry(sh, { depth: 4.7, bevelEnabled: false }); wg.rotateY(Math.PI / 2); wg.translate(-2.35, 0, 0);
  const wedge = new THREE.Mesh(wg, walnut); wedge.castShadow = wedge.receiveShadow = true; g.add(wedge);
  const th = Math.atan2(0.5, 1.2);
  const brass = new THREE.MeshStandardMaterial({ color: 0xb08a4c, metalness: 0.6, roughness: 0.42, envMap: wt.scene.environment, envMapIntensity: 0.6 });
  const slab = new THREE.Group(); slab.rotation.x = th;
  slab.position.set(0, 0.35, 0).add(new THREE.Vector3(0, Math.cos(th), Math.sin(th)).multiplyScalar(0.03));
  const body = new THREE.Mesh(new THREE.BoxGeometry(4.5, 0.05, 1.14), brass); body.castShadow = body.receiveShadow = true; slab.add(body);
  const tex = brassPlateTextures(2048, 500, '');
  const face = new THREE.Mesh(new THREE.PlaneGeometry(4.44, 1.08),
    new THREE.MeshStandardMaterial({ map: canvasTexture(tex.color), bumpMap: canvasTexture(tex.bump, { srgb: false }), bumpScale: 2.2, metalness: 0.6, roughness: 0.4, envMap: wt.scene.environment, envMapIntensity: 0.6 }));
  face.rotation.x = -Math.PI / 2; face.position.y = 0.0262; face.receiveShadow = true; slab.add(face);
  g.add(slab);
  // a low warm lamp so the brass reads (the candle sits low and to the side)
  const lamp = new THREE.PointLight(0xffa860, 6 * lampK, 0, 2); lamp.position.set(-1.8, 2.3, 1.9); g.add(lamp);
  g.userData.lamp = lamp;
  return g;
}

function makeBox() {
  const g = new THREE.Group();
  const wood = new THREE.MeshStandardMaterial({ color: 0x5a3720, roughness: 0.55 });
  const inner = new THREE.MeshStandardMaterial({ color: 0x1c1009, roughness: 0.9 });
  const brass = new THREE.MeshPhysicalMaterial({ color: 0xb48a48, metalness: 1, roughness: 0.4 });
  const SX = 1.15, SZ = 1.7, H = 0.5, T = 0.06;
  const add = (w, h, d, x, y, z, mat) => { const m = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), mat); m.position.set(x, y, z); m.castShadow = m.receiveShadow = true; g.add(m); return m; };
  add(SX, T, SZ, 0, T / 2, 0, inner);
  add(SX, H, T, 0, H / 2, SZ / 2 - T / 2, wood); add(SX, H, T, 0, H / 2, -SZ / 2 + T / 2, wood);
  add(T, H, SZ, SX / 2 - T / 2, H / 2, 0, wood); add(T, H, SZ, -SX / 2 + T / 2, H / 2, 0, wood);
  for (const [w, d, x, z] of [[SX + 0.02, 0.025, 0, SZ / 2], [SX + 0.02, 0.025, 0, -SZ / 2], [0.025, SZ + 0.02, SX / 2, 0], [0.025, SZ + 0.02, -SX / 2, 0]]) add(w, 0.022, d, x, H + 0.002, z, brass);
  add(0.16, 0.12, 0.02, 0, 0.3, SZ / 2 + 0.012, brass);
  return g;
}

function ribbonStrip(points, width) { // flat strip following points, width along z
  const pos = [], idx = [];
  points.forEach((p, i) => { pos.push(p.x, p.y, p.z - width / 2, p.x, p.y, p.z + width / 2); if (i) { const a = (i - 1) * 2; idx.push(a, a + 1, a + 2, a + 1, a + 3, a + 2); } });
  const geo = new THREE.BufferGeometry(); geo.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3)); geo.setIndex(idx); geo.computeVertexNormals();
  return geo;
}

function buildV2(wt, room) {
  const lampK = +(Q.get('lamp') || 1);
  const cam = new THREE.Vector3(0.2, 5.8, 10.0), look = new THREE.Vector3(0.0, 0.2, 4.2);
  wt.camera.position.copy(cam); wt.camera.lookAt(look);
  wt.candle.userData.setHeight(0.45); wt.candle.userData.aimDrips(cam);
  const MW = 7.2, MD = 4.8, MX = -0.4, MZ = 0.4;
  const { map, U, F, Y, LIFT } = mapSetup(wt, { width: MW, depth: MD, x: MX, z: MZ });
  U.clearFog(); U.setFogVisible(false);
  wt.renderer.localClippingEnabled = true;
  const plane = new THREE.Plane(new THREE.Vector3(-1, 0, 0), MX + MW / 2);
  for (const ch of map.children.slice(0, 3)) if (ch.isMesh) { ch.material = ch.material.clone(); ch.material.clippingPlanes = [plane]; }
  const flame = wt.candle.userData.flameWorldPos();

  // tokens on the map -> box
  const BOX = new THREE.Vector3(3.6, 0, 2.2);
  const box = makeBox(); box.position.copy(BOX); box.rotation.y = -0.06; wt.scene.add(box);
  const spec = [['knight', 'red', -2.7, 0.2], ['archer', 'blue', -1.9, -1.2], ['monk', 'red', -1.1, 1.3], ['villager', 'red', -0.1, -0.5], ['knight', 'blue', 0.8, 1.1], ['scout', 'red', 1.7, -1.1], ['archer', 'red', 2.4, 0.4]];
  const [vx, vz] = F.village;
  const toks = spec.map(([type, col, x, z], i) => {
    if (Math.hypot(x - vx, z - vz) < 1.0) z = vz + (z > vz ? 1.1 : -1.1);
    z = Math.max(-MD / 2 + 0.5, Math.min(MD / 2 - 0.5, z));
    const tk = makeToken(type, col); tk.position.set(MX + x, Y(x, z), MZ + z); wt.scene.add(tk); tk.userData.faceToward(cam, cam, flame);
    const r = rng(40 + i), s = tk.position.clone(), y0 = tk.rotation.y;
    const j = { i, tk, s, y0, t0: 0.1 + i * 0.3, dur: 1.6,
      fz: BOX.z + (i % 3 - 1) * 0.42, fx: BOX.x + ((i % 2) - 0.5) * 0.4, fy: 0.12 + Math.floor(i / 3) * 0.09,
      rx: -Math.PI / 2 * (0.78 + 0.2 * r()), ry: r() * 6.28, rz: (r() - 0.5) * 0.4 };
    return j;
  });
  const ROLL0 = 3.0, ROLL1 = 5.6, villageGroup = U.village;
  const left = MX - MW / 2, right = MX + MW / 2;

  // the scroll
  const parch = canvasTexture(parchmentCanvas(512, 512, 3, { dark: 0.6 }));
  parch.wrapS = parch.wrapT = THREE.RepeatWrapping; parch.repeat.set(2, 6);
  const capTex = (() => { const c = canvas(256, 256), g = c.getContext('2d'); g.fillStyle = '#d4bb88'; g.fillRect(0, 0, 256, 256);
    g.strokeStyle = 'rgba(80,52,22,0.55)'; g.lineWidth = 3; g.beginPath(); for (let a = 0; a < 6.283 * 7.5; a += 0.05) { const rr = 4 + a * 2.5; g.lineTo(128 + Math.cos(a) * rr, 128 + Math.sin(a) * rr); } g.stroke();
    return canvasTexture(c); })();
  capTex.center.set(0.5, 0.5);
  const bodyMat = new THREE.MeshStandardMaterial({ map: parch, roughness: 0.9, side: THREE.DoubleSide });
  const capMat = new THREE.MeshStandardMaterial({ map: capTex, roughness: 0.9 });
  const scroll = new THREE.Group(); scroll.visible = false; wt.scene.add(scroll);
  const spin = new THREE.Group(); scroll.add(spin);
  const LEN = MD + 0.12;
  const body = new THREE.Mesh(new THREE.CylinderGeometry(1, 1, LEN, 56, 1, true), bodyMat); body.rotation.x = Math.PI / 2; body.castShadow = true; body.receiveShadow = true; spin.add(body);
  const capA = new THREE.Mesh(new THREE.CircleGeometry(1, 56), capMat), capB = new THREE.Mesh(new THREE.CircleGeometry(1, 56), capMat);
  capA.position.z = LEN / 2; capB.position.z = -LEN / 2; capB.rotation.y = Math.PI; spin.add(capA, capB);
  const R_END = 0.33;
  const scale = (r) => { spin.scale.set(r, r, 1); body.scale.set(1, 1, 1); };
  scale(0.03);

  // ribbon, bow, tails, seal (appear after the roll)
  const red = new THREE.MeshStandardMaterial({ color: 0x8e1b16, roughness: 0.55, side: THREE.DoubleSide });
  const bandGeo = (th) => new THREE.CylinderGeometry(R_END + 0.014, R_END + 0.014, 0.13, 48, 1, true, 0, Math.max(0.01, th));
  const band = new THREE.Mesh(bandGeo(0.01), red); band.rotation.x = Math.PI / 2; band.rotation.y = -Math.PI / 2; band.castShadow = true; band.visible = false;
  const RZ = 1.95; band.position.z = RZ; scroll.add(band);
  const bow = new THREE.Group(); bow.position.set(0, R_END + 0.02, RZ); bow.visible = false; scroll.add(bow);
  const knot = new THREE.Mesh(new THREE.SphereGeometry(0.05, 18, 12), red); knot.scale.set(1, 0.8, 1.1); knot.castShadow = true; bow.add(knot);
  for (const s of [-1, 1]) { const lp = new THREE.Mesh(new THREE.TorusGeometry(0.06, 0.016, 8, 20), red); lp.position.set(s * 0.075, 0.02, 0); lp.rotation.set(0.5, 0, s * 0.3); lp.castShadow = true; bow.add(lp); }
  const tails = new THREE.Group(); bow.add(tails);
  const tableY = -(2 * R_END + 0.02) + 0.008; // table level in the bow's local frame
  for (const [dz, len, sx] of [[0.035, 0.62, 1], [-0.04, 0.46, -1]]) { // two tails, one over each side of the roll
    const pts = []; const rr = R_END + 0.02;
    for (let a = 90; a >= 8; a -= 6) { const ar = a * Math.PI / 180; pts.push(new THREE.Vector3(sx * Math.cos(ar) * rr, Math.sin(ar) * rr - rr, 0)); }
    const last = pts[pts.length - 1]; // drop to the table, then lie flat pointing outward
    for (let s = 1; s <= 6; s++) { const f = s / 6; pts.push(new THREE.Vector3(last.x + sx * 0.05 * f, last.y + (tableY - last.y) * easeOut3(f), 0)); }
    for (let s = 1; s <= 8; s++) pts.push(new THREE.Vector3(last.x + sx * (0.05 + len * (s / 8)), tableY, 0));
    const sg = ribbonStrip(pts.map((p) => p.clone().setZ(dz)), 0.055);
    const tm = new THREE.Mesh(sg, red); tm.castShadow = true; tails.add(tm);
  }
  // the whole bow group sits at the roll's top; the tails were built relative to (0, top)
  const sealMat = new THREE.MeshPhysicalMaterial({ color: 0x7a1010, roughness: 0.32, clearcoat: 0.6, clearcoatRoughness: 0.3 });
  const sealBump = (() => { const c = canvas(256, 256), g = c.getContext('2d'); g.fillStyle = '#808080'; g.fillRect(0, 0, 256, 256);
    g.strokeStyle = '#fff'; g.lineWidth = 12; g.beginPath(); g.arc(128, 128, 98, 0, 7); g.stroke(); g.lineWidth = 5; g.beginPath(); g.arc(128, 128, 78, 0, 7); g.stroke();
    g.fillStyle = '#fff'; g.font = '600 120px "Cinzel", serif'; g.textAlign = 'center'; g.textBaseline = 'middle'; g.fillText('P', 128, 138); return canvasTexture(c, { srgb: false }); })();
  sealMat.bumpMap = sealBump; sealMat.bumpScale = 3.0;
  const seal = new THREE.Group(); const disc = new THREE.Mesh(new THREE.CylinderGeometry(0.1, 0.112, 0.03, 40), sealMat); disc.castShadow = true;
  const ring = new THREE.Mesh(new THREE.TorusGeometry(0.105, 0.012, 8, 40), sealMat); ring.rotation.x = Math.PI / 2; ring.position.y = 0.012;
  seal.add(disc, ring); seal.visible = false; seal.position.set(0.0, R_END + 0.02, RZ - 0.19); scroll.add(seal);
  const SEAL_REST = seal.position.y;

  // brass plate
  const plate = makePlate(wt, lampK); plate.position.set(-0.7, 0, 5.0); plate.scale.set(0.88, 1, 0.88); plate.rotation.y = 0.0; plate.visible = false; wt.scene.add(plate);
  plate.userData.lamp.intensity = 0;
  const lampBase = 6 * lampK;

  let rollDone = false, prevX = right, villageHidden = false;
  wt.onTick((dt, t) => {
    // tokens
    for (const j of toks) {
      const u = clamp01((t - j.t0) / j.dur), tk = j.tk;
      if (u <= 0) continue;
      const mx = 2.75, mz = j.fz;
      const a = easeIO(u / 0.62), b = easeIO((u - 0.62) / 0.2), c = clamp01((u - 0.82) / 0.18);
      let x = j.s.x + (mx - j.s.x) * a, z = j.s.z + (mz - j.s.z) * a, y = j.s.y;
      if (u > 0.62) { // lift first, then carry over the wall
        x = mx + (j.fx - mx) * easeIO((b - 0.35) / 0.65); y = j.s.y + (0.78 - j.s.y) * easeIO(b / 0.55); z = mz; }
      if (u > 0.82) { y = 0.78 + (j.fy - 0.78) * c * c; x = j.fx; }
      tk.position.set(x, y, z);
      const rot = smooth(0.66, 1.0, u);
      tk.rotation.set(j.rx * rot, j.y0 + (j.ry - j.y0) * rot, j.rz * rot);
    }
    // roll
    if (!rollDone) {
      const p = easeIO((t - ROLL0) / (ROLL1 - ROLL0));
      if (p > 0) {
        const edge = right - MW * p, r = 0.03 + (R_END - 0.03) * Math.sqrt(p);
        plane.constant = edge;
        scroll.visible = true; scroll.position.set(edge, r + LIFT, MZ); scale(r);
        spin.rotation.z += (prevX - edge) / r; prevX = edge;
        if (villageGroup && !villageHidden) {
          const lx = villageGroup.position.x + MX; const sq = 1 - smooth(lx + 0.9, lx - 0.1, edge) * 0.999;
          villageGroup.scale.set(1, Math.max(0.001, sq), 1);
        }
        if (p >= 1) { rollDone = true; map.visible = false; for (const tk of toks) void tk; }
      }
    }
    // ribbon, bow, seal
    const bt = smooth(5.4, 6.6, t);
    if (bt > 0 && !band.userData.done) { // geometry is rebuilt only while the ribbon is winding on
      band.visible = true; band.geometry.dispose(); band.geometry = bandGeo(bt * Math.PI * 2 - 0.0001);
      if (bt >= 1) band.userData.done = true;
    }
    const kt = smooth(6.2, 6.9, t); if (kt > 0 && kt < 1.0001) { bow.visible = true; bow.scale.setScalar(0.2 + 0.8 * kt); }
    const st = clamp01((t - 6.6) / 0.55);
    if (st > 0 && st < 1.0001) { seal.visible = true; seal.position.y = SEAL_REST + 0.28 * (1 - st * st); }
    // plate settles (heavy ease-out, no bounce)
    const pt = clamp01((t - 5.2) / 1.5);
    if (pt > 0 && !plate.userData.done) { plate.visible = true; plate.position.y = 0.55 * (1 - easeOut3(pt)); plate.userData.lamp.intensity = lampBase * smooth(5.2, 6.4, t); if (pt >= 1 && t > 6.5) plate.userData.done = true; }
    // steady drift (bounded)
    wt.camera.position.set(cam.x + Math.sin(t * 0.0757) * 0.2, cam.y + Math.sin(t * 0.103) * 0.07, cam.z + Math.sin(t * 0.065) * 0.1);
    wt.camera.lookAt(look.x + Math.sin(t * 0.05) * 0.1, look.y, look.z);
  });
  void AGES;
}

/* ------------------------------------------------------------------ build */
function build(wt) {
  const room = dressRoom(wt);
  if (V === 1) buildV1Full(wt, room); else buildV2(wt, room);
}

/* ------------------------------------------------------------------ boot */
await fontsReady();
const stage = createScene({
  canvasHost: document.getElementById('gl'),
  createTable: createWarTable,
  build,
  maxFps: 60,
  tableOpts: {
    board: false, fogDensity: 0.008, candlePos: V === 1 ? [-2.6, 0, 3.0] : [-3.0, 0, 3.6],
    candle: { height: 1.0, lightIntensity: 26, shadowRadius: 8, shadowMapSize: LOW ? 512 : 1024 },
    dust: LOW ? { count: 200 } : true,
    bloom: { strength: 0.32, radius: 0.4, threshold: 2.3 }, exposure: 0.92,
  },
});

if (Q.get('demo') === '1') { // review only: sample chat lines
  [{ user: 'NordicFox', color: '#9fb4cc', text: 'great stream, thanks for the knights!' },
    { user: 'Extremely_Long_Name_25chr', color: '#0000FF', text: 'see you tomorrow, hold the line and do not let the scouts wander into the fog Averyveryveryverylongwordwithoutanyspacesatalltotestwrapping' },
    { user: 'luna_pawn', color: '#dcb77a', text: 'good night everyone' }].forEach((m) => pushChat(m));
} else if (!SHOT) {
  connect({ channel: 'pdbull', onMessage: pushChat });
}

if (SHOT) {
  stage.start();
  stage.stop();
  const wt = stage.wt, t = Q.has('t') ? +Q.get('t') : 11;
  wt.advance(Math.max(0.1, t));
  const g = wt.renderer.getContext(), px = new Uint8Array(4);
  g.readPixels(0, 0, 1, 1, g.RGBA, g.UNSIGNED_BYTE, px);
  window.wt = wt;
  console.log('ending shot v=' + V + ' t=' + wt.time.toFixed(2));
} else {
  stage.start();
}
