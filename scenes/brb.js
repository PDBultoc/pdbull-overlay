// BRB scene (production, from approved prototype B2): candle close-up; the smoke writes the BRB text;
// behind it, out of focus, the commander's campaign table (parchment map, fog of war, village, tokens, props).
// Text from settings.scenes.brbText, last follower from settings.latest.follower, chat from Twitch (channel pdbull).
// Review-only query (off by default): ?shot=1 (deterministic frame) &t=<seconds> &follower=<name> &demo=1 (sample chat)
//   &dof=0 &sc=<smoke particles> &age=dark|feudal|castle|imperial
import { createWarTable, makePiece, makeTable, fitStage, THREE } from '../shared/war-table.js';
import { makeCampaignMap, makeToken, makeBanner, makeProp, AGES } from '../shared/campaign.js';
import { RenderPass } from 'three/addons/postprocessing/RenderPass.js';
import { createScene } from '../core/scene.js';
import { createSettings } from '../core/settings.js';
import { createBus } from '../core/bus.js';
import { createRemote } from '../core/remote.js';
import { startAutoUpdate } from '../core/autoupdate.js';
import { connect } from '../core/twitchchat.js';
import { addLine, trimName } from '../core/brbchat.js';

const Q = new URLSearchParams(location.search);
// quality knob for weak machines, set once in the OBS source URL: ?q=low (smoke ~1/3, wisps ~1/2, no DOF); default = full look
const LOW = Q.get('q') === 'low';
console.log('brb quality=' + (LOW ? 'low' : 'full'));
const SHOT = Q.get('shot') === '1';
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

/* ------------------------------------------------------------------ smoke writer */
// Round 2: the dissolve now sweeps left to right (aU = position along the text), tight per-letter jitter, little
// size growth (the old growth made blobs), more and finer particles so the letters stay crisp at 1080p.
const SMOKE_VS = /* glsl */`
uniform float uT; uniform float uTime; uniform vec3 uSrc; uniform float uPix; uniform float uSize;
attribute vec3 aTarget; attribute float aSeed; attribute float aDelay; attribute float aU;
varying float vA; varying float vSeed; varying float vLit;
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
  float tb = (1.0 - e) * 0.26 + 0.006;
  float held = max(uT - aDelay - travel, 0.0);
  pos.x += sin(aTarget.y * 9.0 + uTime * 0.55 + aSeed * 2.0) * 0.018 * e;
  pos.y += sin(aTarget.x * 6.0 + uTime * 0.45) * 0.022 * e + held * 0.012;
  pos.x += sin(uTime * 1.3 + aSeed * 31.0 + pos.y * 3.0) * tb;
  pos.y += sin(uTime * 0.9 + aSeed * 23.0 + pos.x * 2.0) * tb * 0.6;
  pos.z += cos(uTime * 1.1 + aSeed * 13.0) * tb;
  // dissolve: a front sweeps from the first letter to the last (about 3 s), each wisp lifts off within ~2 s of it
  float d = clamp((uT - 14.2 - aU * 3.2 - aSeed * 0.35) / 2.2, 0.0, 1.0);
  float d2 = d * d;
  pos += vec3(sin(aSeed * 50.0) * 0.16 + 0.12, 1.1, cos(aSeed * 29.0) * 0.25) * d2;
  pos.x += sin(pos.y * 4.0 + uTime * 0.8 + aSeed * 5.0) * 0.06 * d;
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
  gl_PointSize = uSize * mix(0.5, 1.5, halo) * (0.8 + aSeed * 0.4) * (1.0 + d * 0.9 + (1.0 - e) * 1.6) * uPix / -mv.z;
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
  // long texts shrink to fit the canvas instead of being cut
  const mw = g.measureText(text).width; if (mw > W - 80) g.font = `italic 500 ${Math.floor(300 * (W - 80) / mw)}px "Cormorant Garamond", Georgia, serif`;
  g.fillText(text, W / 2, H / 2 + 10);
  const d = g.getImageData(0, 0, W, H).data; const cand = [];
  let minX = W, maxX = 0;
  for (let y = 0; y < H; y += 2) for (let x = 0; x < W; x += 2) if (d[(y * W + x) * 4] > 120) { cand.push([x, y]); minX = Math.min(minX, x); maxX = Math.max(maxX, x); }
  const r = rng(seed); const out = [];
  const s = widthWorld / (maxX - minX || 1);
  for (let i = 0; i < n && cand.length; i++) {
    const [x, y] = cand[Math.floor(r() * cand.length)];
    out.push([(x - (minX + maxX) / 2) * s + (r() - 0.5) * 0.02, (H / 2 - y) * s + (r() - 0.5) * 0.02, (r() - 0.5) * 0.08, (x - minX) / (maxX - minX)]);
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
  const n = pts.length;
  const tg = new Float32Array(n * 3), sd = new Float32Array(n), dl = new Float32Array(n), uu = new Float32Array(n), pos = new Float32Array(n * 3);
  const r = rng(11);
  pts.forEach(([x, y, z, u], i) => { tg.set([x, y, z], i * 3); sd[i] = r(); dl[i] = u * 4.6 + r() * 0.5; uu[i] = u; });
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  geo.setAttribute('aTarget', new THREE.BufferAttribute(tg, 3));
  geo.setAttribute('aSeed', new THREE.BufferAttribute(sd, 1));
  geo.setAttribute('aDelay', new THREE.BufferAttribute(dl, 1));
  geo.setAttribute('aU', new THREE.BufferAttribute(uu, 1));
  const pixK = () => wt.renderer.domElement.height / (2 * Math.tan(THREE.MathUtils.degToRad(wt.camera.fov / 2)));
  const common = {
    uPix: { value: pixK() }, uColor: { value: new THREE.Color(0x77726d) }, uWarm: { value: new THREE.Color(0xb98f66) },
    uTime: { value: 0 }, uSrc: { value: srcLocal },
  };
  const mat = new THREE.ShaderMaterial({
    uniforms: { ...common, uT: { value: 0 }, uSize: { value: 0.052 }, uOpacity: { value: 0.17 } },
    vertexShader: SMOKE_VS, fragmentShader: SMOKE_FS, transparent: true, depthWrite: false, depthTest: false,
  });
  const smoke = new THREE.Points(geo, mat); smoke.frustumCulled = false; group.add(smoke);
  const wn = LOW ? 1600 : 3200; const wg = new THREE.BufferGeometry(); const ws = new Float32Array(wn);
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
  const off = wt.onTick((dt, t) => {
    const T = t % cycle;
    mat.uniforms.uT.value = T; mat.uniforms.uTime.value = t; wmat.uniforms.uTime.value = t;
    wmat.uniforms.uOn.value = 0.45 + 0.55 * smooth(13.5, 17.5, T) + 0.55 * (1 - smooth(0, 2, T));
    mat.uniforms.uPix.value = wmat.uniforms.uPix.value = pixK();
  });
  return {
    dispose() {
      off(); const i = wt.composer.passes.indexOf(pass); if (i >= 0) wt.composer.passes.splice(i, 1);
      geo.dispose(); wg.dispose(); mat.dispose(); wmat.dispose();
    },
  };
}

/* ------------------------------------------------------------------ DOM: follower + chat */
const followerBox = document.getElementById('follower');
let shownFollower = null;
function setFollower(name, fresh) {
  const n = trimName(name);
  if (n === shownFollower) return;
  shownFollower = n;
  followerBox.hidden = !n;
  document.getElementById('followerName').textContent = n;
  if (n && fresh) { followerBox.classList.remove('fresh'); void followerBox.offsetWidth; followerBox.classList.add('fresh'); }
}
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

/* ------------------------------------------------------------------ scene */
let smoke = null, smokeText = null, lastHandles = null;
const BRB_FALLBACK = 'Be right back';
const cleanText = (s) => String(s == null ? '' : s).replace(/\s+/g, ' ').trim().slice(0, 40) || BRB_FALLBACK;

function setSmokeText(text) {
  const t = cleanText(text);
  if (t === smokeText) return;
  smokeText = t;
  if (!lastHandles) return; // scene not built yet: build() reads smokeText
  smoke?.dispose();
  smoke = makeSmokeWriter(lastHandles.wt, lastHandles.flame, t, lastHandles.smokeOpts);
}

function build(wt) {
  // one warm source: the cool back rim turned the parchment snow-white; keep only a faint warm bounce
  wt.hemi.intensity = 0.07; if (wt.rim) { wt.rim.intensity = 0; wt.rim.visible = false; }
  // The walnut table ends at z=-11 and fogged to black behind the map ("floating in a void"): a second slab
  // continues the same walnut far back, with a dark panelled wall behind it and a faint low warm fill.
  { const ext = makeTable({ width: 60, depth: 40, seed: 17 }); ext.position.set(0, -0.61, -30.4); wt.scene.add(ext);
    const wall = new THREE.Mesh(new THREE.PlaneGeometry(80, 18), new THREE.MeshStandardMaterial({ color: 0x4a2f1c, roughness: 0.9 }));
    wall.position.set(0, 8, -50.4); wt.scene.add(wall);
    const far = new THREE.PointLight(0xff9a52, 22, 0, 2); far.position.set(5.6, 1.5, -6.2); wt.scene.add(far);
    // a second, higher warm fill over the far table (the same off-frame candles) so walnut continues behind the map
    const far2 = new THREE.PointLight(0xff9448, 60, 0, 2); far2.position.set(-3, 1.2, -9); wt.scene.add(far2);
    // (the room fog, tuned for a close board, swallowed everything past ~15 units into black: thinned by tableOpts.fogDensity)
    // fix round 1: the far (right) half of the map still read dim. A low warm fill over it (candle mood kept: it is
    // a pool, not even room light) plus a faint warm falloff on the wall and sky so the table edge is not a hard black void.
    const far3 = new THREE.PointLight(0xffa05a, 28, 0, 2); far3.position.set(4.6, 3.4, 0.6); wt.scene.add(far3);
    const wallGlow = new THREE.PointLight(0xff8a40, 280, 0, 2); wallGlow.position.set(0, 7, -41); wt.scene.add(wallGlow);
    wt.scene.background = new THREE.Color(0x140c07); if (wt.scene.fog) wt.scene.fog.color.set(0x140c07); }
  wt.candle.userData.waxGlow.value = 0.35;
  const bounce = new THREE.PointLight(0xffb36a, 1.1, 2.0, 2); bounce.position.set(-2.55, 0.25, 7.2); wt.scene.add(bounce);

  /* campaign map, centred behind the candle (shared parchment is already warm since T2: no page-local repaint) */
  const map = makeCampaignMap({ width: 11, depth: 7.4, seed: 3, colour: 'red' });
  const LIFT = 0.006; map.position.y = LIFT;
  wt.scene.add(map); map.userData.attach(wt);
  const U = map.userData, F = U.features, Y = (x, z) => U.surfaceY(x, z) + LIFT;
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
  U.reveal(-1.2, 2.7, 2.6, { duration: 0 }); U.reveal(1.9, 2.6, 2.1, { duration: 0 });
  // shared fog is warm umber now; a little thinner here so the far half of the map stays readable under one candle
  U.setFogOpacity(0.8);
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
  wt.onTick((dt, t) => {
    const span = L / SPEED, u = Math.max(0, t - SCOUT_T0) / span, back = Math.floor(u) % 2 === 1;
    const s = (back ? 1 - (u % 1) : u % 1) * L;
    let i = seg.findIndex(([a, d]) => s <= a + d); if (i < 0) i = seg.length - 1;
    const [a, d] = seg[i], k = clamp01((s - a) / d), p0 = route[i], p1 = route[i + 1];
    const x = p0[0] + (p1[0] - p0[0]) * k, z = p0[1] + (p1[1] - p0[1]) * k;
    scout.position.set(x, Y(x, z) + Math.abs(Math.sin(t * 4.0)) * 0.01, z);
    scout.rotation.y = -Math.atan2(p1[1] - p0[1], p1[0] - p0[0]) + (back ? Math.PI : 0);
  });

  const statics = [
    place(makeToken('knight', 'red'), vx + 0.35, vz + 1.5),
    place(makeToken('villager', 'red'), F.gold[0][0] + 0.55, F.gold[0][1] + 0.2),
    place(makeToken('villager', 'red'), F.gold[0][0] + 0.2, F.gold[0][1] + 0.75),
    place(makeToken('archer', 'red'), vx - 1.1, vz + 1.05),
    place(makeToken('monk', 'red'), vx - 0.45, vz + 1.6),
    place(makeToken('knight', 'blue'), 3.9, -2.2),
    place(makeToken('archer', 'blue'), 4.4, -1.7),
  ];

  /* table dressing */
  const bR = makeBanner('red', { height: 1.5, seed: 5 }); bR.position.set(-6.1, 0, -3.1); wt.scene.add(bR);
  const bB = makeBanner('blue', { height: 1.5, seed: 9 }); bB.position.set(6.0, 0, -3.3); bB.rotation.y = -0.3; wt.scene.add(bB);
  wt.onTick((dt, t) => { bR.userData.update(t); bB.userData.update(t + 3); });
  const prop = (t, x, z, ry, s = 2.2, seed = 1) => { const p = makeProp(t, { seed }); p.scale.setScalar(s); p.position.set(x, 0, z); p.rotation.y = ry; wt.scene.add(p); return p; };
  prop('gold', -1.8, 6.3, 0.3, 1.55);
  prop('wood', -4.3, 2.75, 1.5, 1.6, 2);
  prop('food', -6.1, 4.0, 0.5, 1.8);
  prop('stone', -5.4, 2.6, 0.2, 1.6, 3);
  const king = makePiece('king', 'black'); king.scale.setScalar(0.36); king.position.set(-4.05, 0, 4.9); king.rotation.y = 0.4; wt.scene.add(king);
  const hero = makeToken('knight', 'red'); hero.scale.setScalar(0.8); hero.position.set(-1.05, 0, 5.95); wt.scene.add(hero);

  /* camera: candle close-up, the map soft behind */
  const cam = new THREE.Vector3(-0.4, 2.3, 12.8), look = new THREE.Vector3(-1.7, 1.55, 6.0);
  wt.camera.position.copy(cam); wt.camera.lookAt(look);
  wt.candle.userData.glow.visible = false; // no glow sprite behind DOF (bloom gives the halo)
  wt.candle.userData.aimDrips(cam);
  const flame = wt.candle.userData.flameWorldPos();
  for (const tk of [...statics, hero]) tk.userData.faceToward(cam, cam, flame);
  { const vk = new THREE.SpotLight(0xffb070, 9, 0, 0.42, 0.9, 2); vk.position.set(vx + 1.6, 3.4, vz + 2.6);
    vk.target.position.set(vx, 0.2, vz); wt.scene.add(vk, vk.target); }
  // lighter blur than the prototype: the age change of the village (t=40..43) must read through it
  const dof = (Q.get('dof') === '0' || LOW) ? { setFocus() {} } : wt.enableDOF({ aperture: 0.0011, maxblur: 0.0038 });
  dof.setFocus(flame.clone().add(cam.clone().sub(flame).setY(0).normalize().multiplyScalar(0.2)).setY(flame.y - 0.35));
  wt.onTick((dt, t) => {
    wt.camera.position.set(cam.x + Math.sin(t * 0.17) * 0.04, cam.y + Math.sin(t * 0.21) * 0.02, cam.z);
    wt.camera.lookAt(look);
  });
  const smokeOpts = { center: new THREE.Vector3(-1.6, 2.6, 5.9), width: 3.5, count: +(Q.get('sc') || (LOW ? 10000 : 30000)) };
  lastHandles = { wt, flame, smokeOpts };
  smoke = makeSmokeWriter(wt, flame, smokeText || BRB_FALLBACK, smokeOpts);
  smokeText = smokeText || BRB_FALLBACK;
}

/* ------------------------------------------------------------------ boot */
const settings = createSettings();
const bus = createBus({ name: 'pdbull' });
// the scene is consume-only: it never publishes settings, so no echo guard (fromRemote) is needed
const remote = createRemote({
  room: Q.get('room') || '',
  onSettings: (s) => settings.patch(s), // settings only: room events belong to the overlay, never re-emitted here
});
bus.on('settings', (p) => { if (p && typeof p === 'object') settings.patch(p); else render(); });

function render() {
  const s = settings.get();
  setSmokeText(s.scenes && s.scenes.brbText);
  setFollower(Q.get('follower') || (s.latest && s.latest.follower), true);
}
settings.onChange(() => { render(); });

await fontsReady();
smokeText = cleanText(settings.get().scenes && settings.get().scenes.brbText);
const stage = createScene({
  canvasHost: document.getElementById('gl'),
  createTable: createWarTable, // already imported above: start() builds synchronously (a shot can stop before any frame renders)
  build,
  maxFps: 60,
  tableOpts: {
    board: false, fogDensity: 0.008, candlePos: [-2.9, 0, 6.3], candle: { height: 1.05, lightIntensity: 26, shadowRadius: 8 },
    bloom: { strength: 0.32, radius: 0.4, threshold: 2.3 }, exposure: 0.92,
  },
});
render();
bus.emit('settings-request', {});
if (!SHOT) { remote.start(); startAutoUpdate(); } // review shots skip the network streams

if (Q.get('demo') === '1') { // review only: sample chat lines
  [{ user: 'NordicFox', color: '#9fb4cc', text: 'grabbing tea, back soon?' },
    { user: 'Extremely_Long_Name_25chr', color: '#0000FF', text: 'knights hit at minute fourteen, hold the line and do not let the scouts wander into the fog Averyveryveryverylongwordwithoutanyspacesatalltotestwrapping' },
    { user: 'luna_pawn', color: '#dcb77a', text: 'see you in a bit' }].forEach((m) => pushChat(m));
} else if (!SHOT) {
  connect({ channel: 'pdbull', onMessage: pushChat });
}

if (SHOT) {
  stage.start();
  stage.stop();
  const wt = stage.wt, t = Q.has('t') ? +Q.get('t') : 11.5;
  wt.advance(Math.max(0.1, t));
  const g = wt.renderer.getContext(), px = new Uint8Array(4);
  g.readPixels(0, 0, 1, 1, g.RGBA, g.UNSIGNED_BYTE, px);
  window.wt = wt;
  console.log('brb shot t=' + wt.time.toFixed(2));
} else {
  stage.start();
}
