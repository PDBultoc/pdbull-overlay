import { test } from 'node:test';
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { mkdtempSync, readFileSync, existsSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const SERVER = new URL('../tools/frames-server.mjs', import.meta.url).pathname.replace(/^\/([A-Za-z]:)/, '$1');

function start(outDir) {
  const child = spawn(process.execPath, [SERVER], { env: { ...process.env, PORT: '0', OUT_DIR: outDir }, stdio: ['ignore', 'pipe', 'inherit'] });
  const exited = new Promise((res) => child.on('exit', (code) => res(code)));
  const port = new Promise((res, rej) => {
    let buf = '';
    child.stdout.on('data', (d) => { buf += d; const m = /LISTENING (\d+)/.exec(buf); if (m) res(+m[1]); });
    child.on('exit', () => rej(new Error('server exited early: ' + buf)));
  });
  return { child, exited, port };
}
const post = (port, path, body, headers = {}) => fetch(`http://127.0.0.1:${port}${path}`, { method: 'POST', body, headers });

test('frames server stores frames and audio, rejects other paths, exits on /done', async () => {
  const out = mkdtempSync(join(tmpdir(), 'frames-'));
  const s = start(out);
  try {
    const port = await s.port;
    const png1 = Buffer.from([137, 80, 78, 71, 1, 2, 3]), png2 = Buffer.from([137, 80, 78, 71, 9, 9]);
    assert.equal((await post(port, '/frame/0000', png1)).status, 200);
    assert.equal((await post(port, '/frame/0113', png2)).status, 200);
    assert.deepEqual(readFileSync(join(out, 'frames', 'f0000.png')), png1);
    assert.deepEqual(readFileSync(join(out, 'frames', 'f0113.png')), png2);
    const wav = Buffer.from('RIFFxxxxWAVE');
    assert.equal((await post(port, '/audio', wav)).status, 200);
    assert.deepEqual(readFileSync(join(out, 'sfx.wav')), wav);

    assert.equal((await post(port, '/frame/12', png1)).status, 404);
    assert.equal((await post(port, '/frame/..%2f0001', png1)).status, 404);
    assert.equal((await post(port, '/frame/00001', png1)).status, 404);
    assert.equal((await post(port, '/other', png1)).status, 404);
    assert.equal((await fetch(`http://127.0.0.1:${port}/frame/0001`)).status, 404);
    assert.equal(existsSync(join(out, 'frames', 'f0001.png')), false);

    const pre = await fetch(`http://127.0.0.1:${port}/frame/0000`, { method: 'OPTIONS', headers: { Origin: 'http://localhost:8797', 'Access-Control-Request-Method': 'POST' } });
    assert.equal(pre.headers.get('access-control-allow-origin'), 'http://localhost:8797');
    const r = await post(port, '/frame/0002', png1, { Origin: 'http://127.0.0.1:8797' });
    assert.equal(r.headers.get('access-control-allow-origin'), 'http://127.0.0.1:8797');

    assert.equal((await post(port, '/done', '')).status, 200);
    assert.equal(await s.exited, 0);
  } finally {
    s.child.kill();
    rmSync(out, { recursive: true, force: true });
  }
});
