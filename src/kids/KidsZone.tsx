// Kids Zone: full-screen physics games for a child while their grown-up trains.
// Opens over the workout (which keeps running). Leaving needs a grown-up:
// press and hold the exit button for 2 seconds.

import React, { useEffect, useRef, useState } from 'react';
import { Portal } from '../components/core';
import { GAMES, type Fx, type Game, type GameId, type RoundState } from './games';

let audio: AudioContext | null = null;
// One major-pentatonic scale, so every sound fits with every other one.
const SCALE = [0, 2, 4, 7, 9];
function softNote(step: number, vol = 0.6, on = true) {
  if (!on) return;
  try {
    audio ??= new (window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext)();
    const s = Math.max(0, Math.round(step)), semis = SCALE[s % 5] + 12 * Math.floor(s / 5);
    const f = 392 * 2 ** (semis / 12), t = audio.currentTime;
    const o = audio.createOscillator(), o2 = audio.createOscillator(), g = audio.createGain();
    o.type = 'sine'; o2.type = 'triangle'; o.frequency.value = f; o2.frequency.value = f * 2;
    const g2 = audio.createGain(); g2.gain.value = 0.15;
    g.gain.setValueAtTime(0.0001, t); g.gain.linearRampToValueAtTime(0.09 * vol, t + 0.012); g.gain.exponentialRampToValueAtTime(0.0001, t + 0.9);
    o.connect(g); o2.connect(g2).connect(g); g.connect(audio.destination);
    o.start(t); o2.start(t); o.stop(t + 0.95); o2.stop(t + 0.95);
  } catch { /* no audio */ }
}
const bestKey = (g: string) => `px:kids-best:${g}`;
const getBest = (g: string) => Number(localStorage.getItem(bestKey(g)) ?? 0) || 0;

export function KidsZone({ onExit }: { onExit: () => void }) {
  const [game, setGame] = useState<GameId>(() => { const g = localStorage.getItem('px:kids-game'); return GAMES.some((x) => x.id === g) ? g as GameId : 'merge'; });
  const [sound, setSound] = useState(() => localStorage.getItem('px:kids-sound') !== 'off');
  const [st, setSt] = useState<RoundState>({ score: 0, over: false, info: '' });
  const [best, setBest] = useState(0);
  const [newBest, setNewBest] = useState(false);
  const gameRef = useRef<Game | null>(null);
  const [gate, setGate] = useState(false);
  const cv = useRef<HTMLCanvasElement>(null);
  const soundRef = useRef(sound); soundRef.current = sound;

  useEffect(() => { const o = document.body.style.overflow; document.body.style.overflow = 'hidden'; return () => { document.body.style.overflow = o; }; }, []);

  useEffect(() => {
    localStorage.setItem('px:kids-game', game);
    const c = cv.current!; const ctx = c.getContext('2d')!;
    const fx: Fx = { note: (n, v) => softNote(n, v, soundRef.current), buzz: (ms = 10) => { try { navigator.vibrate?.(ms); } catch { /* ignore */ } } };
    const def = GAMES.find((g) => g.id === game)!;
    const g: Game = def.make(fx); gameRef.current = g;
    let W = 0, H = 0, raf = 0, last = 0, shown = '';
    let b = getBest(game), wasOver = false; setBest(b); setNewBest(false);
    const size = () => {
      const dpr = Math.min(window.devicePixelRatio || 1, 2), r = c.getBoundingClientRect();
      W = r.width; H = r.height; c.width = Math.round(W * dpr); c.height = Math.round(H * dpr); ctx.setTransform(dpr, 0, 0, dpr, 0, 0); g.resize(W, H);
    };
    const loop = (now: number) => {
      raf = requestAnimationFrame(loop);
      const dt = Math.min(3, (now - (last || now)) / 16.67); last = now;
      g.step(dt);
      ctx.clearRect(0, 0, W, H); g.draw(ctx);
      const s = g.state(); const key = `${s.score}|${s.over}|${s.info}`;
      if (key !== shown) {
        shown = key; setSt(s);
        if (s.over && !wasOver) { if (s.score > b) { b = s.score; localStorage.setItem(bestKey(game), String(b)); setBest(b); setNewBest(true); } }
        if (!s.over && wasOver) setNewBest(false);
        wasOver = s.over;
      }
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

  return (
    <Portal>
      <div className="kids" role="dialog" aria-modal="true" aria-label="Kids Zone" data-testid="kids-zone">
        <div className="kids-top">
          <button className="kids-x" aria-label="Exit Kids Zone (grown-ups)" onClick={() => setGate(true)} data-testid="kids-x"><svg viewBox="0 0 24 24" width="20" height="20" aria-hidden><path d="M6 6l12 12M18 6L6 18" stroke="currentColor" strokeWidth="2.6" strokeLinecap="round" /></svg></button>
          <div className="kids-tabs" role="tablist" aria-label="Games">
            {GAMES.map((g) => <button key={g.id} role="tab" aria-selected={game === g.id} className="kids-tab" onClick={() => setGame(g.id)} data-testid={`kids-${g.id}`}><span aria-hidden className="kids-emoji">{g.emoji}</span><span>{g.name}</span></button>)}
          </div>
        </div>
        <div className="kids-hint" data-testid="kids-hint">{st.info}</div>
        <canvas ref={cv} className="kids-canvas" data-game={game} data-testid="kids-canvas" />
        <div className="kids-bottom">
          <span className="kids-score" data-testid="kids-score"><b className="tnum">{st.score}</b><small>Best {Math.max(best, st.over ? 0 : best)}</small></span>
          <span className="grow" />
          <button className="kids-sound" onClick={() => { const v = !sound; setSound(v); localStorage.setItem('px:kids-sound', v ? 'on' : 'off'); }} aria-pressed={sound} aria-label={sound ? 'Sound on' : 'Sound off'}>{sound ? '🔊' : '🔇'}</button>
          <HoldExit onExit={onExit} />
        </div>
        {st.over && (
          <div className="kids-over" data-testid="kids-over">
            <div className="kids-over-card">
              <span className="kids-over-emoji" aria-hidden>{newBest ? '🏆' : '🌟'}</span>
              <b>{newBest ? 'New best!' : 'Great playing!'}</b>
              <span className="kids-over-score tnum" data-testid="kids-final">{st.score}</span>
              <span className="small">Best: {best}</span>
              <button className="kids-again" onClick={() => gameRef.current?.down({ x: 0, y: 0, id: -1 })} data-testid="kids-again">Play again</button>
            </div>
          </div>
        )}
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
