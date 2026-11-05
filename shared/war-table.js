// PDBull overlay — shared 3D base ("Masa de razboi").
// Plain ES module; requires the importmap for "three" and "three/addons/" (three@0.170.0).
import * as THREE from 'three';
import { EffectComposer } from 'three/addons/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/addons/postprocessing/RenderPass.js';
import { UnrealBloomPass } from 'three/addons/postprocessing/UnrealBloomPass.js';
import { ShaderPass } from 'three/addons/postprocessing/ShaderPass.js';
import { OutputPass } from 'three/addons/postprocessing/OutputPass.js';
import { BokehPass } from 'three/addons/postprocessing/BokehPass.js';
import { RoomEnvironment } from 'three/addons/environments/RoomEnvironment.js';
import { RoundedBoxGeometry } from 'three/addons/geometries/RoundedBoxGeometry.js';
import { MeshSurfaceSampler } from 'three/addons/math/MeshSurfaceSampler.js';
import * as BGU from 'three/addons/utils/BufferGeometryUtils.js';

export { THREE };

// World units: 1 unit = one board square (~5.5 cm). Table top at y = 0.
export const SQUARE = 1;
export const BOARD_TOP = 0.22;

/* ======================================================================
   Small utilities
   ====================================================================== */
function mulberry32(a) {
  return function () {
    a |= 0; a = (a + 0x6D2B79F5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
function makeNoise2D(seed = 1) {
  const rnd = mulberry32(seed);
  const p = new Uint8Array(512);
  const perm = [...Array(256).keys()];
  for (let i = 255; i > 0; i--) { const j = Math.floor(rnd() * (i + 1)); [perm[i], perm[j]] = [perm[j], perm[i]]; }
  for (let i = 0; i < 512; i++) p[i] = perm[i & 255];
  const g = new Float32Array(256);
  for (let i = 0; i < 256; i++) g[i] = rnd() * 2 - 1;
  const fade = (t) => t * t * (3 - 2 * t);
  function n(x, y) {
    const xi = Math.floor(x), yi = Math.floor(y);
    const xf = x - xi, yf = y - yi;
    const X = xi & 255, Y = yi & 255;
    const a = g[p[p[X] + Y]], b = g[p[p[X + 1] + Y]], c = g[p[p[X] + Y + 1]], d = g[p[p[X + 1] + Y + 1]];
    const u = fade(xf), v = fade(yf);
    return (a + (b - a) * u) + ((c + (d - c) * u) - (a + (b - a) * u)) * v;
  }
  n.fbm = (x, y, oct = 4) => {
    let s = 0, amp = 0.5, f = 1;
    for (let i = 0; i < oct; i++) { s += amp * n(x * f, y * f); f *= 2.03; amp *= 0.5; }
    return s;
  };
  return n;
}
const lerp = (a, b, t) => a + (b - a) * t;
const clamp01 = (v) => Math.min(1, Math.max(0, v));
const smooth = (e0, e1, x) => { const t = clamp01((x - e0) / (e1 - e0)); return t * t * (3 - 2 * t); };
const hex = (c) => [(c >> 16) & 255, (c >> 8) & 255, c & 255];

function canvasTex(canvas, srgb, repeat = [1, 1]) {
  const t = new THREE.CanvasTexture(canvas);
  t.colorSpace = srgb ? THREE.SRGBColorSpace : THREE.NoColorSpace;
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  t.repeat.set(repeat[0], repeat[1]);
  t.anisotropy = 8;
  t.needsUpdate = true;
  return t;
}
/** Internal helpers shared with campaign.js (not a stable page API). */
export const _util = { mulberry32, makeNoise2D, canvasTex, lerp, clamp01, smooth, hex };

/* ======================================================================
   Procedural wood: colour, roughness and bump fields on canvases
   ====================================================================== */
/**
 * makeWoodCanvases({width,height,dark,light,rings,warp,seed,pores,planks})
 * Grain runs along x. Returns {color, rough, bump} canvases.
 */
export function makeWoodCanvases(o = {}) {
  const W = o.width ?? 1024, H = o.height ?? 1024;
  const dark = hex(o.dark ?? 0x24150c), light = hex(o.light ?? 0x5a3820);
  const rings = o.rings ?? 9, warp = o.warp ?? 1.6, seed = o.seed ?? 7;
  const planks = o.planks ?? 1;
  const N = makeNoise2D(seed), N2 = makeNoise2D(seed + 101);
  const mk = () => { const c = document.createElement('canvas'); c.width = W; c.height = H; return c; };
  const cC = mk(), cR = mk(), cB = mk();
  const dC = cC.getContext('2d').createImageData(W, H);
  const dR = cR.getContext('2d').createImageData(W, H);
  const dB = cB.getContext('2d').createImageData(W, H);
  const plankH = H / planks;
  for (let y = 0; y < H; y++) {
    const pk = Math.floor(y / plankH);
    const py = (y - pk * plankH) / plankH; // 0..1 within plank
    const pOff = pk * 37.13;
    const tint = 0.9 + 0.2 * ((pk * 0.618) % 1);
    for (let x = 0; x < W; x++) {
      const u = x / W, v = y / H;
      // warped ring coordinate (cathedral / straight grain mix)
      const w = N.fbm(u * 2.2 + pOff, v * 6.0 * planks, 4) * warp;
      const r = (py * rings * (0.9 + 0.3 * N(u * 1.5 + pOff, 3.1))) + w + 0.4 * Math.sin(u * 3.0 + pOff + py * 2);
      const ring = r - Math.floor(r);
      // late-wood band: sharp dark line, soft early wood
      const band = Math.pow(smooth(0.0, 0.85, ring), 2.2) * (1 - smooth(0.85, 1.0, ring));
      // long pores / streaks along grain
      const streak = N(u * 3 + pOff, v * 420 * (o.poreScale ?? 1));
      const fine = N2(u * 40 + pOff, v * 900);
      const fig = N2.fbm(u * 5 + pOff, v * 9, 3);
      let t = 0.35 + 0.45 * band + 0.12 * streak + 0.18 * fig;
      t = clamp01(t * tint);
      const pore = (o.pores ?? 1) * smooth(0.25, 0.6, fine) * 0.35;
      const i = (y * W + x) * 4;
      for (let k = 0; k < 3; k++) {
        const c = lerp(dark[k], light[k], t) * (1 - pore * 0.6);
        dC.data[i + k] = c;
      }
      dC.data[i + 3] = 255;
      const rough = clamp01(0.42 + 0.25 * (1 - t) + pore * 0.5);
      dR.data[i] = dR.data[i + 1] = dR.data[i + 2] = rough * 255; dR.data[i + 3] = 255;
      // plank seam
      const seam = planks > 1 ? smooth(0.0, 0.004, py) * smooth(0.0, 0.004, 1 - py) : 1;
      const b = clamp01((0.55 + 0.25 * t - pore) * seam);
      dB.data[i] = dB.data[i + 1] = dB.data[i + 2] = b * 255; dB.data[i + 3] = 255;
      if (seam < 1) { for (let k = 0; k < 3; k++) dC.data[i + k] *= 0.35 + 0.65 * seam; }
    }
  }
  cC.getContext('2d').putImageData(dC, 0, 0);
  cR.getContext('2d').putImageData(dR, 0, 0);
  cB.getContext('2d').putImageData(dB, 0, 0);
  return { color: cC, rough: cR, bump: cB };
}

/** Clear-coat roughness map with fine wear scratches (light lines = rougher). */
function makeScratchCanvas(W = 1024, H = 1024, seed = 3, count = 900) {
  const c = document.createElement('canvas'); c.width = W; c.height = H;
  const g = c.getContext('2d');
  const rnd = mulberry32(seed);
  g.fillStyle = 'rgb(28,28,28)'; g.fillRect(0, 0, W, H);
  // soft smudges
  for (let i = 0; i < 60; i++) {
    const x = rnd() * W, y = rnd() * H, r = 40 + rnd() * 160;
    const gr = g.createRadialGradient(x, y, 0, x, y, r);
    gr.addColorStop(0, `rgba(80,80,80,${0.12 + rnd() * 0.12})`); gr.addColorStop(1, 'rgba(80,80,80,0)');
    g.fillStyle = gr; g.fillRect(x - r, y - r, r * 2, r * 2);
  }
  g.lineCap = 'round';
  for (let i = 0; i < count; i++) {
    const x = rnd() * W, y = rnd() * H;
    const a = (rnd() < 0.6 ? (rnd() - 0.5) * 0.5 : rnd() * Math.PI);
    const len = 10 + Math.pow(rnd(), 2.5) * 220;
    const curve = (rnd() - 0.5) * 0.4;
    g.strokeStyle = `rgba(${150 + rnd() * 100},${150 + rnd() * 100},${150 + rnd() * 100},${0.15 + rnd() * 0.45})`;
    g.lineWidth = 0.4 + rnd() * 0.9;
    g.beginPath(); g.moveTo(x, y);
    g.quadraticCurveTo(x + Math.cos(a + curve) * len * 0.5, y + Math.sin(a + curve) * len * 0.5, x + Math.cos(a) * len, y + Math.sin(a) * len);
    g.stroke();
  }
  return c;
}

/* ======================================================================
   Materials (shared, cached)
   ====================================================================== */
let _mats = null;
export function getMaterials() {
  if (_mats) return _mats;
  // micro-surface for carved pieces
  const pc = document.createElement('canvas'); pc.width = pc.height = 256;
  const pg = pc.getContext('2d'); const pd = pg.createImageData(256, 256); const pn = makeNoise2D(17);
  for (let y = 0; y < 256; y++) for (let x = 0; x < 256; x++) {
    const v = 0.5 + 0.35 * pn.fbm(x / 22, y / 90, 4) + 0.1 * pn(x / 2.5, y / 9);
    const i = (y * 256 + x) * 4; pd.data[i] = pd.data[i + 1] = pd.data[i + 2] = clamp01(v) * 255; pd.data[i + 3] = 255;
  }
  pg.putImageData(pd, 0, 0);
  const micro = canvasTex(pc, false, [3, 2]);

  // ivory colour: faint Schreger-like banding
  const ic = document.createElement('canvas'); ic.width = ic.height = 256;
  const ig = ic.getContext('2d'); const id = ig.createImageData(256, 256); const inz = makeNoise2D(29);
  const iv0 = hex(0xdcc39a), iv1 = hex(0xf3e4c4);
  for (let y = 0; y < 256; y++) for (let x = 0; x < 256; x++) {
    const t = clamp01(0.6 + 0.14 * inz.fbm(x / 60, y / 14, 3) + 0.025 * Math.sin(y / 3.2 + inz(x / 30, y / 30) * 4));
    const i = (y * 256 + x) * 4;
    for (let k = 0; k < 3; k++) id.data[i + k] = lerp(iv0[k], iv1[k], t);
    id.data[i + 3] = 255;
  }
  ig.putImageData(id, 0, 0);
  const ivoryMap = canvasTex(ic, true, [2, 1]);

  const ivory = new THREE.MeshPhysicalMaterial({
    color: 0xffffff, map: ivoryMap, roughness: 0.38, roughnessMap: micro,
    bumpMap: micro, bumpScale: 0.6,
    clearcoat: 0.55, clearcoatRoughness: 0.22,
    sheen: 0.6, sheenColor: new THREE.Color(0xffe2b8), sheenRoughness: 0.5,
    specularIntensity: 0.6, specularColor: new THREE.Color(0xfff2dc),
  });
  const ebony = new THREE.MeshPhysicalMaterial({
    color: 0x17100c, roughness: 0.32, roughnessMap: micro,
    bumpMap: micro, bumpScale: 0.4,
    clearcoat: 1.0, clearcoatRoughness: 0.08,
    sheen: 0.25, sheenColor: new THREE.Color(0x5a3a26), sheenRoughness: 0.6,
  });
  const brass = new THREE.MeshPhysicalMaterial({
    color: 0xb48a50, metalness: 1.0, roughness: 0.32, roughnessMap: micro,
    clearcoat: 0.3, clearcoatRoughness: 0.3,
  });
  const brassDark = new THREE.MeshStandardMaterial({ color: 0x6e5230, metalness: 1, roughness: 0.45 });
  const felt = new THREE.MeshStandardMaterial({ color: 0x1c2a1f, roughness: 1 });
  _mats = { ivory, ebony, brass, brassDark, felt, micro };
  return _mats;
}
export function sideMaterial(side) {
  const m = getMaterials();
  return side === 'black' || side === 'ebony' ? m.ebony : m.ivory;
}

/* ======================================================================
   Lathe profiles for chess pieces
   ====================================================================== */
// Profile DSL: list of [x(radius), y] points; helpers append arcs / curves.
class Prof {
  constructor() { this.pts = []; }
  p(x, y) { this.pts.push(new THREE.Vector2(Math.max(0, x), y)); return this; }
  arc(cx, cy, r, a0, a1, n = 10) { // degrees, counter-clockwise if a1>a0
    for (let i = 0; i <= n; i++) { const a = THREE.MathUtils.degToRad(lerp(a0, a1, i / n)); this.p(cx + r * Math.cos(a), cy + r * Math.sin(a)); }
    return this;
  }
  bez(c1x, c1y, c2x, c2y, x, y, n = 12) { // cubic from last point
    const s = this.pts[this.pts.length - 1];
    for (let i = 1; i <= n; i++) {
      const t = i / n, u = 1 - t;
      this.p(u * u * u * s.x + 3 * u * u * t * c1x + 3 * u * t * t * c2x + t * t * t * x,
        u * u * u * s.y + 3 * u * u * t * c1y + 3 * u * t * t * c2y + t * t * t * y);
    }
    return this;
  }
  // classic Staunton foot: chamfer, big bead, cove, small bead
  foot(R, s = 1) {
    this.p(0, 0).p(R * 0.97, 0).p(R, 0.012 * s).p(R, 0.04 * s);
    this.arc(R - 0.045 * s, 0.085 * s, 0.05 * s, -25, 95, 10);           // bead
    this.bez(R * 0.86, 0.15 * s, R * 0.72, 0.15 * s, R * 0.70, 0.19 * s, 8); // cove
    this.arc(R * 0.70 + 0.012, 0.215 * s, 0.026 * s, -70, 90, 8);          // small bead
    return this;
  }
  build(seg = 72) {
    const g = new THREE.LatheGeometry(this.pts, seg);
    return BGU.toCreasedNormals(g, THREE.MathUtils.degToRad(34));
  }
}
function collar(P, y, r, h = 0.05) { // a crisp disc collar
  P.p(r * 0.65, y).p(r, y + h * 0.15).arc(r - h * 0.35, y + h * 0.5, h * 0.4, -45, 60, 5).p(r * 0.92, y + h).p(r * 0.6, y + h * 1.05);
  return P;
}

function pawnGeo() {
  const P = new Prof().foot(0.32);
  P.bez(0.18, 0.30, 0.13, 0.42, 0.12, 0.50);
  P.p(0.17, 0.505).p(0.215, 0.52).arc(0.205, 0.545, 0.022, -40, 80, 5).p(0.16, 0.575).p(0.10, 0.585);
  P.p(0.085, 0.60);
  P.arc(0, 0.755, 0.165, -59, 90, 18);
  return P.build();
}
function rookGeo() {
  const P = new Prof().foot(0.36);
  P.bez(0.24, 0.32, 0.20, 0.50, 0.215, 0.70);
  P.p(0.27, 0.71).arc(0.265, 0.735, 0.026, -60, 80, 5).p(0.215, 0.765);
  P.p(0.235, 0.78).bez(0.245, 0.85, 0.25, 0.95, 0.265, 1.02);
  P.p(0.285, 1.025).p(0.29, 1.06).p(0.275, 1.07).p(0.20, 1.07).p(0.20, 1.03).p(0.0, 1.03);
  const g = P.build();
  // crenellations: bevelled annular sectors
  const parts = [g];
  const n = 6;
  for (let i = 0; i < n; i++) {
    const a0 = (i / n) * Math.PI * 2 + 0.16, a1 = ((i + 1) / n) * Math.PI * 2 - 0.16;
    const sh = new THREE.Shape();
    const ro = 0.272, ri = 0.205;
    sh.absarc(0, 0, ro, a0, a1, false);
    sh.absarc(0, 0, ri, a1, a0, true);
    const eg = new THREE.ExtrudeGeometry(sh, { depth: 0.09, bevelEnabled: true, bevelThickness: 0.012, bevelSize: 0.008, bevelSegments: 2, curveSegments: 10 });
    eg.rotateX(-Math.PI / 2); eg.translate(0, 1.07, 0);
    parts.push(BGU.toCreasedNormals(eg, 0.6));
  }
  return mergeSoup(parts);
}
function bishopGeo() {
  const P = new Prof().foot(0.35);
  P.bez(0.20, 0.34, 0.12, 0.52, 0.12, 0.70);
  collar(P, 0.70, 0.235, 0.05);
  P.p(0.17, 0.765).arc(0.165, 0.78, 0.016, -60, 70, 4).p(0.10, 0.80);
  P.p(0.095, 0.83);
  // mitre (egg)
  P.bez(0.17, 0.86, 0.205, 0.95, 0.19, 1.05, 44);
  P.bez(0.175, 1.14, 0.10, 1.21, 0.04, 1.25, 44);
  P.p(0.035, 1.255).arc(0, 1.30, 0.05, -50, 90, 10);
  const pts = P.pts;
  let g = new THREE.LatheGeometry(pts, 180);
  // the mitre cut: slanted V-groove on the front (+x)
  const pos = g.attributes.position;
  const n = new THREE.Vector3(Math.sin(0.62), Math.cos(0.62), 0).normalize(); // plane normal
  const p0 = new THREE.Vector3(0.0, 1.07, 0);
  const v = new THREE.Vector3();
  for (let i = 0; i < pos.count; i++) {
    v.fromBufferAttribute(pos, i);
    if (v.y < 0.88 || v.y > 1.24) continue;
    const d = v.clone().sub(p0).dot(n);
    const w = 0.04;
    const r = Math.hypot(v.x, v.z);
    if (r < 1e-4) continue;
    const front = smooth(-0.02, 0.12, v.x);
    if (Math.abs(d) < w && front > 0) {
      const depth = Math.pow(smooth(w, 0.0, Math.abs(d)), 1.4) * 0.065 * front;
      const nr = Math.max(0.02, r - depth);
      v.x *= nr / r; v.z *= nr / r;
      pos.setXYZ(i, v.x, v.y, v.z);
    }
  }
  return BGU.toCreasedNormals(g, THREE.MathUtils.degToRad(34));
}
function queenGeo() {
  const P = new Prof().foot(0.39);
  P.bez(0.22, 0.36, 0.13, 0.62, 0.13, 0.84);
  collar(P, 0.84, 0.265, 0.055);
  P.p(0.19, 0.91).arc(0.185, 0.925, 0.018, -60, 70, 4).p(0.11, 0.945);
  P.p(0.105, 0.97).bez(0.13, 1.10, 0.20, 1.22, 0.245, 1.30);
  P.p(0.26, 1.315).p(0.255, 1.335).p(0.22, 1.34);
  P.bez(0.20, 1.36, 0.16, 1.40, 0.12, 1.41);
  P.arc(0.0, 1.355, 0.13, 25, 75, 6);
  P.p(0.04, 1.49).arc(0, 1.53, 0.05, -55, 90, 10);
  const parts = [P.build(80)];
  // coronet balls
  const n = 10;
  for (let i = 0; i < n; i++) {
    const a = (i / n) * Math.PI * 2;
    const s = new THREE.SphereGeometry(0.034, 14, 10).toNonIndexed();
    s.translate(Math.cos(a) * 0.235, 1.355, Math.sin(a) * 0.235);
    parts.push(s);
  }
  return mergeSoup(parts);
}
function kingGeo() {
  const P = new Prof().foot(0.40);
  P.bez(0.23, 0.38, 0.14, 0.66, 0.14, 0.92);
  collar(P, 0.92, 0.275, 0.058);
  P.p(0.20, 0.99).arc(0.195, 1.005, 0.018, -60, 70, 4).p(0.115, 1.025);
  P.p(0.11, 1.05).bez(0.14, 1.18, 0.21, 1.30, 0.245, 1.38);
  P.p(0.255, 1.395).p(0.25, 1.415).p(0.215, 1.42);
  P.bez(0.19, 1.47, 0.13, 1.50, 0.07, 1.51).p(0.045, 1.53).p(0.05, 1.545).p(0.0, 1.55);
  const parts = [P.build(80)];
  const v = new RoundedBoxGeometry(0.075, 0.25, 0.075, 3, 0.018); v.translate(0, 1.66, 0);
  const h = new RoundedBoxGeometry(0.19, 0.07, 0.075, 3, 0.018); h.translate(0, 1.70, 0);
  parts.push(v, h); // RoundedBoxGeometry is already non-indexed; mergeSoup converts only indexed parts
  return mergeSoup(parts);
}

// horse-head silhouette (facing +x), height ~1, base at y=0
function horseHeadShape() {
  const s = new THREE.Shape();
  s.moveTo(-0.30, 0.0);
  s.lineTo(0.26, 0.0);
  s.bezierCurveTo(0.31, 0.12, 0.30, 0.26, 0.22, 0.38);       // chest
  s.bezierCurveTo(0.17, 0.45, 0.20, 0.52, 0.30, 0.55);       // throat to jaw
  s.bezierCurveTo(0.40, 0.57, 0.47, 0.57, 0.52, 0.60);       // lower jaw
  s.bezierCurveTo(0.56, 0.62, 0.57, 0.67, 0.55, 0.70);       // muzzle tip
  s.lineTo(0.50, 0.695);                                      // mouth notch
  s.lineTo(0.545, 0.715);
  s.bezierCurveTo(0.53, 0.76, 0.48, 0.79, 0.42, 0.82);       // nose bridge
  s.bezierCurveTo(0.33, 0.86, 0.24, 0.92, 0.17, 0.98);       // forehead
  s.bezierCurveTo(0.15, 1.04, 0.13, 1.10, 0.10, 1.14);       // front of ear
  s.bezierCurveTo(0.07, 1.10, 0.04, 1.05, 0.02, 1.02);       // back of ear
  s.bezierCurveTo(-0.06, 1.02, -0.14, 0.98, -0.20, 0.90);    // poll / crest
  s.bezierCurveTo(-0.30, 0.76, -0.34, 0.52, -0.35, 0.30);    // mane
  s.bezierCurveTo(-0.36, 0.18, -0.34, 0.08, -0.30, 0.0);
  return s;
}
function maneShape() {
  const s = new THREE.Shape();
  s.moveTo(-0.355, 0.12);
  s.bezierCurveTo(-0.345, 0.45, -0.31, 0.74, -0.18, 0.93);
  s.bezierCurveTo(-0.12, 1.0, -0.05, 1.03, 0.02, 1.03);
  s.bezierCurveTo(-0.06, 0.99, -0.13, 0.92, -0.19, 0.83);
  s.bezierCurveTo(-0.27, 0.66, -0.30, 0.42, -0.30, 0.12);
  s.lineTo(-0.355, 0.12);
  return s;
}
// Sculpted horse head: tapered extrusion + mane ridge + cheek, eye and nostril bosses.
function horseHead(s = 1, yOff = 0, xOff = 0, depthMul = 1) {
  const out = [];
  const head = new THREE.ExtrudeGeometry(horseHeadShape(), { depth: 0.16 * depthMul, bevelEnabled: true, bevelThickness: 0.06 * depthMul, bevelSize: 0.045, bevelSegments: 6, curveSegments: 36 });
  head.translate(0, 0, -0.08 * depthMul);
  const taper = (x, y) => {
    let t = 1.0;
    t *= lerp(1, 0.70, smooth(0.25, 0.55, x) * smooth(0.45, 0.62, y));   // narrow muzzle
    t *= lerp(1, 0.55, smooth(0.98, 1.12, y));                           // thin ears
    t *= lerp(1.08, 0.92, smooth(0.0, 0.6, y));                          // broad chest
    return t;
  };
  const pos = head.attributes.position;
  for (let i = 0; i < pos.count; i++) pos.setZ(i, pos.getZ(i) * taper(pos.getX(i), pos.getY(i)));
  head.computeVertexNormals();
  out.push(BGU.toCreasedNormals(head, 0.7));
  const mane = new THREE.ExtrudeGeometry(maneShape(), { depth: 0.07 * depthMul, bevelEnabled: true, bevelThickness: 0.035 * depthMul, bevelSize: 0.03, bevelSegments: 5, curveSegments: 30 });
  mane.translate(-0.02, 0.0, -0.035 * depthMul);
  out.push(BGU.toCreasedNormals(mane, 0.7));
  const zf = (0.08 + 0.06) * depthMul;
  for (const sg of [-1, 1]) {
    out.push(ell(0.032, 0.016, 0.008 * depthMul, 0.23, 0.87, sg * zf * 0.9, -0.35));    // eye (shallow almond)
  }
  for (const g of out) { g.scale(s, s * 1.03, 1); g.translate(xOff, yOff, 0); }
  return out;
}
function knightGeo() {
  const P = new Prof().foot(0.37);
  P.bez(0.30, 0.25, 0.30, 0.28, 0.31, 0.30).p(0.31, 0.33).p(0.0, 0.33);
  const parts = [P.build(80)];
  parts.push(...horseHead(0.95, 0.30, 0.02, 0.85));
  return mergeSoup(parts);
}

function mergeSoup(list) {
  const clean = list.map((g) => {
    let q = g.index ? g.toNonIndexed() : g;
    for (const k of Object.keys(q.attributes)) if (k !== 'position' && k !== 'normal' && k !== 'uv') q.deleteAttribute(k);
    if (!q.attributes.normal) q.computeVertexNormals();
    if (!q.attributes.uv) q.setAttribute('uv', new THREE.BufferAttribute(new Float32Array(q.attributes.position.count * 2), 2));
    return q;
  });
  return BGU.mergeGeometries(clean, false);
}

const _geoCache = {};
const PIECE_BUILDERS = { pawn: pawnGeo, rook: rookGeo, knight: knightGeo, bishop: bishopGeo, queen: queenGeo, king: kingGeo };

function accentRing(R, color) {
  const m = new THREE.MeshPhysicalMaterial({ color, metalness: 0.6, roughness: 0.35, clearcoat: 0.6 });
  const t = new THREE.Mesh(new THREE.TorusGeometry(R - 0.045, 0.012, 8, 64), m);
  t.rotation.x = Math.PI / 2; t.position.y = 0.088; t.scale.set(1.07, 1.07, 1);
  return t;
}

/**
 * makePiece(type, side, opts?) -> THREE.Group
 * type: 'pawn'|'rook'|'knight'|'bishop'|'queen'|'king'; side: 'white'|'black'
 * opts.accent: optional colour (number/string) -> thin inlay ring on the foot.
 * Origin at the centre of the foot, y up; knights face +x (white) / -x (black).
 */
export function makePiece(type, side = 'white', opts = {}) {
  if (!PIECE_BUILDERS[type]) throw new Error('makePiece: unknown type ' + type);
  _geoCache[type] ??= PIECE_BUILDERS[type]();
  const mesh = new THREE.Mesh(_geoCache[type], sideMaterial(side));
  mesh.castShadow = mesh.receiveShadow = true;
  const g = new THREE.Group();
  g.add(mesh);
  if (opts.accent != null) {
    const R = { pawn: 0.32, rook: 0.36, knight: 0.37, bishop: 0.35, queen: 0.39, king: 0.40 }[type];
    g.add(accentRing(R, opts.accent));
  }
  if (type === 'knight' && (side === 'black' || side === 'ebony')) g.rotation.y = Math.PI;
  g.userData = { kind: 'piece', type, side };
  return g;
}

/* ======================================================================
   Figurines (carved in the same style, on a round foot)
   ====================================================================== */
function figBase(R = 0.42) {
  const P = new Prof().foot(R, 0.85);
  P.p(R * 0.72, 0.22).p(R * 0.72, 0.235).p(0, 0.235);
  return P.build(80);
}
function tube(points, r0, r1 = r0, seg = 24) {
  const curve = new THREE.CatmullRomCurve3(points.map((p) => new THREE.Vector3(...p)));
  const g = new THREE.TubeGeometry(curve, seg, 1, 12, false);
  // taper radius along the tube
  const pos = g.attributes.position;
  const v = new THREE.Vector3(), c = new THREE.Vector3();
  for (let i = 0; i < pos.count; i++) {
    const ring = Math.floor(i / 13);
    const t = ring / seg;
    curve.getPointAt(Math.min(1, t), c);
    v.fromBufferAttribute(pos, i).sub(c).multiplyScalar(lerp(r0, r1, t)).add(c);
    pos.setXYZ(i, v.x, v.y, v.z);
  }
  g.computeVertexNormals();
  const parts = [g];
  const a = curve.getPointAt(0), b = curve.getPointAt(1);
  const sa = new THREE.SphereGeometry(r0, 12, 8); sa.translate(a.x, a.y, a.z);
  const sb = new THREE.SphereGeometry(r1, 12, 8); sb.translate(b.x, b.y, b.z);
  parts.push(sa, sb);
  return mergeSoup(parts);
}
function ell(rx, ry, rz, x, y, z, rotZ = 0, rotY = 0) {
  const g = new THREE.SphereGeometry(1, 32, 20); g.scale(rx, ry, rz);
  if (rotZ) g.rotateZ(rotZ); if (rotY) g.rotateY(rotY);
  g.translate(x, y, z); return g;
}
function cyl(rt, rb, h, x, y, z, rx = 0, rz = 0, seg = 20) {
  const g = new THREE.CylinderGeometry(rt, rb, h, seg); if (rx) g.rotateX(rx); if (rz) g.rotateZ(rz); g.translate(x, y, z); return g;
}
function rbox(w, h, d, r, x, y, z, rx = 0, ry = 0, rz = 0) {
  const g = new RoundedBoxGeometry(w, h, d, 3, r);
  g.rotateX(rx); g.rotateY(ry); g.rotateZ(rz); g.translate(x, y, z); return g;
}
function lathe(prof, x = 0, y = 0, z = 0, seg = 48) {
  const P = new Prof(); for (const [a, b] of prof) P.p(a, b);
  const g = P.build(seg); g.translate(x, y, z); return g;
}

// lathe robe with cloth folds (fold count k, strength a, folds fade above yFade)
function robe(pts, k = 9, a = 0.06, yFade = 0.6, seg = 112) {
  const P = new Prof(); for (const [x, y] of pts) P.p(x, y);
  let g = new THREE.LatheGeometry(P.pts, seg);
  const pos = g.attributes.position, v = new THREE.Vector3();
  for (let i = 0; i < pos.count; i++) {
    v.fromBufferAttribute(pos, i);
    const r = Math.hypot(v.x, v.z); if (r < 1e-4) continue;
    const ang = Math.atan2(v.z, v.x);
    const fade = yFade > 0 ? 1 - smooth(yFade * 0.4, yFade, v.y) : 1;
    const f = 1 + a * (Math.sin(ang * k) + 0.35 * Math.sin(ang * k * 2.3 + 1.1)) * fade;
    pos.setXYZ(i, v.x * f, v.y, v.z * f);
  }
  return BGU.toCreasedNormals(g, 0.6);
}

function cavalierGeo() {
  const parts = [figBase(0.44)];
  const y0 = 0.235;
  // horse body
  parts.push(ell(0.27, 0.135, 0.125, -0.03, y0 + 0.50, 0, 0.05));               // barrel
  parts.push(ell(0.13, 0.15, 0.125, 0.15, y0 + 0.52, 0));                         // chest
  parts.push(ell(0.13, 0.13, 0.13, -0.22, y0 + 0.51, 0));                         // haunch
  // neck + head: the knight's sculpted head, smaller and thinner
  parts.push(...horseHead(0.44, y0 + 0.40, 0.16, 0.62));
  // caparison: draped cloth down to the fetlocks (hides the legs like a carved figurine)
  const cap = robe([[0, 0], [0.165, 0], [0.18, -0.06], [0.20, -0.16], [0.215, -0.24], [0.205, -0.255], [0.0, -0.255]], 14, 0.05, 0.0, 96);
  cap.scale(1.72, 1, 0.82); cap.translate(-0.03, y0 + 0.50, 0);
  // folds should be strongest at the hem: re-run displacement handled by robe() with yFade 0 -> uniform
  parts.push(cap);
  // lower legs and hooves under the hem; near fore leg lifted in a prance
  const legs = [
    [[0.20, 0.30, 0.075], [0.29, 0.20, 0.08], [0.27, 0.11, 0.08]],
    [[0.17, 0.26, -0.075], [0.17, 0.12, -0.075], [0.18, 0.02, -0.075]],
    [[-0.24, 0.26, 0.075], [-0.25, 0.12, 0.075], [-0.23, 0.02, 0.075]],
    [[-0.26, 0.26, -0.075], [-0.28, 0.12, -0.075], [-0.31, 0.02, -0.075]],
  ];
  for (const L of legs) {
    parts.push(tube(L.map(([x, y, z]) => [x, y0 + y, z]), 0.042, 0.032, 12));
    const e = L[2]; parts.push(cyl(0.036, 0.044, 0.04, e[0], y0 + e[1] - 0.005, e[2], 0, 0, 14));
  }
  parts.push(tube([[-0.33, y0 + 0.56, 0], [-0.42, y0 + 0.47, 0], [-0.43, y0 + 0.30, 0]], 0.035, 0.055, 14)); // tail
  // rider: torso with surcoat, arms, great helm
  parts.push(robe([[0, 0], [0.13, 0], [0.12, 0.06], [0.10, 0.16], [0.115, 0.25], [0.12, 0.29], [0.07, 0.33], [0, 0.34]], 8, 0.04, 0.2, 48).translate(-0.04, y0 + 0.58, 0));
  parts.push(tube([[-0.04, y0 + 0.64, 0.12], [0.04, y0 + 0.52, 0.15], [0.03, y0 + 0.38, 0.15]], 0.04, 0.034, 10));  // leg L
  parts.push(tube([[-0.04, y0 + 0.64, -0.12], [0.04, y0 + 0.52, -0.15], [0.03, y0 + 0.38, -0.15]], 0.04, 0.034, 10));
  parts.push(lathe([[0, 0], [0.072, 0], [0.078, 0.02], [0.078, 0.12], [0.07, 0.14], [0.0, 0.145]], -0.04, y0 + 0.93, 0, 40)); // great helm
  parts.push(rbox(0.012, 0.012, 0.11, 0.004, 0.035, y0 + 1.02, 0, 0, 0, 0));    // eye slit bar
  parts.push(lathe([[0, 0], [0.03, 0], [0.0, 0.07]], -0.04, y0 + 1.07, 0, 16)); // helm crest point
  // kite shield on the left (+z)
  const sh = new THREE.Shape(); sh.moveTo(-0.075, 0.10); sh.lineTo(0.075, 0.10); sh.bezierCurveTo(0.075, -0.02, 0.045, -0.10, 0, -0.16); sh.bezierCurveTo(-0.045, -0.10, -0.075, -0.02, -0.075, 0.10);
  const sg = new THREE.ExtrudeGeometry(sh, { depth: 0.012, bevelEnabled: true, bevelThickness: 0.012, bevelSize: 0.01, bevelSegments: 3, curveSegments: 16 });
  sg.translate(-0.02, y0 + 0.76, 0.14); parts.push(sg);
  // lance held high, angled forward; arm on the right (-z)
  const la = 0.62;
  const lance = cyl(0.007, 0.024, 1.15, 0, 0, 0, 0, 0, 12); lance.rotateZ(-la);
  lance.translate(0.27 - 0.05, y0 + 0.92 + 0.08, -0.13); parts.push(lance);
  parts.push(tube([[-0.04, y0 + 0.86, -0.11], [0.02, y0 + 0.74, -0.15], [0.10, y0 + 0.84, -0.13]], 0.035, 0.03, 8));
  parts.push(cyl(0.045, 0.02, 0.07, 0, 0, 0, 0, 0, 14).rotateZ(-la).translate(0.12, y0 + 0.86, -0.13)); // vamplate
  const pen = new THREE.Shape(); pen.moveTo(0, 0); pen.lineTo(-0.15, 0.015); pen.lineTo(-0.11, -0.035); pen.lineTo(-0.15, -0.08); pen.lineTo(0, -0.065);
  const pg = new THREE.ExtrudeGeometry(pen, { depth: 0.006, bevelEnabled: true, bevelThickness: 0.004, bevelSize: 0.004, bevelSegments: 1 });
  pg.rotateZ(la); pg.translate(0.22 + Math.sin(la) * 0.5 - 0.05, y0 + 1.0 + Math.cos(la) * 0.5, -0.13); parts.push(pg);
  return mergeSoup(parts);
}

function archerGeo() {
  const parts = [figBase(0.40)];
  const y0 = 0.235;
  // long hooded cloak over a tunic, side-on stance (facing +x)
  parts.push(robe([[0, 0], [0.18, 0], [0.185, 0.02], [0.15, 0.25], [0.12, 0.45], [0.115, 0.58], [0.135, 0.66], [0.13, 0.72], [0.08, 0.78], [0, 0.79]], 11, 0.07, 0.55, 112).translate(-0.01, y0, 0));
  parts.push(cyl(0.118, 0.12, 0.03, -0.005, y0 + 0.50, 0, 0, 0, 32));            // belt
  parts.push(cyl(0.035, 0.03, 0.05, 0.03, y0 + 0.47, 0.11, 0, 0, 10));           // belt pouch
  // hood: rounded cowl, slightly forward, with a shadowed face opening
  const hood = lathe([[0, 0], [0.105, 0.0], [0.11, 0.06], [0.10, 0.12], [0.07, 0.17], [0.03, 0.20], [0.0, 0.205]], 0, 0, 0, 48);
  hood.rotateZ(-0.15); hood.translate(0.0, y0 + 0.77, 0); parts.push(hood);
  const rim = new THREE.TorusGeometry(0.066, 0.015, 10, 32); rim.rotateY(Math.PI / 2); rim.rotateZ(-0.2); rim.translate(0.085, y0 + 0.86, 0); parts.push(rim);
  parts.push(ell(0.03, 0.05, 0.05, 0.065, y0 + 0.855, 0));
  parts.push(tube([[-0.06, y0 + 0.82, 0], [-0.13, y0 + 0.74, 0], [-0.12, y0 + 0.66, 0]], 0.03, 0.012, 10)); // hood tail (liripipe)
  // bow arm forward, draw hand at the cheek
  const handY = y0 + 0.80;
  parts.push(tube([[0.0, y0 + 0.74, -0.10], [0.20, y0 + 0.78, -0.05], [0.40, handY, 0.0]], 0.048, 0.03, 12));
  parts.push(tube([[0.0, y0 + 0.74, 0.10], [-0.15, y0 + 0.80, 0.13], [0.0, y0 + 0.855, 0.075]], 0.048, 0.032, 12));
  parts.push(ell(0.03, 0.026, 0.026, 0.02, y0 + 0.86, 0.06));
  parts.push(ell(0.028, 0.028, 0.03, 0.41, handY, 0.0));
  // recurve bow, tall
  const bowPts = [];
  for (let i = 0; i <= 28; i++) {
    const t = i / 28, a = lerp(-1, 1, t);
    const y = a * 0.46;
    const x = 0.44 - 0.13 * (a * a) + 0.05 * Math.pow(Math.abs(a), 6);   // limbs bend back, tips recurve forward
    bowPts.push([x, handY + y, 0.0]);
  }
  parts.push(tube(bowPts, 0.014, 0.014, 56));
  parts.push(cyl(0.022, 0.022, 0.09, 0.44, handY, 0, 0, 0, 12));               // grip
  const top = bowPts[bowPts.length - 1], bot = bowPts[0];
  const nock = [0.02, y0 + 0.86, 0.0];
  parts.push(tube([top, nock], 0.004, 0.004, 2));
  parts.push(tube([bot, nock], 0.004, 0.004, 2));
  // arrow nocked and drawn
  parts.push(tube([[-0.02, y0 + 0.86, 0.0], [0.58, handY + 0.002, 0.0]], 0.006, 0.006, 2));
  parts.push(cyl(0.0, 0.018, 0.055, 0.605, handY + 0.002, 0, 0, -Math.PI / 2, 8));
  for (const s of [-1, 1]) parts.push(rbox(0.07, 0.026, 0.004, 0.0018, 0.03, y0 + 0.86 + s * 0.011, 0, 0, 0, 0));
  // quiver on the back with fletchings
  parts.push(cyl(0.042, 0.036, 0.30, -0.14, y0 + 0.62, 0.02, 0, 0.35, 16));
  for (let i = 0; i < 4; i++) parts.push(cyl(0.006, 0.006, 0.13, -0.20 - (i % 2) * 0.014, y0 + 0.81, (i - 1.5) * 0.016, 0, 0.35, 6));
  return mergeSoup(parts);
}

function monkGeo() {
  const parts = [figBase(0.40)];
  const y0 = 0.235;
  // habit: bell-shaped robe with folds (displaced lathe)
  const P = new Prof();
  P.p(0, 0).p(0.24, 0).p(0.245, 0.02).bez(0.20, 0.25, 0.14, 0.48, 0.13, 0.60).bez(0.15, 0.66, 0.18, 0.72, 0.17, 0.78).p(0.10, 0.84).p(0, 0.85);
  let robe = new THREE.LatheGeometry(P.pts, 96);
  const pos = robe.attributes.position, v = new THREE.Vector3();
  for (let i = 0; i < pos.count; i++) {
    v.fromBufferAttribute(pos, i);
    const r = Math.hypot(v.x, v.z); if (r < 1e-4) continue;
    const a = Math.atan2(v.z, v.x);
    const fold = 1 + 0.06 * Math.sin(a * 9) * (1 - smooth(0.2, 0.62, v.y));
    v.x *= fold; v.z *= fold; pos.setXYZ(i, v.x, v.y, v.z);
  }
  robe = BGU.toCreasedNormals(robe, 0.6); robe.translate(0, y0, 0);
  parts.push(robe);
  parts.push(cyl(0.135, 0.14, 0.03, 0, y0 + 0.44, 0));                             // rope belt
  parts.push(tube([[0.10, y0 + 0.44, 0.08], [0.13, y0 + 0.30, 0.10], [0.12, y0 + 0.20, 0.09]], 0.012, 0.012, 8)); // cord end
  // hood: pointed cowl tilted forward with an opening rim
  const hood = lathe([[0, 0], [0.13, 0.0], [0.135, 0.06], [0.12, 0.14], [0.08, 0.21], [0.035, 0.27], [0.0, 0.29]], 0, 0, 0, 48);
  hood.rotateZ(-0.22); hood.translate(0.0, y0 + 0.80, 0);
  parts.push(hood);
  const rim = new THREE.TorusGeometry(0.078, 0.018, 10, 32); rim.rotateY(Math.PI / 2); rim.rotateZ(-0.25); rim.translate(0.10, y0 + 0.91, 0);
  parts.push(rim);
  parts.push(ell(0.035, 0.06, 0.06, 0.075, y0 + 0.905, 0));                       // face in shadow (recessed)
  // sleeves meeting in front, one hand out to the staff
  parts.push(tube([[0.0, y0 + 0.76, -0.14], [0.10, y0 + 0.62, -0.10], [0.14, y0 + 0.62, 0.0]], 0.055, 0.06, 10));
  parts.push(tube([[0.0, y0 + 0.76, 0.14], [0.10, y0 + 0.66, 0.16], [0.16, y0 + 0.72, 0.22]], 0.055, 0.06, 10));
  parts.push(ell(0.03, 0.03, 0.035, 0.18, y0 + 0.73, 0.22));                      // hand
  // staff with a shepherd's crook
  parts.push(cyl(0.017, 0.02, 1.08, 0.19, y0 + 0.53, 0.24, 0, 0, 10));
  const crook = new THREE.TorusGeometry(0.06, 0.017, 8, 24, Math.PI * 1.25); crook.rotateZ(-0.1); crook.translate(0.13, y0 + 1.07, 0.24);
  parts.push(crook);
  return mergeSoup(parts);
}

function crenRing(r, w, h, n, y, x = 0, z = 0) {
  const out = [];
  for (let i = 0; i < n; i++) {
    const a0 = (i / n) * Math.PI * 2 + 0.25 / n * 2, a1 = ((i + 1) / n) * Math.PI * 2 - 0.25 / n * 4;
    const sh = new THREE.Shape(); sh.absarc(0, 0, r, a0, a1, false); sh.absarc(0, 0, r - w, a1, a0, true);
    const g = new THREE.ExtrudeGeometry(sh, { depth: h, bevelEnabled: true, bevelThickness: 0.006, bevelSize: 0.005, bevelSegments: 1, curveSegments: 6 });
    g.rotateX(-Math.PI / 2); g.translate(x, y, z); out.push(g);
  }
  return out;
}
function castleGeo() {
  const parts = [figBase(0.44)];
  const y0 = 0.235;
  // keep (back)
  parts.push(rbox(0.30, 0.66, 0.24, 0.015, -0.06, y0 + 0.33, 0));
  for (let i = 0; i < 4; i++) parts.push(rbox(0.055, 0.07, 0.055, 0.008, -0.18 + i * 0.08, y0 + 0.69, -0.095));
  for (let i = 0; i < 4; i++) parts.push(rbox(0.055, 0.07, 0.055, 0.008, -0.18 + i * 0.08, y0 + 0.69, 0.095));
  parts.push(rbox(0.055, 0.07, 0.055, 0.008, -0.18, y0 + 0.69, 0)); parts.push(rbox(0.055, 0.07, 0.055, 0.008, 0.06, y0 + 0.69, 0));
  // two round towers in front with conical roofs
  for (const z of [-0.21, 0.21]) {
    parts.push(lathe([[0, 0], [0.12, 0], [0.115, 0.05], [0.105, 0.52], [0.125, 0.56], [0.125, 0.60], [0, 0.60]], 0.14, y0, z, 40));
    parts.push(...crenRing(0.125, 0.03, 0.06, 6, y0 + 0.60, 0.14, z));
    parts.push(lathe([[0, 0], [0.10, 0], [0.0, 0.26]], 0.14, y0 + 0.62, z, 40));
    parts.push(cyl(0.006, 0.006, 0.08, 0.14, y0 + 0.92, z, 0, 0, 6));
  }
  // curtain wall with a gate arch (extruded shape with a hole)
  const w = new THREE.Shape(); w.moveTo(-0.17, 0); w.lineTo(0.17, 0); w.lineTo(0.17, 0.40); w.lineTo(-0.17, 0.40); w.lineTo(-0.17, 0);
  const hole = new THREE.Path(); hole.moveTo(-0.065, 0); hole.lineTo(0.065, 0); hole.lineTo(0.065, 0.17); hole.absarc(0, 0.17, 0.065, 0, Math.PI, false); hole.lineTo(-0.065, 0);
  w.holes.push(hole);
  const wall = new THREE.ExtrudeGeometry(w, { depth: 0.10, bevelEnabled: true, bevelThickness: 0.01, bevelSize: 0.008, bevelSegments: 2, curveSegments: 16 });
  wall.translate(0, 0, -0.05); wall.rotateY(Math.PI / 2); wall.translate(0.16, y0, 0);
  parts.push(wall);
  for (let i = 0; i < 4; i++) parts.push(rbox(0.11, 0.06, 0.05, 0.008, 0.16, y0 + 0.43, -0.12 + i * 0.08));
  // portcullis bars
  for (let i = -1; i <= 1; i++) parts.push(cyl(0.006, 0.006, 0.20, 0.17, y0 + 0.10, i * 0.035, 0, 0, 6));
  return mergeSoup(parts);
}

function trebuchetGeo() {
  const parts = [figBase(0.44)];
  const y0 = 0.235;
  const r = 0.012;
  // base frame
  for (const z of [-0.13, 0.13]) parts.push(rbox(0.62, 0.05, 0.05, r, 0, y0 + 0.03, z));
  for (const x of [-0.24, 0.24]) parts.push(rbox(0.05, 0.05, 0.31, r, x, y0 + 0.03, 0));
  // A-frames
  const top = y0 + 0.60;
  for (const z of [-0.13, 0.13]) {
    const len = Math.hypot(0.20, top - y0 - 0.05);
    const ang = Math.atan2(0.20, top - y0 - 0.05);
    parts.push(rbox(0.045, len, 0.045, r, -0.10, (top + y0 + 0.05) / 2, z, 0, 0, -ang));
    parts.push(rbox(0.045, len, 0.045, r, 0.10, (top + y0 + 0.05) / 2, z, 0, 0, ang));
    parts.push(rbox(0.26, 0.035, 0.04, r, 0, y0 + 0.30, z));
  }
  parts.push(cyl(0.022, 0.022, 0.34, 0, top, 0, Math.PI / 2, 0, 12));            // axle
  // throwing arm: long end up-back (-x), short end down-front (+x)
  const armAng = 0.62;
  const armLen = 1.0, pivotFrac = 0.28;
  const arm = rbox(armLen, 0.04, 0.04, 0.012, 0, 0, 0); arm.rotateZ(-armAng);
  const cx = (armLen * (0.5 - pivotFrac));
  arm.translate(-Math.cos(armAng) * cx, top + Math.sin(armAng) * cx, 0);
  parts.push(arm);
  const shortEnd = [Math.cos(armAng) * armLen * pivotFrac, top - Math.sin(armAng) * armLen * pivotFrac];
  const longEnd = [-Math.cos(armAng) * armLen * (1 - pivotFrac), top + Math.sin(armAng) * armLen * (1 - pivotFrac)];
  // counterweight box hanging from the short end
  parts.push(cyl(0.006, 0.006, 0.08, shortEnd[0], shortEnd[1] - 0.04, 0, 0, 0, 6));
  parts.push(rbox(0.14, 0.13, 0.15, 0.015, shortEnd[0], shortEnd[1] - 0.14, 0));
  // sling rope + pouch from the long end
  parts.push(tube([[longEnd[0], longEnd[1], 0], [longEnd[0] - 0.05, longEnd[1] - 0.18, 0], [longEnd[0] + 0.02, longEnd[1] - 0.32, 0]], 0.005, 0.005, 10));
  parts.push(ell(0.035, 0.03, 0.035, longEnd[0] + 0.02, longEnd[1] - 0.34, 0));
  // wheels
  for (const x of [-0.20, 0.20]) for (const z of [-0.17, 0.17]) {
    const wgeo = new THREE.TorusGeometry(0.05, 0.016, 8, 20); wgeo.translate(x, y0 + 0.05, z); parts.push(wgeo);
    parts.push(cyl(0.012, 0.012, 0.03, x, y0 + 0.05, z, Math.PI / 2, 0, 8));
  }
  return mergeSoup(parts);
}

const FIG_BUILDERS = { cavalier: cavalierGeo, archer: archerGeo, monk: monkGeo, castle: castleGeo, trebuchet: trebuchetGeo };
/** piece -> figurine mapping used by the transforms (design.md §2). */
export const PIECE_TO_FIGURINE = { knight: 'cavalier', rook: 'castle', bishop: 'monk', pawn: 'archer', queen: 'trebuchet' };

/**
 * makeFigurine(type, side, opts?) -> THREE.Group
 * type: 'cavalier'|'archer'|'monk'|'castle'|'trebuchet'; side: 'white'|'black'.
 * Same foot and materials as makePiece; faces +x (white) / -x (black). opts.accent as makePiece.
 */
export function makeFigurine(type, side = 'white', opts = {}) {
  if (!FIG_BUILDERS[type]) throw new Error('makeFigurine: unknown type ' + type);
  _geoCache['fig_' + type] ??= FIG_BUILDERS[type]();
  const mesh = new THREE.Mesh(_geoCache['fig_' + type], sideMaterial(side));
  mesh.castShadow = mesh.receiveShadow = true;
  const g = new THREE.Group(); g.add(mesh);
  if (opts.accent != null) g.add(accentRing(0.42, opts.accent));
  if (side === 'black' || side === 'ebony') g.rotation.y = Math.PI;
  g.userData = { kind: 'figurine', type, side };
  return g;
}

/* ======================================================================
   Table, board, candle, dust
   ====================================================================== */
/** makeTable({width=34, depth=22, seed}) -> Mesh (top surface at y=0). */
export function makeTable(o = {}) {
  const W = o.width ?? 34, D = o.depth ?? 22;
  const wood = makeWoodCanvases({ width: 2048, height: 1024, planks: 4, rings: 7, warp: 2.2, seed: o.seed ?? 11, dark: 0x1c0f08, light: 0x4e301b });
  const rep = [W / 17, D / 11];
  const mat = new THREE.MeshPhysicalMaterial({
    map: canvasTex(wood.color, true, rep), roughnessMap: canvasTex(wood.rough, false, rep), roughness: 1,
    bumpMap: canvasTex(wood.bump, false, rep), bumpScale: 1.2,
    clearcoat: 0.75, clearcoatRoughness: 1, clearcoatRoughnessMap: canvasTex(makeScratchCanvas(1024, 1024, 5, 1100), false, [W / 8, D / 8]),
    specularIntensity: 0.5,
  });
  const geo = new RoundedBoxGeometry(W, 1.2, D, 4, 0.08);
  const m = new THREE.Mesh(geo, mat);
  m.position.y = -0.6; m.receiveShadow = true;
  m.userData.kind = 'table';
  return m;
}

/**
 * makeBoard({squares=8, frame=0.55, brass=0.07}) -> Group. Board centred at origin, playing surface at y=BOARD_TOP.
 * group.userData.squareToWorld(file 0..7, rank 0..7) -> Vector3 on the surface (file a=0 is -x, rank 1=0 is +z).
 */
export function makeBoard(o = {}) {
  const N = o.squares ?? 8, frame = o.frame ?? 0.55, brassW = o.brass ?? 0.07;
  const T = BOARD_TOP;
  const g = new THREE.Group();
  // marquetry texture: maple + walnut squares with alternating grain
  const PX = 128, size = PX * N;
  const light = makeWoodCanvases({ width: 256, height: 256, rings: 5, warp: 1.0, seed: 41, dark: 0x9c7a50, light: 0xc9a77a, pores: 0.4, poreScale: 0.6 });
  const dark = makeWoodCanvases({ width: 256, height: 256, rings: 4, warp: 1.6, seed: 53, dark: 0x2a170c, light: 0x55341d, poreScale: 0.6 });
  const mk = () => { const c = document.createElement('canvas'); c.width = c.height = size; return c; };
  const cc = mk(), cr = mk(), cb = mk();
  const gc = cc.getContext('2d'), gr = cr.getContext('2d'), gb = cb.getContext('2d');
  const rnd = mulberry32(9);
  for (let f = 0; f < N; f++) for (let r = 0; r < N; r++) {
    const isDark = (f + r) % 2 === 0;
    const src = isDark ? dark : light;
    const ox = Math.floor(rnd() * 128), oy = Math.floor(rnd() * 128);
    const rot = (f + r) % 4 < 2;
    for (const [ctx, cv] of [[gc, src.color], [gr, src.rough], [gb, src.bump]]) {
      ctx.save(); ctx.translate(f * PX + PX / 2, r * PX + PX / 2);
      if (rot) ctx.rotate(Math.PI / 2);
      ctx.drawImage(cv, ox, oy, PX, PX, -PX / 2, -PX / 2, PX, PX);
      ctx.restore();
    }
  }
  // fine inlay lines between squares
  gc.strokeStyle = 'rgba(15,8,4,0.55)'; gc.lineWidth = 1.2; gb.strokeStyle = 'rgba(0,0,0,0.8)'; gb.lineWidth = 1.5;
  for (let i = 0; i <= N; i++) for (const ctx of [gc, gb]) { ctx.beginPath(); ctx.moveTo(i * PX, 0); ctx.lineTo(i * PX, size); ctx.moveTo(0, i * PX); ctx.lineTo(size, i * PX); ctx.stroke(); }
  const topMat = new THREE.MeshPhysicalMaterial({
    map: canvasTex(cc, true), roughnessMap: canvasTex(cr, false), roughness: 0.9,
    bumpMap: canvasTex(cb, false), bumpScale: 0.8,
    clearcoat: 0.9, clearcoatRoughness: 0.12,
  });
  for (const t of [topMat.map, topMat.roughnessMap, topMat.bumpMap]) t.wrapS = t.wrapT = THREE.ClampToEdgeWrapping;
  const top = new THREE.Mesh(new THREE.PlaneGeometry(N, N), topMat);
  top.rotation.x = -Math.PI / 2; top.position.y = T; top.receiveShadow = true;
  g.add(top);
  // brass inlay border
  const brass = getMaterials().brass;
  const half = N / 2;
  const bShape = new THREE.Shape(); const o1 = half + brassW;
  bShape.moveTo(-o1, -o1); bShape.lineTo(o1, -o1); bShape.lineTo(o1, o1); bShape.lineTo(-o1, o1); bShape.lineTo(-o1, -o1);
  const bh = new THREE.Path(); bh.moveTo(-half, -half); bh.lineTo(-half, half); bh.lineTo(half, half); bh.lineTo(half, -half); bh.lineTo(-half, -half);
  bShape.holes.push(bh);
  const bGeo = new THREE.ExtrudeGeometry(bShape, { depth: 0.012, bevelEnabled: true, bevelThickness: 0.004, bevelSize: 0.004, bevelSegments: 2 });
  bGeo.rotateX(-Math.PI / 2); bGeo.translate(0, T - 0.006, 0);
  const bm = new THREE.Mesh(bGeo, brass); bm.receiveShadow = true; g.add(bm);
  // walnut frame (bevelled), slightly lower than the brass
  const fw = makeWoodCanvases({ width: 1024, height: 256, rings: 6, warp: 1.8, seed: 77, dark: 0x170c06, light: 0x3f2615 });
  const frameMat = new THREE.MeshPhysicalMaterial({
    map: canvasTex(fw.color, true, [1, 1]), roughnessMap: canvasTex(fw.rough, false), roughness: 1,
    bumpMap: canvasTex(fw.bump, false), bumpScale: 0.8, clearcoat: 1, clearcoatRoughness: 0.1,
  });
  const o2 = half + brassW + frame;
  const fShape = new THREE.Shape(); fShape.moveTo(-o2, -o2); fShape.lineTo(o2, -o2); fShape.lineTo(o2, o2); fShape.lineTo(-o2, o2); fShape.lineTo(-o2, -o2);
  const fh = new THREE.Path(); fh.moveTo(-o1, -o1); fh.lineTo(-o1, o1); fh.lineTo(o1, o1); fh.lineTo(o1, -o1); fh.lineTo(-o1, -o1);
  fShape.holes.push(fh);
  const fGeo = new THREE.ExtrudeGeometry(fShape, { depth: T - 0.05, bevelEnabled: true, bevelThickness: 0.035, bevelSize: 0.035, bevelSegments: 4 });
  fGeo.rotateX(-Math.PI / 2); fGeo.translate(0, 0.012, 0);
  // planar UVs for the frame
  const p = fGeo.attributes.position, uv = fGeo.attributes.uv;
  for (let i = 0; i < p.count; i++) { const x = p.getX(i), z = p.getZ(i); uv.setXY(i, (x + z * 0.3) / (2 * o2) + 0.5, (z + x * 0.05) / (2 * o2) * 0.25 + 0.5); }
  const fm = new THREE.Mesh(fGeo, frameMat); fm.castShadow = true; fm.receiveShadow = true; g.add(fm);
  // under-body so the board has mass
  const body = new THREE.Mesh(new THREE.BoxGeometry(2 * o1, T - 0.02, 2 * o1), frameMat);
  body.position.y = (T - 0.02) / 2; g.add(body);
  g.userData.kind = 'board';
  g.userData.squareToWorld = (f, r) => new THREE.Vector3(f - half + 0.5, T, half - 0.5 - r);
  g.userData.surfaceY = T;
  return g;
}

const FLAME_VS = /* glsl */`
uniform float uTime; uniform float uSeed;
varying vec3 vN; varying vec3 vV; varying float vH;
void main(){
  vec3 p = position;            // unit sphere
  float h = p.y * 0.5 + 0.5;    // 0 bottom .. 1 top
  float taper = mix(1.0, 0.08, pow(h, 1.35));
  p.xz *= taper * (1.0 + 0.25 * (1.0 - h));
  p.y = (h * 2.6 - 0.6);
  float sway = sin(uTime * 3.1 + uSeed) * 0.5 + sin(uTime * 7.3 + uSeed * 2.0) * 0.25 + sin(uTime * 13.0) * 0.1;
  p.x += sway * 0.12 * h * h;
  p.z += cos(uTime * 4.7 + uSeed) * 0.06 * h * h;
  p.y *= 1.0 + 0.08 * sin(uTime * 11.0 + uSeed);
  vH = h;
  vec4 mv = modelViewMatrix * vec4(p, 1.0);
  vN = normalize(normalMatrix * normal); vV = normalize(-mv.xyz);
  gl_Position = projectionMatrix * mv;
}`;
const FLAME_FS = /* glsl */`
uniform float uIntensity;
varying vec3 vN; varying vec3 vV; varying float vH;
void main(){
  float f = clamp(dot(normalize(vN), normalize(vV)), 0.0, 1.0);
  float core = pow(f, 2.2);
  vec3 blue = vec3(0.25, 0.35, 1.0) * 0.6;
  vec3 orange = vec3(1.0, 0.45, 0.08);
  vec3 yellow = vec3(1.0, 0.82, 0.45);
  vec3 white = vec3(1.0, 0.97, 0.88);
  vec3 c = mix(orange, yellow, smoothstep(0.1, 0.6, core));
  c = mix(c, white, smoothstep(0.55, 0.95, core) * (1.0 - smoothstep(0.55, 0.95, vH)));
  c = mix(blue, c, smoothstep(0.02, 0.22, vH));
  float a = smoothstep(0.0, 0.5, f) * (1.0 - smoothstep(0.75, 1.0, vH)) ;
  gl_FragColor = vec4(c * a * uIntensity, a);
}`;

function glowTexture() {
  const c = document.createElement('canvas'); c.width = c.height = 128;
  const g = c.getContext('2d'); const gr = g.createRadialGradient(64, 64, 0, 64, 64, 64);
  gr.addColorStop(0, 'rgba(255,200,120,1)'); gr.addColorStop(0.25, 'rgba(255,160,70,0.35)'); gr.addColorStop(1, 'rgba(255,120,40,0)');
  g.fillStyle = gr; g.fillRect(0, 0, 128, 128);
  const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; return t;
}

/**
 * makeCandle({height=1.6, radius=0.2, lightIntensity=22, shadowMapSize=1024, shadowRadius=6, castShadow=true, drips=0,
 *             lightOffset=0.34})
 *   (round 2: drips=true by default, dripAngle=PI/2 (+z), lightIntensity default is 42)
 * -> Group with userData {light, flame, flameWorldPos(), update(t), setLit(bool), setHeight(h), aimDrips(worldVec3),
 *    waxGlow:{value}, waxMaterial, lightOffset}. setHeight keeps the translucent top glow at the new top and the
 *    point light at wax top + lightOffset (wax top = 0.12 + height in the candle's frame).
 * Brass holder + wax body + wick + shader flame + warm PointLight (castShadow, soft PCF).
 */
export function makeCandle(o = {}) {
  const H = o.height ?? 1.6, R = o.radius ?? 0.2;
  // the point light sits lightOffset above the wax top (round 2: 0.12 blew the lip under it out into a bright slab
  // from high cameras; pages lifted it by hand). Kept at the same offset by setHeight/aimDrips.
  const lightOffset = o.lightOffset ?? 0.34;
  const g = new THREE.Group();
  const m = getMaterials();
  // brass holder: dish + finger ring
  const holder = new Prof();
  holder.p(0, 0).p(0.55, 0).p(0.58, 0.02).arc(0.55, 0.05, 0.035, -30, 120, 6).p(0.48, 0.07).p(0.30, 0.055).p(0.26, 0.08).p(0.26, 0.20).p(0.24, 0.21).p(0.24, 0.12).p(0, 0.12);
  const hm = new THREE.Mesh(holder.build(64), m.brass); hm.castShadow = hm.receiveShadow = true; g.add(hm);
  const ring = new THREE.Mesh(new THREE.TorusGeometry(0.12, 0.025, 10, 32), m.brass); ring.position.set(0.66, 0.05, 0); ring.rotation.y = 0; ring.rotation.x = Math.PI / 2 * 0.0; g.add(ring);
  // wax
  // Wax: warm ivory that reads translucent: light scattered inside falls off downward from the flame
  // (fake subsurface in the emissive), a hot fresnel rim near the top, a glossy molten pool and drips.
  // The shader hooks keep the round-1 names (vWaxY, uWaxTop, uWaxGlow) so page-side shader wraps still compile.
  const waxMat = new THREE.MeshPhysicalMaterial({
    color: 0xd6bf98, roughness: 0.52, sheen: 0.35, sheenColor: new THREE.Color(0xffcf96), sheenRoughness: 0.6,
    clearcoat: 0.1, clearcoatRoughness: 0.5, specularIntensity: 0.35,
    emissive: new THREE.Color(0x000000), emissiveIntensity: 1.0, // all glow comes from the shader terms below
  });
  const waxTop = { value: H };                    // shared, updated by setHeight (round-1 bug: stayed at H)
  const waxGlowU = g.userData.waxGlow = { value: 1.0 };
  waxMat.onBeforeCompile = (sh) => {
    sh.uniforms.uWaxTop = waxTop;
    sh.uniforms.uWaxGlow = waxGlowU;
    sh.vertexShader = sh.vertexShader.replace('#include <common>', '#include <common>\nvarying float vWaxY;').replace('#include <begin_vertex>', '#include <begin_vertex>\nvWaxY = position.y;');
    sh.fragmentShader = sh.fragmentShader.replace('#include <common>', '#include <common>\nvarying float vWaxY; uniform float uWaxTop; uniform float uWaxGlow;')
      .replace('#include <color_fragment>', `#include <color_fragment>
        diffuseColor.rgb *= mix(0.78, 1.0, smoothstep(0.0, 0.8, vWaxY / max(uWaxTop, 0.2)));`)
      .replace('#include <emissivemap_fragment>', `#include <emissivemap_fragment>
        float wD = max(0.0, uWaxTop - vWaxY);
        float wK = exp(-wD * 14.0);
        vec3 wCol = vec3(0.95 + 0.05 * wK, 0.38 + 0.24 * wK, 0.10 + 0.20 * wK);
        float wFr = pow(1.0 - abs(dot(normalize(normal), normalize(vViewPosition))), 2.0);
        totalEmissiveRadiance += wCol * (0.008 + 0.30 * exp(-wD * 13.0) + 0.06 * exp(-wD * 3.5) + 0.12 * wFr * exp(-wD * 6.0)) * uWaxGlow;`);
  };
  waxMat.customProgramCacheKey = () => 'wax-r2';
  const poolMat = new THREE.MeshPhysicalMaterial({ color: 0x2a190b, roughness: 0.06, clearcoat: 1, clearcoatRoughness: 0.03, emissive: 0xff7a26, emissiveIntensity: 0.45 });
  const drips = o.drips ?? true;
  let dripAngle = o.dripAngle ?? Math.PI / 2;     // drips face +z (the default camera side); see aimDrips()
  // uv-less, welded lathe so normals are smooth across the seam
  const welded = (geo) => { geo.deleteAttribute('uv'); geo.deleteAttribute('normal'); const m2 = BGU.mergeVertices(geo, 1e-5); m2.computeVertexNormals(); return m2; };
  const waxGroup = new THREE.Group(); g.add(waxGroup);
  function buildWax(h) {
    waxGroup.traverse((c) => { if (c.isMesh && c.geometry && c !== flame) c.geometry.dispose(); });
    waxGroup.clear();
    waxTop.value = h;
    // wax meshes live in an inner group: all share one local frame (y = 0 at the wax foot), so vWaxY is
    // comparable between pillar and drips.
    const inner = new THREE.Group(); inner.position.y = 0.12; waxGroup.add(inner);
    const prof = [new THREE.Vector2(0, 0)];
    const NP = 22;
    for (let i = 0; i <= NP; i++) prof.push(new THREE.Vector2(R * (1 - 0.012 * (i / NP)), (i / NP) * (h - 0.05)));
    prof.push(new THREE.Vector2(R * 0.985, h - 0.02), new THREE.Vector2(R * 0.95, h), new THREE.Vector2(R * 0.88, h + 0.004),
      new THREE.Vector2(R * 0.8, h - 0.02), new THREE.Vector2(R * 0.6, h - 0.045), new THREE.Vector2(R * 0.3, h - 0.055), new THREE.Vector2(0, h - 0.058));
    let wg = new THREE.LatheGeometry(prof, 96);
    const pos = wg.attributes.position, v = new THREE.Vector3();
    for (let i = 0; i < pos.count; i++) {
      v.fromBufferAttribute(pos, i); const r = Math.hypot(v.x, v.z); if (r < 1e-4) continue;
      const a = Math.atan2(v.z, v.x);
      const k = 1 + 0.010 * Math.sin(3 * a + v.y * 4.0) + 0.006 * Math.sin(7 * a + 1.1 - v.y * 9.0); // hand-poured wobble
      v.x *= k; v.z *= k;
      if (v.y > h - 0.03 && r > R * 0.75) v.y += 0.022 * (0.5 + 0.5 * Math.sin(2 * a + 0.7)) + 0.01 * Math.sin(5 * a); // uneven lip
      pos.setXYZ(i, v.x, v.y, v.z);
    }
    const wax = new THREE.Mesh(welded(wg), waxMat); wax.castShadow = false; wax.receiveShadow = true; inner.add(wax);
    const pool = new THREE.Mesh(new THREE.CircleGeometry(R * 0.82, 48), poolMat);
    pool.rotation.x = -Math.PI / 2; pool.position.y = h - 0.04; inner.add(pool);
    if (drips) {
      const dripGeo = (L, w) => {
        const pts = [[0.002, 0.012], [0.42, 0], [0.5, -0.25], [0.56, -0.55], [0.72, -0.8], [0.98, -0.9], [0.92, -0.955], [0.55, -0.99], [0.002, -1.0]]
          .reverse().map(([x, y]) => new THREE.Vector2(x * w, y * L));
        return welded(new THREE.LatheGeometry(pts, 20));
      };
      const runs = [[-0.42, 0.62, 0.034], [0.12, 0.3, 0.028], [0.55, 0.82, 0.04], [2.5, 0.45, 0.032], [3.7, 0.22, 0.026]];
      for (const [da, Lk, w] of runs) {
        const a = dripAngle + da, L = Math.min(Lk * h, h - 0.02);
        const dg = dripGeo(L, w);
        dg.scale(1, 1, 0.55); dg.rotateY(Math.atan2(Math.cos(a), Math.sin(a)));
        dg.translate(Math.cos(a) * R * 0.985, h + 0.008, Math.sin(a) * R * 0.985);
        const d = new THREE.Mesh(dg, waxMat); d.receiveShadow = true; inner.add(d);
        if (Lk > 0.7) { // a little puddle where the long run met the dish
          const pg = new THREE.SphereGeometry(1, 24, 12, 0, Math.PI * 2, 0, Math.PI / 2);
          pg.scale(0.075, 0.018, 0.055); pg.rotateY(-a); pg.translate(Math.cos(a) * (R + 0.03), -0.004, Math.sin(a) * (R + 0.03));
          inner.add(new THREE.Mesh(pg, waxMat));
        }
      }
    }
    const wick = new THREE.Mesh(new THREE.CylinderGeometry(0.008, 0.01, 0.09, 6), new THREE.MeshStandardMaterial({ color: 0x120a06, roughness: 0.9, emissive: 0x401000, emissiveIntensity: 0.5 }));
    wick.position.y = 0.12 + h - 0.02; wick.rotation.z = 0.12; waxGroup.add(wick);
    flame.position.y = 0.12 + h + 0.03;
    glow.position.y = flame.position.y + 0.09;
    light.position.set(0, 0.12 + h + lightOffset, 0);
    waxGroup.userData.h = h;
  }
  // flame
  const flameMat = new THREE.ShaderMaterial({
    uniforms: { uTime: { value: 0 }, uSeed: { value: Math.random() * 10 }, uIntensity: { value: 3.0 } },
    vertexShader: FLAME_VS, fragmentShader: FLAME_FS, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending,
  });
  const flame = new THREE.Mesh(new THREE.SphereGeometry(1, 24, 18), flameMat);
  flame.scale.set(0.035, 0.065, 0.035);
  flame.renderOrder = 10; g.add(flame);
  const glow = new THREE.Sprite(new THREE.SpriteMaterial({ map: glowTexture(), blending: THREE.AdditiveBlending, depthWrite: false, transparent: true, opacity: 0.55, color: 0xffd0a0 }));
  glow.scale.set(1.1, 1.1, 1); glow.visible = o.glow ?? true; g.add(glow);
  // light
  const light = new THREE.PointLight(0xffa04a, o.lightIntensity ?? 42, 0, 2);
  light.castShadow = o.castShadow ?? true;
  light.shadow.mapSize.set(o.shadowMapSize ?? 1024, o.shadowMapSize ?? 1024);
  light.shadow.radius = o.shadowRadius ?? 6;
  light.shadow.bias = -0.0015; light.shadow.normalBias = 0.02;
  light.shadow.camera.near = 0.1; light.shadow.camera.far = 60;
  g.add(light);
  buildWax(H);
  const nz = makeNoise2D(77);
  const base = light.intensity;
  let lit = true;
  g.userData = {
    kind: 'candle', light, flame, glow, waxGlow: waxGlowU, waxMaterial: waxMat,
    baseIntensity: base, lightOffset,
    /** aimDrips(worldPoint): turn the drip side of the wax towards a point (usually the camera position). */
    aimDrips(p) { const l = g.worldToLocal(p.clone()); dripAngle = Math.atan2(l.z, l.x); buildWax(waxGroup.userData.h); },
    flameWorldPos: () => flame.getWorldPosition(new THREE.Vector3()),
    update(t) {
      flameMat.uniforms.uTime.value = t;
      if (!lit) return;
      const f = 1 + 0.10 * nz(t * 6.0, 0.3) + 0.05 * nz(t * 17.0, 4.1) + 0.03 * Math.sin(t * 31.0);
      light.intensity = this.baseIntensity * f;
      light.position.x = 0.012 * nz(t * 3.0, 9.0); light.position.z = 0.012 * nz(t * 3.3, 2.0);
      glow.material.opacity = 0.5 * f;
      flameMat.uniforms.uIntensity.value = 3.0 * (0.92 + 0.08 * f);
    },
    setLit(on) { lit = on; flame.visible = glow.visible = on; light.intensity = on ? base : 0; waxGlowU.value = on ? 1 : 0; poolMat.emissiveIntensity = on ? 0.45 : 0.02; },
    setHeight(h) { buildWax(Math.max(0.15, h)); },
    get height() { return waxGroup.userData.h; },
  };
  return g;
}

const DUST_VS = /* glsl */`
uniform float uTime; uniform vec3 uLight; uniform float uSize; uniform float uPix;
attribute float aPhase; attribute float aSize;
varying float vB;
void main(){
  vec3 p = position;
  p.x += sin(uTime * 0.11 + aPhase * 6.0) * 0.35 + uTime * 0.02;
  p.y += sin(uTime * 0.07 + aPhase * 9.0) * 0.25 + mod(uTime * 0.015 + aPhase, 1.0) * 0.4;
  p.z += cos(uTime * 0.09 + aPhase * 4.0) * 0.35;
  vec4 mv = modelViewMatrix * vec4(p, 1.0);
  float d = distance(p, uLight);
  vB = 1.0 / (1.0 + d * d * 0.35);
  vB *= 0.6 + 0.4 * sin(uTime * 1.3 + aPhase * 20.0);
  gl_PointSize = uSize * aSize * uPix / -mv.z;
  gl_Position = projectionMatrix * mv;
}`;
const DUST_FS = /* glsl */`
uniform vec3 uColor; varying float vB;
void main(){
  vec2 c = gl_PointCoord - 0.5; float r = length(c);
  float a = smoothstep(0.5, 0.0, r);
  gl_FragColor = vec4(uColor * a * vB, a * vB);
}`;
/**
 * makeDust({count=500, box:[minX,minY,minZ,maxX,maxY,maxZ], light: Vector3, size=0.035, color})
 * -> Points; userData.update(t), userData.setLight(Vector3). Brightness falls off with distance to the light.
 */
export function makeDust(o = {}) {
  const n = o.count ?? 500;
  const b = o.box ?? [-9, 0.3, -4, 2, 4.5, 5];
  const pos = new Float32Array(n * 3), ph = new Float32Array(n), sz = new Float32Array(n);
  const rnd = mulberry32(o.seed ?? 4);
  for (let i = 0; i < n; i++) {
    pos[i * 3] = lerp(b[0], b[3], rnd()); pos[i * 3 + 1] = lerp(b[1], b[4], rnd()); pos[i * 3 + 2] = lerp(b[2], b[5], rnd());
    ph[i] = rnd(); sz[i] = 0.4 + Math.pow(rnd(), 3) * 1.6;
  }
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  geo.setAttribute('aPhase', new THREE.BufferAttribute(ph, 1));
  geo.setAttribute('aSize', new THREE.BufferAttribute(sz, 1));
  const mat = new THREE.ShaderMaterial({
    uniforms: { uTime: { value: 0 }, uLight: { value: (o.light ?? new THREE.Vector3(-6, 2, 1)).clone() }, uSize: { value: o.size ?? 0.035 }, uPix: { value: 1080 }, uColor: { value: new THREE.Color(o.color ?? 0xffc98a).multiplyScalar(1.6) } },
    vertexShader: DUST_VS, fragmentShader: DUST_FS, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending,
  });
  const pts = new THREE.Points(geo, mat);
  pts.frustumCulled = false;
  pts.userData = { kind: 'dust', update(t) { mat.uniforms.uTime.value = t; }, setLight(v) { mat.uniforms.uLight.value.copy(v); }, material: mat };
  return pts;
}

/* ======================================================================
   Post-processing: vignette + grain shader
   ====================================================================== */
const VignetteShader = {
  uniforms: { tDiffuse: { value: null }, uStrength: { value: 0.55 }, uSoft: { value: 0.75 }, uGrain: { value: 0.035 }, uTime: { value: 0 } },
  vertexShader: `varying vec2 vUv; void main(){ vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position,1.0); }`,
  fragmentShader: `uniform sampler2D tDiffuse; uniform float uStrength; uniform float uSoft; uniform float uGrain; uniform float uTime; varying vec2 vUv;
  float h(vec2 p){ return fract(sin(dot(p, vec2(12.9898,78.233))) * 43758.5453); }
  void main(){ vec4 c = texture2D(tDiffuse, vUv);
    vec2 d = (vUv - 0.5) * vec2(1.0, 0.82);
    float v = smoothstep(0.85, 0.85 - uSoft, length(d) * 1.35);
    c.rgb *= mix(1.0 - uStrength, 1.0, v);
    float n = h(vUv * 1024.0 + fract(uTime) * 91.0) - 0.5;
    c.rgb *= 1.0 + n * uGrain;
    gl_FragColor = c; }`,
};

/* ======================================================================
   The factory
   ====================================================================== */
/**
 * createWarTable(container, opts) -> WarTable
 * opts: transparent=false, shadows=true, bloom=true (true | {strength,radius,threshold}), vignette=true,
 *       pixelRatio=1, exposure=1.0, fov=30, env=0.12 (environment reflection strength), fog=true,
 *       background=0x060403, table=true, board=true, candle=true|{...makeCandle opts}, dust=true|{...makeDust opts},
 *       candlePos=[-6.4,0,1.6], rim=0.22 (cool moon rim light intensity, 0 = off), autoStart=true
 */
export function createWarTable(container, opts = {}) {
  const o = {
    transparent: false, shadows: true, bloom: true, vignette: true, pixelRatio: 1, exposure: 1.0,
    fov: 30, env: 0.045, fog: true, background: 0x060403, table: true, board: true, candle: true, dust: true,
    candlePos: [-5.6, 0, 4.2], rim: 0.35, ambient: 0.04, autoStart: true, ...opts,
  };
  const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: o.transparent, premultipliedAlpha: false, powerPreference: 'high-performance', preserveDrawingBuffer: false });
  renderer.setPixelRatio(o.pixelRatio);
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = o.exposure;
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  renderer.shadowMap.enabled = !!o.shadows;
  renderer.shadowMap.type = THREE.PCFSoftShadowMap;
  if (o.transparent) renderer.setClearColor(0x000000, 0);
  container.appendChild(renderer.domElement);
  renderer.domElement.style.display = 'block';

  const scene = new THREE.Scene();
  if (!o.transparent) scene.background = new THREE.Color(o.background);
  if (o.fog && !o.transparent) scene.fog = new THREE.FogExp2(o.background, 0.022);
  const pmrem = new THREE.PMREMGenerator(renderer);
  scene.environment = pmrem.fromScene(new RoomEnvironment(), 0.04).texture;
  scene.environmentIntensity = o.env;

  const w0 = container.clientWidth || 1920, h0 = container.clientHeight || 1080;
  const camera = new THREE.PerspectiveCamera(o.fov, w0 / h0, 0.1, 200);
  camera.position.set(6.5, 6.0, 12.5); camera.lookAt(0, 0.4, 0);

  // very low warm ambient so blacks keep a hint of form
  const hemi = new THREE.HemisphereLight(0x5a3a22, 0x0a0604, o.ambient); scene.add(hemi);
  let rim = null;
  if (o.rim > 0) { rim = new THREE.DirectionalLight(0x9db4d6, o.rim); rim.position.set(6, 9, -10); scene.add(rim); }

  const wt = { THREE, scene, camera, renderer, composer: null, options: o, hemi, rim };
  if (o.table && !o.transparent) { wt.table = makeTable(); scene.add(wt.table); }
  if (o.board) { wt.board = makeBoard(); scene.add(wt.board); }
  if (o.candle) {
    wt.candle = makeCandle(typeof o.candle === 'object' ? o.candle : {});
    wt.candle.position.set(...o.candlePos);
    if (!o.shadows) wt.candle.userData.light.castShadow = false;
    scene.add(wt.candle);
  }
  if (o.dust) {
    const lp = wt.candle ? wt.candle.userData.flameWorldPos() : new THREE.Vector3(-6, 2, 1);
    wt.dust = makeDust({ light: lp, box: [lp.x - 3, 0.3, lp.z - 4, lp.x + 7.5, lp.y + 3, lp.z + 3.5], ...(typeof o.dust === 'object' ? o.dust : {}) });
    scene.add(wt.dust);
  }

  // post-processing
  const rtType = THREE.HalfFloatType;
  const target = new THREE.WebGLRenderTarget(w0, h0, { type: rtType, samples: 4 });
  const composer = new EffectComposer(renderer, target);
  composer.setPixelRatio(o.pixelRatio);
  const renderPass = new RenderPass(scene, camera);
  if (o.transparent) { renderPass.clearColor = new THREE.Color(0, 0, 0); renderPass.clearAlpha = 0; }
  composer.addPass(renderPass);
  let bloomPass = null, bokehPass = null, vignettePass = null;
  if (o.bloom) {
    const b = typeof o.bloom === 'object' ? o.bloom : {};
    bloomPass = new UnrealBloomPass(new THREE.Vector2(w0, h0), b.strength ?? 0.28, b.radius ?? 0.3, b.threshold ?? 2.0);
    // drop the two widest mips: their truncated kernels draw a square halo around tiny bright sources
    // round 2: mip 2 too — at a candle flame it still drew a square halo (the sprite glow gives the wide halo)
    for (const i of [2, 3, 4]) bloomPass.compositeMaterial.uniforms.bloomTintColors.value[i].set(0, 0, 0);
    if (o.transparent) {
      // Round-1 bug: the composite writes alpha = strength * sum(mip weights) (~0.36) on EVERY pixel and the
      // additive blend put that into the canvas alpha, dimming the game behind the whole overlay.
      // Fix: fold that factor into the rgb (colour identical to the opaque path) and let the alpha be the
      // bloom's own brightness, then add rgb and alpha 1:1. Empty pixels stay alpha 0.
      const cm = bloomPass.compositeMaterial;
      cm.fragmentShader = cm.fragmentShader.replace(/\}\s*$/, '\tgl_FragColor.rgb *= gl_FragColor.a;\n\tgl_FragColor.a = clamp(max(gl_FragColor.r, max(gl_FragColor.g, gl_FragColor.b)), 0.0, 1.0);\n}\n');
      cm.needsUpdate = true;
      const bm = bloomPass.blendMaterial;
      Object.assign(bm, { blending: THREE.CustomBlending, blendEquation: THREE.AddEquation, blendSrc: THREE.OneFactor, blendDst: THREE.OneFactor,
        blendEquationAlpha: THREE.AddEquation, blendSrcAlpha: THREE.OneFactor, blendDstAlpha: THREE.OneFactor });
      bm.needsUpdate = true;
    }
    composer.addPass(bloomPass);
  }
  if (o.vignette) { vignettePass = new ShaderPass(VignetteShader); if (o.transparent) vignettePass.uniforms.uStrength.value = 0; composer.addPass(vignettePass); }
  const outputPass = new OutputPass();
  composer.addPass(outputPass);
  wt.composer = composer; wt.bloomPass = bloomPass; wt.vignettePass = vignettePass;

  /**
   * wt.enableDOF({focus=12, aperture=0.0006, maxblur=0.008, afterBloom=false}) -> {pass, setFocus(distOrVector3), set(params), disable(), enable()}
   * Inserts a BokehPass (depth of field) BEFORE the bloom (round 2): blurring the bloomed frame smeared the flame
   * halo into a box over the background depth; this way the halo is added after the blur and stays round.
   * afterBloom=true restores the round-1 order (bloom, then DOF). setFocus(Vector3) focuses on a world point.
   * The pass is also wt.bokehPass.
   */
  wt.enableDOF = (p = {}) => {
    if (!bokehPass) {
      bokehPass = new BokehPass(scene, camera, { focus: p.focus ?? 12, aperture: p.aperture ?? 0.0006, maxblur: p.maxblur ?? 0.008 });
      const anchor = bloomPass ? (p.afterBloom ? composer.passes[composer.passes.indexOf(bloomPass) + 1] : bloomPass) : (vignettePass ?? outputPass);
      composer.insertPass(bokehPass, composer.passes.indexOf(anchor));
      wt.bokehPass = bokehPass;
    }
    const u = bokehPass.uniforms;
    const api = {
      pass: bokehPass,
      setFocus(x) { u.focus.value = x.isVector3 ? x.distanceTo(camera.position) : x; },
      set(q) { if (q.focus != null) api.setFocus(q.focus); if (q.aperture != null) u.aperture.value = q.aperture; if (q.maxblur != null) u.maxblur.value = q.maxblur; },
      disable() { bokehPass.enabled = false; }, enable() { bokehPass.enabled = true; },
    };
    bokehPass.enabled = true;
    return api;
  };

  function resize() {
    const w = container.clientWidth || 1920, h = container.clientHeight || 1080;
    renderer.setSize(w, h, false);
    renderer.domElement.style.width = '100%'; renderer.domElement.style.height = '100%';
    composer.setSize(w, h);
    camera.aspect = w / h; camera.updateProjectionMatrix();
    if (wt.dust) wt.dust.material.uniforms.uPix.value = h * o.pixelRatio;
  }
  resize();
  wt.resize = resize;

  const ticks = [];
  wt.onTick = (fn) => { ticks.push(fn); return () => { const i = ticks.indexOf(fn); if (i >= 0) ticks.splice(i, 1); }; };
  const clock = new THREE.Clock(false);
  let elapsed = 0, running = false, raf = 0, wanted = false;
  function frame() {
    if (!running) return;
    raf = requestAnimationFrame(frame);
    step(Math.min(clock.getDelta(), 0.1));
    composer.render();
  }
  function step(dt) {
    elapsed += dt;
    wt.time = elapsed;
    if (wt.candle) { wt.candle.userData.update(elapsed); if (wt.dust) wt.dust.userData.setLight(wt.candle.userData.flameWorldPos()); }
    if (wt.dust) wt.dust.userData.update(elapsed);
    if (vignettePass) vignettePass.uniforms.uTime.value = elapsed;
    for (const fn of ticks.slice()) fn(dt, elapsed);
  }
  wt.renderOnce = () => { composer.render(0); };
  /** wt.advance(seconds): run the tick handlers forward in 0.1 s steps (deterministic screenshots), then render once. */
  wt.advance = (sec) => { while (sec > 1e-6) { const d = Math.min(0.1, sec); step(d); sec -= d; } composer.render(0); };
  wt.start = () => { wanted = true; if (running || document.hidden) return; running = true; clock.start(); raf = requestAnimationFrame(frame); };
  wt.stop = () => { wanted = false; running = false; clock.stop(); cancelAnimationFrame(raf); };
  const onVis = () => {
    if (document.hidden) { running = false; clock.stop(); cancelAnimationFrame(raf); }
    else if (wanted) { wt.start(); }
  };
  document.addEventListener('visibilitychange', onVis);
  const resizeObs = new ResizeObserver(resize); resizeObs.observe(container);
  // T3 hooks (core/scene.js): wt.step(dt) advances state without rendering; wt.dispose() detaches loop, listener, observer.
  wt.step = step;
  wt.dispose = () => { wt.stop(); document.removeEventListener('visibilitychange', onVis); resizeObs.disconnect(); ticks.length = 0; };
  wt.time = 0;
  wt.transform = (from, to, topts) => transformObjects(wt, from, to, topts);
  if (o.autoStart) wt.start();
  return wt;
}

/* ======================================================================
   Dissolve-to-gold-dust transform
   ====================================================================== */
const DISSOLVE_GLSL = /* glsl */`
uniform float uDissolve; uniform vec3 uEdgeColor; uniform vec2 uYRange;
varying vec3 vDWorld;
float dh(vec3 p){ return fract(sin(dot(p, vec3(127.1, 311.7, 74.7))) * 43758.5453); }
float dn(vec3 p){ vec3 i = floor(p), f = fract(p); f = f*f*(3.0-2.0*f);
  return mix(mix(mix(dh(i),dh(i+vec3(1,0,0)),f.x), mix(dh(i+vec3(0,1,0)),dh(i+vec3(1,1,0)),f.x), f.y),
             mix(mix(dh(i+vec3(0,0,1)),dh(i+vec3(1,0,1)),f.x), mix(dh(i+vec3(0,1,1)),dh(i+vec3(1,1,1)),f.x), f.y), f.z); }
`;
function patchDissolve(mat, uniforms) {
  const m = mat.clone();
  m.onBeforeCompile = (sh) => {
    Object.assign(sh.uniforms, uniforms);
    sh.vertexShader = sh.vertexShader.replace('#include <common>', '#include <common>\nvarying vec3 vDWorld;')
      .replace('#include <project_vertex>', '#include <project_vertex>\nvDWorld = (modelMatrix * vec4(transformed, 1.0)).xyz;');
    sh.fragmentShader = sh.fragmentShader.replace('#include <common>', '#include <common>\n' + DISSOLVE_GLSL)
      .replace('#include <clipping_planes_fragment>', `#include <clipping_planes_fragment>
        float dK = 0.55 * (0.65 * dn(vDWorld * 9.0) + 0.35 * dn(vDWorld * 23.0)) + 0.45 * clamp((vDWorld.y - uYRange.x) / max(0.001, uYRange.y - uYRange.x), 0.0, 1.0);
        if (uDissolve > 0.0 && dK < uDissolve) discard;
        float dEdge = (uDissolve > 0.0) ? (1.0 - smoothstep(0.0, 0.05, dK - uDissolve)) : 0.0;`)
      .replace('#include <emissivemap_fragment>', '#include <emissivemap_fragment>\n totalEmissiveRadiance += uEdgeColor * dEdge * 7.0;');
  };
  m.customProgramCacheKey = () => 'dissolve';
  return m;
}
function prepareDissolvable(obj) {
  if (obj.userData._dissolve) return obj.userData._dissolve;
  const box = new THREE.Box3().setFromObject(obj);
  const u = { uDissolve: { value: 0 }, uEdgeColor: { value: new THREE.Color(0xffb347) }, uYRange: { value: new THREE.Vector2(box.min.y, box.max.y) } };
  obj.traverse((c) => { if (c.isMesh && c.material && !c.material.isShaderMaterial) c.material = patchDissolve(c.material, u); });
  obj.userData._dissolve = u;
  return u;
}
function sampleSurface(obj, count) {
  obj.updateWorldMatrix(true, true);
  const geos = [];
  obj.traverse((c) => {
    if (!c.isMesh || !c.geometry?.attributes?.position) return;
    let g = c.geometry.index ? c.geometry.toNonIndexed() : c.geometry.clone();
    const q = new THREE.BufferGeometry(); q.setAttribute('position', g.attributes.position.clone());
    q.applyMatrix4(c.matrixWorld); geos.push(q);
  });
  const merged = BGU.mergeGeometries(geos, false);
  const sampler = new MeshSurfaceSampler(new THREE.Mesh(merged)).build();
  const out = new Float32Array(count * 3), v = new THREE.Vector3();
  for (let i = 0; i < count; i++) { sampler.sample(v); out[i * 3] = v.x; out[i * 3 + 1] = v.y; out[i * 3 + 2] = v.z; }
  return out;
}
const SWARM_VS = /* glsl */`
uniform float uT; uniform float uSize; uniform float uPix;
attribute vec3 aEnd; attribute vec3 aCtrl; attribute float aDelay; attribute float aSz;
varying float vA;
void main(){
  float s = clamp((uT - aDelay) / 0.55, 0.0, 1.0);
  float e = s * s * (3.0 - 2.0 * s);
  vec3 p = mix(mix(position, aCtrl, e), mix(aCtrl, aEnd, e), e);
  vA = sin(3.14159 * s);
  vec4 mv = modelViewMatrix * vec4(p, 1.0);
  gl_PointSize = uSize * aSz * uPix / -mv.z * (0.6 + 0.8 * vA);
  gl_Position = projectionMatrix * mv;
}`;
const SWARM_FS = /* glsl */`
uniform vec3 uColor; varying float vA;
void main(){ vec2 c = gl_PointCoord - 0.5; float a = smoothstep(0.5, 0.0, length(c)) * vA;
  gl_FragColor = vec4(uColor * a, a); }`;

/**
 * transformObjects(wt, from, to, {duration=1.5, count=1400, color=0xffc66b, swirl=0.6, rise=0.9}) -> Promise
 * `from` dissolves (gold edge, bottom-up noise) into gold dust that flies to `to`, which assembles in its place.
 * Both must already be in the scene with final transforms; `to` is shown by the helper, `from` is hidden at the end.
 * Also available as wt.transform(from, to, opts).
 */
export function transformObjects(wt, from, to, o = {}) {
  const D = o.duration ?? 1.5, N = o.count ?? 1400;
  const uf = prepareDissolvable(from), ut = prepareDissolvable(to);
  from.visible = true; to.visible = true;
  uf.uDissolve.value = 0; ut.uDissolve.value = 1.05;
  const p0 = sampleSurface(from, N), p1 = sampleSurface(to, N);
  // order: bottom-up for source, so delay follows height
  const ctrl = new Float32Array(N * 3), delay = new Float32Array(N), sz = new Float32Array(N);
  const box = new THREE.Box3().setFromObject(from);
  const rnd = mulberry32(o.seed ?? 12);
  for (let i = 0; i < N; i++) {
    const a = rnd() * Math.PI * 2, r = (o.swirl ?? 0.6) * (0.4 + rnd() * 0.6);
    ctrl[i * 3] = (p0[i * 3] + p1[i * 3]) / 2 + Math.cos(a) * r;
    ctrl[i * 3 + 1] = Math.max(p0[i * 3 + 1], p1[i * 3 + 1]) + (o.rise ?? 0.9) * (0.5 + rnd() * 0.5);
    ctrl[i * 3 + 2] = (p0[i * 3 + 2] + p1[i * 3 + 2]) / 2 + Math.sin(a) * r;
    const hn = (p0[i * 3 + 1] - box.min.y) / Math.max(0.01, box.max.y - box.min.y);
    delay[i] = 0.05 + 0.3 * hn + rnd() * 0.08;
    sz[i] = 0.5 + rnd() * 1.0;
  }
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.BufferAttribute(p0, 3));
  geo.setAttribute('aEnd', new THREE.BufferAttribute(p1, 3));
  geo.setAttribute('aCtrl', new THREE.BufferAttribute(ctrl, 3));
  geo.setAttribute('aDelay', new THREE.BufferAttribute(delay, 1));
  geo.setAttribute('aSz', new THREE.BufferAttribute(sz, 1));
  const mat = new THREE.ShaderMaterial({
    uniforms: { uT: { value: 0 }, uSize: { value: o.size ?? 0.03 }, uPix: { value: wt.renderer.domElement.height }, uColor: { value: new THREE.Color(o.color ?? 0xffc66b).multiplyScalar(3.0) } },
    vertexShader: SWARM_VS, fragmentShader: SWARM_FS, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending,
  });
  const pts = new THREE.Points(geo, mat); pts.frustumCulled = false;
  wt.scene.add(pts);
  const castF = [], castT = [];
  from.traverse((c) => { if (c.isMesh) castF.push([c, c.castShadow]); });
  to.traverse((c) => { if (c.isMesh) { castT.push([c, c.castShadow]); c.castShadow = false; } });
  return new Promise((resolve) => {
    let t = 0;
    const off = wt.onTick((dt) => {
      t += dt; const k = Math.min(1, t / D);
      mat.uniforms.uT.value = k;
      uf.uDissolve.value = smooth(0.0, 0.5, k) * 1.05;
      ut.uDissolve.value = (1 - smooth(0.42, 0.98, k)) * 1.05;
      if (k > 0.3) for (const [c] of castF) c.castShadow = false;
      if (k > 0.75) for (const [c, s] of castT) c.castShadow = s;
      if (k >= 1) {
        off(); wt.scene.remove(pts); geo.dispose(); mat.dispose();
        from.visible = false; uf.uDissolve.value = 0; for (const [c, s] of castF) c.castShadow = s;
        ut.uDissolve.value = 0;
        resolve();
      }
    });
  });
}

/* ======================================================================
   Stage fitting (1920x1080 .stage scaled to the window)
   ====================================================================== */
/** fitStage(el = document.querySelector('.stage')) — sets --stage-scale so a 1920x1080 stage fits the window. */
export function fitStage(el = document.querySelector('.stage')) {
  const f = () => { const s = Math.min(innerWidth / 1920, innerHeight / 1080); el.style.setProperty('--stage-scale', s); };
  f(); addEventListener('resize', f); return f;
}
