// PX interaction FX: touch light, press ripples, tilt, selection bursts and haptics.
// One set of delegated listeners for the whole app, so every card, option and
// button gets the same feel without wiring each component.
// Under reduced motion: no ripples, tilt or particles. Haptics stay (they aren't motion).

import { prefersReduced } from './motion';

const LIGHT = '.card, .tile, .option, .goal-card, .hero-card, .promo, .fid';
const PRESS = '.btn, .check, .chip, .option, .goal-card, .tile-btn, .seg button, .picker button, .nav a, .icon-btn, .card-press';
const TILT = '.option, .goal-card, .tile, .card-press';
const PICK = '.option, .goal-card, .check, .chip, .seg button, .picker button';

export function buzz(pattern: number | number[] = 8) {
  try { if (localStorage.getItem('px:haptics') === 'off') return; navigator.vibrate?.(pattern); } catch { /* not supported */ }
}

/** Little spark burst at a point on the screen. */
export function burst(x: number, y: number, n = 10, colors = ['#ff5a1f', '#ffb36b', '#39e6ff', '#ff3d7f']) {
  if (prefersReduced()) return;
  const layer = document.createElement('div');
  layer.className = 'fx-burst';
  layer.style.left = `${x}px`; layer.style.top = `${y}px`;
  for (let i = 0; i < n; i++) {
    const s = document.createElement('i');
    const a = (Math.PI * 2 * i) / n + Math.random() * 0.5;
    const d = 26 + Math.random() * 34;
    s.style.setProperty('--x', `${Math.cos(a) * d}px`);
    s.style.setProperty('--y', `${Math.sin(a) * d}px`);
    s.style.background = colors[i % colors.length];
    s.style.animationDelay = `${Math.random() * 40}ms`;
    layer.appendChild(s);
  }
  document.body.appendChild(layer);
  setTimeout(() => layer.remove(), 700);
}

function ripple(el: HTMLElement, x: number, y: number) {
  const r = el.getBoundingClientRect();
  const size = Math.max(r.width, r.height) * 2.2;
  const s = document.createElement('span');
  s.className = 'fx-ripple';
  s.style.width = s.style.height = `${size}px`;
  s.style.left = `${x - r.left - size / 2}px`;
  s.style.top = `${y - r.top - size / 2}px`;
  el.appendChild(s);
  setTimeout(() => s.remove(), 650);
}

let installed = false;
export function installFx() {
  if (installed || typeof document === 'undefined') return;
  installed = true;
  let frame = 0;
  let last: PointerEvent | null = null;

  const move = () => {
    frame = 0;
    const e = last; if (!e) return;
    const t = e.target as Element | null;
    const el = t?.closest?.(LIGHT) as HTMLElement | null;
    if (el) {
      const r = el.getBoundingClientRect();
      el.style.setProperty('--mx', `${e.clientX - r.left}px`);
      el.style.setProperty('--my', `${e.clientY - r.top}px`);
      el.dataset.lit = '1';
    }
    const tl = t?.closest?.(TILT) as HTMLElement | null;
    if (tl && !prefersReduced() && e.pointerType === 'mouse') {
      const r = tl.getBoundingClientRect();
      tl.style.setProperty('--ry', `${((e.clientX - r.left) / r.width - 0.5) * 6}deg`);
      tl.style.setProperty('--rx', `${-((e.clientY - r.top) / r.height - 0.5) * 6}deg`);
    }
  };
  document.addEventListener('pointermove', (e) => { last = e; if (!frame) frame = requestAnimationFrame(move); }, { passive: true });
  document.addEventListener('pointerout', (e) => {
    const el = (e.target as Element | null)?.closest?.(`${LIGHT}, ${TILT}`) as HTMLElement | null;
    if (el && !el.contains(e.relatedTarget as Node)) { delete el.dataset.lit; el.style.removeProperty('--rx'); el.style.removeProperty('--ry'); }
  }, { passive: true });

  document.addEventListener('pointerdown', (e) => {
    const t = e.target as Element | null;
    const lit = t?.closest?.(LIGHT) as HTMLElement | null;
    if (lit) { const r = lit.getBoundingClientRect(); lit.style.setProperty('--mx', `${e.clientX - r.left}px`); lit.style.setProperty('--my', `${e.clientY - r.top}px`); lit.dataset.lit = '1'; }
    const el = t?.closest?.(PRESS) as HTMLElement | null;
    if (!el || (el as HTMLButtonElement).disabled) return;
    buzz(6);
    if (!prefersReduced()) ripple(el, e.clientX, e.clientY);
  }, { passive: true });

  // Selecting something gets a reward: a spark burst and a double tick.
  document.addEventListener('click', (e) => {
    const el = (e.target as Element | null)?.closest?.(PICK) as HTMLElement | null;
    if (!el) return;
    const x = e.clientX || el.getBoundingClientRect().left + el.offsetWidth / 2;
    const y = e.clientY || el.getBoundingClientRect().top + el.offsetHeight / 2;
    requestAnimationFrame(() => requestAnimationFrame(() => {
      const on = el.getAttribute('aria-checked') === 'true' || el.getAttribute('aria-pressed') === 'true' || el.getAttribute('aria-selected') === 'true';
      if (!on) return;
      el.classList.remove('fx-picked'); void el.offsetWidth; el.classList.add('fx-picked');
      buzz([8, 40, 12]);
      burst(x, y, el.matches('.option, .goal-card') ? 14 : 8);
    }));
  });
}
