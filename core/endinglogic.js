// Pure helpers of the "Thanks for watching" end scene (scenes/ending.js loads three via the importmap, node cannot).
// Opening beat <= 8 s, then a steady state that can run for hours: only bounded drift, nothing accumulates.

export const T_OUT = 3.2;       // the flame goes out
export const INK_T0 = 2.6;      // the letter starts being written
export const INK_TITLE = 3.5;   // seconds the title takes
export const INK_SUB0 = 6.4;    // "See you next time" starts
export const INK_SUB = 1.5;     // ... and takes this long
export const BEAT_END = INK_SUB0 + INK_SUB; // 7.9 s: the opening is over

export const clamp01 = (x) => Math.min(1, Math.max(0, x));
export const smooth = (a, b, x) => { const t = clamp01((x - a) / (b - a)); return t * t * (3 - 2 * t); };

// camera wander (offsets from the home position), periods of 1-2 minutes
export const CAM_BOUNDS = { x: 0.2, y: 0.07, z: 0.1, lookX: 0.1 };
export function camDrift(t) {
  return { x: Math.sin(t * 0.0757) * CAM_BOUNDS.x, y: Math.sin(t * 0.103) * CAM_BOUNDS.y, z: Math.sin(t * 0.065) * CAM_BOUNDS.z };
}
export function lookDrift(t) { return Math.sin(t * 0.05) * CAM_BOUNDS.lookX; }

/**
 * Opening beat at t seconds after the scene is shown, each value in 0..1.
 *   flame: candle strength (1 lit, guttering from 0.7 s, 0 once out at T_OUT)
 *   ember: glow of the wick after the flame is out
 *   ink:   share of the letter written (title 70 %, sub line 30 %)
 */
export function beatAt(t) {
  const tt = Math.max(0, t);
  const flame = tt >= T_OUT ? 0 : 1 - 0.86 * smooth(0.7, T_OUT, tt);
  const ember = smooth(T_OUT, T_OUT + 0.4, tt);
  const ink = clamp01(clamp01((tt - INK_T0) / INK_TITLE) * 0.7 + clamp01((tt - INK_SUB0) / INK_SUB) * 0.3);
  return { flame, ember, ink };
}
