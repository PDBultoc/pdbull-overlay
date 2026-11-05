// Stinger C — "the candle is snuffed and its smoke covers the screen". Canvas 2D only, procedural sprites, analytic in tMs.
// Timeline (ms): 0-460 candle rises (lower-left) | 280-660 brass snuffer drops | 660-760 flare, flame dies
//   690-1030 smoke billows and rolls over the frame | 1030-1140 fully opaque hold (cut 1080) | 1140-1840 smoke thins, drifts up/right | to 1900 last wisps.
export const meta = { id: 'smoke', name: 'Smoke', durationMs: 1900, cutMs: 1080 };

const CX = 330, WICK_REST = 672;       // candle axis, wick tip y once risen
const OX = 335, OY = 690;              // where the smoke is born
const clamp = (x, a = 0, b = 1) => Math.max(a, Math.min(b, x));
const sm = (x) => { x = clamp(x); return x * x * (3 - 2 * x); };
const lerp = (a, b, k) => a + (b - a) * k;
function rngFn(seed) { let a = seed >>> 0; return () => { a = (a + 0x6D2B79F5) >>> 0; let t = Math.imul(a ^ (a >>> 15), 1 | a); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; }; }

function makeNoise(rng) {
  const N = 64, g = new Float32Array(N * N); for (let i = 0; i < g.length; i++) g[i] = rng();
  const n = (x, y) => {
    const xi = Math.floor(x), yi = Math.floor(y), fx = x - xi, fy = y - yi;
    const sx = fx * fx * (3 - 2 * fx), sy = fy * fy * (3 - 2 * fy);
    const x0 = ((xi % N) + N) % N, x1 = (x0 + 1) % N, y0 = ((yi % N) + N) % N, y1 = (y0 + 1) % N;
    const a = g[y0 * N + x0], b = g[y0 * N + x1], c = g[y1 * N + x0], d = g[y1 * N + x1];
    return lerp(lerp(a, b, sx), lerp(c, d, sx), sy);
  };
  return (x, y, oct = 4) => { let s = 0, amp = 0.5, f = 1, tot = 0; for (let o = 0; o < oct; o++) { s += amp * n(x * f, y * f); tot += amp; amp *= 0.5; f *= 2.03; } return s / tot; };
}
const mkCanvas = (w, h) => (typeof OffscreenCanvas !== 'undefined' ? new OffscreenCanvas(w, h) : Object.assign(document.createElement('canvas'), { width: w, height: h }));
const DARK = [46, 37, 31], MID = [104, 89, 78], WARM = [190, 148, 104];
const mix3 = (t) => t < 0.5 ? DARK.map((c, i) => lerp(c, MID[i], t * 2)) : MID.map((c, i) => lerp(c, WARM[i], (t - 0.5) * 2));

function puffSprite(seed, S = 256) {
  const fbm = makeNoise(rngFn(seed)), c = mkCanvas(S, S), x = c.getContext('2d'), im = x.createImageData(S, S), d = im.data;
  for (let py = 0; py < S; py++) for (let px = 0; px < S; px++) {
    const u = (px + 0.5) / S * 2 - 1, v = (py + 0.5) / S * 2 - 1, r = Math.hypot(u, v);
    const w = fbm(u * 2.1 + 5, v * 2.1 + 9, 4), w2 = fbm(u * 5 + 20, v * 5 + 3, 3);
    let den = clamp(1.2 - r * 1.05 + (w - 0.5) * 1.0 + (w2 - 0.5) * 0.25);
    den = sm(den) * sm((1 - r) / 0.2);
    const nrm = (-u + v) * 0.7071;                       // toward lower-left = toward the flame
    const t = clamp(0.2 * (1 - den) + 0.85 * Math.max(0, nrm) * (1 - 0.45 * den) + 0.35 * (w2 - 0.5) + 0.08);
    const col = mix3(t), i = (py * S + px) * 4;
    d[i] = col[0]; d[i + 1] = col[1]; d[i + 2] = col[2]; d[i + 3] = Math.round(255 * 0.92 * den);
  }
  x.putImageData(im, 0, 0); return c;
}
function wispSprite(seed, w = 128, h = 256) {
  const fbm = makeNoise(rngFn(seed)), c = mkCanvas(w, h), x = c.getContext('2d'), im = x.createImageData(w, h), d = im.data;
  for (let py = 0; py < h; py++) for (let px = 0; px < w; px++) {
    const u = (px + 0.5) / w * 2 - 1, v = (py + 0.5) / h * 2 - 1;
    const ux = u + 0.55 * (fbm(v * 1.6 + 2, 3, 3) - 0.5) + 0.3 * (fbm(v * 4 + 7, 8, 3) - 0.5);
    const den = Math.exp(-ux * ux * 9) * sm(1 - Math.abs(v)) * (0.6 + 0.4 * fbm(u * 3 + 1, v * 3 + 1, 3));
    const col = mix3(0.5 + 0.3 * Math.max(0, -u)), i = (py * w + px) * 4;
    d[i] = col[0]; d[i + 1] = col[1]; d[i + 2] = col[2]; d[i + 3] = Math.round(255 * den);
  }
  x.putImageData(im, 0, 0); return c;
}
function baseTexture(seed, w = 480, h = 270) {          // opaque, dark, mottled, warmer toward the lower-left
  const fbm = makeNoise(rngFn(seed)), c = mkCanvas(w, h), x = c.getContext('2d'), im = x.createImageData(w, h), d = im.data;
  for (let py = 0; py < h; py++) for (let px = 0; px < w; px++) {
    const u = px / w, v = py / h;
    const wx = fbm(u * 2.5 + 11, v * 1.6 + 4, 3), wy = fbm(u * 2.5 + 40, v * 1.6 + 17, 3);
    const f = fbm(u * 3.6 + wx * 2.2, v * 2.2 + wy * 2.2, 5);
    const ridge = 1 - Math.abs(2 * fbm(u * 6 + wy * 3, v * 3.5 + wx * 3, 4) - 1);
    const k = clamp(f * 0.85 + ridge * 0.25 - 0.15);
    const warm = clamp(1 - Math.hypot(u - 0.17, v - 0.64) * 1.5) * 0.32;
    const i = (py * w + px) * 4;
    d[i] = lerp(30, 66, k) + warm * 60; d[i + 1] = lerp(23, 52, k) + warm * 34; d[i + 2] = lerp(18, 42, k) + warm * 14; d[i + 3] = 255;
  }
  x.putImageData(im, 0, 0); return c;
}

const DIR = { x: 0.3 / 1.0440, y: -1 / 1.0440 };         // wipe direction of the clearing edge (up and a bit right)
const BAND = 600, E0 = -1650, E1 = 1450;   // E1 > largest puff-centre projection, so nothing is left at the end

export async function create(W, H) {
  const rng = rngFn(20261105);
  const sprites = [1, 2, 3, 4].map((s) => puffSprite(s * 7919));
  const wisp = wispSprite(31337), tex = baseTexture(99);
  const layer = mkCanvas(W / 2, H / 2), lx = layer.getContext('2d');

  const puffs = [];
  for (let i = 0; i < 46; i++) {
    const col = i < 12;
    const T = col ? { x: OX + (rng() - 0.3) * 320, y: OY - 140 - rng() * 480 } : { x: -100 + rng() * 2200, y: -150 + rng() * 1350 };
    const dist = Math.hypot(T.x - OX, T.y - OY);
    puffs.push({
      tb: 690 + rng() * (col ? 90 : 110), T, S: col ? 330 + rng() * 260 : 560 + rng() * 620, ar: 0.85 + rng() * 0.35, spr: i % 4,
      travel: 340 + dist * 0.13, amp: (rng() < 0.5 ? -1 : 1) * (60 + rng() * 150), ph: rng() * 6.28, om: (rng() < 0.5 ? -1 : 1) * (1.2 + rng() * 1.6),
      rad: 30 + rng() * 70, dvx: 15 + rng() * 45, dvy: -(10 + rng() * 35), pk: 0.8 + rng() * 0.2, lift: 0.4 + rng() * 0.6,
    });
  }
  const wisps = [];
  for (let i = 0; i < 7; i++) wisps.push({ t0: 1250 + i * 40, life: 360 + rng() * 40, x: 200 + rng() * 520, y: 1000 - rng() * 140, rise: 420 + rng() * 200, w: 120 + rng() * 110, h: 300 + rng() * 200, sw: rng() * 6.28, pk: 0.22 + rng() * 0.12 });

  const edge = (t) => lerp(E0, E1, sm((t - 1140) / 700));

  function capBottom(t) {
    const u = clamp((t - 280) / 380);
    let y = lerp(-120, 700, Math.pow(u, 2.2));
    y += 3 * sm((t - 660) / 60);
    y -= 220 * sm((t - 800) / 300);
    return y;
  }
  function flameShape(ctx, cx, base, h, w, lean, fill) {
    ctx.beginPath(); ctx.moveTo(cx, base);
    ctx.bezierCurveTo(cx - w, base - h * 0.15, cx - w * 0.75, base - h * 0.6, cx + lean, base - h);
    ctx.bezierCurveTo(cx + w * 0.75, base - h * 0.6, cx + w, base - h * 0.15, cx, base);
    ctx.fillStyle = fill; ctx.fill();
  }
  function drawCandle(ctx, t) {
    const topY = lerp(1250, 690, sm(t / 460));
    const x0 = CX - 45, bodyH = H + 30 - topY;
    const bg = ctx.createLinearGradient(x0, 0, x0 + 90, 0);
    bg.addColorStop(0, '#f6e9c9'); bg.addColorStop(0.42, '#e6d3a8'); bg.addColorStop(1, '#6e5b40');
    ctx.fillStyle = bg; ctx.fillRect(x0, topY, 90, bodyH);
    ctx.fillStyle = '#efdfb7';
    for (const [dx, len, w] of [[8, 70, 14], [58, 110, 16], [76, 44, 11]]) { ctx.beginPath(); ctx.roundRect(x0 + dx, topY, w, len, w / 2); ctx.fill(); }
    ctx.fillStyle = '#f2e3bd'; ctx.beginPath(); ctx.ellipse(CX, topY, 45, 9, 0, 0, 6.2832); ctx.fill();
    ctx.fillStyle = '#c9b383'; ctx.beginPath(); ctx.ellipse(CX, topY + 1, 33, 6, 0, 0, 6.2832); ctx.fill();
    const wickY = topY - 18;
    ctx.strokeStyle = '#1e1612'; ctx.lineWidth = 3.5; ctx.beginPath(); ctx.moveTo(CX, topY); ctx.lineTo(CX, wickY); ctx.stroke();
    // flame + its light on the wax
    const yb = capBottom(t), alive = t < 720;
    const flare = t < 660 ? 0 : sm((t - 655) / 14) * Math.exp(-(t - 660) / 62);
    const light = alive ? 1 : 0;
    ctx.save(); ctx.beginPath(); ctx.rect(x0, topY - 12, 90, bodyH + 12); ctx.clip();
    const lg = ctx.createRadialGradient(CX, wickY - 30, 5, CX, wickY - 30, 300), la = 0.2 * light + 0.35 * flare;
    lg.addColorStop(0, `rgba(255,179,71,${la})`); lg.addColorStop(1, 'rgba(255,179,71,0)');
    ctx.fillStyle = lg; ctx.fillRect(x0, topY - 12, 90, bodyH + 12); ctx.restore();
    if (alive) {
      const h0 = 84 * (1 + 0.06 * Math.sin(t * 0.031) + 0.04 * Math.sin(t * 0.073)), sway = 3 * Math.sin(t * 0.021);
      const hh = h0 * clamp((wickY - yb) / h0), press = clamp((t - 560) / 100);
      if (hh > 2) {
        flameShape(ctx, CX, wickY, hh, 15 + 5 * press, sway + 6 * press, '#ff9c2e');
        flameShape(ctx, CX, wickY, hh * 0.78, 10 + 4 * press, sway * 0.7 + 4 * press, '#ffb347');
        flameShape(ctx, CX, wickY, hh * 0.45, 6, sway * 0.4, '#ffe9a8');
      }
    }
    return { yb, flare, wickY };
  }
  function drawCap(ctx, t, info) {
    const yb = info.yb, ty = yb - 140;
    if (ty > H) return;
    const dx = 0.42 / Math.hypot(0.42, 1), dy = -1 / Math.hypot(0.42, 1);
    const hg = ctx.createLinearGradient(CX - 12, 0, CX + 12, 0);
    hg.addColorStop(0, '#8a6a2e'); hg.addColorStop(0.35, '#e0bc6a'); hg.addColorStop(1, '#4a3214');
    ctx.strokeStyle = hg; ctx.lineWidth = 17; ctx.lineCap = 'round';
    ctx.beginPath(); ctx.moveTo(CX, ty); ctx.lineTo(CX + dx * 1800, ty + dy * 1800); ctx.stroke();
    const g = ctx.createLinearGradient(CX - 65, 0, CX + 65, 0);
    g.addColorStop(0, '#4a3314'); g.addColorStop(0.28, '#c9a255'); g.addColorStop(0.4, '#f3d98f'); g.addColorStop(0.66, '#9a7432'); g.addColorStop(1, '#3b2810');
    ctx.fillStyle = g; ctx.beginPath(); ctx.moveTo(CX, ty); ctx.lineTo(CX + 65, yb); ctx.ellipse(CX, yb, 65, 13, 0, 0, Math.PI, false); ctx.closePath(); ctx.fill();
    ctx.strokeStyle = 'rgba(243,217,143,0.55)'; ctx.lineWidth = 2; ctx.beginPath(); ctx.ellipse(CX, yb, 65, 13, 0, 0.15, Math.PI - 0.15, false); ctx.stroke();
    ctx.fillStyle = '#b58f46'; ctx.beginPath(); ctx.arc(CX, ty, 13, 0, 6.2832); ctx.fill();
    const f = info.flare;
    if (f > 0.01) {                                       // dying flame licking out under the rim
      ctx.fillStyle = `rgba(255,190,90,${0.9 * f})`;
      ctx.beginPath(); ctx.ellipse(CX, yb + 5, 70 * (0.6 + 0.4 * f), 10 + 12 * f, 0, 0, 6.2832); ctx.fill();
      ctx.fillStyle = `rgba(255,236,170,${f})`;
      ctx.beginPath(); ctx.ellipse(CX, yb + 5, 38 * f, 6 * f + 2, 0, 0, 6.2832); ctx.fill();
    }
  }

  function drawBase(ctx, t) {
    if (t < 700 || t >= 1860) return;
    lx.setTransform(1, 0, 0, 1, 0, 0); lx.globalCompositeOperation = 'source-over'; lx.clearRect(0, 0, W / 2, H / 2);
    lx.setTransform(0.5, 0, 0, 0.5, 0, 0);
    lx.drawImage(tex, -80 + 55 * Math.sin(t * 0.0013), -60 + 40 * Math.cos(t * 0.0011), W + 160, H + 120);
    if (t < 1005) {
      const u = clamp((t - 700) / 305), e = 1 - Math.pow(1 - u, 1.4), r1 = -700 + 2650 * e, R2 = Math.max(1, r1 + 700);
      const g = lx.createRadialGradient(OX, OY, 0, OX, OY, R2);
      g.addColorStop(0, `rgba(0,0,0,${r1 < 0 ? clamp(1 + r1 / 700) : 1})`);
      if (r1 > 0) g.addColorStop(clamp(r1 / R2), 'rgba(0,0,0,1)');
      g.addColorStop(1, 'rgba(0,0,0,0)');
      lx.globalCompositeOperation = 'destination-in'; lx.fillStyle = g; lx.fillRect(0, 0, W, H);
    } else if (t > 1140) {
      const e = edge(t), g = lx.createLinearGradient(DIR.x * e, DIR.y * e, DIR.x * (e + BAND), DIR.y * (e + BAND));
      g.addColorStop(0, 'rgba(0,0,0,1)'); g.addColorStop(1, 'rgba(0,0,0,0)');
      lx.globalCompositeOperation = 'destination-out'; lx.fillStyle = g; lx.fillRect(0, 0, W, H);
    }
    lx.globalCompositeOperation = 'source-over';
    ctx.drawImage(layer, 0, 0, W, H);
  }
  function drawPuffs(ctx, t) {
    const e = edge(t), lift = sm((t - 1140) / 700);
    for (const p of puffs) {
      const a = (t - p.tb) / 1000; if (a <= 0) continue;
      const u = Math.min(1, a * 1000 / p.travel), k = 1 - Math.pow(1 - u, 1.9), post = Math.max(0, a - p.travel / 1000);
      const dx = p.T.x - OX, dy = p.T.y - OY, len = Math.hypot(dx, dy) || 1;
      const curl = p.amp * Math.sin(Math.PI * u), swirl = p.rad * sm(u);
      let x = OX + dx * k - dy / len * curl + swirl * (Math.cos(p.ph + p.om * a) - Math.cos(p.ph)) + p.dvx * post;
      let y = OY + dy * k + dx / len * curl + swirl * (Math.sin(p.ph + p.om * a) - Math.sin(p.ph)) + p.dvy * post;
      y -= 300 * lift * p.lift; x += 90 * lift * p.lift;
      const size = (90 + (p.S - 90) * k) * (1 + 0.1 * post);
      const exit = clamp((x * DIR.x + y * DIR.y - e) / BAND);
      const al = p.pk * sm(a / 0.16) * exit; if (al < 0.01) continue;
      ctx.globalAlpha = al;
      const w = size * p.ar, h = size / p.ar;
      ctx.drawImage(sprites[p.spr], x - w / 2, y - h / 2, w, h);
    }
    ctx.globalAlpha = 1;
  }
  function drawWisps(ctx, t) {
    if (t < 1250) return;
    for (const q of wisps) {
      const a = (t - q.t0) / q.life; if (a <= 0 || a >= 1) continue;
      ctx.globalAlpha = q.pk * Math.sin(Math.PI * a);
      const y = q.y - q.rise * sm(a), x = q.x + 40 * Math.sin(q.sw + a * 3.2) + 30 * a, w = q.w * (0.8 + 0.6 * a), h = q.h;
      ctx.drawImage(wisp, x - w / 2, y - h / 2, w, h);
    }
    ctx.globalAlpha = 1;
  }

  return {
    draw(ctx, t) {
      ctx.save();
      if (t < 1100) { const info = drawCandle(ctx, t); drawCap(ctx, t, info); }
      drawBase(ctx, t);
      drawPuffs(ctx, t);
      drawWisps(ctx, t);
      ctx.restore();
    },
  };
}

function noiseBuf(ac, sec, seed = 5) {
  const b = ac.createBuffer(1, Math.ceil(ac.sampleRate * sec), ac.sampleRate), d = b.getChannelData(0), r = rngFn(seed);
  for (let i = 0; i < d.length; i++) d[i] = r() * 2 - 1;
  return b;
}
export function sfx(ac, dest, when) {
  const T = (s) => when + s;
  const env = (g, pts) => { g.gain.setValueAtTime(0, T(pts[0][0])); for (let i = 1; i < pts.length; i++) g.gain.linearRampToValueAtTime(pts[i][1], T(pts[i][0])); };
  const noise = (sec, seed, type, f0, f1, q, tf0, tf1, pts) => {
    const s = ac.createBufferSource(); s.buffer = noiseBuf(ac, sec, seed);
    const f = ac.createBiquadFilter(); f.type = type; f.Q.value = q;
    f.frequency.setValueAtTime(f0, T(tf0)); f.frequency.linearRampToValueAtTime(f1, T(tf1));
    const g = ac.createGain(); env(g, pts);
    s.connect(f); f.connect(g); g.connect(dest);
    s.start(T(tf0)); s.stop(T(tf1) + 0.05);
  };
  // soft metal touch of the snuffer on the rim (two decaying partials)
  for (const [fr, pk, dec] of [[1760, 0.07, 0.32], [2630, 0.04, 0.22], [980, 0.05, 0.4]]) {
    const o = ac.createOscillator(); o.type = 'sine'; o.frequency.value = fr;
    const g = ac.createGain(); g.gain.setValueAtTime(0, T(0.655)); g.gain.linearRampToValueAtTime(pk, T(0.662)); g.gain.exponentialRampToValueAtTime(0.0005, T(0.662 + dec)); g.gain.linearRampToValueAtTime(0, T(0.662 + dec + 0.03));
    o.connect(g); g.connect(dest); o.start(T(0.65)); o.stop(T(0.662 + dec + 0.06));
  }
  // hiss of the flame dying
  noise(0.5, 11, 'highpass', 3800, 2600, 0.7, 0.665, 0.95, [[0.665, 0], [0.68, 0.1], [0.8, 0.07], [0.95, 0]]);
  // deep breathy whoosh of the smoke rolling in
  noise(1.6, 12, 'lowpass', 220, 520, 0.9, 0.70, 1.3, [[0.70, 0], [0.9, 0.2], [1.05, 0.3], [1.3, 0]]);
  noise(1.6, 13, 'bandpass', 300, 160, 0.6, 0.75, 1.55, [[0.75, 0], [1.0, 0.1], [1.2, 0.12], [1.55, 0]]);
  // soft air tail
  noise(1.2, 14, 'bandpass', 1100, 700, 0.5, 1.15, 1.9, [[1.15, 0], [1.4, 0.05], [1.9, 0]]);
}
