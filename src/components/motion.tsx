import React, { useEffect, useLayoutEffect, useRef, useState } from 'react';
import { SPRINGS, prefersReduced, simulate, type SpringName } from '../lib/motion';

/**
 * CountUp: number lands with a spring.
 * Trigger: value changes or first mount. Start: previous value. Move: spring
 * (bouncy by default). Settle: exact value. Reduced motion: shows the value at once.
 * The real number is always in the accessible text; only the visual animates.
 */
export function CountUp({ value, format = (n: number) => String(Math.round(n)), spring = 'bouncy', delay = 0, testId }: { value: number; format?: (n: number) => string; spring?: SpringName; delay?: number; testId?: string }) {
  const [shown, setShown] = useState(() => (prefersReduced() ? value : 0));
  const from = useRef(prefersReduced() ? value : 0);
  useEffect(() => {
    if (prefersReduced()) { setShown(value); from.current = value; return; }
    const { pts, duration } = simulate(SPRINGS[spring]);
    const start = from.current;
    let raf = 0;
    let t0 = 0;
    const tick = (now: number) => {
      if (!t0) t0 = now + delay;
      const t = Math.max(0, (now - t0) / 1000);
      const p = pts.find((q) => q.t >= t)?.x ?? 1;
      setShown(start + (value - start) * p);
      if (t < duration) raf = requestAnimationFrame(tick);
      else { setShown(value); from.current = value; }
    };
    raf = requestAnimationFrame(tick);
    return () => { cancelAnimationFrame(raf); from.current = value; };
  }, [value, spring, delay]);
  return (
    <>
      <span aria-hidden className="tnum" data-testid={testId}>{format(shown)}</span>
      <span className="sr-only">{format(value)}</span>
    </>
  );
}

/** Progress ring: draws with the bouncy spring; done segments glow on completion. */
export function Ring({ value, max, size = 132, stroke = 12, label, children }: { value: number; max: number; size?: number; stroke?: number; label: string; children?: React.ReactNode }) {
  const r = (size - stroke) / 2;
  const circ = 2 * Math.PI * r;
  const pct = max ? Math.min(1, value / max) : 0;
  const [drawn, setDrawn] = useState(prefersReduced() ? pct : 0);
  useEffect(() => { const id = requestAnimationFrame(() => setDrawn(pct)); return () => cancelAnimationFrame(id); }, [pct]);
  return (
    <div className={'ring-wrap' + (pct >= 1 ? ' complete' : '')} style={{ width: size, height: size }} role="img" aria-label={label}>
      <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`} aria-hidden>
        <defs>
          <linearGradient id="ring-g" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stopColor="#ff8a3d" /><stop offset="1" stopColor="#ff4a14" /></linearGradient>
        </defs>
        <circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke="var(--line)" strokeWidth={stroke} />
        {Array.from({ length: max }, (_, i) => {
          // tick marks between goal segments
          const a = (i / max) * 2 * Math.PI - Math.PI / 2;
          return max > 1 ? <line key={i} x1={size / 2 + Math.cos(a) * (r - stroke / 2)} y1={size / 2 + Math.sin(a) * (r - stroke / 2)} x2={size / 2 + Math.cos(a) * (r + stroke / 2)} y2={size / 2 + Math.sin(a) * (r + stroke / 2)} stroke="var(--chalk)" strokeWidth="3" /> : null;
        })}
        <circle className="ring-val" cx={size / 2} cy={size / 2} r={r} fill="none" stroke="url(#ring-g)" strokeWidth={stroke} strokeLinecap="round"
          strokeDasharray={circ} strokeDashoffset={circ * (1 - drawn)} transform={`rotate(-90 ${size / 2} ${size / 2})`} />
      </svg>
      <div className="ring-center">{children}</div>
    </div>
  );
}

/**
 * Reveal: cards rise in with a staggered spring.
 * Above-the-fold cards animate on mount (stagger by index); cards further down
 * animate when they scroll into view. Reduced motion: opacity only.
 */
export function Reveal({ i = 0, children, className = '', as: Tag = 'div', ...rest }: { i?: number; children: React.ReactNode; className?: string; as?: 'div' | 'section' | 'article' } & React.HTMLAttributes<HTMLElement>) {
  const ref = useRef<HTMLElement>(null);
  const [inView, setInView] = useState(false);
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    if (typeof IntersectionObserver === 'undefined') { setInView(true); return; }
    const io = new IntersectionObserver((es) => { if (es.some((e) => e.isIntersecting)) { setInView(true); io.disconnect(); } }, { rootMargin: '0px 0px -8% 0px' });
    io.observe(el);
    return () => io.disconnect();
  }, []);
  const T = Tag as 'div';
  return <T ref={ref as React.RefObject<HTMLDivElement>} className={'reveal ' + (inView ? 'in ' : '') + className} style={{ ['--i' as string]: Math.min(i, 8) }} {...rest}>{children}</T>;
}

/**
 * Segmented picker with a sliding indicator (layout animation).
 * Trigger: selection. Start: old option's box. Move: snappy spring on x/width.
 * Settle: new option. The indicator is decorative; options are real radios.
 */
export function SlidingPicker<T extends string>({ options, value, onChange, label, testPrefix }: { options: { id: T; label: string; icon?: React.ReactNode }[]; value: T | undefined; onChange: (v: T) => void; label: string; testPrefix?: string }) {
  const wrap = useRef<HTMLDivElement>(null);
  const [box, setBox] = useState<{ x: number; w: number } | null>(null);
  useLayoutEffect(() => {
    const el = wrap.current?.querySelector<HTMLElement>(`[data-id="${value}"]`);
    if (!el) { setBox(null); return; }
    const measure = () => setBox({ x: el.offsetLeft, w: el.offsetWidth });
    measure();
    window.addEventListener('resize', measure);
    return () => window.removeEventListener('resize', measure);
  }, [value]);
  return (
    <div className="picker" ref={wrap} role="radiogroup" aria-label={label}>
      {box && <span className="picker-ind" aria-hidden style={{ transform: `translateX(${box.x}px)`, width: box.w }} />}
      {options.map((o) => (
        <button key={o.id} type="button" role="radio" aria-checked={value === o.id} data-id={o.id} className="picker-opt" onClick={() => onChange(o.id)} data-testid={testPrefix ? `${testPrefix}-${o.id}` : undefined}>
          {o.icon}<span>{o.label}</span>
        </button>
      ))}
    </div>
  );
}
