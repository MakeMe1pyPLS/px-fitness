import React, { createContext, useCallback, useContext, useEffect, useRef, useState, useSyncExternalStore } from 'react';
import { createPortal } from 'react-dom';

/** Overlays render at the document root so no ancestor transform can offset them. */
export const Portal = ({ children }: { children: React.ReactNode }) => (typeof document === 'undefined' ? <>{children}</> : createPortal(children, document.body));
import { Store } from '../lib/store';
import { Cloud } from '../lib/cloud';

// ── Store binding ─────────────────────────────────────────────────────────
export const store = new Store();
(globalThis as unknown as { __kova?: Store }).__kova = store; // handy for e2e inspection
export const cloud = new Cloud(store);
(globalThis as unknown as { __cloud?: Cloud }).__cloud = cloud;

export function useData() {
  return useSyncExternalStore(store.subscribe, store.get, store.get);
}

export function useCloud() {
  return useSyncExternalStore(cloud.subscribe, cloud.get, cloud.get);
}

// ── Routing (hash names only: works inside sandboxed hosts) ───────────────
export type Route = 'welcome' | 'onboarding' | 'home' | 'workout' | 'progress' | 'insights' | 'you' | 'diet' | 'diet-meals' | 'diet-prep' | 'diet-budget' | 'diet-grocery' | 'diet-near' | 'diet-prefs' | 'diet-saved' | 'coach' | 'biz' | 'biz-clients' | 'biz-schedule' | 'biz-pay' | 'biz-setup';
const ROUTES: Route[] = ['welcome', 'onboarding', 'home', 'workout', 'progress', 'insights', 'you', 'diet', 'diet-meals', 'diet-prep', 'diet-budget', 'diet-grocery', 'diet-near', 'diet-prefs', 'diet-saved', 'coach', 'biz', 'biz-clients', 'biz-schedule', 'biz-pay', 'biz-setup'];

export function useRoute(fallback: Route): [Route, (r: Route) => void] {
  const read = () => {
    const h = (typeof location !== 'undefined' ? location.hash.slice(1) : '') as Route;
    return ROUTES.includes(h) ? h : fallback;
  };
  const [route, setRoute] = useState<Route>(read);
  useEffect(() => {
    const on = () => setRoute(read());
    window.addEventListener('hashchange', on);
    return () => window.removeEventListener('hashchange', on);
  });
  const go = useCallback((r: Route) => {
    if (location.hash.slice(1) !== r) location.hash = r;
    setRoute(r);
    window.scrollTo({ top: 0 });
  }, []);
  return [route, go];
}

// ── Time ──────────────────────────────────────────────────────────────────
export function useNow(intervalMs = 1000) {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), intervalMs);
    return () => clearInterval(id);
  }, [intervalMs]);
  return now;
}

export function fmtClock(totalSeconds: number) {
  const s = Math.max(0, Math.floor(totalSeconds));
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  const ss = String(s % 60).padStart(2, '0');
  return h ? `${h}:${String(m).padStart(2, '0')}:${ss}` : `${m}:${ss}`;
}

export function haptic(ms = 10) {
  try { navigator.vibrate?.(ms); } catch { /* unsupported */ }
}

// ── Toast ─────────────────────────────────────────────────────────────────
const ToastCtx = createContext<(msg: string) => void>(() => {});
export const useToast = () => useContext(ToastCtx);

export function ToastProvider({ children }: { children: React.ReactNode }) {
  const [msg, setMsg] = useState<{ text: string; key: number } | null>(null);
  const timer = useRef<ReturnType<typeof setTimeout>>();
  const show = useCallback((text: string) => {
    clearTimeout(timer.current);
    setMsg({ text, key: Date.now() });
    timer.current = setTimeout(() => setMsg(null), 2600);
  }, []);
  return (
    <ToastCtx.Provider value={show}>
      {children}
      <div aria-live="polite" className="sr-only">{msg?.text}</div>
      {msg && <div key={msg.key} className="toast" role="status">{msg.text}</div>}
    </ToastCtx.Provider>
  );
}

// ── Sheet & dialog ────────────────────────────────────────────────────────
function useEscape(onClose: () => void) {
  useEffect(() => {
    const k = (e: KeyboardEvent) => e.key === 'Escape' && onClose();
    window.addEventListener('keydown', k);
    return () => window.removeEventListener('keydown', k);
  }, [onClose]);
}

function useFocusTrap(ref: React.RefObject<HTMLElement>) {
  useEffect(() => {
    const prev = document.activeElement as HTMLElement | null;
    const el = ref.current;
    const first = el?.querySelector<HTMLElement>('button, [href], input, textarea, select, [tabindex]:not([tabindex="-1"])');
    (first ?? el)?.focus({ preventScroll: true });
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== 'Tab' || !el) return;
      const items = [...el.querySelectorAll<HTMLElement>('button:not([disabled]), [href], input, textarea, select, [tabindex]:not([tabindex="-1"])')];
      if (!items.length) return;
      const a = items[0], b = items[items.length - 1];
      if (e.shiftKey && document.activeElement === a) { e.preventDefault(); b.focus(); }
      else if (!e.shiftKey && document.activeElement === b) { e.preventDefault(); a.focus(); }
    };
    el?.addEventListener('keydown', onKey);
    return () => { el?.removeEventListener('keydown', onKey); prev?.focus?.({ preventScroll: true }); };
  }, [ref]);
}

export function Sheet({ title, onClose, children, dark, label }: { title?: string; onClose: () => void; children: React.ReactNode; dark?: boolean; label?: string }) {
  const ref = useRef<HTMLDivElement>(null);
  useEscape(onClose);
  useFocusTrap(ref);
  useEffect(() => {
    const o = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => { document.body.style.overflow = o; };
  }, []);
  return (
    <Portal>
      <div className="scrim" onClick={onClose} />
      <div ref={ref} className={'sheet' + (dark ? ' dark' : '')} role="dialog" aria-modal="true" aria-label={label ?? title} tabIndex={-1}>
        <div className="grabber" aria-hidden />
        {title && <h2 className="sheet-title display">{title}</h2>}
        {children}
      </div>
    </Portal>
  );
}

export function ConfirmDialog({ title, body, confirmLabel, danger, onConfirm, onCancel }: { title: string; body: string; confirmLabel: string; danger?: boolean; onConfirm: () => void; onCancel: () => void }) {
  const ref = useRef<HTMLDivElement>(null);
  useEscape(onCancel);
  useFocusTrap(ref);
  return (
    <Portal>
      <div className="scrim dialog-scrim" style={{ zIndex: 60 }} onClick={onCancel} />
      <div ref={ref} className="dialog stack" role="alertdialog" aria-modal="true" aria-labelledby="dlg-t" aria-describedby="dlg-b">
        <h2 id="dlg-t" className="display" style={{ fontSize: 'var(--t-xl)' }}>{title}</h2>
        <p id="dlg-b" className="muted">{body}</p>
        <div className="row" style={{ justifyContent: 'flex-end', marginTop: 8 }}>
          <button className="btn btn-ghost" onClick={onCancel}>Cancel</button>
          <button className={'btn ' + (danger ? 'btn-danger' : 'btn-ink')} onClick={onConfirm}>{confirmLabel}</button>
        </div>
      </div>
    </Portal>
  );
}

// ── Inputs ────────────────────────────────────────────────────────────────
export function Switch({ checked, onChange, label }: { checked: boolean; onChange: (v: boolean) => void; label: string }) {
  return <button type="button" role="switch" aria-checked={checked} aria-label={label} className="switch" onClick={() => onChange(!checked)} />;
}

export function Scale({ value, onChange, label, low, high, name }: { value?: number; onChange: (v: number | undefined) => void; label: string; low: string; high: string; name: string }) {
  return (
    <div className="field" role="radiogroup" aria-label={label}>
      <div className="label">{label}</div>
      <div className="scale">
        {[1, 2, 3, 4, 5].map((n) => (
          <button key={n} type="button" role="radio" aria-checked={value === n} aria-label={`${label} ${n} of 5`} data-testid={`${name}-${n}`} className="chip" onClick={() => onChange(value === n ? undefined : n)}>{n}</button>
        ))}
      </div>
      <div className="scale-labels" aria-hidden><span>{low}</span><span>{high}</span></div>
    </div>
  );
}

// ── Icons (original, 24px grid, 2px stroke) ───────────────────────────────
const P = { fill: 'none', stroke: 'currentColor', strokeWidth: 2, strokeLinecap: 'round' as const, strokeLinejoin: 'round' as const };
export const Icon = {
  today: (p: { size?: number }) => <svg width={p.size ?? 24} height={p.size ?? 24} viewBox="0 0 24 24" aria-hidden><rect x="4" y="5" width="4" height="14" rx="1.5" {...P} /><rect x="10" y="9" width="4" height="10" rx="1.5" {...P} /><rect x="16" y="3" width="4" height="16" rx="1.5" {...P} /></svg>,
  progress: (p: { size?: number }) => <svg width={p.size ?? 24} height={p.size ?? 24} viewBox="0 0 24 24" aria-hidden><path d="M3 19h18" {...P} /><path d="M4 15l5-5 4 3 7-7" {...P} /><path d="M15 6h5v5" {...P} /></svg>,
  insight: (p: { size?: number }) => <svg width={p.size ?? 24} height={p.size ?? 24} viewBox="0 0 24 24" aria-hidden><circle cx="7" cy="16" r="3" {...P} /><circle cx="17" cy="8" r="3" {...P} /><path d="M9.5 14l5-4" {...P} strokeDasharray="2 2.5" /></svg>,
  you: (p: { size?: number }) => <svg width={p.size ?? 24} height={p.size ?? 24} viewBox="0 0 24 24" aria-hidden><circle cx="12" cy="8" r="4" {...P} /><path d="M4 21c1.5-4 4.5-6 8-6s6.5 2 8 6" {...P} /></svg>,
  check: (p: { size?: number }) => <svg width={p.size ?? 22} height={p.size ?? 22} viewBox="0 0 24 24" aria-hidden><path d="M5 12.5l4.5 4.5L19 7.5" {...P} strokeWidth={3} /></svg>,
  close: (p: { size?: number }) => <svg width={p.size ?? 22} height={p.size ?? 22} viewBox="0 0 24 24" aria-hidden><path d="M6 6l12 12M18 6L6 18" {...P} /></svg>,
  plus: (p: { size?: number }) => <svg width={p.size ?? 20} height={p.size ?? 20} viewBox="0 0 24 24" aria-hidden><path d="M12 5v14M5 12h14" {...P} /></svg>,
  swap: (p: { size?: number }) => <svg width={p.size ?? 20} height={p.size ?? 20} viewBox="0 0 24 24" aria-hidden><path d="M7 4L3 8l4 4" {...P} /><path d="M3 8h14" {...P} /><path d="M17 20l4-4-4-4" {...P} /><path d="M21 16H7" {...P} /></svg>,
  back: (p: { size?: number }) => <svg width={p.size ?? 22} height={p.size ?? 22} viewBox="0 0 24 24" aria-hidden><path d="M15 5l-7 7 7 7" {...P} /></svg>,
  more: (p: { size?: number }) => <svg width={p.size ?? 22} height={p.size ?? 22} viewBox="0 0 24 24" aria-hidden><circle cx="5" cy="12" r="1.6" fill="currentColor" /><circle cx="12" cy="12" r="1.6" fill="currentColor" /><circle cx="19" cy="12" r="1.6" fill="currentColor" /></svg>,
  trash: (p: { size?: number }) => <svg width={p.size ?? 18} height={p.size ?? 18} viewBox="0 0 24 24" aria-hidden><path d="M4 7h16M9 7V4h6v3M6 7l1 13h10l1-13" {...P} /></svg>,
  bolt: (p: { size?: number }) => <svg width={p.size ?? 18} height={p.size ?? 18} viewBox="0 0 24 24" aria-hidden><path d="M13 3L5 14h6l-1 7 8-11h-6l1-7z" {...P} /></svg>,
  diet: (p: { size?: number }) => <svg width={p.size ?? 24} height={p.size ?? 24} viewBox="0 0 24 24" aria-hidden><path d="M3 12h18a9 9 0 0 1-18 0z" {...P} /><path d="M8 8c0-2 2-2 2-4M13 8c0-2 2-2 2-4" {...P} /></svg>,
  pin: (p: { size?: number }) => <svg width={p.size ?? 20} height={p.size ?? 20} viewBox="0 0 24 24" aria-hidden><path d="M12 21s-7-6.5-7-12a7 7 0 0 1 14 0c0 5.5-7 12-7 12z" {...P} /><circle cx="12" cy="9" r="2.5" {...P} /></svg>,
  cart: (p: { size?: number }) => <svg width={p.size ?? 20} height={p.size ?? 20} viewBox="0 0 24 24" aria-hidden><path d="M3 4h2l2.5 11h11L21 8H7" {...P} /><circle cx="9" cy="19" r="1.5" {...P} /><circle cx="17" cy="19" r="1.5" {...P} /></svg>,
  shuffle: (p: { size?: number }) => <svg width={p.size ?? 20} height={p.size ?? 20} viewBox="0 0 24 24" aria-hidden><path d="M3 7h4l10 10h4M3 17h4l3-3M14 10l3-3h4M18 4l3 3-3 3M18 14l3 3-3 3" {...P} /></svg>,
  star: (p: { size?: number; filled?: boolean }) => <svg width={p.size ?? 20} height={p.size ?? 20} viewBox="0 0 24 24" aria-hidden><path d="M12 3l2.7 5.6 6.1.9-4.4 4.3 1 6.1L12 17l-5.4 2.9 1-6.1-4.4-4.3 6.1-.9z" {...P} fill={p.filled ? 'currentColor' : 'none'} /></svg>,
  desk: (p: { size?: number }) => <svg width={p.size ?? 24} height={p.size ?? 24} viewBox="0 0 24 24" aria-hidden><rect x="3" y="7" width="18" height="13" rx="2" {...P} /><path d="M9 7V5h6v2M3 12h18" {...P} /></svg>,
  people: (p: { size?: number }) => <svg width={p.size ?? 24} height={p.size ?? 24} viewBox="0 0 24 24" aria-hidden><circle cx="9" cy="8" r="3.5" {...P} /><path d="M2.5 20c.8-3.5 3.4-5.5 6.5-5.5s5.7 2 6.5 5.5" {...P} /><path d="M16 4.5a3.5 3.5 0 0 1 0 7M18 14.5c1.8.7 3 2.6 3.5 5.5" {...P} /></svg>,
  calendar: (p: { size?: number }) => <svg width={p.size ?? 24} height={p.size ?? 24} viewBox="0 0 24 24" aria-hidden><rect x="3" y="5" width="18" height="16" rx="2" {...P} /><path d="M3 10h18M8 3v4M16 3v4" {...P} /></svg>,
  money: (p: { size?: number }) => <svg width={p.size ?? 24} height={p.size ?? 24} viewBox="0 0 24 24" aria-hidden><rect x="2.5" y="6" width="19" height="12" rx="2" {...P} /><circle cx="12" cy="12" r="2.5" {...P} /></svg>,
  gear: (p: { size?: number }) => <svg width={p.size ?? 24} height={p.size ?? 24} viewBox="0 0 24 24" aria-hidden><circle cx="12" cy="12" r="3" {...P} /><path d="M12 2.5v3M12 18.5v3M2.5 12h3M18.5 12h3M5.3 5.3l2.1 2.1M16.6 16.6l2.1 2.1M5.3 18.7l2.1-2.1M16.6 7.4l2.1-2.1" {...P} /></svg>,
  arrow: (p: { size?: number }) => <svg width={p.size ?? 20} height={p.size ?? 20} viewBox="0 0 24 24" aria-hidden><path d="M5 12h14M13 6l6 6-6 6" {...P} /></svg>,
};
