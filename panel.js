// OBS dock panel. The UI boots only in a browser; pure helpers live in core/panelcore.js.
import { createSettings } from './core/settings.js';
import { createBus } from './core/bus.js';
import { startAutoUpdate } from './core/autoupdate.js';
import { createRemote, newRoom, stripSecrets } from './core/remote.js';
import { connectStreamlabs } from './core/streamlabs.js';
import { normalizeMatch } from './core/aoe2.js';
import { countdownEnd, roomLinks, testEvent, TEST_ALERTS, latestUpdate, createSender } from './core/panelcore.js';

function boot() {
  const settings = createSettings(localStorage, 'pdbull.v1');
  const bus = createBus();
  const $ = (id) => document.getElementById(id);
  const refreshers = [];

  // ?room= in the panel URL wins, else the one this panel made before, else a new one.
  const room = new URLSearchParams(location.search).get('room')
    || (() => { try { return localStorage.getItem('pdbull.room'); } catch { return null; } })()
    || newRoom();
  try { localStorage.setItem('pdbull.room', room); } catch { /* ignore */ }
  const links = roomLinks(room, location.href);

  const remote = createRemote({
    room,
    onSettings: (s) => { settings.patch(s); refreshers.forEach((f) => f()); },
    onStatus: (st) => bus.emit('status', st),
  });

  let onTokenWrite = () => {};
  const getp = (path) => path.split('.').reduce((o, k) => (o == null ? undefined : o[k]), settings.get());
  const write = (path, value) => {
    settings.set(path, value);
    // The token stays in this panel's storage: never on the bus or in the room.
    bus.emit('settings', stripSecrets(settings.get()));
    remote.publish(settings.get());
    if (path === 'modules.alerts.streamlabsToken') onTokenWrite();
  };

  function el(tag, props = {}, kids = []) {
    const n = document.createElement(tag);
    for (const [k, v] of Object.entries(props)) {
      if (k === 'text') n.textContent = v;
      else if (k === 'class') n.className = v;
      else if (k.startsWith('on')) n.addEventListener(k.slice(2), v);
      else n.setAttribute(k, v);
    }
    for (const c of [].concat(kids)) if (c) n.append(c);
    return n;
  }
  let uid = 0;
  function field(label, path, kind = 'text', attrs = {}) {
    const id = 'f' + uid++;
    const input = el('input', { id, type: kind, ...attrs });
    const show = () => { if (document.activeElement !== input) input.value = getp(path) ?? ''; };
    input.addEventListener('change', () => {
      let v = input.value;
      if (kind === 'number') { v = Number(v); if (!Number.isFinite(v)) { show(); return; } }
      write(path, v);
    });
    refreshers.push(show); show();
    const kids = [el('label', { for: id, text: label }), input];
    if (kind === 'password') {
      kids.push(el('button', { type: 'button', text: 'Show', onclick: (e) => {
        const hide = input.type === 'text';
        input.type = hide ? 'password' : 'text';
        e.target.textContent = hide ? 'Show' : 'Hide';
      } }));
    }
    return el('div', { class: 'row' }, kids);
  }
  function check(label, path) {
    const input = el('input', { type: 'checkbox' });
    input.addEventListener('change', () => write(path, input.checked));
    refreshers.push(() => { input.checked = !!getp(path); });
    input.checked = !!getp(path);
    return el('label', {}, [input, label]);
  }
  const card = (title, body) => el('section', { class: 'card' }, [el('h2', { text: title }), ...body]);

  // Events go to the local bus first (OBS dock and sources share it), then to the room as backup.
  // Receivers dedup by event id (alerts by id, intro by id). latest-snapshot stays local.
  const send = createSender({ bus, remote });
  let match1v1 = null;
  fetch('tests/fixtures/pa100.json').then((r) => r.json())
    .then((l) => { match1v1 = normalizeMatch(l[0], 551021); }).catch(() => { /* file:// or offline: built-in fake */ });
  const fire = (key) => { const e = testEvent(key, Date.now(), { match1v1 }); if (e) send(e.name, e.payload); };

  // --- Starting Soon
  const cd = el('div', { class: 'cd', text: '--:--' });
  const tickCd = () => {
    const end = getp('scenes.countdownEnd');
    const s = end == null ? null : Math.max(0, Math.ceil((end - Date.now()) / 1000));
    cd.textContent = s == null ? '--:--' : String(Math.floor(s / 60)).padStart(2, '0') + ':' + String(s % 60).padStart(2, '0');
  };
  setInterval(tickCd, 500); refreshers.push(tickCd);
  const startingCard = card('Starting soon', [
    field('Minutes', 'scenes.countdownMin', 'number', { min: '0.5', step: '0.5' }),
    cd,
    el('div', { class: 'btns' }, [
      el('button', { type: 'button', class: 'pri', text: 'Start countdown', onclick: () => {
        const end = countdownEnd(getp('scenes.countdownMin'));
        if (end != null) { write('scenes.countdownEnd', end); tickCd(); }
      } }),
      el('button', { type: 'button', class: 'dng', text: 'Reset', onclick: () => { write('scenes.countdownEnd', null); tickCd(); } }),
    ]),
  ]);

  const brbCard = card('BRB', [field('Text', 'scenes.brbText')]);

  const alertsCard = card('Alerts', [
    field('Streamlabs token', 'modules.alerts.streamlabsToken', 'password', { autocomplete: 'off' }),
    el('div', { class: 'note', text: 'Stays in this panel only; never sent to the room.' }),
    el('div', { class: 'chk' }, [...['follow', 'sub', 'bits', 'donation'].map((k) => check(k, 'modules.alerts.' + k)), check('sound', 'modules.alerts.sound')]),
    ...['follow', 'sub', 'bits', 'donation'].map((k) => field('Sound ' + k, 'modules.alerts.sounds.' + k, 'url', { placeholder: 'URL (empty = built-in)' })),
    el('div', { class: 'btns' }, TEST_ALERTS.map((t) => el('button', { type: 'button', text: t.label, onclick: () => fire(t.key) }))),
  ]);

  const introCard = card('Intro', [el('div', { class: 'btns' }, [
    el('button', { type: 'button', text: 'Test intro 1v1', onclick: () => fire('intro1v1') }),
    el('button', { type: 'button', text: 'Test intro 4v4', onclick: () => fire('intro4v4') }),
  ])]);

  $('cards').append(startingCard, brbCard, alertsCard, introCard);

  // --- room + links
  $('room').textContent = room;
  const copy = (url) => async () => {
    let ok = false;
    try { await navigator.clipboard.writeText(url); ok = true; } catch { /* clipboard blocked */ }
    $('copied').textContent = ok ? 'Copied! Paste it as the Browser Source URL.' : url;
  };
  $('copyOverlay').addEventListener('click', copy(links.overlay));
  $('copyStarting').addEventListener('click', copy(links.starting));
  $('copyBrb').addEventListener('click', copy(links.brb));
  remote.start().then(() => remote.publish(settings.get()));

  // --- Streamlabs: this panel holds the token and forwards only the events.
  let sl = null, slToken = null;
  const loadIo = () => (typeof window.io === 'function' ? Promise.resolve() : new Promise((ok, bad) => {
    const s = document.createElement('script');
    s.src = 'https://cdnjs.cloudflare.com/ajax/libs/socket.io/2.3.0/socket.io.js';
    s.onload = ok; s.onerror = bad;
    document.head.appendChild(s);
  }));
  const syncStreamlabs = async () => {
    const tok = getp('modules.alerts.streamlabsToken') || '';
    if (tok === slToken) return;
    slToken = tok;
    if (sl) { sl.close(); sl = null; }
    if (!tok) { bus.emit('status', { source: 'streamlabs', ok: false, reason: 'no token' }); return; }
    try { await loadIo(); } catch { bus.emit('status', { source: 'streamlabs', ok: false, reason: 'client not loaded' }); return; }
    sl = connectStreamlabs({
      token: tok,
      onEvent: (e) => {
        send(e.type, e);
        const u = latestUpdate(e);
        if (u) write(u[0], u[1]);
      },
      onStatus: (st) => bus.emit('status', st),
    });
  };
  onTokenWrite = syncStreamlabs;
  refreshers.push(() => { syncStreamlabs(); });
  syncStreamlabs();

  // --- status dots (room = sync; aoe2 + chat are reported by the overlay)
  const dots = {};
  for (const [src, label] of [['room', 'room'], ['streamlabs', 'Streamlabs'], ['aoe2', 'aoe2'], ['chat', 'chat']]) {
    const d = el('span', { class: 'dot' });
    dots[src] = d;
    $('dots').append(el('span', { title: 'no status yet' }, [d, label]));
  }
  bus.on('status', (p) => {
    const d = p && dots[p.source];
    if (!d) return;
    d.className = 'dot ' + (p.ok ? 'ok' : 'bad');
    d.parentElement.title = p.ok ? 'ok' : (p.reason || 'error');
  });

  // settings changed elsewhere (overlay writes): adopt, never overwrite from stale state
  bus.on('settings', (p) => { if (p && typeof p === 'object') settings.patch(p); refreshers.forEach((f) => f()); });
  bus.on('settings-request', () => bus.emit('settings', stripSecrets(settings.get())));
}

if (typeof document !== 'undefined') {
  boot();
  startAutoUpdate({ canReload: () => !document.activeElement?.matches?.('input,textarea,select') });
}
