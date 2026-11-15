// Kids Zone: full-screen physics games for a child while their grown-up trains.
// Opens over the workout (which keeps running). Leaving needs a grown-up:
// press and hold the exit button for 2 seconds.

import React, { useEffect, useRef, useState } from 'react';
import { Portal } from '../components/core';
import { GAMES, type Fx, type Game, type GameId } from './games';

let audio: AudioContext | null = null;
function popSound(pitch = 1, on = true) {
  if (!on) return;
  try {
    audio ??= new (window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext)();
    const o = audio.createOscillator(), g = audio.createGain(), t = audio.currentTime;
    o.type = 'sine'; o.frequency.setValueAtTime(380 * pitch, t); o.frequency.exponentialRampToValueAtTime(900 * pitch, t + 0.07);
    g.gain.setValueAtTime(0.16, t); g.gain.exponentialRampToValueAtTime(0.001, t + 0.12);
    o.connect(g).connect(audio.destination); o.start(t); o.stop(t + 0.13);
  } catch { /* no audio */ }
}

export function KidsZone({ onExit }: { onExit: () => void }) {
  const [game, setGame] = useState<GameId>(() => (localStorage.getItem('px:kids-game') as GameId) || 'bubbles');
  const [sound, setSound] = useState(() => localStorage.getItem('px:kids-sound') !== 'off');
  const [score, setScore] = useState(0);
  const [gate, setGate] = useState(false);
  const cv = useRef<HTMLCanvasElement>(null);
  const soundRef = useRef(sound); soundRef.current = sound;

  useEffect(() => { const o = document.body.style.overflow; document.body.style.overflow = 'hidden'; return () => { document.body.style.overflow = o; }; }, []);

  useEffect(() => {
    localStorage.setItem('px:kids-game', game);
    const c = cv.current!; const ctx = c.getContext('2d')!;
    const fx: Fx = { pop: (p) => popSound(p, soundRef.current), buzz: (ms = 10) => { try { navigator.vibrate?.(ms); } catch { /* ignore */ } } };
    const def = GAMES.find((g) => g.id === game)!;
    const g: Game = def.make(fx);
    let W = 0, H = 0, raf = 0, last = 0, shown = -1;
    const size = () => {
      const dpr = Math.min(window.devicePixelRatio || 1, 2), r = c.getBoundingClientRect();
      W = r.width; H = r.height; c.width = Math.round(W * dpr); c.height = Math.round(H * dpr); ctx.setTransform(dpr, 0, 0, dpr, 0, 0); g.resize(W, H);
    };
    const loop = (now: number) => {
      raf = requestAnimationFrame(loop);
      const dt = Math.min(3, (now - (last || now)) / 16.67); last = now;
      g.step(dt);
      ctx.clearRect(0, 0, W, H); g.draw(ctx);
      const s = g.score(); if (s !== shown) { shown = s; setScore(s); }
    };
    size(); raf = requestAnimationFrame(loop);
    const pt = (e: PointerEvent) => { const r = c.getBoundingClientRect(); return { x: e.clientX - r.left, y: e.clientY - r.top, id: e.pointerId }; };
    const dn = (e: PointerEvent) => { e.preventDefault(); c.setPointerCapture?.(e.pointerId); g.down(pt(e)); };
    const mv = (e: PointerEvent) => { g.move(pt(e)); };
    const up = (e: PointerEvent) => { g.up(pt(e)); };
    c.addEventListener('pointerdown', dn); c.addEventListener('pointermove', mv); c.addEventListener('pointerup', up); c.addEventListener('pointercancel', up);
    window.addEventListener('resize', size);
    return () => { cancelAnimationFrame(raf); c.removeEventListener('pointerdown', dn); c.removeEventListener('pointermove', mv); c.removeEventListener('pointerup', up); c.removeEventListener('pointercancel', up); window.removeEventListener('resize', size); };
  }, [game]);

  const def = GAMES.find((g) => g.id === game)!;
  return (
    <Portal>
      <div className="kids" role="dialog" aria-modal="true" aria-label="Kids Zone" data-testid="kids-zone">
        <div className="kids-top">
          <button className="kids-x" aria-label="Exit Kids Zone (grown-ups)" onClick={() => setGate(true)} data-testid="kids-x"><svg viewBox="0 0 24 24" width="20" height="20" aria-hidden><path d="M6 6l12 12M18 6L6 18" stroke="currentColor" strokeWidth="2.6" strokeLinecap="round" /></svg></button>
          <div className="kids-tabs" role="tablist" aria-label="Games">
            {GAMES.map((g) => <button key={g.id} role="tab" aria-selected={game === g.id} className="kids-tab" onClick={() => setGame(g.id)} data-testid={`kids-${g.id}`}><span aria-hidden className="kids-emoji">{g.emoji}</span><span>{g.name}</span></button>)}
          </div>
        </div>
        <canvas ref={cv} className="kids-canvas" data-game={game} data-testid="kids-canvas" />
        <div className="kids-bottom">
          <span className="kids-score" aria-live="polite" data-testid="kids-score">{def.unit ? `${score} ${def.unit}` : ''}</span>
          <button className="kids-sound" onClick={() => { const v = !sound; setSound(v); localStorage.setItem('px:kids-sound', v ? 'on' : 'off'); }} aria-pressed={sound} aria-label={sound ? 'Sound on' : 'Sound off'}>{sound ? '🔊' : '🔇'}</button>
          <HoldExit onExit={onExit} />
        </div>
        {gate && <GrownUpGate onPass={onExit} onCancel={() => setGate(false)} />}
      </div>
    </Portal>
  );
}

/** Grown-up exit: hold for 2 seconds. Little hands tapping won't close it. */
function HoldExit({ onExit }: { onExit: () => void }) {
  const [p, setP] = useState(0);
  const timer = useRef<number | null>(null);
  const start = () => {
    const t0 = performance.now();
    const tick = () => { const k = Math.min(1, (performance.now() - t0) / 1500); setP(k); if (k >= 1) { stop(); onExit(); return; } timer.current = requestAnimationFrame(tick); };
    timer.current = requestAnimationFrame(tick);
  };
  const stop = () => { if (timer.current) cancelAnimationFrame(timer.current); timer.current = null; setP(0); };
  useEffect(() => stop, []); // eslint-disable-line react-hooks/exhaustive-deps
  return (
    <button className="kids-exit" style={{ ['--p' as string]: p }} onPointerDown={(e) => { e.currentTarget.setPointerCapture?.(e.pointerId); start(); }} onPointerUp={stop} onPointerCancel={stop} onContextMenu={(e) => e.preventDefault()}
      onKeyDown={(e) => { if (e.key === 'Enter' && e.repeat) onExit(); }} aria-label="Grown-up exit: press and hold" data-testid="kids-exit">
      <span>{p > 0 ? 'Keep holding…' : 'Grown-up: hold to exit'}</span>
    </button>
  );
}

/** Tap ✕ → a quick question a small child can't answer by tapping around. */
function GrownUpGate({ onPass, onCancel }: { onPass: () => void; onCancel: () => void }) {
  const [q] = useState(() => { const a = 4 + ((Math.random() * 6) | 0), b = 3 + ((Math.random() * 6) | 0); const ans = a + b; const opts = new Set([ans]); while (opts.size < 4) opts.add(ans + [-3, -2, -1, 1, 2, 3][(Math.random() * 6) | 0]); return { a, b, ans, opts: [...opts].sort(() => Math.random() - 0.5) }; });
  const [wrong, setWrong] = useState(false);
  return (
    <div className="kids-gate" role="dialog" aria-modal="true" aria-label="Grown-ups only" data-testid="kids-gate">
      <div className={'kids-gate-card' + (wrong ? ' shake' : '')}>
        <b>Grown-ups only</b>
        <p>To leave, tap the answer: <span className="tnum" data-testid="gate-q">{q.a} + {q.b}</span></p>
        <div className="kids-gate-opts">{q.opts.map((o) => <button key={o} className="kids-gate-opt tnum" onClick={() => { if (o === q.ans) onPass(); else { setWrong(true); setTimeout(onCancel, 500); } }} data-testid={`gate-${o}`}>{o}</button>)}</div>
        <button className="kids-gate-back" onClick={onCancel} data-testid="gate-back">Keep playing</button>
      </div>
    </div>
  );
}
