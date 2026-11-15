// The app's living background: a canvas behind everything, drawn by lib/backdrop.

import React, { useEffect, useRef, useState } from 'react';
import { bgPrefs, makeScene, sessionSeed, styleFor, type BgPrefs, type Touch } from '../lib/backdrop';
import { prefersReduced } from '../lib/motion';

export function Backdrop() {
  const ref = useRef<HTMLCanvasElement>(null);
  const [prefs, setPrefs] = useState<BgPrefs>(bgPrefs);
  useEffect(() => { const on = () => setPrefs(bgPrefs()); window.addEventListener('px:bg', on); return () => window.removeEventListener('px:bg', on); }, []);

  useEffect(() => {
    const cv = ref.current; if (!cv) return;
    const ctx = cv.getContext('2d', { alpha: false }); if (!ctx) return;
    document.documentElement.dataset.bg = 'canvas';
    const seed = sessionSeed();
    const style = prefs.style === 'auto' ? styleFor(seed) : prefs.style;
    const mode = prefersReduced() ? 'still' : prefs.mode;
    const touch: Touch = { x: 0, y: 0, on: false, v: 0 };
    const scene = makeScene(style, seed, touch);
    cv.dataset.style = style; cv.dataset.mode = mode;
    let raf = 0, last = 0, t = 0, lx = 0;
    const size = () => {
      const dpr = Math.min(window.devicePixelRatio || 1, 1.5), w = window.innerWidth, h = window.innerHeight;
      cv.width = Math.round(w * dpr); cv.height = Math.round(h * dpr); cv.style.width = w + 'px'; cv.style.height = h + 'px';
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0); ctx.fillStyle = '#0a0a0b'; ctx.fillRect(0, 0, w, h);
      scene.resize(w, h);
      if (mode === 'still') { for (let i = 0; i < 160; i++) { t += 16; scene.draw(ctx, t, 16); } }
    };
    const frame = (now: number) => {
      raf = requestAnimationFrame(frame);
      if (document.hidden) return;
      const dt = Math.min(64, now - (last || now));
      if (dt < 30 && last) return; // ~30fps is plenty for a background
      last = now; t += dt; scene.draw(ctx, t, dt);
      touch.v *= 0.9;
    };
    size();
    if (mode !== 'still') raf = requestAnimationFrame(frame);
    let rt = 0; const onResize = () => { clearTimeout(rt); rt = window.setTimeout(size, 150); };
    window.addEventListener('resize', onResize);
    const mv = (e: PointerEvent) => { touch.v = e.clientX - lx; lx = e.clientX; touch.x = e.clientX; touch.y = e.clientY; if (e.pointerType === 'mouse') touch.on = true; };
    const dn = (e: PointerEvent) => { lx = e.clientX; touch.x = e.clientX; touch.y = e.clientY; touch.on = true; };
    const up = (e: PointerEvent) => { if (e.pointerType !== 'mouse') touch.on = false; };
    const out = () => { touch.on = false; };
    if (mode === 'fidget') {
      window.addEventListener('pointermove', mv, { passive: true }); window.addEventListener('pointerdown', dn, { passive: true });
      window.addEventListener('pointerup', up, { passive: true }); window.addEventListener('pointercancel', up, { passive: true }); document.addEventListener('mouseleave', out);
    }
    return () => {
      cancelAnimationFrame(raf); window.removeEventListener('resize', onResize);
      window.removeEventListener('pointermove', mv); window.removeEventListener('pointerdown', dn); window.removeEventListener('pointerup', up); window.removeEventListener('pointercancel', up); document.removeEventListener('mouseleave', out);
    };
  }, [prefs.mode, prefs.style]);

  return <canvas ref={ref} className="backdrop" aria-hidden data-testid="backdrop" />;
}
