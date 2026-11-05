// Offline render of the scroll stinger: every frame as a PNG (with alpha) and the sound as a WAV, posted to
// tools/frames-server.mjs (127.0.0.1:8798). Open http://localhost:8797/tools/stinger-render.html with the window visible.
import { meta, create, sfx } from '../shared/stingers/scroll.js';

const SERVER = 'http://127.0.0.1:8798';
const W = 1920, H = 1080, FPS = 60;
const status = document.getElementById('status');
const canvas = document.getElementById('c');
const ctx = canvas.getContext('2d');

async function post(path, body) {
  const r = await fetch(SERVER + path, { method: 'POST', body });
  if (!r.ok) throw new Error(`${path} -> ${r.status}`);
}

function wav16(buf) {
  const ch = buf.numberOfChannels, n = buf.length, sr = buf.sampleRate, bytes = n * ch * 2;
  const out = new DataView(new ArrayBuffer(44 + bytes));
  const str = (o, s) => { for (let i = 0; i < s.length; i++) out.setUint8(o + i, s.charCodeAt(i)); };
  str(0, 'RIFF'); out.setUint32(4, 36 + bytes, true); str(8, 'WAVE'); str(12, 'fmt ');
  out.setUint32(16, 16, true); out.setUint16(20, 1, true); out.setUint16(22, ch, true);
  out.setUint32(24, sr, true); out.setUint32(28, sr * ch * 2, true); out.setUint16(32, ch * 2, true); out.setUint16(34, 16, true);
  str(36, 'data'); out.setUint32(40, bytes, true);
  const data = [...Array(ch).keys()].map((c) => buf.getChannelData(c));
  let o = 44;
  for (let i = 0; i < n; i++) for (let c = 0; c < ch; c++) {
    const s = Math.max(-1, Math.min(1, data[c][i]));
    out.setInt16(o, s < 0 ? s * 0x8000 : s * 0x7fff, true); o += 2;
  }
  return out.buffer;
}

try {
  const inst = await create(W, H);               // async: waits for the fonts
  const M = Math.round(meta.durationMs * FPS / 1000);
  for (let i = 0; i <= M; i++) {
    status.textContent = `frame ${i} / ${M}`;
    ctx.clearRect(0, 0, W, H);
    inst.draw(ctx, i * 1000 / FPS);
    const blob = await new Promise((res) => canvas.toBlob(res, 'image/png'));
    await post('/frame/' + String(i).padStart(4, '0'), blob);
  }
  status.textContent = 'audio…';
  const oac = new OfflineAudioContext(2, Math.round(48000 * 2.2), 48000);
  sfx(oac, oac.destination, 0);
  const rendered = await oac.startRendering();
  await post('/audio', wav16(rendered));
  await post('/done', '');
  status.textContent = `done: ${M + 1} frames + audio`;
} catch (e) {
  status.textContent = 'ERROR: ' + e;
  console.error(e);
}
