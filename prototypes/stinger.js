// Stinger prototype harness (round 3). Plays one transition module over a demo "scene A -> scene B" switch.
// URL: ?v=a|b|c  &t=<ms> (freeze at that time, for shots)  &bg=demo|check|none  &sound=1  &shot=1 (hide the bar)
// Module contract (prototypes/stingers/<name>.js):
//   export const meta = { id, name, durationMs, cutMs };   // cutMs: OBS transition point; the screen must be fully covered then
//   export async function create(W, H) -> { draw(ctx, tMs) }  // draws frame tMs on a cleared transparent W×H 2D context;
//                                                               // deterministic in tMs (same t -> same frame, any call order)
//   export function sfx(ac, dest, when)                        // schedules the transition's sound at AudioContext time `when`
const MODULES = { a: './stingers/seal.js', b: './stingers/scroll.js', c: './stingers/smoke.js' };
const Q = new URLSearchParams(location.search);
const V = MODULES[Q.get('v')] ? Q.get('v') : 'a';
const W = 1920, H = 1080;
if (Q.get('shot') === '1') document.body.classList.add('shot');

const stage = document.getElementById('stage');
function fit() { const s = Math.min(innerWidth / W, innerHeight / H); stage.style.transform = `scale(${s}) translate(-50%, -50%)`; }
addEventListener('resize', fit); fit();

const under = document.getElementById('under').getContext('2d');
const fxCanvas = document.getElementById('fx');
const fx = fxCanvas.getContext('2d');

/* ---- demo scenes underneath: A = game capture, B = a plain BRB card ---- */
const gameImg = new Image(); gameImg.src = '../shared/game.webp';
// not img.decode(): it never settles while the window is not painting (hidden pane, OBS source not shown)
await new Promise((r) => { if (gameImg.complete) r(); gameImg.onload = gameImg.onerror = r; setTimeout(r, 2000); });
function drawSceneA() {
  if (gameImg.complete && gameImg.naturalWidth) under.drawImage(gameImg, 0, 0, W, H);
  else { under.fillStyle = '#35502c'; under.fillRect(0, 0, W, H); }
  label('Scene A · game');
}
function drawSceneB() {
  const g = under.createRadialGradient(W * 0.45, H * 0.55, 80, W / 2, H / 2, W * 0.7);
  g.addColorStop(0, '#4f321f'); g.addColorStop(1, '#0d0806');
  under.fillStyle = g; under.fillRect(0, 0, W, H);
  under.fillStyle = '#e3c48a'; under.font = '600 96px Cinzel, serif'; under.textAlign = 'center';
  under.fillText('BE RIGHT BACK', W / 2, H / 2 + 30);
  label('Scene B · BRB');
}
function label(s) { under.font = '500 22px Inter, sans-serif'; under.textAlign = 'left'; under.fillStyle = 'rgba(255,255,255,.75)'; under.fillText(s, 24, 40); }

let bg = Q.get('bg') || 'demo';
const bgBtn = document.getElementById('bgBtn');
function applyBg() {
  stage.classList.toggle('bg-check', bg === 'check');
  document.getElementById('under').style.display = bg === 'demo' ? '' : 'none';
  bgBtn.textContent = 'Background: ' + bg;
}
bgBtn.onclick = () => { bg = bg === 'demo' ? 'check' : bg === 'check' ? 'none' : 'demo'; applyBg(); };
applyBg();

/* ---- sound ---- */
let soundOn = Q.get('sound') === '1', ac = null;
const sndBtn = document.getElementById('sndBtn');
function showSnd() { sndBtn.textContent = 'Sound: ' + (soundOn ? 'on' : 'off'); sndBtn.classList.toggle('on', soundOn); }
sndBtn.onclick = () => { soundOn = !soundOn; showSnd(); };
showSnd();

/* ---- load module and run ---- */
const mod = await import(MODULES[V]);
const { meta } = mod;
document.title = `PDBull stinger · ${meta.name}`;
const inst = await mod.create(W, H);
const tlp = document.getElementById('tlp'), info = document.getElementById('info');
document.getElementById('tlcut').style.left = (100 * meta.cutMs / meta.durationMs) + '%';

let t0 = null, playing = false, sceneB = false;
function frame(t, resting = false) {
  const showB = resting ? sceneB : (t >= meta.cutMs ? !sceneB : sceneB);
  if (bg === 'demo') { if (showB) drawSceneB(); else drawSceneA(); }
  fx.clearRect(0, 0, W, H);
  inst.draw(fx, Math.max(0, Math.min(meta.durationMs, t)));
  tlp.style.width = (100 * Math.min(1, t / meta.durationMs)) + '%';
  info.textContent = `${meta.name} · ${Math.round(t)} / ${meta.durationMs} ms · cut ${meta.cutMs} ms`;
}
function loop(now) {
  if (!playing) return;
  const t = now - t0;
  frame(t);
  if (t >= meta.durationMs) { playing = false; sceneB = !sceneB; frame(meta.durationMs, true); return; }
  requestAnimationFrame(loop);
}
function play() {
  if (soundOn) {
    ac ??= new AudioContext();
    ac.resume();
    mod.sfx?.(ac, ac.destination, ac.currentTime + 0.02);
  }
  playing = true; t0 = performance.now(); requestAnimationFrame(loop);
}
document.getElementById('play').onclick = play;
addEventListener('keydown', (e) => { if (e.code === 'Space') { e.preventDefault(); play(); } });
document.getElementById('tl').onclick = (e) => {
  const r = e.currentTarget.getBoundingClientRect();
  playing = false; frame(meta.durationMs * (e.clientX - r.left) / r.width);
};

// ?check=1: logs coverage — the frame must be fully opaque around the cut and fully transparent at start/end.
if (Q.get('check') === '1') {
  const alphaRange = (t) => {
    fx.clearRect(0, 0, W, H); inst.draw(fx, t);
    const d = fx.getImageData(0, 0, W, H).data; let mn = 255, mx = 0;
    for (let i = 3; i < d.length; i += 4) { const a = d[i]; if (a < mn) mn = a; if (a > mx) mx = a; }
    return [mn, mx];
  };
  const c = meta.cutMs, cut = [c - 33, c, c + 33].map((t) => alphaRange(t)[0]);
  // a 1-px readback after each frame forces the deferred canvas work to finish, so the timing is real
  const t0 = performance.now(); for (let i = 0; i < 10; i++) { fx.clearRect(0, 0, W, H); inst.draw(fx, meta.durationMs * i / 10); fx.getImageData(0, 0, 1, 1); }
  const ms = (performance.now() - t0) / 10;
  console.log(`STINGER-CHECK v=${V} cutMinAlpha(-33,0,+33)=${cut.join(',')} startMaxAlpha=${alphaRange(0)[1]} endMaxAlpha=${alphaRange(meta.durationMs)[1]} avgDrawMs=${ms.toFixed(1)}`);
}
const tq = Q.get('t');
if (tq != null) frame(+tq); else { frame(0); if (Q.get('autoplay') !== '0') setTimeout(play, 600); }
window.__stinger = { meta, frame, inst };
