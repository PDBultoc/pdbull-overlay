// Stinger A: a deep-red wax seal flies in, stamps the screen (wax floods the frame), cracks and falls away in shards.
// Canvas 2D only. Everything heavy (heightfield -> normal map -> lit wax textures, shard geometry) is built in create().
export const meta = { id: 'seal', name: 'Wax seal', durationMs: 1900, cutMs: 760 };

const TAU = Math.PI * 2;
const IMP = 520;        // impact
const FLOOD = 160;      // wax spreads over the frame, fully opaque at IMP+FLOOD = 680
const CRACK = 850;      // cracks start racing from the centre
const CRACKD = 80;      // one crack's run time
const SEP = 980;        // shards separate
const G = 4200;         // px/s^2
const PW = 2200, PH = 1300; // wax plate (bigger than the frame: shake/squash margin)
const SS = 1100;        // seal texture size
const SEAL_K = 0.75;    // seal texture -> screen scale when landed (disc radius ~ 350 px)

const clamp = (v, a, b) => (v < a ? a : v > b ? b : v);
const sm = (x) => { x = clamp(x, 0, 1); return x * x * (3 - 2 * x); };

function rng(seed) {
  let a = seed >>> 0;
  return () => { a = (a + 0x6D2B79F5) >>> 0; let t = a; t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
}
function makeNoise(rand) {
  const N = 256, tb = new Float32Array(N * N);
  for (let i = 0; i < tb.length; i++) tb[i] = rand();
  return (x, y) => {
    const xi = Math.floor(x), yi = Math.floor(y);
    let fx = x - xi, fy = y - yi; fx = fx * fx * (3 - 2 * fx); fy = fy * fy * (3 - 2 * fy);
    const x0 = xi & 255, x1 = (xi + 1) & 255, y0 = yi & 255, y1 = (yi + 1) & 255;
    const a = tb[y0 * N + x0], b = tb[y0 * N + x1], c = tb[y1 * N + x0], d = tb[y1 * N + x1];
    return a + (b - a) * fx + (c - a) * fy + (a - b - c + d) * fx * fy;
  };
}
// periodic angular deviation table in [-1,1] (sum of harmonics + a few lobes)
function angTable(rand, n, kmax, lobes) {
  const tab = new Float32Array(n), ph = [], am = [];
  for (let k = 2; k <= kmax; k++) { ph.push(rand() * TAU); am.push(1 / Math.pow(k, 0.85)); }
  const lb = []; for (let i = 0; i < lobes; i++) lb.push([rand() * TAU, 0.12 + rand() * 0.15, 0.5 + rand() * 0.8]);
  let mx = 0;
  for (let i = 0; i < n; i++) {
    const th = i / n * TAU; let v = 0;
    for (let k = 2; k <= kmax; k++) v += am[k - 2] * Math.cos(k * th + ph[k - 2]);
    for (const [c, w, a] of lb) { let d = Math.abs(((th - c + Math.PI) % TAU + TAU) % TAU - Math.PI); v += a * Math.exp(-(d * d) / (w * w)); }
    tab[i] = v; mx = Math.max(mx, Math.abs(v));
  }
  for (let i = 0; i < n; i++) tab[i] /= mx;
  return tab;
}
function blur(src, w, h, r) {
  const tmp = new Float32Array(src.length), out = new Float32Array(src.length), k = 1 / (2 * r + 1);
  for (let y = 0; y < h; y++) {
    const o = y * w; let s = 0;
    for (let i = -r; i <= r; i++) s += src[o + clamp(i, 0, w - 1)];
    for (let x = 0; x < w; x++) { tmp[o + x] = s * k; s += src[o + Math.min(x + r + 1, w - 1)] - src[o + Math.max(x - r, 0)]; }
  }
  for (let x = 0; x < w; x++) {
    let s = 0;
    for (let i = -r; i <= r; i++) s += tmp[clamp(i, 0, h - 1) * w + x];
    for (let y = 0; y < h; y++) { out[y * w + x] = s * k; s += tmp[Math.min(y + r + 1, h - 1) * w + x] - tmp[Math.max(y - r, 0) * w + x]; }
  }
  return out;
}
// heightfield -> normal -> warm light from the upper-left, wax diffuse + two specular lobes
function shade(h, w, hh, K, mott, ao, al, img) {
  let lx = -0.5, ly = -0.62, lz = 0.62; const ll = Math.hypot(lx, ly, lz); lx /= ll; ly /= ll; lz /= ll;
  let hx = lx, hy = ly, hz = lz + 1; const hl = Math.hypot(hx, hy, hz); hx /= hl; hy /= hl; hz /= hl;
  const d = img.data;
  for (let y = 0; y < hh; y++) {
    const yu = (y > 0 ? y - 1 : y) * w, yd = (y < hh - 1 ? y + 1 : y) * w, o = y * w;
    for (let x = 0; x < w; x++) {
      const i = o + x, xl = x > 0 ? x - 1 : x, xr = x < w - 1 ? x + 1 : x;
      const nx = -(h[o + xr] - h[o + xl]) * 0.5 * K, ny = -(h[yd + x] - h[yu + x]) * 0.5 * K;
      const il = 1 / Math.sqrt(nx * nx + ny * ny + 1);
      const nz = il, ax = nx * il, ay = ny * il;
      const diff = Math.max(0, ax * lx + ay * ly + nz * lz);
      const nh = Math.max(0, ax * hx + ay * hy + nz * hz);
      const s2 = nh * nh, s4 = s2 * s2, s8 = s4 * s4, s16 = s8 * s8, s32 = s16 * s16;
      const sp = (s32 * s8 * s4) * 0.8 + (s8 * nh) * 0.11;
      const lum = (0.26 + 0.95 * diff) * ao[i] * mott[i];
      const j = i * 4;
      d[j] = 168 * lum + 255 * sp; d[j + 1] = 20 * lum + 196 * sp; d[j + 2] = 26 * lum + 165 * sp; d[j + 3] = al ? al[i] : 255;
    }
  }
}
const mk = (w, h) => { const c = document.createElement('canvas'); c.width = w; c.height = h; return c; };

function bakeSeal(noise) {
  const rand = rng(0x5EA1);
  const S = SS, c0 = S / 2, R0 = 470;
  const L = mk(S, S), c = L.getContext('2d', { willReadFrequently: true });
  c.fillStyle = '#000'; c.fillRect(0, 0, S, S);
  const gray = (v) => { const g = Math.round(v * 255); return `rgb(${g},${g},${g})`; };
  c.translate(c0, c0);
  // border ring + thin edge lines
  c.fillStyle = gray(0.5); c.beginPath(); c.arc(0, 0, 420, 0, TAU); c.arc(0, 0, 345, 0, TAU, true); c.fill();
  c.strokeStyle = gray(0.78); c.lineWidth = 9; c.beginPath(); c.arc(0, 0, 349, 0, TAU); c.stroke(); c.beginPath(); c.arc(0, 0, 415, 0, TAU); c.stroke();
  // beads around the ring (gap at the top for the lettering)
  c.fillStyle = gray(0.85);
  for (let a = -Math.PI / 2 + 0.6; a < 1.5 * Math.PI - 0.6; a += 0.15) { c.beginPath(); c.arc(Math.cos(a) * 382, Math.sin(a) * 382, 6.5, 0, TAU); c.fill(); }
  // lettering PDBULL along the top arc
  c.fillStyle = gray(0.92); c.font = '700 50px Cinzel, "Cormorant Garamond", Georgia, serif'; c.textAlign = 'center'; c.textBaseline = 'alphabetic';
  const word = 'PDBULL';
  for (let i = 0; i < word.length; i++) {
    const a = (i - 2.5) * 0.128;
    c.save(); c.rotate(a); c.translate(0, -362); c.fillText(word[i], 0, 0); c.restore();
  }
  // crossed swords (behind the shield)
  const sword = (ang) => {
    c.save(); c.rotate(ang);
    c.fillStyle = gray(0.55); c.beginPath(); c.moveTo(-15, 118); c.lineTo(-15, -228); c.lineTo(0, -302); c.lineTo(15, -228); c.lineTo(15, 118); c.closePath(); c.fill();
    c.fillStyle = gray(0.42); c.fillRect(-3, -215, 6, 320);
    c.fillStyle = gray(0.68); c.beginPath(); c.roundRect(-62, 120, 124, 17, 7); c.fill();
    c.beginPath(); c.arc(-62, 128, 12, 0, TAU); c.arc(62, 128, 12, 0, TAU); c.fill();
    c.fillStyle = gray(0.6); c.fillRect(-8, 137, 16, 54);
    c.fillStyle = gray(0.72); c.beginPath(); c.arc(0, 202, 18, 0, TAU); c.fill();
    c.restore();
  };
  sword(0.66); sword(-0.66);
  // shield
  const shield = (s) => {
    c.beginPath(); c.save(); c.translate(0, 15); c.scale(s, s); c.translate(0, -15);
    c.moveTo(-100, -125); c.lineTo(100, -125); c.lineTo(100, 5); c.bezierCurveTo(100, 70, 50, 115, 0, 150); c.bezierCurveTo(-50, 115, -100, 70, -100, 5); c.closePath(); c.restore();
  };
  c.fillStyle = gray(0.8); shield(1.04); c.fill();
  c.fillStyle = gray(0.66); shield(0.86); c.fill();
  c.strokeStyle = gray(0.95); c.lineWidth = 15; c.lineCap = 'round'; c.beginPath(); c.arc(0, -38, 50, 0.12 * Math.PI, 0.88 * Math.PI); c.stroke();
  c.fillStyle = gray(0.95); c.beginPath(); c.arc(0, 28, 17, 0, TAU); c.fill();
  c.strokeStyle = gray(0.85); c.lineWidth = 5; c.beginPath(); c.moveTo(0, 50); c.lineTo(0, 100); c.stroke();
  const id = c.getImageData(0, 0, S, S).data, N = S * S, Lh = new Float32Array(N);
  for (let i = 0; i < N; i++) Lh[i] = id[i * 4] / 255;
  const Lb = blur(blur(Lh, S, S, 3), S, S, 2);

  const LN = 1440, lip = angTable(rand, LN, 36, 4);
  const h = new Float32Array(N), al = new Uint8ClampedArray(N), mott = new Float32Array(N);
  for (let y = 0; y < S; y++) for (let x = 0; x < S; x++) {
    const i = y * S + x, dx = x - c0 + 0.5, dy = y - c0 + 0.5, r = Math.sqrt(dx * dx + dy * dy);
    const idx = Math.min(LN - 1, ((Math.atan2(dy, dx) + Math.PI) / TAU * LN) | 0);
    const Rt = R0 * (1 + 0.085 * lip[idx]), d = Rt - r;
    mott[i] = 0.9 + 0.22 * noise(x / 60, y / 60) + 0.08 * noise(x / 11, y / 11);
    if (d < -1) { al[i] = 0; continue; }
    al[i] = clamp(d + 0.5, 0, 1) * 255;
    const hd = sm(d / 50), bulge = 0.10 * Math.exp(-(((d - 17) / 11) ** 2));
    h[i] = 0.34 * hd + bulge + 0.62 * Lb[i] * hd + 0.012 * (noise(x / 5, y / 5) - 0.5) * hd + 0.02 * (noise(Math.atan2(dy, dx) * 14 + 40, r / 90) - 0.5) * hd;
  }
  const hb = blur(h, S, S, 14), ao = new Float32Array(N);
  for (let i = 0; i < N; i++) ao[i] = 1 - clamp((hb[i] - h[i]) * 4, 0, 0.4) + clamp((h[i] - hb[i]) * 0.6, 0, 0.12);
  const img = new ImageData(S, S);
  shade(h, S, S, 5, mott, ao, al, img);
  const cv = mk(S, S); cv.getContext('2d').putImageData(img, 0, 0);
  return cv;
}

function bakePlate(seal, noise) {
  const w = PW / 2, hh = PH / 2, N = w * hh, cx = w / 2, cy = hh / 2;
  const h = new Float32Array(N), mott = new Float32Array(N), ao = new Float32Array(N);
  for (let y = 0; y < hh; y++) for (let x = 0; x < w; x++) {
    const i = y * w + x, dx = x - cx, dy = y - cy, r = Math.sqrt(dx * dx + dy * dy);
    const rr = r + 24 * (noise(x / 80 + 9, y / 80) - 0.5);
    h[i] = 0.18 * noise(x / 60 + 3, y / 60) + 0.08 * noise(x / 22, y / 22 + 5) + 0.03 * noise(x / 7, y / 7)
      + 0.26 * Math.exp(-(((rr - 192) / 20) ** 2)) + 0.035 * (noise(Math.atan2(dy, dx) * 38 + 70, r / 140) - 0.5);
    const vg = (dx * dx) / (cx * cx) + (dy * dy) / (cy * cy);
    mott[i] = (0.84 + 0.2 * noise(x / 90 + 20, y / 90) + 0.06 * noise(x / 12, y / 12)) * (1.12 - 0.3 * vg * 0.5 - 0.12 * ((x / w) + (y / hh)) + 0.06);
  }
  const hb = blur(h, w, hh, 10);
  for (let i = 0; i < N; i++) ao[i] = 1 - clamp((hb[i] - h[i]) * 3, 0, 0.35);
  const img = new ImageData(w, hh); shade(h, w, hh, 8, mott, ao, null, img);
  const half = mk(w, hh); half.getContext('2d').putImageData(img, 0, 0);
  const plate = mk(PW, PH), p = plate.getContext('2d');
  p.imageSmoothingQuality = 'high'; p.drawImage(half, 0, 0, PW, PH);
  const g = p.createRadialGradient(PW / 2, PH / 2, 300, PW / 2, PH / 2, 440);
  g.addColorStop(0, 'rgba(25,0,3,.55)'); g.addColorStop(1, 'rgba(25,0,3,0)');
  p.fillStyle = g; p.fillRect(0, 0, PW, PH);
  p.save(); p.translate(PW / 2, PH / 2); p.scale(SEAL_K, SEAL_K); p.drawImage(seal, -SS / 2, -SS / 2); p.restore();
  return plate;
}

function bakeShadow() {
  const s = 1400, cv = mk(s, s), c = cv.getContext('2d');
  const g = c.createRadialGradient(s / 2, s / 2, 0, s / 2, s / 2, s / 2);
  g.addColorStop(0, 'rgba(8,0,0,.95)'); g.addColorStop(0.62, 'rgba(8,0,0,.85)'); g.addColorStop(0.8, 'rgba(8,0,0,.35)'); g.addColorStop(1, 'rgba(8,0,0,0)');
  c.fillStyle = g; c.fillRect(0, 0, s, s);
  return cv;
}

function polyCentroid(pts) {
  let a = 0, cx = 0, cy = 0;
  for (let i = 0; i < pts.length; i++) {
    const [x0, y0] = pts[i], [x1, y1] = pts[(i + 1) % pts.length], cr = x0 * y1 - x1 * y0;
    a += cr; cx += (x0 + x1) * cr; cy += (y0 + y1) * cr;
  }
  a *= 0.5; return [cx / (6 * a), cy / (6 * a)];
}

function buildBreak(rand) {
  const HW = PW / 2, HH = PH / 2, n = 5;
  const base = rand() * TAU, ang = [];
  for (let i = 0; i < n; i++) ang.push(base + i * TAU / n + (rand() - 0.5) * 0.5);
  const cracks = ang.map((a) => {
    const ca = Math.cos(a), sa = Math.sin(a), t = Math.min(HW / Math.abs(ca), HH / Math.abs(sa));
    const pts = [[0, 0]]; let d = 0, lat = 0;
    for (;;) {
      d += 34 + rand() * 46; if (d > t - 30) break;
      lat += (rand() - 0.5) * 30; const lim = Math.min(0.32 * d, 18 + 0.06 * d); lat = clamp(lat, -lim, lim);
      pts.push([ca * d - sa * lat, sa * d + ca * lat]);
    }
    pts.push([ca * t, sa * t]);
    const cum = [0]; for (let i = 1; i < pts.length; i++) cum.push(cum[i - 1] + Math.hypot(pts[i][0] - pts[i - 1][0], pts[i][1] - pts[i - 1][1]));
    return { pts, cum, len: cum[cum.length - 1] };
  });
  const corners = [[HW, HH], [-HW, HH], [-HW, -HH], [HW, -HH]].map(([x, y]) => ({ x, y, a: Math.atan2(y, x) }));
  const shards = [];
  for (let i = 0; i < n; i++) {
    const a0 = ang[i], a1 = i === n - 1 ? ang[0] + TAU : ang[i + 1], j = (i + 1) % n;
    const cs = corners.map((k) => ({ x: k.x, y: k.y, a: a0 + (((k.a - a0) % TAU) + TAU) % TAU })).filter((k) => k.a > a0 && k.a < a1).sort((p, q) => p.a - q.a);
    const A = cracks[i].pts, B = cracks[j].pts;
    const bd = [A[A.length - 1], ...cs.map((k) => [k.x, k.y]), B[B.length - 1]], ragged = [];
    for (let k = 0; k < bd.length - 1; k++) {
      const [px, py] = bd[k], [qx, qy] = bd[k + 1]; ragged.push([px, py]);
      const m = Math.floor(Math.hypot(qx - px, qy - py) / 70);
      for (let s = 1; s <= m; s++) {
        const f = s / (m + 1), x = px + (qx - px) * f, y = py + (qy - py) * f, l = Math.hypot(x, y), inw = rand() * 38;
        ragged.push([x - x / l * inw, y - y / l * inw]);
      }
    }
    const poly = [...A, ...ragged.slice(1), ...B.slice().reverse().slice(0, -1)];
    const [cx, cy] = polyCentroid(poly);
    let rho = 0, x0 = 1e9, y0 = 1e9, x1 = -1e9, y1 = -1e9;
    for (const [x, y] of poly) { rho = Math.max(rho, Math.hypot(x - cx, y - cy)); x0 = Math.min(x0, x); y0 = Math.min(y0, y); x1 = Math.max(x1, x); y1 = Math.max(y1, y); }
    const path = new Path2D(); poly.forEach(([x, y], k) => (k ? path.lineTo(x, y) : path.moveTo(x, y))); path.closePath();
    const delay = rand() * 70, tauE = (meta.durationMs - 40 - SEP - delay) / 1000;
    const dirx = cx / (Math.hypot(cx, cy) || 1);
    const need = H_ + rho + 50 - (H_ / 2 + cy);
    const vy = Math.max(120 + rand() * 260, (need - 0.5 * G * tauE * tauE) / tauE);
    shards.push({ path, cx, cy, rho, x0: Math.max(x0, -HW), y0: Math.max(y0, -HH), x1: Math.min(x1, HW), y1: Math.min(y1, HH), delay,
      vx: dirx * (160 + rand() * 260) + (rand() - 0.5) * 120, vy, w: (rand() < 0.5 ? -1 : 1) * (0.5 + rand() * 1.5) });
  }
  const crumbs = [];
  for (let i = 0; i < 18; i++) {
    const c = cracks[(rand() * n) | 0], k = 1 + ((rand() * (c.pts.length - 2)) | 0), [x, y] = c.pts[k];
    const sz = 5 + rand() * 9, shape = []; for (let v = 0; v < 6; v++) shape.push([Math.cos(v / 6 * TAU) * sz * (0.6 + rand() * 0.6), Math.sin(v / 6 * TAU) * sz * (0.6 + rand() * 0.6)]);
    crumbs.push({ x, y, vx: (rand() - 0.5) * 520, vy: -450 + rand() * 520, w: (rand() - 0.5) * 16, delay: rand() * 80, shape });
  }
  return { cracks, shards, crumbs };
}
const H_ = 1080;

function blobTable(rand) { return angTable(rand, 180, 18, 3); }

export async function create(W, H) {
  const rand = rng(0xB011);
  const noise = makeNoise(rng(0x51EA1));
  // wait for Cinzel at most 1.5 s (a pending font request must never stall the page), then bake once: frames stay deterministic.
  const FONT = '700 50px Cinzel';
  try { await Promise.race([document.fonts.load(FONT), new Promise((r) => setTimeout(r, 1500))]); } catch (e) { /* fallback serif */ }
  // baked canvases were read back with getImageData, which keeps them CPU-side (re-uploaded every frame: ~40 ms/frame);
  // ImageBitmaps stay on the GPU.
  const sealC = bakeSeal(noise), plateC = bakePlate(sealC, noise);
  const seal = await createImageBitmap(sealC), plate = await createImageBitmap(plateC), shadow = await createImageBitmap(bakeShadow());
  const brk = buildBreak(rand);
  const blob = blobTable(rand), BN = blob.length;

  function drawSeal(ctx, sc, rot, ox, oy, a) {
    ctx.save(); ctx.globalAlpha = a; ctx.translate(W / 2 + ox, H / 2 + oy); ctx.rotate(rot); ctx.scale(sc, sc); ctx.drawImage(seal, -SS / 2, -SS / 2); ctx.restore();
  }
  const ks = (p) => 1 + 1.6 * (1 - Math.pow(p, 2.4));

  function drawFlight(ctx, t) {
    const p = clamp(t / IMP, 0, 1), aIn = Math.min(1, t / 150), q = 1 - p;
    const rot = -0.3 * Math.pow(q, 1.4), ox = -70 * Math.pow(q, 1.2), oy = -50 * q;
    const sc = SEAL_K * ks(p);
    ctx.save(); ctx.globalAlpha = aIn * (0.12 + 0.5 * p * p);
    const ss = sc * (1 + 0.25 * q) * 1.0, so = (54 * q + 10) * ks(p) / 1.5;
    ctx.translate(W / 2 + ox + so, H / 2 + oy + so * 1.25); ctx.scale(ss, ss); ctx.drawImage(shadow, -700, -700); ctx.restore();
    if (p > 0.5 && p < 0.97) for (let k = 2; k >= 1; k--) {
      const pp = Math.max(0, p - 0.03 * k), qq = 1 - pp;
      drawSeal(ctx, SEAL_K * ks(pp), -0.3 * Math.pow(qq, 1.4), -70 * Math.pow(qq, 1.2), -50 * qq, 0.05 * aIn);
    }
    drawSeal(ctx, sc, rot, ox, oy, aIn);
  }

  function drawBlob(ctx, t) {
    const u = clamp((t - IMP) / FLOOD, 0, 1), e = 1 - Math.pow(1 - u, 3), base = 300 + 1050 * e, amp = 0.06 * (1 + 2 * (1 - u));
    const path = new Path2D();
    for (let k = 0; k < BN; k++) {
      const th = k / BN * TAU, r = base * (1 + amp * blob[k]);
      const x = Math.cos(th - Math.PI) * r, y = Math.sin(th - Math.PI) * r;
      k ? path.lineTo(x, y) : path.moveTo(x, y);
    }
    path.closePath();
    ctx.save(); ctx.translate(W / 2, H / 2);
    ctx.lineJoin = 'round'; ctx.strokeStyle = 'rgba(20,0,0,.28)'; ctx.lineWidth = 26; ctx.stroke(path);
    ctx.save(); ctx.clip(path); ctx.drawImage(plate, -PW / 2, -PH / 2);
    ctx.strokeStyle = 'rgba(40,0,4,.55)'; ctx.lineWidth = 10; ctx.stroke(path);
    ctx.strokeStyle = 'rgba(255,170,150,.30)'; ctx.lineWidth = 4; ctx.stroke(path);
    ctx.restore(); ctx.restore();
  }

  function drawCracks(ctx, t) {
    ctx.save(); ctx.translate(W / 2, H / 2); ctx.lineCap = 'round'; ctx.lineJoin = 'round';
    brk.cracks.forEach((cr, i) => {
      const u = clamp((t - CRACK - i * 7) / CRACKD, 0, 1); if (u <= 0) return;
      const run = (1 - Math.pow(1 - u, 2)) * cr.len;
      const trace = (ox) => {
        ctx.beginPath(); ctx.moveTo(cr.pts[0][0] + ox, cr.pts[0][1] + ox);
        for (let k = 1; k < cr.pts.length; k++) {
          if (cr.cum[k] <= run) ctx.lineTo(cr.pts[k][0] + ox, cr.pts[k][1] + ox);
          else { const f = (run - cr.cum[k - 1]) / (cr.cum[k] - cr.cum[k - 1]); ctx.lineTo(cr.pts[k - 1][0] + (cr.pts[k][0] - cr.pts[k - 1][0]) * f + ox, cr.pts[k - 1][1] + (cr.pts[k][1] - cr.pts[k - 1][1]) * f + ox); break; }
        }
        ctx.stroke();
      };
      ctx.strokeStyle = 'rgba(24,1,4,.9)'; ctx.lineWidth = 7; trace(0);
      ctx.strokeStyle = 'rgba(255,150,130,.38)'; ctx.lineWidth = 2; trace(3);
    });
    ctx.restore();
  }

  function drawShards(ctx, t) {
    for (const s of brk.shards) {
      const tau = Math.max(0, (t - SEP - s.delay) / 1000);
      const dx = s.vx * tau, dy = s.vy * tau + 0.5 * G * tau * tau, a = s.w * tau;
      if (H / 2 + s.cy + dy - s.rho > H + 40) continue;
      ctx.save(); ctx.translate(W / 2, H / 2);
      ctx.save(); ctx.translate(dx + 7, dy + 9); ctx.translate(s.cx, s.cy); ctx.rotate(a); ctx.translate(-s.cx, -s.cy);
      ctx.fillStyle = '#2a0408'; ctx.fill(s.path); ctx.restore();
      ctx.translate(dx, dy); ctx.translate(s.cx, s.cy); ctx.rotate(a); ctx.translate(-s.cx, -s.cy);
      ctx.save(); ctx.clip(s.path);
      ctx.drawImage(plate, s.x0 + PW / 2, s.y0 + PH / 2, s.x1 - s.x0, s.y1 - s.y0, s.x0, s.y0, s.x1 - s.x0, s.y1 - s.y0);
      ctx.lineJoin = 'round'; ctx.strokeStyle = 'rgba(24,1,4,.8)'; ctx.lineWidth = 7; ctx.stroke(s.path);
      ctx.strokeStyle = 'rgba(255,150,130,.38)'; ctx.lineWidth = 3; ctx.stroke(s.path);
      ctx.restore(); ctx.restore();
    }
    for (const c of brk.crumbs) {
      const tau = Math.max(0, (t - SEP - c.delay) / 1000);
      const x = W / 2 + c.x + c.vx * tau, y = H / 2 + c.y + c.vy * tau + 0.5 * G * tau * tau;
      if (y > H + 30) continue;
      ctx.save(); ctx.translate(x, y); ctx.rotate(c.w * tau);
      ctx.beginPath(); c.shape.forEach(([px, py], k) => (k ? ctx.lineTo(px, py) : ctx.moveTo(px, py))); ctx.closePath();
      ctx.fillStyle = '#7e0f15'; ctx.fill(); ctx.strokeStyle = 'rgba(255,160,140,.5)'; ctx.lineWidth = 1.5; ctx.stroke(); ctx.restore();
    }
  }

  return {
    draw(ctx, t) {
      if (t <= 0 || t >= meta.durationMs) return;
      ctx.save(); ctx.imageSmoothingQuality = 'high';
      if (t >= IMP && t < IMP + 140) { // camera punch + shake
        const u = (t - IMP) / 140, e = (1 - u) * (1 - u), A = 18 * (1 - u) * (1 - u) * (1 - u);
        ctx.translate(W / 2 + A * Math.sin(u * 47 + 1), H / 2 + A * Math.cos(u * 39));
        ctx.scale(1 + 0.05 * e, 1 - 0.045 * e); ctx.translate(-W / 2, -H / 2);
      }
      if (t < IMP) drawFlight(ctx, t);
      else if (t < IMP + FLOOD) { drawFlight(ctx, IMP - 0.01); drawBlob(ctx, t); }
      else if (t < SEP) { ctx.drawImage(plate, W / 2 - PW / 2, H / 2 - PH / 2); if (t >= CRACK) drawCracks(ctx, t); }
      else drawShards(ctx, t);
      ctx.restore();
    },
  };
}

/* ---- sound: whoosh in, heavy thud at IMP, crack at CRACK, shard crunch + crumb ticks ---- */
export function sfx(ac, dest, when) {
  const master = ac.createGain(); master.gain.value = 0.5; master.connect(dest);
  const sr = ac.sampleRate, nb = ac.createBuffer(1, sr * 2, sr), nd = nb.getChannelData(0), r = rng(77);
  for (let i = 0; i < nd.length; i++) nd[i] = r() * 2 - 1;
  const env = (g, t0, atk, peak, dur) => {
    g.gain.setValueAtTime(0, t0); g.gain.linearRampToValueAtTime(peak, t0 + atk);
    g.gain.exponentialRampToValueAtTime(0.0001, t0 + dur); g.gain.setValueAtTime(0, t0 + dur + 0.01);
  };
  const noise = (t0, dur, type, f0, f1, q, peak, atk, off = 0) => {
    const s = ac.createBufferSource(), f = ac.createBiquadFilter(), g = ac.createGain();
    s.buffer = nb; f.type = type; f.Q.value = q; f.frequency.setValueAtTime(f0, t0); f.frequency.exponentialRampToValueAtTime(f1, t0 + dur);
    env(g, t0, atk, peak, dur); s.connect(f); f.connect(g); g.connect(master); s.start(t0, off); s.stop(t0 + dur + 0.05);
  };
  const tone = (t0, dur, type, f0, f1, peak, atk) => {
    const o = ac.createOscillator(), g = ac.createGain(); o.type = type;
    o.frequency.setValueAtTime(f0, t0); o.frequency.exponentialRampToValueAtTime(f1, t0 + dur);
    env(g, t0, atk, peak, dur); o.connect(g); g.connect(master); o.start(t0); o.stop(t0 + dur + 0.05);
  };
  const T = (ms) => when + ms / 1000;
  // air whoosh: rises toward the impact, cut off by it
  {
    const s = ac.createBufferSource(), f = ac.createBiquadFilter(), g = ac.createGain(), t0 = T(0);
    s.buffer = nb; f.type = 'bandpass'; f.Q.value = 0.9; f.frequency.setValueAtTime(260, t0); f.frequency.exponentialRampToValueAtTime(2400, T(IMP));
    g.gain.setValueAtTime(0, t0); g.gain.linearRampToValueAtTime(0.28, T(IMP - 60)); g.gain.linearRampToValueAtTime(0, T(IMP));
    s.connect(f); f.connect(g); g.connect(master); s.start(t0, 0.3); s.stop(T(IMP) + 0.05);
  }
  // impact: low body thud + sub + contact thump + wax squash noise
  tone(T(IMP), 0.42, 'sine', 120, 38, 0.5, 0.004);
  tone(T(IMP), 0.18, 'triangle', 190, 70, 0.2, 0.003);
  noise(T(IMP), 0.16, 'lowpass', 700, 120, 0.7, 0.22, 0.003, 0.6);
  noise(T(IMP + 20), 0.3, 'lowpass', 260, 90, 0.5, 0.1, 0.02, 1.0);
  // crack: sharp snap + falling click
  noise(T(CRACK), 0.07, 'highpass', 3000, 5000, 0.7, 0.35, 0.002, 0.2);
  tone(T(CRACK), 0.05, 'square', 2600, 900, 0.1, 0.002);
  noise(T(CRACK + 20), 0.2, 'bandpass', 1800, 700, 1.2, 0.16, 0.004, 0.9);
  // shards break away: crunch + low rumble
  noise(T(SEP), 0.3, 'bandpass', 900, 400, 0.9, 0.22, 0.01, 0.5);
  tone(T(SEP), 0.35, 'sine', 90, 45, 0.18, 0.01);
  // crumb ticks
  [1090, 1180, 1250, 1350, 1440, 1560].forEach((ms, i) => tone(T(ms), 0.025, 'sine', 3400 - i * 230, 2000 - i * 120, 0.06, 0.002));
}
