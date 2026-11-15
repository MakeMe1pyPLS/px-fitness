// You → Look & feel: background style and how it moves.

import React, { useEffect, useRef, useState } from 'react';
import { BG_STYLES, bgPrefs, makeScene, sessionSeed, setBgPrefs, styleFor, type BgMode, type BgPrefs, type BgStyle } from '../lib/backdrop';
import { SlidingPicker } from './motion';

function Thumb({ style, seed }: { style: BgStyle; seed: number }) {
  const ref = useRef<HTMLCanvasElement>(null);
  useEffect(() => {
    const cv = ref.current; if (!cv) return; const ctx = cv.getContext('2d'); if (!ctx) return;
    const w = 96, h = 120; cv.width = w * 2; cv.height = h * 2; ctx.scale(2, 2);
    ctx.fillStyle = '#0a0a0b'; ctx.fillRect(0, 0, w, h);
    const sc = makeScene(style, seed, { x: 0, y: 0, on: false, v: 0 }); sc.resize(w * 2.2, h * 2.2);
    ctx.save(); ctx.scale(1 / 2.2, 1 / 2.2); for (let i = 0, t = 0; i < 90; i++) { t += 16; sc.draw(ctx, t, 16); } ctx.restore();
  }, [style, seed]);
  return <canvas ref={ref} className="bg-thumb" aria-hidden />;
}

export function LookFeel() {
  const [p, setP] = useState<BgPrefs>(bgPrefs);
  const seed = sessionSeed();
  const upd = (x: Partial<BgPrefs>) => { setBgPrefs(x); setP(bgPrefs()); };
  const today = styleFor(seed);
  return (
    <section className="card stack" data-testid="look-feel">
      <h2 className="eyebrow">Look & feel</h2>
      <div className="field"><span className="label">Background</span>
        <SlidingPicker label="Background movement" value={p.mode} onChange={(v) => upd({ mode: v as BgMode })} testPrefix="bgmode" options={[{ id: 'still', label: 'Still' }, { id: 'motion', label: 'Motion' }, { id: 'fidget', label: 'Fidget' }]} />
        <p className="small muted" style={{ margin: '6px 0 0' }}>{p.mode === 'still' ? 'A calm picture, no movement.' : p.mode === 'motion' ? 'Slowly alive in the background.' : 'Moves, and reacts when you touch or drag on the screen.'}</p>
      </div>
      <div className="bg-grid" role="radiogroup" aria-label="Background design">
        <button role="radio" aria-checked={p.style === 'auto'} className="bg-opt" onClick={() => upd({ style: 'auto' })} data-testid="bg-auto">
          <Thumb style={today} seed={seed} /><span>New every time</span>
        </button>
        {BG_STYLES.map((s) => (
          <button key={s.id} role="radio" aria-checked={p.style === s.id} className="bg-opt" onClick={() => upd({ style: s.id })} data-testid={`bg-${s.id}`}>
            <Thumb style={s.id} seed={seed} /><span>{s.name}</span>
          </button>
        ))}
      </div>
      <p className="small muted" style={{ margin: 0 }}>“New every time” picks a fresh design each time you open the app. Reduce motion (below) keeps it still.</p>
    </section>
  );
}
