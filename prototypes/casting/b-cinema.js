/* Style B · Cinematic / trailer. Letterbox, god-rays, lens flare, grain, tracking text.
   All render(t) are pure functions of t; randomness only from api.rand (read in make()). */
import { PLAY } from './harness.js';

const TOP = PLAY.y, BOT = PLAY.y + PLAY.h; // 150 / 850
const BAR = 70;
const SERIF = "'Cinzel', 'Times New Roman', serif";
const ITAL = "'Cormorant Garamond', Georgia, serif";
const c01 = (v) => Math.min(1, Math.max(0, v));
const win = (t, a, b) => c01((t - a) / (b - a));
const lerp = (a, b, k) => a + (b - a) * k;
/* fade in a..b, hold, fade out c..d */
const env = (t, a, b, c, d) => win(t, a, b) * (1 - win(t, c, d));
const frac = (v) => v - Math.floor(v);
const hash = (i, f) => frac(Math.sin(i * 12.9898 + f * 78.233) * 43758.5453);
const rgba = (hex, a) => {
  const n = parseInt(hex.slice(1), 16);
  return `rgba(${n >> 16},${(n >> 8) & 255},${n & 255},${a})`;
};

/* ---------- drawing helpers ---------- */
function bars(ctx, k, alpha = 1) { // k 0..1 = how far the bars have slid in
  const h = BAR * k;
  ctx.fillStyle = `rgba(0,0,0,${0.96 * alpha})`;
  ctx.fillRect(0, TOP, 1920, h);
  ctx.fillRect(0, BOT - h, 1920, h);
}
function grain(ctx, t, a) {
  if (a <= 0) return;
  const f = Math.floor(t * 24);
  ctx.fillStyle = `rgba(255,255,255,${0.10 * a})`;
  for (let i = 0; i < 160; i++) ctx.fillRect(hash(i, f) * 1920, TOP + hash(i + 400, f) * PLAY.h, 2, 2);
  ctx.fillStyle = `rgba(0,0,0,${0.12 * a})`;
  for (let i = 0; i < 100; i++) ctx.fillRect(hash(i + 900, f) * 1920, TOP + hash(i + 1300, f) * PLAY.h, 2, 2);
}
function clipPlay(ctx) { ctx.beginPath(); ctx.rect(0, TOP, 1920, PLAY.h); ctx.clip(); }
function vignette(ctx, a, cx = 960, cy = 500) {
  const g = ctx.createRadialGradient(cx, cy, 250, cx, cy, 1150);
  g.addColorStop(0, 'rgba(0,0,0,0)'); g.addColorStop(1, `rgba(0,0,0,${a})`);
  ctx.fillStyle = g; ctx.fillRect(0, TOP, 1920, PLAY.h);
}
function mk(dom, css) {
  const e = document.createElement('div');
  e.style.cssText = 'position:absolute;left:0;width:1920px;text-align:center;white-space:nowrap;opacity:0;will-change:transform;' + css;
  dom.appendChild(e); return e;
}
function title(dom, y, size, color = '#f3e9d2') {
  return mk(dom, `top:${y}px;font:700 ${size}px/1 ${SERIF};color:${color};text-shadow:0 4px 24px rgba(0,0,0,.85)`);
}
function sub(dom, y, size, color = '#e8dcc0') {
  return mk(dom, `top:${y}px;font:italic 600 ${size}px/1 ${ITAL};color:${color};text-shadow:0 2px 16px rgba(0,0,0,.9)`);
}
function setText(e, o, txt) { // o: opacity, ls (em), dx, dy, scale
  if (txt !== undefined && e._txt !== txt) { e.textContent = txt; e._txt = txt; }
  e.style.opacity = String(c01(o.o));
  e.style.letterSpacing = (o.ls ?? 0) + 'em';
  e.style.transform = `translate(${o.dx || 0}px,${o.dy || 0}px) scale(${o.s ?? 1})`;
  e.style.paddingLeft = (o.ls ?? 0) + 'em'; // keeps tracked text optically centred
}

/* ---------- audio helpers (synthesised, no samples) ---------- */
function tone(ac, { type = 'sine', f0, f1 = f0, at = 0, dur = 1, g = 0.2, a = 0.02, lp = 0 }) {
  const t0 = ac.currentTime + at, o = ac.createOscillator(), v = ac.createGain();
  o.type = type; o.frequency.setValueAtTime(f0, t0); o.frequency.exponentialRampToValueAtTime(Math.max(1, f1), t0 + dur);
  v.gain.setValueAtTime(0.0001, t0); v.gain.exponentialRampToValueAtTime(g, t0 + a);
  v.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
  let out = o;
  if (lp) { const f = ac.createBiquadFilter(); f.type = 'lowpass'; f.frequency.value = lp; o.connect(f); out = f; }
  out.connect(v); v.connect(ac.destination); o.start(t0); o.stop(t0 + dur + 0.05);
}
function noise(ac, rand, { at = 0, dur = 0.3, g = 0.2, f0 = 2000, f1 = f0, q = 1 }) {
  const n = Math.floor(ac.sampleRate * dur), buf = ac.createBuffer(1, n, ac.sampleRate), d = buf.getChannelData(0);
  for (let i = 0; i < n; i++) d[i] = rand() * 2 - 1;
  const s = ac.createBufferSource(); s.buffer = buf;
  const f = ac.createBiquadFilter(); f.type = 'bandpass'; f.Q.value = q;
  const t0 = ac.currentTime + at;
  f.frequency.setValueAtTime(f0, t0); f.frequency.exponentialRampToValueAtTime(f1, t0 + dur);
  const v = ac.createGain(); v.gain.setValueAtTime(g, t0); v.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
  s.connect(f); f.connect(v); v.connect(ac.destination); s.start(t0);
}

/* ============ 1 BLUNDER ============ */
function blunder(api) {
  const { ctx, dom, rand, player } = api, D = 2.6;
  // jagged crack across the screen: x steps with random vertical jitter, plus 3 branches
  const crack = []; let cy = 480 + (rand() - 0.5) * 120;
  for (let x = -20; x <= 1940; x += 40 + rand() * 40) { cy += (rand() - 0.5) * 90; cy = Math.min(700, Math.max(300, cy)); crack.push([x, cy]); }
  const branches = [];
  for (let b = 0; b < 3; b++) {
    const i = 3 + Math.floor(rand() * (crack.length - 8)); const dir = rand() < 0.5 ? -1 : 1; const pts = [crack[i]];
    let [bx, by] = crack[i];
    for (let k = 0; k < 4; k++) { bx += (30 + rand() * 40) * (rand() < 0.5 ? -1 : 1) * 0.6; by += dir * (30 + rand() * 40); pts.push([bx, by]); }
    branches.push(pts);
  }
  const tt = title(dom, 420, 104), ss = sub(dom, 548, 56, player.color);
  if (api.audio) {
    const ac = api.audio;
    tone(ac, { type: 'sawtooth', f0: 220, f1: 98, dur: 1.8, g: 0.16, a: 0.15, lp: 700 });
    tone(ac, { type: 'sawtooth', f0: 110, f1: 55, dur: 2.0, g: 0.18, a: 0.15, lp: 400 });
    noise(ac, rand, { at: 0.35, dur: 0.12, g: 0.25, f0: 3000, f1: 800 });
  }
  return { duration: D, render(t) {
    const a = env(t, 0, 0.35, 2.2, 2.6);
    ctx.save(); clipPlay(ctx);
    ctx.fillStyle = `rgba(60,80,110,${0.34 * a})`; ctx.fillRect(0, TOP, 1920, PLAY.h);
    vignette(ctx, 0.88 * a);
    // crack draws left->right between 0.25 and 0.7
    const p = win(t, 0.25, 0.7), n = Math.floor(p * (crack.length - 1)), fr = p * (crack.length - 1) - n;
    const path = (pts, upto) => { ctx.beginPath(); ctx.moveTo(pts[0][0], pts[0][1]);
      for (let i = 1; i <= upto && i < pts.length; i++) ctx.lineTo(pts[i][0], pts[i][1]);
      if (upto < pts.length - 1) { const [x0, y0] = pts[upto], [x1, y1] = pts[upto + 1]; ctx.lineTo(lerp(x0, x1, upto === n ? fr : 0), lerp(y0, y1, upto === n ? fr : 0)); } };
    const ca = a * (1 - win(t, 2.0, 2.6));
    ctx.lineCap = 'round'; ctx.lineJoin = 'round';
    for (const [w, col] of [[7, `rgba(150,190,255,${0.18 * ca})`], [2, `rgba(235,245,255,${0.95 * ca})`]]) {
      ctx.strokeStyle = col; ctx.lineWidth = w; path(crack, n); ctx.stroke();
      branches.forEach((br, bi) => { const bp = win(p, 0.3 + bi * 0.15, 0.7 + bi * 0.1); ctx.lineWidth = w * 0.6; path(br, Math.floor(bp * (br.length - 1))); ctx.stroke(); });
    }
    ctx.restore();
    bars(ctx, ease3(win(t, 0, 0.5)), a > 0 ? 1 : 0);
    ctx.save(); clipPlay(ctx); grain(ctx, t, a); ctx.restore();
    const shake = t > 0.3 && t < 0.5 ? Math.sin(t * 200) * 6 * (1 - win(t, 0.3, 0.5)) : 0;
    setText(tt, { o: env(t, 0.5, 1.0, 2.1, 2.5), ls: lerp(0.06, 0.26, ease3(win(t, 0.5, 2.5))), dx: shake }, 'A COSTLY MISTAKE');
    setText(ss, { o: env(t, 1.0, 1.5, 2.1, 2.5), ls: lerp(0.05, 0.14, win(t, 1.0, 2.5)) }, player.name);
  } };
}
const ease3 = (x) => 1 - Math.pow(1 - c01(x), 3);

/* ============ 2 FUNNY ============ */
function funny(api) {
  const { ctx, dom, rand, player } = api, D = 3.2;
  const tt = title(dom, 450, 96), ss = sub(dom, 560, 50, '#e8dcc0');
  const ph = [rand() * 6, rand() * 6, rand() * 6];
  const name = sub(dom, 616, 34, player.color);
  if (api.audio) {
    const ac = api.audio;
    noise(ac, rand, { at: 0.0, dur: 0.55, g: 0.35, f0: 6000, f1: 700, q: 0.7 }); // record scratch, then silence
    tone(ac, { type: 'sine', f0: 90, f1: 80, at: 1.2, dur: 0.5, g: 0.06, a: 0.05 });
  }
  return { duration: D, render(t) {
    const out = 1 - win(t, 2.8, 3.2);
    ctx.save(); clipPlay(ctx);
    ctx.fillStyle = `rgba(0,0,0,${0.38 * win(t, 0, 0.2) * out})`; ctx.fillRect(0, TOP, 1920, PLAY.h);
    ctx.restore();
    bars(ctx, ease3(win(t, 0, 0.18)), out > 0 ? 1 : 0); // snaps in
    ctx.save(); clipPlay(ctx); grain(ctx, t, 0.7 * out); ctx.restore();
    // beat of stillness until 1.2, then the card; tiny camera shake right after the title lands
    const k = win(t, 1.2, 1.4), sh = win(t, 1.2, 1.9);
    const amp = (1 - sh) * 3.2 * (t > 1.2 ? 1 : 0);
    const dx = Math.sin(t * 90 + ph[0]) * amp, dy = Math.cos(t * 110 + ph[1]) * amp, rot = Math.sin(t * 70 + ph[2]) * amp * 0.0006;
    const tr = (e, o) => { setText(e, o); e.style.transform += ` rotate(${rot}rad)`; };
    tr(tt, { o: k * out, ls: lerp(0.02, 0.07, win(t, 1.2, 3.0)), dx, dy });
    tt.textContent !== '…well then.' && (tt.textContent = '…well then.');
    ss.textContent !== 'Yep. That happened.' && (ss.textContent = 'Yep. That happened.');
    tr(ss, { o: win(t, 1.9, 2.3) * out, ls: 0.04, dx, dy });
    name.textContent !== player.name && (name.textContent = player.name);
    tr(name, { o: win(t, 2.1, 2.5) * out * 0.9, ls: 0.1, dx, dy });
  } };
}

/* ============ 3 WOW ============ */
function wow(api) {
  const { ctx, dom, rand, player, x, y } = api, D = 3.2;
  const rays = Array.from({ length: 16 }, () => ({ a: rand() * Math.PI * 2, w: 0.03 + rand() * 0.07, l: 0.65 + rand() * 0.35, s: 0.7 + rand() * 0.6 }));
  const motes = Array.from({ length: 60 }, () => ({ x: rand() * 1920, y: TOP + rand() * PLAY.h, r: 1 + rand() * 2.2, v: 10 + rand() * 30, p: rand() * 6 }));
  const tt = title(dom, 410, 120, '#fff1c8'), nm = sub(dom, 548, 62, player.color);
  tt.style.textShadow = '0 0 40px rgba(255,200,90,.6),0 4px 24px rgba(0,0,0,.8)';
  nm.style.textShadow = '0 2px 14px rgba(0,0,0,.95),0 0 3px rgba(0,0,0,.9)';
  if (api.audio) {
    const ac = api.audio;
    for (const f of [55, 82.4, 110]) tone(ac, { type: 'sawtooth', f0: f * 1.5, f1: f, dur: 2.4, g: 0.12, a: 0.08, lp: 500 });
    for (let i = 0; i < 5; i++) tone(ac, { type: 'sine', f0: 1500 + i * 420, f1: 1800 + i * 420, at: 0.5 + i * 0.07, dur: 1.4, g: 0.025, a: 0.2 });
  }
  return { duration: D, render(t) {
    const a = env(t, 0, 0.4, 2.7, 3.2);
    ctx.save(); clipPlay(ctx);
    ctx.fillStyle = `rgba(20,12,0,${0.28 * a})`; ctx.fillRect(0, TOP, 1920, PLAY.h);
    // god-rays
    ctx.globalCompositeOperation = 'lighter';
    const R = 2300, grow = ease3(win(t, 0.1, 1.0));
    for (const r of rays) {
      const ang = r.a + t * 0.05 * r.s, w = r.w * (0.8 + 0.2 * Math.sin(t * 2 + r.a * 5));
      const g = ctx.createRadialGradient(x, y, 0, x, y, R * r.l * grow + 1);
      g.addColorStop(0, `rgba(255,214,120,${0.34 * a})`); g.addColorStop(0.5, `rgba(255,190,80,${0.12 * a})`); g.addColorStop(1, 'rgba(255,170,60,0)');
      ctx.fillStyle = g; ctx.beginPath(); ctx.moveTo(x, y);
      ctx.lineTo(x + Math.cos(ang - w) * R, y + Math.sin(ang - w) * R); ctx.lineTo(x + Math.cos(ang + w) * R, y + Math.sin(ang + w) * R); ctx.closePath(); ctx.fill();
    }
    const core = ctx.createRadialGradient(x, y, 0, x, y, 260 * grow + 1);
    core.addColorStop(0, `rgba(255,240,200,${0.7 * a})`); core.addColorStop(1, 'rgba(255,200,100,0)');
    ctx.fillStyle = core; ctx.fillRect(x - 300, y - 300, 600, 600);
    // lens flare sweep: anamorphic streak + ghosts travelling across the screen
    const fp = win(t, 0.7, 1.9), fx = lerp(-150, 2070, fp), fa = Math.sin(fp * Math.PI);
    if (fp > 0 && fp < 1) {
      const sg = ctx.createLinearGradient(fx - 500, 0, fx + 500, 0);
      sg.addColorStop(0, 'rgba(120,170,255,0)'); sg.addColorStop(0.5, `rgba(200,225,255,${0.85 * fa})`); sg.addColorStop(1, 'rgba(120,170,255,0)');
      ctx.fillStyle = sg; ctx.fillRect(fx - 500, y - 3, 1000, 6);
      const gh = [[0, 70, 'rgba(255,230,160'], [-170, 34, 'rgba(160,200,255'], [-330, 52, 'rgba(255,170,120'], [150, 24, 'rgba(190,255,200']];
      for (const [off, rr, col] of gh) {
        const gx = fx + off, gy = y + (fx - 960) * 0.06 * (off ? Math.sign(off) : 0);
        const gg = ctx.createRadialGradient(gx, gy, 0, gx, gy, rr);
        gg.addColorStop(0, `${col},${0.7 * fa})`); gg.addColorStop(1, `${col},0)`);
        ctx.fillStyle = gg; ctx.beginPath(); ctx.arc(gx, gy, rr, 0, 7); ctx.fill();
      }
    }
    // dust motes drifting up in the light
    for (const m of motes) {
      const my = m.y - ((t * m.v) % PLAY.h); const yy = my < TOP ? my + PLAY.h : my;
      ctx.fillStyle = `rgba(255,230,170,${0.55 * a * (0.5 + 0.5 * Math.sin(t * 3 + m.p))})`;
      ctx.beginPath(); ctx.arc(m.x + Math.sin(t + m.p) * 12, yy, m.r, 0, 7); ctx.fill();
    }
    ctx.globalCompositeOperation = 'source-over';
    vignette(ctx, 0.55 * a, x, y);
    ctx.restore();
    bars(ctx, ease3(win(t, 0, 0.55)), a > 0 ? 1 : 0);
    ctx.save(); clipPlay(ctx); grain(ctx, t, a); ctx.restore();
    setText(tt, { o: env(t, 0.6, 1.2, 2.7, 3.1), ls: lerp(0.05, 0.3, ease3(win(t, 0.6, 3.1))) }, 'LEGENDARY');
    setText(nm, { o: env(t, 1.2, 1.7, 2.7, 3.1), ls: lerp(0.02, 0.12, win(t, 1.2, 3.1)), dy: lerp(14, 0, ease3(win(t, 1.2, 1.9))) }, player.name);
  } };
}

/* ============ 4 WOLOLO ============ */
function wololo(api) {
  const { ctx, dom, rand, player, x, y } = api, D = 2.4;
  const tt = title(dom, 440, 100, '#ffffff'), tag = sub(dom, 556, 46, player.color);
  tt.style.textShadow = `0 0 30px ${rgba(player.color, 0.9)},0 4px 20px rgba(0,0,0,.85)`;
  if (api.audio) {
    const ac = api.audio;
    tone(ac, { type: 'sawtooth', f0: 110, f1: 440, dur: 1.5, g: 0.1, a: 0.6, lp: 1400 });
    tone(ac, { type: 'sine', f0: 330, f1: 1320, dur: 1.5, g: 0.06, a: 0.7 });
    noise(ac, rand, { at: 0.9, dur: 0.6, g: 0.07, f0: 1000, f1: 5000 });
  }
  return { duration: D, render(t) {
    const a = env(t, 0, 0.12, 1.9, 2.4);
    ctx.save(); clipPlay(ctx);
    const rr = 1700 * ease3(win(t, 0, 1.9));
    ctx.globalCompositeOperation = 'lighter';
    // soft tinted disc
    const fg = ctx.createRadialGradient(x, y, rr * 0.2, x, y, rr + 1);
    fg.addColorStop(0, rgba(player.color, 0)); fg.addColorStop(0.9, rgba(player.color, 0.16 * a)); fg.addColorStop(1, rgba(player.color, 0));
    ctx.fillStyle = fg; ctx.fillRect(0, TOP, 1920, PLAY.h);
    // main ring + chromatic fringes (red-ish outer, blue-ish inner), drawn by hand
    const ring = (r, w, col) => { ctx.lineWidth = w; ctx.strokeStyle = col; ctx.beginPath(); ctx.arc(x, y, Math.max(1, r), 0, Math.PI * 2); ctx.stroke(); };
    const fade = a * (1 - 0.5 * win(t, 0.6, 1.9));
    ring(rr + 9, 5, `rgba(255,60,90,${0.55 * fade})`);
    ring(rr - 9, 5, `rgba(60,120,255,${0.55 * fade})`);
    ring(rr + 4, 10, `rgba(255,255,255,${0.12 * fade})`);
    ring(rr, 12, rgba(player.color, 0.9 * fade));
    ring(rr, 3, `rgba(255,255,255,${0.9 * fade})`);
    ring(rr * 0.82, 4, rgba(player.color, 0.35 * fade));
    ctx.restore();
    ctx.save(); clipPlay(ctx); grain(ctx, t, 0.6 * a); ctx.restore();
    setText(tt, { o: env(t, 0.35, 0.8, 1.9, 2.3), ls: lerp(0.08, 0.3, ease3(win(t, 0.35, 2.3))) }, 'CONVERTED');
    setText(tag, { o: env(t, 0.8, 1.2, 1.9, 2.3), ls: lerp(0.04, 0.1, win(t, 0.8, 2.3)) }, player.name);
  } };
}

/* ============ 5 SPOTLIGHT ============ */
function spotlight(api) {
  const { ctx, dom, rand, player, x, y } = api, D = 4.5;
  const ss = sub(dom, 760, 64, '#f3e9d2');
  const nm = title(dom, 700, 34, player.color);
  nm.style.textShadow = '0 2px 14px rgba(0,0,0,.95)';
  if (api.audio) {
    const ac = api.audio;
    tone(ac, { type: 'sine', f0: 70, f1: 45, at: 0.7, dur: 1.2, g: 0.35, a: 0.01 });
    noise(ac, rand, { at: 0.0, dur: 0.8, g: 0.05, f0: 400, f1: 1800 });
  }
  return { duration: D, render(t) {
    const a = env(t, 0, 0.3, 3.9, 4.5);
    const R = lerp(1100, 190, ease3(win(t, 0, 0.9))) + lerp(0, 900, win(t, 3.8, 4.5)) + Math.sin(t * 1.5) * 4 * win(t, 0.9, 1.2);
    ctx.save(); clipPlay(ctx);
    const g = ctx.createRadialGradient(x, y, Math.max(0, R * 0.8), x, y, R * 1.12 + 1);
    g.addColorStop(0, 'rgba(0,0,0,0)'); g.addColorStop(1, `rgba(0,0,0,${0.75 * a})`);
    ctx.fillStyle = g; ctx.fillRect(0, TOP, 1920, PLAY.h);
    ctx.lineWidth = 2; ctx.strokeStyle = rgba(player.color, 0.55 * a * win(t, 0.6, 1.0));
    ctx.beginPath(); ctx.arc(x, y, R, 0, 7); ctx.stroke();
    ctx.globalCompositeOperation = 'lighter';
    const gl = ctx.createRadialGradient(x, y, R * 0.9, x, y, R * 1.05); // faint warm bloom on the rim
    gl.addColorStop(0, 'rgba(255,220,150,0)'); gl.addColorStop(0.7, `rgba(255,220,150,${0.06 * a})`); gl.addColorStop(1, 'rgba(255,220,150,0)');
    ctx.fillStyle = gl; ctx.fillRect(0, TOP, 1920, PLAY.h);
    ctx.restore();
    ctx.save(); clipPlay(ctx); grain(ctx, t, 0.6 * a); ctx.restore();
    setText(nm, { o: env(t, 1.0, 1.5, 3.7, 4.1), ls: lerp(0.1, 0.25, win(t, 1.0, 4.1)) }, player.name);
    setText(ss, { o: env(t, 1.3, 1.9, 3.7, 4.1), ls: lerp(0.03, 0.1, win(t, 1.3, 4.1)) }, 'Watch this.');
  } };
}

/* ============ 6 GG ============ */
function gg(api) {
  const { ctx, dom, rand, tally } = api, D = 8;
  const top = (key) => { let best = null; for (const r of tally) if (r[key] > 0 && (!best || r[key] > best[key])) best = r; return best; };
  const pw = top('wows'), pb = top('blunders');
  const line = (label, rec, key) => `<div style="margin-top:46px"><div style="font:italic 600 34px/1.2 ${ITAL};color:#c9bd9f;letter-spacing:.08em">${label}</div>` +
    (rec ? `<div style="font:700 50px/1.3 ${SERIF};color:${rec.color};letter-spacing:.12em;text-shadow:0 2px 14px rgba(0,0,0,.9)">${esc(rec.name)}</div>` +
      `<div style="font:italic 500 28px/1.2 ${ITAL};color:#a89f88">${rec[key]} ${key === 'wows' ? (rec[key] === 1 ? 'wow' : 'wows') : (rec[key] === 1 ? 'blunder' : 'blunders')}</div>`
      : `<div style="font:italic 500 40px/1.3 ${ITAL};color:#a89f88">— nobody —</div>`) + '</div>';
  const roll = document.createElement('div');
  roll.style.cssText = `position:absolute;left:0;top:${TOP}px;width:1920px;height:${PLAY.h}px;overflow:hidden;opacity:0;` +
    '-webkit-mask-image:linear-gradient(transparent,#000 14%,#000 86%,transparent);mask-image:linear-gradient(transparent,#000 14%,#000 86%,transparent)';
  const col = document.createElement('div');
  col.style.cssText = 'position:absolute;left:0;top:0;width:1920px;text-align:center;will-change:transform';
  col.innerHTML = line('Play of the game', pw, 'wows') + line('Blunder of the game', pb, 'blunders') +
    `<div style="margin-top:60px;font:italic 500 30px/1.2 ${ITAL};color:#8f8774">Thanks for watching</div>`;
  roll.appendChild(col); dom.appendChild(roll);
  const tt = title(dom, 410, 190, '#f3e9d2');
  tt.style.textShadow = '0 0 50px rgba(255,200,100,.35),0 4px 24px rgba(0,0,0,.85)';
  const motes = Array.from({ length: 50 }, () => ({ x: rand() * 1920, y: TOP + rand() * PLAY.h, r: 1 + rand() * 2, v: 8 + rand() * 18, p: rand() * 6 }));
  if (api.audio) { // warm chord (A major add9) with slow swell
    const ac = api.audio;
    [110, 138.6, 164.8, 220, 247.5, 329.6].forEach((f, i) => tone(ac, { type: i < 3 ? 'triangle' : 'sine', f0: f, f1: f * 0.998, at: i * 0.06, dur: 6.5, g: 0.07, a: 1.4, lp: 1800 }));
  }
  return { duration: D, render(t) {
    const a = env(t, 0, 0.6, 7.3, 8);
    ctx.save(); clipPlay(ctx);
    ctx.fillStyle = `rgba(6,4,2,${0.62 * a})`; ctx.fillRect(0, TOP, 1920, PLAY.h);
    vignette(ctx, 0.6 * a);
    ctx.fillStyle = 'rgba(255,225,160,1)';
    for (const m of motes) {
      const my = m.y - ((t * m.v) % PLAY.h); const yy = my < TOP ? my + PLAY.h : my;
      ctx.globalAlpha = 0.35 * a * (0.5 + 0.5 * Math.sin(t * 2 + m.p));
      ctx.beginPath(); ctx.arc(m.x, yy, m.r, 0, 7); ctx.fill();
    }
    ctx.globalAlpha = 1; ctx.restore();
    bars(ctx, ease3(win(t, 0, 0.6)), a > 0 ? 1 : 0);
    ctx.save(); clipPlay(ctx); grain(ctx, t, a); ctx.restore();
    // GG: tracks open, holds, then lifts away as the credits take over
    const go = win(t, 2.2, 3.0);
    setText(tt, { o: env(t, 0.5, 1.1, 2.3, 3.0), ls: lerp(0.1, 0.45, ease3(win(t, 0.5, 3.0))), dy: -go * 60, s: 1 - 0.1 * go }, 'GG');
    roll.style.opacity = String(win(t, 2.6, 3.0) * (1 - win(t, 7.4, 8.0)));
    const ch = col.offsetHeight || 520, p = win(t, 2.6, 7.6);
    col.style.transform = `translateY(${lerp(PLAY.h * 0.88, -ch + 60, p)}px)`;
  } };
}
function esc(s) { return String(s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c])); }

export const EFFECTS = { blunder, funny, wow, wololo, spotlight, gg };
