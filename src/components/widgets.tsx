import React, { useState } from 'react';
import { addDays, DAY_SHORT, formatShortDate, toDateKey, weekStart } from '../lib/dates';
import { dayOutcome, type DayOutcome } from '../lib/stats';
import type { AppData, SkipReason } from '../lib/types';
import { Scale, Sheet, store, useToast } from './core';

// ── Week strip ────────────────────────────────────────────────────────────
const STATE_LABEL: Record<DayOutcome, string> = { done: 'trained', extra: 'bonus session', pending: 'planned', skipped: 'skipped', missed: 'not logged', rest: 'rest day', before: 'before you started' };

export function WeekStrip({ data, offsetWeeks = 0 }: { data: AppData; offsetWeeks?: number }) {
  const today = toDateKey(new Date());
  const start = addDays(weekStart(today), -7 * offsetWeeks);
  const days = Array.from({ length: 7 }, (_, i) => addDays(start, i));
  return (
    <div className="week" role="list" aria-label="This week">
      {days.map((d, i) => {
        const state = d > today ? (dayOutcome(data, d, today) === 'rest' ? 'rest' : 'pending') : dayOutcome(data, d, today);
        return (
          <div key={d} className="day" role="listitem" data-today={d === today} aria-label={`${DAY_SHORT[(i + 1) % 7]} ${formatShortDate(d)}: ${STATE_LABEL[state]}`}>
            <div className="day-cell" data-state={state}>{(state === 'done' || state === 'extra') && <span className="fill" style={{ animationDelay: `${i * 40}ms` }} />}</div>
            <span className="day-label" aria-hidden>{DAY_SHORT[(i + 1) % 7].slice(0, 2)}</span>
          </div>
        );
      })}
    </div>
  );
}

export function WeekLegend() {
  return (
    <div className="legend" aria-hidden>
      <span><i style={{ background: 'var(--ember)', borderColor: 'var(--ember)' }} />Trained</span>
      <span><i style={{ borderStyle: 'dashed', borderColor: 'var(--ink)' }} />Planned</span>
      <span><i style={{ background: 'repeating-linear-gradient(135deg, transparent 0 3px, var(--line-strong) 3px 4.5px)' }} />Skipped</span>
      <span><i style={{ background: 'var(--ink)', borderColor: 'var(--ink)' }} />Bonus</span>
    </div>
  );
}

// ── Charts (hand-rolled SVG: no chart library weight) ─────────────────────
export function PairBars({ data, height = 140, label }: { data: { label: string; a: number; b: number }[]; height?: number; label: string }) {
  const w = 320, padB = 18, padT = 6;
  const max = Math.max(1, ...data.map((d) => Math.max(d.a, d.b)));
  const slot = w / data.length;
  const bw = Math.min(14, slot / 3);
  const y = (v: number) => padT + (height - padB - padT) * (1 - v / max);
  return (
    <svg className="chart" viewBox={`0 0 ${w} ${height}`} role="img" aria-label={label}>
      {[0.5, 1].map((t) => <line key={t} className="grid" x1="0" x2={w} y1={y(max * t)} y2={y(max * t)} />)}
      {data.map((d, i) => {
        const cx = slot * i + slot / 2;
        return (
          <g key={i}>
            <rect className="bar" x={cx - bw - 1} y={y(d.a)} width={bw} height={Math.max(0, height - padB - y(d.a))} rx="3" fill="none" stroke="var(--ink)" strokeWidth="1.5" style={{ animationDelay: `${i * 30}ms` }} />
            <rect className="bar" x={cx + 1} y={y(d.b)} width={bw} height={Math.max(0, height - padB - y(d.b))} rx="3" fill="var(--ember)" style={{ animationDelay: `${i * 30 + 60}ms` }} />
            <text x={cx} y={height - 4} textAnchor="middle">{d.label}</text>
          </g>
        );
      })}
    </svg>
  );
}

export function Bars({ data, height = 120, label, format = (v: number) => String(v) }: { data: { label: string; v: number }[]; height?: number; label: string; format?: (v: number) => string }) {
  const w = 320, padB = 18, padT = 14;
  const max = Math.max(1, ...data.map((d) => d.v));
  const slot = w / data.length;
  const bw = Math.min(22, slot * 0.55);
  const y = (v: number) => padT + (height - padB - padT) * (1 - v / max);
  const last = data.length - 1;
  return (
    <svg className="chart" viewBox={`0 0 ${w} ${height}`} role="img" aria-label={label}>
      {data.map((d, i) => {
        const cx = slot * i + slot / 2;
        return (
          <g key={i}>
            <rect className="bar" x={cx - bw / 2} y={y(d.v)} width={bw} height={Math.max(d.v ? 2 : 0, height - padB - y(d.v))} rx="3" fill={i === last ? 'var(--ember)' : 'var(--ink)'} style={{ animationDelay: `${i * 30}ms` }} />
            {i === last && d.v > 0 && <text x={cx} y={y(d.v) - 4} textAnchor="middle" style={{ fill: 'var(--ink)' }}>{format(d.v)}</text>}
            <text x={cx} y={height - 4} textAnchor="middle">{d.label}</text>
          </g>
        );
      })}
    </svg>
  );
}

export function LineChart({ points, height = 140, label, yLabel, min, max }: { points: { x: string; y: number | null }[]; height?: number; label: string; yLabel?: (v: number) => string; min?: number; max?: number }) {
  const w = 320, padL = 26, padB = 18, padT = 10, padR = 8;
  const vals = points.map((p) => p.y).filter((v): v is number => v !== null);
  if (!vals.length) return <p className="muted small">Nothing logged in this range yet.</p>;
  const lo = min ?? Math.min(...vals), hi = max ?? Math.max(...vals);
  const span = hi - lo || 1;
  const x = (i: number) => padL + ((w - padL - padR) * i) / Math.max(1, points.length - 1);
  const y = (v: number) => padT + (height - padB - padT) * (1 - (v - lo) / span);
  const segs: string[] = [];
  let cur = '';
  points.forEach((p, i) => {
    if (p.y === null) { if (cur) segs.push(cur); cur = ''; return; }
    cur += (cur ? 'L' : 'M') + x(i).toFixed(1) + ' ' + y(p.y).toFixed(1);
  });
  if (cur) segs.push(cur);
  const fmt = yLabel ?? ((v: number) => String(Math.round(v)));
  const every = Math.ceil(points.length / 6);
  const tick = (i: number) => points.length <= 8 || i === points.length - 1 || (i % every === 0 && points.length - 1 - i >= every / 2);
  return (
    <svg className="chart" viewBox={`0 0 ${w} ${height}`} role="img" aria-label={label}>
      {[lo, (lo + hi) / 2, hi].map((v, i) => (
        <g key={i}><line className="grid" x1={padL} x2={w - padR} y1={y(v)} y2={y(v)} /><text x={padL - 4} y={y(v) + 3} textAnchor="end">{fmt(v)}</text></g>
      ))}
      {segs.map((d, i) => <path key={i} className="line" d={d} style={{ ['--len' as string]: 1200 }} />)}
      {points.map((p, i) => p.y !== null && <circle key={i} cx={x(i)} cy={y(p.y)} r={i === points.length - 1 ? 4.5 : 3} fill={i === points.length - 1 ? 'var(--ember)' : 'var(--ink)'} />)}
      {points.map((p, i) => tick(i) && <text key={'t' + i} x={x(i)} y={height - 4} textAnchor="middle">{p.x}</text>)}
    </svg>
  );
}

// ── Check-in sheet ────────────────────────────────────────────────────────
export function CheckinSheet({ data, date, onClose }: { data: AppData; date: string; onClose: () => void }) {
  const c = data.checkins.find((x) => x.date === date);
  const toast = useToast();
  const set = (patch: Parameters<typeof store.saveCheckin>[1]) => store.saveCheckin(date, patch);
  const [note, setNote] = useState(c?.note ?? '');
  const isToday = date === toDateKey(new Date());
  return (
    <Sheet title={isToday ? 'Daily check-in' : `Check-in · ${formatShortDate(date)}`} onClose={onClose}>
      <p className="muted small" style={{ marginBottom: 16 }}>Everything is optional and saves as you tap. It’s used only to adjust suggestions and look for patterns in your own log.</p>
      <div className="stack-lg">
        <Scale name="energy" label="Energy" low="Drained" high="Charged" value={c?.energy} onChange={(v) => set({ energy: v })} />
        <Scale name="mood" label="Mood" low="Low" high="Great" value={c?.mood} onChange={(v) => set({ mood: v })} />
        <Scale name="stress" label="Stress" low="Calm" high="Very stressed" value={c?.stress} onChange={(v) => set({ stress: v })} />
        <Scale name="soreness" label="Soreness" low="None" high="Very sore" value={c?.soreness} onChange={(v) => set({ soreness: v })} />
        <div className="field">
          <div className="label" id="sleep-l">Sleep last night</div>
          <div className="chips" role="radiogroup" aria-labelledby="sleep-l">
            {[5, 6, 7, 8, 9].map((h) => (
              <button key={h} type="button" role="radio" aria-checked={c?.sleepHours === h} data-testid={`sleep-${h}`} className="chip" onClick={() => set({ sleepHours: c?.sleepHours === h ? undefined : h })}>{h === 5 ? '≤5 h' : h === 9 ? '9+ h' : `${h} h`}</button>
            ))}
          </div>
        </div>
        <div className="field">
          <div className="label" id="time-l">Time for training today</div>
          <div className="chips" role="radiogroup" aria-labelledby="time-l">
            {[10, 20, 30, 45, 60].map((m) => (
              <button key={m} type="button" role="radio" aria-checked={c?.availableMinutes === m} data-testid={`time-${m}`} className="chip" onClick={() => set({ availableMinutes: c?.availableMinutes === m ? undefined : m })}>{m === 60 ? '60+ min' : `${m} min`}</button>
            ))}
          </div>
        </div>
        <div className="field">
          <label className="label" htmlFor="ci-note">Note <span className="muted">(optional)</span></label>
          <textarea id="ci-note" className="textarea" value={note} onChange={(e) => setNote(e.target.value)} onBlur={() => set({ note: note.trim() || undefined })} placeholder="Anything worth remembering about today" />
        </div>
        <div className="row-between">
          {c ? <button className="btn btn-ghost btn-sm" onClick={() => { store.deleteCheckin(date); toast('Check-in cleared'); onClose(); }}>Clear this check-in</button> : <span />}
          <button className="btn btn-ink" data-testid="checkin-done" onClick={() => { set({ note: note.trim() || undefined }); toast('Check-in saved'); onClose(); }}>Done</button>
        </div>
      </div>
    </Sheet>
  );
}

// ── Skip sheet ────────────────────────────────────────────────────────────
const REASONS: { id: SkipReason; label: string }[] = [
  { id: 'time', label: 'Not enough time' },
  { id: 'energy', label: 'Low energy' },
  { id: 'sore', label: 'Too sore' },
  { id: 'unwell', label: 'Feeling unwell' },
  { id: 'motivation', label: 'Not motivated' },
  { id: 'other', label: 'Something else' },
];

export function SkipSheet({ date, onClose }: { date: string; onClose: () => void }) {
  const [reason, setReason] = useState<SkipReason | null>(null);
  const [note, setNote] = useState('');
  const toast = useToast();
  return (
    <Sheet title="Taking today off" onClose={onClose}>
      <p className="muted" style={{ marginBottom: 16 }}>That’s fine. Rest days are part of training. If you note why, the app can spot what gets in the way and suggest something that fits better.</p>
      <div className="stack-lg">
        <div className="chips" role="radiogroup" aria-label="Reason">
          {REASONS.map((r) => <button key={r.id} type="button" role="radio" aria-checked={reason === r.id} className="chip" data-testid={`skip-${r.id}`} onClick={() => setReason(r.id)}>{r.label}</button>)}
        </div>
        {reason === 'unwell' && <p className="small why-box">Rest up. If symptoms are severe or don’t improve, check with a medical professional.</p>}
        {reason === 'sore' && <p className="small why-box">Normal muscle soreness usually fades within a few days. Sharp pain or pain in a joint is different, so get that checked before training through it.</p>}
        <div className="field">
          <label className="label" htmlFor="skip-note">Note <span className="muted">(optional)</span></label>
          <input id="skip-note" className="input" value={note} onChange={(e) => setNote(e.target.value)} />
        </div>
        <button className="btn btn-ink btn-block btn-lg" disabled={!reason} data-testid="skip-save" onClick={() => { store.logSkip(date, reason!, note); toast('Logged. See you next session.'); onClose(); }}>Log rest day</button>
      </div>
    </Sheet>
  );
}

export function useWeekLabel() {
  return (week: string) => formatShortDate(week).replace(/ /, ' ');
}

export function Empty({ title, body, action }: { title: string; body: string; action?: React.ReactNode }) {
  return (
    <div className="empty card">
      <svg width="56" height="56" viewBox="0 0 56 56" aria-hidden><rect x="6" y="18" width="10" height="30" rx="3" fill="none" stroke="currentColor" strokeWidth="2" strokeDasharray="4 4" /><rect x="23" y="28" width="10" height="20" rx="3" fill="none" stroke="currentColor" strokeWidth="2" strokeDasharray="4 4" /><rect x="40" y="10" width="10" height="38" rx="3" fill="var(--ember)" /></svg>
      <h3 className="display" style={{ fontSize: 'var(--t-xl)' }}>{title}</h3>
      <p className="muted" style={{ maxWidth: '32ch' }}>{body}</p>
      {action}
    </div>
  );
}
