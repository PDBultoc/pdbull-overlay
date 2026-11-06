/* Style D · Chronicle — a dry medieval chronicler and manuscript marginalia: ink, gold dust, candle light, smoke.
   Every render(t) is a pure function of t; all randomness is drawn from api.rand inside make(). All text is canvas text. */
import { PLAY } from './harness.js';

const FT = '"Cinzel", Georgia, serif';
const FS = '"Cormorant Garamond", Georgia, serif';
const IV = '#f4ecdc', IV2 = '#e8dcc4', BR = '#e3c48a', GD = '#c9a56a', DG = '#a8844e';
const OX = '#6e1a12', OX2 = '#8a2418', FLAME = '#ffb347';
const clamp = (v, a, b) => Math.min(b, Math.max(a, v));
const win = (t, a, b) => clamp((t - a) / (b - a), 0, 1);
const lerp = (a, b, k) => a + (b - a) * k;
const fade = (t, dur, len = 0.4) => clamp((dur - t) / len, 0, 1);
const rgb = (hex) => { const h = hex.replace('#', ''); return [parseInt(h.slice(0, 2), 16), parseInt(h.slice(2, 4), 16), parseInt(h.slice(4, 6), 16)]; };
const rgba = (hex, a) => { const [r, g, b] = rgb(hex); return `rgba(${r},${g},${b},${a})`; };
/* the player's colour, desaturated ~30% toward ivory-brown */
function mute(hex) { const a = rgb(hex), b = [185, 168, 140]; return '#' + a.map((v, i) => Math.round(lerp(v, b[i], 0.3)).toString(16).padStart(2, '0')).join(''); }
function mix(hex, to, k) { const a = rgb(hex), b = rgb(to); return '#' + a.map((v, i) => Math.round(lerp(v, b[i], k)).toString(16).padStart(2, '0')).join(''); }

function begin(api) { const c = api.ctx; c.beginPath(); c.rect(PLAY.x, PLAY.y, PLAY.w, PLAY.h); c.clip(); return c; }
function glow(c, x, y, r, stops) {
  const g = c.createRadialGradient(x, y, 0, x, y, r);
  for (const [k, col] of stops) g.addColorStop(k, col);
  c.fillStyle = g; c.beginPath(); c.arc(x, y, r, 0, 6.2832); c.fill();
}

/* ---------- canvas text: segs = [{s, f (font), c (colour)}], y = baseline, p = ink reveal left->right ---------- */
function segW(c, segs, ls) {
  let w = 0;
  for (const g of segs) { c.font = g.f; if ('letterSpacing' in c) c.letterSpacing = ls + 'px'; w += c.measureText(g.s).width; }
  return w;
}
function mw(api, segs, ls = 0) { const c = api.ctx; c.save(); const w = segW(c, segs, ls); c.restore(); return w; }
function rich(c, segs, x, y, o = {}) {
  const { ls = 0, a = 1, p = 1, blur = 14, align = 'c' } = o;
  if (a <= 0 || p <= 0) return 0;
  c.save(); c.textBaseline = 'alphabetic'; c.textAlign = 'left';
  const w = segW(c, segs, ls), x0 = align === 'c' ? x - (w - ls) / 2 : x;
  if (p < 1) { c.beginPath(); c.rect(x0 - 30, y - 300, 30 + w * p, 600); c.clip(); }
  c.globalAlpha = a; c.shadowColor = 'rgba(13,8,6,0.85)'; c.shadowBlur = blur;
  let cx = x0;
  for (const g of segs) { c.font = g.f; if ('letterSpacing' in c) c.letterSpacing = ls + 'px'; c.fillStyle = g.c; c.fillText(g.s, cx, y); cx += c.measureText(g.s).width; }
  c.restore();
  return w;
}
const T = (s, f, c) => [{ s, f, c }];

/* ---------- tapered quill stroke: thin at the ends, full in the middle; p = drawn fraction ---------- */
function taper(c, pts, p, wMax, fill, alpha = 1, minW = 0.6) {
  if (p <= 0) return;
  const n = pts.length - 1, end = p * n, last = Math.min(n, Math.floor(end)), seq = [];
  for (let i = 0; i <= last; i++) seq.push([pts[i][0], pts[i][1], i / n]);
  if (end > last && last < n) { const f = end - last; seq.push([lerp(pts[last][0], pts[last + 1][0], f), lerp(pts[last][1], pts[last + 1][1], f), end / n]); }
  if (seq.length < 2) return;
  const L = [], R = [];
  for (let i = 0; i < seq.length; i++) {
    const a = seq[Math.max(0, i - 1)], b = seq[Math.min(seq.length - 1, i + 1)];
    let dx = b[0] - a[0], dy = b[1] - a[1]; const l = Math.hypot(dx, dy) || 1; dx /= l; dy /= l;
    const w = (minW + wMax * Math.pow(Math.sin(Math.PI * Math.min(1, seq[i][2])), 0.55)) / 2;
    L.push([seq[i][0] - dy * w, seq[i][1] + dx * w]); R.push([seq[i][0] + dy * w, seq[i][1] - dx * w]);
  }
  c.globalAlpha = alpha; c.fillStyle = fill; c.beginPath(); c.moveTo(L[0][0], L[0][1]);
  for (let i = 1; i < L.length; i++) c.lineTo(L[i][0], L[i][1]);
  for (let i = R.length - 1; i >= 0; i--) c.lineTo(R[i][0], R[i][1]);
  c.closePath(); c.fill(); c.globalAlpha = 1;
}
function curve(rand, p0, c1, p1, N, j) {
  const o = [];
  for (let i = 0; i <= N; i++) { const k = i / N, u = 1 - k; o.push([u * u * p0[0] + 2 * u * k * c1[0] + k * k * p1[0] + (rand() - 0.5) * j, u * u * p0[1] + 2 * u * k * c1[1] + k * k * p1[1] + (rand() - 0.5) * j]); }
  return o;
}

/* ---------- dark ink-smoke wash behind text (irregular blurred blobs, ~55% where they overlap) ---------- */
function mkWash(rand, cx, cy, w, h, n) {
  const b = [];
  for (let i = 0; i < n; i++) b.push({ x: cx + (rand() - 0.5) * w * 0.75, y: cy + (rand() - 0.5) * h * 0.45, rx: w * (0.16 + rand() * 0.18), ry: h * (0.28 + rand() * 0.24) });
  return b;
}
function drawWash(c, b, k, a = 1) {
  if (k <= 0 || a <= 0) return;
  for (const s of b) {
    c.save(); c.translate(s.x, s.y); c.scale(s.rx * k, s.ry * k);
    const g = c.createRadialGradient(0, 0, 0, 0, 0, 1);
    g.addColorStop(0, `rgba(13,8,6,${(0.2 * a).toFixed(3)})`); g.addColorStop(0.55, `rgba(26,16,10,${(0.14 * a).toFixed(3)})`); g.addColorStop(1, 'rgba(26,16,10,0)');
    c.fillStyle = g; c.beginPath(); c.arc(0, 0, 1, 0, 6.2832); c.fill(); c.restore();
  }
}

/* ---------- darkening layer with soft top/bottom edges (fades to 0 over 40 px at y 150 and y 850) ---------- */
function mkLayer() { const cv = document.createElement('canvas'); cv.width = PLAY.w; cv.height = PLAY.h; return cv; }
function dimDraw(c, layer, fn) {
  const lc = layer.getContext('2d');
  lc.setTransform(1, 0, 0, 1, 0, 0); lc.globalCompositeOperation = 'source-over'; lc.clearRect(0, 0, PLAY.w, PLAY.h);
  lc.translate(0, -PLAY.y); fn(lc); lc.setTransform(1, 0, 0, 1, 0, 0);
  lc.globalCompositeOperation = 'destination-in';
  const g = lc.createLinearGradient(0, 0, 0, PLAY.h), f = 40 / PLAY.h;
  g.addColorStop(0, 'rgba(0,0,0,0)'); g.addColorStop(f, '#000'); g.addColorStop(1 - f, '#000'); g.addColorStop(1, 'rgba(0,0,0,0)');
  lc.fillStyle = g; lc.fillRect(0, 0, PLAY.w, PLAY.h); lc.globalCompositeOperation = 'source-over';
  c.drawImage(layer, PLAY.x, PLAY.y);
}

/* ---------- synthesised sound ---------- */
function sfx(api) {
  const ac = api.audio; if (!ac) return null;
  try {
    const t0 = ac.currentTime + 0.03, rate = ac.sampleRate, nb = ac.createBuffer(1, (rate * 1.5) | 0, rate), d = nb.getChannelData(0);
    for (let i = 0; i < d.length; i++) d[i] = api.rand() * 2 - 1;
    const master = ac.createGain(); master.gain.value = 0.65; master.connect(ac.destination);
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
      tone(at, dur, { type = 'sine', f0 = 440, f1 = f0, g = 0.2, atk = 0.01, lp = 0 } = {}) {
        const o = ac.createOscillator(); o.type = type;
        o.frequency.setValueAtTime(f0, t0 + at); o.frequency.exponentialRampToValueAtTime(f1, t0 + at + dur);
        const gn = ac.createGain(); env(gn, at, dur, g, Math.min(atk, dur * 0.8));
        let node = o;
        if (lp) { const f = ac.createBiquadFilter(); f.type = 'lowpass'; f.frequency.value = lp; o.connect(f); node = f; }
        node.connect(gn); gn.connect(master); o.start(t0 + at); o.stop(t0 + at + dur + 0.05);
      },
    };
  } catch (e) { return null; }
}

/* ============================================================ 1 BLUNDER */
function blunder(api) {
  const { rand, player } = api, dur = 2.8, pc = mute(player.color);
  const cx = clamp(api.x, 640, 1280), cy = clamp(api.y, 360, 600), tf = 0.5;
  const nameF = `600 84px ${FT}`, nw = mw(api, T(player.name, nameF, IV), 6) + 20, hw = nw / 2 + 38;
  const tw = mw(api, T('Blunder', `600 96px ${FT}`, GD), 18), lw = mw(api, T('The chroniclers will remember this.', `italic 600 42px ${FS}`, IV2), 0);
  const blockW = Math.max(nw, tw, lw) + 120;
  const wash = mkWash(rand, cx, cy - 30, blockW * 1.4 + 200, 600, 16);
  const N = 48, slash = curve(rand, [cx - hw, cy + 30], [cx + (rand() - 0.5) * 40, cy - 14], [cx + hw, cy - 62], N, 2.4);
  const drips = [], pools = [];
  [0.32, 0.5, 0.72, 0.92].forEach((u) => {
    const pt = slash[Math.round(u * N)];
    drips.push({ x: pt[0] + (rand() - 0.5) * 6, y: pt[1] + 8, len: 60 + rand() * 100, w: 8 + rand() * 5, t0: tf + 0.25 * u + 0.08, dl: 1.0 + rand() * 0.5 });
    pools.push({ x: pt[0], y: pt[1] + 4, r: 9 + rand() * 7, t0: tf + 0.25 * u });
  });
  const layer = mkLayer(), S = sfx(api);
  if (S) {
    for (let i = 0; i < 9; i++) S.noise(tf - 0.02 + i * 0.026, 0.04, { type: 'highpass', f0: 2200 + (i % 3) * 700, f1: 3600, g: 0.16 });
    S.noise(tf, 0.2, { f0: 1800, f1: 700, q: 1.5, g: 0.2, atk: 0.01 });
    S.tone(tf + 0.26, 0.5, { f0: 90, f1: 42, g: 0.7, atk: 0.006 }); S.noise(tf + 0.26, 0.25, { type: 'lowpass', f0: 400, f1: 120, g: 0.35 });
  }
  return { duration: dur, render(t) {
    const c = begin(api), fo = fade(t, dur, 0.5), e = api.ease;
    drawWash(c, wash, e.out(win(t, 0, 0.5)), fo * 1.3);
    // candle flinch: a 0.15 s dip, a warm shadow sweeping from the left
    const bump = t < tf ? 0 : t < tf + 0.15 ? (t - tf) / 0.15 : Math.exp(-(t - tf - 0.15) / 0.45);
    if (bump > 0.005) {
      dimDraw(c, layer, (lc) => {
        const A = 0.5 * bump * fo, sx = -420 + 2800 * win(t, tf, tf + 0.95);
        lc.fillStyle = `rgba(13,8,6,${(A * 0.4).toFixed(3)})`; lc.fillRect(0, PLAY.y, PLAY.w, PLAY.h);
        const g = lc.createLinearGradient(sx - 520, 0, sx + 520, 0);
        g.addColorStop(0, 'rgba(26,16,10,0)'); g.addColorStop(0.5, `rgba(26,16,10,${A.toFixed(3)})`); g.addColorStop(1, 'rgba(26,16,10,0)');
        lc.fillStyle = g; lc.fillRect(0, PLAY.y, PLAY.w, PLAY.h);
      });
    }
    rich(c, T('Blunder', `600 96px ${FT}`, GD), cx, cy - 100, { ls: 18, a: fo * e.out(win(t, 0.12, 0.5)), blur: 20 });
    rich(c, T(player.name, nameF, IV), cx, cy + 30, { ls: 6, a: fo, p: e.out(win(t, 0, 0.42)), blur: 18 });
    // the quill slash, over the name
    const sp = e.out(win(t, tf, tf + 0.25));
    taper(c, slash, sp, 19, OX2, fo, 1.5);
    taper(c, slash, sp, 5, 'rgba(244,236,220,0.16)', fo, 0.4);
    for (const q of pools) { const k = e.out(win(t, q.t0, q.t0 + 0.5)); if (k > 0) { c.globalAlpha = fo; c.fillStyle = OX; c.beginPath(); c.arc(q.x, q.y, q.r * k, 0, 6.2832); c.fill(); } }
    for (const d of drips) {
      const k = e.out(win(t, d.t0, d.t0 + d.dl)); if (k <= 0) continue;
      const L = d.len * k; c.globalAlpha = fo; c.fillStyle = OX; c.strokeStyle = OX; c.lineCap = 'round';
      c.lineWidth = d.w * (1 - 0.35 * k); c.beginPath(); c.moveTo(d.x, d.y); c.lineTo(d.x, d.y + L); c.stroke();
      c.beginPath(); c.arc(d.x, d.y + L, d.w * 0.8, 0, 6.2832); c.fill();
    }
    c.globalAlpha = 1;
    rich(c, T('The chroniclers will remember this.', `italic 600 42px ${FS}`, IV2), cx, cy + 108, { a: fo, p: e.out(win(t, 1.0, 1.7)), blur: 16 });
    c.globalAlpha = fo * e.out(win(t, 1.0, 1.5)) * 0.8;
    taper(c, [[cx - 60, cy + 126], [cx, cy + 130], [cx + 60, cy + 126]], 1, 2.4, pc, fo * e.out(win(t, 1.1, 1.6)), 0.5);
  } };
}

/* ============================================================ 2 FUNNY (marginalia) */
const ellPts = (cx, cy, rx, ry, n, a0 = 0, a1 = 6.2832) => { const o = []; for (let i = 0; i <= n; i++) { const a = a0 + (a1 - a0) * i / n; o.push([cx + Math.cos(a) * rx, cy + Math.sin(a) * ry]); } return o; };
function hatch(cx, cy, rx, ry, step) {
  const o = [];
  for (let yy = cy - ry + step * 0.6; yy < cy + ry - 2; yy += step) { const hw = rx * Math.sqrt(Math.max(0, 1 - ((yy - cy) / ry) ** 2)) * 0.85; o.push({ p: [[cx - hw, yy + 3], [cx + hw, yy - 3]], h: 1 }); }
  for (let yy = cy + step * 0.3; yy < cy + ry - 2; yy += step) { const hw = rx * Math.sqrt(Math.max(0, 1 - ((yy - cy) / ry) ** 2)) * 0.8; o.push({ p: [[cx - hw, yy - 3], [cx + hw, yy + 3]], h: 1 }); }
  return o;
}
function human(x, y, k, o) {
  const S = [], run = o.run || 0, bob = run ? [0, -3, 0][k] : 0, a = [0.6, 0, -0.6][k] * run;
  const hip = [x, y - 44 + bob], sh = [x + o.lean, y - 78 + bob], hd = [sh[0] + o.lean * 0.3 + 3, y - 91 + bob];
  S.push({ p: ellPts(hd[0], hd[1], 9, 10, 12), f: 1 });
  S.push({ p: [hip, [(hip[0] + sh[0]) / 2 - 1, (hip[1] + sh[1]) / 2], sh] });
  if (o.robe) {
    S.push({ p: [sh, [x - 15, y - 22], [x - 13, y - 3], [x + 13, y - 3], [x + 15, y - 22], sh], f: 1 });
    S.push({ p: [[x - 4, y - 36], [x - 6, y - 4]] }); S.push({ p: [[x - 6, y], [x - 14, y]] }); S.push({ p: [[x + 8, y], [x + 16, y]] });
  } else {
    for (const s of [1, -1]) {
      const g = a * s, kn = [hip[0] + Math.sin(g) * 20, hip[1] + Math.cos(g) * 22];
      const ft = [hip[0] + Math.sin(g) * 34, Math.min(y, hip[1] + Math.cos(g) * 42) - (run && g < 0 ? 8 : 0)];
      S.push({ p: [hip, kn, ft, [ft[0] + 7, ft[1]]] });
    }
  }
  const hands = [];
  o.arms(k).forEach(([dx, dy]) => { const h = [sh[0] + dx, sh[1] + dy]; hands.push(h); S.push({ p: [sh, [sh[0] + dx * 0.5, sh[1] + dy * 0.5 + 6], h] }); });
  S.push({ p: [[hd[0] + 4, hd[1] - 2], [hd[0] + 7, hd[1] - 2]], d: 1 });
  S.push({ p: o.mouth ? ellPts(hd[0] + 5, hd[1] + 5, 2.4, 3, 6) : [[hd[0] + 3, hd[1] + 5], [hd[0] + 7, hd[1] + 5]], d: 1 });
  if (o.hat === 'hood') S.push({ p: [[hd[0] - 10, hd[1] + 2], [hd[0] - 6, hd[1] - 14], [hd[0] + 3, hd[1] - 17], [hd[0] + 10, hd[1] - 4]] });
  if (o.hat === 'helm') {
    S.push({ p: ellPts(hd[0], hd[1] - 2, 11, 11, 8, Math.PI, 6.2832) }); S.push({ p: [[hd[0] - 2, hd[1] - 13], [hd[0] - 14, hd[1] - 23], [hd[0] - 22, hd[1] - 12]] });
    S.push({ p: [[hd[0] + 1, hd[1]], [hd[0] + 11, hd[1]]] });
  }
  if (o.hat === 'monk') { S.push({ p: ellPts(hd[0], hd[1] - 9, 6, 2.5, 8) }); S.push({ p: [[hd[0] - 10, hd[1] + 2], [hd[0] - 12, hd[1] + 14], [hd[0] - 4, hd[1] + 16]] }); }
  if (o.hatch) for (let i = 0; i < 3; i++) { const yy = sh[1] + 8 + i * 8, xm = lerp(sh[0], hip[0], 0.2 + i * 0.25); S.push({ p: [[xm - 6, yy + 2], [xm + 6, yy - 2]], h: 1 }); }
  return { S, sh, hands };
}
function chicken(x, y, k) {
  const S = [];
  S.push({ p: ellPts(x, y - 22, 16, 12, 18), f: 1 }); S.push(...hatch(x, y - 22, 16, 12, 5));
  S.push({ p: ellPts(x + 18, y - 38, 6, 6, 10), f: 1 }); S.push({ p: [[x + 24, y - 38], [x + 31, y - 36], [x + 24, y - 34]] });
  S.push({ p: [[x + 15, y - 44], [x + 17, y - 50], [x + 19, y - 45], [x + 22, y - 50]] });
  S.push({ p: [[x + 19, y - 40], [x + 21, y - 40]], d: 1 });
  S.push({ p: [[x - 15, y - 26], [x - 24, y - 36], [x - 21, y - 28], [x - 31, y - 40], [x - 24, y - 24]] });
  S.push({ p: [[x - 2, y - 24], [x - 10, y - 24 - [4, 13, 4][k]], [x - 17, y - 25]] });
  const fx = [-7, 0, 7][k];
  S.push({ p: [[x - 2, y - 11], [x + fx * 0.6, y - 5], [x + fx - 1, y]] }); S.push({ p: [[x + 5, y - 11], [x - fx * 0.6 + 4, y - 5], [x - fx + 3, y]] });
  for (let i = 0; i < 3; i++) S.push({ p: [[x - 36 - i * 4, y - 14 - i * 7], [x - 48 - i * 4, y - 14 - i * 7]], h: 1 });
  return S;
}
function sheep(x, y, k) {
  const S = [], body = [];
  for (let i = 0; i <= 40; i++) { const a = i / 40 * 6.2832, r = 1 + 0.14 * Math.abs(Math.sin(a * 5)); body.push([x + Math.cos(a) * 27 * r, y - 30 + Math.sin(a) * 18 * r]); }
  S.push({ p: body, f: 1 }); S.push(...hatch(x, y - 30, 24, 15, 5));
  S.push({ p: ellPts(x + 32, y - 36, 9, 7, 12), f: 1 }); S.push({ p: [[x + 27, y - 41], [x + 20, y - 45], [x + 26, y - 36]] }); S.push({ p: [[x + 34, y - 38], [x + 37, y - 38]], d: 1 });
  [-16, -8, 8, 16].forEach((lx, i) => { const sw = [-6, 0, 6][(k + i) % 3]; S.push({ p: [[x + lx, y - 14], [x + lx + sw * 0.5, y - 7], [x + lx + sw, y]] }); });
  return S;
}
function donkey(x, y, k) {
  const S = [], kick = [0, 6, 22][k], lift = [0, 4, 26][k];
  S.push({ p: ellPts(x, y - 40, 30, 14, 20), f: 1 }); S.push(...hatch(x, y - 40, 30, 14, 5));
  S.push({ p: [[x + 24, y - 48], [x + 31, y - 60], [x + 38, y - 70]] }); S.push({ p: ellPts(x + 46, y - 72, 11, 7, 12), f: 1 });
  S.push({ p: [[x + 40, y - 78], [x + 37, y - 96]] }); S.push({ p: [[x + 46, y - 78], [x + 48, y - 94]] }); S.push({ p: [[x + 50, y - 73], [x + 52, y - 73]], d: 1 });
  S.push({ p: [[x + 18, y - 28], [x + 18, y - 14], [x + 20, y]] }); S.push({ p: [[x + 8, y - 28], [x + 8, y - 14], [x + 9, y]] });
  S.push({ p: [[x - 16, y - 28], [x - 18 - kick * 0.5, y - 16 - lift * 0.5], [x - 18 - kick, y - lift]] }); S.push({ p: [[x - 24, y - 30], [x - 26, y - 15], [x - 27, y]] });
  S.push({ p: [[x - 30, y - 44], [x - 40, y - 38 - lift * 0.3], [x - 42, y - 28 - lift * 0.4]] });
  return S;
}
const mapSt = (S, fn) => S.map((s) => ({ ...s, p: s.p.map(fn) }));
function sceneVillager(k) {
  const bob = [0, -3, 0][k], sh = [-72 + 8, -78 + bob], hand = [sh[0] + 26, sh[1] - 6];
  const h = human(-72, 0, k, { run: 1, lean: 8, hat: 'hood', hatch: 1, arms: () => [[26, -6], [14, 6]] });
  const tx = hand[0] + 46, ty = hand[1] - 14, S = h.S;
  S.push({ p: [[hand[0] - 16, hand[1] + 6], [tx, ty]] }); S.push({ p: [[tx - 2, ty - 9], [tx + 2, ty + 9]] });
  S.push({ p: [[tx, ty - 9], [tx + 16, ty - 13]] }); S.push({ p: [[tx, ty], [tx + 18, ty - 4]] }); S.push({ p: [[tx, ty + 9], [tx + 16, ty + 5]] });
  S.push(...chicken(66, 0, k));
  return S;
}
function sceneSheep(k) {
  const S = sheep(-76, 0, k);
  S.push(...human(60, 0, k, { run: 1, lean: 10, hat: 'helm', hatch: 1, mouth: 1, arms: (kk) => [[-8, -[16, 26, 14][kk]], [14, -[26, 12, 22][kk]]] }).S);
  return S;
}
function sceneMonk(k) {
  const S = donkey(-6, 0, k), ang = [-0.12, -1.1, -2.9][k], tr = [[0, 0], [-14, -14], [-40, -52]][k], pv = [0, -48];
  const m = human(0, 0, 0, { run: 0, lean: -2, robe: 1, hat: 'monk', mouth: 1, arms: () => [[18, -[14, 22, 30][k]], [-14, -[22, 30, 20][k]]] }).S;
  const ca = Math.cos(ang), sa = Math.sin(ang);
  S.push(...mapSt(m, ([px, py]) => { const x = px, y = py - 48 + 6, dx = x - pv[0], dy = y - pv[1]; return [pv[0] + dx * ca - dy * sa + tr[0], pv[1] + dx * sa + dy * ca + tr[1]]; }));
  return S;
}
function funny(api) {
  const { rand, player } = api, dur = 3.6, pc = mute(player.color), SC = 1.85, GY = 838;
  const jt = []; for (let i = 0; i < 256; i++) jt.push((rand() - 0.5) * 1.8);
  const fin = (S, k) => S.map((s, si) => ({ ...s, p: s.p.map(([x, y], pi) => [x + jt[(si * 7 + pi * 3 + k * 11) % 256], y + jt[(si * 5 + pi * 13 + k * 17 + 3) % 256]]) }));
  const mk = (cx, build, sp) => ({ cx, sp, poses: [0, 1, 2].map((k) => fin(build(k), k)) });
  const scenes = [mk(420, sceneVillager, 150), mk(960, sceneSheep, 150), mk(1500, sceneMonk, 0)];
  scenes.forEach((s) => { s.tot = s.poses[0].reduce((a, st) => a + st.p.length, 0); });
  const wash = mkWash(rand, 960, 690, 1900, 440, 16);
  const gl = []; for (let i = 0; i <= 24; i++) gl.push([-170 + i * 14.2, 3 + Math.sin(i * 0.9) * 1.6 + (rand() - 0.5) * 1.4]);
  const S = sfx(api);
  if (S) {
    for (let i = 0; i < 26; i++) S.noise(0.2 + i * 0.1, 0.05, { f0: 2600 + (i % 4) * 600, f1: 3800, q: 2.5, g: 0.1 });
    [0, 1, 2, 3, 4].forEach((i) => S.tone(1.5 + i * 0.17, 0.14, { type: 'sawtooth', f0: 150 - (i % 2) * 14, f1: 120 - (i % 2) * 10, g: 0.2, atk: 0.02, lp: 520 }));
    S.tone(2.5, 0.3, { type: 'sawtooth', f0: 130, f1: 90, g: 0.16, atk: 0.03, lp: 450 });
  }
  return { duration: dur, render(t) {
    const c = begin(api), fo = fade(t, dur, 0.5), e = api.ease;
    drawWash(c, wash, e.out(win(t, 0, 0.6)), fo * 1.3);
    scenes.forEach((sc, i) => {
      const t0 = 0.2 + i * 0.4, t1 = t0 + 1.1, p = win(t, t0, t1);
      if (p <= 0) return;
      const k = t < t1 ? 0 : [0, 1, 2, 1][Math.floor((t - t1) * 6) % 4], allow = p * sc.tot;
      c.save(); c.translate(sc.cx, GY); c.scale(SC, SC); c.lineCap = 'round'; c.lineJoin = 'round'; c.globalAlpha = fo;
      // ground: a wavy pen line with ticks that scroll like a flip-book
      c.strokeStyle = DG; c.lineWidth = 1.3 / SC; c.beginPath(); const gn = Math.floor(p * gl.length);
      for (let g = 0; g < gn; g++) { if (g) c.lineTo(gl[g][0], gl[g][1]); else c.moveTo(gl[g][0], gl[g][1]); } c.stroke();
      if (p > 0.3) for (let g = 0; g < 12; g++) { const xx = (((g * 30 - sc.sp * t) % 360) + 360) % 360 - 180; c.globalAlpha = fo * 0.8; c.beginPath(); c.moveTo(xx, 7); c.lineTo(xx - 8, 12); c.stroke(); }
      c.globalAlpha = fo;
      let used = 0;
      const vis = [];
      sc.poses[k].forEach((st, si) => {
        const n = Math.min(st.p.length, Math.max(0, Math.floor(allow - used))); used += sc.poses[0][si].p.length; if (n >= 2) vis.push([st, n]);
      });
      const path = (st, n) => { c.beginPath(); c.moveTo(st.p[0][0], st.p[0][1]); for (let q = 1; q < n; q++) c.lineTo(st.p[q][0], st.p[q][1]); };
      // pass 1: dark walnut under-stroke; pass 2: ivory body fill; pass 3: ink / brass lines
      c.strokeStyle = '#1a100a'; c.lineWidth = 7 / SC; c.globalAlpha = fo * 0.85;
      for (const [st, n] of vis) if (!st.h && !st.d) { path(st, n); c.stroke(); }
      c.fillStyle = IV2; c.globalAlpha = fo * 0.85;
      for (const [st, n] of vis) if (st.f && n === st.p.length) { path(st, n); c.fill(); }
      for (const [st, n] of vis) {
        path(st, n);
        c.strokeStyle = st.d ? '#2a1a10' : st.h ? DG : IV; c.lineWidth = (st.d ? 2.6 : st.h ? 1.8 : 3.5) / SC; c.globalAlpha = fo * (st.h ? 0.9 : 1); c.stroke();
      }
      c.restore();
    });
    const a = fo * e.out(win(t, 0.3, 0.9));
    rich(c, [{ s: 'The scribes are laughing.', f: `italic 600 48px ${FS}`, c: IV }], 960, 566, { a, p: e.out(win(t, 0.3, 1.1)), blur: 16 });
    rich(c, [{ s: player.name, f: `600 40px ${FT}`, c: pc }], 960, 614, { ls: 8, a: fo * e.out(win(t, 0.8, 1.3)), blur: 12 });
    taper(c, [[820, 626], [960, 630], [1100, 626]], 1, 2.2, pc, fo * e.out(win(t, 1.0, 1.5)), 0.5);
  } };
}

/* ============================================================ 3 WOW */
function wow(api) {
  const { rand, player, x, y } = api, dur = 3.2, pc = mute(player.color);
  const yb = clamp(y - 80, 380, 640);
  const LF = `900 230px ${FT}`, RF = `600 110px ${FT}`;
  const wL = mw(api, T('L', LF, GD), 0), wR = mw(api, T('egendary', RF, IV), 8), total = wL + 6 + wR;
  const cx = clamp(x, 60 + total / 2 + 30, 1860 - total / 2 - 30), left = cx - total / 2, rx0 = left + wL + 6 - 2;
  const LH = 165;
  const wash = mkWash(rand, cx, yb - 20, total + 460, 380, 11);
  // sample the capital L into dust targets
  const off = document.createElement('canvas'); off.width = 360; off.height = 320;
  const o = off.getContext('2d'); o.font = LF; o.textBaseline = 'alphabetic'; o.fillStyle = '#fff'; o.fillText('L', 30, 270);
  const img = o.getImageData(0, 0, 360, 320).data, pts = [];
  for (let yy = 0; yy < 320; yy += 7) for (let xx = 0; xx < 360; xx += 7) if (img[(yy * 360 + xx) * 4 + 3] > 128) pts.push([xx, yy]);
  for (let i = pts.length - 1; i > 0; i--) { const j = Math.floor(rand() * (i + 1)); [pts[i], pts[j]] = [pts[j], pts[i]]; }
  if (!pts.length) pts.push([60, 200]);
  const cols = [BR, GD, IV2, BR, DG];
  const dust = [];
  pts.slice(0, 170).forEach(([px, py]) => {
    const a = rand() * 6.2832, sp = 300 + rand() * 650;
    dust.push({ vx: Math.cos(a) * sp, vy: Math.sin(a) * sp - 80, t0: rand() * 0.1, dl: rand() * 0.3, tx: left + px - 30, ty: yb + py - 270, sw: (rand() - 0.5) * 220, s: 1.8 + rand() * 2.2, col: cols[Math.floor(rand() * 5)], rl: rand() * 0.5, sp: rand() * 6.28, tg: 1 });
  });
  for (let i = 0; i < 90; i++) { const a = rand() * 6.2832, sp = 150 + rand() * 750; dust.push({ vx: Math.cos(a) * sp, vy: Math.sin(a) * sp - 140, t0: rand() * 0.15, s: 1.4 + rand() * 2.2, col: cols[Math.floor(rand() * 5)], life: 1.4 + rand() * 1.2, sp: rand() * 6.28, tg: 0 }); }
  const tongues = []; for (let i = 0; i < 10; i++) { const a = -1.57 + (rand() - 0.5) * 2.4, sp = 120 + rand() * 260; tongues.push({ vx: Math.cos(a) * sp, vy: Math.sin(a) * sp, t0: rand() * 0.15, life: 0.35 + rand() * 0.25, s: 30 + rand() * 30 }); }
  // filigree: ivory vine + curls around the capital, drawn progressively
  const spiral = (sx, sy, r, turns, dir, a0) => { const o2 = []; for (let i = 0; i <= 22; i++) { const k = i / 22, a = a0 + dir * k * turns * 6.2832, rr = r * (1 - 0.8 * k); o2.push([sx + Math.cos(a) * rr, sy + Math.sin(a) * rr]); } return o2; };
  const fil = [];
  { const vine = []; for (let i = 0; i <= 30; i++) { const k = i / 30; vine.push([left - 12 + Math.sin(k * 14) * 5, yb + 4 - k * (LH + 8)]); } fil.push(vine); }
  { const base = []; for (let i = 0; i <= 30; i++) { const k = i / 30; base.push([left - 12 + k * (wL + 30), yb + 16 + Math.sin(k * 16) * 3]); } fil.push(base); }
  fil.push(spiral(left - 18, yb - LH - 10, 14, 1.4, 1, 3.5)); fil.push(spiral(left - 24, yb - LH * 0.55, 11, 1.3, -1, 0));
  fil.push(spiral(left + wL + 24, yb + 12, 12, 1.4, 1, 3.1)); fil.push(spiral(left + 18, yb + 30, 9, 1.2, -1, 1));
  fil.push(spiral(left + 14, yb - LH - 22, 9, 1.2, -1, 4.5));
  const filTot = fil.reduce((a, f) => a + f.length, 0);
  const S = sfx(api);
  if (S) {
    S.noise(0, 0.7, { f0: 500, f1: 2600, q: 0.7, g: 0.35, atk: 0.2 }); S.tone(0, 0.5, { type: 'sawtooth', f0: 110, f1: 300, g: 0.05, atk: 0.25, lp: 800 });
    for (let i = 0; i < 16; i++) S.noise(0.4 + api.rand() * 1.6, 0.04, { type: 'highpass', f0: 4500, f1: 6000, g: 0.05 });
    S.tone(1.15, 1.6, { f0: 1318, f1: 1316, g: 0.14, atk: 0.003 }); S.tone(1.15, 1.0, { f0: 3320, f1: 3300, g: 0.04, atk: 0.003 }); S.tone(1.15, 1.2, { f0: 2093, f1: 2090, g: 0.05, atk: 0.003 });
  }
  const dustPos = (p, t) => {
    const dt = t - p.t0; if (dt < 0) return null;
    const bt = Math.min(dt, 0.45), f = (1 - Math.exp(-4 * bt)) / 4, bx = x + p.vx * f, by = y + p.vy * f;
    if (!p.tg) { const tt = Math.max(0, dt - 0.45); return [bx + p.vx * 0.04 * tt + Math.sin(dt * 2 + p.sp) * 8 * tt, by + 36 * tt + 26 * tt * tt, Math.pow(1 - clamp(dt / p.life, 0, 1), 0.8)]; }
    const k = api.ease.inOut(win(dt, 0.45, 1.15 + p.dl));
    let px = lerp(bx, p.tx, k) + Math.sin(k * Math.PI) * p.sw, py = lerp(by, p.ty, k);
    const rt = t - (2.1 + p.rl); let al = 1;
    if (k >= 1) { px += Math.sin(t * 7 + p.sp) * 1.2; py += Math.cos(t * 6 + p.sp) * 1.2; }
    if (rt > 0) { py += 34 * rt + 40 * rt * rt; px += Math.sin(rt * 3 + p.sp) * 10 * rt; al = 1 - win(rt, 0.1, 0.95); }
    return [px, py, al];
  };
  return { duration: dur, render(t) {
    const c = begin(api), fo = fade(t, dur, 0.5), e = api.ease;
    drawWash(c, wash, e.out(win(t, 0.3, 1.1)), fo);
    // short amber flare at the burst
    const k0 = win(t, 0, 0.55);
    if (k0 > 0 && k0 < 1) glow(c, x, y, 60 + 200 * e.out(k0), [[0, `rgba(255,240,200,${(0.85 * (1 - k0)).toFixed(3)})`], [0.4, `rgba(255,179,71,${(0.6 * (1 - k0)).toFixed(3)})`], [1, 'rgba(255,179,71,0)']]);
    for (const f of tongues) {
      const dt = t - f.t0; if (dt < 0 || dt > f.life) continue; const k = dt / f.life, fp = (1 - Math.exp(-3 * dt)) / 3, al = (1 - k) * 0.7;
      glow(c, x + f.vx * fp, y + f.vy * fp - 30 * dt, f.s * (1 - 0.5 * k), [[0, `rgba(255,236,190,${al.toFixed(3)})`], [0.45, `rgba(255,179,71,${(al * 0.7).toFixed(3)})`], [1, 'rgba(255,179,71,0)']]);
    }
    for (const p of dust) {
      const r = dustPos(p, t); if (!r) continue; const a = r[2] * fo * (0.7 + 0.3 * Math.sin(t * 20 + p.sp)); if (a <= 0) continue;
      c.fillStyle = rgba(p.col, 0.2 * a); c.beginPath(); c.arc(r[0], r[1], p.s * 2.6, 0, 6.2832); c.fill();
      c.fillStyle = rgba(p.col, a); c.beginPath(); c.arc(r[0], r[1], p.s, 0, 6.2832); c.fill();
    }
    // gold-leaf capital
    const la = e.out(win(t, 1.15, 1.75)) * fo;
    if (la > 0) {
      c.save(); c.font = LF; c.textBaseline = 'alphabetic'; c.textAlign = 'left'; if ('letterSpacing' in c) c.letterSpacing = '0px';
      const g = c.createLinearGradient(left, yb - LH, left + wL, yb);
      g.addColorStop(0, BR); g.addColorStop(0.45, GD); g.addColorStop(0.7, '#b89a5e'); g.addColorStop(1, DG);
      c.globalAlpha = la; c.shadowColor = 'rgba(13,8,6,0.8)'; c.shadowBlur = 20; c.fillStyle = g; c.fillText('L', left, yb);
      c.shadowBlur = 0; c.strokeStyle = 'rgba(244,236,220,0.4)'; c.lineWidth = 1.2; c.strokeText('L', left, yb);
      c.restore();
    }
    // ivory filigree
    const fp = e.out(win(t, 1.1, 2.1)) * filTot; let used = 0;
    c.lineCap = 'round'; c.strokeStyle = IV; c.lineWidth = 1.4; c.globalAlpha = 0.85 * fo;
    for (const f of fil) { const n = Math.min(f.length, Math.floor(fp - used)); used += f.length; if (n < 2) continue; c.beginPath(); c.moveTo(f[0][0], f[0][1]); for (let i = 1; i < n; i++) c.lineTo(f[i][0], f[i][1]); c.stroke(); }
    c.globalAlpha = 1;
    rich(c, T('egendary', RF, IV), rx0, yb, { ls: 8, align: 'l', a: fo, p: e.out(win(t, 1.5, 2.2)), blur: 18 });
    rich(c, T(player.name, `600 44px ${FT}`, pc), cx, yb + 92, { ls: 10, a: fo * e.out(win(t, 1.9, 2.4)), blur: 14 });
  } };
}

/* ============================================================ 4 WOLOLO */
function wololo(api) {
  const { rand, x, y } = api, dur = 2.6, R = 300;
  const pig = mute(api.player.color), rim = mix(pig, '#2a1a10', 0.45);
  const cx = clamp(x, 560, 1360), cy = clamp(y, 380, 640);
  const blobs = [], sats = [], gran = [];
  for (let i = 0; i < 12; i++) { const a = rand() * 6.2832, d = rand() * R * 0.3; blobs.push({ x: x + Math.cos(a) * d, y: y + Math.sin(a) * d * 0.8, r: R * (0.5 + rand() * 0.45), d0: rand() * 0.35 }); }
  for (let i = 0; i < 20; i++) { const a = rand() * 6.2832; sats.push({ x: x + Math.cos(a) * R * (0.65 + rand() * 0.3), y: y + Math.sin(a) * R * (0.55 + rand() * 0.3), r: R * (0.12 + rand() * 0.16), d0: 0.25 + rand() * 0.4 }); }
  for (let i = 0; i < 170; i++) { const a = rand() * 6.2832, d = Math.sqrt(rand()) * R * 1.05; gran.push({ x: x + Math.cos(a) * d, y: y + Math.sin(a) * d * 0.85, r: 0.8 + rand() * 1.8, a: 0.25 + rand() * 0.4, dk: rand() < 0.6, d: d / R }); }
  const wash = mkWash(rand, cx, cy - 30, 900, 280, 8);
  const S = sfx(api);
  if (S) {
    S.noise(0, 1.6, { type: 'lowpass', f0: 240, f1: 1100, q: 1.5, g: 0.2, atk: 0.8 });
    S.tone(0.1, 1.6, { f0: 196, f1: 262, g: 0.07, atk: 0.8, lp: 600 });
    for (let i = 0; i < 6; i++) S.tone(0.3 + i * 0.17 + api.rand() * 0.06, 0.2, { f0: 600 + api.rand() * 300, f1: 300 + api.rand() * 150, g: 0.05, lp: 1400 });
  }
  return { duration: dur, render(t) {
    const c = begin(api), fo = fade(t, dur, 0.7), e = api.ease;
    const drawBlob = (b, k, wet) => {
      const r = b.r * k; if (r < 2) return;
      const g = c.createRadialGradient(b.x, b.y, 0, b.x, b.y, r);
      g.addColorStop(0, rgba(pig, 0.1 * fo)); g.addColorStop(0.7, rgba(pig, 0.17 * fo)); g.addColorStop(0.9, rgba(rim, 0.34 * wet * fo)); g.addColorStop(0.97, rgba(rim, 0.2 * wet * fo)); g.addColorStop(1, rgba(pig, 0));
      c.fillStyle = g; c.beginPath(); c.arc(b.x, b.y, r, 0, 6.2832); c.fill();
    };
    for (const b of blobs) drawBlob(b, e.out(win(t, b.d0, b.d0 + 1.3)), 1);
    for (const s of sats) drawBlob(s, e.out(win(t, s.d0, s.d0 + 1.0)), 1);
    const bloom = e.out(win(t, 0, 1.5)) * 1.1;
    for (const g of gran) { if (g.d > bloom) continue; c.fillStyle = g.dk ? rgba(rim, g.a * fo) : rgba('#f4ecdc', g.a * 0.5 * fo); c.fillRect(g.x, g.y, g.r * 1.4, g.r); }
    drawWash(c, wash, e.out(win(t, 0.4, 1.1)), fo);
    rich(c, T('Wololo.', `italic 600 170px ${FS}`, IV), cx, cy + 40, { ls: 3, a: fo, p: e.out(win(t, 0.7, 1.4)), blur: 22 });
  } };
}

/* ============================================================ 5 SPOTLIGHT */
function spotlight(api) {
  const { rand, x, y } = api, dur = 4.5, pc = mute(api.player.color), HR = 225;
  const side = x < 1100 ? 1 : -1, tx = clamp(x + side * 640, 340, 1580), ty = clamp(y - 100, 300, 700);
  const wash = mkWash(rand, tx, ty - 30, 640, 200, 6);
  const tw = mw(api, T('Look here.', `italic 600 118px ${FS}`, IV), 2);
  const S0 = [tx - side * (tw / 2 + 24), ty - 30], dx = S0[0] - x, dy = S0[1] - y, dl = Math.hypot(dx, dy) || 1;
  const E = [x + dx / dl * (HR + 22), y + dy / dl * (HR + 22)], mid = [(S0[0] + E[0]) / 2 - dy / dl * 55, (S0[1] + E[1]) / 2 + dx / dl * 55];
  const arrow = curve(rand, S0, mid, E, 40, 2);
  const ang = Math.atan2(E[1] - mid[1], E[0] - mid[0]);
  const hd = [-0.5, 0.5].map((da) => [[E[0], E[1]], [E[0] - Math.cos(ang + da) * 22, E[1] - Math.sin(ang + da) * 22], [E[0] - Math.cos(ang + da) * 44, E[1] - Math.sin(ang + da) * 44]]);
  const layer = mkLayer();
  const S = sfx(api);
  if (S) { S.noise(0, 1.3, { f0: 700, f1: 1100, q: 0.5, g: 0.2, atk: 0.9 }); S.tone(0, 1.5, { f0: 85, f1: 68, g: 0.12, atk: 0.8, lp: 300 }); S.noise(3.7, 0.8, { f0: 1100, f1: 600, q: 0.5, g: 0.12, atk: 0.3 }); }
  return { duration: dur, render(t) {
    const c = begin(api), e = api.ease;
    const inK = e.out(win(t, 0, 1.1)), outK = e.in(win(t, 3.9, 4.5)), A = 0.7 * inK * (1 - outK), vis = inK * (1 - outK);
    const R = (lerp(1500, HR, inK) + 1300 * outK) * (1 + 0.025 * Math.sin(t * 11) * Math.sin(t * 4.7 + 1)), fl = 0.85 + 0.15 * Math.sin(t * 13) * Math.sin(t * 5.3 + 1);
    dimDraw(c, layer, (lc) => {
      const g = lc.createRadialGradient(x, y, R * 0.7, x, y, R * 1.3);
      g.addColorStop(0, 'rgba(13,8,6,0)'); g.addColorStop(0.5, `rgba(13,8,6,${(A * 0.5).toFixed(3)})`); g.addColorStop(1, `rgba(13,8,6,${A.toFixed(3)})`);
      lc.fillStyle = g; lc.fillRect(0, PLAY.y, PLAY.w, PLAY.h);
      const w = lc.createRadialGradient(x, y, 0, x, y, R * 1.05);
      w.addColorStop(0, `rgba(227,196,138,${(0.14 * fl * vis).toFixed(3)})`); w.addColorStop(0.7, `rgba(201,165,106,${(0.07 * vis).toFixed(3)})`); w.addColorStop(1, 'rgba(201,165,106,0)');
      lc.fillStyle = w; lc.beginPath(); lc.arc(x, y, R * 1.05, 0, 6.2832); lc.fill();
    });
    drawWash(c, wash, e.out(win(t, 0.9, 1.6)), vis);
    rich(c, T('Look here.', `italic 600 118px ${FS}`, IV), tx, ty, { ls: 2, a: vis, p: e.out(win(t, 0.9, 1.6)), blur: 20 });
    const ap = e.out(win(t, 1.3, 2.0)), hp = e.out(win(t, 2.0, 2.4));
    taper(c, arrow, ap, 8, IV2, vis, 1.2);
    hd.forEach((h) => taper(c, h, hp, 6, IV2, vis, 1));
    taper(c, [[S0[0] - side * 10, S0[1] + 10], [S0[0] + side * 0, S0[1] + 12]], 1, 1, pc, vis * e.out(win(t, 1.3, 1.7)), 1);
  } };
}

/* ============================================================ 6 GG */
function quill(c, x, y, a) {
  c.save(); c.translate(x, y); c.globalAlpha = a;
  c.fillStyle = 'rgba(232,220,196,0.88)'; c.beginPath(); c.moveTo(0, 0); c.quadraticCurveTo(10, -30, 34, -70); c.quadraticCurveTo(70, -120, 112, -150);
  c.quadraticCurveTo(100, -100, 76, -62); c.quadraticCurveTo(50, -26, 20, -8); c.closePath(); c.fill();
  c.strokeStyle = DG; c.lineWidth = 1.4; c.beginPath(); c.moveTo(0, 0); c.quadraticCurveTo(40, -50, 112, -150); c.stroke();
  c.lineWidth = 0.8; for (let i = 1; i < 6; i++) { const k = i / 6; c.beginPath(); c.moveTo(20 + k * 80, -40 - k * 100); c.lineTo(46 + k * 80, -28 - k * 90); c.stroke(); }
  c.restore();
}
function gg(api) {
  const { rand, player } = api, dur = 8, GX = 960;
  const best = (key) => api.tally.reduce((m, r) => (!m || r[key] > m[key] ? r : m), null) || { name: player.name, color: player.color };
  const w = best('wows'), b = best('blunders');
  const GF = `600 290px ${FT}`, LFt = `italic 600 44px ${FS}`, LFn = `italic 700 44px ${FS}`;
  const l1 = [{ s: 'Play of the game · ', f: LFt, c: IV2 }, { s: w.name, f: LFn, c: mute(w.color) }];
  const l2 = [{ s: 'Blunder of the game · ', f: LFt, c: IV2 }, { s: b.name, f: LFn, c: mute(b.color) }];
  const gw = mw(api, T('GG', GF, BR), 30), w1 = mw(api, l1), w2 = mw(api, l2);
  const YG = 450, Y1 = 560, Y2 = 640;
  const wash = mkWash(rand, GX, 520, 1500, 520, 14);
  const S = sfx(api);
  if (S) {
    for (let i = 0; i < 20; i++) S.noise(0.6 + i * 0.08, 0.05, { type: 'highpass', f0: 2400 + (i % 4) * 500, f1: 3800, g: 0.12 });
    for (let i = 0; i < 16; i++) S.noise(2.8 + i * 0.1, 0.05, { type: 'highpass', f0: 2400 + (i % 4) * 500, f1: 3800, g: 0.1 });
    for (let i = 0; i < 16; i++) S.noise(4.9 + i * 0.1, 0.05, { type: 'highpass', f0: 2400 + (i % 4) * 500, f1: 3800, g: 0.1 });
    [[130.8, 0.4], [196, 0.5], [261.6, 0.6], [329.6, 0.7]].forEach(([f, at]) => S.tone(at, 5.2, { type: 'triangle', f0: f, f1: f * 0.997, g: 0.07, atk: 1.0, lp: 1100 }));
  }
  return { duration: dur, render(t) {
    const c = begin(api), e = api.ease, fo = fade(t, dur, 1.0), dim = 1 - 0.35 * win(t, 6.4, 7.6), a = fo * dim;
    drawWash(c, wash, e.out(win(t, 0, 0.9)), fo);
    const cn = (1 - win(t, 6.4, 8)) * (0.85 + 0.15 * Math.sin(t * 9) * Math.sin(t * 3.7 + 1));
    glow(c, GX, 470, 640, [[0, `rgba(227,196,138,${(0.11 * cn * fo).toFixed(3)})`], [0.6, `rgba(201,165,106,${(0.05 * cn * fo).toFixed(3)})`], [1, 'rgba(201,165,106,0)']]);
    const pg = e.inOut(win(t, 0.6, 2.2)), p1 = e.inOut(win(t, 2.8, 4.5)), p2 = e.inOut(win(t, 4.9, 6.5));
    rich(c, T('GG', GF, BR), GX, YG, { ls: 30, a, p: pg, blur: 26 });
    rich(c, l1, GX, Y1, { a, p: p1, blur: 16 }); rich(c, l2, GX, Y2, { a, p: p2, blur: 16 });
    // quill follows the ink edge
    const qs = [[pg, GX - gw / 2 + gw * pg, YG - 20, 0.6], [p1, GX - w1 / 2 + w1 * p1, Y1 - 6, 2.8], [p2, GX - w2 / 2 + w2 * p2, Y2 - 6, 4.9]];
    for (const [p, qx, qy] of qs) if (p > 0 && p < 1) quill(c, qx + Math.sin(t * 40) * 1.5, qy + Math.sin(t * 31) * 2, a);
  } };
}

export const EFFECTS = { blunder, funny, wow, wololo, spotlight, gg };
