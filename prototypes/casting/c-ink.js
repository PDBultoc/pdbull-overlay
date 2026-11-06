/* Style C · Ink & fire — paint, ink, fire and smoke only. Every render(t) is a pure function of t;
   all randomness is drawn from api.rand inside make(). */
import { PLAY } from './harness.js';

const FT = '"Cinzel", Georgia, serif';
const FS = '"Cormorant Garamond", Georgia, serif';
const FLAME = '#ffb347', IVORY = '#f4ecdc', BRASS = '#e3c48a', INK = '#1a100a';
const clamp = (v, a, b) => Math.min(b, Math.max(a, v));
const win = (t, a, b) => clamp((t - a) / (b - a), 0, 1);
const lerp = (a, b, k) => a + (b - a) * k;
function rgb(hex) { const h = hex.replace('#', ''); return [parseInt(h.slice(0, 2), 16), parseInt(h.slice(2, 4), 16), parseInt(h.slice(4, 6), 16)]; }
function rgba(hex, a) { const [r, g, b] = rgb(hex); return `rgba(${r},${g},${b},${a})`; }
const fade = (t, dur, len = 0.4) => clamp((dur - t) / len, 0, 1);

function begin(api) { const c = api.ctx; c.beginPath(); c.rect(PLAY.x, PLAY.y, PLAY.w, PLAY.h); c.clip(); return c; }
function el(api, css, html = '') {
  const d = document.createElement('div');
  d.style.cssText = 'position:absolute;left:0;top:0;white-space:nowrap;will-change:transform,opacity;pointer-events:none;' + css;
  d.innerHTML = html; api.dom.appendChild(d); return d;
}
function place(d, x, y, s = 1, r = 0, o = 1) {
  d.style.transform = `translate(${x}px,${y}px) translate(-50%,-50%) rotate(${r}deg) scale(${s})`;
  d.style.opacity = o;
}
function reveal(d, p) { d.style.clipPath = `inset(-30px ${((1 - p) * 100).toFixed(2)}% -30px -10px)`; }
function glow(c, x, y, r, stops) {
  const g = c.createRadialGradient(x, y, 0, x, y, r);
  for (const [k, col] of stops) g.addColorStop(k, col);
  c.fillStyle = g; c.beginPath(); c.arc(x, y, r, 0, 6.2832); c.fill();
}

/* ---------- brush strokes (dry-brush bristles) ---------- */
function pointAt(pts, fi) {
  const n = pts.length - 1; fi = clamp(fi, 0, n); const k = Math.min(n - 1, Math.floor(fi)); const fr = fi - k;
  return [pts[k][0] + (pts[k + 1][0] - pts[k][0]) * fr, pts[k][1] + (pts[k + 1][1] - pts[k][1]) * fr];
}
function trace(c, pts, f0, f1, ox = 0, oy = 0) {
  const n = pts.length - 1, a = f0 * n, b = f1 * n; let p = pointAt(pts, a);
  c.moveTo(p[0] + ox, p[1] + oy);
  for (let i = Math.floor(a) + 1; i < b; i++) c.lineTo(pts[i][0] + ox, pts[i][1] + oy);
  p = pointAt(pts, b); c.lineTo(p[0] + ox, p[1] + oy);
}
function mkBrush(rand, pts, nx, ny, thick, nb = 14, dry = 0.15) {
  const bristles = [];
  for (let k = 0; k < nb; k++) bristles.push({ off: (k / (nb - 1) - 0.5) * thick, s: rand() * 0.04, e: 1 - rand() * dry, w: thick / nb * (1.3 + rand() * 0.7), a: 0.65 + rand() * 0.35 });
  return { pts, nx, ny, bristles };
}
function lineBrush(rand, x0, y0, x1, y1, thick, wob = 8, nb = 14, dry = 0.15) {
  const N = 48, dx = x1 - x0, dy = y1 - y0, len = Math.hypot(dx, dy) || 1, nx = -dy / len, ny = dx / len;
  const ph = [rand() * 6, rand() * 6, rand() * 6], pts = [];
  for (let i = 0; i <= N; i++) {
    const k = i / N, w = wob * (Math.sin(k * 5 + ph[0]) * 0.6 + Math.sin(k * 11 + ph[1]) * 0.4);
    pts.push([x0 + dx * k + nx * w, y0 + dy * k + ny * w]);
  }
  return mkBrush(rand, pts, nx, ny, thick, nb, dry);
}
function drawBrush(c, b, p, color, alpha = 1) {
  if (p <= 0) return;
  c.lineCap = 'round'; c.lineJoin = 'round';
  for (const s of b.bristles) {
    const f1 = Math.min(p, s.e); if (f1 <= s.s) continue;
    c.beginPath(); trace(c, b.pts, s.s, f1, b.nx * s.off, b.ny * s.off);
    c.lineWidth = s.w; c.strokeStyle = color; c.globalAlpha = alpha * s.a; c.stroke();
  }
  c.globalAlpha = 1;
}

/* ---------- embers (analytic, pure in t) ---------- */
function mkEmber(rand, o) { return { x: 0, y: 0, vx: 0, vy: 0, g: -60, t0: 0, life: 1.5, s: 3, drag: 1.2, sway: 0, sf: 6, sp: rand() * 6.28, ...o }; }
function drawEmber(c, p, t, glowK = 2.6) {
  const dt = t - p.t0; if (dt < 0 || dt > p.life) return;
  const k = dt / p.life, f = (1 - Math.exp(-p.drag * dt)) / p.drag;
  const x = p.x + p.vx * f + (p.sway ? Math.sin(dt * p.sf + p.sp) * p.sway : 0), y = p.y + p.vy * f + 0.5 * p.g * dt * dt;
  const a = Math.pow(1 - k, 0.8) * (0.75 + 0.25 * Math.sin(dt * 31 + p.sp)), s = p.s * (1 - k * 0.5);
  c.fillStyle = `rgba(255,${(190 - 110 * k) | 0},${(90 - 80 * k) | 0},${(a * 0.22).toFixed(3)})`;
  c.beginPath(); c.arc(x, y, s * glowK, 0, 6.2832); c.fill();
  c.fillStyle = `rgba(255,${(245 - 100 * k) | 0},${(190 - 150 * k) | 0},${a.toFixed(3)})`;
  c.beginPath(); c.arc(x, y, s, 0, 6.2832); c.fill();
}

/* ---------- synthesised sound ---------- */
function sfx(api) {
  const ac = api.audio; if (!ac) return null;
  try {
    const t0 = ac.currentTime + 0.03, rate = ac.sampleRate, nb = ac.createBuffer(1, (rate * 1.5) | 0, rate), d = nb.getChannelData(0);
    for (let i = 0; i < d.length; i++) d[i] = api.rand() * 2 - 1;
    const master = ac.createGain(); master.gain.value = 0.7; master.connect(ac.destination);
    const env = (g, at, dur, peak, atk) => {
      g.gain.setValueAtTime(0.0001, t0 + at); g.gain.linearRampToValueAtTime(peak, t0 + at + atk);
      g.gain.exponentialRampToValueAtTime(0.0001, t0 + at + dur);
    };
    return {
      noise(at, dur, { type = 'bandpass', f0 = 1000, f1 = f0, q = 1, g = 0.3, atk = 0.01 } = {}) {
        const s = ac.createBufferSource(); s.buffer = nb; s.loop = true;
        const f = ac.createBiquadFilter(); f.type = type; f.Q.value = q;
        f.frequency.setValueAtTime(f0, t0 + at); f.frequency.exponentialRampToValueAtTime(f1, t0 + at + dur);
        const gn = ac.createGain(); env(gn, at, dur, g, Math.min(atk, dur * 0.8));
        s.connect(f); f.connect(gn); gn.connect(master); s.start(t0 + at); s.stop(t0 + at + dur + 0.05);
      },
      tone(at, dur, { type = 'sine', f0 = 440, f1 = f0, g = 0.2, atk = 0.01, vib = 0, lp = 0 } = {}) {
        const o = ac.createOscillator(); o.type = type;
        o.frequency.setValueAtTime(f0, t0 + at); o.frequency.exponentialRampToValueAtTime(f1, t0 + at + dur);
        const gn = ac.createGain(); env(gn, at, dur, g, Math.min(atk, dur * 0.8));
        let node = o;
        if (lp) { const f = ac.createBiquadFilter(); f.type = 'lowpass'; f.frequency.value = lp; o.connect(f); node = f; }
        if (vib) { const l = ac.createOscillator(), lg = ac.createGain(); l.frequency.value = 22; lg.gain.value = vib; l.connect(lg); lg.connect(o.frequency); l.start(t0 + at); l.stop(t0 + at + dur + 0.05); }
        node.connect(gn); gn.connect(master); o.start(t0 + at); o.stop(t0 + at + dur + 0.05);
      },
    };
  } catch (e) { return null; }
}

/* ============================================================ 1 BLUNDER */
function blunder(api) {
  const { rand, player, x, y } = api, dur = 2.6, R = 175;
  const cx = clamp(x, 520, 1400), cy = clamp(y - 10, 310, 640);
  const lobes = [], streaks = [], drops = [], drips = [], ash = [];
  for (let i = 0; i < 14; i++) { const a = rand() * 6.28; lobes.push({ a, d: R * (0.35 + rand() * 0.5), r: R * (0.14 + rand() * 0.2) }); }
  for (let i = 0; i < 16; i++) streaks.push({ a: i / 16 * 6.28 + rand() * 0.3, len: R * (0.9 + rand() * 1.3), w: 6 + rand() * 12 });
  for (let i = 0; i < 26; i++) drops.push({ a: rand() * 6.28, d: R * (1.0 + rand() * 1.8), r: 3 + rand() * 9, acc: rand() < 0.3, d0: rand() * 0.08 });
  for (let i = 0; i < 8; i++) drips.push({ dx: (rand() - 0.5) * R * 1.3, len: 90 + rand() * 230, w: 7 + rand() * 9, t0: 0.15 + rand() * 0.45, sp: 0.8 + rand() * 0.9 });
  for (let i = 0; i < 70; i++) ash.push({ x: cx + (rand() - 0.5) * 1000, y: y - 260 + rand() * 120, vx: (rand() - 0.5) * 40, vy: 90 + rand() * 120, t0: 0.15 + rand() * 1.0, life: 1.4 + rand() * 1.0, s: 3 + rand() * 6, sp: rand() * 6.28, rot: rand() * 6.28, dark: rand() < 0.4 });
  const band = lineBrush(rand, cx - 365, cy, cx + 365, cy, 122, 6, 16, 0.12);
  const acc = lineBrush(rand, cx - 340, cy + 70, cx + 340, cy + 64, 10, 5, 4, 0.1);
  const word = el(api, `font:900 112px ${FT};letter-spacing:7px;color:${IVORY};text-shadow:0 3px 0 #2a0507,0 0 18px rgba(0,0,0,.7);transform-origin:50% 50%`, 'BLUNDER');
  const name = el(api, `font:700 italic 52px ${FS};color:${player.color};text-shadow:0 2px 0 #000,0 0 14px rgba(0,0,0,.9)`, player.name);
  const S = sfx(api);
  if (S) {
    S.noise(0, 0.3, { f0: 1400, f1: 220, q: 1.2, g: 0.55, atk: 0.005 }); S.noise(0.02, 0.18, { type: 'lowpass', f0: 600, f1: 150, g: 0.5 });
    S.tone(0, 0.4, { f0: 125, f1: 40, g: 0.9, atk: 0.004 }); S.noise(0.32, 0.45, { type: 'highpass', f0: 2500, f1: 3500, g: 0.06, atk: 0.1 });
  }
  return { duration: dur, render(t) {
    const c = begin(api), fo = fade(t, dur, 0.4);
    c.globalAlpha = fo;
    const e = api.ease.back(win(t, 0, 0.24)), sc = lerp(0.2, 1, e);
    if (t > 0) {
      c.fillStyle = '#4a0b0e';
      c.beginPath(); c.arc(x, y, R * 0.6 * sc, 0, 6.28); c.fill();
      for (const l of lobes) { c.beginPath(); c.arc(x + Math.cos(l.a) * l.d * sc, y + Math.sin(l.a) * l.d * sc, l.r * sc, 0, 6.28); c.fill(); }
      c.lineCap = 'round';
      for (const s of streaks) {
        const L = s.len * sc, ex = x + Math.cos(s.a) * L, ey = y + Math.sin(s.a) * L;
        c.strokeStyle = '#4a0b0e'; c.lineWidth = s.w; c.beginPath(); c.moveTo(x + Math.cos(s.a) * R * 0.3, y + Math.sin(s.a) * R * 0.3); c.lineTo(ex, ey); c.stroke();
        c.fillStyle = '#4a0b0e'; c.beginPath(); c.arc(ex, ey, s.w * 0.65, 0, 6.28); c.fill();
      }
      c.fillStyle = 'rgba(160,28,32,.55)'; c.beginPath(); c.arc(x - R * 0.12, y - R * 0.14, R * 0.38 * sc, 0, 6.28); c.fill();
      c.fillStyle = 'rgba(210,60,52,.35)'; c.beginPath(); c.arc(x - R * 0.2, y - R * 0.22, R * 0.15 * sc, 0, 6.28); c.fill();
      for (const d of drops) {
        const k = api.ease.out(win(t, d.d0, d.d0 + 0.45)); if (k <= 0) continue;
        c.fillStyle = d.acc ? player.color : '#5c0f12';
        c.beginPath(); c.arc(x + Math.cos(d.a) * d.d * k, y + Math.sin(d.a) * d.d * k + 40 * k * k, d.r, 0, 6.28); c.fill();
      }
      for (const d of drips) {
        const k = api.ease.in(win(t, d.t0, d.t0 + d.len / (d.sp * 220))) * 0.5 + api.ease.out(win(t, d.t0, d.t0 + 1.2)) * 0.5;
        const L = d.len * k, sx = x + d.dx, sy = y + R * 0.25;
        c.strokeStyle = '#4a0b0e'; c.lineWidth = d.w; c.beginPath(); c.moveTo(sx, sy); c.lineTo(sx, sy + L); c.stroke();
        c.fillStyle = '#4a0b0e'; c.beginPath(); c.arc(sx, sy + L, d.w * 0.85, 0, 6.28); c.fill();
      }
    }
    // brush writes the word
    const p = api.ease.out(win(t, 0.3, 0.8));
    drawBrush(c, band, p, 'rgba(22,4,6,.92)'); drawBrush(c, acc, api.ease.out(win(t, 0.55, 0.95)), player.color, 0.95);
    // ash flakes
    for (const a of ash) {
      const dt = t - a.t0; if (dt < 0 || dt > a.life) continue;
      const k = dt / a.life, px = a.x + a.vx * dt + Math.sin(dt * 3 + a.sp) * 26, py = a.y + a.vy * dt;
      c.save(); c.translate(px, py); c.rotate(a.rot + dt * 2); c.globalAlpha = fo * 0.8 * (1 - k * k);
      c.fillStyle = a.dark ? '#3a3330' : '#a89e94'; c.beginPath(); c.moveTo(-a.s, -a.s * 0.5); c.lineTo(a.s, -a.s * 0.2); c.lineTo(a.s * 0.3, a.s * 0.6); c.closePath(); c.fill(); c.restore();
    }
    c.globalAlpha = 1;
    const hit = 1 + 0.12 * Math.max(0, 1 - win(t, 0.3, 0.55));
    reveal(word, p); place(word, cx, cy, hit, -3, fo * (p > 0 ? 1 : 0));
    place(name, cx, cy + 108, 1, 0, fo * api.ease.out(win(t, 0.7, 1.0)));
  } };
}

/* ============================================================ 2 FUNNY */
function arcPts(cx, cy, rx, ry, a0, a1, n, rand, j) {
  const o = []; for (let i = 0; i <= n; i++) { const a = lerp(a0, a1, i / n); o.push([cx + Math.cos(a) * rx + (rand() - 0.5) * j, cy + Math.sin(a) * ry + (rand() - 0.5) * j]); }
  return o;
}
function chicken(rand) {
  const j = 2.5;
  return [
    { pts: arcPts(0, -45, 38, 28, 0, 6.4, 26, rand, j), fill: true },
    { pts: [[-34, -55], [-64, -82], [-48, -52], [-72, -62], [-38, -40]] },
    { pts: arcPts(34, -82, 14, 14, 0, 6.4, 14, rand, 1.5) },
    { pts: [[28, -95], [30, -110], [35, -98], [39, -112], [42, -96]] },
    { pts: [[47, -86], [64, -80], [47, -75]] },
    { pts: arcPts(38, -86, 2, 2, 0, 6.4, 6, rand, 0) },
    { pts: [[-8, -18], [-10, 0], [-24, 2]] }, { pts: [[10, -18], [12, 0], [-2, 3]] },
  ];
}
function sheep(rand) {
  const body = []; for (let i = 0; i <= 64; i++) { const a = i / 64 * 6.28, k = 1 + 0.17 * Math.abs(Math.sin(a * 5)); body.push([Math.cos(a) * 46 * k + (rand() - 0.5) * 2, -52 + Math.sin(a) * 30 * k + (rand() - 0.5) * 2]); }
  return [
    { pts: body, fill: true },
    { pts: arcPts(54, -58, 16, 12, 0, 6.4, 16, rand, 1.5) },
    { pts: [[44, -68], [34, -78], [42, -60]] }, { pts: arcPts(58, -60, 2, 2, 0, 6.4, 6, rand, 0) },
    { pts: [[-30, -24], [-30, 0]] }, { pts: [[-12, -22], [-12, 0]] }, { pts: [[12, -22], [12, 0]] }, { pts: [[30, -24], [30, 0]] },
  ];
}
function funny(api) {
  const { rand, player } = api, dur = 3.2, col = player.color;
  const beasts = [];
  for (let i = 0; i < 7; i++) {
    const dir = i % 2 ? -1 : 1, sz = 1.0 + rand() * 0.6, st = i % 3 === 1 ? sheep(rand) : chicken(rand);
    let tot = 0; for (const s of st) tot += s.pts.length;
    beasts.push({ st, tot, dir, sz, y: 650 + rand() * 170, t0: 0.05 + i * 0.3, x0: dir > 0 ? -140 + rand() * 500 : 2060 - rand() * 500, sp: 430 + rand() * 180, ph: rand() * 6, life: 2.1 });
  }
  const cx = clamp(api.x, 480, 1440), cy = clamp(api.y, 310, 500);
  const seq = [{ txt: 'HA!', a: 0.25, b: 1.5, size: 170 }, { txt: 'What was that?', a: 1.5, b: 3.1, size: 108 }];
  const words = seq.map((s) => el(api, `font:700 italic ${s.size}px ${FS};color:${BRASS};text-shadow:0 3px 0 ${INK},0 0 3px ${INK},0 0 22px rgba(0,0,0,.6);letter-spacing:2px`, s.txt));
  const name = el(api, `font:700 italic 44px ${FS};color:${col};text-shadow:0 2px 0 #000,0 0 12px #000`, '- ' + player.name);
  // squiggle underline under the words
  const sq = []; for (let i = 0; i <= 40; i++) sq.push([cx - 260 + i * 13, cy + 100 + (i % 2 ? 14 : -14) + (rand() - 0.5) * 6]);
  const sqb = mkBrush(rand, sq, 0, 1, 5, 2, 0.05);
  const S = sfx(api);
  if (S) {
    for (let i = 0; i < 16; i++) S.noise(0.05 + i * 0.07, 0.06, { f0: 2800 + (i % 3) * 900, f1: 4200, q: 3, g: 0.12 });
    S.tone(0.3, 0.45, { type: 'triangle', f0: 180, f1: 560, g: 0.3, vib: 30 }); S.tone(1.55, 0.5, { type: 'triangle', f0: 260, f1: 150, g: 0.28, vib: 25 });
    S.tone(0.75, 0.3, { type: 'triangle', f0: 400, f1: 800, g: 0.15, atk: 0.005 });
  }
  return { duration: dur, render(t) {
    const c = begin(api), fo = fade(t, dur, 0.4);
    for (const b of beasts) {
      const dt = t - b.t0; if (dt < 0 || dt > b.life) continue;
      const p = clamp(dt / 0.75, 0, 1), allow = p * b.tot, hop = Math.abs(Math.sin(dt * 9 + b.ph)) * 20;
      const x = b.x0 + b.dir * b.sp * dt, k = Math.min(1, dt / 0.15, (b.life - dt) / 0.3);
      c.save(); c.translate(x, b.y - hop); c.rotate(Math.sin(dt * 9 + b.ph) * 0.06 * b.dir); c.scale(b.dir * b.sz, b.sz); c.lineCap = 'round'; c.lineJoin = 'round';
      c.globalAlpha = fo * k;
      let used = 0;
      for (const s of b.st) {
        const n = Math.min(s.pts.length, Math.max(0, Math.floor(allow - used))); used += s.pts.length; if (n < 2) continue;
        c.beginPath(); c.moveTo(s.pts[0][0], s.pts[0][1]); for (let i = 1; i < n; i++) c.lineTo(s.pts[i][0], s.pts[i][1]);
        if (s.fill && n === s.pts.length) { c.fillStyle = rgba(col, 0.45); c.fill(); }
        c.strokeStyle = INK; c.lineWidth = 8 / b.sz; c.stroke(); c.strokeStyle = IVORY; c.lineWidth = 3.6 / b.sz; c.stroke();
      }
      c.restore();
    }
    c.globalAlpha = 1;
    seq.forEach((s, i) => {
      const dt = t - s.a, on = dt >= 0 && t < s.b, k = on ? Math.min(1, dt / 0.12, (s.b - t) / 0.2) : 0;
      const bounce = Math.abs(Math.sin(dt * 7.5)) * 55 * Math.exp(-dt * 0.5), sq = 1 + (bounce < 6 ? 0.12 : -0.04);
      place(words[i], cx, cy - bounce, (0.6 + 0.4 * api.ease.back(dt / 0.25)) * sq, Math.sin(dt * 5) * 4 - 3, on ? k * fo : 0);
    });
    place(name, cx, cy + 165, 1, -2, fo * api.ease.out(win(t, 0.6, 0.9)));
    drawBrush(c, sqb, api.ease.out(win(t, 0.4, 1.0)), BRASS, 0.9 * fo * (t < 1.5 ? 1 : fade(1.9 - t, 0.4, 0.4)));
  } };
}

/* ============================================================ 3 WOW */
function wow(api) {
  const { rand, player, x, y } = api, dur = 3.2;
  const tx = clamp(x, 520, 1400), ty = clamp(y - 170, 300, 690);
  const sparks = [], swirl = [], shim = [], tongues = [];
  for (let i = 0; i < 90; i++) { const a = rand() * 6.28, sp = 200 + rand() * 700; sparks.push(mkEmber(rand, { x, y, vx: Math.cos(a) * sp, vy: Math.sin(a) * sp - 120, g: -90, t0: rand() * 0.12, life: 0.8 + rand() * 1.1, s: 2 + rand() * 3.5 })); }
  for (let i = 0; i < 80; i++) swirl.push({ a0: rand() * 6.28, r0: 20 + rand() * 60, w: (2 + rand() * 3) * (rand() < 0.5 ? -1 : 1), rs: 120 + rand() * 230, rise: 90 + rand() * 170, t0: 0.1 + rand() * 1.3, life: 1.4 + rand() * 1.3, s: 2 + rand() * 3 });
  for (let i = 0; i < 60; i++) shim.push(mkEmber(rand, { x: tx + (rand() - 0.5) * 700, y: ty + 60 + rand() * 40, vx: 0, vy: -(60 + rand() * 90), g: 0, t0: 0.8 + rand() * 1.8, life: 0.7 + rand() * 0.5, s: 1.6 + rand() * 1.6, sway: 8 + rand() * 10, sf: 8 + rand() * 6, drag: 0.5 }));
  for (let i = 0; i < 28; i++) { const a = -1.57 + (rand() - 0.5) * 2.7, sp = 150 + rand() * 400; tongues.push({ vx: Math.cos(a) * sp, vy: Math.sin(a) * sp, t0: rand() * 0.25, life: 0.5 + rand() * 0.4, s: 40 + rand() * 50 }); }
  const spacing = 235, ign = [0.55, 0.78, 1.0];
  const letters = ['W', 'O', 'W'].map((ch) => el(api, `font:900 240px ${FT};color:#ffd36a;`, ch));
  const name = el(api, `font:700 46px ${FT};letter-spacing:10px;color:${player.color};text-shadow:0 2px 0 #000,0 0 14px #000`, player.name);
  const S = sfx(api);
  if (S) {
    S.noise(0, 0.55, { f0: 300, f1: 3500, q: 0.8, g: 0.5, atk: 0.3 }); S.tone(0, 0.5, { type: 'sawtooth', f0: 90, f1: 400, g: 0.1, atk: 0.3, lp: 900 });
    for (let i = 0; i < 28; i++) S.noise(0.2 + api.rand() * 2.4, 0.03 + api.rand() * 0.04, { type: 'highpass', f0: 3000 + api.rand() * 3000, f1: 5000, g: 0.1 + api.rand() * 0.12 });
    ign.forEach((a, i) => S.tone(a, 0.4, { type: 'triangle', f0: 523 * [1, 1.25, 1.5][i], f1: 523 * [1, 1.25, 1.5][i], g: 0.12, lp: 2500 }));
  }
  return { duration: dur, render(t) {
    const c = begin(api), fo = fade(t, dur, 0.5);
    c.globalAlpha = fo;
    const k0 = win(t, 0, 0.5);
    if (t < 0.5) {
      glow(c, x, y, 70 + 260 * api.ease.out(k0), [[0, `rgba(255,250,220,${0.95 * (1 - k0)})`], [0.35, `rgba(255,179,71,${0.7 * (1 - k0)})`], [1, 'rgba(200,60,10,0)']]);
      c.strokeStyle = rgba(FLAME, 0.9 * (1 - k0)); c.lineWidth = 14 * (1 - k0) + 1; c.beginPath(); c.arc(x, y, 40 + 400 * api.ease.out(k0), 0, 6.28); c.stroke();
    }
    for (const f of tongues) {
      const dt = t - f.t0; if (dt < 0 || dt > f.life) continue; const k = dt / f.life, fp = (1 - Math.exp(-2 * dt)) / 2;
      const a = (1 - k) * 0.9, r = f.s * (1 - k * 0.6) * (0.6 + 0.8 * Math.min(1, dt * 6));
      glow(c, x + f.vx * fp, y + f.vy * fp - 40 * dt, r, [[0, `rgba(255,240,190,${a})`], [0.35, `rgba(255,179,71,${a * 0.8})`], [1, 'rgba(200,50,10,0)']]);
    }
    for (const p of sparks) drawEmber(c, p, t);
    for (const s of swirl) {
      const dt = t - s.t0; if (dt < 0 || dt > s.life) continue; const k = dt / s.life, r = s.r0 + s.rs * (1 - Math.exp(-1.5 * dt)) / 1.5 * 1.6, a = s.a0 + s.w * dt;
      const px = x + Math.cos(a) * r, py = y + Math.sin(a) * r * 0.45 - s.rise * dt, al = Math.pow(1 - k, 0.7);
      c.fillStyle = `rgba(255,${(200 - 90 * k) | 0},80,${(al * 0.25).toFixed(3)})`; c.beginPath(); c.arc(px, py, s.s * 2.6, 0, 6.28); c.fill();
      c.fillStyle = `rgba(255,${(235 - 60 * k) | 0},${(170 - 100 * k) | 0},${al.toFixed(3)})`; c.beginPath(); c.arc(px, py, s.s, 0, 6.28); c.fill();
    }
    for (const p of shim) drawEmber(c, p, t, 3);
    // flame licks above letters
    ign.forEach((a, i) => {
      const dt = t - a; if (dt < 0 || dt > 1.6) return; const lx = tx + (i - 1) * spacing;
      for (let j = 0; j < 3; j++) {
        const fl = 0.7 + 0.3 * Math.sin(dt * 18 + j * 2 + i), al = (1 - win(dt, 0.2, 1.6)) * 0.85;
        glow(c, lx + (j - 1) * 55, ty - 105 - 30 * fl - dt * 20, 48 * fl * (1 - 0.2 * dt), [[0, `rgba(255,240,190,${al})`], [0.4, `rgba(255,179,71,${al * 0.7})`], [1, 'rgba(200,50,10,0)']]);
      }
    });
    c.globalAlpha = 1;
    letters.forEach((l, i) => {
      const dt = t - ign[i], on = dt >= 0, pop = on ? 1 + 0.55 * (1 - api.ease.out(dt / 0.25)) : 1, hot = on ? Math.max(0, 1 - dt / 0.7) : 0;
      l.style.filter = `brightness(${(1 + 1.4 * hot).toFixed(2)})`;
      l.style.color = hot > 0.3 ? '#fff4c8' : '#ffd36a';
      l.style.textShadow = `0 0 ${(18 + 40 * hot + 6 * Math.sin(t * 14 + i)).toFixed(1)}px ${FLAME},0 4px 0 #57411f,0 0 3px #2a1c08`;
      place(l, tx + (i - 1) * spacing, ty - 8 * Math.sin(Math.max(0, dt) * 4) * Math.exp(-dt), pop, (i - 1) * 2, on ? fo : 0);
    });
    place(name, tx, ty + 135, 1, 0, fo * api.ease.out(win(t, 1.3, 1.7)));
  } };
}

/* ============================================================ 4 WOLOLO */
function wololo(api) {
  const { rand, player, x, y } = api, dur = 2.4, col = player.color, R = 330;
  const blobs = [], tend = [], gran = [];
  for (let i = 0; i < 16; i++) { const a = rand() * 6.28, d = rand() * R * 0.35; blobs.push({ x: x + Math.cos(a) * d, y: y + Math.sin(a) * d * 0.8, r: R * (0.55 + rand() * 0.5), d0: rand() * 0.35 }); }
  for (let i = 0; i < 12; i++) tend.push({ a: rand() * 6.28, len: R * (0.5 + rand() * 0.5), w: 8 + rand() * 14, d0: 0.15 + rand() * 0.4, bend: (rand() - 0.5) * 1.2 });
  for (let i = 0; i < 50; i++) gran.push({ a: rand() * 6.28, d: R * (0.7 + rand() * 0.4), r: 1.5 + rand() * 3.5, d0: 0.1 + rand() * 0.5 });
  const cx = clamp(x, 480, 1440), cy = clamp(y, 320, 700);
  const word = el(api, `font:700 italic 190px ${FS};color:${IVORY};text-shadow:0 0 26px ${rgba(col, 0.95)},0 4px 0 ${rgba('#000000', 0.55)};letter-spacing:3px`, 'Wololo');
  const name = el(api, `font:700 italic 46px ${FS};color:${IVORY};text-shadow:0 0 12px ${col},0 2px 0 #000`, player.name);
  const sw = lineBrush(rand, cx - 300, cy + 108, cx + 300, cy + 98, 14, 10, 6, 0.2);
  const S = sfx(api);
  if (S) {
    S.noise(0, 1.4, { type: 'lowpass', f0: 300, f1: 1400, q: 2, g: 0.22, atk: 0.6 });
    S.tone(0, 1.2, { f0: 300, f1: 520, g: 0.12, atk: 0.5, vib: 18 });
    for (let i = 0; i < 7; i++) S.tone(0.3 + i * 0.13 + api.rand() * 0.05, 0.12, { f0: 500 + api.rand() * 500, f1: 1100 + api.rand() * 500, g: 0.07 });
  }
  return { duration: dur, render(t) {
    const c = begin(api), fo = fade(t, dur, 0.5);
    blobs.forEach((b) => {
      const k = api.ease.out(win(t, b.d0, b.d0 + 1.2)); if (k <= 0) return; const r = b.r * k;
      const g = c.createRadialGradient(b.x, b.y, 0, b.x, b.y, r);
      g.addColorStop(0, rgba(col, 0.1 * fo)); g.addColorStop(0.72, rgba(col, 0.16 * fo)); g.addColorStop(0.9, rgba(col, 0.38 * fo)); g.addColorStop(1, rgba(col, 0));
      c.fillStyle = g; c.beginPath(); c.arc(b.x, b.y, r, 0, 6.28); c.fill();
    });
    c.lineCap = 'round';
    for (const d of tend) {
      const k = api.ease.out(win(t, d.d0, d.d0 + 1.0)); if (k <= 0) continue;
      const sx = x + Math.cos(d.a) * R * 0.6, sy = y + Math.sin(d.a) * R * 0.6, ex = x + Math.cos(d.a + d.bend * 0.3) * (R * 0.6 + d.len * k), ey = y + Math.sin(d.a + d.bend * 0.3) * (R * 0.6 + d.len * k);
      c.strokeStyle = rgba(col, 0.22 * fo); c.lineWidth = d.w * (1 - 0.5 * k); c.beginPath(); c.moveTo(sx, sy); c.quadraticCurveTo((sx + ex) / 2 + Math.cos(d.a + 1.57) * d.bend * 40, (sy + ey) / 2 + Math.sin(d.a + 1.57) * d.bend * 40, ex, ey); c.stroke();
    }
    for (const g of gran) { const k = api.ease.out(win(t, g.d0, g.d0 + 1.0)); c.fillStyle = rgba(col, 0.5 * fo * k); c.beginPath(); c.arc(x + Math.cos(g.a) * g.d * k, y + Math.sin(g.a) * g.d * k, g.r, 0, 6.28); c.fill(); }
    const p = api.ease.out(win(t, 0.45, 1.15));
    drawBrush(c, sw, p, col, 0.9 * fo);
    reveal(word, p); place(word, cx, cy, 1, -4, p > 0 ? fo : 0);
    place(name, cx, cy + 160, 1, 0, fo * api.ease.out(win(t, 0.9, 1.3)));
  } };
}

/* ============================================================ 5 SPOTLIGHT */
function spotlight(api) {
  const { rand, player, x, y } = api, dur = 4.5, col = player.color;
  const wisps = [], rim = [];
  for (let i = 0; i < 26; i++) wisps.push({ a0: rand() * 6.28, rf: 1.0 + rand() * 0.4, w: (0.15 + rand() * 0.35) * (rand() < 0.5 ? -1 : 1), s: 90 + rand() * 120, al: 0.18 + rand() * 0.15 });
  for (let i = 0; i < 24; i++) rim.push({ a0: rand() * 6.28, w: 0.3 + rand() * 0.5, s: 1.5 + rand() * 2 });
  const side = x < 1250 ? 1 : -1, tx = clamp(x + side * 470, 260, 1660), ty = clamp(y - 150, 260, 700);
  const S0 = [tx - side * 215, ty + 40], dx = S0[0] - x, dy = S0[1] - y, dl = Math.hypot(dx, dy) || 1, E = [x + dx / dl * 255, y + dy / dl * 255];
  const mid = [(S0[0] + E[0]) / 2 - dy / dl * 70, (S0[1] + E[1]) / 2 + dx / dl * 70];
  const apts = []; for (let i = 0; i <= 36; i++) { const k = i / 36, u = 1 - k; apts.push([u * u * S0[0] + 2 * u * k * mid[0] + k * k * E[0] + (rand() - 0.5) * 2, u * u * S0[1] + 2 * u * k * mid[1] + k * k * E[1] + (rand() - 0.5) * 2]); }
  const arrow = mkBrush(rand, apts, 0, 1, 9, 3, 0.05);
  const ang = Math.atan2(E[1] - mid[1], E[0] - mid[0]);
  const head = [[E[0] - Math.cos(ang - 0.5) * 42, E[1] - Math.sin(ang - 0.5) * 42], E, [E[0] - Math.cos(ang + 0.5) * 42, E[1] - Math.sin(ang + 0.5) * 42]];
  const word = el(api, `font:700 italic 130px ${FS};color:${IVORY};text-shadow:0 0 30px ${rgba(FLAME, 0.7)},0 3px 0 #000`, 'Look here');
  const name = el(api, `font:700 italic 46px ${FS};color:${col};text-shadow:0 2px 0 #000,0 0 14px #000`, player.name);
  const S = sfx(api);
  if (S) {
    S.noise(0, 1.3, { f0: 900, f1: 1500, q: 0.5, g: 0.28, atk: 0.9 }); S.noise(3.6, 0.8, { f0: 1500, f1: 700, q: 0.5, g: 0.18, atk: 0.3 });
    S.tone(0, 1.5, { f0: 90, f1: 70, g: 0.15, atk: 0.8, lp: 300 });
  }
  return { duration: dur, render(t) {
    const c = begin(api);
    const inK = api.ease.out(win(t, 0, 1.1)), outK = api.ease.in(win(t, 3.9, 4.5));
    const hole = lerp(1500, 235, inK) + 1265 * outK + Math.sin(t * 9) * 4 * (1 - outK), A = 0.8 * inK * (1 - outK);
    const g = c.createRadialGradient(x, y, hole * 0.72, x, y, hole * 1.3);
    g.addColorStop(0, 'rgba(13,8,6,0)'); g.addColorStop(1, `rgba(13,8,6,${A.toFixed(3)})`);
    c.fillStyle = g; c.fillRect(PLAY.x, PLAY.y, PLAY.w, PLAY.h);
    wisps.forEach((w) => {
      const a = w.a0 + w.w * t, R = hole * (w.rf + 0.02 * Math.sin(t * 2 + w.a0)), px = x + Math.cos(a) * R, py = y + Math.sin(a) * R * 0.85;
      glow(c, px, py, w.s * (0.6 + 0.4 * inK), [[0, `rgba(46,34,30,${(w.al * inK * (1 - outK)).toFixed(3)})`], [1, 'rgba(46,34,30,0)']]);
    });
    const fl = 0.85 + 0.15 * Math.sin(t * 13) * Math.sin(t * 5.3 + 1), wa = inK * (1 - outK);
    glow(c, x, y, hole * 1.05, [[0, `rgba(255,190,100,${(0.17 * fl * wa).toFixed(3)})`], [0.6, `rgba(255,150,60,${(0.08 * wa).toFixed(3)})`], [1, 'rgba(255,140,40,0)']]);
    c.setLineDash([34, 20]); c.lineDashOffset = -t * 30; c.strokeStyle = rgba(col, 0.55 * wa); c.lineWidth = 3; c.beginPath(); c.arc(x, y, hole * 0.97, 0, 6.28); c.stroke(); c.setLineDash([]);
    for (const r of rim) { const a = r.a0 + r.w * t; c.fillStyle = rgba(FLAME, 0.8 * wa); c.beginPath(); c.arc(x + Math.cos(a) * (hole * 0.97 + 8 * Math.sin(t * 3 + r.a0)), y + Math.sin(a) * (hole * 0.97), r.s, 0, 6.28); c.fill(); }
    const tp = api.ease.out(win(t, 1.0, 1.7)), ap = api.ease.out(win(t, 1.6, 2.2)), ho = 1 - outK;
    drawBrush(c, arrow, ap, 'rgba(0,0,0,.6)', ho * 0.9); drawBrush(c, arrow, ap, IVORY, ho);
    if (ap >= 1) {
      const hp = win(t, 2.2, 2.4); c.globalAlpha = ho; c.lineCap = 'round'; c.lineJoin = 'round';
      c.strokeStyle = IVORY; c.lineWidth = 8; c.beginPath(); c.moveTo(head[0][0], head[0][1]); c.lineTo(lerp(head[0][0], head[1][0], hp), lerp(head[0][1], head[1][1], hp));
      if (hp >= 1) c.lineTo(lerp(head[1][0], head[2][0], win(t, 2.35, 2.5)), lerp(head[1][1], head[2][1], win(t, 2.35, 2.5)));
      c.stroke(); c.globalAlpha = 1;
    }
    reveal(word, tp); place(word, tx, ty, 1, -3, tp > 0 ? ho : 0);
    place(name, tx, ty + 95, 1, 0, ho * api.ease.out(win(t, 1.6, 2.0)));
  } };
}

/* ============================================================ 6 GG */
function gg(api) {
  const { rand, player } = api, dur = 8;
  const GX = 960, GY = 390, FONT = `900 300px ${FT}`;
  // sample the glyph shapes into ember targets
  const off = document.createElement('canvas'); off.width = 760; off.height = 340;
  const o = off.getContext('2d'); o.font = FONT; o.textAlign = 'center'; o.textBaseline = 'middle'; o.fillStyle = '#fff'; o.fillText('GG', 380, 170);
  const img = o.getImageData(0, 0, 760, 340).data, pts = [];
  for (let yy = 0; yy < 340; yy += 8) for (let xx = 0; xx < 760; xx += 8) if (img[(yy * 760 + xx) * 4 + 3] > 128) pts.push([xx, yy]);
  for (let i = pts.length - 1; i > 0; i--) { const j = Math.floor(rand() * (i + 1)); [pts[i], pts[j]] = [pts[j], pts[i]]; }
  if (!pts.length) pts.push([380, 170]);
  const targets = pts.slice(0, 300).map(([px, py]) => {
    const a = rand() * 6.28, rr = 400 + rand() * 400;
    return { tx: GX + px - 380, ty: GY + py - 170, sx: GX + Math.cos(a) * rr, sy: GY + Math.sin(a) * rr * 0.6, d: 0.1 + px / 760 * 1.0 + rand() * 0.2, sw: (rand() - 0.5) * 300, s: 2 + rand() * 2.2, sp: rand() * 6.28 };
  });
  const risers = []; for (let i = 0; i < 40; i++) { const tg = targets[Math.floor(rand() * targets.length)]; risers.push({ tg, per: 1.2 + rand() * 1.0, ph: rand() * 3, h: 70 + rand() * 80 }); }
  const best = (key) => api.tally.reduce((m, r) => (!m || r[key] > m[key] ? r : m), null) || { name: player.name, color: player.color, wows: 0, blunders: 0 };
  const w = best('wows'), b = best('blunders');
  const mk = (label, who, n, unit) => el(api, `font:600 italic 60px ${FS};color:${IVORY};text-shadow:0 2px 0 #000,0 0 16px rgba(0,0,0,.85)`,
    `${label} &middot; <b style="color:${who.color};font-weight:700">${who.name}</b> <span style="font-size:.6em;color:${BRASS}">${n} ${unit}</span>`);
  const L1 = mk('Play of the game', w, w.wows, 'wows'), L2 = mk('Blunder of the game', b, b.blunders, 'blunders');
  const y1 = 600, y2 = 690;
  const br1 = lineBrush(rand, 400, y1 + 44, 1520, y1 + 38, 9, 8, 4, 0.1), br2 = lineBrush(rand, 400, y2 + 44, 1520, y2 + 40, 9, 8, 4, 0.1);
  const S = sfx(api);
  if (S) {
    [[220, 0.3], [330, 0.45], [440, 0.6], [554, 0.8]].forEach(([f, at]) => S.tone(at, 3.2, { type: 'triangle', f0: f, f1: f * 0.995, g: 0.1, atk: 0.4, lp: 1800 }));
    for (let i = 0; i < 40; i++) S.noise(0.2 + api.rand() * 4, 0.03 + api.rand() * 0.04, { type: 'highpass', f0: 3000 + api.rand() * 3000, f1: 5000, g: 0.06 + api.rand() * 0.08 });
    S.noise(0.1, 1.2, { f0: 400, f1: 2500, q: 0.6, g: 0.18, atk: 0.8 });
    S.tone(2.6, 0.5, { type: 'sine', f0: 330, f1: 330, g: 0.06 }); S.tone(4.2, 0.5, { type: 'sine', f0: 247, f1: 247, g: 0.06 });
  }
  return { duration: dur, render(t) {
    const c = begin(api), fo = fade(t, dur, 0.7);
    // solid glowing GG fades in once embers have gathered
    const sa = api.ease.out(win(t, 1.5, 2.6)) * fo;
    if (sa > 0) {
      c.save(); c.font = FONT; c.textAlign = 'center'; c.textBaseline = 'middle'; c.shadowColor = FLAME; c.shadowBlur = 40 + 10 * Math.sin(t * 9);
      c.globalAlpha = sa * 0.8; c.fillStyle = '#ffb347'; c.fillText('GG', GX, GY); c.shadowBlur = 0; c.globalAlpha = sa * 0.5; c.fillStyle = '#fff0b8'; c.fillText('GG', GX, GY - 3); c.restore();
    }
    for (const e of targets) {
      const k = api.ease.inOut(win(t, e.d, e.d + 0.8)); if (t < e.d) continue;
      const bend = Math.sin(k * Math.PI) * e.sw, px = lerp(e.sx, e.tx, k) + bend + (k >= 1 ? Math.sin(t * 17 + e.sp) * 1.5 : 0), py = lerp(e.sy, e.ty, k) + (k >= 1 ? Math.cos(t * 13 + e.sp) * 1.5 : 0);
      const fl = 0.7 + 0.3 * Math.sin(t * 19 + e.sp), a = fo * fl, hot = win(t, 1.0, 2.5);
      c.fillStyle = `rgba(255,${(150 + 70 * hot) | 0},60,${(a * 0.22).toFixed(3)})`; c.beginPath(); c.arc(px, py, e.s * 2.6, 0, 6.28); c.fill();
      c.fillStyle = `rgba(255,${(215 + 30 * hot) | 0},${(120 + 90 * hot) | 0},${a.toFixed(3)})`; c.beginPath(); c.arc(px, py, e.s, 0, 6.28); c.fill();
    }
    for (const r of risers) {
      const tt = t - 1.4 - r.ph; if (tt < 0) continue; const k = (tt % r.per) / r.per;
      c.fillStyle = `rgba(255,${(210 - 110 * k) | 0},90,${((1 - k) * 0.9 * fo).toFixed(3)})`; c.beginPath();
      c.arc(r.tg.tx + Math.sin(tt * 5 + r.ph) * 14, r.tg.ty - r.h * k, 2.2 * (1 - k * 0.6), 0, 6.28); c.fill();
    }
    const p1 = api.ease.out(win(t, 2.6, 3.5)), p2 = api.ease.out(win(t, 4.2, 5.1));
    drawBrush(c, br1, p1, rgba(player.color === w.color ? BRASS : w.color, 0.9), fo); drawBrush(c, br2, p2, rgba(b.color, 0.9), fo);
    reveal(L1, p1); place(L1, GX, y1, 1, 0, p1 > 0 ? fo : 0);
    reveal(L2, p2); place(L2, GX, y2, 1, 0, p2 > 0 ? fo : 0);
  } };
}

export const EFFECTS = { blunder, funny, wow, wololo, spotlight, gg };
