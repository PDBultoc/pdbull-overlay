/* Style A · MEME / COMIC. Prototype. All art drawn in code. render(t) is pure in t; randomness only from api.rand in make(). */
import { PLAY } from './harness.js';

const FONT = "'Bangers','Comic Sans MS',Impact,sans-serif";
const TAU = Math.PI * 2;
const clamp = (v, a, b) => Math.min(b, Math.max(a, v));
const lerp = (a, b, k) => a + (b - a) * k;

/* ---------- canvas helpers ---------- */
function clipPlay(ctx) { ctx.beginPath(); ctx.rect(PLAY.x, PLAY.y, PLAY.w, PLAY.h); ctx.clip(); }
/* thick comic outline: stroke wide first, then fill, so `lw` px stay visible outside the fill */
function ob(ctx, fill, lw = 8) {
  ctx.lineJoin = 'round'; ctx.lineCap = 'round'; ctx.miterLimit = 3;
  ctx.lineWidth = lw * 2; ctx.strokeStyle = '#000'; ctx.stroke();
  ctx.fillStyle = fill; ctx.fill();
}
function burstPath(ctx, ro, ri, n, jag, rot = 0) {
  ctx.beginPath();
  for (let i = 0; i < n * 2; i++) {
    const a = rot + i * Math.PI / n, r = (i % 2 ? ri : ro) * jag[i];
    const px = Math.cos(a) * r, py = Math.sin(a) * r;
    i ? ctx.lineTo(px, py) : ctx.moveTo(px, py);
  }
  ctx.closePath();
}
/* halftone: dots on a 45-degree grid, biggest at the centre of the ring, shrinking outward */
function halftone(ctx, cx, cy, r0, R, step, color, alpha = 1, bigAtEdge = false) {
  ctx.save(); ctx.globalAlpha *= alpha; ctx.fillStyle = color; ctx.beginPath();
  const k = Math.ceil(R / step) + 1;
  for (let i = -k; i <= k; i++) for (let j = -k; j <= k; j++) {
    const x = (i + j) * step * 0.5, y = (i - j) * step * 0.5, d = Math.hypot(x, y);
    if (d < r0 || d > R) continue;
    const f = (d - r0) / (R - r0), s = (bigAtEdge ? f : 1 - f) * step * 0.48;
    if (s < 0.6) continue;
    ctx.moveTo(cx + x + s, cy + y); ctx.arc(cx + x, cy + y, s, 0, TAU);
  }
  ctx.fill(); ctx.restore();
}
function speedLines(ctx, cx, cy, r0, r1, lines, rot, fill, lw = 5) {
  ctx.fillStyle = fill; ctx.strokeStyle = '#000'; ctx.lineWidth = lw; ctx.lineJoin = 'round';
  for (const l of lines) {
    const a = rot + l.a, a2 = l.w;
    const ra = r0 + (r1 - r0) * l.in, rb = r0 + (r1 - r0) * l.out;
    ctx.beginPath();
    ctx.moveTo(cx + Math.cos(a) * ra, cy + Math.sin(a) * ra);
    ctx.lineTo(cx + Math.cos(a - a2) * rb, cy + Math.sin(a - a2) * rb);
    ctx.lineTo(cx + Math.cos(a + a2) * rb, cy + Math.sin(a + a2) * rb);
    ctx.closePath(); ctx.fill(); ctx.stroke();
  }
}
function mkLines(rand, n) {
  return Array.from({ length: n }, (_, i) => ({ a: (i / n) * TAU + (rand() - .5) * .12, w: .012 + rand() * .03, in: .05 + rand() * .3, out: .6 + rand() * .4 }));
}
/* speech bubble in local coords (centre 0,0); tail tip at (tx,ty) */
function bubble(ctx, rx, ry, tx, ty, fill = '#fff', lw = 9) {
  const ang = Math.atan2(ty / ry, tx / rx), b1 = ang - .3, b2 = ang + .3, k = .88;
  const tail = () => { ctx.beginPath(); ctx.moveTo(Math.cos(b1) * rx * k, Math.sin(b1) * ry * k); ctx.lineTo(tx, ty); ctx.lineTo(Math.cos(b2) * rx * k, Math.sin(b2) * ry * k); ctx.closePath(); };
  ctx.lineJoin = 'round'; ctx.lineWidth = lw * 2; ctx.strokeStyle = '#000';
  ctx.beginPath(); ctx.ellipse(0, 0, rx, ry, 0, 0, TAU); ctx.stroke(); tail(); ctx.stroke();
  ctx.fillStyle = fill; ctx.beginPath(); ctx.ellipse(0, 0, rx, ry, 0, 0, TAU); ctx.fill(); tail(); ctx.fill();
}
function sparkle(ctx, x, y, r, rot, fill) {
  ctx.save(); ctx.translate(x, y); ctx.rotate(rot); ctx.beginPath();
  for (let i = 0; i < 8; i++) { const a = i * Math.PI / 4, rr = i % 2 ? r * .3 : r; i ? ctx.lineTo(Math.cos(a) * rr, Math.sin(a) * rr) : ctx.moveTo(rr, 0); }
  ctx.closePath(); ob(ctx, fill, 3); ctx.restore();
}
function coin(ctx, x, y, r, spin, alpha) {
  const sx = Math.abs(Math.cos(spin)) * .85 + .15;
  ctx.save(); ctx.globalAlpha *= alpha; ctx.translate(x, y); ctx.scale(sx, 1);
  ctx.beginPath(); ctx.arc(0, 0, r, 0, TAU); ob(ctx, '#ffc400', 4);
  ctx.beginPath(); ctx.arc(0, 0, r * .62, 0, TAU); ctx.lineWidth = 3; ctx.strokeStyle = '#b87900'; ctx.stroke();
  ctx.fillStyle = '#fff3a0'; ctx.beginPath(); ctx.arc(-r * .3, -r * .3, r * .18, 0, TAU); ctx.fill();
  ctx.restore();
}
function villager(ctx, col, s, wob) {
  ctx.save(); ctx.scale(s, s); ctx.lineCap = 'round'; ctx.lineJoin = 'round';
  ctx.strokeStyle = '#000'; ctx.lineWidth = 11;
  ctx.beginPath(); ctx.moveTo(-14, 18); ctx.lineTo(-34, -6 + wob); ctx.moveTo(14, 18); ctx.lineTo(34, -6 - wob); ctx.stroke();
  ctx.strokeStyle = '#f4c590'; ctx.lineWidth = 5; ctx.stroke();
  ctx.beginPath(); ctx.moveTo(-14, 10); ctx.lineTo(14, 10); ctx.lineTo(21, 54); ctx.lineTo(-21, 54); ctx.closePath(); ob(ctx, col, 4);
  ctx.beginPath(); ctx.arc(0, -6, 22, 0, TAU); ob(ctx, '#f4c590', 4);
  ctx.strokeStyle = '#000'; ctx.lineWidth = 3.5;
  ctx.beginPath(); ctx.moveTo(-14, -14); ctx.lineTo(-6, -9); ctx.lineTo(-14, -5); ctx.moveTo(14, -14); ctx.lineTo(6, -9); ctx.lineTo(14, -5); ctx.stroke();
  ctx.beginPath(); ctx.arc(0, 8, 7, Math.PI * 1.15, Math.PI * 1.85); ctx.stroke();
  ctx.fillStyle = '#35c8ff'; ctx.strokeStyle = '#000'; ctx.lineWidth = 2;
  for (const [x, y] of [[-24, -4 + wob * .3], [24, -2 - wob * .3], [-28, 8 + wob * .4], [28, 10 - wob * .4]]) { ctx.beginPath(); ctx.arc(x, y, 5, 0, TAU); ctx.fill(); ctx.stroke(); }
  ctx.restore();
}
function chicken(ctx, s, flip) {
  ctx.save(); ctx.scale(s * flip, s); ctx.lineCap = 'round'; ctx.lineJoin = 'round';
  ctx.strokeStyle = '#000'; ctx.lineWidth = 9; ctx.beginPath(); ctx.moveTo(-6, -14); ctx.lineTo(-8, 0); ctx.moveTo(8, -14); ctx.lineTo(10, 0); ctx.stroke();
  ctx.strokeStyle = '#ff9a1f'; ctx.lineWidth = 4; ctx.stroke();
  ctx.beginPath(); ctx.moveTo(-24, -40); ctx.lineTo(-48, -62); ctx.lineTo(-42, -34); ctx.closePath(); ob(ctx, '#e8e8e8', 4);
  ctx.beginPath(); ctx.ellipse(0, -34, 30, 24, 0, 0, TAU); ob(ctx, '#fff', 5);
  ctx.beginPath(); ctx.ellipse(-4, -32, 14, 9, -.3, 0, TAU); ctx.lineWidth = 3; ctx.strokeStyle = '#000'; ctx.stroke();
  ctx.beginPath(); ctx.moveTo(32, -64); ctx.lineTo(48, -58); ctx.lineTo(32, -52); ctx.closePath(); ob(ctx, '#ff9a1f', 3);
  for (const [x, y] of [[16, -82], [24, -86], [30, -80]]) { ctx.beginPath(); ctx.arc(x - 6, y + 2, 7, 0, TAU); ob(ctx, '#ef2b2b', 3); }
  ctx.beginPath(); ctx.arc(22, -62, 15, 0, TAU); ob(ctx, '#fff', 5);
  ctx.fillStyle = '#000'; ctx.beginPath(); ctx.arc(27, -66, 3.5, 0, TAU); ctx.fill();
  ctx.restore();
}
function sheep(ctx, s, flip) {
  ctx.save(); ctx.scale(s * flip, s); ctx.lineCap = 'round'; ctx.lineJoin = 'round';
  ctx.strokeStyle = '#000'; ctx.lineWidth = 12; ctx.beginPath(); for (const x of [-18, -6, 10, 22]) { ctx.moveTo(x, -16); ctx.lineTo(x, 0); } ctx.stroke();
  ctx.strokeStyle = '#3a3a3a'; ctx.lineWidth = 5; ctx.stroke();
  const cs = [[-26, -44, 20], [-6, -56, 22], [16, -52, 21], [28, -38, 18], [-8, -36, 24], [10, -32, 22], [-28, -30, 16]];
  ctx.lineWidth = 12; ctx.strokeStyle = '#000';
  for (const [x, y, r] of cs) { ctx.beginPath(); ctx.arc(x, y, r, 0, TAU); ctx.stroke(); }
  ctx.beginPath(); ctx.ellipse(40, -40, 15, 13, 0, 0, TAU); ctx.stroke();
  ctx.fillStyle = '#fff'; for (const [x, y, r] of cs) { ctx.beginPath(); ctx.arc(x, y, r, 0, TAU); ctx.fill(); }
  ctx.beginPath(); ctx.ellipse(40, -40, 15, 13, 0, 0, TAU); ctx.fillStyle = '#3a3a3a'; ctx.fill();
  ctx.fillStyle = '#fff'; ctx.beginPath(); ctx.arc(44, -44, 4.5, 0, TAU); ctx.fill();
  ctx.fillStyle = '#000'; ctx.beginPath(); ctx.arc(45, -44, 2, 0, TAU); ctx.fill();
  ctx.restore();
}
function arrowPath(ctx) {
  ctx.beginPath(); ctx.moveTo(0, 0); ctx.lineTo(-115, -88); ctx.lineTo(-115, -38); ctx.lineTo(-340, -38); ctx.lineTo(-340, 38); ctx.lineTo(-115, 38); ctx.lineTo(-115, 88); ctx.closePath();
}

/* ---------- DOM helpers ---------- */
function txt(api, text, size, fill, o = {}) {
  const d = document.createElement('div'); d.textContent = text;
  d.style.cssText = `position:absolute;left:0;top:0;white-space:nowrap;font:${size}px ${FONT};letter-spacing:${o.ls ?? 2}px;color:${fill};` +
    `-webkit-text-stroke:${o.stroke ?? 10}px #000;paint-order:stroke fill;text-shadow:${o.shadow ?? '6px 6px 0 #000'};opacity:0;will-change:transform;`;
  api.dom.appendChild(d); return d;
}
function place(el, x, y, rot = 0, sx = 1, sy = sx, op = 1) {
  el.style.transform = `translate(${x.toFixed(1)}px,${y.toFixed(1)}px) translate(-50%,-50%) rotate(${rot.toFixed(4)}rad) scale(${sx.toFixed(4)},${sy.toFixed(4)})`;
  el.style.opacity = op < 0.01 ? 0 : op;
}
const nameTag = (api, size = 84) => txt(api, api.player.name, size, api.player.color, { stroke: 12, shadow: '5px 5px 0 #000' });

/* ---------- audio helpers (synth only) ---------- */
function tone(ac, at, f0, f1, dur, type = 'square', vol = .14, vib = 0) {
  const o = ac.createOscillator(), g = ac.createGain(), t0 = ac.currentTime + at;
  o.type = type; o.frequency.setValueAtTime(f0, t0); o.frequency.exponentialRampToValueAtTime(Math.max(1, f1), t0 + dur);
  if (vib) { const l = ac.createOscillator(), lg = ac.createGain(); l.frequency.value = vib; lg.gain.value = f0 * .07; l.connect(lg); lg.connect(o.frequency); l.start(t0); l.stop(t0 + dur + .05); }
  g.gain.setValueAtTime(.0001, t0); g.gain.exponentialRampToValueAtTime(vol, t0 + .015); g.gain.exponentialRampToValueAtTime(.0001, t0 + dur);
  o.connect(g); g.connect(ac.destination); o.start(t0); o.stop(t0 + dur + .05);
}
function whoosh(ac, at, dur, f0, f1, vol = .18) {
  const n = Math.floor(ac.sampleRate * dur), buf = ac.createBuffer(1, n, ac.sampleRate), d = buf.getChannelData(0);
  let s = 12345; for (let i = 0; i < n; i++) { s = (s * 16807) % 2147483647; d[i] = (s / 2147483647) * 2 - 1; }
  const src = ac.createBufferSource(), f = ac.createBiquadFilter(), g = ac.createGain(), t0 = ac.currentTime + at;
  src.buffer = buf; f.type = 'bandpass'; f.Q.value = 1.4; f.frequency.setValueAtTime(f0, t0); f.frequency.exponentialRampToValueAtTime(f1, t0 + dur);
  g.gain.setValueAtTime(.0001, t0); g.gain.exponentialRampToValueAtTime(vol, t0 + dur * .3); g.gain.exponentialRampToValueAtTime(.0001, t0 + dur);
  src.connect(f); f.connect(g); g.connect(ac.destination); src.start(t0);
}

/* =========================================================== 1 BLUNDER */
function blunder(api) {
  const { ctx, rand, ease: E, audio: ac } = api;
  const cx = clamp(api.x, 480, 1440), cy = clamp(api.y, 430, 500), N = 11;
  const jag = Array.from({ length: N * 2 }, (_, i) => i % 2 ? .9 + .2 * rand() : .85 + .3 * rand());
  const vill = Array.from({ length: 12 }, () => ({ x: cx - 650 + rand() * 1300, d: 1.1 + rand() * .6, vx: (rand() - .5) * 160, vy: -200 - rand() * 300, sp: (rand() - .5) * 9, r0: rand() * 6, s: .9 + rand() * .7 }));
  const lines = mkLines(rand, 18);
  const zig = [[0, -420], [-34, -200], [30, -90], [-30, 30], [28, 150], [0, 420]];
  const polyL = [[-900, -420], ...zig, [-900, 420]], polyR = [[900, -420], ...zig, [900, 420]];
  const cp = (poly) => 'polygon(' + poly.map(([x, y]) => `${x + 600}px ${y + 200}px`).join(',') + ')';
  const halves = [-1, 1].map((side) => {
    const w = document.createElement('div');
    w.style.cssText = `position:absolute;left:0;top:0;width:1200px;height:400px;display:flex;align-items:center;justify-content:center;opacity:0;will-change:transform;clip-path:${cp(side < 0 ? polyL : polyR)}`;
    const s = document.createElement('div'); s.textContent = 'BLUNDER!';
    s.style.cssText = `font:190px ${FONT};letter-spacing:3px;color:#fff;-webkit-text-stroke:13px #000;paint-order:stroke fill;text-shadow:9px 9px 0 #000;white-space:nowrap`;
    w.appendChild(s); api.dom.appendChild(w); return w;
  });
  const nm = nameTag(api, 88);
  if (ac) {
    tone(ac, .1, 140, 40, .3, 'sine', .4); whoosh(ac, 0, .25, 3000, 400, .12);
    [[392, 370, 0.35], [349, 330, 0.35], [330, 311, 0.35], [262, 175, 0.9]].forEach(([a, b, d], i) => tone(ac, .35 + i * .38, a, b, d, 'sawtooth', .12, 7));
    whoosh(ac, 1.1, .35, 2500, 200, .2);
  }
  return {
    duration: 2.6,
    render(t) {
      clipPlay(ctx);
      const fade = 1 - E.win(t, 2.2, 2.6); ctx.globalAlpha = fade;
      const sc = 1 + 2.2 * (1 - E.in(E.win(t, 0, .2))), op = Math.min(1, t / .05);
      const a = (t > .2 ? 16 * Math.exp(-(t - .2) * 5) : 0) + (t > .85 && t < 1.15 ? (t - .85) * 50 : 0);
      const sx = Math.sin(t * 90) * a, sy = Math.cos(t * 77) * a;
      const tau = Math.max(0, t - 1.15);
      if (t > .2) {
        const k = E.win(t, .2, .7);
        halftone(ctx, cx, cy, 200, 300 + 230 * E.out(k), 24, '#6d0a0a', (1 - E.win(t, .6, 1.6) * .5) * op);
        ctx.save(); ctx.globalAlpha *= 1 - k; ctx.beginPath(); ctx.arc(cx, cy, 120 + 560 * E.out(k), 0, TAU); ctx.lineWidth = 26; ctx.strokeStyle = '#000'; ctx.stroke();
        ctx.lineWidth = 12; ctx.strokeStyle = '#ffe11a'; ctx.stroke(); ctx.restore();
      }
      if (t < 1.15) ctx.save(), ctx.globalAlpha *= op, speedLines(ctx, cx, cy, 380, 720, lines, 0, '#fff', 4), ctx.restore();
      [-1, 1].forEach((side, i) => {
        const dx = side * 230 * tau, dy = .5 * 1800 * tau * tau, rot = side * tau * 1.5 * (tau > 0 ? 1 : 0);
        ctx.save(); ctx.globalAlpha *= op; ctx.translate(cx + sx + dx, cy + sy + dy); ctx.rotate(rot);
        ctx.beginPath(); (side < 0 ? polyL : polyR).forEach(([x, y], j) => j ? ctx.lineTo(x, y) : ctx.moveTo(x, y)); ctx.closePath(); ctx.clip();
        ctx.scale(sc * 1.45, sc);
        burstPath(ctx, 300, 215, N, jag); ob(ctx, '#e8202a', 9);
        burstPath(ctx, 300 * .8, 215 * .78, N, jag, .1); ctx.fillStyle = '#ff5a2c'; ctx.fill();
        ctx.restore();
        place(halves[i], cx + sx + dx, cy + sy + dy, rot, sc, sc, op * fade);
      });
      if (t < 1.2) { // the crack growing across the burst
        const k = E.win(t, .8, 1.1), m = Math.max(2, Math.ceil(zig.length * k));
        ctx.save(); ctx.globalAlpha *= op; ctx.translate(cx + sx, cy + sy); ctx.beginPath();
        for (let j = 0; j < m; j++) { const [x, y] = zig[j]; j ? ctx.lineTo(x, y) : ctx.moveTo(x, y); }
        ctx.lineWidth = 10; ctx.lineJoin = 'miter'; ctx.strokeStyle = '#000'; ctx.stroke(); ctx.restore();
      }
      for (const v of vill) {
        const u = t - v.d; if (u < 0) continue;
        const px = v.x + v.vx * u, py = PLAY.y - 40 + v.vy * u + .5 * 1400 * u * u;
        ctx.save(); ctx.translate(px, py); ctx.rotate(v.r0 + v.sp * u); villager(ctx, api.player.color, v.s, Math.sin(u * 14) * 6); ctx.restore();
      }
      const nk = E.win(t, .45, .85);
      place(nm, cx, cy + 305, -.03, E.back(nk), E.back(nk), nk * fade);
    },
  };
}

/* =========================================================== 2 FUNNY */
function funny(api) {
  const { ctx, rand, ease: E, audio: ac } = api;
  const cx = clamp(api.x, 560, 1360), cy = 330, DT = 1 / 90, FLOOR = 835;
  const animals = Array.from({ length: 24 }, () => {
    const a = { kind: rand() < .5 ? 0 : 1, x: 120 + rand() * 1680, d: .15 + rand() * 1.3, s: .85 + rand() * .45, vx: (rand() - .5) * 90, floor: FLOOR - rand() * 14, flip: rand() < .5 ? -1 : 1, r0: (rand() - .5) * .6, pitch: 400 + rand() * 500 };
    const n = Math.ceil(3.2 / DT) + 2; a.y = new Float32Array(n); a.q = new Float32Array(n);
    let y = PLAY.y - 90, v = 0, sq = 0;
    for (let i = 0; i < n; i++) {
      v += 1900 * DT; y += v * DT; sq *= .9;
      if (y >= a.floor) { y = a.floor; if (v > 160) sq = Math.min(.42, v / 2600); v = v > 200 ? -v * .55 : 0; }
      a.y[i] = y; a.q[i] = sq;
    }
    a.land = a.d + Math.sqrt(2 * (a.floor - PLAY.y + 90) / 1900);
    return a;
  });
  const lines = Array.from({ length: 6 }, (_, i) => ({ a: -2.6 + i * .42 + (rand() - .5) * .1, l: 30 + rand() * 20 }));
  const bt = txt(api, 'WHAT?!', 175, '#e8202a', { stroke: 0, shadow: '5px 5px 0 rgba(0,0,0,.25)', ls: 3 });
  const nm = nameTag(api, 76);
  if (ac) {
    tone(ac, 0, 180, 700, .14, 'sine', .3, 0); tone(ac, .12, 700, 250, .45, 'sine', .28, 16);
    animals.slice().sort((p, q) => p.land - q.land).slice(0, 9).forEach((a) => tone(ac, a.land, a.pitch, a.pitch * .45, .1, 'square', .05));
  }
  return {
    duration: 3.2,
    render(t) {
      clipPlay(ctx);
      const fade = 1 - E.win(t, 2.7, 3.2);
      // animals behind the bubble
      for (const a of animals) {
        const u = t - a.d; if (u < 0) continue;
        const f = u / DT, i = Math.min(a.y.length - 2, Math.floor(f)), k = f - i;
        const y = lerp(a.y[i], a.y[i + 1], k), q = lerp(a.q[i], a.q[i + 1], k), air = y < a.floor - 4 ? 1 : .25;
        ctx.save(); ctx.globalAlpha = fade; ctx.translate(a.x + a.vx * u, y); ctx.rotate(a.r0 + Math.sin(u * 11) * .22 * air);
        ctx.scale(1 + q, 1 - q);
        (a.kind ? sheep : chicken)(ctx, a.s, a.flip); ctx.restore();
      }
      // bubble
      const pk = E.elastic(E.win(t, 0, .6)), w = Math.sin(t * 14);
      const sx = pk * (1 + .06 * w), sy = pk * (1 - .06 * w), rot = Math.sin(t * 9) * .05;
      ctx.save(); ctx.globalAlpha = fade; ctx.translate(cx, cy); ctx.rotate(rot); ctx.scale(sx, sy);
      bubble(ctx, 340, 140, -130, 215);
      ctx.lineCap = 'round'; ctx.strokeStyle = '#000'; ctx.lineWidth = 8;
      for (const l of lines) { const r0 = 380 + (t * 40 % 10), r1 = r0 + l.l * 1.6; ctx.beginPath(); ctx.moveTo(Math.cos(l.a) * r0, Math.sin(l.a) * r0 * .55); ctx.lineTo(Math.cos(l.a) * r1, Math.sin(l.a) * r1 * .55); ctx.stroke(); }
      ctx.restore();
      place(bt, cx, cy, rot + Math.sin(t * 31) * .015, sx, sy, Math.min(1, t / .1) * fade);
      const nk = E.win(t, .5, .9);
      place(nm, cx - 70, cy + 255, -.05, E.back(nk), E.back(nk), nk * fade);
    },
  };
}

/* =========================================================== 3 WOW */
function wow(api) {
  const { ctx, rand, ease: E, audio: ac } = api;
  const cx = clamp(api.x, 420, 1500), cy = clamp(api.y, 450, 550), N = 12;
  const jag = Array.from({ length: N * 2 }, (_, i) => i % 2 ? .9 + .15 * rand() : .82 + .35 * rand());
  const lines = mkLines(rand, 34);
  const coins = Array.from({ length: 60 }, () => { const a = rand() * TAU, sp = 450 + rand() * 750; return { d: rand() * .15, vx: Math.cos(a) * sp, vy: Math.sin(a) * sp - 250, r: 18 + rand() * 11, sp: 8 + rand() * 10, p: rand() * TAU }; });
  const tx = txt(api, 'WOW!', 270, '#fff23a', { stroke: 14, shadow: '10px 10px 0 #c5141c', ls: 4 });
  const nm = nameTag(api, 80);
  if (ac) {
    whoosh(ac, 0, .5, 300, 4000, .22);
    [660, 880, 1320].forEach((f, i) => tone(ac, .08 + i * .09, f, f * 1.01, .5, 'sine', .16));
    for (let i = 0; i < 9; i++) tone(ac, .3 + i * .09 + (i % 3) * .02, 2000 + (i * 397) % 1300, 1600, .07, 'triangle', .06);
  }
  return {
    duration: 3.2,
    render(t) {
      clipPlay(ctx);
      const fade = 1 - E.win(t, 2.7, 3.2); ctx.globalAlpha = fade;
      const flash = Math.max(0, 1 - t / .18);
      const pk = E.elastic(E.win(t, .03, .6)), rot = Math.sin(t * 6) * .02;
      halftone(ctx, cx, cy, 120, 430 * E.out(E.win(t, 0, .5)) + 40, 22, '#d9430c', .85, true);
      ctx.save(); ctx.globalAlpha *= E.win(t, 0, .1); speedLines(ctx, cx, cy, 300, 1100, lines, t * .08, '#fff', 4); ctx.restore();
      ctx.save(); ctx.translate(cx, cy); ctx.rotate(rot); ctx.scale(pk * 1.35, pk);
      burstPath(ctx, 300, 210, N, jag); ob(ctx, '#ffd51a', 10);
      burstPath(ctx, 300 * .72, 210 * .72, N, jag, .12); ctx.fillStyle = '#ef2b2b'; ctx.fill();
      ctx.restore();
      if (flash > 0) { ctx.save(); ctx.globalAlpha = flash * .7 * fade; ctx.fillStyle = '#fff'; ctx.fillRect(PLAY.x, PLAY.y, PLAY.w, PLAY.h); ctx.restore(); }
      for (const c of coins) {
        const u = t - .1 - c.d; if (u < 0) continue;
        const px = api.x + c.vx * u * (1 - u * .12), py = api.y + c.vy * u + .5 * 900 * u * u;
        coin(ctx, px, py, c.r, c.p + c.sp * u, fade * (1 - E.win(u, 2, 2.5)));
      }
      const sh = t < .5 ? Math.sin(t * 80) * 8 * (1 - t / .5) : 0;
      place(tx, cx + sh, cy - 15, rot - .06, pk * 1.0, pk, Math.min(1, t / .08) * fade);
      const nk = E.win(t, .5, .9);
      place(nm, cx, cy + 215, .03, E.back(nk), E.back(nk), nk * fade);
    },
  };
}

/* =========================================================== 4 WOLOLO */
function wololo(api) {
  const { ctx, rand, ease: E, audio: ac } = api;
  const px = api.x, py = clamp(api.y, 230, 800);
  const bx = clamp(px, 400, 1520), by = clamp(py - 260, 300, 560), ry = 105;
  const stars = Array.from({ length: 14 }, () => ({ a: rand() * TAU, d: .1 + rand() * .5, v: 160 + rand() * 330, r: 12 + rand() * 12, sp: (rand() - .5) * 6 }));
  const word = document.createElement('div');
  word.style.cssText = `position:absolute;left:0;top:0;white-space:nowrap;opacity:0;font:130px ${FONT};color:#fff;-webkit-text-stroke:0;`;
  const letters = [...'WOLOLO!'].map((ch, i) => {
    const s = document.createElement('span'); s.textContent = ch;
    s.style.cssText = `display:inline-block;color:${i % 2 ? '#e8202a' : '#111'};letter-spacing:3px`;
    word.appendChild(s); return s;
  });
  api.dom.appendChild(word);
  const nm = nameTag(api, 64);
  if (ac) {
    [[300, 460, .22], [440, 330, .15], [340, 470, .15], [450, 300, .3]].forEach(([a, b, d], i) => tone(ac, .1 + [0, .3, .5, .7][i], a, b, d, 'sawtooth', .1, 9));
    whoosh(ac, 0, .8, 300, 1800, .1);
  }
  return {
    duration: 2.4,
    render(t) {
      clipPlay(ctx);
      const fade = 1 - E.win(t, 2, 2.4); ctx.globalAlpha = fade;
      ctx.lineJoin = 'round';
      for (let k = 0; k < 5; k++) {
        const s0 = k * .17, p = E.win(t, s0, s0 + 1.35); if (p <= 0 || p >= 1) continue;
        const R = 40 + 560 * E.out(p), A = 10 + 22 * (1 - p), ph = t * 11 + k;
        ctx.save(); ctx.globalAlpha *= 1 - p * p;
        ctx.beginPath();
        for (let i = 0; i <= 96; i++) { const a = i / 96 * TAU, r = R + A * Math.sin(a * 8 + ph); i ? ctx.lineTo(px + Math.cos(a) * r, py + Math.sin(a) * r * .8) : ctx.moveTo(px + Math.cos(a) * r, py + Math.sin(a) * r * .8); }
        ctx.closePath(); ctx.lineWidth = 26 - 10 * p; ctx.strokeStyle = '#000'; ctx.stroke(); ctx.lineWidth = 14 - 6 * p; ctx.strokeStyle = api.player.color; ctx.stroke();
        ctx.restore();
      }
      halftone(ctx, px, py, 0, 170, 20, api.player.color, .55 * (1 - E.win(t, .3, 1.2)) * E.win(t, 0, .1));
      for (const s of stars) {
        const u = t - s.d; if (u < 0) continue;
        sparkle(ctx, px + Math.cos(s.a) * (60 + s.v * u), py + Math.sin(s.a) * (60 + s.v * u) * .8 - 40 * u, s.r * (1 - E.win(u, 1, 1.6)), u * s.sp, '#fff23a');
      }
      const pk = E.elastic(E.win(t, .12, .6)), w = Math.sin(t * 16), rot = Math.sin(t * 8) * .06;
      const tipY = Math.max(py - 40, by + ry + 50);
      ctx.save(); ctx.translate(bx, by); ctx.rotate(rot); ctx.scale(pk * (1 + .05 * w), pk * (1 - .05 * w));
      bubble(ctx, 380, ry, clamp(px - bx, -300, 300), tipY - by, '#fff');
      ctx.restore();
      place(word, bx, by, rot, pk, pk, Math.min(1, E.win(t, .12, .2)) * fade);
      letters.forEach((s, i) => { s.style.transform = `translateY(${(Math.sin(t * 16 + i * .9) * 9).toFixed(1)}px) rotate(${(Math.sin(t * 12 + i * 1.7) * .12).toFixed(3)}rad)`; });
      const nk = E.win(t, .25, .6);
      place(nm, px, clamp(py + 100, 200, 820), -.04, E.back(nk), E.back(nk), nk * fade);
    },
  };
}

/* =========================================================== 5 SPOTLIGHT */
function spotlight(api) {
  const { ctx, rand, ease: E, audio: ac } = api;
  const cx = api.x, cy = clamp(api.y, 280, 720), R = 170, dir = cx < 960 ? 1 : -1;
  const bx = cx + dir * 720, by = clamp(cy - 190, 270, 640);
  const sp = Array.from({ length: 8 }, (_, i) => ({ a: (i / 8) * TAU + rand() * .3, r: 8 + rand() * 8 }));
  const lk = txt(api, 'LOOK!', 150, '#e8202a', { stroke: 0, shadow: '4px 4px 0 rgba(0,0,0,.25)', ls: 3 });
  const nm = nameTag(api, 70);
  if (ac) { tone(ac, .08, 200, 900, .12, 'sine', .3); tone(ac, .9, 1000, 1000, .25, 'triangle', .12); tone(ac, 1.0, 1500, 1500, .3, 'triangle', .08); whoosh(ac, .05, .5, 400, 2500, .12); }
  return {
    duration: 4.5,
    render(t) {
      clipPlay(ctx);
      const fadeOut = E.win(t, 3.9, 4.5), dk = E.win(t, 0, .5) * (1 - fadeOut);
      const r = lerp(900, R, E.out(E.win(t, .08, .8))) + 900 * E.in(fadeOut) + Math.sin(t * 5) * 6;
      // dark vignette with a round hole, plus black halftone dots growing away from the circle
      ctx.save(); ctx.globalAlpha = dk; ctx.fillStyle = 'rgba(6,8,30,.66)';
      ctx.beginPath(); ctx.rect(PLAY.x, PLAY.y, PLAY.w, PLAY.h); ctx.arc(cx, cy, r, 0, TAU); ctx.fill('evenodd'); ctx.restore();
      ctx.save(); ctx.globalAlpha = dk; ctx.fillStyle = '#000'; ctx.beginPath();
      const step = 26, ox = (cx % step), oy = (cy % step);
      for (let gy = PLAY.y - step + oy % step; gy < PLAY.y + PLAY.h + step; gy += step) for (let gx = -step + ox; gx < 1920 + step; gx += step) {
        const x = gx + (Math.round((gy - oy) / step) % 2 ? step / 2 : 0), d = Math.hypot(x - cx, gy - cy) - r;
        if (d < 10) continue; const s = Math.min(step * .5, 2 + d * .035); ctx.moveTo(x + s, gy); ctx.arc(x, gy, s, 0, TAU);
      }
      ctx.fill(); ctx.restore();
      // ring around the circle
      ctx.save(); ctx.globalAlpha = dk; ctx.beginPath(); ctx.arc(cx, cy, r + 4, 0, TAU); ctx.lineWidth = 24; ctx.strokeStyle = '#000'; ctx.stroke(); ctx.lineWidth = 12; ctx.strokeStyle = '#ffe11a'; ctx.stroke(); ctx.restore();
      for (const s of sp) { const k = E.win(t, .6, 1.2); if (k > 0) sparkle(ctx, cx + Math.cos(s.a + t) * (r + 40), cy + Math.sin(s.a + t) * (r + 40), s.r * (1 + Math.sin(t * 8 + s.a)) * k * (1 - fadeOut), t * 2, '#fff'); }
      // arrow
      const ak = E.back(E.win(t, .5, 1)) * (1 - fadeOut), bob = Math.sin(t * 9) * 16;
      ctx.save(); ctx.translate(cx + dir * (r + 30 + (1 - ak) * 300 + 30 + bob), cy); if (dir > 0) ctx.rotate(Math.PI); ctx.scale(ak, ak); ctx.globalAlpha = ak;
      arrowPath(ctx); ob(ctx, '#ffe11a', 10);
      ctx.beginPath(); ctx.moveTo(-135, -14); ctx.lineTo(-320, -14); ctx.lineTo(-320, 14); ctx.lineTo(-135, 14); ctx.closePath(); ctx.fillStyle = '#ef2b2b'; ctx.fill();
      ctx.restore();
      // bubble
      const pk = E.elastic(E.win(t, .9, 1.5)) * (1 - fadeOut), w = Math.sin(t * 12), rot = Math.sin(t * 7) * .05;
      const tailX = cx + dir * (r + 30 + 340 + bob) - bx, tailY = cy - 40 - by;
      ctx.save(); ctx.translate(bx, by); ctx.rotate(rot); ctx.scale(pk * (1 + .05 * w), pk * (1 - .05 * w));
      bubble(ctx, 215, 115, clamp(tailX, -150, 150), clamp(tailY, 125, 300), '#fff'); ctx.restore();
      place(lk, bx, by, rot, pk, pk, Math.min(1, pk) * (1 - fadeOut));
      const nk = E.win(t, 1.2, 1.6);
      place(nm, cx, clamp(cy + r + 70, 200, 830), 0, E.back(nk), E.back(nk), nk * (1 - fadeOut));
    },
  };
}

/* =========================================================== 6 GG */
function gg(api) {
  const { ctx, rand, ease: E, audio: ac, dom } = api;
  const N = 12, jag = Array.from({ length: N * 2 }, (_, i) => i % 2 ? .9 + .15 * rand() : .82 + .35 * rand());
  const lines = mkLines(rand, 30);
  const best = (key) => api.tally.reduce((b, r) => (r[key] > (b ? b[key] : -1) ? r : b), null) || { name: '-', color: '#fff', blunders: 0, wows: 0 };
  const bl = best('blunders'), wo = best('wows');
  const title = txt(api, 'GG!', 340, '#fff23a', { stroke: 15, shadow: '11px 11px 0 #c5141c', ls: 6 });
  const mkCard = (head, headCol, who, count, unit, drawIcon) => {
    const c = document.createElement('div');
    c.style.cssText = 'position:absolute;left:0;top:0;width:600px;height:380px;box-sizing:border-box;border:10px solid #000;box-shadow:14px 14px 0 #000;opacity:0;will-change:transform;overflow:hidden;' +
      'background:#fff7d6 radial-gradient(rgba(0,0,0,.16) 22%,transparent 24%) 0 0/16px 16px';
    const h = document.createElement('div'); h.textContent = head;
    h.style.cssText = `height:84px;background:${headCol};border-bottom:10px solid #000;display:flex;align-items:center;justify-content:center;font:46px ${FONT};letter-spacing:2px;color:#fff;-webkit-text-stroke:7px #000;paint-order:stroke fill;white-space:nowrap`;
    const row = document.createElement('div'); row.style.cssText = 'display:flex;align-items:center;height:270px';
    const cv = document.createElement('canvas'); cv.width = 190; cv.height = 190; cv.style.cssText = 'margin:0 12px 0 20px';
    const col = document.createElement('div'); col.style.cssText = 'display:flex;flex-direction:column;width:340px';
    const nsz = clamp(Math.floor(330 / (who.name.length * .52)), 36, 88);
    const n = document.createElement('div'); n.textContent = who.name;
    n.style.cssText = `font:${nsz}px ${FONT};color:${who.color};-webkit-text-stroke:11px #000;paint-order:stroke fill;text-shadow:5px 5px 0 #000;white-space:nowrap;line-height:1.05`;
    const s = document.createElement('div'); s.textContent = `${count} ${unit}`;
    s.style.cssText = `font:46px ${FONT};color:#111;margin-top:10px;letter-spacing:1px`;
    col.append(n, s); row.append(cv, col); c.append(h, row); dom.appendChild(c);
    return { el: c, g: cv.getContext('2d'), drawIcon };
  };
  const cards = [
    mkCard('BLUNDER OF THE GAME', '#e8202a', bl, bl.blunders, bl.blunders === 1 ? 'blunder' : 'blunders', (g, t) => { g.translate(95, 70); villager(g, bl.color, 1.5, Math.sin(t * 12) * 7); }),
    mkCard('PLAY OF THE GAME', '#1fa84a', wo, wo.wows, wo.wows === 1 ? 'wow' : 'wows', (g, t) => { g.translate(95, 100); g.rotate(Math.sin(t * 3) * .1); burstPath(g, 82, 52, 8, Array(16).fill(1), 0); ob(g, '#ffd51a', 6); sparkle(g, 0, 0, 38, t * 1.5, '#fff'); }),
  ];
  if (ac) {
    [[523, 0], [659, .13], [784, .26], [1047, .4]].forEach(([f, d]) => tone(ac, d, f, f, .22, 'square', .1));
    tone(ac, .6, 1047, 1047, .8, 'square', .08); tone(ac, .6, 784, 784, .8, 'square', .06); tone(ac, .6, 523, 523, .8, 'square', .06);
    whoosh(ac, 2.45, .35, 500, 3000, .12); tone(ac, 3.0, 300, 900, .1, 'sine', .25);
    whoosh(ac, 3.25, .35, 500, 3000, .12); tone(ac, 3.8, 300, 900, .1, 'sine', .25);
  }
  return {
    duration: 8,
    render(t) {
      clipPlay(ctx);
      const fade = 1 - E.win(t, 7.3, 8); ctx.globalAlpha = fade;
      const pk = E.elastic(E.win(t, 0, .7)), mv = E.inOut(E.win(t, 2, 2.6));
      const ty = lerp(450, 238, mv), ts = lerp(1, .5, mv), rot = Math.sin(t * 5) * .03;
      const bs = pk * ts;
      halftone(ctx, 960, ty, 80 * ts, 520 * ts * Math.min(1, pk), 22, '#d9430c', .8, true);
      if (mv < 1) { ctx.save(); ctx.globalAlpha *= 1 - mv; speedLines(ctx, 960, ty, 300, 1000, lines, t * .06, '#fff', 4); ctx.restore(); }
      ctx.save(); ctx.translate(960, ty); ctx.rotate(rot); ctx.scale(bs * 1.5, bs);
      burstPath(ctx, 300, 215, N, jag); ob(ctx, '#e8202a', 10);
      burstPath(ctx, 300 * .75, 215 * .75, N, jag, .1); ctx.fillStyle = '#ff9a1f'; ctx.fill(); ctx.restore();
      place(title, 960 + (t < 1.2 ? Math.sin(t * 70) * 5 * Math.max(0, 1 - t) : 0), ty - 10, rot - .04, bs, bs, Math.min(1, t / .08) * fade);
      cards.forEach((c, i) => {
        const s0 = 2.5 + i * .8, k = E.win(t, s0, s0 + .7), x = lerp(i ? 2450 : -550, i ? 1400 : 520, E.back(k));
        const wob = 1 + .04 * Math.sin((t - s0) * 14) * Math.exp(-(t - s0 - .5) * 3) * (t > s0 ? 1 : 0);
        place(c.el, x, 575, (i ? .035 : -.035) + Math.sin(t * 2 + i) * .008, wob, 2 - wob, k > 0 ? fade : 0);
        const g = c.g; g.clearRect(0, 0, 190, 190); g.save(); c.drawIcon(g, t); g.restore();
      });
    },
  };
}

export const EFFECTS = { blunder, funny, wow, wololo, spotlight, gg };
