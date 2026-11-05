// End scene (production, from approved prototype variant 1 "Candle out"): the candle gutters and goes out (smoke
// thread, ember on the wick), the room cools and dims, a letter on the table is written in ink:
// "Thanks for watching" / "See you next time". Chat from Twitch (channel pdbull) keeps running over it.
// Opening beat <= 8 s, played once each time the scene is shown, then a steady state that can run for hours
// (bounded drift/flicker only, nothing accumulates). Timeline and drift live in core/endinglogic.js.
// Review-only query (off by default): ?shot=1 (deterministic frame) &t=<seconds> &demo=1 (sample chat) &q=low
import { createWarTable, makeTable, fitStage, THREE } from '../shared/war-table.js';
import { makeCampaignMap, makeToken, makeProp } from '../shared/campaign.js';
import { createScene } from '../core/scene.js';
import { createSettings } from '../core/settings.js';
import { createBus } from '../core/bus.js';
import { createRemote } from '../core/remote.js';
import { startAutoUpdate } from '../core/autoupdate.js';
import { connect } from '../core/twitchchat.js';
import { addLine } from '../core/brbchat.js';
import { createSceneAudio } from '../core/sceneaudio.js';
import { clamp01, smooth, beatAt, camDrift, lookDrift, T_OUT, INK_T0, INK_TITLE, INK_SUB0, INK_SUB } from '../core/endinglogic.js';

const Q = new URLSearchParams(location.search);
// quality knob for weak machines, set once in the OBS source URL: ?q=low (fewer smoke particles/dust, smaller shadow map)
const LOW = Q.get('q') === 'low';
console.log('ending quality=' + (LOW ? 'low' : 'full'));
const SHOT = Q.get('shot') === '1';
if (SHOT) document.body.classList.add('shot');
fitStage(document.getElementById('stage'));

// chosen values of the review knobs (were &moon=)
const MOON_K = 0.42; // cool light on the letter; the prototype's 0.6 washed the paper out

/* ------------------------------------------------------------------ utils */
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

/* ------------------------------------------------------------------ parchment canvas */
function parchmentCanvas(w, h, seed = 5) {
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
  for (const a of [0, 1]) edge.addColorStop(a, 'rgba(70,40,14,0.34)');
  edge.addColorStop(0.07, 'rgba(70,40,14,0)'); edge.addColorStop(0.93, 'rgba(70,40,14,0)');
  g.fillStyle = edge; g.fillRect(0, 0, w, h);
  const edgeV = g.createLinearGradient(0, 0, 0, h);
  edgeV.addColorStop(0, 'rgba(70,40,14,0.34)'); edgeV.addColorStop(0.09, 'rgba(70,40,14,0)'); edgeV.addColorStop(0.91, 'rgba(70,40,14,0)'); edgeV.addColorStop(1, 'rgba(70,40,14,0.34)');
  g.fillStyle = edgeV; g.fillRect(0, 0, w, h);
  g.strokeStyle = 'rgba(80,52,22,0.16)'; g.lineWidth = 2; // old fold creases
  g.beginPath(); g.moveTo(0, h * 0.5); g.lineTo(w, h * 0.5 + 3); g.moveTo(w * 0.34, 0); g.lineTo(w * 0.34 - 4, h); g.stroke();
  return c;
}

/* ------------------------------------------------------------------ room */
function dressRoom(wt) {
  wt.candle.updateMatrixWorld(true); // aimDrips/flameWorldPos read matrixWorld before the first render
  wt.hemi.intensity = 0.07; if (wt.rim) { wt.rim.intensity = 0; wt.rim.visible = false; }
  const warm = []; // [light, baseIntensity] for the dimming
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
  // (the shared dust drift is bounded in shared/war-table.js since round 3: no runtime shader patch here)
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

/* ------------------------------------------------------------------ smoke thread off the wick */
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

/* ------------------------------------------------------------------ the letter */
// the ink is a "reveal-time map" (R = ink coverage, G = time the pen reaches that pixel, 0..12 s of beat time)
function buildInkMaps(W, H, fonts) {
  const tc = canvas(W, H), g = tc.getContext('2d');
  const lines = [
    { text: 'Thanks for watching', cy: H * 0.40, wFrac: 0.80, t0: INK_T0, dur: INK_TITLE },
    { text: 'See you next time', cy: H * 0.70, wFrac: 0.40, t0: INK_SUB0, dur: INK_SUB },
  ];
  const ink = new ImageData(W, H);
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

function makeLetter(wt, uNow) {
  const W = 1664, H = 1008, fonts = '"Cormorant Garamond", Georgia, serif';
  const paper = canvasTexture(parchmentCanvas(W, H, 8));
  const inkTex = canvasTexture(buildInkMaps(W, H, fonts), { srgb: false });
  // Round 3 fix (letter washed out): paper albedo x0.72 (color multiplies the map) and a darker, fully dry ink, so the
  // lettering keeps contrast >= 4.5:1 against the paper under the moon light.
  const mat = new THREE.MeshStandardMaterial({ map: paper, color: new THREE.Color(0.72, 0.70, 0.66), roughness: 0.92, envMapIntensity: 0.3 });
  mat.onBeforeCompile = (sh) => {
    sh.uniforms.uInk = { value: inkTex }; sh.uniforms.uNow = uNow;
    sh.fragmentShader = sh.fragmentShader.replace('#include <common>', '#include <common>\nuniform sampler2D uInk; uniform float uNow;')
      .replace('#include <map_fragment>', `#include <map_fragment>
        { vec4 ik = texture2D(uInk, vMapUv); float tI = ik.g * 12.0; float a = ik.r * smoothstep(0.0, 0.07, uNow - tI);
          vec3 inkC = mix(vec3(0.004, 0.005, 0.012), vec3(0.03, 0.02, 0.012), smoothstep(0.0, 4.0, uNow - tI));
          diffuseColor.rgb = mix(diffuseColor.rgb, inkC, a * 0.99); }`);
  };
  mat.customProgramCacheKey = () => 'ending-letter';
  const SX = 4.8, SZ = 2.91, geo = new THREE.PlaneGeometry(SX, SZ, 64, 40);
  geo.rotateX(-Math.PI / 2);
  const p = geo.attributes.position;
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
  return g;
}

// Round 3 fix (quill floated 0.03 above the table in the prototype, propped in the air on the inkwell): the quill now
// lies flat on the table beside the inkwell. Outer group spins it about Y; the inner one lays shaft and vane flat
// (rotation.x = -PI/2 turns the shaft horizontal and the vane normal up) with the shaft axis one radius (0.0095) up.
function makeQuill() {
  const outer = new THREE.Group(), quill = new THREE.Group();
  const shaft = new THREE.Mesh(new THREE.CylinderGeometry(0.004, 0.009, 1.05, 8), new THREE.MeshStandardMaterial({ color: 0xe2d4b4, roughness: 0.6 }));
  shaft.castShadow = true; quill.add(shaft);
  const vane = new THREE.Mesh(new THREE.PlaneGeometry(0.14, 0.78, 1, 6), new THREE.MeshStandardMaterial({ color: 0xcfc2a2, roughness: 0.85, side: THREE.DoubleSide }));
  vane.position.set(0.05, 0.16, 0.002); vane.castShadow = true; quill.add(vane);
  quill.rotation.x = -Math.PI / 2; quill.position.y = 0.0095;
  outer.add(quill);
  return outer;
}

/* ------------------------------------------------------------------ scene */
let restartBeat = () => {};

function build(wt) {
  const room = dressRoom(wt);
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
  // inkwell: at (2.9, 4.4) it projected to ~x 1406 px, inside the frame with the drift; nudged inwards (2.75, 4.35) for
  // margin against the chat column and the right edge, quill beside it on the table
  const iw = makeInkwell(); iw.position.set(2.75, 0, 4.35); iw.rotation.y = 2.4; wt.scene.add(iw);
  const qu = makeQuill(); qu.position.set(3.55, 0, 5.0); qu.rotation.y = -2.498; wt.scene.add(qu);

  // cool "moon" light on the letter + a low cool directional fill (both ramp in while the candle dies)
  const moon = new THREE.SpotLight(0xa6b8da, 0, 0, 0.5, 0.9, 2); moon.position.set(-3.5, 7.5, 7.5); moon.target.position.set(-0.2, 0, 5.1);
  wt.scene.add(moon, moon.target);
  const fill = new THREE.DirectionalLight(0x7388b0, 0); fill.position.set(-6, 9, 5); wt.scene.add(fill);
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
  let lit = true, t0 = 0, restart = false;
  // the opening beat plays once per scene start: again whenever the scene is shown (OBS source shown / tab visible)
  restartBeat = () => { restart = true; };
  wt.onTick((dt, t) => {
    if (restart) { // scene shown again: relight and replay the opening
      restart = false; t0 = t; lit = true; cu.setLit(true); cu.baseIntensity = base; cu.glow.visible = false; cu.waxGlow.value = 0.35;
      thread.mat.uniforms.uOut.value = 1e9;
    }
    const tb = t - t0, beat = beatAt(tb);
    uNow.value = tb;
    // candle gutters, then goes out at T_OUT
    if (lit) {
      const g = smooth(0.7, T_OUT, tb);
      const f1 = 0.5 + 0.5 * Math.sin(tb * 27 + Math.sin(tb * 9) * 2.0), f2 = 0.5 + 0.5 * Math.sin(tb * 41 + 1.3);
      const dip = 1 - 0.55 * Math.exp(-Math.pow((tb - 2.1) * 6, 2)); // a deep gasp, then it recovers a little
      fl.scale.set(0.035 * (1 - 0.45 * g) * (1 + 0.25 * g * f2), 0.065 * (1 - 0.7 * g) * (1 - 0.3 * g * f1) * dip, 0.035 * (1 - 0.45 * g));
      fl.rotation.z = 0.55 * g * Math.sin(tb * 3.3 + 0.4);
      cu.baseIntensity = base * (1 - 0.86 * g) * (0.82 + 0.18 * f1) * dip;
      if (tb >= T_OUT) { lit = false; cu.setLit(false); fl.rotation.z = 0; thread.mat.uniforms.uOut.value = tb; }
    }
    // the room cools and dims
    const dim = smooth(1.2, 4.6, tb), m = smooth(1.6, 5.0, tb);
    for (const [l, k] of room.warm) l.intensity = k * (1 - 0.88 * dim);
    wt.hemi.color.copy(warmH).lerp(cool, m); wt.hemi.intensity = 0.07 + 0.11 * m;
    moon.intensity = 170 * MOON_K * m; fill.intensity = 3.4 * m;
    wt.scene.background.copy(room.bgWarm).lerp(bgCool, m); wt.scene.fog.color.copy(wt.scene.background);
    if (dust) dust.m.uniforms.uColor.value.copy(dust.c).multiplyScalar(1 - 0.65 * dim);
    // ember: slow breathing, never dies
    const on = beat.ember;
    const br = 0.78 + 0.22 * Math.sin(t * 1.15) + 0.08 * Math.sin(t * 3.7 + 1.0);
    emberCore.material.opacity = 0.95 * on * br; emberHalo.material.opacity = 0.32 * on * br;
    ember.intensity = 0.9 * on * br;
    // smoke thread: thin steady wisp
    thread.mat.uniforms.uTime.value = tb; thread.mat.uniforms.uOn.value = on; thread.mat.uniforms.uPix.value = thread.pixK();
  });
  // steady camera drift: bounded, hours-safe (core/endinglogic.js)
  wt.onTick((dt, t) => {
    const d = camDrift(t);
    wt.camera.position.set(cam.x + d.x, cam.y + d.y, cam.z + d.z);
    wt.camera.lookAt(look.x + lookDrift(t), look.y, look.z);
  });
}

/* ------------------------------------------------------------------ boot */
const settings = createSettings();
const bus = createBus({ name: 'pdbull' });
// generated ambience (dock: settings.ambience.enabled / volume); a review shot stays silent
const audio = createSceneAudio({ preset: 'ending', settings: settings.get(), AudioCtx: SHOT ? null : globalThis.AudioContext });
addEventListener('pagehide', () => audio.dispose());
// the scene is consume-only: it never publishes settings, so no echo guard (fromRemote) is needed
const remote = createRemote({
  room: Q.get('room') || '',
  onSettings: (s) => settings.patch(s),
});
bus.on('settings', (p) => { if (p && typeof p === 'object') settings.patch(p); else render(); });
function render() { audio.apply(settings.get()); }
settings.onChange(() => { render(); });

// replay the opening when the scene is shown again (OBS fires obsSourceActiveChanged on show/hide)
document.addEventListener('visibilitychange', () => { if (document.visibilityState === 'visible') restartBeat(); });
addEventListener('obsSourceActiveChanged', (e) => { if (e && e.detail && e.detail.active) restartBeat(); });

await fontsReady();
const stage = createScene({
  canvasHost: document.getElementById('gl'),
  createTable: createWarTable,
  build,
  maxFps: 60,
  tableOpts: {
    board: false, fogDensity: 0.008, candlePos: [-2.6, 0, 3.0],
    candle: { height: 1.0, lightIntensity: 26, shadowRadius: 8, shadowMapSize: LOW ? 512 : 1024 },
    dust: LOW ? { count: 200 } : true,
    bloom: { strength: 0.32, radius: 0.4, threshold: 2.3 }, exposure: 0.92,
  },
});
render();
bus.emit('settings-request', {});
if (!SHOT) { remote.start(); startAutoUpdate(); } // review shots skip the network streams

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
  console.log('ending shot t=' + wt.time.toFixed(2));
} else {
  stage.start();
}
