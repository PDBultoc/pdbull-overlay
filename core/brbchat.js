// Pure chat-line helpers for the BRB scene (no DOM).
export const MAX_NAME = 25;
export const MAX_TEXT = 140;
const MIN_LUM = 140;

export const trimName = (s) => String(s == null ? '' : s).trim().slice(0, MAX_NAME);

export function trimText(s) {
  const t = String(s == null ? '' : s).replace(/\s+/g, ' ').trim();
  return t.length > MAX_TEXT ? t.slice(0, MAX_TEXT - 1) + '…' : t;
}

function toRgb(c) {
  const s = String(c || '').trim();
  let m = /^#([0-9a-f]{6})$/i.exec(s);
  if (m) { const n = parseInt(m[1], 16); return [n >> 16, (n >> 8) & 255, n & 255]; }
  m = /^hsl\(\s*([\d.]+)\s*,\s*([\d.]+)%\s*,\s*([\d.]+)%\s*\)$/i.exec(s);
  if (m) {
    const h = (+m[1] % 360) / 360, sa = +m[2] / 100, l = +m[3] / 100;
    const q = l < 0.5 ? l * (1 + sa) : l + sa - l * sa, p = 2 * l - q;
    const f = (t) => { t = (t + 1) % 1; return t < 1 / 6 ? p + (q - p) * 6 * t : t < 0.5 ? q : t < 2 / 3 ? p + (q - p) * (2 / 3 - t) * 6 : p; };
    return [f(h + 1 / 3), f(h), f(h - 1 / 3)].map((v) => Math.round(v * 255));
  }
  return null;
}

// Twitch colours can be near-black; on the dark scene lift them to a minimum luminance (hue kept).
export function readableColor(c) {
  const rgb = toRgb(c) || [217, 190, 140];
  const lum = (v) => 0.299 * v[0] + 0.587 * v[1] + 0.114 * v[2];
  let v = rgb;
  if (lum(v) < MIN_LUM) {
    // mix toward white until the luminance floor is met
    let k = (MIN_LUM - lum(v)) / (255 - lum(v));
    k = Math.min(1, k + 0.02);
    v = v.map((x) => Math.round(x + (255 - x) * k));
  }
  return '#' + v.map((x) => x.toString(16).padStart(2, '0')).join('');
}

// New array with msg appended, keeping the last `max` lines; empty messages are ignored (same array back).
export function addLine(lines, msg, max = 3) {
  if (!msg) return lines;
  const text = trimText(msg.text);
  if (!text) return lines;
  const line = { user: trimName(msg.user) || 'viewer', color: readableColor(msg.color), text, emotes: msg.emotes || '' };
  return [...lines, line].slice(-Math.max(1, max));
}
