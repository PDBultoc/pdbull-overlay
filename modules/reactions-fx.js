/* Style D · Chronicle — a dry medieval chronicler and manuscript marginalia: ink, gold dust, candle light, smoke.
   Every render(t) is a pure function of t; all randomness is drawn from api.rand inside make(). All text is canvas text. */
import { PLAY, DURATION } from '../core/reactionlogic.js';

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
/* soft punch-out of the CaptureAge score rows (keep-out rect) from our own darkening pixels; ~30 px feathered edge */
function punch(lc, ko) {
  if (!ko) return;
  const ox = ko.x - PLAY.x, oy = ko.y - PLAY.y;
  lc.save(); lc.globalCompositeOperation = 'destination-out'; lc.fillStyle = '#000';
  lc.globalAlpha = 1; lc.fillRect(ox, oy, ko.w, ko.h);
  lc.globalAlpha = 0.25;
  for (let d = 5; d <= 30; d += 5) lc.fillRect(ox - d, oy - d, ko.w + 2 * d, ko.h + 2 * d);
  lc.restore();
}
function dimDraw(c, layer, fn, keepOut) {
  const lc = layer.getContext('2d');
  lc.setTransform(1, 0, 0, 1, 0, 0); lc.globalCompositeOperation = 'source-over'; lc.clearRect(0, 0, PLAY.w, PLAY.h);
  lc.translate(0, -PLAY.y); fn(lc); lc.setTransform(1, 0, 0, 1, 0, 0);
  punch(lc, keepOut);
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
    const master = ac.createGain(); master.gain.value = 0.65 * (api.volume ?? 0.7); master.connect(ac.destination); api._master = master;
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
  const { rand, player } = api, dur = DURATION.blunder, pc = mute(player.color);
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
      }, api.keepOut);
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

/* ============================================================ 2 FUNNY (marginalia drolleries) */
// A drawing is a list of shapes { p: points } painted back to front. Flags: f = fill (1 ivory, 2 brass, 3 ink),
// h = hatch line (shade, no under-stroke), d = fine ink detail (eyes, mouths), b = brass line, w = line width (px).
// The three scenes stay in x 340-1520 / y 640-850: clear of the cam (x < 340, y > 755) and CA's 4v4 score rows (x > 1520).
const P2 = Math.PI * 2;
const ellPts = (cx, cy, rx, ry, n, a0 = 0, a1 = P2) => { const o = []; for (let i = 0; i <= n; i++) { const a = a0 + (a1 - a0) * i / n; o.push([cx + Math.cos(a) * rx, cy + Math.sin(a) * ry]); } return o; };
const V = (len, a) => [Math.sin(a) * len, Math.cos(a) * len];   // a = angle from straight down, + = forward (right)
const add = (p, q) => [p[0] + q[0], p[1] + q[1]];
const lp = (p, q, k) => [lerp(p[0], q[0], k), lerp(p[1], q[1], k)];
function qb(p0, c, p1, n = 6) { const o = []; for (let i = 0; i <= n; i++) { const t = i / n, u = 1 - t; o.push([u * u * p0[0] + 2 * u * t * c[0] + t * t * p1[0], u * u * p0[1] + 2 * u * t * c[1] + t * t * p1[1]]); } return o; }
// a limb with volume: a closed, tapered outline with round ends around a centre polyline
function limb(pts, w0, w1) {
  const n = pts.length, L = [], R = [], ang = [];
  for (let i = 0; i < n; i++) {
    const a = pts[Math.max(0, i - 1)], b = pts[Math.min(n - 1, i + 1)], an = Math.atan2(b[1] - a[1], b[0] - a[0]), w = lerp(w0, w1, i / (n - 1)) / 2;
    ang.push(an);
    L.push([pts[i][0] + Math.cos(an + Math.PI / 2) * w, pts[i][1] + Math.sin(an + Math.PI / 2) * w]);
    R.push([pts[i][0] + Math.cos(an - Math.PI / 2) * w, pts[i][1] + Math.sin(an - Math.PI / 2) * w]);
  }
  const cap = (c, an, w) => { const o = []; for (let j = 1; j < 5; j++) { const a = an + Math.PI / 2 - Math.PI * j / 5; o.push([c[0] + Math.cos(a) * w, c[1] + Math.sin(a) * w]); } return o; };
  return [...L, ...cap(pts[n - 1], ang[n - 1], w1 / 2), ...R.reverse(), ...cap(pts[0], ang[0] + Math.PI, w0 / 2), L[0]];
}
// cross-hatching inside an ellipse (lower half only when low = 1)
function hatch(cx, cy, rx, ry, step, low = 0) {
  const o = [];
  for (let yy = cy - ry + step * 0.6; yy < cy + ry - 2; yy += step) {
    if (low && yy < cy) continue;
    const hw = rx * Math.sqrt(Math.max(0, 1 - ((yy - cy) / ry) ** 2)) * 0.8; o.push({ p: [[cx - hw, yy + 2.5], [cx + hw, yy - 2.5]], h: 1 });
  }
  return o;
}
// shade strokes across a limb's centre line
function shade(pts, n, len) {
  const o = [];
  for (let i = 1; i <= n; i++) { const k = i / (n + 1), j = Math.min(pts.length - 2, Math.floor(k * (pts.length - 1))), c = lp(pts[j], pts[j + 1], 0.5); o.push({ p: [[c[0] - len, c[1] + len * 0.6], [c[0] + len * 0.5, c[1] - len * 0.4]], h: 1 }); }
  return o;
}
// a face looking right: one big readable eye; brow and mouth carry the mood
function face(S, h, r, m) {
  const ex = h[0] + r * 0.36, ey = h[1] - r * 0.16, er = r * 0.32, pp = m.pupil || [0.32, 0.05], bk = m.brow || 0;
  S.push({ p: [[h[0] + r * 0.86, h[1] - r * 0.28], [h[0] + r * 1.34, h[1] + r * 0.14], [h[0] + r * 0.82, h[1] + r * 0.32]], w: 2.8 });   // nose
  S.push({ p: ellPts(ex, ey, er * 0.82, er, 12), f: 1, d: 1 });
  S.push({ p: ellPts(ex + er * pp[0], ey + er * pp[1], er * 0.34, er * 0.4, 8), f: 3, d: 1 });
  S.push({ p: [[ex - er * 1.15, ey - er * 1.45 - bk * er * 0.55], [ex + er * 1.05, ey - er * 1.45 + bk * er * 0.6]], d: 1, w: 3 });   // brow
  const mx = h[0] + r * 0.56, my = h[1] + r * 0.56;
  if (m.mouth === 'o') S.push({ p: ellPts(mx, my, r * 0.17, r * 0.25, 10), f: 3, d: 1 });
  else if (m.mouth === 'shout') S.push({ p: [[mx - r * 0.32, my - r * 0.14], [mx + r * 0.36, my - r * 0.2], [mx + r * 0.1, my + r * 0.3], [mx - r * 0.32, my - r * 0.14]], f: 3, d: 1 });
  else S.push({ p: qb([mx - r * 0.38, my - r * 0.12], [mx - r * 0.02, my + r * 0.24], [mx + r * 0.36, my - r * 0.22]), d: 1, w: 2.4 });   // grin
}
// leg angles per pose: [back leg, front leg], each [thigh, shin]
const RUN = [[[-0.55, -1.35], [0.62, 0.12]], [[0.3, -1.5], [0.04, -0.04]], [[0.62, 0.12], [-0.55, -1.35]]];
function person(x, k, o) {
  const S = [], legs = o.legs ? o.legs(k) : RUN[k], lean = o.lean || 0, r = 12.5;
  const foot0 = (lg) => add(add([x, -47], V(24, lg[0])), V(23, lg[1]));
  const lift = o.robe ? 0 : -Math.max(...legs.map((lg) => foot0(lg)[1]));
  const hip = [x, -47 + lift], neck = [x + lean, -80 + lift], hd = [neck[0] + 3 + lean * 0.25, neck[1] - 14];
  const shB = [neck[0] - 8, neck[1] + 5], shF = [neck[0] + 7, neck[1] + 4];
  const arms = o.arms(k), armPts = (sh, [ua, fa]) => { const el = add(sh, V(17, ua)); return [sh, lp(sh, el, 0.5), el, add(el, V(8, fa)), add(el, V(16, fa))]; };
  const arm = (sh, a) => { const pts = armPts(sh, a); S.push({ p: limb(pts, 8, 5.5), f: 1 }); S.push({ p: ellPts(pts[4][0], pts[4][1], 3.6, 3.6, 8), f: 1 }); return pts; };
  if (o.behind) o.behind(S, { hip, neck, hd, r });
  const back = arm(shB, arms[0]); S.push(...shade(back, 2, 3));
  if (!o.robe) legs.forEach((lg, i) => {
    const kn = add(hip, V(24, lg[0])), ft = add(kn, V(23, lg[1])), pts = [hip, lp(hip, kn, 0.5), kn, lp(kn, ft, 0.5), ft];
    S.push({ p: limb(pts, 10, 6.5), f: 1 }); if (!i) S.push(...shade(pts, 3, 3.5));
    S.push({ p: limb([[ft[0] - 2, ft[1] - 2.5], [ft[0] + 7, ft[1] - 1.5]], 6.5, 5), f: 3 });
  });
  // tunic (or robe) with a dagged hem, shaded on its back half
  const sway = o.robe ? 0 : [3, 0, -3][k], hl = o.long ? 21 : 13;
  const hemF = o.robe ? [x + 17, -3] : [hip[0] + 15 + sway, hip[1] + hl], hemB = o.robe ? [x - 16, -3] : [hip[0] - 13 + sway, hip[1] + hl + 1];
  const wF = [hip[0] + 9, hip[1] - 5], wB = [hip[0] - 9, hip[1] - 4];
  const dag = [0.2, 0.4, 0.6, 0.8].map((q, i) => add(lp(hemF, hemB, q), [0, i % 2 ? 0 : -5]));
  S.push({ p: [shB, [neck[0], neck[1] + 1], shF, [shF[0] + 3, lerp(shF[1], wF[1], 0.45)], wF, hemF, ...dag, hemB, wB, [shB[0] - 3, lerp(shB[1], wB[1], 0.5)], shB], f: 1 });
  for (let i = 0; i < 4; i++) { const a = lp(shB, hemB, 0.18 + i * 0.2); S.push({ p: [add(a, [2, 2]), add(a, [9, -3])], h: 1 }); }
  S.push({ p: [wB, wF], b: 1, w: 3 });
  if (o.chest) o.chest(S, { neck, hip, wF, wB });
  if (o.robe) S.push({ p: limb([[hemF[0] - 3, -3], [hemF[0] + 6, -2]], 6, 5), f: 3 });   // a sandal under the robe
  // head
  if (o.hood) { S.push({ p: limb([[hd[0] - 12, hd[1] - 3], [hd[0] - 21, hd[1] + 6 + [2, -2, 1][k]], [hd[0] - 27, hd[1] + 17 + [-1, 2, -3][k]]], 7, 2.5), f: 1 }); S.push({ p: ellPts(hd[0] - 3, hd[1] - 1, r + 4, r + 4.5, 16), f: 1 }); }
  S.push({ p: ellPts(hd[0], hd[1], r * 0.95, r, 18), f: 1 });
  if (o.hat) o.hat(S, hd, r, k);
  face(S, hd, r, o.mood);
  if (o.hood) S.push({ p: ellPts(hd[0] - 1, hd[1], r + 2, r + 2, 10, -Math.PI * 1.22, -Math.PI * 0.14), w: 3 });
  const front = arm(shF, arms[1]);
  if (o.front) o.front(S, { back, front, hd, r });
  return S;
}

function chicken(x, k) {
  const S = [], by = -27 + [-2, -6, -1][k], hx = x + 17, hy = by - 17 + [0, -3, 1][k];
  [[-30, -16], [-35, -6], [-31, 4]].forEach(([dx, dy]) => S.push({ p: limb([[x - 13, by - 2], [x + dx * 0.6, by + dy * 0.6 - 3], [x + dx, by + dy - 6]], 7, 2), f: 1 }));
  const legs = [[0.75, -0.6], [-0.7, 0.5], [0.1, 0.95]][k];
  legs.forEach((a, i) => { const h = [x + 1 + i * 3, by + 11], kn = add(h, V(9, a)), ft = add(kn, V(9, a * 0.3)); S.push({ p: [h, kn, ft], w: 2.6 }); S.push({ p: [ft, add(ft, [6, 0])], w: 2.2 }); S.push({ p: [ft, add(ft, [-3, 1])], w: 2.2 }); });
  S.push({ p: ellPts(x, by, 18, 14, 20), f: 1 }); S.push(...hatch(x, by, 18, 14, 4.5, 1));
  S.push({ p: limb([[x + 11, by - 6], [x + 15, by - 12], [hx - 1, hy + 4]], 11, 9), f: 1 });   // neck
  const wa = [Math.PI - 0.5, Math.PI * 0.62, 0.55][k], root = [x - 3, by - 5], wp = [root, add(root, V(11, wa)), add(root, V(23, wa))];
  S.push({ p: limb(wp, 13, 5), f: 1 }); S.push(...shade(wp, 3, 3.5));
  S.push({ p: [...ellPts(hx - 3, hy - 8, 3, 3.4, 5, Math.PI, P2), ...ellPts(hx + 2, hy - 9, 3, 3.6, 5, Math.PI, P2), ...ellPts(hx + 6.5, hy - 7, 2.6, 3, 5, Math.PI, P2), [hx - 6, hy - 7]], f: 2, w: 2.2 });   // comb
  S.push({ p: ellPts(hx, hy, 7.5, 7.5, 14), f: 1 });
  S.push({ p: [[hx + 6, hy - 2], [hx + 15, hy - 1], [hx + 6.5, hy + 1], [hx + 6, hy - 2]], f: 2, w: 2.2 });   // beak, wide open
  S.push({ p: [[hx + 6, hy + 2.5], [hx + 13, hy + 7], [hx + 5.5, hy + 4.5], [hx + 6, hy + 2.5]], f: 2, w: 2.2 });
  S.push({ p: ellPts(hx + 3, hy + 8, 2.4, 3.4, 8), f: 2, w: 2 });   // wattle
  S.push({ p: ellPts(hx + 1.5, hy - 2, 3.4, 3.8, 10), f: 1, d: 1 }); S.push({ p: ellPts(hx + 0.2, hy - 2, 1.1, 1.3, 6), f: 3, d: 1 });   // panicked eye looking back
  [[-4, -11], [1, -15], [6, -12]].forEach(([dx, dy], i) => { const j = [0, 2, -1][(k + i) % 3]; S.push({ p: [[hx + dx, hy + dy - 4 + j], [hx + dx * 1.6, hy + dy * 1.5 - 4 + j]], w: 2.2 }); });   // fright marks
  [[-40, -38], [-26, -54], [-52, -20]].forEach(([dx, dy], i) => { const f = (k + i) % 3, p0 = [x + dx - f * 4, by + dy + f * 3], sw = f - 1; S.push({ p: limb(qb(p0, [p0[0] + 4, p0[1] - 3 + sw * 2], [p0[0] + 8, p0[1] + sw * 2], 4), 3.2, 0.8), f: 1, w: 2.4 }); });   // loose feathers
  return S;
}
function ram(x, k) {
  const S = [], gal = [[0.55, -0.5], [-0.4, 0.45], [0.05, 0.05]][k], by = -31 + [0, -3, -1][k];
  [[-16, 0], [-8, 1], [12, 1], [20, 0]].forEach(([lx, s], i) => {
    const a = gal[(i + s) % 2], h = [x + lx, by + 12], ft = add(add(h, V(11, a)), V(10, a * 0.4));
    S.push({ p: limb([h, add(h, V(11, a)), ft], 6, 4.5), f: 1 }); S.push({ p: ellPts(ft[0] + 1, ft[1], 3.2, 2.2, 8), f: 3 });
  });
  const body = []; for (let i = 0; i <= 44; i++) { const a = i / 44 * P2, q = 1 + 0.13 * Math.abs(Math.sin(a * 6)); body.push([x + Math.cos(a) * 28 * q, by + Math.sin(a) * 17 * q]); }
  S.push({ p: body, f: 1 }); S.push(...hatch(x, by, 25, 15, 4.5, 1));
  [[-14, -7, 0], [-2, -9, 2], [10, -6, 4], [-8, 3, 1], [6, 4, 3]].forEach(([dx, dy, a0]) => { const sp = []; for (let i = 0; i <= 10; i++) { const a = a0 + i * 0.75, rr = 3.4 - i * 0.26; sp.push([x + dx + Math.cos(a) * rr, by + dy + Math.sin(a) * rr]); } S.push({ p: sp, h: 1 }); });   // wool curls
  const hx = x + 33, hy = by + 6;
  S.push({ p: ellPts(hx, hy, 12, 8.5, 16), f: 1 });   // head, lowered to charge
  S.push({ p: limb([[hx - 6, hy - 6], [hx - 13, hy - 9 + [0, 2, -1][k]]], 5, 2.5), f: 1 });   // ear
  const horn = []; for (let i = 0; i <= 14; i++) { const a = -0.6 - i / 14 * 1.7 * Math.PI, rr = 8 - i * 0.38; horn.push([hx - 5 + Math.cos(a) * rr, hy - 3 + Math.sin(a) * rr]); }
  S.push({ p: limb(horn, 6, 2.5), f: 2, w: 2.6 });
  S.push({ p: ellPts(hx + 3, hy - 2.5, 2.8, 3.2, 10), f: 1, d: 1 }); S.push({ p: ellPts(hx + 4, hy - 2.2, 1.2, 1.5, 6), f: 3, d: 1 });
  S.push({ p: [[hx - 1, hy - 7.5], [hx + 7, hy - 4.5]], d: 1, w: 3.2 });   // furious brow
  S.push({ p: ellPts(hx + 10, hy + 2, 1.2, 1.2, 6), f: 3, d: 1 }); S.push({ p: [[hx + 6, hy + 5.5], [hx + 10, hy + 5]], d: 1, w: 2 });
  [[14, -1], [18, 4]].forEach(([dx, dy], i) => { const j = (k + i) % 3; S.push({ p: qb([hx + dx, hy + dy], [hx + dx + 5 + j, hy + dy - 3], [hx + dx + 9 + j * 2, hy + dy + 1], 4), w: 2 }); });   // snort
  [0, 1].forEach((i) => { const f = (k + i) % 3, cx = x - 36 - f * 8 - i * 4, cy = -5 - f * 3, rr = 3.5 + f * 1.4, puff = []; for (let j = 0; j <= 20; j++) { const a = j / 20 * P2, q = 1 + 0.2 * Math.abs(Math.sin(a * 2.5)); puff.push([cx + Math.cos(a) * rr * 1.3 * q, cy + Math.sin(a) * rr * q]); } S.push({ p: puff, f: 1, w: 2.2 }); });   // dust puffs
  return S;
}
function donkey(x, k) {
  const S = [], buck = [0, 0.13, 0.3][k], pv = [x + 20, 0], ca = Math.cos(buck), sa = Math.sin(buck);
  const rot = (p) => { const dx = p[0] - pv[0], dy = p[1] - pv[1]; return [pv[0] + dx * ca - dy * sa, pv[1] + dx * sa + dy * ca]; };
  const L = [];
  const tail = [[x - 30, -48], [x - 40, -44 + [0, -4, -9][k]], [x - 44, -34 + [0, -6, -14][k]]];
  L.push({ p: limb(tail, 3.5, 2.5), f: 1 }); L.push({ p: limb([tail[2], add(tail[2], [-2, 7])], 6, 2), f: 1 });
  const kick = [[0, 0], [-0.5, -0.3], [-1.3, -1.6]][k];
  [[x - 18, 0], [x - 25, 1]].forEach(([hx, s]) => { const h = [hx, -32], kn = add(h, V(15, kick[0] * (s ? 0.8 : 1))), ft = add(kn, V(15, kick[1] * (s ? 0.8 : 1))); L.push({ p: limb([h, kn, ft], 9, 5.5), f: 1 }); L.push({ p: ellPts(ft[0], ft[1], 3.6, 2.6, 8), f: 3 }); });
  [[x + 14, 0], [x + 22, 0]].forEach(([hx]) => { const h = [hx, -32], ft = [hx + 2, 0]; L.push({ p: limb([h, lp(h, ft, 0.5), ft], 8.5, 5.5), f: 1 }); L.push({ p: ellPts(ft[0] + 1, ft[1], 3.6, 2.6, 8), f: 3 }); });
  L.push({ p: ellPts(x, -42, 32, 15, 22), f: 1 }); L.push(...hatch(x, -42, 30, 14, 4.5, 1));
  L.push({ p: [[x - 12, -56], [x + 12, -56], [x + 14, -40], [x - 14, -40], [x - 12, -56]], f: 2, w: 2.6 });   // saddle cloth
  for (let i = 0; i < 6; i++) L.push({ p: [[x - 12 + i * 5, -40], [x - 12 + i * 5, -36]], b: 1, w: 2 });
  L.push({ p: limb([[x + 22, -48], [x + 30, -58], [x + 37, -66]], 17, 12), f: 1 });   // neck
  for (let i = 0; i < 4; i++) L.push({ p: [[x + 22 + i * 4, -58 - i * 3], [x + 19 + i * 4, -63 - i * 3]], h: 1 });   // mane
  const ear = [[0.0, -0.1], [-0.25, -0.35], [-0.6, -0.75]][k];
  [[x + 38, -74, ear[0]], [x + 43, -75, ear[1]]].forEach(([ex, ey, e]) => L.push({ p: limb([[ex, ey], add([ex, ey], V(20, Math.PI - 0.25 + e))], 7, 3.5), f: 1 }));
  const hp = ellPts(x + 47, -68, 15, 8.5, 18).map(([px, py]) => { const dx = px - (x + 47), dy = py + 68; return [x + 47 + dx * 0.94 - dy * 0.34, -68 + dx * 0.34 + dy * 0.94]; });
  L.push({ p: hp, f: 1 }); L.push({ p: [[x + 53, -62], [x + 58, -66]], h: 1 }); L.push({ p: [[x + 51, -60], [x + 57, -63]], h: 1 });
  L.push({ p: ellPts(x + 44, -72, 3.2, 3.6, 10), f: 1, d: 1 }); L.push({ p: ellPts(x + 45, -71, 1.3, 1.5, 6), f: 3, d: 1 });
  L.push({ p: [...ellPts(x + 44, -72, 3.4, 3.8, 6, Math.PI, P2), [x + 40.6, -72]], f: 1, d: 1 });   // half-closed, smug lid
  L.push({ p: qb([x + 51, -59], [x + 56, -56], [x + 61, -61], 4), d: 1, w: 2.4 });   // grin
  S.push(...L.map((s) => ({ ...s, p: s.p.map(rot) })));
  return S;
}
const mapSt = (S, fn) => S.map((s) => ({ ...s, p: s.p.map(fn) }));
function sceneVillager(k) {
  const S = person(-70, k, { lean: 9, hood: 1, mood: { brow: 1, mouth: 'shout', pupil: [0.42, 0.05] }, arms: () => [[1.35, 1.75], [1.25, 1.65]],
    front: (S2, { back, front }) => {   // pitchfork held in both hands, pointing at the chicken
      const a = back[4], b = front[4], dx = b[0] - a[0], dy = b[1] - a[1], d = Math.hypot(dx, dy) || 1, u = [dx / d, dy / d], tip = add(b, [u[0] * 34, u[1] * 34]);
      S2.push({ p: [add(a, [-u[0] * 16, -u[1] * 16]), tip], w: 3 });
      S2.push({ p: [add(tip, [-u[1] * 7, u[0] * 7]), add(tip, [u[1] * 7, -u[0] * 7])], w: 3 });
      [-7, 0, 7].forEach((o) => { const s = add(tip, [-u[1] * o, u[0] * o]); S2.push({ p: [s, add(s, [u[0] * 13, u[1] * 13])], w: 2.8 }); });
    } });
  S.push(...chicken(66, k));
  return S;
}
function sceneKnight(k) {
  const S = ram(-72, k);
  S.push(...person(58, k, { lean: 11, mood: { brow: -1.2, mouth: 'o', pupil: [-0.45, -0.1] }, arms: (kk) => [[[-2.4, -2.0], [-2.0, -2.6], [-2.7, -2.3]][kk], [[2.15, 2.3], [2.4, 2.75], [1.95, 2.2]][kk]],
    chest: (S2, { neck, hip }) => { const c = lp(neck, hip, 0.45); S2.push({ p: [add(c, [2, -7]), add(c, [3, 7])], b: 1, w: 2.6 }); S2.push({ p: [add(c, [-4, -1]), add(c, [9, -2])], b: 1, w: 2.6 }); },
    hat: (S2, h, r, kk) => {   // a nasal helm with a plume streaming back
      const apex = [h[0] - r * 0.15, h[1] - r * 1.65];
      S2.push({ p: limb([apex, add(apex, [-10, -2 + [0, 3, -2][kk]]), add(apex, [-21, 4 + [-2, 2, 4][kk]])], 6, 2), f: 1 });
      S2.push({ p: [...qb([h[0] - r * 1.04, h[1] - r * 0.12], [h[0] - r * 0.95, h[1] - r * 1.4], apex, 5), ...qb(apex, [h[0] + r * 0.9, h[1] - r * 1.35], [h[0] + r * 1.02, h[1] - r * 0.62], 5).slice(1), [h[0] - r * 1.04, h[1] - r * 0.12]], f: 2, w: 3 });
      S2.push({ p: limb([[h[0] + r * 0.66, h[1] - r * 0.62], [h[0] + r * 0.74, h[1] + r * 0.18]], 3.6, 3), f: 2, w: 2.4 });
    },
    front: (S2, { back, hd, r }) => {   // the sword flails behind him; sweat flies off
      const h = back[4], a = [-2.5, -2.9, -2.1][k], tip = add(h, V(30, a)), gd = add(h, V(4, a));
      S2.push({ p: limb([gd, tip], 4, 2), f: 1 }); S2.push({ p: [add(gd, V(6, a + 1.57)), add(gd, V(6, a - 1.57))], b: 1, w: 3 });
      [[-1.25, -0.7], [-1.45, -0.1], [-1.1, -1.1]].forEach(([dx, dy], i) => { const j = (k + i) % 3, c = [hd[0] + r * (dx - j * 0.18), hd[1] + r * (dy - j * 0.1)]; S2.push({ p: [...qb([c[0], c[1] - 3.5], [c[0] + 2.6, c[1] + 1], [c[0], c[1] + 2.2], 3), ...qb([c[0], c[1] + 2.2], [c[0] - 2.6, c[1] + 1], [c[0], c[1] - 3.5], 3).slice(1)], f: 1, d: 1 }); });
    } }));
  return S;
}
function sceneMonk(k) {
  const S = donkey(-6, k), ang = [-0.12, -1.1, -2.9][k], tr = [[0, 0], [-14, -16], [-48, -70]][k], pv = [0, -56];
  const m = person(0, 0, { lean: -2, long: 1, legs: () => [[1.45, 0.15], [1.6, 0.3]], mood: { brow: -1.3, mouth: 'o', pupil: [0.1, -0.45] }, arms: () => [[Math.PI - [0.5, 0.9, 0.3][k], Math.PI - [0.2, 0.6, 0.1][k]], [Math.PI - [-0.6, -0.3, -0.9][k], Math.PI - [-0.3, 0.1, -0.6][k]]],
    hat: (S2, h, r) => { S2.push({ p: limb(ellPts(h[0], h[1] - 1, r * 0.98, r * 0.98, 6, Math.PI * 0.62, Math.PI * 1.18), 6, 4), f: 1 }); S2.push(...shade(ellPts(h[0], h[1] - 1, r, r, 6, Math.PI * 0.62, Math.PI * 1.18), 3, 2.5)); },
    chest: (S2, { wF }) => { S2.push({ p: qb(wF, [wF[0] + 3, wF[1] + 10], [wF[0] - 1, wF[1] + 18], 4), b: 1, w: 2.6 }); } });
  const c = Math.cos(ang), s = Math.sin(ang);
  S.push(...mapSt(m, ([px, py]) => { const yy = py - 30, dx = px - pv[0], dy = yy - pv[1]; return [pv[0] + dx * c - dy * s + tr[0], pv[1] + dx * s + dy * c + tr[1]]; }));
  const bk = [[30, -120], [-6, -140], [-22, -168]][k], ba = [0.3, -0.9, -2.2][k];   // his book takes flight
  const corner = (dx, dy) => [bk[0] + dx * Math.cos(ba) - dy * Math.sin(ba), bk[1] + dx * Math.sin(ba) + dy * Math.cos(ba)];
  S.push({ p: [corner(-8, -5), corner(8, -5), corner(8, 5), corner(-8, 5), corner(-8, -5)], f: 2, w: 2.6 });
  S.push({ p: [corner(0, -5), corner(0, 5)], d: 1, w: 2 });
  return S;
}
function funny(api) {
  const { rand, player } = api, dur = DURATION.funny, pc = mute(player.color), SC = 1.75, GY = 830;
  const jt = []; for (let i = 0; i < 256; i++) jt.push((rand() - 0.5) * 1.6);
  const fin = (S, k) => S.map((s, si) => ({ ...s, p: s.p.map(([x, y], pi) => [x + jt[(si * 7 + pi * 3 + k * 11) % 256], y + jt[(si * 5 + pi * 13 + k * 17 + 3) % 256]]) }));
  const mk = (cx, build, sp) => ({ cx, sp, poses: [0, 1, 2].map((k) => fin(build(k), k)) });
  const scenes = [mk(545, sceneVillager, 150), mk(930, sceneKnight, 150), mk(1315, sceneMonk, 0)];
  scenes.forEach((s) => { s.tot = s.poses[0].reduce((a, st) => a + st.p.length, 0); });
  const wash = mkWash(rand, 930, 700, 1100, 300, 12), layer = mkLayer();
  const gl = []; for (let i = 0; i <= 24; i++) gl.push([-108 + i * 9, 3 + Math.sin(i * 0.9) * 1.4 + (rand() - 0.5) * 1.2]);
  const S = sfx(api);
  if (S) {
    for (let i = 0; i < 26; i++) S.noise(0.2 + i * 0.1, 0.05, { f0: 2600 + (i % 4) * 600, f1: 3800, q: 2.5, g: 0.1 });
    [0, 1, 2, 3, 4].forEach((i) => S.tone(1.5 + i * 0.17, 0.14, { type: 'sawtooth', f0: 150 - (i % 2) * 14, f1: 120 - (i % 2) * 10, g: 0.2, atk: 0.02, lp: 520 }));
    S.tone(2.5, 0.3, { type: 'sawtooth', f0: 130, f1: 90, g: 0.16, atk: 0.03, lp: 450 });
  }
  const INK = '#1a100a', WAL = '#1a100a', DET = '#2a1a10';
  return { duration: dur, render(t) {
    const c = begin(api), fo = fade(t, dur, 0.5), e = api.ease;
    // the ink wash stays inside x 340-1520 (soft sides), so it never darkens the cam or CA's score rows
    dimDraw(c, layer, (lc) => {
      drawWash(lc, wash, e.out(win(t, 0, 0.6)), fo * 1.3);
      lc.globalCompositeOperation = 'destination-in';
      const g = lc.createLinearGradient(340, 0, 1520, 0);
      g.addColorStop(0, 'rgba(0,0,0,0)'); g.addColorStop(0.1, '#000'); g.addColorStop(0.9, '#000'); g.addColorStop(1, 'rgba(0,0,0,0)');
      lc.fillStyle = g; lc.fillRect(0, 0, 1920, 1080); lc.globalCompositeOperation = 'source-over';
    }, api.keepOut);
    scenes.forEach((sc, i) => {
      const t0 = 0.2 + i * 0.4, t1 = t0 + 1.1, p = win(t, t0, t1);
      if (p <= 0) return;
      const k = t < t1 ? 0 : [0, 1, 2, 1][Math.floor((t - t1) * 6) % 4], allow = p >= 1 ? Infinity : p * sc.tot;
      c.save(); c.translate(sc.cx, GY); c.scale(SC, SC); c.lineCap = 'round'; c.lineJoin = 'round'; c.globalAlpha = fo;
      // ground: a wavy pen line with ticks that scroll like a flip-book
      c.strokeStyle = DG; c.lineWidth = 1.4 / SC; c.beginPath(); const gn = Math.floor(p * gl.length);
      for (let g = 0; g < gn; g++) { if (g) c.lineTo(gl[g][0], gl[g][1]); else c.moveTo(gl[g][0], gl[g][1]); } c.stroke();
      if (p > 0.3) for (let g = 0; g < 8; g++) { const xx = (((g * 27 - sc.sp * t) % 216) + 216) % 216 - 108; c.globalAlpha = fo * 0.8; c.beginPath(); c.moveTo(xx, 7); c.lineTo(xx - 7, 11); c.stroke(); }
      let used = 0;
      const path = (st, n) => { c.beginPath(); c.moveTo(st.p[0][0], st.p[0][1]); for (let q = 1; q < n; q++) c.lineTo(st.p[q][0], st.p[q][1]); };
      // painter's order: each shape gets its walnut under-stroke, its fill, then its ink / ivory / brass line
      sc.poses[k].forEach((st, si) => {
        const n = Math.min(st.p.length, Math.max(0, Math.floor(allow - used))); used += sc.poses[0][si] ? sc.poses[0][si].p.length : st.p.length;
        if (n < 2) return;
        const full = n === st.p.length;
        path(st, n);
        if (st.h) { c.strokeStyle = DG; c.lineWidth = 1.8 / SC; c.globalAlpha = fo * 0.95; c.stroke(); return; }
        if (st.d) {
          if (st.f && full) { c.fillStyle = st.f === 3 ? INK : IV; c.globalAlpha = fo; c.fill(); }
          c.strokeStyle = DET; c.lineWidth = (st.w || 1.6) / SC; c.globalAlpha = fo; c.stroke(); return;
        }
        c.strokeStyle = WAL; c.lineWidth = ((st.w || 3.5) + 3.5) / SC; c.globalAlpha = fo * 0.85; c.stroke();
        if (st.f && full) { c.fillStyle = st.f === 2 ? GD : st.f === 3 ? INK : IV2; c.globalAlpha = fo * (st.f === 3 ? 1 : 0.88); c.fill(); }
        c.strokeStyle = st.b || st.f === 2 ? BR : IV; c.lineWidth = (st.w || 3.5) / SC; c.globalAlpha = fo; c.stroke();
      });
      c.restore();
    });
    const a = fo * e.out(win(t, 0.3, 0.9));
    rich(c, [{ s: 'The scribes are laughing.', f: `italic 600 48px ${FS}`, c: IV }], 960, 566, { a, p: e.out(win(t, 0.3, 1.1)), blur: 16 });
    if (player.name) {
      rich(c, [{ s: player.name, f: `600 40px ${FT}`, c: pc }], 960, 614, { ls: 8, a: fo * e.out(win(t, 0.8, 1.3)), blur: 12 });
      taper(c, [[820, 626], [960, 630], [1100, 626]], 1, 2.2, pc, fo * e.out(win(t, 1.0, 1.5)), 0.5);
    }
  } };
}

/* ============================================================ 3 WOW */
function wow(api) {
  const { rand, player, x, y } = api, dur = DURATION.wow, pc = mute(player.color);
  const yb = clamp(y - 80, 380, 640);
  const LF = `900 230px ${FT}`, RF = `600 110px ${FT}`;
  const wL = mw(api, T('L', LF, GD), 0), wR = mw(api, T('egendary', RF, IV), 8), total = wL + 6 + wR;
  const cx = clamp(x, 60 + total / 2 + 30, 1860 - total / 2 - 30), left = cx - total / 2, rx0 = left + wL + 6 - 2;
  const LH = 165;
  const wash = mkWash(rand, cx, yb - 20, total + 460, 380, 11), washLayer = mkLayer();
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
    dimDraw(c, washLayer, (lc) => drawWash(lc, wash, e.out(win(t, 0.3, 1.1)), fo), api.keepOut);
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
  const { rand, x, y } = api, dur = DURATION.wololo, R = 300;
  const pig = mute(api.player.color), rim = mix(pig, '#2a1a10', 0.45);
  const cx = clamp(x, 560, 1360), cy = clamp(y, 380, 640);
  const blobs = [], sats = [], gran = [];
  for (let i = 0; i < 12; i++) { const a = rand() * 6.2832, d = rand() * R * 0.3; blobs.push({ x: x + Math.cos(a) * d, y: y + Math.sin(a) * d * 0.8, r: R * (0.5 + rand() * 0.45), d0: rand() * 0.35 }); }
  for (let i = 0; i < 20; i++) { const a = rand() * 6.2832; sats.push({ x: x + Math.cos(a) * R * (0.65 + rand() * 0.3), y: y + Math.sin(a) * R * (0.55 + rand() * 0.3), r: R * (0.12 + rand() * 0.16), d0: 0.25 + rand() * 0.4 }); }
  for (let i = 0; i < 170; i++) { const a = rand() * 6.2832, d = Math.sqrt(rand()) * R * 1.05; gran.push({ x: x + Math.cos(a) * d, y: y + Math.sin(a) * d * 0.85, r: 0.8 + rand() * 1.8, a: 0.25 + rand() * 0.4, dk: rand() < 0.6, d: d / R }); }
  const wash = mkWash(rand, cx, cy - 30, 900, 280, 8), washLayer = mkLayer();
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
    dimDraw(c, washLayer, (lc) => drawWash(lc, wash, e.out(win(t, 0.4, 1.1)), fo), api.keepOut);
    rich(c, T('Wololo.', `italic 600 170px ${FS}`, IV), cx, cy + 40, { ls: 3, a: fo, p: e.out(win(t, 0.7, 1.4)), blur: 22 });
  } };
}

/* ============================================================ 5 SPOTLIGHT */
function spotlight(api) {
  const { rand, x, y } = api, dur = DURATION.spotlight, pc = mute(api.player.color), HR = 225;
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
    }, api.keepOut);
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
  const { rand } = api, dur = DURATION.gg, GX = 960;
  const aw = api.awards || {}, w = aw.play || { name: '—', color: '#d6c6a6' }, b = aw.blunder || { name: '—', color: '#d6c6a6' };
  const GF = `600 290px ${FT}`, LFt = `italic 600 44px ${FS}`, LFn = `italic 700 44px ${FS}`;
  const line = (label, a) => (a.name ? [{ s: label + ' · ', f: LFt, c: IV2 }, { s: a.name, f: LFn, c: mute(a.color) }] : [{ s: label, f: LFt, c: IV2 }]);
  const l1 = line('Play of the game', w), l2 = line('Blunder of the game', b);
  const gw = mw(api, T('GG', GF, BR), 30), w1 = mw(api, l1), w2 = mw(api, l2);
  const YG = 450, Y1 = 560, Y2 = 640;
  const wash = mkWash(rand, GX, 520, 1500, 520, 14), layer = mkLayer();
  const S = sfx(api);
  if (S) {
    for (let i = 0; i < 20; i++) S.noise(0.6 + i * 0.08, 0.05, { type: 'highpass', f0: 2400 + (i % 4) * 500, f1: 3800, g: 0.12 });
    for (let i = 0; i < 16; i++) S.noise(2.8 + i * 0.1, 0.05, { type: 'highpass', f0: 2400 + (i % 4) * 500, f1: 3800, g: 0.1 });
    for (let i = 0; i < 16; i++) S.noise(4.9 + i * 0.1, 0.05, { type: 'highpass', f0: 2400 + (i % 4) * 500, f1: 3800, g: 0.1 });
    [[130.8, 0.4], [196, 0.5], [261.6, 0.6], [329.6, 0.7]].forEach(([f, at]) => S.tone(at, 5.2, { type: 'triangle', f0: f, f1: f * 0.997, g: 0.07, atk: 1.0, lp: 1100 }));
  }
  return { duration: dur, render(t) {
    const c = begin(api), e = api.ease, fo = fade(t, dur, 1.0), dim = 1 - 0.35 * win(t, 6.4, 7.6), a = fo * dim;
    dimDraw(c, layer, (lc) => drawWash(lc, wash, e.out(win(t, 0, 0.9)), fo), api.keepOut);
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
