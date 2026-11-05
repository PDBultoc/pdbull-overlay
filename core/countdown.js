// Pure countdown logic for the Starting Soon scene (no DOM, no clock: `now` is always passed in).
// countdownEnd is an epoch in milliseconds (settings.scenes.countdownEnd); null means "no countdown set".

/** Seconds from now until end (negative once past), or null when no valid end is set. */
export function remainingSeconds(end, now) {
  if (end == null || end === '') return null;
  const e = Number(end);
  if (!Number.isFinite(e)) return null;
  return (e - now) / 1000;
}

/** 'm:ss', rounded up so the display reaches 0:00 exactly when the time is up; '' for null. */
export function formatCountdown(sec) {
  if (sec == null || !Number.isFinite(sec)) return '';
  const s = Math.max(0, Math.ceil(sec));
  return Math.floor(s / 60) + ':' + String(s % 60).padStart(2, '0');
}

/** 'soon' (no end set), 'counting' (time left), 'now' (end reached or passed). */
export function countdownState(end, now) {
  const r = remainingSeconds(end, now);
  if (r == null) return 'soon';
  return r > 0 ? 'counting' : 'now';
}

/** Everything the scene draws: { state, text, frac } where frac (0..1) is the wax left out of totalSec. */
export function countdownView(end, now, totalSec = 300) {
  const state = countdownState(end, now);
  if (state === 'soon') return { state, text: '', frac: 1 };
  const r = remainingSeconds(end, now);
  const frac = state === 'now' ? 0 : Math.min(1, Math.max(0, r / Math.max(1, totalSec)));
  return { state, text: formatCountdown(r), frac };
}
