import { connect } from '../core/twitchchat.js';
import { chatBottom, playerCount, emoteParts } from '../core/camchatlogic.js';

const NAME_DARK = ['#d4a28f', '#a9bf98', '#d8c28f', '#9fb4cc', '#c9a0b4', '#b7a58a', '#c58d6d', '#93b8b0'];
const LIFE = 40000;

const CAM_HTML = `
  <div class="cam">
    <div class="cam-window"><div class="webcam" aria-hidden="true">
      <div class="wc-light"></div><div class="wc-head"></div><div class="wc-neck"></div>
      <div class="wc-shoulders"></div><div class="wc-grain"></div></div></div>
    <i class="k k-tl"></i><i class="k k-tr"></i><i class="k k-bl"></i><i class="k k-br"></i>
  </div>`;

function ensureCss() {
  if (document.getElementById('camchat-css')) return;
  const l = document.createElement('link');
  l.id = 'camchat-css';
  l.rel = 'stylesheet';
  l.href = new URL('./camchat.css', import.meta.url).href;
  document.head.appendChild(l);
}

// ctx: { cfg, bus, latest(): running match or null, reportStatus(st), playersOverride }
export function mount(root, ctx = {}) {
  ensureCss();
  const cfg = ctx.cfg || {};
  const bus = ctx.bus;
  const MAX = Math.max(1, cfg.lines || 7);
  root.innerHTML = CAM_HTML;
  const chat = document.createElement('div');
  chat.className = 'chat';
  root.appendChild(chat);

  const setBottom = (n) => root.style.setProperty('--chat-bottom', chatBottom(n) + 'px');
  const fromMatch = (m) => setBottom(ctx.playersOverride || playerCount(m && m.running !== false ? m : null));
  fromMatch(ctx.latest ? ctx.latest() : null);

  const offs = [];
  if (bus && bus.on) {
    offs.push(bus.on('match-start', (p) => fromMatch(p && p.match)));
    offs.push(bus.on('match-update', (p) => fromMatch(p && p.match)));
    offs.push(bus.on('match-end', () => fromMatch(null)));
    offs.push(bus.on('match-running', (p) => fromMatch(p && p.match)));
  }

  let ci = 0;
  const timers = new Set();
  const later = (fn, ms) => { const id = setTimeout(() => { timers.delete(id); fn(); }, ms); timers.add(id); };

  function remove(el) {
    if (!el.isConnected || el.classList.contains('out')) return;
    el.classList.add('out');
    later(() => el.remove(), 1400);
  }

  function addChat(p) {
    if (!p) return;
    const wrap = document.createElement('div'); wrap.className = 'm';
    const inner = document.createElement('div'); inner.className = 'inner';
    const msg = document.createElement('div'); msg.className = 'msg';
    const name = document.createElement('span'); name.className = 'nm';
    name.textContent = String(p.user == null ? '' : p.user);
    name.style.color = NAME_DARK[ci++ % NAME_DARK.length];
    const tx = document.createElement('span'); tx.className = 'tx';
    for (const part of emoteParts(p.text, p.emotes)) {
      if (typeof part === 'string') tx.append(document.createTextNode(part));
      else { const im = document.createElement('img'); im.className = 'emote'; im.alt = ''; im.src = part.e; im.onerror = () => im.remove(); tx.append(im); }
    }
    msg.append(name, document.createTextNode(': '), tx);
    inner.append(msg); wrap.append(inner); chat.append(wrap);
    requestAnimationFrame(() => requestAnimationFrame(() => wrap.classList.add('in')));
    later(() => remove(wrap), LIFE);
    const live = [...chat.children].filter((c) => !c.classList.contains('out'));
    while (live.length > MAX) remove(live.shift());
  }

  if (bus && bus.on) offs.push(bus.on('chat', addChat));
  const report = (s) => { if (ctx.reportStatus) ctx.reportStatus(s); else if (bus) bus.emit('status', s); };
  const conn = cfg.channel ? connect({ channel: cfg.channel, onMessage: addChat, onStatus: report }) : null;

  return {
    unmount() {
      if (conn && conn.close) conn.close();
      for (const off of offs) if (typeof off === 'function') off();
      timers.forEach(clearTimeout);
      root.innerHTML = '';
    },
  };
}
