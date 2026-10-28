// PX motion system.
//
// Springs are simulated (damped harmonic oscillator) and turned into CSS
// `linear()` easing curves, so CSS animations get real spring physics with no
// animation library. Approach follows beUI's spring tokens and its reduced-motion
// rule: under reduced motion, MOVEMENT is removed but opacity/color feedback
// stays. Each animation is specified as trigger → start → move → settle
// (the breakdown 60fps.design uses).

export interface Spring { stiffness: number; damping: number; mass?: number }

/** Named springs. Tune here; everything else references these. */
export const SPRINGS = {
  press: { stiffness: 520, damping: 30 },   // tap feedback, toggles
  snappy: { stiffness: 380, damping: 30 },  // indicators, chips, small layout moves
  smooth: { stiffness: 190, damping: 26 },  // card entrances, sheets
  bouncy: { stiffness: 300, damping: 17 },  // celebration, ring settle, numbers landing
  gentle: { stiffness: 110, damping: 20 },  // large hero elements
} as const satisfies Record<string, Spring>;
export type SpringName = keyof typeof SPRINGS;

/** Simulate a spring from 0 → 1. Returns samples and the time it settles. */
export function simulate({ stiffness: k, damping: c, mass: m = 1 }: Spring, dt = 1 / 120, eps = 0.001) {
  let x = 0, v = 0, t = 0;
  const pts: { t: number; x: number }[] = [{ t: 0, x: 0 }];
  let still = 0;
  while (t < 3) {
    const a = (-k * (x - 1) - c * v) / m;
    v += a * dt; x += v * dt; t += dt;
    pts.push({ t, x });
    if (Math.abs(x - 1) < eps && Math.abs(v) < eps * 10) { if (++still > 6) break; } else still = 0;
  }
  return { pts, duration: t };
}

/** CSS linear() easing that reproduces the spring, plus its duration in ms. */
export function springEasing(s: Spring, samples = 36) {
  const { pts, duration } = simulate(s);
  const out: string[] = [];
  for (let i = 0; i <= samples; i++) {
    const tt = (duration * i) / samples;
    const p = pts.find((q) => q.t >= tt) ?? pts[pts.length - 1];
    out.push(String(Math.round((i === samples ? 1 : p.x) * 1000) / 1000));
  }
  return { easing: `linear(${out.join(', ')})`, ms: Math.round(duration * 1000) };
}

/** Value of the spring at time t (seconds): used for JS-driven count-ups. */
export function springAt(s: Spring, t: number) {
  const { pts } = simulate(s);
  const p = pts.find((q) => q.t >= t);
  return p ? p.x : 1;
}

export function prefersReduced(): boolean {
  try {
    const forced = document.documentElement.dataset.motion;
    if (forced === 'reduced') return true;
    if (forced === 'full') return false;
    return window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  } catch { return false; }
}

/** Write spring tokens as CSS variables (with cubic-bezier fallbacks in the stylesheet). */
export function installMotionTokens(root: HTMLElement = document.documentElement) {
  const supportsLinear = typeof CSS !== 'undefined' && CSS.supports?.('animation-timing-function', 'linear(0, 1)');
  for (const [name, s] of Object.entries(SPRINGS)) {
    const { easing, ms } = springEasing(s);
    if (supportsLinear) root.style.setProperty(`--spring-${name}`, easing);
    root.style.setProperty(`--spring-${name}-ms`, `${ms}ms`);
  }
}

/** Run a DOM update inside a View Transition when supported and motion is allowed. */
export function withViewTransition(update: () => void) {
  const d = document as Document & { startViewTransition?: (cb: () => void) => unknown };
  if (!d.startViewTransition || prefersReduced()) { update(); return; }
  d.startViewTransition(update);
}
