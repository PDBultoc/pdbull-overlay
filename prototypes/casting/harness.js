/* Casting-reactions prototype harness (shared by the A / B / C style pages). Prototype only.
   A style module exports EFFECTS = { blunder, funny, wow, wololo, spotlight, gg }.
   Each effect is a factory make(api) -> { duration, render(t), dispose?() }.
     render(t) is a PURE function of t (seconds since start): no CSS animations, no Date.now(),
     randomness only from api.rand (seeded) — so ?fx=<name>&t=<s> reproduces any frame.
   api = { ctx, dom, W, H, player:{name,color}, x, y, rand, audio, tally, ease }
     ctx   : the shared 2D canvas (1920x1080); the harness clears it once per frame before all renders
     dom   : a fresh absolutely-positioned 1920x1080 div for this effect's text (removed after duration)
     x, y  : the point the caster picked (click), default centre of the free play area
     audio : an AudioContext when sound is on, else null — schedule sounds inside make()
     tally : [{name,color,blunders,wows,funnies}] counts of effects fired this session (gg uses it)
   Keys: 1 blunder · 2 funny · 3 wow · 4 wololo · 5 spotlight · 6 gg · click = pick point ·
         P = next player · S = sound · B = CA mock on/off · Z = safe zones · H = hide UI.
   URL: ?fx=wow&t=1.2 renders one still frame · ?ui=0 · ?bg=0 (transparent) · ?bg=<file> custom frame. */
export const W = 1920, H = 1080;
export const PLAYERS = [
  { name: 'F1Re', color: '#e0392e' }, { name: 'm0re', color: '#3a6dff' },
  { name: 'Saladin_RO', color: '#35b84f' }, { name: 'Kaiser', color: '#e9c93a' },
  { name: 'Wololo42', color: '#33c6c6' }, { name: 'Gaia_Mod', color: '#b54ad1' },
  { name: 'Ironside', color: '#a5a5a5' }, { name: 'Pumpkin', color: '#ff8b2a' },
];
/* CaptureAge HUD keep-out zones at 1920x1080 (measured on a CA:DE frame, 1v1 layout). */
export const CA_ZONES = {
  topBar: [0, 0, 1920, 118], clock: [930, 118, 60, 30], bottomPanel: [0, 965, 1920, 115],
  minimap: [730, 850, 460, 230], scoreLines: [1690, 885, 230, 75],
};
/* Free play area where reactions may live: between the top bar and the bottom panel. */
export const PLAY = { x: 0, y: 150, w: 1920, h: 700 };

export const ease = {
  out: (x) => 1 - Math.pow(1 - clamp01(x), 3), in: (x) => clamp01(x) ** 2,
  inOut: (x) => { x = clamp01(x); return x < 0.5 ? 4 * x * x * x : 1 - Math.pow(-2 * x + 2, 3) / 2; },
  back: (x) => { x = clamp01(x); const c = 1.70158, c3 = c + 1; return 1 + c3 * Math.pow(x - 1, 3) + c * Math.pow(x - 1, 2); },
  elastic: (x) => { x = clamp01(x); if (x === 0 || x === 1) return x; return Math.pow(2, -10 * x) * Math.sin((x * 10 - 0.75) * (2 * Math.PI / 3)) + 1; },
  win: (t, a, b) => clamp01((t - a) / (b - a)),
};
function clamp01(v) { return Math.min(1, Math.max(0, v)); }
export function seeded(seed) { let s = (seed >>> 0) || 1; return () => { s = (s * 16807) % 2147483647; return s / 2147483647; }; }

export function startHarness(EFFECTS, { title = 'Casting reactions' } = {}) {
  const q = new URLSearchParams(location.search);
  document.title = title;
  const stage = document.createElement('div');
  stage.id = 'stage';
  stage.style.cssText = `position:absolute;left:0;top:0;width:${W}px;height:${H}px;transform-origin:0 0;overflow:hidden;background:${q.get('bg') === '0' ? 'transparent' : 'radial-gradient(ellipse at 50% 45%,#6d8a3e,#4a6a2c 60%,#34501f)'}`;
  document.body.style.cssText = 'margin:0;overflow:hidden;background:#000';
  document.body.appendChild(stage);
  const fit = () => { const s = Math.min(innerWidth / W, innerHeight / H); stage.style.transform = `scale(${s})`; };
  addEventListener('resize', fit); fit();

  // background: game frame + CaptureAge mock HUD
  let showMock = q.get('bg') !== '0', showZones = false;
  if (q.get('bg') !== '0') {
    const img = document.createElement('img');
    img.src = q.get('bg') && q.get('bg') !== '1' ? q.get('bg') : '../../shared/game.webp';
    img.style.cssText = `position:absolute;inset:0;width:${W}px;height:${H}px;object-fit:cover`;
    stage.appendChild(img);
  }
  const mock = layerCanvas(stage); const fx = layerCanvas(stage);
  const ctx = fx.getContext('2d');
  const domRoot = document.createElement('div');
  domRoot.style.cssText = `position:absolute;inset:0;pointer-events:none`;
  stage.appendChild(domRoot);
  drawMock();

  // UI
  const ui = document.createElement('div');
  ui.style.cssText = 'position:fixed;left:8px;bottom:8px;font:13px/1.4 Inter,Segoe UI,sans-serif;color:#eee;background:rgba(0,0,0,.72);padding:8px 10px;border-radius:6px;z-index:9;user-select:none';
  if (q.get('ui') !== '0' && !q.get('fx')) document.body.appendChild(ui);
  let pi = 0, soundOn = q.get('sound') === '1', AC = null, point = { x: 960, y: 480 }, seedN = 1;
  const tally = PLAYERS.map((p) => ({ ...p, blunders: 0, wows: 0, funnies: 0 }));
  const demoTally = [
    { ...PLAYERS[0], blunders: 3, wows: 1, funnies: 1 }, { ...PLAYERS[1], blunders: 1, wows: 4, funnies: 0 },
    { ...PLAYERS[2], blunders: 0, wows: 2, funnies: 2 }, { ...PLAYERS[3], blunders: 2, wows: 0, funnies: 3 },
  ];
  const renderUi = () => {
    const names = Object.keys(EFFECTS).map((k, i) => `<b>${i + 1}</b> ${k}`).join(' · ');
    ui.innerHTML = `${title}<br>${names}<br>player <b style="color:${PLAYERS[pi].color}">${PLAYERS[pi].name}</b> (P) · click = point · S sound <b>${soundOn ? 'on' : 'off'}</b> · B CA mock · Z zones · H hide`;
  };
  renderUi();

  const active = [];
  function fire(name, opts = {}) {
    const make = EFFECTS[name]; if (!make) return null;
    if (soundOn && !AC) AC = new AudioContext();
    if (AC && AC.state === 'suspended') AC.resume();
    const player = opts.player || PLAYERS[pi];
    const row = tally.find((r) => r.name === player.name);
    if (row) { if (name === 'blunder') row.blunders++; if (name === 'wow') row.wows++; if (name === 'funny') row.funnies++; }
    const dom = document.createElement('div');
    dom.style.cssText = `position:absolute;left:0;top:0;width:${W}px;height:${H}px;pointer-events:none`;
    domRoot.appendChild(dom);
    const used = tally.some((r) => r.blunders + r.wows + r.funnies > 0) ? tally.filter((r) => r.blunders + r.wows + r.funnies > 0) : demoTally;
    const api = { ctx, dom, W, H, player, x: opts.x ?? point.x, y: opts.y ?? point.y, rand: seeded(opts.seed ?? (seedN++ * 7919)),
      audio: opts.silent ? null : (soundOn ? AC : null), tally: used, ease, PLAY };
    const inst = make(api);
    const rec = { inst, dom, start: performance.now(), fixedT: opts.t };
    active.push(rec);
    return rec;
  }
  function frame() {
    ctx.clearRect(0, 0, W, H);
    const now = performance.now();
    for (let i = active.length - 1; i >= 0; i--) {
      const r = active[i]; const t = r.fixedT ?? (now - r.start) / 1000;
      if (r.fixedT == null && t > r.inst.duration) { r.inst.dispose?.(); r.dom.remove(); active.splice(i, 1); continue; }
    }
    for (const r of active) { ctx.save(); r.inst.render(r.fixedT ?? (now - r.start) / 1000); ctx.restore(); }
    if (pointFlash > now) { ctx.strokeStyle = 'rgba(255,255,255,.8)'; ctx.lineWidth = 2; ctx.beginPath(); ctx.arc(point.x, point.y, 14, 0, 7); ctx.moveTo(point.x - 22, point.y); ctx.lineTo(point.x + 22, point.y); ctx.moveTo(point.x, point.y - 22); ctx.lineTo(point.x, point.y + 22); ctx.stroke(); }
    requestAnimationFrame(frame); // still mode keeps re-rendering the same fixed t so the page keeps producing frames
  }
  let pointFlash = 0;

  addEventListener('keydown', (e) => {
    const k = e.key.toLowerCase(); const names = Object.keys(EFFECTS);
    if (/^[1-9]$/.test(k) && names[+k - 1]) fire(names[+k - 1]);
    else if (k === 'p') { pi = (pi + 1) % PLAYERS.length; renderUi(); }
    else if (k === 's') { soundOn = !soundOn; if (soundOn && !AC) AC = new AudioContext(); renderUi(); }
    else if (k === 'b') { showMock = !showMock; drawMock(); }
    else if (k === 'z') { showZones = !showZones; drawMock(); }
    else if (k === 'h') ui.style.display = ui.style.display === 'none' ? '' : 'none';
  });
  stage.addEventListener('pointerdown', (e) => {
    const r = stage.getBoundingClientRect(); const s = r.width / W;
    point = { x: (e.clientX - r.left) / s, y: (e.clientY - r.top) / s }; pointFlash = performance.now() + 900;
  });

  window.fx = { fire, PLAYERS, tally, setPoint: (x, y) => { point = { x, y }; } };
  if (q.get('fx')) {
    const t = +(q.get('t') || 1);
    const go = () => { fire(q.get('fx'), { t, silent: true, seed: 7919, player: PLAYERS[+(q.get('p') || 0)],
      x: q.get('x') ? +q.get('x') : undefined, y: q.get('y') ? +q.get('y') : undefined }); requestAnimationFrame(frame); document.body.dataset.ready = '1'; };
    (document.fonts ? document.fonts.ready : Promise.resolve()).then(go);
  } else requestAnimationFrame(frame);

  function drawMock() {
    const g = mock.getContext('2d'); g.clearRect(0, 0, W, H);
    if (showMock) {
      g.fillStyle = 'rgba(16,16,20,.94)';
      const [, , , tb] = CA_ZONES.topBar; g.fillRect(0, 0, W, 62); g.fillRect(660, 0, 600, tb);
      g.fillStyle = 'rgba(150,40,40,.85)'; g.fillRect(200, 40, 380, 12); g.fillStyle = 'rgba(40,80,170,.85)'; g.fillRect(1340, 40, 380, 12);
      g.fillStyle = '#eee'; g.font = '600 30px Segoe UI,sans-serif'; g.fillText('F1Re', 720, 38); g.fillText('m0re', 1120, 38);
      g.fillText('0     0', 905, 36); g.font = '14px Segoe UI,sans-serif'; g.fillText('League Div (mock)', 905, 58);
      g.fillStyle = 'rgba(14,14,16,.96)'; g.fillRect(0, 965, W, 115);
      g.save(); g.translate(960, 965); g.fillStyle = 'rgba(60,110,50,.95)'; g.beginPath(); g.moveTo(0, -115); g.lineTo(230, 0); g.lineTo(0, 115); g.lineTo(-230, 0); g.closePath(); g.fill(); g.restore();
      g.fillStyle = 'rgba(20,20,30,.7)'; g.fillRect(1700, 895, 215, 30); g.fillRect(1700, 928, 215, 30);
      g.fillStyle = '#9fb7ff'; g.font = '16px Segoe UI,sans-serif'; g.fillText('1  m0re (2679): 181', 1710, 916); g.fillStyle = '#ff9a9a'; g.fillText('2  F1Re (2585): 166', 1710, 949);
      g.fillStyle = 'rgba(255,255,255,.35)'; g.font = '13px Segoe UI,sans-serif'; g.fillText('CaptureAge HUD — mock', 1250, 1000);
    }
    if (showZones) {
      g.setLineDash([8, 6]); g.lineWidth = 2; g.strokeStyle = 'rgba(255,80,80,.9)';
      for (const [x, y, w, h] of Object.values(CA_ZONES)) g.strokeRect(x, y, w, h);
      g.strokeStyle = 'rgba(80,255,120,.9)'; g.strokeRect(PLAY.x + 2, PLAY.y, PLAY.w - 4, PLAY.h); g.setLineDash([]);
    }
  }
}
function layerCanvas(parent) {
  const c = document.createElement('canvas'); c.width = W; c.height = H;
  c.style.cssText = `position:absolute;inset:0;width:${W}px;height:${H}px;pointer-events:none`;
  parent.appendChild(c); return c;
}
