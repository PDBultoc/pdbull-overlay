// Starts the replay watcher at logon from the user's Startup folder (no admin rights, no window).
// set PDBULL_ROOM=<room code from the overlay URL>, then: node tools/replay-watch-install.mjs
//   writes the config, the Startup .vbs, and starts the watcher once (the room is read from the environment,
//   never from a command-line argument, so it does not show in process lists)
// node tools/replay-watch-install.mjs --uninstall     removes the Startup .vbs (the config stays)
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { spawn } from 'node:child_process';
import { fileURLToPath, pathToFileURL } from 'node:url';

/** VBScript that runs `node script` with a hidden window (style 0) and does not wait. */
export function startupVbs(nodeExe, script) {
  return [
    "' pdbull-overlay replay watcher. Remove: node tools/replay-watch-install.mjs --uninstall",
    'Set sh = CreateObject("WScript.Shell")',
    `sh.Run """${nodeExe}"" ""${script}""", 0, False`,
    '',
  ].join('\r\n');
}

if (import.meta.url === pathToFileURL(process.argv[1] || '').href) {
  const APPDATA = process.env.APPDATA || path.join(os.homedir(), 'AppData', 'Roaming');
  const VBS = path.join(APPDATA, 'Microsoft', 'Windows', 'Start Menu', 'Programs', 'Startup', 'pdbull-replay-watch.vbs');
  const CONFIG = path.join(APPDATA, 'pdbull-overlay', 'replay-watch.json');
  const args = process.argv.slice(2);
  if (args.includes('--uninstall')) {
    fs.rmSync(VBS, { force: true });
    console.log('removed ' + VBS + ' (a running watcher stops at logoff, or: taskkill /PID <"pid" field of %LOCALAPPDATA%\\pdbull-overlay\\replay-watch.pid> /T /F)');
  } else {
    const room = process.env.PDBULL_ROOM || '';
    if (!/^[a-z0-9]{8,64}$/.test(room)) {
      console.error('usage: set PDBULL_ROOM=<room code from the overlay URL>, then run node tools/replay-watch-install.mjs');
      process.exit(2);
    }
    fs.mkdirSync(path.dirname(CONFIG), { recursive: true });
    let cfg = {}; try { cfg = JSON.parse(fs.readFileSync(CONFIG, 'utf8')); } catch { /* new */ }
    fs.writeFileSync(CONFIG, JSON.stringify({ ...cfg, room }, null, 2));
    const script = fileURLToPath(new URL('./replay-watch.mjs', import.meta.url));
    fs.writeFileSync(VBS, startupVbs(process.execPath, script));
    spawn('wscript.exe', ['//B', VBS], { detached: true, stdio: 'ignore' }).unref();
    console.log('installed ' + VBS + ' and started the watcher; config ' + CONFIG);
  }
}
