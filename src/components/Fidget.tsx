// Fidget pad: something for restless hands that steers toward starting.
// Spin (a weighted dial with detents), Pop (bubble wrap that refills) and
// Breathe (a 1-minute reset). Each gives a tiny, immediate reward: a tick,
// a pop, a glow. It's a pre-workout ramp, not a game: no scores to chase.

import React, { useEffect, useRef, useState } from 'react';
import { SlidingPicker } from './motion';
import { buzz, burst } from '../lib/fx';
import { prefersReduced } from '../lib/motion';

type Mode = 'spin' | 'pop' | 'breathe';
const KEY = 'px:fidget';

export function FidgetPad({ onStart }: { onStart?: () => void }) {
  const [mode, setMode] = useState<Mode>(() => { try { return (localStorage.getItem(KEY) as Mode) || 'spin'; } catch { return 'spin'; } });
  const pick = (m: string) => { setMode(m as Mode); try { localStorage.setItem(KEY, m); } catch { /* ignore */ } };
  return (
    <section className="fid focus-keep" aria-labelledby="fid-h" data-testid="fidget">
      <div className="row-between">
        <div>
          <h2 id="fid-h" className="eyebrow">Fidget & reset</h2>
          <p className="small muted">Restless? Give your hands something to do for a minute, then start.</p>
        </div>
      </div>
      <SlidingPicker label="Fidget" value={mode} onChange={pick} testPrefix="fid" options={[{ id: 'spin', label: 'Spin' }, { id: 'pop', label: 'Pop' }, { id: 'breathe', label: 'Breathe' }]} />
      <div className="fid-stage">
        {mode === 'spin' && <Dial />}
        {mode === 'pop' && <Pops />}
        {mode === 'breathe' && <Breathe />}
      </div>
      {onStart && <button className="btn btn-outline btn-block" onClick={onStart} data-testid="fid-start">Ready. Just 5 minutes →</button>}
    </section>
  );
}

// ── Spin: drag the dial; it keeps momentum and clicks at each detent ─────────
const DETENT = 30;
function Dial() {
  const ref = useRef<HTMLButtonElement>(null);
  const [angle, setAngle] = useState(0);
  const st = useRef({ a: 0, v: 0, last: 0, t: 0, drag: false, raf: 0, ticks: 0 });
  const [turns, setTurns] = useState(0);
  const [hot, setHot] = useState(-1);

  const apply = (a: number) => {
    const s = st.current;
    const before = Math.floor(s.a / DETENT), after = Math.floor(a / DETENT);
    if (before !== after) { s.ticks += Math.abs(after - before); buzz(4); setHot(((after % 12) + 12) % 12); }
    s.a = a; setAngle(a); setTurns(Math.floor(Math.abs(a) / 360));
  };
  const angleAt = (x: number, y: number) => { const r = ref.current!.getBoundingClientRect(); return (Math.atan2(y - (r.top + r.height / 2), x - (r.left + r.width / 2)) * 180) / Math.PI; };
  const coast = () => {
    const s = st.current;
    cancelAnimationFrame(s.raf);
    if (prefersReduced()) { s.v = 0; return; }
    const step = () => { s.v *= 0.965; if (Math.abs(s.v) < 0.05) return; apply(s.a + s.v); s.raf = requestAnimationFrame(step); };
    s.raf = requestAnimationFrame(step);
  };
  useEffect(() => () => cancelAnimationFrame(st.current.raf), []);

  const down = (e: React.PointerEvent) => { const s = st.current; cancelAnimationFrame(s.raf); s.drag = true; s.last = angleAt(e.clientX, e.clientY); s.t = performance.now(); s.v = 0; (e.target as Element).setPointerCapture?.(e.pointerId); };
  const move = (e: React.PointerEvent) => {
    const s = st.current; if (!s.drag) return;
    const now = angleAt(e.clientX, e.clientY);
    let d = now - s.last; if (d > 180) d -= 360; if (d < -180) d += 360;
    const dt = Math.max(1, performance.now() - s.t);
    s.v = (d / dt) * 16; s.last = now; s.t = performance.now();
    apply(s.a + d);
  };
  const up = () => { const s = st.current; if (!s.drag) return; s.drag = false; coast(); };
  const key = (e: React.KeyboardEvent) => {
    if (e.key === 'ArrowRight' || e.key === 'ArrowUp') { e.preventDefault(); apply(st.current.a + DETENT); }
    if (e.key === 'ArrowLeft' || e.key === 'ArrowDown') { e.preventDefault(); apply(st.current.a - DETENT); }
    if (e.key === ' ' || e.key === 'Enter') { e.preventDefault(); st.current.v = 18; coast(); }
  };
  const notches = Array.from({ length: 12 }, (_, i) => i);
  return (
    <div className="stack" style={{ alignItems: 'center', gap: 10 }}>
      <button ref={ref} className="dial" aria-label="Fidget dial. Drag to spin, or use arrow keys." onPointerDown={down} onPointerMove={move} onPointerUp={up} onPointerCancel={up} onKeyDown={key} data-testid="dial">
        <svg viewBox="-110 -110 220 220" aria-hidden>
          <defs>
            <radialGradient id="dialg" cx="35%" cy="30%"><stop offset="0" stopColor="#2c2a29" /><stop offset="1" stopColor="#0b0c12" /></radialGradient>
            <linearGradient id="trailg"><stop offset="0" stopColor="#ff5a1f" /><stop offset="1" stopColor="#ff9a6a" /></linearGradient>
          </defs>
          <circle r="104" className="dial-face" />
          {notches.map((i) => { const a = (i * DETENT * Math.PI) / 180; return <line key={i} className={'dial-notch' + (hot === i ? ' hot' : '')} x1={Math.cos(a) * 88} y1={Math.sin(a) * 88} x2={Math.cos(a) * 98} y2={Math.sin(a) * 98} />; })}
          <g style={{ transform: `rotate(${angle}deg)` }}>
            <circle r="70" fill="none" stroke="rgba(255,255,255,0.06)" strokeWidth="14" />
            <path className="dial-trail" d="M 70 0 A 70 70 0 0 1 0 70" />
            <circle cx="70" cy="0" r="11" className="dial-knob" />
          </g>
          <circle r="34" className="dial-hub" />
        </svg>
      </button>
      <span className="fid-count" aria-live="polite" data-testid="dial-turns">{turns} {turns === 1 ? 'spin' : 'spins'}</span>
    </div>
  );
}

// ── Pop: bubble wrap ─────────────────────────────────────────────────────
function Pops() {
  const N = 16;
  const [popped, setPopped] = useState<boolean[]>(() => Array(N).fill(false));
  const [round, setRound] = useState(0);
  const [total, setTotal] = useState(0);
  const pop = (i: number, e: React.MouseEvent) => {
    if (popped[i]) return;
    buzz(10);
    const r = (e.currentTarget as HTMLElement).getBoundingClientRect();
    burst(r.left + r.width / 2, r.top + r.height / 2, 6);
    const next = popped.map((p, k) => (k === i ? true : p));
    setPopped(next); setTotal((t) => t + 1);
    if (next.every(Boolean)) setTimeout(() => { buzz([10, 50, 10, 50, 20]); setPopped(Array(N).fill(false)); setRound((x) => x + 1); }, 500);
  };
  return (
    <div className="stack" style={{ alignItems: 'center', gap: 12 }}>
      <div className={'pops' + (round ? ' refill' : '')} key={round}>
        {popped.map((p, i) => <button key={i} className="pop" aria-pressed={p} aria-label={p ? 'Popped' : 'Bubble'} style={{ ['--k' as string]: i }} onClick={(e) => pop(i, e)} data-testid="pop" />)}
      </div>
      <span className="fid-count" aria-live="polite">{total} popped</span>
    </div>
  );
}

// ── Breathe: 4 in · 4 hold · 6 out, four rounds (~1 minute) ───────────────
const PHASES = [{ id: 'in', label: 'Breathe in', s: 4 }, { id: 'hold', label: 'Hold', s: 4 }, { id: 'out', label: 'Breathe out', s: 6 }] as const;
function Breathe() {
  const [on, setOn] = useState(false);
  const [ph, setPh] = useState(0);
  const [round, setRound] = useState(0);
  const [left, setLeft] = useState(PHASES[0].s);
  useEffect(() => {
    if (!on) return;
    let p = 0, r = 0, l = PHASES[0].s;
    setPh(0); setRound(0); setLeft(l); buzz(12);
    const id = setInterval(() => {
      l -= 1;
      if (l <= 0) {
        p = (p + 1) % PHASES.length;
        if (p === 0) r += 1;
        if (r >= 4) { setOn(false); buzz([10, 60, 10]); return; }
        l = PHASES[p].s; setPh(p); setRound(r); buzz(p === 2 ? [6, 40, 6] : 12);
      }
      setLeft(l);
    }, 1000);
    return () => clearInterval(id);
  }, [on]);
  const phase = PHASES[ph];
  return (
    <div className="stack" style={{ alignItems: 'center', gap: 12 }}>
      <button className="orb" data-phase={on ? phase.id : 'idle'} style={{ ['--orb-ms' as string]: `${on ? phase.s * 1000 : 600}ms` }} onClick={() => setOn((x) => !x)} aria-pressed={on} data-testid="orb">
        <span>{on ? <>{phase.label}<br /><span className="tnum" style={{ fontSize: 28 }}>{left}</span></> : 'Tap to start'}</span>
      </button>
      <span className="small muted" aria-live="polite">{on ? `Round ${round + 1} of 4 · tap to stop` : 'One minute to reset before you train.'}</span>
    </div>
  );
}

/** A row of bubbles in the rest timer: something for your hands between sets. */
export function MiniPops() {
  const N = 8;
  const [p, setP] = useState<boolean[]>(() => Array(N).fill(false));
  const [round, setRound] = useState(0);
  const hit = (i: number) => {
    if (p[i]) return;
    buzz(8);
    const next = p.map((x, k) => (k === i ? true : x));
    setP(next);
    if (next.every(Boolean)) setTimeout(() => { setP(Array(N).fill(false)); setRound((r) => r + 1); }, 400);
  };
  return (
    <div className={'mini-pops' + (round ? ' refill' : '')} key={round} aria-label="Fidget bubbles" data-testid="rest-pops">
      {p.map((x, i) => <button key={i} className="pop" aria-pressed={x} aria-label={x ? 'Popped' : 'Bubble'} style={{ ['--k' as string]: i }} onClick={() => hit(i)} />)}
    </div>
  );
}
