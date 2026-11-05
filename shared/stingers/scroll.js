// Stinger B — "Scroll": a walnut roller with brass caps drops from the top edge and unrolls an aged parchment
// campaign map over the whole frame, then rolls it back up. Canvas 2D only, all textures procedural (seeded).
// Timeline (ms): 0-40 hidden | 40-880 unroll (roller falls to the bottom edge) | 880-1130 one small settle
// | 1130-1180 hold | 1180-1860 roll back up and away | 1860-1900 hidden. Full opacity 880..1180, cut at 1000.
export const meta = { id: 'scroll', name: 'Scroll', durationMs: 1900, cutMs: 1000 };

const R = 38;                    // roller radius (px)
const CAP_W = 52;                // brass end cap width
const T = { un0: 40, un1: 880, set1: 1130, bk0: 1180, bk1: 1860 };

const mk = (w, h) => {
  if (typeof OffscreenCanvas !== 'undefined') return new OffscreenCanvas(w, h);
  const c = document.createElement('canvas'); c.width = w; c.height = h; return c;
};
function mulberry32(a) {
  return () => { a |= 0; a = (a + 0x6D2B79F5) | 0; let t = Math.imul(a ^ (a >>> 15), 1 | a); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
}
const clamp01 = (x) => (x < 0 ? 0 : x > 1 ? 1 : x);
const ease = (u) => (u < 0.5 ? 4 * u * u * u : 1 - Math.pow(-2 * u + 2, 3) / 2);
const smooth = (a, b, x) => { const u = clamp01((x - a) / (b - a)); return u * u * (3 - 2 * u); };

/* ---------------- wood (roller surface, wraps around the cylinder) ---------------- */
function buildWood(W, rnd) {
  const TH = 384, c = mk(W, TH), g = c.getContext('2d');
  const ph = [rnd() * 6.28, rnd() * 6.28, rnd() * 6.28];
  for (let v = 0; v < TH; v++) {
    const a = (v / TH) * 6.2832;
    let n = 0.5 + 0.22 * Math.sin(a * 7 + ph[0]) + 0.14 * Math.sin(a * 19 + ph[1]) + 0.09 * Math.sin(a * 43 + ph[2]) + (rnd() - 0.5) * 0.12;
    n = Math.max(0, Math.min(1, n));
    g.fillStyle = `rgb(${Math.round(36 + 40 * n)},${Math.round(21 + 26 * n)},${Math.round(12 + 15 * n)})`;
    g.fillRect(0, v, W, 1);
  }
  for (let i = 0; i < 700; i++) {          // long grain streaks
    const y = Math.floor(rnd() * TH), x = rnd() * W, len = 120 + rnd() * 900, dark = rnd() < 0.6;
    g.fillStyle = dark ? `rgba(14,7,3,${0.12 + rnd() * 0.22})` : `rgba(150,96,52,${0.05 + rnd() * 0.1})`;
    g.fillRect(x, y, len, 1);
  }
  for (let i = 0; i < 12; i++) {           // darker knots, stronger and taller, so the rotation reads clearly
    const x = rnd() * W, y = rnd() * TH, rx = 40 + rnd() * 110, ry = 7 + rnd() * 12;
    const gr = g.createRadialGradient(x, y, 0, x, y, rx);
    gr.addColorStop(0, 'rgba(8,4,1,.95)'); gr.addColorStop(0.45, 'rgba(12,6,2,.55)'); gr.addColorStop(1, 'rgba(12,6,2,0)');
    g.save(); g.translate(x, y); g.scale(1, ry / rx); g.translate(-x, -y); g.fillStyle = gr; g.fillRect(x - rx, y - rx, rx * 2, rx * 2); g.restore();
  }
  // two pale stripes and a dark band running along the roller: one full turn is easy to follow
  g.fillStyle = 'rgba(214,150,84,.55)'; g.fillRect(0, 56, W, 9);
  g.fillStyle = 'rgba(214,150,84,.35)'; g.fillRect(0, 232, W, 5);
  g.fillStyle = 'rgba(6,3,1,.7)'; g.fillRect(0, 150, W, 14);
  g.fillStyle = 'rgba(6,3,1,.45)'; g.fillRect(0, 300, W, 4);
  return c;
}

/* ---------------- parchment with the inked campaign map ---------------- */
function coastline(rnd, cx, cy, rx, ry, n, rough) {
  let pts = [];
  for (let i = 0; i < n; i++) {
    const a = (i / n) * 6.2832, k = 0.72 + rnd() * 0.45;
    pts.push([cx + Math.cos(a) * rx * k, cy + Math.sin(a) * ry * k]);
  }
  let amp = rough;
  for (let it = 0; it < 4; it++) {
    const out = [];
    for (let i = 0; i < pts.length; i++) {
      const p = pts[i], q = pts[(i + 1) % pts.length];
      const dx = q[0] - p[0], dy = q[1] - p[1], len = Math.hypot(dx, dy);
      const o = (rnd() - 0.5) * len * amp;
      out.push(p, [(p[0] + q[0]) / 2 - (dy / len) * o, (p[1] + q[1]) / 2 + (dx / len) * o]);
    }
    pts = out; amp *= 0.62;
  }
  return pts;
}
function pathOf(pts) { const p = new Path2D(); pts.forEach((q, i) => (i ? p.lineTo(q[0], q[1]) : p.moveTo(q[0], q[1]))); p.closePath(); return p; }

function buildPaper(W, H, rnd, fontsOK) {
  const c = mk(W, H), g = c.getContext('2d');
  const serif = '"Cormorant Garamond", Georgia, "Times New Roman", serif';
  const title = 'Cinzel, "Cormorant Garamond", Georgia, serif';
  // base + candle light from the upper-left
  let gr = g.createLinearGradient(0, 0, W, H);
  gr.addColorStop(0, '#e4cb97'); gr.addColorStop(0.5, '#d6bb85'); gr.addColorStop(1, '#bf9f66');
  g.fillStyle = gr; g.fillRect(0, 0, W, H);
  for (let i = 0; i < 300; i++) {          // mottling
    const x = rnd() * W, y = rnd() * H, r = 30 + rnd() * 230, light = rnd() < 0.45, a = 0.025 + rnd() * 0.05;
    const rg = g.createRadialGradient(x, y, 0, x, y, r);
    rg.addColorStop(0, light ? `rgba(255,240,205,${a})` : `rgba(140,92,42,${a})`); rg.addColorStop(1, 'rgba(0,0,0,0)');
    g.fillStyle = rg; g.fillRect(x - r, y - r, r * 2, r * 2);
  }
  gr = g.createRadialGradient(330, 120, 0, 330, 120, 1250);
  gr.addColorStop(0, 'rgba(255,226,160,.38)'); gr.addColorStop(1, 'rgba(255,226,160,0)');
  g.fillStyle = gr; g.fillRect(0, 0, W, H);
  // stains and water rings
  for (let i = 0; i < 12; i++) {
    const x = rnd() * W, y = rnd() * H, r = 50 + rnd() * 170;
    for (let k = 0; k < 4; k++) {
      const ox = (rnd() - 0.5) * r * 0.7, oy = (rnd() - 0.5) * r * 0.7, rr = r * (0.5 + rnd() * 0.5);
      const rg = g.createRadialGradient(x + ox, y + oy, 0, x + ox, y + oy, rr);
      rg.addColorStop(0, `rgba(120,78,30,${0.08 + rnd() * 0.09})`); rg.addColorStop(1, 'rgba(120,78,30,0)');
      g.fillStyle = rg; g.fillRect(x + ox - rr, y + oy - rr, rr * 2, rr * 2);
    }
  }
  for (let i = 0; i < 4; i++) {
    const x = 200 + rnd() * (W - 400), y = 150 + rnd() * (H - 300), r = 40 + rnd() * 70;
    g.strokeStyle = 'rgba(112,70,28,.20)'; g.lineWidth = 3 + rnd() * 3; g.beginPath(); g.arc(x, y, r, 0.3, 5.9); g.stroke();
    g.strokeStyle = 'rgba(112,70,28,.08)'; g.lineWidth = 12; g.beginPath(); g.arc(x, y, r - 7, 0.5, 5.6); g.stroke();
  }
  // fibres
  for (let i = 0; i < 8500; i++) {
    const x = rnd() * W, y = rnd() * H, a = rnd() * 6.283, l = 6 + rnd() * 26, b = (rnd() - 0.5) * 10;
    g.strokeStyle = rnd() < 0.62 ? `rgba(105,70,32,${0.05 + rnd() * 0.08})` : `rgba(255,246,220,${0.08 + rnd() * 0.12})`;
    g.lineWidth = 0.5 + rnd() * 0.5;
    g.beginPath(); g.moveTo(x, y);
    g.quadraticCurveTo(x + Math.cos(a) * l * 0.5 - Math.sin(a) * b, y + Math.sin(a) * l * 0.5 + Math.cos(a) * b, x + Math.cos(a) * l, y + Math.sin(a) * l); g.stroke();
  }
  for (let i = 0; i < 160; i++) {          // foxing
    g.fillStyle = `rgba(110,68,26,${0.1 + rnd() * 0.22})`;
    g.beginPath(); g.arc(rnd() * W, rnd() * H, 0.8 + rnd() * 3, 0, 6.283); g.fill();
  }

  /* ---- ink (multiply) ---- */
  g.globalCompositeOperation = 'multiply';
  const ink = (a) => `rgba(78,48,22,${a})`;
  g.lineJoin = 'round'; g.lineCap = 'round';
  // latitude lines
  g.strokeStyle = ink(0.16); g.lineWidth = 1; g.setLineDash([2, 9]);
  for (let k = 1; k < 6; k++) {
    g.beginPath();
    for (let x = 0; x <= W; x += 40) { const y = (H * k) / 6 + Math.sin(x / 420 + k) * 26; x ? g.lineTo(x, y) : g.moveTo(x, y); }
    g.stroke();
  }
  g.setLineDash([]);
  // land
  const main = coastline(rnd, 880, 540, 640, 320, 14, 0.5);
  const lands = [main, coastline(rnd, 1450, 235, 170, 100, 9, 0.5), coastline(rnd, 250, 215, 130, 85, 8, 0.5)];
  const mainPath = pathOf(main);
  for (const pts of lands) {
    const p = pathOf(pts);
    g.fillStyle = 'rgba(196,160,98,.13)'; g.fill(p);
    g.strokeStyle = ink(0.05); g.lineWidth = 16; g.stroke(p);
    g.strokeStyle = ink(0.08); g.lineWidth = 9; g.stroke(p);
    g.strokeStyle = ink(0.12); g.lineWidth = 4.5; g.stroke(p);
    g.strokeStyle = ink(0.62); g.lineWidth = 2; g.stroke(p);
  }
  // mountains
  const peak = (x, y, s) => {
    g.strokeStyle = ink(0.6); g.lineWidth = 1.6; g.beginPath(); g.moveTo(x - s, y); g.lineTo(x, y - s * 1.15); g.lineTo(x + s, y); g.stroke();
    g.lineWidth = 1; g.strokeStyle = ink(0.4);
    for (let k = 1; k <= 4; k++) { g.beginPath(); g.moveTo(x + 1 + k * 2.4, y - s * 1.15 + k * 5.5); g.lineTo(x + k * 3.1 + 2, y - 1); g.stroke(); }
  };
  for (let i = 0; i < 13; i++) peak(520 + i * 24 + rnd() * 16, 330 + Math.sin(i * 0.9) * 36 + rnd() * 22, 15 + rnd() * 11);
  for (let i = 0; i < 7; i++) peak(1330 + i * 22 + rnd() * 12, 245 + rnd() * 26, 12 + rnd() * 8);
  // river: from the mountains to the southern coast
  let tgt = main[0];
  for (const p of main) if (p[0] > 850 && p[0] < 1400 && p[1] > tgt[1]) tgt = p;
  const sx = 640, sy = 360, tx = tgt[0], ty = tgt[1], N = 60;
  let px = sx, py = sy;
  for (let i = 1; i <= N; i++) {
    const u = i / N, nx = sx + (tx - sx) * u + Math.sin(u * 17 + 1) * 34 * Math.sin(u * 3.14), ny = sy + (ty - sy) * u + Math.cos(u * 11) * 20 * Math.sin(u * 3.14);
    g.strokeStyle = ink(0.6); g.lineWidth = 1 + 2.6 * u; g.beginPath(); g.moveTo(px, py); g.lineTo(nx, ny); g.stroke();
    px = nx; py = ny;
  }
  px = 1090; py = 330;                      // tributary
  for (let i = 1; i <= 24; i++) {
    const u = i / 24, nx = 1090 - 70 * u + Math.sin(u * 12) * 14, ny = 330 + (410 - 330) * u * 1.0 + 30 * u;
    g.strokeStyle = ink(0.5); g.lineWidth = 1 + 1.2 * (1 - u); g.beginPath(); g.moveTo(px, py); g.lineTo(nx, ny); g.stroke(); px = nx; py = ny;
  }
  // hatched forests
  const tree = (x, y, s) => {
    g.strokeStyle = ink(0.55); g.lineWidth = 1.3;
    g.beginPath(); g.moveTo(x, y); g.lineTo(x, y - s * 0.4); g.stroke();
    g.beginPath(); g.moveTo(x - s * 0.55, y - s * 0.4); g.lineTo(x, y - s * 1.7); g.lineTo(x + s * 0.55, y - s * 0.4); g.closePath(); g.stroke();
    g.lineWidth = 0.9; g.strokeStyle = ink(0.4);
    for (let k = 0; k < 3; k++) { g.beginPath(); g.moveTo(x + 1, y - s * (0.55 + k * 0.32)); g.lineTo(x + s * (0.42 - k * 0.1), y - s * 0.45); g.stroke(); }
  };
  for (const [fx, fy, frx, fry, n] of [[1010, 440, 150, 70, 62], [1260, 600, 120, 60, 50], [700, 640, 120, 62, 46], [1090, 730, 90, 40, 30], [560, 470, 70, 50, 24]]) {
    for (let i = 0, ok = 0; i < n * 8 && ok < n; i++) {
      const a = rnd() * 6.283, d = Math.sqrt(rnd()), x = fx + Math.cos(a) * frx * d, y = fy + Math.sin(a) * fry * d;
      if (g.isPointInPath(mainPath, x, y)) { tree(x, y, 7 + rnd() * 4); ok++; }
    }
  }
  // settlements and labels
  g.fillStyle = ink(0.7); g.strokeStyle = ink(0.7);
  const town = (x, y, name) => {
    g.lineWidth = 1.5; g.strokeRect(x - 5, y - 5, 10, 10); g.fillRect(x - 2, y - 2, 4, 4);
    g.font = `italic 600 24px ${serif}`; g.textAlign = 'left'; g.fillStyle = ink(0.72); g.fillText(name, x + 12, y + 7);
  };
  town(860, 520, 'Eastwatch'); town(1130, 640, 'Ravenmouth'); town(770, 700, 'Stonebridge'); town(600, 560, 'High Hollow');
  g.fillStyle = ink(0.5); g.font = `italic 500 34px ${serif}`; g.textAlign = 'center';
  g.fillText('The Grey Sea', 170, 620); g.fillText('The Ashen Coast', 1230, 940); g.fillText('Northmarch', 1450, 90);
  g.font = `500 28px ${title}`; g.letterSpacing = '10px'; g.fillStyle = ink(0.34); g.fillText('KINGDOM OF THE MARCHES', 900, 128); g.letterSpacing = '0px';

  // compass rose
  const rose = (cx, cy, r) => {
    g.save(); g.translate(cx, cy);
    g.strokeStyle = ink(0.6); g.lineWidth = 2; g.beginPath(); g.arc(0, 0, r, 0, 6.283); g.stroke();
    g.lineWidth = 1; g.beginPath(); g.arc(0, 0, r * 0.86, 0, 6.283); g.stroke(); g.beginPath(); g.arc(0, 0, r * 0.4, 0, 6.283); g.stroke();
    for (let k = 0; k < 72; k++) { const a = (k / 72) * 6.283, l = k % 6 === 0 ? 0.14 : 0.06; g.beginPath(); g.moveTo(Math.cos(a) * r * 0.86, Math.sin(a) * r * 0.86); g.lineTo(Math.cos(a) * r * (0.86 + l), Math.sin(a) * r * (0.86 + l)); g.stroke(); }
    for (const [L, w] of [[0.55, 0.06], [0.7, 0.08], [1.0, 0.11]]) {
      const n = L === 1.0 ? 4 : L === 0.7 ? 4 : 8, off = L === 0.7 ? 0.7854 : L === 0.55 ? 0.3927 : 0;
      for (let k = 0; k < (L === 0.55 ? 8 : 4); k++) {
        const a = off + (k * 6.2832) / (L === 0.55 ? 8 : 4) - (L === 0.55 ? 0 : 0) - 1.5708;
        const ca = Math.cos(a), sa = Math.sin(a), ex = ca * r * L * 0.86, ey = sa * r * L * 0.86, bx = -sa * r * w, by = ca * r * w;
        g.beginPath(); g.moveTo(ex, ey); g.lineTo(bx, by); g.lineTo(0, 0); g.closePath(); g.fillStyle = ink(0.55); g.fill();
        g.beginPath(); g.moveTo(ex, ey); g.lineTo(-bx, -by); g.lineTo(0, 0); g.closePath(); g.lineWidth = 1.2; g.strokeStyle = ink(0.62); g.stroke();
      }
    }
    g.fillStyle = ink(0.75); g.font = `700 34px ${title}`; g.textAlign = 'center'; g.fillText('N', 0, -r * 1.12 - 6);
    g.font = `600 22px ${title}`; g.fillText('S', 0, r * 1.12 + 24); g.fillText('E', r * 1.12 + 14, 8); g.fillText('W', -r * 1.12 - 14, 8);
    g.restore();
  };
  rose(1690, 790, 125);

  // cartouche
  const cx0 = 110, cy0 = 880, cw = 470, ch = 130;
  g.strokeStyle = ink(0.7); g.lineWidth = 3; g.beginPath(); g.roundRect(cx0, cy0, cw, ch, 10); g.stroke();
  g.lineWidth = 1.2; g.beginPath(); g.roundRect(cx0 + 9, cy0 + 9, cw - 18, ch - 18, 5); g.stroke();
  for (const [x, y] of [[cx0 + 9, cy0 + 9], [cx0 + cw - 9, cy0 + 9], [cx0 + 9, cy0 + ch - 9], [cx0 + cw - 9, cy0 + ch - 9]]) { g.fillStyle = ink(0.7); g.beginPath(); g.arc(x, y, 5, 0, 6.283); g.fill(); }
  g.textAlign = 'center'; g.letterSpacing = '9px'; g.font = `700 56px ${title}`;
  g.globalCompositeOperation = 'source-over'; g.fillStyle = 'rgba(255,246,222,.55)'; g.fillText('PDBULL', cx0 + cw / 2 + 5, cy0 + 70);   // engraved highlight
  g.globalCompositeOperation = 'multiply'; g.fillStyle = ink(0.86); g.fillText('PDBULL', cx0 + cw / 2 + 4, cy0 + 69);
  g.letterSpacing = '3px'; g.font = `italic 600 22px ${serif}`; g.fillStyle = ink(0.7); g.fillText('Survey of the Northern Marches', cx0 + cw / 2 + 1, cy0 + 102); g.letterSpacing = '0px';
  // map border with graduations
  g.strokeStyle = ink(0.55); g.lineWidth = 2.4; g.strokeRect(54, 54, W - 108, H - 108); g.lineWidth = 1; g.strokeRect(66, 66, W - 132, H - 132);
  g.fillStyle = ink(0.5);
  for (let x = 66, k = 0; x < W - 66; x += 40, k++) if (k % 2 === 0) { g.fillRect(x, 54, Math.min(40, W - 66 - x), 12); g.fillRect(x, H - 66, Math.min(40, W - 66 - x), 12); }
  for (let y = 66, k = 0; y < H - 66; y += 40, k++) if (k % 2 === 0) { g.fillRect(54, y, 12, Math.min(40, H - 66 - y)); g.fillRect(W - 66, y, 12, Math.min(40, H - 66 - y)); }

  /* ---- edges burned darker ---- */
  g.globalCompositeOperation = 'source-over';
  const eb = (x0, y0, x1, y1, w, h, a) => { const l = g.createLinearGradient(x0, y0, x1, y1); l.addColorStop(0, `rgba(70,40,14,${a})`); l.addColorStop(1, 'rgba(70,40,14,0)'); g.fillStyle = l; g.fillRect(Math.min(x0, x1), Math.min(y0, y1), w, h); };
  eb(0, 0, 120, 0, 120, H, 0.5); eb(W, 0, W - 120, 0, 120, H, 0.55); eb(0, 0, 0, 100, W, 100, 0.45); eb(0, H, 0, H - 120, W, 120, 0.6);
  for (const [x, y] of [[0, 0], [W, 0], [0, H], [W, H]]) {
    const rg = g.createRadialGradient(x, y, 0, x, y, 300); rg.addColorStop(0, 'rgba(55,30,10,.4)'); rg.addColorStop(1, 'rgba(55,30,10,0)');
    g.fillStyle = rg; g.fillRect(x - 300, y - 300, 600, 600);
  }
  gr = g.createRadialGradient(W * 0.42, H * 0.45, H * 0.35, W / 2, H / 2, W * 0.66);
  gr.addColorStop(0, 'rgba(60,34,12,0)'); gr.addColorStop(1, 'rgba(60,34,12,.3)');
  g.fillStyle = gr; g.fillRect(0, 0, W, H);
  return c;
}

/* ---------------- timeline ---------------- */
function rollerY(t, Y0, Y1) {
  if (t <= T.un0) return Y0;
  if (t < T.un1) return Y0 + (Y1 - Y0) * ease((t - T.un0) / (T.un1 - T.un0));
  if (t < T.set1) { const u = (t - T.un1) / (T.set1 - T.un1), s = Math.sin(Math.PI * u); return Y1 + 9 * s * s; }
  if (t < T.bk0) return Y1;
  if (t < T.bk1) return Y1 + (Y0 - Y1) * ease((t - T.bk0) / (T.bk1 - T.bk0));
  return Y0;
}

export async function create(W, H) {
  const rnd = mulberry32(20261105);
  // wait for the fonts so every render is the same; fall back to Georgia after 1.5 s
  try { await Promise.race([Promise.all([document.fonts.load('600 40px Cinzel'), document.fonts.load('700 56px Cinzel'), document.fonts.load('italic 600 24px "Cormorant Garamond"')]), new Promise((r) => setTimeout(r, 1500))]); } catch (e) { /* fall back to Georgia */ }
  const paper = buildPaper(W, H, rnd, true);
  const wood = buildWood(W, rnd), TH = wood.height;
  const Y0 = -(R + 8), Y1 = H - 14;   // parked just above the edge, so the entry and the roll-back are on screen

  function draw(ctx, t) {
    const yf = rollerY(t, Y0, Y1), y = Math.round(yf);
    if (y <= Y0 + 1 && (t <= T.un0 || t >= T.bk1)) return;
    // soft shadow falling ahead of the roll onto what is underneath
    const vis = smooth(Y0, 0, yf);
    if (vis > 0 && y + R < H) {
      const SH = 320, s0 = y + R - 4, sg = ctx.createLinearGradient(0, s0, 0, s0 + SH);
      sg.addColorStop(0, `rgba(10,5,2,${0.88 * vis})`); sg.addColorStop(0.25, `rgba(10,5,2,${0.55 * vis})`); sg.addColorStop(0.6, `rgba(10,5,2,${0.2 * vis})`); sg.addColorStop(1, 'rgba(10,5,2,0)');
      ctx.fillStyle = sg; ctx.fillRect(0, s0, W, SH);
    }
    // parchment above the roller
    const ph = Math.min(H, Math.max(0, y));
    if (ph > 0) {
      ctx.drawImage(paper, 0, 0, W, ph, 0, 0, W, ph);
      const cy = y - R, cg = ctx.createLinearGradient(0, cy - 110, 0, cy + 4);   // paper curls toward the roller
      cg.addColorStop(0, 'rgba(60,32,10,0)'); cg.addColorStop(0.55, 'rgba(255,230,170,.10)'); cg.addColorStop(0.72, 'rgba(60,32,10,.18)'); cg.addColorStop(1, 'rgba(30,14,4,.62)');
      ctx.fillStyle = cg; ctx.fillRect(0, Math.max(0, cy - 110), W, Math.min(ph, cy + 4) - Math.max(0, cy - 110) + (cy + 4 > ph ? 0 : 0));
    }
    // roller body: grain rotates with travel
    const rot = -yf / R, TWOPI = 6.283185307;
    for (let dy = -R; dy < R; dy++) {
      const phi = Math.asin((dy + 0.5) / R);
      let v = ((phi + rot) / TWOPI) % 1; if (v < 0) v += 1;
      ctx.drawImage(wood, 0, Math.min(TH - 1, Math.floor(v * TH)), W, 1, -4, y + dy, W + 8, 1);
    }
    const bg = ctx.createLinearGradient(0, y - R, 0, y + R);
    bg.addColorStop(0, 'rgba(0,0,0,.6)'); bg.addColorStop(0.16, 'rgba(0,0,0,.14)'); bg.addColorStop(0.3, 'rgba(255,205,140,.26)');
    bg.addColorStop(0.46, 'rgba(255,190,120,0)'); bg.addColorStop(0.78, 'rgba(0,0,0,.36)'); bg.addColorStop(1, 'rgba(0,0,0,.78)');
    ctx.fillStyle = bg; ctx.fillRect(0, y - R, W, R * 2);
    const hg = ctx.createLinearGradient(0, 0, W, 0);
    hg.addColorStop(0, 'rgba(255,200,130,.12)'); hg.addColorStop(0.5, 'rgba(0,0,0,0)'); hg.addColorStop(1, 'rgba(0,0,0,.30)');
    ctx.fillStyle = hg; ctx.fillRect(0, y - R, W, R * 2);
    ctx.fillStyle = 'rgba(255,225,170,.16)'; ctx.fillRect(CAP_W + 14, y - Math.round(R * 0.42), W - 2 * CAP_W - 28, 2);
    // brass end caps and collars
    const brass = ctx.createLinearGradient(0, y - R - 5, 0, y + R + 5);
    brass.addColorStop(0, '#2a1c08'); brass.addColorStop(0.2, '#9a7630'); brass.addColorStop(0.32, '#efd27a'); brass.addColorStop(0.5, '#b38b3a');
    brass.addColorStop(0.78, '#6a4c18'); brass.addColorStop(1, '#1c1204');
    ctx.fillStyle = brass;
    ctx.fillRect(0, y - R - 5, CAP_W, 2 * R + 10); ctx.fillRect(W - CAP_W, y - R - 5, CAP_W, 2 * R + 10);
    ctx.fillRect(CAP_W, y - R - 1, 12, 2 * R + 2); ctx.fillRect(W - CAP_W - 12, y - R - 1, 12, 2 * R + 2);
    ctx.fillStyle = 'rgba(20,10,2,.55)';
    for (const x of [CAP_W - 1, CAP_W + 11, W - CAP_W, W - CAP_W - 12]) ctx.fillRect(x, y - R - 5, 1.5, 2 * R + 10);
    ctx.fillStyle = 'rgba(255,240,190,.35)'; ctx.fillRect(0, y - R - 4, CAP_W, 1.5); ctx.fillRect(W - CAP_W, y - R - 4, CAP_W, 1.5);
  }
  return { draw };
}

/* ---------------- sound ---------------- */
export function sfx(ac, dest, when) {
  const master = ac.createGain(); master.gain.value = 0.7; master.connect(dest);
  const rnd = mulberry32(77);
  const len = Math.floor(ac.sampleRate * 2.4), nb = ac.createBuffer(1, len, ac.sampleRate), d = nb.getChannelData(0);
  for (let i = 0; i < len; i++) d[i] = rnd() * 2 - 1;
  const A = (ms) => when + ms / 1000;
  const noise = () => { const s = ac.createBufferSource(); s.buffer = nb; s.loop = true; return s; };
  const chain = (nodes) => { for (let i = 0; i < nodes.length - 1; i++) nodes[i].connect(nodes[i + 1]); return nodes; };

  function rustle(t0, t1, peak, seed) {                 // dry paper: filtered noise with crackle
    const r = mulberry32(seed), s = noise(), hp = ac.createBiquadFilter(), bp = ac.createBiquadFilter(), g = ac.createGain();
    hp.type = 'highpass'; hp.frequency.value = 1500; bp.type = 'bandpass'; bp.frequency.value = 4300; bp.Q.value = 0.55;
    chain([s, hp, bp, g, master]);
    g.gain.setValueAtTime(0, A(t0));
    const step = 26, n = Math.floor((t1 - t0) / step);
    for (let i = 1; i < n; i++) {
      const u = i / n, env = Math.pow(Math.sin(Math.PI * u), 0.8);
      g.gain.linearRampToValueAtTime(peak * env * (0.2 + 0.8 * Math.pow(r(), 1.6)), A(t0 + i * step));
    }
    g.gain.linearRampToValueAtTime(0, A(t1));
    s.start(A(t0), r() * 1.5); s.stop(A(t1) + 0.05);
  }
  function rumble(t0, t1, peak, f0, f1) {               // low wooden roller rumble
    const s = noise(), lp = ac.createBiquadFilter(), g = ac.createGain();
    lp.type = 'lowpass'; lp.frequency.value = 150; chain([s, lp, g, master]);
    const o = ac.createOscillator(), og = ac.createGain(), ol = ac.createBiquadFilter();
    o.type = 'triangle'; ol.type = 'lowpass'; ol.frequency.value = 140; chain([o, ol, og, master]);
    o.frequency.setValueAtTime(f0, A(t0)); o.frequency.linearRampToValueAtTime(f1, A((t0 + t1) / 2)); o.frequency.linearRampToValueAtTime(f0, A(t1));
    const prof = [0, 0.55, 1, 0.55, 0];
    g.gain.setValueAtTime(0, A(t0)); og.gain.setValueAtTime(0, A(t0));
    prof.forEach((p, i) => { const ms = t0 + ((t1 - t0) * i) / 4; g.gain.linearRampToValueAtTime(peak * p, A(ms)); og.gain.linearRampToValueAtTime(peak * 0.5 * p, A(ms)); });
    s.start(A(t0)); s.stop(A(t1) + 0.05); o.start(A(t0)); o.stop(A(t1) + 0.05);
  }
  function thump(t0) {                                  // heavy soft landing
    const o = ac.createOscillator(), g = ac.createGain();
    o.type = 'sine'; o.frequency.setValueAtTime(84, A(t0)); o.frequency.linearRampToValueAtTime(52, A(t0 + 120)); o.frequency.linearRampToValueAtTime(38, A(t0 + 420));
    chain([o, g, master]);
    g.gain.setValueAtTime(0, A(t0)); g.gain.linearRampToValueAtTime(0.36, A(t0 + 8)); g.gain.linearRampToValueAtTime(0.14, A(t0 + 110)); g.gain.linearRampToValueAtTime(0, A(t0 + 430));
    o.start(A(t0)); o.stop(A(t0 + 460));
    const s = noise(), lp = ac.createBiquadFilter(), ng = ac.createGain();
    lp.type = 'lowpass'; lp.frequency.value = 420; chain([s, lp, ng, master]);
    ng.gain.setValueAtTime(0, A(t0)); ng.gain.linearRampToValueAtTime(0.14, A(t0 + 6)); ng.gain.linearRampToValueAtTime(0, A(t0 + 130));
    s.start(A(t0)); s.stop(A(t0 + 160));
  }
  rustle(50, 910, 0.15, 11);
  rumble(40, 900, 0.17, 46, 60);
  thump(880);
  rustle(1170, 1870, 0.13, 23);
  rumble(1180, 1860, 0.15, 58, 44);
}
