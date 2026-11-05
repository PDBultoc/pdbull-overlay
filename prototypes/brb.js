// B · BRB (round 2) — candle close-up: the smoke writes "Be right back"; behind it, out of focus,
// the commander's campaign table (parchment map, fog of war, village, tokens, resource props).
// Query: ?min=<minutes countdown>  ?shot=1 (hide panel, deterministic)  ?t=<seconds to scrub>
//        ?follower=<name>  ?age=dark|feudal|castle|imperial (starting age)
// Debug: &dof=0 (no depth of field) &sc=<smoke particles> &wg=<wax glow> &ly=<light lift> &perf=1 (frame ms) &dbg=1
import { createWarTable, makePiece, fitStage, THREE } from './shared/war-table.js';
import { makeCampaignMap, makeToken, makeBanner, makeProp, AGES } from './shared/campaign.js';
import { RenderPass } from 'three/addons/postprocessing/RenderPass.js';

const Q = new URLSearchParams(location.search);
const SHOT = Q.get('shot') === '1';
const MIN = Q.has('min') ? Math.max(0, parseFloat(Q.get('min')) || 0) : null;
if (SHOT) document.body.classList.add('shot');
fitStage(document.getElementById('stage'));

/* ------------------------------------------------------------------ utils */
const clamp01 = (x) => Math.min(1, Math.max(0, x));
const smooth = (a, b, x) => { const t = clamp01((x - a) / (b - a)); return t * t * (3 - 2 * t); };
function rng(seed) { return () => { seed |= 0; seed = (seed + 0x6d2b79f5) | 0; let t = Math.imul(seed ^ (seed >>> 15), 1 | seed); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; }; }
function canvas(w, h) { const c = document.createElement('canvas'); c.width = w; c.height = h; return c; }
async function fontsReady() {
  const wait = Promise.all([
    document.fonts.load('italic 500 120px "Cormorant Garamond"'), document.fonts.load('600 20px "Cormorant Garamond"'),
    document.fonts.load('600 13px "Cinzel"'), document.fonts.load('500 20px "Inter"'),
  ]).catch(() => {});
  await Promise.race([wait, new Promise((r) => setTimeout(r, 2500))]);
}

const SMOKE_VS = /* glsl */`
uniform float uT; uniform float uTime; uniform vec3 uSrc; uniform float uPix; uniform float uSize;
attribute vec3 aTarget; attribute float aSeed; attribute float aDelay;
varying float vA; varying float vSeed; varying float vLit;
float h(float n){ return fract(sin(n) * 43758.5453); }
vec3 bez(vec3 a, vec3 b, vec3 c, vec3 d, float t){ float s = 1.0 - t; return s*s*s*a + 3.0*s*s*t*b + 3.0*s*t*t*c + t*t*t*d; }
void main(){
  float travel = 2.4 + aSeed * 1.1;
  float p = clamp((uT - aDelay) / travel, 0.0, 1.0);
  float e = 1.0 - pow(1.0 - p, 2.2);
  vec3 a = uSrc + vec3(0.0, 0.05, 0.0);
  vec3 b = uSrc + vec3(0.45 * (fract(aSeed * 13.7) - 0.5), 1.0 + aSeed * 0.7, 0.3 * (fract(aSeed * 5.3) - 0.5));
  vec3 c = aTarget + vec3(-0.4 - fract(aSeed * 3.9) * 0.7, -0.2 - fract(aSeed * 2.3) * 0.5, 0.3 * sin(aSeed * 17.0));
  float halo = step(0.84, fract(aSeed * 7.13));
  vec3 pos = bez(a, b, c, aTarget, e);
  // turbulence that settles on arrival
  float tb = (1.0 - e) * 0.26 + 0.006;
  float held = max(uT - aDelay - travel, 0.0);
  pos.x += sin(aTarget.y * 9.0 + uTime * 0.55 + aSeed * 2.0) * 0.018 * e;
  pos.y += sin(aTarget.x * 6.0 + uTime * 0.45) * 0.022 * e + held * 0.012;
  pos.x += sin(uTime * 1.3 + aSeed * 31.0 + pos.y * 3.0) * tb;
  pos.y += sin(uTime * 0.9 + aSeed * 23.0 + pos.x * 2.0) * tb * 0.6;
  pos.z += cos(uTime * 1.1 + aSeed * 13.0) * tb;
  // dissolve: drifts up and away, letters break into wisps
  float d = clamp((uT - 14.5 - aDelay * 0.45 - aSeed * 0.8) / 3.6, 0.0, 1.0);
  float d2 = d * d;
  pos += vec3(sin(aSeed * 50.0 + pos.y * 2.0) * 0.5, 1.4, cos(aSeed * 29.0) * 0.4) * d2;
  pos.x += sin(pos.y * 4.0 + uTime * 0.8 + aSeed * 5.0) * 0.12 * d;
  float peel = step(0.8, aSeed);
  float hp = held * peel;
  pos.y += hp * (0.09 + aSeed * 0.05);
  pos.x += sin(hp * 1.7 + aSeed * 40.0) * hp * 0.05;
  float dens = 0.75 + 0.25 * smoothstep(-0.4, 0.8, sin(aTarget.x * 3.1 + uTime * 0.23) * sin(aTarget.y * 7.3 - uTime * 0.31 + aTarget.x * 1.7));
  vA = smoothstep(0.0, 0.12, p) * (0.09 + 0.91 * smoothstep(0.6, 1.0, p)) * (1.0 - d) * dens * (1.0 - smoothstep(0.0, 6.0, hp) * 0.85);
  pos += vec3(sin(uTime * 0.41 + aSeed * 20.0), sin(uTime * 0.33 + aSeed * 11.0) + 0.6, cos(uTime * 0.37 + aSeed * 7.0)) * 0.06 * halo * e;
  vA *= mix(1.0, 0.32, halo);
  vSeed = aSeed;
  vLit = 1.0 / (1.0 + pow(distance(pos, uSrc) * 0.55, 2.0));
  vec4 mv = modelViewMatrix * vec4(pos, 1.0);
  gl_PointSize = uSize * mix(0.5, 1.5, halo) * (0.8 + aSeed * 0.4) * (1.0 + d * 2.5 + (1.0 - e) * 1.6) * uPix / -mv.z;
  gl_Position = projectionMatrix * mv;
}`;
const WISP_VS = /* glsl */`
uniform float uTime; uniform vec3 uSrc; uniform float uPix; uniform float uSize; uniform float uOn;
attribute float aSeed;
varying float vA; varying float vSeed; varying float vLit;
void main(){
  float life = 4.2;
  float k = fract(uTime / life + aSeed);
  float y = k * 2.1;
  vec3 pos = uSrc + vec3(0.0, 0.08 + y, 0.0);
  float sway = y * y * 0.16 + y * 0.05;
  pos.x += sin(y * 2.4 - uTime * 0.9 + aSeed * 3.0) * sway + sin(uTime * 0.37) * y * 0.08;
  pos.z += cos(y * 1.9 - uTime * 0.7) * sway * 0.6;
  pos.x += (fract(aSeed * 91.7) - 0.5) * 0.03 * (1.0 + y * 5.0);
  pos.z += (fract(aSeed * 37.3) - 0.5) * 0.03 * (1.0 + y * 4.0);
  vA = smoothstep(0.0, 0.06, k) * (1.0 - smoothstep(0.2, 0.85, k)) * uOn * 0.8;
  vSeed = aSeed;
  vLit = 1.0 / (1.0 + pow(y * 0.6, 2.0));
  vec4 mv = modelViewMatrix * vec4(pos, 1.0);
  gl_PointSize = uSize * (0.6 + y * 1.4) * uPix / -mv.z;
  gl_Position = projectionMatrix * mv;
}`;
const SMOKE_FS = /* glsl */`
uniform vec3 uColor; uniform vec3 uWarm; uniform float uOpacity;
varying float vA; varying float vSeed; varying float vLit;
void main(){
  vec2 c = gl_PointCoord - 0.5;
  float r2 = dot(c, c) * 4.0;
  float a = exp(-r2 * 2.6) * (0.75 + 0.5 * fract(sin(vSeed * 91.3) * 437.5)) * vA * uOpacity;
  if (a < 0.002) discard;
  vec3 col = mix(uColor, uWarm, clamp(vLit * 1.2, 0.0, 1.0)) * (0.55 + 0.9 * vLit);
  gl_FragColor = vec4(col, a);
}`;
function textPoints(text, n, widthWorld, seed = 3) {
  const W = 2400, H = 440; const c = canvas(W, H), g = c.getContext('2d');
  g.fillStyle = '#fff'; g.font = 'italic 500 300px "Cormorant Garamond", Georgia, serif'; g.textAlign = 'center'; g.textBaseline = 'middle';
  g.fillText(text, W / 2, H / 2 + 10);
  const d = g.getImageData(0, 0, W, H).data; const cand = [];
  let minX = W, maxX = 0;
  for (let y = 0; y < H; y += 2) for (let x = 0; x < W; x += 2) if (d[(y * W + x) * 4] > 120) { cand.push([x, y]); minX = Math.min(minX, x); maxX = Math.max(maxX, x); }
  const r = rng(seed); const out = [];
  const s = widthWorld / (maxX - minX || 1);
  for (let i = 0; i < n && cand.length; i++) {
    const [x, y] = cand[Math.floor(r() * cand.length)];
    out.push([(x - (minX + maxX) / 2) * s + (r() - 0.5) * 0.03, (H / 2 - y) * s + (r() - 0.5) * 0.03, (r() - 0.5) * 0.08, (x - minX) / (maxX - minX)]);
  }
  return out;
}
function makeSmokeWriter(wt, srcWorld, text, { count = 34000, width = 3.6, center, cycle = 21 } = {}) {
  const scene = new THREE.Scene();
  const group = new THREE.Group(); scene.add(group);
  group.position.copy(center);
  const camFlat = wt.camera.position.clone(); camFlat.y = center.y; group.lookAt(camFlat);
  group.updateMatrixWorld(true);
  const srcLocal = group.worldToLocal(srcWorld.clone());
  const pts = textPoints(text, count, width);
  const tg = new Float32Array(count * 3), sd = new Float32Array(count), dl = new Float32Array(count), pos = new Float32Array(count * 3);
  const r = rng(11);
  pts.forEach(([x, y, z, u], i) => { tg.set([x, y, z], i * 3); sd[i] = r(); dl[i] = u * 4.6 + r() * 0.5; });
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  geo.setAttribute('aTarget', new THREE.BufferAttribute(tg, 3));
  geo.setAttribute('aSeed', new THREE.BufferAttribute(sd, 1));
  geo.setAttribute('aDelay', new THREE.BufferAttribute(dl, 1));
  const pixK = () => wt.renderer.domElement.height / (2 * Math.tan(THREE.MathUtils.degToRad(wt.camera.fov / 2)));
  const common = {
    uPix: { value: pixK() }, uColor: { value: new THREE.Color(0x77726d) }, uWarm: { value: new THREE.Color(0xb98f66) },
    uTime: { value: 0 }, uSrc: { value: srcLocal },
  };
  const mat = new THREE.ShaderMaterial({
    uniforms: { ...common, uT: { value: 0 }, uSize: { value: 0.064 }, uOpacity: { value: 0.15 } },
    vertexShader: SMOKE_VS, fragmentShader: SMOKE_FS, transparent: true, depthWrite: false, depthTest: false,
  });
  const smoke = new THREE.Points(geo, mat); smoke.frustumCulled = false; group.add(smoke);
  // continuous thin wisp from the flame
  const wn = 3200; const wg = new THREE.BufferGeometry(); const ws = new Float32Array(wn);
  for (let i = 0; i < wn; i++) ws[i] = r();
  wg.setAttribute('position', new THREE.BufferAttribute(new Float32Array(wn * 3), 3));
  wg.setAttribute('aSeed', new THREE.BufferAttribute(ws, 1));
  const wmat = new THREE.ShaderMaterial({
    uniforms: { ...common, uSize: { value: 0.05 }, uOpacity: { value: 0.045 }, uOn: { value: 1 } },
    vertexShader: WISP_VS, fragmentShader: SMOKE_FS, transparent: true, depthWrite: false, depthTest: false,
  });
  const wisp = new THREE.Points(wg, wmat); wisp.frustumCulled = false; group.add(wisp);
  const pass = new RenderPass(scene, wt.camera); pass.clear = false;
  const passes = wt.composer.passes; const idx = passes.indexOf(wt.vignettePass);
  wt.composer.insertPass(pass, idx >= 0 ? idx : passes.length - 1);
  wt.onTick((dt, t) => {
    const T = t % cycle;
    mat.uniforms.uT.value = T; mat.uniforms.uTime.value = t; wmat.uniforms.uTime.value = t;
    // the wisp thins while the letters are being written
    wmat.uniforms.uOn.value = 0.45 + 0.55 * smooth(13.5, 17.5, T) + 0.55 * (1 - smooth(0, 2, T));
    mat.uniforms.uPix.value = wmat.uniforms.uPix.value = pixK();
  });
  return { group, scene, pass };
}

/* ------------------------------------------------------------------ parchment ageing (this page only) */
// The shared map paper is a light cream; under one candle it read as snow. Repaint the instance's colour canvas:
// warmer, darker tan, river pulled to a muted teal ink, visible fibre grain, and a burnt-umber aged edge.
function ageParchment(map, W, D) {
  let top = null; map.traverse((o) => { if (!top && o.isMesh && o.material?.map?.image?.getContext) top = o; });
  if (!top) return;
  const c = top.material.map.image, g = c.getContext('2d'), w = c.width, h = c.height;
  const im = g.getImageData(0, 0, w, h), d = im.data, r = rng(41);
  const grain = new Float32Array(Math.ceil(w / 3) * Math.ceil(h / 3)).map(() => r() - 0.5);
  const gw = Math.ceil(w / 3);
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
    const i = (y * w + x) * 4; let R = d[i], G = d[i + 1], B = d[i + 2];
    const lum = 0.3 * R + 0.59 * G + 0.11 * B;
    if (B > R + 6) { const k = Math.min(1, (B - R) / 60); R += (lum * 0.62 - R) * k; G += (lum * 0.8 - G) * k; B += (lum * 0.74 - B) * k; } // water -> teal ink
    // tan base: pull toward warm amber, darken
    R = R * 0.80 + 6; G = G * 0.70; B = B * 0.52;
    const u = x / w, v = y / h, e = Math.min(u, 1 - u) * W, f = Math.min(v, 1 - v) * D, ed = Math.min(e, f);
    const age = 1 - 0.55 * Math.pow(1 - Math.min(1, ed / 0.9), 2.2) - 0.12 * (1 - Math.min(1, ed / 2.4));
    const gr = 1 + grain[((y / 3) | 0) * gw + ((x / 3) | 0)] * 0.10 + (r() - 0.5) * 0.05;
    d[i] = R * age * gr; d[i + 1] = G * age * gr * 0.97; d[i + 2] = B * age * gr * 0.92;
  }
  g.putImageData(im, 0, 0); top.material.map.needsUpdate = true;
  top.material.sheen = 0.12; top.material.specularIntensity = 0.25;
}

/* ------------------------------------------------------------------ DOM: follower + chat */
const NAMES = ['IronSquire', 'Feudal_Fiona', 'TownCenterTom', 'WololoWendy', 'ScoutRushSam', 'Castle_Kate'];
const CHAT = [
  ['IronSquire', '#dcb77a', 'grabbing a tea, see you in a bit'],
  ['Feudal_Fiona', '#b4c6d8', 'that scout is doing the real work'],
  ['TownCenterTom', '#dcc79c', 'gg last game, clean castle drop'],
  ['WololoWendy', '#d3ad86', 'calling a fast imperial next round'],
];
function setFollower(name, fresh) {
  document.getElementById('followerName').textContent = name;
  const box = document.getElementById('follower');
  if (fresh) { box.classList.remove('fresh'); void box.offsetWidth; box.classList.add('fresh'); }
}
let chatI = 0;
function pushChat() {
  const [n, c, t] = CHAT[chatI++ % CHAT.length];
  const box = document.getElementById('chat');
  const d = document.createElement('div'); d.className = 'msg';
  const b = document.createElement('b'); b.style.color = c; b.textContent = n;
  d.append(b, document.createTextNode(t)); box.append(d);
  while (box.children.length > 3) box.firstChild.remove();
  [...box.children].forEach((m, i, a) => m.classList.toggle('old', i < a.length - 1));
}
setFollower(Q.get('follower') || NAMES[0]);
pushChat(); pushChat();

/* ------------------------------------------------------------------ scene */
const T_DEFAULT = 11.5;
const gl = document.getElementById('gl');
let wt, scoutNow = () => {};

async function build() {
  wt = createWarTable(gl, {
    autoStart: !SHOT, board: false, candlePos: [-2.9, 0, 6.3], candle: { height: 1.05, lightIntensity: 26, shadowRadius: 8 },
    bloom: { strength: 0.32, radius: 0.4, threshold: 2.3 }, exposure: 0.92,
  });
  // one warm source: kill the cool back rim (it turned the parchment snow-white) and keep only a faint warm bounce
  wt.hemi.intensity = 0.07; if (wt.rim) { wt.rim.intensity = 0; wt.rim.visible = false; }
  // far side of the room: a dark panelled wall and a faint, low warm fill (a second candle off-frame), so the
  // map ends on walnut and wall instead of a black void, and the far banners and the blue side still read
  { const wall = new THREE.Mesh(new THREE.PlaneGeometry(48, 16), new THREE.MeshStandardMaterial({ color: 0x4a2f1c, roughness: 0.9 }));
    wall.position.set(0, 7.4, -10.6); wt.scene.add(wall);
    const far = new THREE.PointLight(0xff9a52, +(Q.get('far') ?? 22), 0, 2); far.position.set(5.6, 1.5, -6.2); wt.scene.add(far); }
  // candle body: more of the inner glow, plus a short warm bounce off the table onto the wax front and the dish
  wt.candle.userData.waxGlow.value = +(Q.get('wg') ?? 0.35);
  const bounce = new THREE.PointLight(0xffb36a, 1.1, 2.0, 2); bounce.position.set(-2.55, 0.25, 7.2); wt.scene.add(bounce);

  /* campaign map, centred behind the candle */
  const map = makeCampaignMap({ width: 11, depth: 7.4, seed: 3, colour: 'red' });
  const LIFT = 0.006; map.position.y = LIFT;
  wt.scene.add(map); map.userData.attach(wt);
  const U = map.userData, F = U.features, Y = (x, z) => U.surfaceY(x, z) + LIFT;
  ageParchment(map, U.width, U.depth);
  // a dark leather blotter with a thin brass edge frames the map on the walnut
  { const bw = U.width + 0.7, bd = U.depth + 0.7;
    const blot = new THREE.Mesh(new THREE.BoxGeometry(bw, 0.02, bd), new THREE.MeshPhysicalMaterial({ color: 0x2c1a10, roughness: 0.62, clearcoat: 0.2, clearcoatRoughness: 0.7 }));
    blot.position.y = -0.008; blot.receiveShadow = true; wt.scene.add(blot);
    const brass = new THREE.MeshPhysicalMaterial({ color: 0xb48a48, metalness: 1, roughness: 0.38 });
    for (const [w, d, x, z] of [[bw, 0.05, 0, bd / 2], [bw, 0.05, 0, -bd / 2], [0.05, bd, bw / 2, 0], [0.05, bd, -bw / 2, 0]]) {
      const e = new THREE.Mesh(new THREE.BoxGeometry(w, 0.026, d), brass); e.position.set(x, 0.002, z); e.receiveShadow = true; wt.scene.add(e); } }
  const age0 = AGES.includes(Q.get('age')) ? Q.get('age') : 'castle';
  U.setAge(age0, { duration: 0 });
  const [vx, vz] = F.village;
  U.reveal(vx, vz, 2.3, { duration: 0 });
  U.reveal(F.gold[0][0] + 0.2, F.gold[0][1], 1.2, { duration: 0 });
  // the near side of the map is already known land; the fog keeps the far side
  U.reveal(-1.2, 2.7, 2.6, { duration: 0 }); U.reveal(1.9, 2.6, 2.1, { duration: 0 });
  // the shared mist is a cool grey; under a single candle it read as snow, so warm it to a smoky umber here
  // fog of war = the parchment going dark and smoky, never a white sheet
  [[0x3b2b1c, 0.92], [0x4a3826, 0.34], [0x5a4632, 0.16]].forEach(([c, op], i) => {
    const m = U.fogMeshes[i]; if (!m) return; m.material.color.set(c); m.material.userData.uniforms.uOpacity.value = op; });
  if (Q.get('dbg') === '1') console.log('fog layers ' + U.fogMeshes.length + ' ' + U.fogMeshes.map((m) => m.material.color.getHexString()).join(','));
  // the village grows one age while you are away (slow, heavy settle)
  const nextAge = AGES[Math.min(AGES.length - 1, AGES.indexOf(age0) + 1)];
  let aged = false;
  wt.onTick((dt, t) => { if (!aged && t > 40) { aged = true; U.setAge(nextAge, { duration: 3.2 }); } });

  const place = (obj, x, z, ry = 0) => { obj.position.set(x, Y(x, z), z); obj.rotation.y = ry; wt.scene.add(obj); return obj; };

  /* scout patrol: fog lifts in front of it; the route loops back through known land */
  const route = [[vx + 0.9, vz + 0.35], [F.bridge[0] - 0.6, F.bridge[1] + 0.05], [F.bridge[0], F.bridge[1]],
    [F.bridge[0] + 1.2, F.bridge[1] - 0.5], [F.gold[1][0] - 0.3, F.gold[1][1] + 0.3], [F.gold[1][0] + 0.2, F.gold[1][1] - 1.3]];
  const SPEED = 0.32, SCOUT_T0 = 1.5;
  U.revealPath(route, 1.15, { speed: SPEED, delay: SCOUT_T0 });
  const scout = place(makeToken('scout', 'red'), ...route[0]);
  const seg = []; let L = 0;
  for (let i = 1; i < route.length; i++) { const d = Math.hypot(route[i][0] - route[i - 1][0], route[i][1] - route[i - 1][1]); seg.push([L, d]); L += d; }
  scoutNow = (t) => {
    // out and back (ping-pong), so it never teleports
    const span = L / SPEED, u = Math.max(0, t - SCOUT_T0) / span, back = Math.floor(u) % 2 === 1;
    const s = (back ? 1 - (u % 1) : u % 1) * L;
    let i = seg.findIndex(([a, d]) => s <= a + d); if (i < 0) i = seg.length - 1;
    const [a, d] = seg[i], k = clamp01((s - a) / d), p0 = route[i], p1 = route[i + 1];
    const x = p0[0] + (p1[0] - p0[0]) * k, z = p0[1] + (p1[1] - p0[1]) * k;
    scout.position.set(x, Y(x, z) + Math.abs(Math.sin(t * 4.0)) * 0.01, z);
    scout.rotation.y = -Math.atan2(p1[1] - p0[1], p1[0] - p0[0]) + (back ? Math.PI : 0);
  };
  wt.onTick((dt, t) => scoutNow(t));

  /* tokens on the map near the village */
  const statics = [
    place(makeToken('knight', 'red'), vx + 0.35, vz + 1.5),
    place(makeToken('villager', 'red'), F.gold[0][0] + 0.55, F.gold[0][1] + 0.2),
    place(makeToken('villager', 'red'), F.gold[0][0] + 0.2, F.gold[0][1] + 0.75),
    place(makeToken('archer', 'red'), vx - 1.1, vz + 1.05),
    place(makeToken('monk', 'red'), vx - 0.45, vz + 1.6),
    place(makeToken('knight', 'blue'), 3.9, -2.2),
    place(makeToken('archer', 'blue'), 4.4, -1.7),
  ];

  /* table dressing: rival banners at the far corners, resource props in the candle's pool */
  const bR = makeBanner('red', { height: 1.5, seed: 5 }); bR.position.set(-6.1, 0, -3.1); wt.scene.add(bR);
  const bB = makeBanner('blue', { height: 1.5, seed: 9 }); bB.position.set(6.0, 0, -3.3); bB.rotation.y = -0.3; wt.scene.add(bB);
  wt.onTick((dt, t) => { bR.userData.update(t); bB.userData.update(t + 3); });
  const prop = (t, x, z, ry, s = 2.2, seed = 1) => { const p = makeProp(t, { seed }); p.scale.setScalar(s); p.position.set(x, 0, z); p.rotation.y = ry; wt.scene.add(p); return p; };
  prop('gold', -1.8, 6.3, 0.3, 1.55);
  prop('wood', -4.3, 2.75, 1.5, 1.6, 2); // the supply depot by the map's west edge, soft in the dark
  prop('food', -6.1, 4.0, 0.5, 1.8);
  prop('stone', -5.4, 2.6, 0.2, 1.6, 3);
  // the single chess nod: a small ebony king keeping watch beside the candle
  const king = makePiece('king', 'black'); king.scale.setScalar(0.36); king.position.set(-4.05, 0, 4.9); king.rotation.y = 0.4; wt.scene.add(king);
  // the foreground story is the campaign: a red knight token stands by the coins
  const hero = makeToken('knight', 'red'); hero.scale.setScalar(0.8); hero.position.set(-1.05, 0, 5.95); wt.scene.add(hero);

  /* camera: candle close-up, the map soft behind */
  const cam = new THREE.Vector3(-0.4, 2.3, 12.8), look = new THREE.Vector3(-1.7, 1.55, 6.0);
  wt.camera.position.copy(cam); wt.camera.lookAt(look);
  // no glow sprite: behind a DOF pass it took the background's blur and drew a hard dull disc; bloom gives the halo
  wt.candle.userData.glow.visible = false;
  wt.candle.userData.aimDrips(cam);
  const flame = wt.candle.userData.flameWorldPos();
  for (const tk of [...statics, hero]) tk.userData.faceToward(cam, cam, flame);
  // a soft warm key on the village so its age reads through the blur
  { const vk = new THREE.SpotLight(0xffb070, +(Q.get('vk') ?? 9), 0, 0.42, 0.9, 2); vk.position.set(vx + 1.6, 3.4, vz + 2.6);
    vk.target.position.set(vx, 0.2, vz); wt.scene.add(vk, vk.target); }
  const dof = Q.get("dof") === "0" ? { setFocus() {} } : wt.enableDOF({ aperture: +(Q.get('ap') ?? 0.0016), maxblur: 0.0055 });
  // focus on the front of the wax (the hero), not the flame's centre a hand's width behind it
  dof.setFocus(flame.clone().add(cam.clone().sub(flame).setY(0).normalize().multiplyScalar(0.2)).setY(flame.y - 0.35));
  // depth of field BEFORE bloom: blurring the bloomed frame smeared the flame halo into a box over the
  // background depth; this way the halo is added after the blur and stays round
  { const ps = wt.composer.passes, bi = ps.indexOf(wt.bloomPass), ki = ps.findIndex((x) => x.constructor.name === 'BokehPass');
    if (bi >= 0 && ki > bi) { const [k] = ps.splice(ki, 1); ps.splice(bi, 0, k); } }
  // the light sits higher: right above the lip it blew the rim out to white and bloomed into a box
  wt.candle.userData.light.position.y += +(Q.get('ly') ?? 0.4);
  makeSmokeWriter(wt, flame, 'Be right back', { center: new THREE.Vector3(-1.6, 2.6, 5.9), width: 3.5, count: +(Q.get('sc') || 20000) });
  wt.onTick((dt, t) => {
    wt.camera.position.set(cam.x + Math.sin(t * 0.17) * 0.04, cam.y + Math.sin(t * 0.21) * 0.02, cam.z);
    wt.camera.lookAt(look);
  });
  if (MIN != null) {
    const el = document.getElementById('smokeCount'); el.hidden = false;
    el.style.right = '250px'; el.style.top = '455px';
    const rem0 = MIN * 60;
    wt.onTick((dt, t) => { const s = Math.max(0, Math.ceil(rem0 - t)); el.textContent = `back in ${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`; });
  }
}

/* ------------------------------------------------------------------ boot */
await fontsReady();
await build();
window.wt = wt;
document.getElementById('tFollow').onclick = () => setFollower(NAMES[1 + Math.floor(Math.random() * (NAMES.length - 1))], true);
document.getElementById('tChat').onclick = () => pushChat();
if (!SHOT) setInterval(pushChat, 25000);
if (SHOT) {
  const t = Q.has('t') ? +Q.get('t') : T_DEFAULT;
  wt.advance(Math.max(0.1, t));
  // finish the GPU queue inside the script: under SwiftShader a long frame left pending made headless Edge
  // kill the renderer during the screenshot (seen at t>=9 with full smoke + DOF)
  const g = wt.renderer.getContext(), px = new Uint8Array(4);
  g.readPixels(0, 0, 1, 1, g.RGBA, g.UNSIGNED_BYTE, px);
  console.log('brb shot t=' + wt.time.toFixed(2));
  if (Q.get('perf') === '1') { // debug: GPU cost of one frame (readPixels forces the queue to finish)
    const t0 = performance.now(); wt.composer.render(0); g.readPixels(0, 0, 1, 1, g.RGBA, g.UNSIGNED_BYTE, px);
    console.log('brb perf frame ms=' + (performance.now() - t0).toFixed(0));
  }
}
