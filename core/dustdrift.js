// core/dustdrift.js — single source for the dust x-drift term and its JS mirror.
// Pure module (no three import) so node tests can load it.
// The GLSL term is bounded (|sum| <= 0.95): no unbounded uTime term, so dust
// stays inside the room on multi-hour scenes.
export const DUST_DRIFT_X_GLSL = 'sin(uTime * 0.11 + aPhase * 6.0) * 0.35 + sin(uTime * 0.013 + aPhase * 3.0) * 0.6';
export const dustOffsetX = (t, phase) => Math.sin(t * 0.11 + phase * 6) * 0.35 + Math.sin(t * 0.013 + phase * 3) * 0.6;
