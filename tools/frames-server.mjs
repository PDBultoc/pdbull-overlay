// Receives the frames and the audio of the offline stinger render (tools/stinger-render.html).
//   POST /frame/<4 digits>  PNG bytes -> <out>/frames/f<4 digits>.png
//   POST /audio             WAV bytes -> <out>/sfx.wav
//   POST /done              exits 0
// Listens on 127.0.0.1 only. Env: PORT (default 8798, 0 = any), OUT_DIR (default tools/out).
import http from 'node:http';
import { mkdirSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const here = dirname(fileURLToPath(import.meta.url));
const OUT = process.env.OUT_DIR || join(here, 'out');
const PORT = process.env.PORT != null ? +process.env.PORT : 8798;
const ORIGINS = ['http://127.0.0.1:8797', 'http://localhost:8797'];
mkdirSync(join(OUT, 'frames'), { recursive: true });

const server = http.createServer((req, res) => {
  const origin = req.headers.origin;
  if (ORIGINS.includes(origin)) {
    res.setHeader('Access-Control-Allow-Origin', origin);
    res.setHeader('Vary', 'Origin');
    res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  }
  const end = (code, msg = '') => { res.statusCode = code; res.end(msg); };
  const url = (req.url || '').split('?')[0];
  const m = /^\/frame\/([^/]+)$/.exec(url);
  const route = m ? (/^\d{4}$/.test(m[1]) ? 'frame' : null) : url === '/audio' ? 'audio' : url === '/done' ? 'done' : null;
  if (req.method === 'OPTIONS') return end(route ? 204 : 404);
  if (req.method !== 'POST' || !route) return end(404, 'not found');
  const chunks = [];
  req.on('data', (c) => chunks.push(c));
  req.on('end', () => {
    try {
      if (route === 'frame') writeFileSync(join(OUT, 'frames', `f${m[1]}.png`), Buffer.concat(chunks));
      else if (route === 'audio') writeFileSync(join(OUT, 'sfx.wav'), Buffer.concat(chunks));
      res.statusCode = 200; res.end('ok', () => { if (route === 'done') { server.close(); process.exit(0); } });
    } catch (e) { end(500, String(e)); }
  });
});
server.listen(PORT, '127.0.0.1', () => console.log(`LISTENING ${server.address().port}`));
