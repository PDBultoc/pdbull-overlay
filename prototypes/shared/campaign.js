// PDBull overlay — campaign table builders (round 2): parchment map + fog of war, village through the ages,
// carved & painted wooden tokens, banners, resource props. Original art, all procedural.
// Plain ES module; needs the same importmap as war-table.js (three@0.170.0).
import * as THREE from 'three';
import { RoundedBoxGeometry } from 'three/addons/geometries/RoundedBoxGeometry.js';
import * as BGU from 'three/addons/utils/BufferGeometryUtils.js';
import { makeWoodCanvases, getMaterials, _util } from './war-table.js';

const { mulberry32, makeNoise2D, canvasTex, lerp, clamp01, smooth } = _util;
export { THREE };

/* ======================================================================
   Colours & small helpers
   ====================================================================== */
/** Player colours: muted pigment tones (no neon). makeToken/makeBanner/makeVillage accept a name or any THREE colour. */
export const PLAYER_COLOURS = {
  red: 0x8c2c22, blue: 0x2d4b7a, green: 0x3e5f35, yellow: 0xb8892c,
  teal: 0x2d6a68, purple: 0x5b3b6f, grey: 0x6d6862, orange: 0xa65a24,
};
function pcol(c) {
  if (typeof c === 'string' && PLAYER_COLOURS[c] != null) return new THREE.Color(PLAYER_COLOURS[c]);
  return new THREE.Color(c ?? PLAYER_COLOURS.red);
}
const css = (col, k = 0) => { // k<0 darker, k>0 lighter
  const c = col.clone(); if (k < 0) c.lerp(new THREE.Color(0x120a05), -k); else if (k > 0) c.lerp(new THREE.Color(0xf4e6c8), k);
  return '#' + c.getHexString();
};
function makeCanvas(w, h = w) { const c = document.createElement('canvas'); c.width = w; c.height = h; return c; }
const easeOut = (t) => 1 - Math.pow(1 - t, 3);
const easeInOut = (t) => t * t * (3 - 2 * t);
const easeOutBack = (t) => { const c1 = 1.4, c3 = c1 + 1; return 1 + c3 * Math.pow(t - 1, 3) + c1 * Math.pow(t - 1, 2); };

/** smooth closed (or open) Catmull-Rom path through points; a third value of 1 marks a sharp corner */
function blobPath(g, pts, closed = true) {
  const n = pts.length;
  g.beginPath(); g.moveTo(pts[0][0], pts[0][1]);
  const last = closed ? n : n - 1;
  for (let i = 0; i < last; i++) {
    const p0 = pts[closed ? (i - 1 + n) % n : Math.max(0, i - 1)], p1 = pts[i], p2 = pts[(i + 1) % n], p3 = pts[closed ? (i + 2) % n : Math.min(n - 1, i + 2)];
    const c1 = p1[2] ? [p1[0], p1[1]] : [p1[0] + (p2[0] - p0[0]) / 6, p1[1] + (p2[1] - p0[1]) / 6];
    const c2 = p2[2] ? [p2[0], p2[1]] : [p2[0] - (p3[0] - p1[0]) / 6, p2[1] - (p3[1] - p1[1]) / 6];
    g.bezierCurveTo(c1[0], c1[1], c2[0], c2[1], p2[0], p2[1]);
  }
  if (closed) g.closePath();
}
/** resample an open polyline so no segment is longer than `step` */
function resample(pts, step) {
  const out = [pts[0]];
  for (let i = 1; i < pts.length; i++) {
    const a = pts[i - 1], b = pts[i], d = Math.hypot(b[0] - a[0], b[1] - a[1]), n = Math.max(1, Math.ceil(d / step));
    for (let j = 1; j <= n; j++) out.push([lerp(a[0], b[0], j / n), lerp(a[1], b[1], j / n)]);
  }
  return out;
}
/** tapered limb outline around a polyline (width w0 -> w1), rounded ends */
function limbPoly(pts, w0, w1 = w0) {
  const p = resample(pts, 5);
  const n = p.length, L = [], R = [];
  let tot = 0; const acc = [0];
  for (let i = 1; i < n; i++) { tot += Math.hypot(p[i][0] - p[i - 1][0], p[i][1] - p[i - 1][1]); acc.push(tot); }
  const tan = (i) => { const a = p[Math.max(0, i - 1)], b = p[Math.min(n - 1, i + 1)]; const l = Math.hypot(b[0] - a[0], b[1] - a[1]) || 1; return [(b[0] - a[0]) / l, (b[1] - a[1]) / l]; };
  for (let i = 0; i < n; i++) {
    const t = tan(i), w = lerp(w0, w1, acc[i] / (tot || 1)) / 2;
    L.push([p[i][0] - t[1] * w, p[i][1] + t[0] * w]); R.push([p[i][0] + t[1] * w, p[i][1] - t[0] * w]);
  }
  const t0 = tan(0), t1 = tan(n - 1);
  return [[p[0][0] - t0[0] * w0 * 0.45, p[0][1] - t0[1] * w0 * 0.45], ...L, [p[n - 1][0] + t1[0] * w1 * 0.45, p[n - 1][1] + t1[1] * w1 * 0.45], ...R.reverse()];
}

/* ======================================================================
   Shared materials: oiled woods, painted woods, stone, thatch, tile
   ====================================================================== */
let _m = null;
function linesCanvas(W, H, seed, { base = 128, n = 400, len = [8, 40], vertical = true, alpha = 0.35, width = [0.6, 1.6] } = {}) {
  const c = makeCanvas(W, H), g = c.getContext('2d'); const rnd = mulberry32(seed);
  g.fillStyle = `rgb(${base},${base},${base})`; g.fillRect(0, 0, W, H);
  for (let i = 0; i < n; i++) {
    const x = rnd() * W, y = rnd() * H, l = lerp(len[0], len[1], rnd()), v = rnd() < 0.5 ? 40 : 220;
    g.strokeStyle = `rgba(${v},${v},${v},${alpha * (0.4 + rnd() * 0.6)})`; g.lineWidth = lerp(width[0], width[1], rnd());
    g.beginPath(); g.moveTo(x, y); if (vertical) g.lineTo(x + (rnd() - 0.5) * 3, y + l); else g.lineTo(x + l, y + (rnd() - 0.5) * 3); g.stroke();
  }
  return c;
}
function noiseCanvas(W, H, seed, { sx = 8, sy = 8, oct = 4, lo = 90, hi = 170 } = {}) {
  const c = makeCanvas(W, H), g = c.getContext('2d'), d = g.createImageData(W, H), N = makeNoise2D(seed);
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
    const v = lerp(lo, hi, clamp01(0.5 + N.fbm(x / W * sx, y / H * sy, oct)));
    const i = (y * W + x) * 4; d.data[i] = d.data[i + 1] = d.data[i + 2] = v; d.data[i + 3] = 255;
  }
  g.putImageData(d, 0, 0); return c;
}
function mats() {
  if (_m) return _m;
  // light oiled beech for token bodies/bases, warm walnut for poles and timber
  const beech = makeWoodCanvases({ width: 512, height: 512, rings: 8, warp: 1.3, seed: 61, dark: 0x7d5532, light: 0xb98c5a, pores: 0.5, poreScale: 0.8 });
  const walnut = makeWoodCanvases({ width: 512, height: 512, rings: 6, warp: 1.8, seed: 67, dark: 0x2c190c, light: 0x5e3b20 });
  const oiled = (w, rep = [1, 1]) => new THREE.MeshPhysicalMaterial({
    map: canvasTex(w.color, true, rep), roughnessMap: canvasTex(w.rough, false, rep), roughness: 0.95,
    bumpMap: canvasTex(w.bump, false, rep), bumpScale: 0.6, clearcoat: 0.45, clearcoatRoughness: 0.45, sheen: 0.15, sheenColor: new THREE.Color(0xffd9a8),
  });
  const grainBump = canvasTex(beech.bump, false, [2, 2]);
  // painted wood: solid colour, the grain survives only as relief under the paint
  const painted = (color, rough = 0.8, extra = {}) => new THREE.MeshPhysicalMaterial({ color, roughness: rough, bumpMap: grainBump, bumpScale: 0.35, clearcoat: 0.08, clearcoatRoughness: 0.6, ...extra });
  const tiles = (() => { const c = makeCanvas(256), g = c.getContext('2d'); g.fillStyle = '#909090'; g.fillRect(0, 0, 256, 256);
    for (let r = 0; r < 16; r++) { g.fillStyle = '#3a3a3a'; g.fillRect(0, r * 16, 256, 2); for (let k = 0; k < 10; k++) g.fillRect(((k + (r % 2) * 0.5) * 25.6) | 0, r * 16, 2, 16); }
    return canvasTex(c, false, [3, 3]); })();
  // rubble-coursed stone: irregular course heights and block lengths, each block its own tint, dark mortar
  const stoneC = (() => {
    const S = 256, c = makeCanvas(S), g = c.getContext('2d'), rnd = mulberry32(19), N = makeNoise2D(23);
    g.fillStyle = '#4a443b'; g.fillRect(0, 0, S, S);
    let y = 0;
    while (y < S) {
      const h = 16 + Math.floor(rnd() * 14); let x = -Math.floor(rnd() * 30);
      while (x < S) {
        const w = 22 + Math.floor(rnd() * 34), v = 0.78 + rnd() * 0.3, warm = rnd() * 14;
        g.fillStyle = `rgb(${(150 + warm) * v | 0},${(142 + warm * 0.6) * v | 0},${126 * v | 0})`;
        g.beginPath(); g.moveTo(x + 2 + rnd() * 2, y + 2); g.lineTo(x + w - 2, y + 1.5 + rnd() * 2); g.lineTo(x + w - 1.5 - rnd() * 2, y + h - 2); g.lineTo(x + 1.5, y + h - 1.5 - rnd() * 2); g.closePath(); g.fill();
        x += w;
      }
      y += h;
    }
    const d = g.getImageData(0, 0, S, S);
    for (let i = 0; i < S * S; i++) { const k = 0.9 + 0.2 * N((i % S) / 9, Math.floor(i / S) / 9) + (rnd() - 0.5) * 0.08; d.data[i * 4] *= k; d.data[i * 4 + 1] *= k; d.data[i * 4 + 2] *= k; }
    g.putImageData(d, 0, 0); return c;
  })();
  const blocks = canvasTex(stoneC, false, [1.5, 1.5]);
  const stoneMap = canvasTex(stoneC, true, [1.5, 1.5]);
  // layered straw: lumpy bundles, darker in the gaps
  const thatchC = (() => { const c = linesCanvas(256, 256, 5, { base: 150, n: 1400, len: [10, 46], alpha: 0.55 }), g = c.getContext('2d');
    for (let r = 0; r < 6; r++) { const gr = g.createLinearGradient(0, r * 42.7, 0, (r + 1) * 42.7); gr.addColorStop(0, 'rgba(255,255,255,0.15)'); gr.addColorStop(0.85, 'rgba(0,0,0,0.0)'); gr.addColorStop(1, 'rgba(0,0,0,0.45)'); g.fillStyle = gr; g.fillRect(0, r * 42.7, 256, 42.7); }
    return c; })();
  _m = {
    beechC: beech, walnutC: walnut,
    beech: oiled(beech), walnut: oiled(walnut), walnutRep: oiled(walnut, [1, 4]),
    cutEdge: (() => { const e = oiled(beech, [3, 3]); e.color.set(0x9a7a5a); e.clearcoat = 0.1; return e; })(), // aged, darker saw-cut edge
    lime: painted(0xbfb193, 0.85), limeWarm: painted(0xb8a47f, 0.85),
    timber: painted(0x3b2717, 0.7),
    thatch: new THREE.MeshPhysicalMaterial({ color: 0x8c6a3c, map: canvasTex(thatchC, true, [4, 2]), roughness: 0.95, bumpMap: canvasTex(thatchC, false, [4, 2]), bumpScale: 2.2, sheen: 0.3, sheenColor: new THREE.Color(0xd8b06a) }),
    tile: new THREE.MeshPhysicalMaterial({ color: 0x6c3326, roughness: 0.82, bumpMap: tiles, bumpScale: 1.2, specularIntensity: 0.5 }),
    slate: new THREE.MeshPhysicalMaterial({ color: 0x45484c, roughness: 0.62, bumpMap: tiles, bumpScale: 1.0, specularIntensity: 0.6 }),
    stone: new THREE.MeshPhysicalMaterial({ color: 0xf0e8da, map: stoneMap, roughness: 0.9, bumpMap: blocks, bumpScale: 1.8 }),
    dark: new THREE.MeshStandardMaterial({ color: 0x1a110a, roughness: 0.9 }),
    brass: getMaterials().brass,
    painted,
  };
  return _m;
}
function shadowAll(o, cast = true, recv = true) { o.traverse((c) => { if (c.isMesh) { c.castShadow = cast; c.receiveShadow = recv; } }); return o; }

/* ======================================================================
   Parchment campaign map
   ====================================================================== */
const INK = 'rgba(48,31,18,';
/** hand-inked polyline: wobble + pressure variation, built from short round-capped segments */
function inkLine(g, pts, rnd, N, { w = 2, a = 0.85, wob = 1.2, step = 5, col = INK } = {}) {
  const p = resample(pts, step); if (p.length < 2) return;
  g.lineCap = 'round'; const s0 = rnd() * 100;
  let prev = null;
  for (let i = 0; i < p.length; i++) {
    const j = Math.max(1, Math.min(p.length - 2, i));
    const tx = p[j + 1][0] - p[j - 1][0], ty = p[j + 1][1] - p[j - 1][1], tl = Math.hypot(tx, ty) || 1;
    const o = N(s0 + i * 0.13, 1.7) * wob;
    const q = [p[i][0] - ty / tl * o, p[i][1] + tx / tl * o];
    if (prev) {
      g.strokeStyle = col + (a * (0.8 + 0.2 * N(s0 + i * 0.3, 5.1))).toFixed(3) + ')';
      g.lineWidth = w * (0.75 + 0.45 * (0.5 + N(s0 + i * 0.07, 9.3)));
      g.beginPath(); g.moveTo(prev[0], prev[1]); g.lineTo(q[0], q[1]); g.stroke();
    }
    prev = q;
  }
}
function catmull(pts, seg = 12) { // open Catmull-Rom sampling
  const out = [];
  for (let i = 0; i < pts.length - 1; i++) {
    const p0 = pts[Math.max(0, i - 1)], p1 = pts[i], p2 = pts[i + 1], p3 = pts[Math.min(pts.length - 1, i + 2)];
    for (let k = 0; k < seg; k++) {
      const t = k / seg, t2 = t * t, t3 = t2 * t;
      out.push([0, 1].map((d) => 0.5 * ((2 * p1[d]) + (-p0[d] + p2[d]) * t + (2 * p0[d] - 5 * p1[d] + 4 * p2[d] - p3[d]) * t2 + (-p0[d] + 3 * p1[d] - 3 * p2[d] + p3[d]) * t3)));
    }
  }
  out.push(pts[pts.length - 1]);
  return out;
}
function offsetLine(pts, d) {
  return pts.map((p, i) => { const a = pts[Math.max(0, i - 1)], b = pts[Math.min(pts.length - 1, i + 1)]; const tx = b[0] - a[0], ty = b[1] - a[1], l = Math.hypot(tx, ty) || 1;
    const dd = typeof d === 'function' ? d(i / (pts.length - 1)) : d; return [p[0] - ty / l * dd, p[1] + tx / l * dd]; });
}

function mapLayout(W, D, seed) {
  const r = mulberry32(seed * 131 + 7), j = (v, a) => v + (r() - 0.5) * a; // small seeded jitter of a designed layout
  const P = (u, v) => [j(u * W, 0.25), j(v * D, 0.2)];
  const village = [-0.13 * W, 0.08 * D];
  const river = [[0.21 * W, -0.58 * D], P(0.24, -0.30), P(0.13, -0.08), [0.19 * W, 0.15 * D], P(0.30, 0.31), [0.25 * W, 0.58 * D]];
  return {
    village,
    river,
    bridge: [0.19 * W, 0.15 * D],
    forests: [[...P(-0.33, -0.25), 0.12 * W], [...P(0.36, -0.30), 0.075 * W], [...P(0.39, 0.27), 0.085 * W], [...P(-0.25, 0.40), 0.06 * W], [...P(0.03, 0.37), 0.05 * W], [...P(-0.05, -0.30), 0.045 * W], [...P(0.44, -0.02), 0.04 * W]],
    hills: [P(-0.02, -0.41), P(0.09, -0.38), P(-0.14, -0.43), P(0.46, 0.10), P(-0.46, -0.06), P(0.14, 0.42)],
    gold: [P(-0.36, 0.06), P(0.40, -0.10)],
    stone: [P(0.08, -0.25), P(-0.38, 0.27)],
    roads: [[village, [0.0 * W, 0.16 * D], [0.12 * W, 0.16 * D], [0.19 * W, 0.15 * D], [0.32 * W, 0.08 * D], [0.52 * W, 0.04 * D]],
      [village, [-0.16 * W, 0.30 * D], [-0.10 * W, 0.56 * D]],
      [village, [-0.28 * W, 0.0 * D], [-0.52 * W, -0.10 * D]]],
    compass: [-0.415 * W, -0.36 * D],
  };
}

function paintParchment(W, D, seed, F) {
  const TW = 2048, TH = Math.round(2048 * D / W), s = TW / W;
  const X = (x) => (x / W + 0.5) * TW, Z = (z) => (z / D + 0.5) * TH;
  const c = makeCanvas(TW, TH), g = c.getContext('2d');
  const rnd = mulberry32(seed * 977 + 3), N = makeNoise2D(seed + 500);
  // ---- paper: base tone + mottling from a low-res noise field
  g.fillStyle = '#cbb488'; g.fillRect(0, 0, TW, TH);
  const mw = 256, mh = Math.round(256 * D / W), mc = makeCanvas(mw, mh), mg = mc.getContext('2d'), md = mg.createImageData(mw, mh);
  for (let y = 0; y < mh; y++) for (let x = 0; x < mw; x++) {
    const n = N.fbm(x / 40, y / 40, 5), n2 = N.fbm(x / 9 + 30, y / 9, 3);
    const t = clamp01(0.5 + n * 0.9 + n2 * 0.25);
    const i = (y * mw + x) * 4;
    md.data[i] = lerp(178, 236, t); md.data[i + 1] = lerp(146, 214, t); md.data[i + 2] = lerp(100, 168, t); md.data[i + 3] = 255;
  }
  mg.putImageData(md, 0, 0);
  g.globalAlpha = 0.55; g.imageSmoothingQuality = 'high'; g.drawImage(mc, 0, 0, TW, TH); g.globalAlpha = 1;
  // fibres and flecks
  for (let i = 0; i < 5000; i++) {
    const x = rnd() * TW, y = rnd() * TH, l = 2 + rnd() * 9, a = rnd() * Math.PI, d = rnd() < 0.5;
    g.strokeStyle = d ? `rgba(110,80,45,${0.05 + rnd() * 0.1})` : `rgba(250,238,210,${0.06 + rnd() * 0.12})`; g.lineWidth = 0.6 + rnd();
    g.beginPath(); g.moveTo(x, y); g.lineTo(x + Math.cos(a) * l, y + Math.sin(a) * l); g.stroke();
  }
  // tea stains / rings
  for (let i = 0; i < 6; i++) {
    const x = rnd() * TW, y = rnd() * TH, r = 40 + rnd() * 120;
    const gr = g.createRadialGradient(x, y, r * 0.2, x, y, r); gr.addColorStop(0, 'rgba(150,105,55,0.0)'); gr.addColorStop(0.85, `rgba(150,105,55,${0.05 + rnd() * 0.06})`); gr.addColorStop(1, 'rgba(120,80,40,0)');
    g.fillStyle = gr; g.beginPath(); g.arc(x, y, r, 0, Math.PI * 2); g.fill();
    if (rnd() < 0.6) { g.strokeStyle = `rgba(125,85,45,${0.10 + rnd() * 0.1})`; g.lineWidth = 1.5 + rnd() * 2; g.beginPath(); g.arc(x, y, r * 0.9, rnd() * 6, rnd() * 6 + 4.5); g.stroke(); }
  }

  // ---- watercolour washes
  const wash = (pts, fill, edge, ew = 3) => { blobPath(g, pts); g.fillStyle = fill; g.fill(); if (edge) { g.strokeStyle = edge; g.lineWidth = ew; g.stroke(); } };
  const blobAround = (x, y, r, k = 14, amp = 0.32, sd = 0) => Array.from({ length: k }, (_, i) => { const a = i / k * Math.PI * 2; const rr = r * (1 + amp * N(Math.cos(a) * 1.3 + sd, Math.sin(a) * 1.3 + sd * 2)); return [x + Math.cos(a) * rr, y + Math.sin(a) * rr * 0.92]; });
  // meadow tint
  for (let i = 0; i < 26; i++) { const x = rnd() * TW, y = rnd() * TH, r = 120 + rnd() * 260; const gr = g.createRadialGradient(x, y, 0, x, y, r); gr.addColorStop(0, 'rgba(140,152,84,0.10)'); gr.addColorStop(1, 'rgba(140,152,84,0)'); g.fillStyle = gr; g.fillRect(x - r, y - r, 2 * r, 2 * r); }
  // hills: ochre wash
  for (const [hx, hz] of F.hills) { const x = X(hx), y = Z(hz); wash(blobAround(x, y, 0.75 * s, 12, 0.35, hx), 'rgba(168,124,70,0.20)', 'rgba(140,98,52,0.16)', 4); }
  // village clearing + fields
  { const x = X(F.village[0]), y = Z(F.village[1]);
    wash(blobAround(x, y, 1.15 * s, 16, 0.18, 3), 'rgba(176,140,82,0.16)', 'rgba(150,112,62,0.18)', 3);
    const fields = [[-1.55, 0.35, 0.55, 0.38, 0.25], [-1.45, -0.55, 0.5, 0.42, -0.2], [1.25, 0.95, 0.6, 0.36, 0.15], [-0.35, 1.3, 0.55, 0.32, -0.1], [1.3, -0.7, 0.45, 0.4, 0.4]];
    for (const [fx, fz, fw, fh, fr] of fields) {
      g.save(); g.translate(x + fx * s, y + fz * s); g.rotate(fr);
      g.fillStyle = rnd() < 0.5 ? 'rgba(186,160,86,0.32)' : 'rgba(132,142,74,0.30)'; g.fillRect(-fw * s / 2, -fh * s / 2, fw * s, fh * s);
      for (let k = 0; k <= 9; k++) inkLine(g, [[-fw * s / 2, -fh * s / 2 + k * fh * s / 9], [fw * s / 2, -fh * s / 2 + k * fh * s / 9]], rnd, N, { w: 0.9, a: 0.32, wob: 0.6 });
      inkLine(g, [[-fw * s / 2, -fh * s / 2], [fw * s / 2, -fh * s / 2], [fw * s / 2, fh * s / 2], [-fw * s / 2, fh * s / 2], [-fw * s / 2, -fh * s / 2]], rnd, N, { w: 1.4, a: 0.55 });
      g.restore();
    }
  }
  // forests: green wash with pooled edges
  const forestBlobs = F.forests.map(([fx, fz, fr], i) => { const pts = blobAround(X(fx), Z(fz), fr * s, 16, 0.3, i * 3.1); wash(pts, 'rgba(92,110,58,0.34)', 'rgba(66,84,40,0.32)', 4); wash(blobAround(X(fx) + 12, Z(fz) - 8, fr * s * 0.7, 12, 0.35, i + 9), 'rgba(78,98,50,0.16)'); return pts; });
  // mines: soft washes
  for (const [mx, mz] of F.gold) { const gr = g.createRadialGradient(X(mx), Z(mz), 0, X(mx), Z(mz), 0.55 * s); gr.addColorStop(0, 'rgba(206,156,52,0.38)'); gr.addColorStop(1, 'rgba(206,156,52,0)'); g.fillStyle = gr; g.fillRect(X(mx) - s, Z(mz) - s, 2 * s, 2 * s); }
  for (const [mx, mz] of F.stone) { const gr = g.createRadialGradient(X(mx), Z(mz), 0, X(mx), Z(mz), 0.5 * s); gr.addColorStop(0, 'rgba(112,110,104,0.30)'); gr.addColorStop(1, 'rgba(112,110,104,0)'); g.fillStyle = gr; g.fillRect(X(mx) - s, Z(mz) - s, 2 * s, 2 * s); }
  // river: wash + highlight
  const rv = catmull(F.river.map(([x, z]) => [X(x), Z(z)]), 16);
  const rw = (t) => (0.13 + 0.09 * t) * s;
  { const L = offsetLine(rv, (t) => rw(t)), R = offsetLine(rv, (t) => -rw(t));
    blobPath(g, [...L, ...R.reverse()].map((p) => [p[0], p[1]]), true); g.fillStyle = 'rgba(96,128,142,0.55)'; g.fill();
    g.strokeStyle = 'rgba(70,100,116,0.30)'; g.lineWidth = 5; g.stroke();
    g.lineCap = 'round'; g.strokeStyle = 'rgba(176,198,200,0.35)'; g.lineWidth = 0.08 * s; g.beginPath(); rv.forEach((p, i) => i ? g.lineTo(p[0], p[1]) : g.moveTo(p[0], p[1])); g.stroke(); }

  // ---- ink
  // river banks + ripples
  inkLine(g, offsetLine(rv, (t) => rw(t)), rnd, N, { w: 2.2, a: 0.85, wob: 1.5 });
  inkLine(g, offsetLine(rv, (t) => -rw(t)), rnd, N, { w: 2.2, a: 0.85, wob: 1.5 });
  for (let i = 4; i < rv.length - 4; i += 3) {
    const t = i / rv.length, side = (i % 2 ? 1 : -1) * rw(t) * 0.35; const q = offsetLine(rv.slice(i - 2, i + 3), side);
    inkLine(g, q, rnd, N, { w: 1.0, a: 0.45, wob: 0.6, step: 3 });
  }
  // roads (dotted) and the bridge
  for (const road of F.roads) {
    const p = catmull(road.map(([x, z]) => [X(x), Z(z)]), 10), rs = resample(p, 4);
    g.fillStyle = INK + '0.55)';
    for (let i = 0; i < rs.length; i += 4) { g.beginPath(); g.arc(rs[i][0], rs[i][1], 1.6 + rnd() * 0.6, 0, Math.PI * 2); g.fill(); }
  }
  { const [bx, bz] = F.bridge, x = X(bx), y = Z(bz), w = 0.42 * s, h = 0.12 * s;
    g.save(); g.translate(x, y); g.rotate(-0.25);
    g.fillStyle = 'rgba(150,108,62,0.9)'; g.fillRect(-w / 2, -h / 2, w, h);
    for (let k = -4; k <= 4; k++) inkLine(g, [[k * w / 9, -h / 2], [k * w / 9, h / 2]], rnd, N, { w: 1, a: 0.6, wob: 0.3 });
    inkLine(g, [[-w / 2 - 6, -h / 2], [w / 2 + 6, -h / 2]], rnd, N, { w: 2.2, a: 0.9 }); inkLine(g, [[-w / 2 - 6, h / 2], [w / 2 + 6, h / 2]], rnd, N, { w: 2.2, a: 0.9 });
    g.restore(); }
  // hills: mound glyphs with hatching on the side away from the (top-left) light
  const hill = (x, y, w, h) => {
    const pts = [[x - w, y], [x - w * 0.55, y - h * 0.7], [x - w * 0.1, y - h], [x + w * 0.35, y - h * 0.78], [x + w, y]];
    g.fillStyle = 'rgba(214,190,144,0.85)'; blobPath(g, [...pts, [x, y + 2]]); g.fill();
    inkLine(g, catmull(pts, 6), rnd, N, { w: 2, a: 0.85, wob: 0.8 });
    for (let k = 0; k < 6; k++) { const t = 0.15 + k * 0.13; const px = x + w * (t - 0.05), py = y - h * (1 - Math.pow(Math.abs(t - 0.05) * 1.05, 1.6)) * 0.9; inkLine(g, [[px, py + 3], [px + w * 0.12, py + h * 0.35]], rnd, N, { w: 1, a: 0.55, wob: 0.3 }); }
  };
  for (const [hx, hz] of F.hills) {
    const n = 3 + Math.floor(rnd() * 3);
    const list = Array.from({ length: n }, () => [X(hx) + (rnd() - 0.5) * 0.9 * s, Z(hz) + (rnd() - 0.5) * 0.45 * s, (0.2 + rnd() * 0.16) * s, (0.13 + rnd() * 0.1) * s]).sort((a, b) => a[1] - b[1]);
    for (const h of list) hill(...h);
  }
  // trees: scalloped canopies (deciduous) and stacked spires (pines), drawn back to front
  const inPoly = (pts, x, y) => { let c2 = false; for (let i = 0, k = pts.length - 1; i < pts.length; k = i++) { const a = pts[i], b = pts[k]; if ((a[1] > y) !== (b[1] > y) && x < (b[0] - a[0]) * (y - a[1]) / (b[1] - a[1]) + a[0]) c2 = !c2; } return c2; };
  const tree = (x, y, r, pine) => {
    if (pine) {
      const h = r * 2.6;
      const pts = [[x, y - h, 1], [x + r * 0.45, y - h * 0.62, 1], [x + r * 0.28, y - h * 0.62, 1], [x + r * 0.8, y - h * 0.22, 1], [x + r * 0.5, y - h * 0.22, 1], [x + r, y, 1], [x - r, y, 1], [x - r * 0.5, y - h * 0.22, 1], [x - r * 0.8, y - h * 0.22, 1], [x - r * 0.28, y - h * 0.62, 1], [x - r * 0.45, y - h * 0.62, 1]];
      g.fillStyle = `rgba(${70 + rnd() * 20},${88 + rnd() * 20},${54 + rnd() * 12},0.9)`; g.beginPath(); pts.forEach((p, i) => i ? g.lineTo(p[0], p[1]) : g.moveTo(p[0], p[1])); g.closePath(); g.fill();
      g.save(); g.clip(); for (let k = 0; k < 7; k++) inkLine(g, [[x + r * 0.05 + k * r * 0.14, y - h * 0.8 + k * 3], [x + r * 0.4 + k * r * 0.14, y]], rnd, N, { w: 0.9, a: 0.5, wob: 0.2 }); g.restore();
      inkLine(g, [...pts, pts[0]], rnd, N, { w: 1.5, a: 0.9, wob: 0.4, step: 3 });
      inkLine(g, [[x, y], [x, y + r * 0.35]], rnd, N, { w: 1.6, a: 0.9, wob: 0.1 });
    } else {
      const k = 7, pts = [];
      for (let i = 0; i < k; i++) { const a = i / k * Math.PI * 2 - Math.PI / 2; const rr = r * (0.82 + rnd() * 0.18); pts.push([x + Math.cos(a) * rr, y - r * 0.9 + Math.sin(a) * rr * 0.92]); }
      g.beginPath();
      for (let i = 0; i < k; i++) { const a0 = pts[i], a1 = pts[(i + 1) % k]; const mx = (a0[0] + a1[0]) / 2, my = (a0[1] + a1[1]) / 2; const ox = mx - x, oy = my - (y - r * 0.9), ol = Math.hypot(ox, oy) || 1;
        if (!i) g.moveTo(a0[0], a0[1]); g.quadraticCurveTo(mx + ox / ol * r * 0.32, my + oy / ol * r * 0.32, a1[0], a1[1]); }
      g.closePath();
      g.fillStyle = `rgba(${100 + rnd() * 25},${118 + rnd() * 20},${64 + rnd() * 14},0.88)`; g.fill();
      g.save(); g.clip(); for (let j = 0; j < 8; j++) inkLine(g, [[x - r * 0.1 + j * r * 0.16, y - r * 1.9], [x + r * 0.5 + j * r * 0.16, y - r * 0.2]], rnd, N, { w: 0.9, a: 0.45, wob: 0.2 }); g.restore();
      g.lineWidth = 1.5; g.strokeStyle = INK + '0.85)'; g.stroke();
      inkLine(g, [[x, y - r * 0.1], [x + 1, y + r * 0.35]], rnd, N, { w: 1.8, a: 0.9, wob: 0.1 });
    }
  };
  F.forests.forEach(([fx, fz, fr], fi) => {
    const pts = forestBlobs[fi], cx = X(fx), cy = Z(fz), R = fr * s * 1.3, list = [];
    const pine = fz < -0.15 * D; // northern forests are pine
    for (let i = 0; i < 900 && list.length < 220; i++) {
      const x = cx + (rnd() - 0.5) * 2 * R, y = cy + (rnd() - 0.5) * 2 * R;
      if (!inPoly(pts, x, y)) continue;
      if (list.some((q) => Math.hypot(q[0] - x, (q[1] - y) * 1.3) < 0.15 * s)) continue;
      list.push([x, y]);
    }
    list.sort((a, b) => a[1] - b[1]).forEach(([x, y]) => tree(x, y, (0.085 + rnd() * 0.03) * s, pine ? rnd() < 0.85 : rnd() < 0.15));
  });
  // a few lone trees along the river
  for (let i = 6; i < rv.length - 6; i += 9) { const q = offsetLine(rv.slice(i - 1, i + 2), (rnd() < 0.5 ? 1 : -1) * (rw(i / rv.length) + 0.12 * s))[1]; tree(q[0], q[1], 0.075 * s, false); }
  // gold: nugget heaps with sparkle; stone: cut blocks; both with a crossed-hammers mine mark
  const hammers = (x, y, r) => { for (const sg of [-1, 1]) { inkLine(g, [[x - r * sg, y + r], [x + r * sg, y - r]], rnd, N, { w: 2, a: 0.85, wob: 0.2 }); g.fillStyle = INK + '0.85)'; g.save(); g.translate(x + r * sg, y - r); g.rotate(sg * Math.PI / 4); g.fillRect(-r * 0.45, -r * 0.18, r * 0.9, r * 0.36); g.restore(); } };
  for (const [mx, mz] of F.gold) {
    const x = X(mx), y = Z(mz);
    for (let i = 0; i < 11; i++) {
      const a = rnd() * 6.28, d = Math.sqrt(rnd()) * 0.22 * s, nx = x + Math.cos(a) * d, ny = y + Math.sin(a) * d * 0.7, r = (0.035 + rnd() * 0.03) * s;
      const pts = Array.from({ length: 7 }, (_, k) => { const b = k / 7 * 6.28; const rr = r * (0.75 + rnd() * 0.35); return [nx + Math.cos(b) * rr, ny + Math.sin(b) * rr * 0.8]; });
      blobPath(g, pts); g.fillStyle = `rgba(${200 + rnd() * 30},${150 + rnd() * 25},${50 + rnd() * 20},0.95)`; g.fill(); g.lineWidth = 1.4; g.strokeStyle = INK + '0.85)'; g.stroke();
      g.fillStyle = 'rgba(255,236,170,0.7)'; g.beginPath(); g.arc(nx - r * 0.3, ny - r * 0.3, r * 0.22, 0, 6.28); g.fill();
    }
    for (let i = 0; i < 4; i++) { const sx = x + (rnd() - 0.5) * 0.6 * s, sy = y + (rnd() - 0.5) * 0.4 * s, l = 5 + rnd() * 5; inkLine(g, [[sx - l, sy], [sx + l, sy]], rnd, N, { w: 1, a: 0.7, wob: 0 }); inkLine(g, [[sx, sy - l], [sx, sy + l]], rnd, N, { w: 1, a: 0.7, wob: 0 }); }
    hammers(x + 0.32 * s, y - 0.28 * s, 0.05 * s);
  }
  for (const [mx, mz] of F.stone) {
    const x = X(mx), y = Z(mz);
    const blocks = Array.from({ length: 8 }, () => [x + (rnd() - 0.5) * 0.5 * s, y + (rnd() - 0.5) * 0.3 * s]).sort((a, b) => a[1] - b[1]);
    for (const [bx, by] of blocks) {
      const w = (0.05 + rnd() * 0.04) * s, h = (0.04 + rnd() * 0.03) * s, sk = (rnd() - 0.5) * w * 0.6;
      const top = [[bx - w + sk, by - h], [bx + w + sk, by - h * 1.15], [bx + w, by + h * 0.2], [bx - w, by + h * 0.35]];
      g.fillStyle = `rgba(${150 + rnd() * 25},${146 + rnd() * 22},${134 + rnd() * 20},0.95)`; g.beginPath(); top.forEach((p, i) => i ? g.lineTo(p[0], p[1]) : g.moveTo(p[0], p[1])); g.closePath(); g.fill();
      g.fillStyle = 'rgba(90,86,78,0.85)'; g.beginPath(); g.moveTo(top[3][0], top[3][1]); g.lineTo(top[2][0], top[2][1]); g.lineTo(top[2][0], top[2][1] + h * 0.7); g.lineTo(top[3][0], top[3][1] + h * 0.7); g.closePath(); g.fill();
      inkLine(g, [...top, top[0]], rnd, N, { w: 1.3, a: 0.85, wob: 0.3, step: 3 });
      inkLine(g, [top[3], [top[3][0], top[3][1] + h * 0.7], [top[2][0], top[2][1] + h * 0.7], top[2]], rnd, N, { w: 1.3, a: 0.85, wob: 0.3, step: 3 });
    }
    hammers(x + 0.34 * s, y - 0.25 * s, 0.05 * s);
  }
  // compass rose (original): eight points, half-inked, two rings, a hand-drawn N
  { const [cx0, cz0] = F.compass, x = X(cx0), y = Z(cz0), R = 0.5 * s;
    g.strokeStyle = INK + '0.8)';
    for (const rr of [R * 0.78, R * 0.7]) { g.lineWidth = rr > R * 0.75 ? 2 : 1; g.beginPath(); g.arc(x, y, rr, 0, 6.29); g.stroke(); }
    for (let i = 0; i < 8; i++) {
      const a = i * Math.PI / 4 - Math.PI / 2, L = i % 2 ? R * 0.55 : R, wv = i % 2 ? R * 0.08 : R * 0.13;
      const tip = [x + Math.cos(a) * L, y + Math.sin(a) * L], l1 = [x + Math.cos(a - Math.PI / 2) * wv, y + Math.sin(a - Math.PI / 2) * wv], l2 = [x + Math.cos(a + Math.PI / 2) * wv, y + Math.sin(a + Math.PI / 2) * wv];
      g.fillStyle = INK + '0.85)'; g.beginPath(); g.moveTo(x, y); g.lineTo(...l1); g.lineTo(...tip); g.closePath(); g.fill();
      g.fillStyle = 'rgba(226,206,160,0.95)'; g.beginPath(); g.moveTo(x, y); g.lineTo(...l2); g.lineTo(...tip); g.closePath(); g.fill();
      inkLine(g, [[x, y], l2, tip], rnd, N, { w: 1.2, a: 0.85, wob: 0.1 });
    }
    const ny = y - R * 1.18, nh = R * 0.2, nw = R * 0.14;
    inkLine(g, [[x - nw / 2, ny + nh / 2], [x - nw / 2, ny - nh / 2], [x + nw / 2, ny + nh / 2], [x + nw / 2, ny - nh / 2]], rnd, N, { w: 2.2, a: 0.9, wob: 0.15, step: 3 });
  }
  // border: double rule with corner squares
  { const m1 = 34, m2 = 46; g.strokeStyle = INK + '0.8)';
    inkLine(g, [[m1, m1], [TW - m1, m1], [TW - m1, TH - m1], [m1, TH - m1], [m1, m1]], rnd, N, { w: 3, a: 0.8, wob: 0.8, step: 8 });
    inkLine(g, [[m2, m2], [TW - m2, m2], [TW - m2, TH - m2], [m2, TH - m2], [m2, m2]], rnd, N, { w: 1.2, a: 0.7, wob: 0.6, step: 8 });
    for (const [qx, qy] of [[m1, m1], [TW - m1, m1], [TW - m1, TH - m1], [m1, TH - m1]]) { g.fillStyle = INK + '0.8)'; g.fillRect(qx - 7, qy - 7, 14, 14); }
  }
  // ---- age: fold creases (thirds across, half down), rubbed lighter beside a dark line
  const creaseX = [X(-W / 6), X(W / 6)], creaseZ = [Z(0)];
  for (const cx of creaseX) { g.fillStyle = 'rgba(245,232,200,0.08)'; g.fillRect(cx - 12, 0, 24, TH); g.fillStyle = 'rgba(90,60,30,0.08)'; g.fillRect(cx - 1, 0, 2, TH); }
  for (const cz of creaseZ) { g.fillStyle = 'rgba(245,232,200,0.08)'; g.fillRect(0, cz - 12, TW, 24); g.fillStyle = 'rgba(90,60,30,0.08)'; g.fillRect(0, cz - 1, TW, 2); }
  // ---- worn, darkened edges: gradient burn + noisy blotches + scuffs
  const edge = (x0, y0, x1, y1, w) => { const gr = g.createLinearGradient(x0, y0, x1, y1); gr.addColorStop(0, 'rgba(78,46,18,0.6)'); gr.addColorStop(0.35, 'rgba(110,72,34,0.22)'); gr.addColorStop(1, 'rgba(110,72,34,0)'); g.fillStyle = gr; return w; };
  edge(0, 0, 0, 120); g.fillRect(0, 0, TW, 120); edge(0, TH, 0, TH - 120); g.fillRect(0, TH - 120, TW, 120);
  edge(0, 0, 120, 0); g.fillRect(0, 0, 120, TH); edge(TW, 0, TW - 120, 0); g.fillRect(TW - 120, 0, 120, TH);
  for (let i = 0; i < 260; i++) {
    const side = Math.floor(rnd() * 4), t = rnd(), d = Math.pow(rnd(), 2) * 70;
    const x = side === 0 ? t * TW : side === 1 ? TW - d : side === 2 ? t * TW : d, y = side === 0 ? d : side === 1 ? t * TH : side === 2 ? TH - d : t * TH;
    const r = 10 + rnd() * 50, gr = g.createRadialGradient(x, y, 0, x, y, r);
    gr.addColorStop(0, `rgba(84,50,22,${0.08 + rnd() * 0.18})`); gr.addColorStop(1, 'rgba(84,50,22,0)'); g.fillStyle = gr; g.fillRect(x - r, y - r, 2 * r, 2 * r);
  }
  for (let i = 0; i < 400; i++) { // scuffed, lighter fibres right at the edge
    const side = Math.floor(rnd() * 4), t = rnd(), d = rnd() * 10;
    const x = side === 0 ? t * TW : side === 1 ? TW - d : side === 2 ? t * TW : d, y = side === 0 ? d : side === 1 ? t * TH : side === 2 ? TH - d : t * TH;
    g.fillStyle = `rgba(232,214,176,${0.15 + rnd() * 0.3})`; g.fillRect(x, y, 1 + rnd() * 4, 1 + rnd() * 4);
  }
  return { canvas: c, TW, TH, creaseX, creaseZ };
}

/* fog of war: drifting painted mist, alpha from a reveal mask (white = revealed) */
const FOG_GLSL = /* glsl */`
uniform sampler2D uMask; uniform vec2 uSize; uniform float uTime; uniform float uScale; uniform float uDrift; uniform float uSeed;
uniform float uRag; uniform float uLo; uniform float uHi; uniform float uMinD; uniform float uOpacity; uniform float uPool;
varying vec2 vFogUv;
float fh(vec2 p){ return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }
float fn(vec2 p){ vec2 i = floor(p), f = fract(p); f = f * f * (3.0 - 2.0 * f);
  return mix(mix(fh(i), fh(i + vec2(1, 0)), f.x), mix(fh(i + vec2(0, 1)), fh(i + vec2(1, 1)), f.x), f.y); }
float fbm(vec2 p){ float s = 0.0, a = 0.5; for (int i = 0; i < 5; i++) { s += a * fn(p); p = p * 2.03 + 17.1; a *= 0.5; } return s; }
`;
function fogMaterial(maskTex, W, D, L) {
  const m = new THREE.MeshStandardMaterial({ color: L.color, roughness: 1, metalness: 0, transparent: true, depthWrite: false });
  const U = {
    uMask: { value: maskTex }, uSize: { value: new THREE.Vector2(W, D) }, uTime: { value: 0 }, uScale: { value: L.scale }, uDrift: { value: L.drift }, uSeed: { value: L.seed },
    uRag: { value: L.rag }, uLo: { value: L.lo }, uHi: { value: L.hi }, uMinD: { value: L.minD }, uOpacity: { value: L.opacity }, uPool: { value: L.pool },
  };
  m.onBeforeCompile = (sh) => {
    Object.assign(sh.uniforms, U);
    sh.vertexShader = sh.vertexShader.replace('#include <common>', '#include <common>\nuniform vec2 uSize; varying vec2 vFogUv;')
      .replace('#include <begin_vertex>', '#include <begin_vertex>\nvFogUv = vec2(position.x / uSize.x + 0.5, 0.5 - position.z / uSize.y);');
    sh.fragmentShader = sh.fragmentShader.replace('#include <common>', '#include <common>\n' + FOG_GLSL)
      .replace('#include <alphamap_fragment>', `#include <alphamap_fragment>
        float fm = texture2D(uMask, vFogUv).r;
        vec2 q = vFogUv * uSize * uScale;
        float ft = uTime;
        vec2 fw = vec2(fbm(q * 0.6 + vec2(ft * 0.05, ft * 0.02) + uSeed), fbm(q * 0.6 + vec2(4.7, 1.3) - vec2(ft * 0.03, ft * 0.045)));
        float fnz = fbm(q + 2.2 * fw + vec2(ft * uDrift, ft * uDrift * 0.4));
        float fst = fbm(q * vec2(2.6, 0.7) + fw * 1.4 + uSeed * 1.7 + vec2(ft * uDrift * 1.5, 0.0));
        float fedge = fm + (fnz - 0.5) * uRag;
        float fog = 1.0 - smoothstep(uLo, uHi, fedge);
        float fden = mix(uMinD, 1.0, smoothstep(0.25, 0.72, fnz)) * mix(0.8, 1.0, fst);
        vec2 fb = min(vFogUv, 1.0 - vFogUv) * uSize;
        float fbord = smoothstep(0.0, 0.25, min(fb.x, fb.y));
        diffuseColor.a *= fog * fden * uOpacity * fbord;
        float frim = clamp(fog * (1.0 - fog) * 4.0, 0.0, 1.0);
        diffuseColor.rgb *= (0.88 + 0.24 * fst) * (1.0 - uPool * frim);`);
  };
  m.customProgramCacheKey = () => 'fog-mist';
  m.userData.uniforms = U;
  return m;
}

/**
 * makeCampaignMap({width=11, depth=7.4, seed=3, fog=true, village=true|{age,colour}, colour='red'}) -> THREE.Group
 * A parchment map lying on the table (centre at origin, paper surface ~y 0.005, curled north edge).
 * userData:
 *   features          {village:[x,z], river:[[x,z]..], bridge, forests:[[x,z,r]..], hills, gold:[[x,z]..], stone, roads, compass}
 *   surfaceY(x,z)     paper height at a local point (place props/tokens on it)
 *   update(t)         drive fog + village (call every tick with wt time) — or attach(wt) once
 *   attach(wt)        registers update on wt.onTick; returns the unsubscribe function
 *   reveal(x,z,r,{duration=2.4, delay=0})       lift the fog in a soft circle (animated)
 *   revealPath([[x,z],...], r, {speed=0.8 units/s, delay=0, duration=2.2})   fog lifts along a path (scouting)
 *   resetFog() / clearFog() / setFogVisible(bool)
 *   setAge(age, {duration=2.4})   'dark'|'feudal'|'castle'|'imperial' (village on the map)
 *   village           the makeVillage group (if village !== false)
 */
export function makeCampaignMap(o = {}) {
  const W = o.width ?? 11, D = o.depth ?? 7.4, seed = o.seed ?? 3;
  const group = new THREE.Group(); group.userData.kind = 'campaignMap';
  const F = mapLayout(W, D, seed);
  const N = makeNoise2D(seed + 77);
  // ---- surface shape: creases, gentle waviness, curled edges (north rolls up most)
  const surf = (x, z) => {
    const u = x / (W / 2), v = z / (D / 2);
    let y = 0.005 + 0.006 * (N.fbm(x * 0.35 + 3, z * 0.35, 3) + 0.4);
    const n = Math.max(0, (-v - 0.8) / 0.2), sN = Math.max(0, (v - 0.86) / 0.14), e = Math.max(0, (Math.abs(u) - 0.9) / 0.1);
    y += 0.30 * n * n * (1 + 0.25 * Math.sin(u * 2.2 + 1)) + 0.05 * sN * sN + 0.035 * e * e;
    y += -0.004 * Math.exp(-(((x + W / 6) / 0.14) ** 2)) + 0.004 * Math.exp(-(((x - W / 6) / 0.14) ** 2)) - 0.003 * Math.exp(-((z / 0.14) ** 2)); // soft fold creases
    // corners lift a touch more
    y += 0.06 * Math.pow(Math.max(0, Math.abs(u) - 0.8) / 0.2, 2) * Math.pow(Math.max(0, Math.abs(v) - 0.75) / 0.25, 2);
    return y;
  };
  const curlZ = (x, z) => { const v = z / (D / 2); const n = Math.max(0, (-v - 0.8) / 0.2); return z + 0.12 * n * n; };
  function paperGeo(sx, sz, yOff = 0) {
    const geo = new THREE.PlaneGeometry(W, D, sx, sz); geo.rotateX(-Math.PI / 2);
    const p = geo.attributes.position;
    for (let i = 0; i < p.count; i++) { const x = p.getX(i), z = p.getZ(i); p.setXYZ(i, x, surf(x, z) + yOff, curlZ(x, z)); }
    geo.computeVertexNormals(); return geo;
  }
  // ---- paper material
  const art = paintParchment(W, D, seed, F);
  const colTex = canvasTex(art.canvas, true); colTex.wrapS = colTex.wrapT = THREE.ClampToEdgeWrapping;
  // roughness: matte paper, ink and washes slightly glossier; bump: fibres + creases + a little from the ink
  const RW = 1024, RH = Math.round(1024 * D / W);
  const rc = makeCanvas(RW, RH), rg = rc.getContext('2d'); rg.drawImage(art.canvas, 0, 0, RW, RH);
  const bc = makeCanvas(RW, RH), bg = bc.getContext('2d');
  { const rd = rg.getImageData(0, 0, RW, RH), bd = bg.createImageData(RW, RH), FN = makeNoise2D(seed + 9);
    for (let y = 0; y < RH; y++) for (let x = 0; x < RW; x++) {
      const i = (y * RW + x) * 4, lum = (rd.data[i] * 0.3 + rd.data[i + 1] * 0.59 + rd.data[i + 2] * 0.11) / 255;
      const ink = clamp01((0.62 - lum) * 2.2);
      const fib = FN(x / 2.2, y / 7) * 0.5 + FN.fbm(x / 60, y / 60, 3) * 0.6;
      const r = clamp01(0.86 - ink * 0.3 + fib * 0.05);
      rd.data[i] = rd.data[i + 1] = rd.data[i + 2] = r * 255;
      const b = clamp01(0.5 + fib * 0.35 + ink * 0.12);
      bd.data[i] = bd.data[i + 1] = bd.data[i + 2] = b * 255; bd.data[i + 3] = 255;
    }
    rg.putImageData(rd, 0, 0); bg.putImageData(bd, 0, 0); }
  const paperMat = new THREE.MeshPhysicalMaterial({
    map: colTex, roughnessMap: canvasTex(rc, false), roughness: 1, bumpMap: canvasTex(bc, false), bumpScale: 0.9,
    sheen: 0.35, sheenColor: new THREE.Color(0xf0dcb0), sheenRoughness: 0.7, specularIntensity: 0.4,
  });
  for (const t of [paperMat.roughnessMap, paperMat.bumpMap]) t.wrapS = t.wrapT = THREE.ClampToEdgeWrapping;
  const top = new THREE.Mesh(paperGeo(220, 148), paperMat); top.castShadow = true; top.receiveShadow = true; group.add(top);
  const under = new THREE.Mesh(top.geometry, new THREE.MeshStandardMaterial({ color: 0xbca57c, roughness: 0.95, side: THREE.BackSide })); under.receiveShadow = true; group.add(under);
  // paper thickness: a thin wall around the boundary
  { const sx = 220, sz = 148, p = top.geometry.attributes.position, idx = [];
    for (let i = 0; i <= sx; i++) idx.push(i); for (let j = 1; j <= sz; j++) idx.push(j * (sx + 1) + sx);
    for (let i = sx - 1; i >= 0; i--) idx.push(sz * (sx + 1) + i); for (let j = sz - 1; j >= 0; j--) idx.push(j * (sx + 1));
    const pos = []; const T = 0.012;
    for (let k = 0; k < idx.length - 1; k++) {
      const a = idx[k], b = idx[k + 1];
      const ax = p.getX(a), ay = p.getY(a), az = p.getZ(a), bx = p.getX(b), by = p.getY(b), bz = p.getZ(b);
      pos.push(ax, ay, az, bx, by, bz, bx, by - T, bz, ax, ay, az, bx, by - T, bz, ax, ay - T, az);
    }
    const eg = new THREE.BufferGeometry(); eg.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3)); eg.computeVertexNormals();
    const em = new THREE.Mesh(eg, new THREE.MeshStandardMaterial({ color: 0xa88f66, roughness: 0.95, side: THREE.DoubleSide })); em.castShadow = true; em.receiveShadow = true; group.add(em); }

  // ---- fog of war
  const MW = 512, MH = Math.round(512 * D / W);
  const maskC = makeCanvas(MW, MH), mg = maskC.getContext('2d');
  mg.fillStyle = '#000'; mg.fillRect(0, 0, MW, MH);
  const maskTex = new THREE.CanvasTexture(maskC); maskTex.colorSpace = THREE.NoColorSpace; maskTex.wrapS = maskTex.wrapT = THREE.ClampToEdgeWrapping;
  const layers = [
    { h: 0.022, color: 0x9ea3a2, opacity: 0.9, rag: 0.7, lo: 0.3, hi: 0.64, minD: 0.5, pool: 0.45, scale: 0.75, drift: 0.018, seed: 1.3 },
    { h: 0.075, color: 0xc4c4bd, opacity: 0.5, rag: 0.9, lo: 0.18, hi: 0.70, minD: 0.0, pool: 0.0, scale: 1.25, drift: 0.045, seed: 7.9 },
    { h: 0.15, color: 0xd2d0c8, opacity: 0.28, rag: 0.95, lo: 0.12, hi: 0.78, minD: 0.0, pool: 0.0, scale: 1.8, drift: 0.075, seed: 3.1 },
  ];
  const fogMeshes = [];
  if (o.fog !== false) {
    layers.forEach((L, i) => {
      const m = new THREE.Mesh(paperGeo(110, 74, L.h), fogMaterial(maskTex, W, D, L));
      m.renderOrder = 2 + i; m.castShadow = false; m.receiveShadow = false; group.add(m); fogMeshes.push(m);
    });
  }
  const ops = []; let now = 0, maskDirty = true;
  function drawMask() {
    mg.globalCompositeOperation = 'source-over'; mg.fillStyle = '#000'; mg.fillRect(0, 0, MW, MH);
    mg.globalCompositeOperation = 'lighter';
    let animating = false;
    for (const op of ops) {
      const p = op.dur > 0 ? clamp01((now - op.t0) / op.dur) : (now >= op.t0 ? 1 : 0);
      if (p <= 0) { animating = true; continue; }
      if (p < 1) animating = true;
      const e = easeOut(p), rr = op.r * (0.25 + 0.75 * e) * MW / W;
      const cx = (op.x / W + 0.5) * MW, cy = (op.z / D + 0.5) * MH;
      const gr = mg.createRadialGradient(cx, cy, 0, cx, cy, rr);
      const a = Math.min(1, e * 1.2);
      gr.addColorStop(0, `rgba(255,255,255,${a})`); gr.addColorStop(0.5, `rgba(255,255,255,${a})`); gr.addColorStop(1, 'rgba(255,255,255,0)');
      mg.fillStyle = gr; mg.fillRect(cx - rr, cy - rr, rr * 2, rr * 2);
    }
    mg.globalCompositeOperation = 'source-over';
    maskTex.needsUpdate = true;
    return animating;
  }

  // ---- village
  let village = null;
  if (o.village !== false) {
    const vo = typeof o.village === 'object' ? o.village : {};
    village = makeVillage({ age: vo.age ?? 'dark', colour: vo.colour ?? o.colour ?? 'red', seed: seed + 1 });
    village.position.set(F.village[0], surf(F.village[0], F.village[1]), F.village[1]);
    group.add(village);
  }

  const U = group.userData;
  Object.assign(U, {
    features: F, width: W, depth: D, village, fogMeshes, maskCanvas: maskC,
    surfaceY: surf,
    update(t) {
      now = t;
      for (const m of fogMeshes) m.material.userData.uniforms.uTime.value = t;
      if (maskDirty) maskDirty = drawMask();
      if (village) village.userData.update(t);
    },
    attach(wt) { return wt.onTick((dt, t) => U.update(t)); },
    reveal(x, z, r, op = {}) { ops.push({ x, z, r, t0: now + (op.delay ?? 0), dur: op.duration ?? 2.4 }); maskDirty = true; },
    revealPath(pts, r, op = {}) {
      const sp = op.speed ?? 0.8; let dist = 0;
      const p = resample(pts, Math.max(0.05, r * 0.45));
      for (let i = 0; i < p.length; i++) {
        if (i) dist += Math.hypot(p[i][0] - p[i - 1][0], p[i][1] - p[i - 1][1]);
        U.reveal(p[i][0], p[i][1], r, { delay: (op.delay ?? 0) + dist / sp, duration: op.duration ?? 2.2 });
      }
      return dist / sp; // seconds until the last point starts lifting
    },
    resetFog() { ops.length = 0; maskDirty = true; },
    clearFog() { U.resetFog(); ops.push({ x: 0, z: 0, r: Math.hypot(W, D) * 2, t0: -1, dur: 0 }); maskDirty = true; },
    setFogVisible(v) { for (const m of fogMeshes) m.visible = v; },
    setAge(age, op) { if (village) village.userData.setAge(age, op); },
  });
  U.update(0);
  return group;
}

/* ======================================================================
   Village: carved & painted wooden buildings through the four ages
   ====================================================================== */
export const AGES = ['dark', 'feudal', 'castle', 'imperial'];
function gableRoof(len, wid, h, mat, over = 0.03) {
  const s = new THREE.Shape(); const w = wid / 2 + over;
  s.moveTo(-w, 0); s.lineTo(w, 0); s.lineTo(0, h); s.lineTo(-w, 0);
  const geo = new THREE.ExtrudeGeometry(s, { depth: len + over * 2, bevelEnabled: true, bevelThickness: 0.006, bevelSize: 0.006, bevelSegments: 2 });
  geo.translate(0, 0, -(len + over * 2) / 2); geo.rotateY(Math.PI / 2);
  return new THREE.Mesh(geo, mat);
}
function box(w, h, d, mat, x = 0, y = 0, z = 0, r = 0.006) { const m = new THREE.Mesh(new RoundedBoxGeometry(w, h, d, 2, Math.min(r, w / 2.1, h / 2.1, d / 2.1)), mat); m.position.set(x, y, z); return m; }
function cylM(rt, rb, h, mat, x = 0, y = 0, z = 0, seg = 16) { const m = new THREE.Mesh(new THREE.CylinderGeometry(rt, rb, h, seg), mat); m.position.set(x, y, z); return m; }
function latheM(pts, mat, seg = 24) { if (pts[0][1] > pts[pts.length - 1][1]) pts = pts.slice().reverse(); const g =BGU.toCreasedNormals(new THREE.LatheGeometry(pts.map(([a, b]) => new THREE.Vector2(a, b)), seg), 0.6); return new THREE.Mesh(g, mat); }
function crenels(w, d, y, mat, size = 0.026) {
  const g = new THREE.Group(); const n = Math.max(2, Math.round(w / (size * 2)));
  for (let i = 0; i < n; i++) for (const s of [-1, 1]) {
    const x = -w / 2 + size / 2 + i * (w - size) / (n - 1);
    g.add(box(size, size, size, mat, x, y, s * (d / 2 - size / 2), 0.003)); g.add(box(size, size, size, mat, s * (w / 2 - size / 2), y, x * d / w, 0.003));
  }
  return g;
}
const B = {
  hut(m, r = 0.1) {
    const g = new THREE.Group();
    g.add(cylM(r, r * 1.04, 0.1, m.lime, 0, 0.05, 0, 18));
    // three tiers of thatch, lumpy, as if tied in bundles
    const rg = new THREE.LatheGeometry([[0, 0.07], [r * 1.34, 0.07], [r * 1.42, 0.088], [r * 1.12, 0.128], [r * 1.17, 0.14], [r * 0.86, 0.192], [r * 0.9, 0.203], [r * 0.5, 0.255], [r * 0.18, 0.287], [0, 0.297]].map(([a, b]) => new THREE.Vector2(a, b)), 28);
    const rp = rg.attributes.position, rn = makeNoise2D(Math.round(r * 1000));
    for (let i = 0; i < rp.count; i++) { const x = rp.getX(i), y = rp.getY(i), z = rp.getZ(i), a = Math.atan2(z, x), k = 1 + 0.07 * rn(Math.cos(a) * 3, Math.sin(a) * 3 + y * 20); rp.setXYZ(i, x * k, y + 0.004 * rn(a * 4, y * 30), z * k); }
    rg.computeVertexNormals(); g.add(new THREE.Mesh(rg, m.thatch));
    g.add(box(0.034, 0.06, 0.012, m.timber, 0, 0.03, r * 0.99, 0.003));
    return g;
  },
  house(m, w = 0.24, d = 0.15, h = 0.13, roofMat = m.tile) {
    const g = new THREE.Group();
    g.add(box(w, h, d, m.lime, 0, h / 2, 0, 0.008));
    for (const sx of [-1, 1]) for (const sz of [-1, 1]) g.add(box(0.014, h, 0.014, m.timber, sx * (w / 2 - 0.004), h / 2, sz * (d / 2 - 0.004), 0.003));
    for (const sz of [-1, 1]) { g.add(box(w, 0.012, 0.01, m.timber, 0, h * 0.55, sz * (d / 2 + 0.002), 0.003)); g.add(box(0.012, h * 0.5, 0.01, m.timber, 0, h * 0.27, sz * (d / 2 + 0.002), 0.003)); }
    const roof = gableRoof(w, d, h * 0.85, roofMat); roof.position.y = h; g.add(roof);
    g.add(box(0.04, 0.09, 0.04, m.stone, w * 0.32, h + 0.06, -d * 0.12, 0.004));
    g.add(box(0.036, 0.065, 0.01, m.timber, -w * 0.18, 0.032, d / 2 + 0.004, 0.003));
    return g;
  },
  hall(m) { const g = B.house(m, 0.44, 0.22, 0.13, m.thatch); g.scale.y = 1.08; return g; },
  palisade(m, R = 0.9, gate = Math.PI / 2, gap = 0.28) {
    const geos = []; const n = Math.round(2 * Math.PI * R / 0.035);
    const rnd = mulberry32(5);
    for (let i = 0; i < n; i++) {
      const a = i / n * Math.PI * 2; let da = Math.abs(((a - gate + Math.PI) % (2 * Math.PI)) - Math.PI); if (da < gap / R / 2) continue;
      const h = 0.15 + rnd() * 0.03;
      const s = new THREE.CylinderGeometry(0.015, 0.016, h, 7); s.translate(0, h / 2, 0);
      const t = new THREE.ConeGeometry(0.015, 0.035, 7); t.translate(0, h + 0.017, 0);
      for (const q of [s, t]) { q.rotateY(rnd() * 3); q.translate(Math.cos(a) * R, 0, Math.sin(a) * R); geos.push(q.index ? q.toNonIndexed() : q); }
    }
    const g = new THREE.Group(); g.add(new THREE.Mesh(BGU.mergeGeometries(geos.map((q) => { q.deleteAttribute('uv'); return q; })), m.walnut));
    for (const sg of [-1, 1]) { const a = gate + sg * gap / R / 2; g.add(cylM(0.022, 0.024, 0.24, m.walnut, Math.cos(a) * R, 0.12, Math.sin(a) * R, 8)); }
    return g;
  },
  wall(m, R = 0.95, gate = Math.PI / 2, towers = 6, imperial = false) {
    const g = new THREE.Group(); const H = imperial ? 0.2 : 0.16, gap = 0.3;
    const geos = []; const segs = 60;
    for (let i = 0; i < segs; i++) {
      const a = (i + 0.5) / segs * Math.PI * 2; let da = Math.abs(((a - gate + Math.PI) % (2 * Math.PI)) - Math.PI); if (da < gap / R / 2 + 0.02) continue;
      const L = 2 * Math.PI * R / segs * 1.04;
      const b = new RoundedBoxGeometry(L, H, 0.05, 1, 0.006); b.translate(0, H / 2, 0);
      const c = (i % 2) ? new RoundedBoxGeometry(L * 0.5, 0.03, 0.05, 1, 0.004) : null; if (c) c.translate(0, H + 0.015, 0);
      for (const q of c ? [b, c] : [b]) { q.rotateY(-a + Math.PI / 2); q.translate(Math.cos(a) * R, 0, Math.sin(a) * R); geos.push(q); }
    }
    g.add(new THREE.Mesh(BGU.mergeGeometries(geos), m.stone));
    const tower = (a, r = 0.07, h = H + 0.12) => {
      const t = new THREE.Group(); t.position.set(Math.cos(a) * R, 0, Math.sin(a) * R);
      t.add(cylM(r, r * 1.06, h, m.stone, 0, h / 2, 0, 18));
      if (imperial) t.add(latheM([[0, h + 0.17], [r * 0.2, h + 0.15], [r * 1.25, h + 0.01], [r * 1.2, h], [0, h]], m.slate, 18));
      else for (let k = 0; k < 8; k++) { const b2 = k / 8 * Math.PI * 2; t.add(box(0.026, 0.03, 0.026, m.stone, Math.cos(b2) * r * 0.85, h + 0.015, Math.sin(b2) * r * 0.85, 0.003)); }
      return t;
    };
    for (let i = 0; i < towers; i++) { const a = gate + (i + 0.5) / towers * Math.PI * 2; if (Math.abs(Math.sin((a - gate) / 2)) < 0.25) continue; g.add(tower(a)); }
    for (const sg of [-1, 1]) g.add(tower(gate + sg * (gap / R / 2 + 0.07), 0.075, H + 0.16));
    const arch = box(0.2, 0.05, 0.07, m.stone, Math.cos(gate) * R, H + 0.08, Math.sin(gate) * R, 0.005); arch.rotation.y = -gate + Math.PI / 2; g.add(arch);
    return g;
  },
  keep(m, imperial = false) {
    const g = new THREE.Group(); const w = imperial ? 0.32 : 0.26, h = imperial ? 0.58 : 0.4;
    g.add(box(w, h, w, m.stone, 0, h / 2, 0, 0.01));
    g.add(crenels(w + 0.02, w + 0.02, h + 0.014, m.stone));
    g.add(box(w * 0.5, 0.012, 0.012, m.dark, 0, h * 0.62, w / 2 + 0.003, 0.002)); // arrow slit band
    g.add(box(0.05, 0.08, 0.012, m.timber, 0, 0.04, w / 2 + 0.004, 0.004));
    if (imperial) {
      for (const sx of [-1, 1]) for (const sz of [-1, 1]) {
        const t = new THREE.Group(); t.position.set(sx * w / 2, 0, sz * w / 2);
        t.add(cylM(0.055, 0.06, h + 0.12, m.stone, 0, (h + 0.12) / 2, 0, 16));
        t.add(latheM([[0, h + 0.33], [0.012, h + 0.31], [0.075, h + 0.13], [0.07, h + 0.12], [0, h + 0.12]], m.slate, 16));
        g.add(t);
      }
    }
    return g;
  },
  church(m) {
    const g = new THREE.Group();
    g.add(box(0.36, 0.15, 0.18, m.lime, 0, 0.075, 0, 0.008));
    const roof = gableRoof(0.36, 0.18, 0.12, m.tile); roof.position.y = 0.15; g.add(roof);
    g.add(box(0.11, 0.34, 0.11, m.stone, -0.22, 0.17, 0, 0.006));
    g.add(latheM([[0, 0.6], [0.01, 0.58], [0.085, 0.35], [0.08, 0.34], [0, 0.34]], m.slate, 4).translateX(-0.22).rotateY(Math.PI / 4));
    const ball = new THREE.Mesh(new THREE.SphereGeometry(0.014, 12, 8), m.brass); ball.position.set(-0.22, 0.61, 0); g.add(ball);
    return g;
  },
  mill(m) {
    const g = new THREE.Group();
    g.add(cylM(0.06, 0.075, 0.24, m.stone, 0, 0.12, 0, 16));
    g.add(latheM([[0, 0.36], [0.02, 0.35], [0.09, 0.25], [0.085, 0.24], [0, 0.24]], m.thatch, 16));
    const sails = new THREE.Group(); sails.position.set(0, 0.25, 0.085);
    for (let i = 0; i < 4; i++) {
      const arm = new THREE.Group(); arm.rotation.z = i * Math.PI / 2;
      arm.add(box(0.012, 0.2, 0.008, m.walnut, 0, 0.1, 0, 0.002));
      arm.add(box(0.045, 0.15, 0.004, m.limeWarm, 0.028, 0.115, 0.004, 0.002));
      sails.add(arm);
    }
    g.add(sails); g.userData.sails = sails;
    return g;
  },
  well(m) { const g = new THREE.Group(); g.add(cylM(0.045, 0.05, 0.05, m.stone, 0, 0.025, 0, 14)); for (const s of [-1, 1]) g.add(box(0.01, 0.1, 0.01, m.walnut, s * 0.04, 0.08, 0, 0.002)); const r = gableRoof(0.1, 0.1, 0.04, m.thatch, 0.01); r.position.y = 0.12; g.add(r); return g; },
};

/**
 * makeVillage({age='dark', colour='red', seed=1}) -> THREE.Group (origin at the village centre, ground y=0, ~1 unit radius)
 * userData: setAge(age, {duration=2.4}) — buildings grow in / sink out with a staggered settle;
 *           update(t) — call every tick (windmill turns, banners wave, transitions run); age (current name).
 * Ages are cumulative: dark (hall, huts, well) -> feudal (+timber houses, windmill, palisade, gate banner)
 * -> castle (stone wall + towers replace the palisade, keep with banner, more houses)
 * -> imperial (taller keep with turrets, slate-roofed towers, church, banners on every tower).
 */
export function makeVillage(o = {}) {
  const m = mats();
  const col = o.colour ?? 'red';
  const g = new THREE.Group(); g.userData.kind = 'village';
  const items = [];
  const add = (obj, from, until = 4, pos = [0, 0], rot = 0) => {
    obj.position.x += pos[0]; obj.position.z += pos[1]; obj.rotation.y += rot;
    shadowAll(obj); const holder = new THREE.Group(); holder.add(obj); g.add(holder);
    const it = { holder, obj, from, until, s: 0, s0: 0, target: 0, t0: 0, dur: 0, delay: 0 }; items.push(it); return it;
  };
  const gate = Math.PI / 2;
  add(B.hall(m), 0, 4, [-0.02, 0.06], 0.08);
  add(B.hut(m, 0.1), 0, 4, [-0.5, 0.36]);
  add(B.hut(m, 0.09), 0, 3, [0.44, 0.42]);
  add(B.hut(m, 0.095), 0, 4, [-0.52, -0.3]);
  add(B.well(m), 0, 4, [0.2, 0.42]);
  add(B.house(m), 1, 4, [0.5, -0.1], 0.35);
  add(B.house(m, 0.22, 0.14, 0.12), 1, 4, [-0.62, 0.04], 1.5);
  const mill = add(B.mill(m), 1, 4, [1.25, -0.55], 0.4);
  add(B.palisade(m, 0.88, gate), 1, 2);
  add(B.wall(m, 0.95, gate, 6, false), 2, 3);
  add(B.wall(m, 0.95, gate, 6, true), 3, 4);
  add(B.keep(m, false), 2, 3, [0.1, -0.5]);
  add(B.keep(m, true), 3, 4, [0.1, -0.5]);
  add(B.house(m, 0.2, 0.14, 0.12), 2, 4, [-0.22, -0.52], -0.2);
  add(B.house(m, 0.22, 0.15, 0.13), 3, 4, [0.48, 0.4], -0.4);
  add(B.church(m), 3, 4, [-0.25, 0.55], 0.1);
  // banners (player colour): gate in feudal, keep in castle, on both gate towers + keep in imperial
  const banners = [];
  const ban = (from, until, pos, h, rot = 0) => { const b = makeBanner(col, { height: h, width: h * 0.34, seed: banners.length + 3 }); banners.push(b); return add(b, from, until, pos, rot); };
  ban(1, 2, [0.2, 0.92], 0.36, 0.1);
  ban(2, 3, [0.1, -0.5 + 0.0], 0.34);  // on the keep roof (placed by height below)
  ban(3, 4, [0.1, -0.5], 0.42);
  ban(2, 4, [-0.26, 1.0], 0.36);
  ban(2, 4, [0.26, 1.0], 0.36);
  // banner on keeps: lift the flag pole to the keep roof
  items.filter((it) => it.obj.userData.kind === 'banner' && Math.abs(it.obj.position.z + 0.5) < 0.01).forEach((it, i) => { it.obj.position.y = i === 0 ? 0.42 : 0.6; });
  const ageIdx = (a) => Math.max(0, AGES.indexOf(a));
  let now = 0, cur = ageIdx(o.age ?? 'dark');
  const apply = (it) => {
    const s = it.s, grow = it.target > 0.5;
    it.holder.visible = s > 0.002;
    if (grow) { const e = easeOutBack(s); it.holder.scale.set(0.75 + 0.25 * s, Math.max(0.001, e), 0.75 + 0.25 * s); it.holder.position.y = 0; }
    else { const e = easeInOut(s); it.holder.scale.setScalar(Math.max(0.001, 0.6 + 0.4 * e)); it.holder.scale.y = Math.max(0.001, e); it.holder.position.y = -0.02 * (1 - e); }
  };
  function setAge(age, op = {}) {
    cur = typeof age === 'number' ? age : ageIdx(age);
    const dur = op.duration ?? 2.4; let k = 0;
    for (const it of items) {
      const tg = cur >= it.from && cur < it.until ? 1 : 0;
      if (dur <= 0) { it.target = tg; it.s = it.s0 = tg; it.dur = 0; apply(it); continue; }
      if (tg === it.target) continue;
      it.s0 = it.s; it.target = tg; it.t0 = now; it.dur = dur;
      it.delay = tg ? 0.35 + 0.18 * (k++) : 0.0;
    }
    g.userData.age = AGES[cur];
  }
  g.userData.setAge = setAge;
  g.userData.items = items;
  g.userData.update = (t) => {
    now = t;
    for (const it of items) {
      if (it.s !== it.target && it.dur > 0) { const p = clamp01((t - it.t0 - it.delay) / it.dur); it.s = lerp(it.s0, it.target, p); apply(it); }
      if (it.holder.visible && it.obj.userData.update) it.obj.userData.update(t);
    }
    mill.obj.userData.sails.rotation.z = -t * 0.6;
  };
  setAge(cur, { duration: 0 });
  return g;
}

/* ======================================================================
   Banner
   ====================================================================== */
function emblemCanvas(pc, seed) {
  const W = 256, H = 384, c = makeCanvas(W, H), g = c.getContext('2d'), rnd = mulberry32(seed), N = makeNoise2D(seed + 3);
  g.fillStyle = css(pc); g.fillRect(0, 0, W, H);
  const d = g.getImageData(0, 0, W, H); // woven cloth: warp/weft + slow dye variation
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
    const i = (y * W + x) * 4, k = 1 + 0.07 * Math.sin(x * 1.6) * Math.sin(y * 1.6) + 0.1 * N.fbm(x / 70, y / 70, 3) + 0.04 * (rnd() - 0.5);
    d.data[i] *= k; d.data[i + 1] *= k; d.data[i + 2] *= k;
  }
  g.putImageData(d, 0, 0);
  const gold = '#b8913f', goldD = '#7a5c22';
  g.strokeStyle = gold; g.lineWidth = 9; g.strokeRect(14, 14, W - 28, H - 70);
  g.strokeStyle = goldD; g.lineWidth = 2; g.strokeRect(24, 24, W - 48, H - 90);
  // device: a chevron over a six-rayed star (original heraldry)
  g.fillStyle = gold; g.beginPath(); g.moveTo(40, 220); g.lineTo(128, 140); g.lineTo(216, 220); g.lineTo(216, 252); g.lineTo(128, 172); g.lineTo(40, 252); g.closePath(); g.fill();
  g.strokeStyle = goldD; g.lineWidth = 2.5; g.stroke();
  g.beginPath(); for (let i = 0; i < 12; i++) { const a = i / 12 * Math.PI * 2 - Math.PI / 2, r = i % 2 ? 13 : 32; g.lineTo(128 + Math.cos(a) * r, 92 + Math.sin(a) * r); } g.closePath(); g.fill(); g.stroke();
  return c;
}
/**
 * makeBanner(colour='red', {height=0.9, width=0.3, seed=1}) -> THREE.Group, origin at the foot (stands on table or map).
 * Walnut pole with brass finial and cross-bar, swallow-tailed cloth (sheen fabric, woven texture, gold border,
 * original chevron-and-star device). userData.update(t) makes the cloth ripple; userData.cloth is the mesh.
 */
export function makeBanner(colour = 'red', o = {}) {
  const m = mats(), pc = pcol(colour);
  const H = o.height ?? 0.9, Wc = o.width ?? H * 0.33, Hc = o.clothHeight ?? H * 0.5, seed = o.seed ?? 1;
  const g = new THREE.Group(); g.userData.kind = 'banner';
  const pr = Math.max(0.006, H * 0.012);
  g.add(cylM(pr, pr * 1.15, H, m.walnutRep, 0, H / 2, 0, 10));
  const fin = new THREE.Mesh(new THREE.SphereGeometry(pr * 2, 14, 10), m.brass); fin.position.y = H + pr; g.add(fin);
  const sp = new THREE.Mesh(new THREE.ConeGeometry(pr * 1.1, pr * 5, 10), m.brass); sp.position.y = H + pr * 4.5; g.add(sp);
  const bar = cylM(pr * 0.7, pr * 0.7, Wc + pr * 6, m.walnutRep, 0, H - pr * 3, 0.0, 8); bar.rotation.z = Math.PI / 2; g.add(bar);
  for (const s of [-1, 1]) { const k = new THREE.Mesh(new THREE.SphereGeometry(pr * 1.1, 10, 8), m.brass); k.position.set(s * (Wc / 2 + pr * 3), H - pr * 3, 0); g.add(k); }
  if (o.foot !== false) g.add(latheM([[0, 0], [H * 0.075, 0], [H * 0.08, H * 0.008], [H * 0.07, H * 0.025], [H * 0.02, H * 0.03], [0, H * 0.03]], m.walnut, 24));
  const sx = 12, sy = 16; const geo = new THREE.PlaneGeometry(Wc, Hc, sx, sy); geo.translate(0, -Hc / 2, 0);
  const p = geo.attributes.position, base = new Float32Array(p.array);
  for (let i = 0; i < p.count; i++) { // swallow-tail: the bottom edge rises towards the middle
    const x = base[i * 3], y = base[i * 3 + 1], f = -y / Hc; const bottom = 1 - 0.22 * (1 - Math.abs(x) / (Wc / 2));
    base[i * 3 + 1] = -f * bottom * Hc;
  }
  p.array.set(base); geo.computeVertexNormals();
  const tex = canvasTex(emblemCanvas(pc, seed), true); tex.wrapS = tex.wrapT = THREE.ClampToEdgeWrapping;
  const cloth = new THREE.Mesh(geo, new THREE.MeshPhysicalMaterial({ map: tex, roughness: 0.82, sheen: 1, sheenColor: new THREE.Color(pc).lerp(new THREE.Color(0xffe0b0), 0.5), sheenRoughness: 0.45, side: THREE.DoubleSide }));
  cloth.position.set(0, H - pr * 3.5, 0); cloth.castShadow = true; cloth.receiveShadow = true; g.add(cloth);
  shadowAll(g);
  const ph = seed * 1.7;
  g.userData.cloth = cloth;
  g.userData.update = (t) => {
    for (let i = 0; i < p.count; i++) {
      const x = base[i * 3], y = base[i * 3 + 1], f = -y / Hc;
      const z = (0.035 * Math.sin(x / Wc * 7 - t * 2.1 + ph + f * 2.5) + 0.02 * Math.sin(t * 1.3 + ph + x / Wc * 3)) * f * Hc;
      p.setXYZ(i, x + 0.01 * Math.sin(t * 1.7 + ph + f * 3) * f * Hc, y, z);
    }
    p.needsUpdate = true; geo.computeVertexNormals();
  };
  g.userData.update(0);
  return g;
}

/* ======================================================================
   Resource props
   ====================================================================== */
function burlapCanvas(seed) {
  const S = 256, c = makeCanvas(S), g = c.getContext('2d'), d = g.createImageData(S, S), N = makeNoise2D(seed), rnd = mulberry32(seed);
  for (let y = 0; y < S; y++) for (let x = 0; x < S; x++) {
    const wx = 0.5 + 0.5 * Math.sin(x * Math.PI / 2.0 + N(x / 30, y / 6) * 1.5), wy = 0.5 + 0.5 * Math.sin(y * Math.PI / 2.0 + N(x / 6, y / 30) * 1.5);
    const over = ((x >> 1) + (y >> 1)) % 2 ? wx : wy;
    const t = clamp01(0.45 + 0.35 * over + 0.2 * N.fbm(x / 40, y / 40, 3) + (rnd() - 0.5) * 0.08);
    const i = (y * S + x) * 4; d.data[i] = lerp(112, 186, t); d.data[i + 1] = lerp(88, 154, t); d.data[i + 2] = lerp(56, 104, t); d.data[i + 3] = 255;
  }
  g.putImageData(d, 0, 0); return c;
}
function ringsCanvas(seed, light = [190, 146, 96], dark = [128, 86, 50]) {
  const S = 256, c = makeCanvas(S), g = c.getContext('2d'), d = g.createImageData(S, S), N = makeNoise2D(seed);
  for (let y = 0; y < S; y++) for (let x = 0; x < S; x++) {
    const dx = x / S - 0.5 + 0.03, dy = y / S - 0.5, r = Math.hypot(dx, dy) * 2;
    const w = r + 0.05 * N(dx * 6, dy * 6);
    const ring = 0.5 + 0.5 * Math.sin(w * 70), t = clamp01(0.55 + 0.35 * ring - 0.25 * r + 0.1 * N(x / 20, y / 20));
    const bark = smooth(0.9, 0.95, r);
    const i = (y * S + x) * 4;
    for (let k = 0; k < 3; k++) d.data[i + k] = lerp(lerp(dark[k], light[k], t), [52, 36, 24][k], bark);
    d.data[i + 3] = 255;
  }
  g.putImageData(d, 0, 0);
  const rnd = mulberry32(seed + 1); g.strokeStyle = 'rgba(60,36,18,0.6)'; g.lineWidth = 1.4;
  for (let i = 0; i < 3; i++) { const a = rnd() * 6.28; g.beginPath(); g.moveTo(S / 2 + Math.cos(a) * S * 0.12, S / 2 + Math.sin(a) * S * 0.12); g.lineTo(S / 2 + Math.cos(a + 0.05) * S * 0.46, S / 2 + Math.sin(a + 0.05) * S * 0.46); g.stroke(); }
  return c;
}
function coinCanvas() {
  const S = 256, c = makeCanvas(S), g = c.getContext('2d');
  g.fillStyle = '#6a6a6a'; g.fillRect(0, 0, S, S);
  g.fillStyle = '#d0d0d0'; g.beginPath(); g.arc(128, 128, 124, 0, 6.29); g.fill();
  g.fillStyle = '#909090'; g.beginPath(); g.arc(128, 128, 104, 0, 6.29); g.fill();
  g.fillStyle = '#c8c8c8'; for (let i = 0; i < 28; i++) { const a = i / 28 * 6.283; g.beginPath(); g.arc(128 + Math.cos(a) * 92, 128 + Math.sin(a) * 92, 4, 0, 6.29); g.fill(); }
  g.beginPath(); for (let i = 0; i < 12; i++) { const a = i / 12 * 6.283 - Math.PI / 2, r = i % 2 ? 26 : 62; g.lineTo(128 + Math.cos(a) * r, 128 + Math.sin(a) * r); } g.closePath(); g.fillStyle = '#e0e0e0'; g.fill();
  return c;
}
let _pm = null;
function propMats() {
  if (_pm) return _pm;
  const burlap = burlapCanvas(4);
  const bark = noiseCanvas(256, 256, 21, { sx: 3, sy: 30, lo: 40, hi: 120 });
  { const g = bark.getContext('2d'); const l = linesCanvas(256, 256, 22, { base: 0, n: 260, len: [20, 90], vertical: true, alpha: 0.6, width: [1, 2.5] }); g.globalCompositeOperation = 'multiply'; g.globalAlpha = 0.5; g.drawImage(l, 0, 0); }
  const barkCol = (() => { const c = makeCanvas(256), g = c.getContext('2d'); g.fillStyle = '#3d2a1c'; g.fillRect(0, 0, 256, 256); g.globalCompositeOperation = 'multiply'; g.drawImage(bark, 0, 0); g.globalCompositeOperation = 'screen'; g.globalAlpha = 0.35; g.drawImage(bark, 0, 0); return c; })();
  const coin = coinCanvas();
  const granite = (() => { const c = noiseCanvas(256, 256, 31, { sx: 10, sy: 10, lo: 120, hi: 175 }), g = c.getContext('2d'), rnd = mulberry32(32);
    for (let i = 0; i < 2200; i++) { const v = rnd() < 0.5 ? 60 : 215; g.fillStyle = `rgba(${v},${v},${v},${0.25 + rnd() * 0.4})`; g.fillRect(rnd() * 256, rnd() * 256, 1 + rnd() * 2, 1 + rnd() * 2); }
    g.strokeStyle = 'rgba(70,70,70,0.35)'; for (let i = 0; i < 40; i++) { const x = rnd() * 256, y = rnd() * 256; g.lineWidth = 0.8; g.beginPath(); g.moveTo(x, y); g.lineTo(x + 6 + rnd() * 10, y + (rnd() - 0.5) * 3); g.stroke(); }
    return c; })();
  _pm = {
    burlap: new THREE.MeshPhysicalMaterial({ map: canvasTex(burlap, true, [3, 2]), bumpMap: canvasTex(burlap, false, [3, 2]), bumpScale: 2.2, roughness: 0.97, sheen: 0.5, sheenColor: new THREE.Color(0xd8b98a), sheenRoughness: 0.8 }),
    rope: new THREE.MeshStandardMaterial({ color: 0x6b5233, roughness: 0.95 }),
    grain: new THREE.MeshStandardMaterial({ color: 0xc9a25a, roughness: 0.85, bumpMap: canvasTex(noiseCanvas(128, 128, 41, { sx: 40, sy: 40, oct: 2 }), false, [2, 2]), bumpScale: 3 }),
    bark: new THREE.MeshPhysicalMaterial({ map: canvasTex(barkCol, true, [2, 1]), bumpMap: canvasTex(bark, false, [2, 1]), bumpScale: 3.5, roughness: 0.95 }),
    ends: [0, 1, 2].map((i) => new THREE.MeshPhysicalMaterial({ map: canvasTex(ringsCanvas(50 + i), true), roughness: 0.8, bumpMap: canvasTex(ringsCanvas(50 + i), false), bumpScale: 1.0 })),
    gold: new THREE.MeshPhysicalMaterial({ color: 0xd4a548, metalness: 1, roughness: 0.3, bumpMap: canvasTex(coin, false), bumpScale: 1.6, clearcoat: 0.2, clearcoatRoughness: 0.3 }),
    goldEdge: new THREE.MeshPhysicalMaterial({ color: 0xc9983f, metalness: 1, roughness: 0.38, bumpMap: canvasTex(linesCanvas(64, 64, 3, { n: 120, len: [64, 64], alpha: 0.9 }), false, [8, 1]), bumpScale: 1 }),
    stone: new THREE.MeshPhysicalMaterial({ color: 0xa49e92, map: canvasTex(granite, true, [1, 1]), roughness: 0.88, bumpMap: canvasTex(granite, false, [1, 1]), bumpScale: 2.2 }),
  };
  return _pm;
}
function sackMesh(pm, h, r, seed, open = false) {
  const prof = open
    ? [[0, 0], [r * 0.7, 0], [r * 0.95, 0.03], [r * 1.08, h * 0.3], [r * 1.05, h * 0.6], [r * 0.95, h * 0.82], [r * 1.02, h * 0.9], [r * 0.9, h * 0.93], [r * 0.82, h * 0.86]]
    : [[0, 0], [r * 0.7, 0], [r * 0.95, 0.03], [r * 1.08, h * 0.3], [r * 1.05, h * 0.55], [r * 0.85, h * 0.74], [r * 0.45, h * 0.84], [r * 0.3, h * 0.87], [r * 0.36, h * 0.91], [r * 0.55, h * 0.98], [r * 0.4, h * 1.02], [0, h * 0.99]];
  const geo = new THREE.LatheGeometry(prof.map(([a, b]) => new THREE.Vector2(a, b)), 40);
  const p = geo.attributes.position, N = makeNoise2D(seed);
  for (let i = 0; i < p.count; i++) {
    let x = p.getX(i), y = p.getY(i), z = p.getZ(i); const a = Math.atan2(z, x), rr = Math.hypot(x, z); if (rr < 1e-5) continue;
    const k = 1 + 0.07 * N(Math.cos(a) * 2 + seed, y / h * 3) + 0.04 * N(Math.cos(a) * 6, y / h * 8 + 5);
    x *= k; z *= k; x += 0.12 * h * Math.pow(y / h, 2) * (0.5 + 0.5 * N(seed, 1)); // slump
    p.setXYZ(i, x, y * (1 - 0.06 * Math.max(0, Math.cos(a - seed))), z);
  }
  geo.computeVertexNormals();
  const g = new THREE.Group(); g.add(new THREE.Mesh(geo, pm.burlap));
  if (open) { const d = new THREE.Mesh(new THREE.SphereGeometry(r * 0.85, 24, 8, 0, Math.PI * 2, 0, 0.5), pm.grain); d.scale.y = 0.5; d.position.set(0.12 * h * 0.81 * 0.75, h * 0.8, 0); g.add(d); }
  else { const t = new THREE.Mesh(new THREE.TorusGeometry(r * 0.34, 0.009, 6, 24), pm.rope); t.rotation.x = Math.PI / 2; t.position.set(0.12 * h * 0.76 * 0.75, h * 0.875, 0); g.add(t); }
  return g;
}
/**
 * makeProp(type, {seed=1}) -> THREE.Group, origin at the floor centre (~0.45-0.7 units across).
 *   'food'  : three burlap grain sacks (one open, full of grain), tied with rope
 *   'wood'  : a stack of six bark-covered logs with ringed, cracked end grain
 *   'gold'  : three stacks of embossed gold coins + loose coins
 *   'stone' : four rough-cut granite blocks
 */
export function makeProp(type, o = {}) {
  const pm = propMats(), seed = o.seed ?? 1, rnd = mulberry32(seed * 17 + 3);
  const g = new THREE.Group(); g.userData = { kind: 'prop', type };
  if (type === 'food') {
    const a = sackMesh(pm, 0.34, 0.12, 1, false); a.position.set(-0.08, 0, -0.04); a.rotation.y = 0.4; g.add(a);
    const b = sackMesh(pm, 0.27, 0.11, 2, true); b.position.set(0.16, 0, 0.06); b.rotation.y = 2.4; g.add(b);
    const c = sackMesh(pm, 0.3, 0.115, 3, false); c.position.set(0.02, 0, 0.2); c.rotation.y = -1.2; g.add(c);
  } else if (type === 'wood') {
    const r = 0.055, rows = [[-2, 0], [0, 0], [2, 0], [-1, 1], [1, 1], [0, 2]];
    rows.forEach(([zi, yi], i) => {
      const rr = r * (0.92 + rnd() * 0.16), len = 0.48 + rnd() * 0.1;
      const geo = new THREE.CylinderGeometry(rr, rr * 0.97, len, 18, 1);
      const log = new THREE.Mesh(geo, [pm.bark, pm.ends[i % 3], pm.ends[(i + 1) % 3]]);
      log.rotation.z = Math.PI / 2; log.rotation.x = rnd() * 6;
      log.position.set((rnd() - 0.5) * 0.06, r + yi * r * Math.sqrt(3), zi * r * 1.02);
      g.add(log);
    });
  } else if (type === 'gold') {
    const coin = new THREE.CylinderGeometry(0.048, 0.048, 0.011, 36, 1);
    const stacks = [[0, 0, 11], [0.105, 0.03, 7], [0.03, 0.105, 4]], loose = 8;
    const total = stacks.reduce((s, q) => s + q[2], 0) + loose;
    const im = new THREE.InstancedMesh(coin, [pm.goldEdge, pm.gold, pm.gold], total);
    const M = new THREE.Matrix4(), Q = new THREE.Quaternion(), E = new THREE.Euler(), S = new THREE.Vector3(1, 1, 1), P = new THREE.Vector3();
    let n = 0;
    for (const [x, z, h] of stacks) for (let i = 0; i < h; i++) {
      E.set((rnd() - 0.5) * 0.04, rnd() * 6, (rnd() - 0.5) * 0.04); Q.setFromEuler(E); P.set(x + (rnd() - 0.5) * 0.008, 0.0055 + i * 0.0112, z + (rnd() - 0.5) * 0.008);
      im.setMatrixAt(n++, M.compose(P, Q, S));
    }
    for (let i = 0; i < loose; i++) {
      const a = rnd() * 6.28, d = 0.12 + rnd() * 0.12; const lean = i < 2;
      E.set(lean ? 0.5 + rnd() * 0.3 : (rnd() - 0.5) * 0.06, rnd() * 6, 0); Q.setFromEuler(E);
      P.set(Math.cos(a) * d + 0.04, lean ? 0.022 : 0.0055 + (i % 3 === 2 ? 0.011 : 0), Math.sin(a) * d + 0.04);
      im.setMatrixAt(n++, M.compose(P, Q, S));
    }
    g.add(im);
  } else if (type === 'stone') {
    const blocks = [[-0.12, 0, 0, 0.25, 0.12, 0.15, 0.1, 0], [0.13, 0, 0.02, 0.22, 0.11, 0.15, -0.15, 0], [0.0, 0.12, 0.0, 0.24, 0.11, 0.14, 1.4, 0], [0.05, 0, 0.2, 0.14, 0.09, 0.1, 0.6, 0.0]];
    for (const [x, y, z, w, h, d, ry] of blocks) {
      const geo = new RoundedBoxGeometry(w, h, d, 3, 0.012); const p = geo.attributes.position, N = makeNoise2D(Math.floor(rnd() * 1000));
      for (let i = 0; i < p.count; i++) { const vx = p.getX(i), vy = p.getY(i), vz = p.getZ(i); const k = 0.006 * N(vx * 30, vy * 30 + vz * 30); p.setXYZ(i, vx + Math.sign(vx) * k, vy + Math.sign(vy) * k, vz + Math.sign(vz) * k); }
      geo.computeVertexNormals();
      const b = new THREE.Mesh(geo, pm.stone); b.position.set(x, y + h / 2, z); b.rotation.y = ry; g.add(b);
    }
  } else throw new Error('makeProp: unknown type ' + type);
  shadowAll(g);
  return g;
}

/* ======================================================================
   Tokens: carved & painted wooden standees on turned bases
   Each unit is painted on a canvas (design space 100 x 100, y down, base top at y 89.2); the same drawing
   rendered as a mask is traced into the cut-out outline (holes included) and extruded with a bevel.
   ====================================================================== */
const TK = { GY: 89.2, MR: 400, K: 0.0075, T: 0.056, BEV: 0.006 };
function painter(g, mask, pc) {
  const INKC = 'rgba(36,23,13,0.72)';
  const shadeClip = (pts, o) => {
    let x0 = 1e9, y0 = 1e9, x1 = -1e9, y1 = -1e9; for (const [x, y] of pts) { x0 = Math.min(x0, x); y0 = Math.min(y0, y); x1 = Math.max(x1, x); y1 = Math.max(y1, y); }
    g.save(); blobPath(g, pts); g.clip();
    const gr = g.createLinearGradient(0, y0, 0, y1);
    gr.addColorStop(0, `rgba(255,238,204,${o.hi ?? 0.18})`); gr.addColorStop(0.42, 'rgba(255,238,204,0)'); gr.addColorStop(0.58, 'rgba(22,11,4,0)'); gr.addColorStop(1, `rgba(22,11,4,${o.lo ?? 0.36})`);
    g.fillStyle = gr; g.fillRect(x0 - 1, y0 - 1, x1 - x0 + 2, y1 - y0 + 2);
    const gx = g.createLinearGradient(x0, 0, x1, 0); gx.addColorStop(0, 'rgba(255,238,204,0.07)'); gx.addColorStop(1, 'rgba(22,11,4,0.16)');
    g.fillStyle = gx; g.fillRect(x0 - 1, y0 - 1, x1 - x0 + 2, y1 - y0 + 2);
    g.restore();
  };
  const P = {
    shape(pts, col, o = {}) {
      blobPath(g, pts); g.fillStyle = mask ? '#000' : col; g.fill();
      if (mask) return;
      if (o.shade !== false) shadeClip(pts, o);
      if (o.ink !== 0) { blobPath(g, pts); g.lineWidth = o.ink ?? 0.4; g.strokeStyle = INKC; g.lineJoin = 'round'; g.stroke(); }
    },
    limb(pts, w0, w1, col, o) { P.shape(limbPoly(pts, w0, w1), col, o); },
    ellipse(x, y, rx, ry, col, o) { P.shape(Array.from({ length: 14 }, (_, i) => { const a = i / 14 * Math.PI * 2; return [x + Math.cos(a) * rx, y + Math.sin(a) * ry]; }), col, o); },
    line(pts, w = 0.4, col = INKC) {
      if (mask) return; g.lineCap = 'round'; g.lineJoin = 'round'; g.strokeStyle = col; g.lineWidth = w;
      if (pts.length > 2) blobPath(g, pts, false); else { g.beginPath(); g.moveTo(pts[0][0], pts[0][1]); g.lineTo(pts[1][0], pts[1][1]); }
      g.stroke();
    },
    dot(x, y, r, col = INKC) { if (mask) return; g.fillStyle = col; g.beginPath(); g.arc(x, y, r, 0, Math.PI * 2); g.fill(); },
    plinth(x0, x1) {
      P.shape([[x0, 97, 1], [x0, 90.6], [x0 + 1.5, 88.6], [(x0 + x1) / 2, 88.2], [x1 - 1.5, 88.6], [x1, 90.6], [x1, 97, 1]], '#5a4f33', { hi: 0.12, lo: 0.25 });
      if (mask) return; const r = mulberry32(Math.round(x0 * 7 + x1));
      for (let x = x0 + 1.5; x < x1 - 1.5; x += 1.6 + r() * 1.4) P.line([[x, 89.4], [x + (r() - 0.3) * 1.2, 87.2 + r() * 1.3]], 0.45, r() < 0.5 ? '#76804a' : '#5f6a3a');
    },
    pc: css(pc), pcL: css(pc, 0.12), pcD: css(pc, -0.3),
  };
  return P;
}
const COL = { skin: '#c99c76', linen: '#cdbf9e', wool: '#6c5942', woolD: '#56462f', leather: '#5a3b22', leatherL: '#7a5534', steel: '#8e908e', steelD: '#5d5f5e', gold: '#b8903c', trousers: '#4b3c2b', wood: '#6b4a2c', straw: '#c6a359' };
function drawHorse(P, o) {
  const coat = o.coat, coatD = o.coatD, mane = o.mane;
  P.limb([[66, 60], [64, 73], [66, 86]], 5.5, 3, coatD);                       // far fore
  P.limb([[34, 60], [37.5, 72], [34.5, 86]], 6.5, 3, coatD);                   // far hind
  for (const x of [66, 34.5]) P.shape([[x - 2, 85.4], [x + 2.2, 85.4], [x + 2.8, 89, 1], [x - 2.4, 89, 1]], '#2a1e16', { shade: false });
  P.shape([[25, 49], [19, 54], [15.5, 63], [15, 73], [18, 77.5], [20.5, 70], [21.5, 61], [25.5, 55]], mane);                       // tail
  P.shape([[27, 47], [36, 44.5], [47, 46], [58, 44], [66, 43], [71, 47], [73, 54], [71, 61], [64, 65], [52, 66.5], [40, 66], [31, 63], [25, 57], [24, 51]], coat); // body
  P.limb([[69, 59], [70, 73], [71, 86]], 6, 3, coat);                           // near fore
  P.limb([[29, 57], [26, 69.5], [29.5, 78], [30.5, 86]], 8.5, 3.2, coat);       // near hind
  for (const x of [71, 30.5]) P.shape([[x - 2, 85.4], [x + 2.2, 85.4], [x + 2.8, 89, 1], [x - 2.4, 89, 1]], '#2a1e16', { shade: false });
  if (o.caparison) o.caparison();
  P.shape([[62, 48], [64, 39], [68, 31], [72, 25], [76, 21], [80, 21], [84, 24], [89, 30], [93, 35], [93.5, 38], [91, 40], [86, 39.5], [81, 37.5], [78.5, 37], [75.5, 42.5], [73.5, 50], [68, 52]], coat); // neck + head
  P.shape([[75.5, 22.5], [76.5, 14.5, 1], [79.5, 21.5]], coat);                // ear
  P.shape([[63, 45], [63.6, 37], [67.5, 29], [72.5, 23], [76.5, 19.5], [74.5, 25], [70.5, 31], [67.5, 38], [66.5, 46]], mane, { lo: 0.2 });
  P.line([[64, 40], [66, 33]], 0.3); P.line([[67, 38], [69.5, 31]], 0.3);
  P.dot(82.6, 27, 0.9); P.dot(91.6, 35.6, 0.6);
  P.line([[90, 38.4], [92.8, 37.4]], 0.35);
  P.line([[80, 22], [87.5, 35.5]], 0.5, '#3a2618'); P.line([[83.5, 30], [80, 36]], 0.5, '#3a2618'); // bridle
  if (o.chanfron) P.shape([[78, 21.5], [85, 24], [91.5, 32.5], [89.5, 34.5], [82, 28.5], [77, 24.5]], COL.steel, { ink: 0.35 });
}
function saddle(P, pc) {
  P.shape([[42, 45.5], [57, 45], [58, 55], [42.5, 56]], pc.pcD, { shade: false, ink: 0.35 });
  P.shape([[44, 45.2], [54, 44.8], [56.5, 47.5], [55, 52.5], [45, 53], [42.5, 49]], COL.leather);
  P.line([[52, 53], [53, 64]], 0.7, '#3a2618');
}
function drawScout(P) {
  P.plinth(17, 92);
  drawHorse(P, { coat: '#7a4a2c', coatD: '#5c3820', mane: '#2b1f17' });
  saddle(P, P);
  P.shape([[51, 26.5], [44, 27], [36, 30.5], [29.5, 36], [26.5, 41.5], [33, 39.5], [39, 37.5], [45, 38.5], [47.5, 32.5]], P.pc);     // cloak streaming
  P.shape([[45, 44.5], [44.5, 36], [47, 29], [52, 26], [57, 27.5], [58, 33], [57, 40], [55, 45.5]], COL.linen);                    // tunic
  P.line([[45.2, 40], [57.4, 39.6]], 0.8, COL.leather);
  P.shape([[44.5, 43.5], [40, 46], [38.6, 49.6], [41.2, 48.4], [45.4, 46.2]], '#d9cdb0', { ink: 0.35 });                             // horn
  P.limb([[49, 43], [56, 51], [54, 60]], 6, 4.2, COL.trousers);
  P.shape([[51.5, 57.5], [56.5, 57.5], [59.5, 61], [51.5, 62.2]], COL.leather);
  P.limb([[55, 30], [60, 35.5], [65, 37]], 4, 3, COL.linen);
  P.ellipse(66, 37, 1.7, 1.6, COL.skin, { ink: 0.35 });
  P.line([[66, 37], [79, 35], [88, 37.5]], 0.45, '#3a2618');
  P.ellipse(54.5, 20.8, 4.1, 4.5, COL.skin);
  P.shape([[49.8, 20.5], [50.8, 15.6], [55, 13.8], [59.2, 15.8], [59.8, 19.4], [56.6, 18.2], [52, 19.6]], P.pcD);                   // felt cap
  P.shape([[58.4, 20.4], [60.4, 22.6], [58.4, 23.2]], COL.skin, { shade: false, ink: 0.3 });
  P.dot(57, 20.6, 0.55);
}
function drawKnight(P) {
  P.plinth(17, 92);
  drawHorse(P, {
    coat: '#8e8a82', coatD: '#6d6a63', mane: '#3b3631', chanfron: true,
    caparison: () => {
      const pts = [[24, 46], [34, 42.5], [46, 44.5], [60, 42], [69, 43.5], [74, 50], [74, 62], [71, 70, 1], [67, 67], [63, 71, 1], [59, 67], [55, 71, 1], [51, 67], [47, 71, 1], [43, 67], [39, 71, 1], [35, 67], [31, 71, 1], [27, 67], [23, 62], [22, 54]];
      P.shape(pts, P.pc, { lo: 0.42 });
      P.line(pts.slice(7, 20).map(([x, y]) => [x, y - 1.6]), 0.9, COL.gold);
      P.line([[47, 46], [46, 66]], 0.35); P.line([[36, 45], [34, 65]], 0.35); P.line([[61, 44], [62, 66]], 0.35);
    },
  });
  P.limb([[56, 58], [66.6, 5]], 2.3, 1.5, COL.wood);                                                                                 // lance
  P.shape([[65.9, 6], [66.8, 1.2, 1], [67.7, 6]], COL.steel, { ink: 0.3 });
  P.shape([[66.3, 7], [77, 9], [72.6, 11], [77, 13], [66.2, 14.4]], P.pc, { ink: 0.35 });                                         // pennant
  P.shape([[45, 45], [45, 34], [47, 27], [52, 24.5], [57, 25.5], [59, 31], [58, 40], [56, 46]], P.pcL);                             // surcoat
  P.limb([[49, 44], [56, 51], [55, 60]], 6, 4.2, COL.steel);
  P.shape([[52, 57.5], [57.5, 57.5], [60.5, 61], [52, 62.2]], COL.steelD);
  P.shape([[56.5, 36.5], [62.5, 33.5], [63.6, 38.5], [58.6, 40.2]], COL.steel, { ink: 0.35 });                                     // vamplate
  P.limb([[55, 29], [58, 34], [60.5, 36]], 4, 3.4, COL.steel);
  P.shape([[41.5, 30], [52, 29], [52.5, 38], [47.5, 49.5, 1], [42.5, 39]], P.pc, { lo: 0.45 });                                     // kite shield
  P.line([[43, 38.5], [47.2, 33.5], [51.6, 38.3]], 1.6, COL.gold);
  P.line([[41.8, 30.6], [51.7, 29.6]], 0.8, COL.gold);
  P.shape([[50, 22.5], [50, 13], [52, 10.2], [57, 10], [59.2, 12], [59.6, 22], [54.6, 23.6]], COL.steel);                            // great helm
  P.line([[51.2, 16.6], [59.2, 16.4]], 0.9, '#1d1712');
  P.line([[55, 10.4], [55, 23.2]], 0.4);
  P.shape([[52.6, 10.4], [50, 4.8], [54, 2.8], [58, 5.6], [56.4, 10.4]], P.pcD, { ink: 0.35 });                                    // crest
}
function drawVillager(P) {
  P.plinth(31, 70);
  P.limb([[46, 64], [45.5, 77], [45, 87]], 5.5, 4, '#45372a'); P.limb([[54, 64], [55, 77], [56, 87]], 5.5, 4, COL.trousers);
  P.shape([[41.6, 85.5], [47.4, 85.5], [48.4, 89, 1], [40.8, 89, 1]], COL.leather); P.shape([[53, 85.5], [58.6, 85.5], [60.2, 89, 1], [53, 89, 1]], COL.leather);
  P.limb([[43, 39], [38.5, 49], [37.5, 57]], 4.6, 3.6, COL.linen);
  P.shape([[41, 40], [44, 34.5], [50, 33], [56, 34.5], [59.5, 40], [60.5, 55], [63, 69], [50, 71], [37, 69], [39.5, 55]], P.pc);  // tunic
  P.shape([[39.6, 52.4], [60.6, 52.4], [60.9, 55.2], [39.3, 55.2]], COL.leather, { shade: false, ink: 0.3 });
  P.line([[47, 57], [46, 69.5]], 0.35); P.line([[54, 57], [55.5, 69.5]], 0.35);
  // basket of apples on the hip
  P.ellipse(34, 55.4, 2.3, 2.1, '#8c3524'); P.ellipse(38.2, 54.6, 2.4, 2.2, '#a4492a'); P.ellipse(41.8, 55.4, 2.1, 2, '#7c8a3a');
  P.shape([[30, 56], [44.5, 56], [43, 67], [31.5, 67]], '#9b7543');
  for (const y of [59, 62, 65]) P.line([[30.6 + (y - 56) * 0.13, y], [44 - (y - 56) * 0.13, y]], 0.3);
  for (let x = 33; x < 43; x += 2.4) P.line([[x, 56.4], [x + 0.3, 66.6]], 0.25);
  P.ellipse(37.4, 57.4, 1.8, 1.6, COL.skin, { ink: 0.35 });
  // axe over the right shoulder
  P.limb([[64, 58], [52.5, 35], [46.5, 22]], 2.2, 2, COL.wood);
  P.shape([[42.4, 17], [47.6, 18.6], [49.2, 22.2], [46.6, 27.8], [43.2, 24.6], [41.6, 21]], COL.steel, { ink: 0.4 });
  P.limb([[57, 38], [61, 43.5], [58.5, 46.5]], 4.5, 3.5, COL.linen);
  P.ellipse(58.4, 46, 1.8, 1.7, COL.skin, { ink: 0.35 });
  P.shape([[48, 34], [52.6, 34], [52.6, 30], [48, 30]], COL.skin, { ink: 0.3, shade: false });
  P.ellipse(50.6, 27, 4.3, 4.6, COL.skin);
  P.shape([[54.4, 26], [56.2, 28.6], [54.3, 29.2]], COL.skin, { shade: false, ink: 0.3 });
  P.dot(53.2, 26, 0.55);
  P.shape([[46.4, 25], [47.2, 22.4], [53, 22], [51.6, 24], [48.2, 26.2], [47.2, 29]], '#4a3322', { ink: 0.3 });
  P.shape([[45.6, 24], [46.6, 18], [50.6, 16], [54.6, 18], [55.6, 24]], COL.straw);                                                   // hat crown
  P.line([[45.9, 22.4], [55.3, 22.4]], 0.9, '#6d4b25');
  P.ellipse(50.6, 24.2, 11.2, 2.4, COL.straw, { lo: 0.3 });                                                                          // hat brim
  for (let x = 41; x < 61; x += 2.2) P.line([[x, 23.2], [x + 0.8, 25.4]], 0.25, '#8a6a32');
}
function drawArcher(P) {
  P.plinth(29, 73);
  P.shape([[33, 24], [38.6, 21.6], [44, 41], [39, 43.6]], COL.leather);                                                               // quiver
  P.shape([[32, 24.4], [30.6, 17.2], [33.4, 19.2], [35, 14.8], [36.6, 19.4], [38.4, 16.4], [38.8, 22.2]], '#d9d0b8', { ink: 0.35 });  // fletchings
  P.limb([[49, 62], [53, 75], [56, 87]], 6, 4, '#43362a'); P.limb([[43, 62], [40, 75], [37, 87]], 6, 4, COL.trousers);
  P.shape([[33, 85.5], [38.6, 85.5], [39.4, 89, 1], [32.2, 89, 1]], COL.leather); P.shape([[54, 85.5], [59.6, 85.5], [61.2, 89, 1], [54, 89, 1]], COL.leather);
  P.shape([[38, 35], [42, 31], [49, 30], [54, 33.5], [55.5, 46], [57.5, 64], [47, 66.5], [36.5, 64], [37.5, 47]], P.pc);           // gambeson
  P.line([[37.6, 49], [55.8, 49]], 0.9, COL.leather);
  for (const x of [44, 50]) P.line([[x, 34], [x - 0.6, 64.5]], 0.3);
  P.ellipse(48.6, 23.6, 4.2, 4.5, COL.skin);
  P.dot(51.4, 22.8, 0.5);
  P.shape([[43, 25], [43.5, 19.5], [48, 16], [53, 18], [54.6, 23], [52.6, 21.6], [49.4, 19.8], [46, 21.6], [46, 27], [47, 31], [42, 31], [35.5, 30.5, 1], [40, 27]], COL.woolD);  // hood + liripipe
  // bow (two tapered limbs from the grip), string, arrow
  P.limb([[68.6, 40], [67.2, 26], [61, 12]], 2.8, 1.5, '#6b4526');
  P.limb([[68.6, 40], [67.2, 54], [61, 68]], 2.8, 1.5, '#6b4526');
  P.limb([[61.2, 12.6], [61.2, 67.4]], 1.6, 1.6, '#d6ccb0', { ink: 0.2, shade: false });
  P.limb([[52, 33], [60, 37], [67, 40]], 4.2, 3.4, COL.linen);
  P.ellipse(68.2, 40, 2, 2.2, COL.skin, { ink: 0.35 });
  P.limb([[55.5, 36], [74.5, 36.6]], 1.3, 1.3, '#7a5a36', { ink: 0.25, shade: false });
  P.shape([[73.8, 34.6], [78, 36.7, 1], [73.8, 38.6]], COL.steel, { ink: 0.3 });
  P.shape([[55, 34.4], [58.4, 35.2], [58.4, 37.2], [55, 38]], '#d9d0b8', { ink: 0.25, shade: false });
  P.limb([[50, 33], [54, 31], [57.4, 35.4]], 4.2, 3.4, COL.linen);
  P.ellipse(57.6, 36, 1.8, 1.8, COL.skin, { ink: 0.35 });
}
function drawMonk(P) {
  P.plinth(27, 70);
  P.limb([[31, 88], [31.5, 40], [32, 14]], 2.4, 2.1, COL.wood);                                                                      // crook
  P.limb([[32, 15], [32.4, 9], [35.4, 6], [39, 7.4], [39.6, 11.2]], 2.2, 1.8, COL.wood);
  P.shape([[42.5, 34], [50, 31.5], [57.5, 34], [60.5, 50], [63, 70], [66, 88.4], [50, 89.6], [34, 88.4], [37, 70], [39.5, 50]], COL.wool);
  P.shape([[47, 35], [53, 35], [54, 86.4, 1], [46, 86.4, 1]], P.pc, { lo: 0.3 });                                                       // scapular
  for (const [a, b] of [[[42, 58], [38, 86.5]], [[58, 58], [62, 86.5]], [[44.4, 62], [43.2, 87.5]], [[56, 63], [57.2, 87.5]]]) P.line([a, b], 0.35);
  P.line([[39.5, 52], [60.5, 52]], 1.1, '#c2ab78'); P.line([[52.4, 52], [53, 63]], 0.8, '#c2ab78'); P.dot(53, 63.4, 0.9, '#c2ab78');
  P.shape([[43, 44], [57, 44], [58, 50.4], [42, 50.4]], COL.woolD);
  P.shape([[46, 41.6], [54, 41.6], [54.6, 47], [45.4, 47]], '#5e2b22', { ink: 0.35 });
  P.dot(50, 44.3, 0.8, COL.gold);
  P.shape([[40.5, 37], [45, 31.5], [50, 30.5], [55, 31.5], [59.5, 37], [55, 40], [50, 38.5], [45, 40]], COL.woolD);                   // cowl
  P.ellipse(50, 24, 4.6, 5, COL.skin);
  P.shape([[45.4, 24], [46, 20.4], [47.4, 22.4], [52.6, 22.4], [54, 20.4], [54.6, 24], [53.8, 26.4], [52.6, 23.6], [47.4, 23.6], [46.2, 26.4]], '#5a4632', { ink: 0.3 });
  P.dot(52.4, 24.8, 0.55);
  P.limb([[42, 38], [36, 43], [32.6, 44]], 4.5, 4, COL.wool);
  P.ellipse(32.2, 44, 1.9, 2.1, COL.skin, { ink: 0.35 });
}
const TOKEN_ART = {
  scout: { mounted: true, draw: drawScout },
  knight: { mounted: true, draw: drawKnight },
  villager: { mounted: false, draw: drawVillager },
  archer: { mounted: false, draw: drawArcher },
  monk: { mounted: false, draw: drawMonk },
};
export const TOKEN_TYPES = Object.keys(TOKEN_ART);

/* --- mask -> outline loops (pixel-edge tracing), smoothing, simplification --- */
function traceLoops(data, w, h) {
  const A = (x, y) => x >= 0 && y >= 0 && x < w && y < h && data[(y * w + x) * 4 + 3] > 127;
  const W1 = w + 1, out = new Map();
  const add = (x0, y0, x1, y1) => { const k = y0 * W1 + x0; let a = out.get(k); if (!a) out.set(k, a = []); a.push(y1 * W1 + x1); };
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) if (A(x, y)) {
    if (!A(x, y - 1)) add(x, y, x + 1, y);
    if (!A(x + 1, y)) add(x + 1, y, x + 1, y + 1);
    if (!A(x, y + 1)) add(x + 1, y + 1, x, y + 1);
    if (!A(x - 1, y)) add(x, y + 1, x, y);
  }
  const loops = [];
  for (const [k0, arr0] of out) {
    while (arr0.length) {
      const loop = []; let cur = k0, dir = null, guard = 0;
      do {
        const arr = out.get(cur), cx = cur % W1, cy = (cur / W1) | 0;
        let idx = 0;
        if (arr.length > 1 && dir) { let best = -9; arr.forEach((nk, i) => { const dx = nk % W1 - cx, dy = ((nk / W1) | 0) - cy, cr = dir[0] * dy - dir[1] * dx; if (cr > best) { best = cr; idx = i; } }); }
        const nk = arr.splice(idx, 1)[0];
        loop.push([cx, cy]); dir = [nk % W1 - cx, ((nk / W1) | 0) - cy]; cur = nk;
      } while (cur !== k0 && ++guard < 1e6);
      loops.push(loop);
    }
  }
  return loops;
}
function smoothLoop(p, it = 3) { for (let k = 0; k < it; k++) { const n = p.length; p = p.map((q, i) => { const a = p[(i - 1 + n) % n], b = p[(i + 1) % n]; return [(a[0] + 2 * q[0] + b[0]) / 4, (a[1] + 2 * q[1] + b[1]) / 4]; }); } return p; }
function rdp(p, eps) {
  if (p.length < 3) return p;
  const a = p[0], b = p[p.length - 1], dx = b[0] - a[0], dy = b[1] - a[1], L = Math.hypot(dx, dy) || 1e-9;
  let dm = 0, idx = 0;
  for (let i = 1; i < p.length - 1; i++) { const d = Math.abs((p[i][0] - a[0]) * dy - (p[i][1] - a[1]) * dx) / L; if (d > dm) { dm = d; idx = i; } }
  if (dm > eps) { const l = rdp(p.slice(0, idx + 1), eps), r = rdp(p.slice(idx), eps); return [...l.slice(0, -1), ...r]; }
  return [a, b];
}
function rdpClosed(p, eps) {
  let f = 0, dm = 0; for (let i = 1; i < p.length; i++) { const d = Math.hypot(p[i][0] - p[0][0], p[i][1] - p[0][1]); if (d > dm) { dm = d; f = i; } }
  return [...rdp(p.slice(0, f + 1), eps).slice(0, -1), ...rdp([...p.slice(f), p[0]], eps).slice(0, -1)];
}
const area = (p) => { let s = 0; for (let i = 0; i < p.length; i++) { const a = p[i], b = p[(i + 1) % p.length]; s += a[0] * b[1] - b[0] * a[1]; } return s / 2; };
const inside = (pts, x, y) => { let c = false; for (let i = 0, k = pts.length - 1; i < pts.length; k = i++) { const a = pts[i], b = pts[k]; if ((a[1] > y) !== (b[1] > y) && x < (b[0] - a[0]) * (y - a[1]) / (b[1] - a[1]) + a[0]) c = !c; } return c; };

const _tok = { geo: {}, tex: {} };
const HIDDEN = new THREE.MeshBasicMaterial({ visible: false });
function tokenGeometry(type) {
  if (_tok.geo[type]) return _tok.geo[type];
  const MR = TK.MR, c = makeCanvas(MR), g = c.getContext('2d');
  g.setTransform(MR / 100, 0, 0, MR / 100, 0, 0);
  TOKEN_ART[type].draw(painter(g, true, new THREE.Color(0)));
  const data = g.getImageData(0, 0, MR, MR).data;
  const raw = traceLoops(data, MR, MR).filter((l) => Math.abs(area(l)) > 12);
  const loops = raw.map((l) => { const s = rdpClosed(smoothLoop(l, 3), 0.35); return { pts: s, a: area(l), raw: l }; });
  const outers = loops.filter((l) => l.a > 0), holes = loops.filter((l) => l.a < 0);
  const toV = ([x, y]) => new THREE.Vector2((x / MR * 100 - 50) * TK.K, (TK.GY - y / MR * 100) * TK.K);
  const shapes = outers.map((o) => {
    const s = new THREE.Shape(o.pts.map(toV));
    for (const h of holes) if (inside(o.pts, h.pts[0][0], h.pts[0][1])) s.holes.push(new THREE.Path(h.pts.map(toV)));
    return s;
  });
  // saw-cut side walls (the caps of this extrusion are hidden; the carved faces below replace them)
  const TE = TK.T;
  const side = new THREE.ExtrudeGeometry(shapes, { depth: TE, bevelEnabled: false, curveSegments: 1, steps: 1 });
  side.translate(0, 0, -TE / 2);
  { const uv = side.attributes.uv; for (let i = 0; i < uv.count; i++) uv.setXY(i, uv.getX(i) * 3, uv.getY(i) * 3); }
  // carved faces: a grid displaced by the distance to the outline (rounded, whittled relief: broad parts swell,
  // thin limbs stay slim), cut to the silhouette by an alpha mask
  const dist = new Float32Array(MR * MR), INF = 1e9;
  for (let i = 0; i < MR * MR; i++) dist[i] = data[i * 4 + 3] > 127 ? INF : 0;
  const D1 = 1, D2 = Math.SQRT2;
  for (let y = 0; y < MR; y++) for (let x = 0; x < MR; x++) { const i = y * MR + x; if (!dist[i]) continue; let d = dist[i];
    if (x > 0) d = Math.min(d, dist[i - 1] + D1); if (y > 0) { d = Math.min(d, dist[i - MR] + D1); if (x > 0) d = Math.min(d, dist[i - MR - 1] + D2); if (x < MR - 1) d = Math.min(d, dist[i - MR + 1] + D2); } dist[i] = d; }
  for (let y = MR - 1; y >= 0; y--) for (let x = MR - 1; x >= 0; x--) { const i = y * MR + x; if (!dist[i]) continue; let d = dist[i];
    if (x < MR - 1) d = Math.min(d, dist[i + 1] + D1); if (y < MR - 1) { d = Math.min(d, dist[i + MR] + D1); if (x < MR - 1) d = Math.min(d, dist[i + MR + 1] + D2); if (x > 0) d = Math.min(d, dist[i + MR - 1] + D2); } dist[i] = d; }
  const sample = (xd, yd) => { const px = Math.min(MR - 1, Math.max(0, xd * MR / 100)), py = Math.min(MR - 1, Math.max(0, yd * MR / 100)); const x0 = Math.floor(px), y0 = Math.floor(py), x1 = Math.min(MR - 1, x0 + 1), y1 = Math.min(MR - 1, y0 + 1), fx = px - x0, fy = py - y0;
    const v = (x, y) => Math.min(dist[y * MR + x], 60); return lerp(lerp(v(x0, y0), v(x1, y0), fx), lerp(v(x0, y1), v(x1, y1), fx), fy) * 100 / MR; };
  const SEG = 150, BULGE = 0.011, D0 = 2.6;
  const face = new THREE.PlaneGeometry(100 * TK.K, 100 * TK.K, SEG, SEG); face.translate(0, (TK.GY - 50) * TK.K, 0);
  { const p = face.attributes.position, uv = face.attributes.uv;
    for (let i = 0; i < p.count; i++) {
      const xd = p.getX(i) / TK.K + 50, yd = TK.GY - p.getY(i) / TK.K, d = sample(xd, yd), t = Math.min(1, d / D0);
      p.setZ(i, TE / 2 + BULGE * Math.sqrt(t) * (0.75 + 0.25 * Math.min(1, d / 12))); // knife-chamfered rim, nearly flat face
      uv.setXY(i, xd / 100, 1 - yd / 100);
    }
    face.computeVertexNormals(); }
  const back = face.clone(); { const p = back.attributes.position; for (let i = 0; i < p.count; i++) p.setZ(i, -p.getZ(i)); const idx = back.index.array; for (let i = 0; i < idx.length; i += 3) { const t = idx[i + 1]; idx[i + 1] = idx[i + 2]; idx[i + 2] = t; } back.computeVertexNormals(); }
  // silhouette alpha at texture resolution (white = solid)
  const S = 1024, ac = makeCanvas(S), ag = ac.getContext('2d'); ag.setTransform(S / 100, 0, 0, S / 100, 0, 0);
  TOKEN_ART[type].draw(painter(ag, true, new THREE.Color(0))); ag.setTransform(1, 0, 0, 1, 0, 0);
  ag.globalCompositeOperation = 'source-in'; ag.fillStyle = '#fff'; ag.fillRect(0, 0, S, S); ag.globalCompositeOperation = 'destination-over'; ag.fillStyle = '#000'; ag.fillRect(0, 0, S, S);
  const alpha = canvasTex(ac, false); alpha.wrapS = alpha.wrapT = THREE.ClampToEdgeWrapping;
  return (_tok.geo[type] = { side, face, back, alpha, loops: raw });
}
function tokenTextures(type, pc) {
  const key = type + '|' + pc.getHexString();
  if (_tok.tex[key]) return _tok.tex[key];
  const S = 1024, MR = TK.MR, rnd = mulberry32(type.length * 131 + 7), N = makeNoise2D(type.length * 17 + 3);
  const paint = makeCanvas(S), g = paint.getContext('2d');
  g.setTransform(S / 100, 0, 0, S / 100, 0, 0);
  TOKEN_ART[type].draw(painter(g, false, pc));
  g.setTransform(1, 0, 0, 1, 0, 0);
  // brush texture: faint streaks multiplied into the paint
  g.globalCompositeOperation = 'source-atop';
  for (let i = 0; i < 900; i++) { const x = rnd() * S, y = rnd() * S, l = 6 + rnd() * 26, v = rnd() < 0.5 ? 0 : 255; g.strokeStyle = `rgba(${v},${v * 0.9},${v * 0.75},${0.03 + rnd() * 0.05})`; g.lineWidth = 1 + rnd() * 2; g.beginPath(); g.moveTo(x, y); g.lineTo(x + l * 0.3, y + l); g.stroke(); }
  // paint wear: chips along the cut edge and a few scratches, revealing the wood
  g.globalCompositeOperation = 'destination-out';
  for (const loop of tokenGeometry(type).loops) for (let i = 0; i < loop.length; i += 2) {
    const [x, y] = loop[i]; if (N(x * 0.08, y * 0.08) < -0.05 || rnd() > 0.3) continue;
    g.globalAlpha = 0.55 + rnd() * 0.45; g.beginPath(); g.ellipse(x * S / MR, y * S / MR, 2 + rnd() * 5, 1.5 + rnd() * 3.5, rnd() * 3, 0, Math.PI * 2); g.fill();
  }
  for (let i = 0; i < 40; i++) { const x = rnd() * S, y = rnd() * S * 0.9, a = rnd() * 3; g.globalAlpha = 0.25 + rnd() * 0.5; g.lineWidth = 0.6 + rnd(); g.beginPath(); g.moveTo(x, y); g.lineTo(x + Math.cos(a) * (8 + rnd() * 30), y + Math.sin(a) * (8 + rnd() * 30)); g.stroke(); }
  g.globalAlpha = 1; g.globalCompositeOperation = 'source-over';
  // compose: vertical-grain beech under the paint, warm varnish patina on top
  const m = mats();
  const face = makeCanvas(S), f = face.getContext('2d');
  f.save(); f.translate(S / 2, S / 2); f.rotate(Math.PI / 2); f.drawImage(m.beechC.color, -S / 2, -S / 2, S, S); f.restore();
  f.drawImage(paint, 0, 0);
  f.globalCompositeOperation = 'multiply'; f.fillStyle = 'rgba(236,214,170,1)'; f.fillRect(0, 0, S, S); f.globalCompositeOperation = 'source-over';
  const R = 512;
  const rough = makeCanvas(R), rg = rough.getContext('2d'); rg.fillStyle = 'rgb(150,150,150)'; rg.fillRect(0, 0, R, R);
  const tmp = makeCanvas(R), tg = tmp.getContext('2d'); tg.drawImage(paint, 0, 0, R, R); tg.globalCompositeOperation = 'source-in'; tg.fillStyle = 'rgb(205,205,205)'; tg.fillRect(0, 0, R, R);
  rg.drawImage(tmp, 0, 0);
  const bump = makeCanvas(R), bg = bump.getContext('2d');
  bg.save(); bg.translate(R / 2, R / 2); bg.rotate(Math.PI / 2); bg.drawImage(m.beechC.bump, -R / 2, -R / 2, R, R); bg.restore();
  bg.globalAlpha = 0.85; bg.filter = 'grayscale(1) contrast(1.3) brightness(1.15)'; bg.drawImage(paint, 0, 0, R, R); bg.filter = 'none'; bg.globalAlpha = 1;
  const t = {
    map: canvasTex(face, true), rough: canvasTex(rough, false), bump: canvasTex(bump, false),
  };
  for (const x of Object.values(t)) x.wrapS = x.wrapT = THREE.ClampToEdgeWrapping;
  // painted band for the base rim, with chips (alpha-tested)
  const band = makeCanvas(512, 64), bd = band.getContext('2d');
  bd.fillStyle = css(pc); bd.fillRect(0, 0, 512, 64);
  bd.fillStyle = 'rgba(184,144,60,0.9)'; bd.fillRect(0, 6, 512, 3); bd.fillRect(0, 55, 512, 3);
  bd.globalCompositeOperation = 'destination-out';
  for (let i = 0; i < 70; i++) { bd.beginPath(); bd.ellipse(rnd() * 512, rnd() < 0.5 ? rnd() * 10 : 54 + rnd() * 10, 2 + rnd() * 7, 1 + rnd() * 4, 0, 0, Math.PI * 2); bd.fill(); }
  bd.globalCompositeOperation = 'source-over';
  t.band = canvasTex(band, true, [1, 1]);
  return (_tok.tex[key] = t);
}
function tokenBase(R, sx, Hb, pc, tex) {
  const m = mats();
  const prof = [[0, 0], [R - 0.012, 0], [R, 0.01], [R, Hb - 0.014], [R - 0.004, Hb - 0.005], [R - 0.014, Hb], [0, Hb]];
  let geo = BGU.toCreasedNormals(new THREE.LatheGeometry(prof.map(([a, b]) => new THREE.Vector2(a, b)), 64), 0.5);
  geo.scale(sx, 1, 1);
  const p = geo.attributes.position, uv = new Float32Array(p.count * 2);
  for (let i = 0; i < p.count; i++) { uv[i * 2] = p.getX(i) * 1.1 + 0.5 + p.getY(i) * 0.6; uv[i * 2 + 1] = p.getZ(i) * 1.1 + 0.5; }
  geo.setAttribute('uv', new THREE.BufferAttribute(uv, 2));
  const base = new THREE.Mesh(geo, m.beech);
  const bandGeo = new THREE.CylinderGeometry(R + 0.0012, R + 0.0012, Hb * 0.44, 64, 1, true); bandGeo.scale(sx, 1, 1);
  const band = new THREE.Mesh(bandGeo, new THREE.MeshPhysicalMaterial({ map: tex.band, alphaTest: 0.5, roughness: 0.72, clearcoat: 0.25, clearcoatRoughness: 0.5, bumpMap: m.beech.bumpMap, bumpScale: 0.3 }));
  band.position.y = Hb * 0.47;
  const g = new THREE.Group(); g.add(base, band); return g;
}
/**
 * makeToken(type, colour='red', {scale=1}) -> THREE.Group, origin at the floor centre, faces +x.
 * type: 'scout' (light horse + rider with streaming cloak) | 'knight' (barded horse, great helm, lance + pennant)
 *     | 'villager' (straw hat, axe, apple basket) | 'archer' (hood, longbow drawn) | 'monk' (robe, crook, book).
 * A carved standee (~0.7 tall, 0.056 thick, bevelled cut edge showing beech) painted on both faces in the
 * player colour, with chipped paint at the edges, set in a turned beech base with a painted rim band
 * (oval for mounted units). userData {kind:'token', type, colour, height}.
 */
export function makeToken(type, colour = 'red', o = {}) {
  const art = TOKEN_ART[type]; if (!art) throw new Error('makeToken: unknown type ' + type);
  const pc = pcol(colour), m = mats();
  const G = tokenGeometry(type), tex = tokenTextures(type, pc);
  const faceMat = new THREE.MeshPhysicalMaterial({ map: tex.map, alphaMap: G.alpha, alphaTest: 0.5, roughnessMap: tex.rough, roughness: 1, bumpMap: tex.bump, bumpScale: 0.45, clearcoat: 0.08, clearcoatRoughness: 0.6, sheen: 0.12, sheenColor: new THREE.Color(0xffe2b4) });
  const Hb = 0.07;
  const g = new THREE.Group();
  g.add(art.mounted ? tokenBase(0.29, 1.32, Hb, pc, tex) : tokenBase(0.21, 1.0, Hb, pc, tex));
  const st = new THREE.Group(); st.position.set(0, Hb - 0.002, 0); g.add(st);
  st.add(new THREE.Mesh(G.side, [HIDDEN, m.cutEdge]), new THREE.Mesh(G.face, faceMat), new THREE.Mesh(G.back, faceMat));
  shadowAll(g);
  g.scale.setScalar(o.scale ?? 1);
  g.userData = {
    kind: 'token', type, colour: '#' + pc.getHexString(), height: (TK.GY * TK.K + Hb) * (o.scale ?? 1),
    /** faceToward(...points): turn (about y) so a painted face looks at the average direction of the given
     *  world points (e.g. camera and candle) — a flat-faced token reads best half-way between them. */
    faceToward(...pts) {
      const wp = g.getWorldPosition(new THREE.Vector3()); let x = 0, z = 0;
      for (const p of pts) { const dx = p.x - wp.x, dz = p.z - wp.z, l = Math.hypot(dx, dz) || 1; x += dx / l; z += dz / l; }
      const parentRot = g.parent ? new THREE.Euler().setFromQuaternion(g.parent.getWorldQuaternion(new THREE.Quaternion()), 'YXZ').y : 0;
      g.rotation.y = Math.atan2(x, z) - parentRot;
    },
  };
  return g;
}
/** Debug helper: the painted face canvas of a token (for 2D review sheets). */
export function tokenFaceCanvas(type, colour = 'red') { return tokenTextures(type, pcol(colour)).map.image; }
