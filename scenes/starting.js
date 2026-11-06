// Starting Soon (production port of prototype A1): the camera orbits a commander's campaign table, a scout lifts the fog of war,
// the village grows Dark -> Feudal -> Castle -> Imperial over one loop, tokens move, resource props and one chess king by the candle.
// The countdown burns the real candle down. settings.scenes.countdownEnd (epoch ms; null = "Starting soon" only) drives it,
// settings.latest.follower feeds the corner welcome. Test-only params: ?shot=1&t=<s> (deterministic capture frozen at scene time t).
import { createScene } from '../core/scene.js';
import { createWarTable, fitStage } from '../shared/war-table.js';
import { createSettings } from '../core/settings.js';
import { createBus } from '../core/bus.js';
import { createRemote } from '../core/remote.js';
import { startAutoUpdate } from '../core/autoupdate.js';
import { createSceneAudio } from '../core/sceneaudio.js';
import { remainingSeconds, countdownView, waxTotal } from '../core/countdown.js';

const q = new URLSearchParams(location.search);
const SHOT = q.get('shot') === '1'; const X = (q.get('x')||'').split(',');
if (SHOT) document.body.classList.add('shot');
const $ = (id) => document.getElementById(id);

// ---------------------------------------------------------------- settings + room (same pattern as overlay.html)
const settings = createSettings();
const bus = createBus({ name: 'pdbull' });
// generated ambience (dock: settings.ambience.enabled / volume); a capture stays silent
const audio = createSceneAudio({ preset: 'starting', settings: settings.get(), AudioCtx: SHOT ? null : globalThis.AudioContext });
addEventListener('pagehide', () => audio.dispose());
const SHOT_EPOCH = 1e12; // shot mode: the clock is the scene clock, so captures are deterministic
let wtRef = null;
const nowMs = SHOT ? () => SHOT_EPOCH + (wtRef ? wtRef.time : 0) * 1000 : () => Date.now();

const cfg = () => {
  const s = settings.get(), sc = s.scenes || {};
  const min = Math.max(0.05, Number(sc.countdownMin) || 5);
  let end = sc.countdownEnd == null || sc.countdownEnd === '' ? null : Number(sc.countdownEnd);
  if (end != null && !Number.isFinite(end)) end = null;
  if (SHOT && end == null) end = SHOT_EPOCH + min * 60 * 1000; // shot only: show a running countdown
  return { end, min, follower: String((s.latest && s.latest.follower) || '').trim() };
};
let C = cfg();
let total = 300;
const setTotal = () => { const r = remainingSeconds(C.end, nowMs()); total = waxTotal(r, C.min * 60); };
setTotal();

function render() { // DOM side of the settings (the 3D side reads C every tick)
  const prevEnd = C.end;
  C = cfg();
  if (C.end !== prevEnd) setTotal();
  const f = $('follower'), w = $('welcome');
  f.textContent = C.follower; w.hidden = !C.follower;
  audio.apply(settings.get());
}
render();
settings.onChange(render);
bus.on('settings', (p) => { if (p && typeof p === 'object') settings.patch(p); });
if (!SHOT) { // a capture must not open the ntfy stream (it never goes idle)
  const remote = createRemote({
    room: q.get('room') || '',
    onSettings: (s) => settings.patch(s), // settings only: room events belong to the overlay, never re-emitted here
  });
  remote.start();
  startAutoUpdate();
}

// ---------------------------------------------------------------- utilities
function rng(seed) { return () => { seed |= 0; seed = (seed + 0x6D2B79F5) | 0; let t = Math.imul(seed ^ (seed >>> 15), 1 | seed); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; }; }
const clamp = (x, a = 0, b = 1) => Math.min(b, Math.max(a, x));
const sstep = (a, b, x) => { const t = clamp((x - a) / (b - a)); return t * t * (3 - 2 * t); };
const lerp = (a, b, t) => a + (b - a) * t;

const CANDLE = [-6.55, 0, 2.75];
const BLUE_POS = [4.35, -4.45]; // the rival's banner
const LOOP = 120, k = 1;
const AGE_AT = [0, 28, 58, 88];
const AGE_NAMES = ['Dark Age', 'Feudal Age', 'Castle Age', 'Imperial Age'];
const ROLLBACK = 112; // fog rolls back in, the village sinks back to the dark age

// Capture hang (docs/capture.md): the heavy SwiftShader work used to run AFTER the load event (lazy table import + async build),
// so the headless screenshot request arrived while the page was busy for ~20 s and never completed (4 of 5 runs).
// Shot mode now does all of it before load: createTable is the statically imported factory (build runs synchronously inside
// start(), stopped before any rAF frame) and the module awaits the finished shot at top level, like scenes/brb.js.
let shotDone = Promise.resolve();
const sc = createScene({
  canvasHost: $('gl'),
  createTable: createWarTable,
  tableOpts: { board: false, candlePos: CANDLE, fov: 30, candle: { lightIntensity: 54 }, exposure: 1.1 },
  // shot: stop BEFORE make() starts rAF (build() is async; stopping inside it let ~3 SwiftShader frames render first)
  build: (wt) => { wtRef = wt; if (SHOT) sc.stop(); shotDone = build(wt).catch((e) => console.error('starting build', e)); return shotDone; },
});
fitStage($('stage')); // fit to the window like every scene page
sc.start();
if (SHOT) await shotDone;

async function build(wt) {
  const [WT, CP] = await Promise.all([import('../shared/war-table.js'), import('../shared/campaign.js')]);
  const { makePiece, makeWoodCanvases, getMaterials, THREE } = WT;
  const { makeCampaignMap, makeToken, makeBanner, makeProp, AGES } = CP;
  const V3 = (x, y, z) => new THREE.Vector3(x, y, z);
  const { scene, camera } = wt;
  const mats = getMaterials();
  wt.options.ambient = 0.2; wt.hemi.intensity = 0.2; wt.hemi.color.set(0x8a5e3a); // warm bounce from the parchment
  scene.environmentIntensity = 0.06;
  if (wt.rim) { wt.rim.color.set(0xffd2a0); wt.rim.intensity = 0.3; } // warm, faint: no cool glint on the table scratches
  { // candle halo: smooth gaussian falloff to zero alpha (the shared sprite reads as a blocky blob at this size)
    const gc = document.createElement('canvas'); gc.width = gc.height = 256; const gg = gc.getContext('2d'); const im = gg.createImageData(256, 256);
    for (let y = 0; y < 256; y++) for (let x = 0; x < 256; x++) {
      const r = Math.hypot(x - 127.5, y - 127.5) / 128, i = (y * 256 + x) * 4;
      const a = r >= 1 ? 0 : Math.exp(-r * r * 6.5) * Math.pow(1 - r * r, 2);
      im.data[i] = 255; im.data[i + 1] = 196 - 70 * r; im.data[i + 2] = 120 - 80 * r; im.data[i + 3] = Math.round(a * 255);
    }
    gg.putImageData(im, 0, 0);
    const glow = wt.candle.userData.glow;
    if (glow && !X.includes('halo')) { const gt = new THREE.CanvasTexture(gc); gt.colorSpace = THREE.SRGBColorSpace; glow.material.map = gt; glow.material.color.set(0xd8a878); glow.scale.set(0.85, 0.85, 1); glow.material.depthTest = false; glow.material.needsUpdate = true; }
  }
  { // wax: warmer cream, low broad sheen (a hot pale sheen made the pillar read as frosted glass at this distance)
    const wm = wt.candle.userData.waxMaterial;
    if (wm) { wm.color.set(0xcfa878); wm.envMapIntensity = 0.25; wm.sheen = 0.1; wm.sheenColor.set(0xffc888); wm.specularIntensity = 0.22; wm.roughness = 0.6; }
  }
  { // table clear coat: scratches softened and roughness raised, so the candle's reflection is a broad glow, not a star
    const tm = wt.table && wt.table.material, rt = tm && tm.clearcoatRoughnessMap;
    if (rt && rt.image && !X.includes('cc')) {
      const src = rt.image, c = document.createElement('canvas'); c.width = src.width; c.height = src.height;
      const g = c.getContext('2d'); g.fillStyle = 'rgb(118,118,118)'; g.fillRect(0, 0, c.width, c.height);
      g.globalAlpha = 0.34; g.filter = 'blur(2.5px)'; g.drawImage(src, 0, 0);
      rt.image = c; rt.needsUpdate = true; tm.clearcoat = 0.55;
    }
  }

  const map = X.includes('map') ? new THREE.Group() : makeCampaignMap({ width: 11, depth: 7.4, seed: 3, colour: 'red', village: { age: 'dark', colour: 'red' } });
  scene.add(map); if (X.includes('map')) { map.userData = { attach() {}, features: { village: [0, 0], bridge: [0, 0], gold: [[0, 0], [0, 0]], stone: [[0, 0], [0, 0]] }, surfaceY: () => 0, width: 11, depth: 7.4, resetFog() {}, setAge() {}, reveal() {}, revealPath() {}, setFogOpacity() {} }; } map.userData.attach(wt);
  const U = map.userData, F = U.features, Y = U.surfaceY;
  const [VX, VZ] = F.village;

  // resource props + table banners + the one chess nod (a king beside the candle)
  const prop = (t, x, z, ry, s = 2.2, seed = 1) => { const p = makeProp(t, { seed }); p.scale.setScalar(s); p.position.set(x, 0, z); p.rotation.y = ry; scene.add(p); return p; };
  prop('food', -5.05, 4.75, 0.5);
  prop('gold', -4.45, 4.45, 0.2, 2.3);
  prop('wood', -7.55, 0.6, 0.55);
  prop('stone', -7.25, -1.95, 0.25);
  const king = makePiece('king', 'black'); king.scale.setScalar(0.6); king.position.set(-5.55, 0, 1.55); king.rotation.y = 0.5; scene.add(king);
  const bR = makeBanner('red', { height: 1.55, seed: 5 }); bR.position.set(-6.4, 0, -3.25); bR.rotation.y = 0.35; scene.add(bR);
  const bB = makeBanner('blue', { height: 1.55, seed: 9 }); bB.position.set(BLUE_POS[0], 0, BLUE_POS[1]); bB.rotation.y = -0.25; scene.add(bB);
  { // the rival's colour must read in the dark back corner: a faint self-lit glow from its own dye, no extra light source
    const cm = bB.userData.cloth && bB.userData.cloth.material;
    if (cm) { cm.emissive.set(0x2a4a8a); cm.emissiveMap = cm.map; cm.emissiveIntensity = 0.38; cm.needsUpdate = true; } }
  wt.onTick((dt, t) => { bR.userData.update(t); bB.userData.update(t + 3); });

  // ---------------------------------------------------------------- brass name plaque on a walnut wedge (PDBULL)
  const FONT_READY = Promise.all([document.fonts.load('600 120px Cinzel'), document.fonts.load('600 120px "Cormorant Garamond"')])
    .catch(() => {}).then(() => document.fonts.ready);
  const tex = (c, srgb = true) => { const t = new THREE.CanvasTexture(c); if (srgb) t.colorSpace = THREE.SRGBColorSpace; t.anisotropy = 8; return t; };
  function spaced(g, text, x, y, sp) {
    const chars = [...text]; const w = chars.reduce((s, ch) => s + g.measureText(ch).width, 0) + sp * (chars.length - 1);
    let cx = x - w / 2; for (const ch of chars) { g.fillText(ch, cx, y); cx += g.measureText(ch).width + sp; }
  }
  function makePlaque(text, { width = 3.2, slope = 0.6 } = {}) {
    const g = new THREE.Group();
    const W = 1024, H = 240;
    const mk = () => { const c = document.createElement('canvas'); c.width = W; c.height = H; return c; };
    const cc = mk(), bc = mk(), rc = mk(); const c = cc.getContext('2d'), b = bc.getContext('2d'), r = rc.getContext('2d');
    const grd = c.createLinearGradient(0, 0, 0, H); grd.addColorStop(0, '#e6c88f'); grd.addColorStop(0.5, '#c9a364'); grd.addColorStop(1, '#a8844e');
    c.fillStyle = grd; c.fillRect(0, 0, W, H);
    const rr = rng(5);
    for (let i = 0; i < 900; i++) { c.fillStyle = `rgba(${rr() > 0.5 ? '255,240,210' : '70,50,20'},${0.03 + rr() * 0.05})`; c.fillRect(0, rr() * H, W, 1); }
    b.fillStyle = '#fff'; b.fillRect(0, 0, W, H);
    r.fillStyle = '#585858'; r.fillRect(0, 0, W, H);
    for (const [ctx, col] of [[c, 'rgba(60,40,14,0.75)'], [b, '#000'], [r, '#d0d0d0']]) { ctx.strokeStyle = col; ctx.lineWidth = 3; ctx.strokeRect(22, 22, W - 44, H - 44); }
    c.font = b.font = r.font = '600 118px Cinzel'; c.textBaseline = b.textBaseline = r.textBaseline = 'middle';
    c.fillStyle = '#3a2a10'; spaced(c, text.toUpperCase(), W / 2, H / 2 + 8, 26);
    b.fillStyle = '#000'; spaced(b, text.toUpperCase(), W / 2, H / 2 + 8, 26);
    r.fillStyle = '#e8e8e8'; spaced(r, text.toUpperCase(), W / 2, H / 2 + 8, 26);
    for (const x of [56, W - 56]) {
      const sg = c.createRadialGradient(x - 5, H / 2 - 5, 1, x, H / 2, 16); sg.addColorStop(0, '#f6e2b8'); sg.addColorStop(0.6, '#8d6c3b'); sg.addColorStop(1, '#4d3817');
      c.fillStyle = sg; c.beginPath(); c.arc(x, H / 2, 15, 0, 7); c.fill();
      c.strokeStyle = 'rgba(40,26,8,0.8)'; c.lineWidth = 3; c.beginPath(); c.moveTo(x - 10, H / 2 + 4); c.lineTo(x + 10, H / 2 - 4); c.stroke();
    }
    const ph = width * H / W;
    const plateMat = new THREE.MeshPhysicalMaterial({ map: tex(cc), bumpMap: tex(bc, false), bumpScale: 3, roughnessMap: tex(rc, false), roughness: 1, metalness: 1, clearcoat: 0.25, clearcoatRoughness: 0.35 });
    plateMat.envMap = scene.environment; plateMat.envMapIntensity = 0.16;
    const wood = makeWoodCanvases({ width: 512, height: 256, dark: 0x1a0d07, light: 0x4a2c18, seed: 21, planks: 1 });
    const woodMat = new THREE.MeshPhysicalMaterial({ map: tex(wood.color), roughnessMap: tex(wood.rough, false), bumpMap: tex(wood.bump, false), bumpScale: 0.8, roughness: 1, clearcoat: 0.8, clearcoatRoughness: 0.25 });
    const D = ph * Math.cos(slope) + 0.2, Hb = 0.08, Ht = Hb + ph * Math.sin(slope) + 0.02;
    const sh = new THREE.Shape(); sh.moveTo(-D / 2, 0); sh.lineTo(D / 2, 0); sh.lineTo(D / 2, Hb); sh.lineTo(-D / 2 + 0.05, Ht); sh.lineTo(-D / 2, Ht); sh.closePath();
    const wg = new THREE.ExtrudeGeometry(sh, { depth: width + 0.3, bevelEnabled: true, bevelThickness: 0.02, bevelSize: 0.02, bevelSegments: 2 });
    wg.translate(0, 0, -(width + 0.3) / 2); wg.rotateY(-Math.PI / 2);
    const wedge = new THREE.Mesh(wg, woodMat); wedge.castShadow = wedge.receiveShadow = true; g.add(wedge);
    const plate = new THREE.Mesh(new THREE.PlaneGeometry(width, ph), plateMat); plate.receiveShadow = true;
    const a = Math.atan2(Ht - Hb, D - 0.05), zc = 0.025, yc = (Hb + Ht) / 2;
    plate.rotation.x = -(Math.PI / 2 - a);
    plate.position.set(0, yc + Math.cos(a) * 0.03, zc + Math.sin(a) * 0.03);
    g.add(plate);
    const edge = new THREE.Mesh(new THREE.BoxGeometry(width + 0.04, ph + 0.04, 0.02), mats.brassDark);
    edge.position.copy(plate.position); edge.rotation.copy(plate.rotation); edge.translateZ(-0.012); g.add(edge);
    return g;
  }
  const PLAQUE = { pos: [-1.75, 0, 5.05], ry: 0.2 };
  if (!X.includes('plaque')) FONT_READY.then(() => { const p = makePlaque('PDBull', { width: 2.2, slope: 0.62 }); p.position.set(...PLAQUE.pos); p.rotation.y = PLAQUE.ry; scene.add(p); });

  // ---------------------------------------------------------------- the loop: ages, fog, tokens
  // scout route: a closed loop through the map's features (smooth curve, arc-length parameterised)
  const W = U.width, Dd = U.depth;
  const routeXZ = [
    [VX + 0.9, VZ + 0.6], [VX + 0.4, VZ + 1.8], [-0.10 * W, 0.40 * Dd], [0.03 * W, 0.34 * Dd], [F.bridge[0] - 0.5, F.bridge[1] + 0.35],
    [F.bridge[0] + 0.15, F.bridge[1] - 0.05], [0.33 * W, 0.12 * Dd], [F.gold[1][0] - 0.1, F.gold[1][1] + 0.6], [0.40 * W, -0.26 * Dd],
    [0.22 * W, -0.36 * Dd], [F.stone[0][0] + 0.2, F.stone[0][1] + 0.35], [-0.05 * W, -0.36 * Dd], [-0.24 * W, -0.30 * Dd],
    [-0.40 * W, -0.22 * Dd], [F.gold[0][0] - 0.3, F.gold[0][1] - 0.6], [-0.40 * W, 0.24 * Dd], [VX - 1.2, VZ + 0.9],
  ];
  const curve = new THREE.CatmullRomCurve3(routeXZ.map(([x, z]) => V3(x, 0, z)), true, 'centripetal', 0.5);
  const ROUTE_LEN = curve.getLength();
  const SCOUT_T0 = 3 * k, SCOUT_T1 = 104 * k; // the scout rides the whole loop in this window
  const SCOUT_SPEED = ROUTE_LEN / (SCOUT_T1 - SCOUT_T0);
  const routePts = curve.getSpacedPoints(160).map((p) => [p.x, p.z]);

  const place = (obj, x, z, ry = 0) => { obj.position.set(x, Y(x, z), z); obj.rotation.y = ry; scene.add(obj); return obj; };
  const scout = place(makeToken('scout', 'red'), ...routeXZ[0]);
  const villager = place(makeToken('villager', 'red'), VX - 0.95, VZ + 0.25);
  const villager2 = place(makeToken('villager', 'red'), F.stone[1][0] + 0.45, F.stone[1][1] - 0.15);
  const archer = place(makeToken('archer', 'red'), VX + 0.95, VZ - 0.85);
  const knight = place(makeToken('knight', 'red'), VX + 1.05, VZ + 0.1);
  const monk = place(makeToken('monk', 'red'), VX - 0.55, VZ + 1.35);
  // a rival scout waits in the fog by the far gold mine; it is found when the fog lifts there
  const rival = place(makeToken('scout', 'blue'), F.gold[1][0] + 0.75, F.gold[1][1] - 0.25, Math.PI);
  const grow = (obj, s) => { obj.visible = s > 0.001; obj.scale.setScalar(Math.max(0.001, s)); };
  const settle = (x) => { x = clamp(x); const c = 1.4; return 1 + (c + 1) * Math.pow(x - 1, 3) + c * Math.pow(x - 1, 2); };

  // knight rides out from the castle gate east along the road to the bridge after the castle age
  const knightPath = new THREE.CatmullRomCurve3([[VX + 1.05, VZ + 0.1], [0.0 * W, 0.16 * Dd], [0.12 * W, 0.17 * Dd], [F.bridge[0] - 0.45, F.bridge[1] + 0.25]].map(([x, z]) => V3(x, 0, z)), false, 'centripetal');
  const villagerPath = [[VX - 0.95, VZ + 0.25], [F.gold[0][0] + 0.6, F.gold[0][1] + 0.15]];

  let loopIdx = -1, ageShown = -1, rivalSeen = false, rivalSeenAt = 0, fogResetLoop = -1;
  function startLoop() {
    // new loop: fresh fog (faded in by the tick), village back to the dark age, the scout's route scheduled
    U.resetFog(); rivalSeen = false;
    U.setAge('dark', { duration: loopIdx < 0 ? 0 : 2.4 });
    ageShown = 0;
    U.reveal(VX, VZ, 1.9, { duration: loopIdx < 0 ? 0 : 3.5, delay: loopIdx < 0 ? 0 : 1.0 });
    U.reveal(CANDLE[0] + 1.0, CANDLE[2] - 0.3, 1.2, { duration: 0 }); // the map's lamp-side corner is always known
    U.revealPath(routePts, 1.15, { speed: SCOUT_SPEED, delay: SCOUT_T0 - 0.6, duration: 2.6 });
    U.revealPath(villagerPath, 0.9, { speed: 0.5, delay: 6 * k, duration: 3 });
    // knight's road east (castle age)
    U.revealPath(knightPath.getSpacedPoints(30).map((p) => [p.x, p.z]), 1.0, { speed: 0.42, delay: AGE_AT[2] + 3, duration: 2.6 });
  }
  const faceStatic = () => { const fl = wt.candle.userData.flameWorldPos(), cp = V3(6.5, 7.5, 12.5); for (const t of [villager2, archer, monk]) t.userData.faceToward(cp, cp, fl); };

  wt.onTick((dt, t) => {
    const li = Math.floor(t / LOOP), lt = t - li * LOOP;
    if (li !== loopIdx) { startLoop(); loopIdx = li; }
    // ages
    let a = 0; for (let i = 0; i < 4; i++) if (lt >= AGE_AT[i]) a = i;
    if (lt >= ROLLBACK) a = 0;
    if (a !== ageShown && lt < ROLLBACK) { U.setAge(AGES[a], { duration: 2.6 }); ageShown = a; }
    if (lt >= ROLLBACK && ageShown !== -2) { U.setAge('dark', { duration: 3 }); ageShown = -2; }
    // fog at the end of the loop: what is left thins away (1.5 s), the mask is reset, and fresh fog rolls in over the whole map
    if (lt >= ROLLBACK + 1.5 && fogResetLoop !== loopIdx) { U.resetFog(); fogResetLoop = loopIdx; }
    U.setFogOpacity(lt < ROLLBACK ? 1 : lt < ROLLBACK + 1.5 ? 1 - sstep(ROLLBACK, ROLLBACK + 1.5, lt) : sstep(ROLLBACK + 1.5, LOOP - 0.5, lt));
    // age plate (brass): shows for ~5 s at each age change
    let plate = 0, which = -1;
    for (let i = 0; i < 4; i++) { const s = lt - AGE_AT[i] - (i === 0 ? 1.5 : 1.0); if (s > 0 && s < 6) { plate = sstep(0, 0.9, s) * (1 - sstep(4.8, 6, s)); which = i; } }
    if (which >= 0 && $('ageName').textContent !== AGE_NAMES[which]) $('ageName').textContent = AGE_NAMES[which];
    const ap = $('agePlate'); ap.style.setProperty('--age-op', plate.toFixed(3)); ap.style.setProperty('--age-y', ((1 - plate) * -8).toFixed(1) + 'px');

    // scout
    const sd = clamp((lt - SCOUT_T0) / (SCOUT_T1 - SCOUT_T0));
    const u0 = sd % 1, p = curve.getPointAt(u0), pa = curve.getPointAt((u0 + 0.004) % 1);
    scout.position.set(p.x, Y(p.x, p.z) + Math.abs(Math.sin(t * 4.2)) * 0.014, p.z);
    scout.rotation.y = -Math.atan2(pa.z - p.z, pa.x - p.x);
    grow(scout, lt > ROLLBACK + 2 ? 1 - sstep(ROLLBACK + 2, ROLLBACK + 4, lt) : 1);
    // villager: village <-> west gold mine, with pauses (period 18 s)
    {
      const per = 18 * k, s = ((lt - 6 * k) % per + per) % per, out = sstep(0, 6 * k, s), back = sstep(9 * k, 15 * k, s);
      const f = lt < 6 * k ? 0 : out - back, [a0, a1] = villagerPath;
      const x = lerp(a0[0], a1[0], f), z = lerp(a0[1], a1[1], f);
      villager.position.set(x, Y(x, z) + (Math.abs(out - 0.5) < 0.5 && s < 6 * k || s > 9 * k && s < 15 * k ? Math.abs(Math.sin(t * 5)) * 0.01 : 0), z);
      const goingOut = s < 7.5 * k; villager.rotation.y = goingOut ? -Math.atan2(a1[1] - a0[1], a1[0] - a0[0]) : -Math.atan2(a0[1] - a1[1], a0[0] - a1[0]);
    }
    // feudal: archer appears; castle: knight rides out; imperial: monk appears
    grow(archer, lt < ROLLBACK ? settle(sstep(AGE_AT[1] + 1.5, AGE_AT[1] + 2.6, lt)) : 1 - sstep(ROLLBACK, ROLLBACK + 2, lt));
    if (!rivalSeen && lt > SCOUT_T0 && scout.position.distanceTo(rival.position) < 1.5) { rivalSeenAt = lt; rivalSeen = true; }
    grow(rival, rivalSeen ? (lt < ROLLBACK ? settle(sstep(rivalSeenAt + 0.6, rivalSeenAt + 1.8, lt)) : 1 - sstep(ROLLBACK, ROLLBACK + 2, lt)) : 0);
    grow(monk, lt < ROLLBACK ? settle(sstep(AGE_AT[3] + 2.0, AGE_AT[3] + 3.1, lt)) : 1 - sstep(ROLLBACK, ROLLBACK + 2, lt));
    {
      const kt = lt - AGE_AT[2] - 1.5;
      grow(knight, lt < ROLLBACK ? settle(sstep(0, 1.1, kt)) : 1 - sstep(ROLLBACK, ROLLBACK + 2, lt));
      const kd = sstep(2, 2 + knightPath.getLength() / 0.42, kt);
      const kp = knightPath.getPointAt(kd), kq = knightPath.getPointAt(Math.min(1, kd + 0.01)), kb = knightPath.getPointAt(Math.max(0, kd - 0.01));
      knight.position.set(kp.x, Y(kp.x, kp.z) + (kd > 0 && kd < 1 ? Math.abs(Math.sin(t * 3.6)) * 0.012 : 0), kp.z);
      knight.rotation.y = -Math.atan2(kq.z - kb.z, kq.x - kb.x);
    }
  });

  // ---------------------------------------------------------------- camera: slow orbit around the map
  const LOOK = V3(-0.9, 0.0, 0.55);
  const lk = V3(0, 0, 0), cEdge = V3(0, 0, 0);
  const ORBIT = 150; // seconds per orbit sweep (decoupled from the age loop, so the two never repeat in sync)
  wt.onTick((dt, t) => {
    const ph = (t % ORBIT) / ORBIT;
    const az = THREE.MathUtils.degToRad(-4 + 32 * (1 - Math.cos(ph * Math.PI * 2)) / 2 + 2.0 * Math.sin(t * 0.11));
    const R = 14.4 - 1.2 * Math.sin(ph * Math.PI * 2 + 0.4), h = 7.4 + 1.0 * Math.sin(ph * Math.PI * 4 + 0.6);
    camera.position.set(LOOK.x + Math.sin(az) * R, h, LOOK.z + Math.cos(az) * R);
    // keep the candle's holder >= ~150 px inside the frame: pan left as much as needed (softplus => smooth)
    const px = (b) => { lk.copy(LOOK); lk.x -= b; camera.lookAt(lk); camera.updateMatrixWorld();
      return (cEdge.set(CANDLE[0] - 0.62, 0.9, CANDLE[2]).project(camera).x * 0.5 + 0.5) * 1920; };
    const p0 = px(0), slope = (px(0.5) - p0) / 0.5;
    const shift = 20 * Math.log1p(Math.exp((150 - p0) / 20));
    px(slope > 1 ? shift / slope : 0);
  });

  // ---------------------------------------------------------------- countdown that burns like the candle
  let ended = false, lastTxt = null, lastH = -1, lastState = '';
  const candle = wt.candle.userData;
  const emberLight = new THREE.PointLight(0xff5a1e, 0, 3, 2); wt.candle.add(emberLight);
  function end() {
    ended = true; document.body.classList.add('ended'); candle.setLit(false);
    if (wt.dust) wt.dust.visible = false;
    wt.hemi.intensity = 0.12; emberLight.intensity = 0.12;
  }
  function unEnd() {
    ended = false; document.body.classList.remove('ended'); candle.setLit(true); if (wt.dust) wt.dust.visible = true;
    wt.hemi.intensity = wt.options.ambient; emberLight.intensity = 0;
  }
  wt.onTick(() => {
    const v = countdownView(C.end, nowMs(), total);
    if (v.state !== lastState) { lastState = v.state; document.body.classList.toggle('state-soon', v.state === 'soon'); }
    if (v.text !== lastTxt) { lastTxt = v.text; $('count').textContent = v.text; }
    $('wax').style.width = (v.frac * 100).toFixed(2) + '%';
    const h = 0.4 + 1.3 * v.frac; // the real candle burns down with the countdown
    // setHeight keeps the light at wax top + lightOffset (T2); only the ember glow is positioned here
    if (Math.abs(h - lastH) > 0.012) { lastH = h; candle.setHeight(h); emberLight.position.y = 0.12 + h + 0.25; }
    if (v.state === 'now' && !ended) end();
    else if (v.state !== 'now' && ended) unEnd();
  });

  faceStatic(); candle.aimDrips(V3(6.5, 7.5, 12.5));
  if (SHOT) {
    window.wt = wt; window.map = map; window.__bannerBlue = bB; // review/debug handles, capture mode only
    const T = q.has('t') ? +q.get('t') : 40;
    await FONT_READY;
    wt.advance(T);
    const gl = wt.renderer.getContext(); gl.readPixels(0, 0, 1, 1, gl.RGBA, gl.UNSIGNED_BYTE, new Uint8Array(4));
    console.log('shot t=' + wt.time.toFixed(2));
  }
}
