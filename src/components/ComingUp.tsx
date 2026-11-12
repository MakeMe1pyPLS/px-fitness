import React, { useState } from 'react';
import { Sheet, store, useData, useToast } from './core';
import { activeUpcoming, upcomingAdvice, KIND_LABEL, type UpcomingKind } from '../lib/upcoming';
import { addDays, formatShortDate, toDateKey } from '../lib/dates';

/** Today screen: what's coming up and how the plan flexes around it. */
export function ComingUpCard() {
  const data = useData();
  const [add, setAdd] = useState(false);
  const today = toDateKey(new Date());
  const list = activeUpcoming(data, today).filter((e) => e.date <= addDays(today, 30));
  const advice = upcomingAdvice(data, today);
  return (
    <section className="card stack" data-testid="coming-up">
      <div className="row-between">
        <h2 style={{ fontSize: 'var(--t-lg)' }}>Coming up</h2>
        <button className="btn btn-outline btn-sm" onClick={() => setAdd(true)} data-testid="add-upcoming">Add</button>
      </div>
      {advice && <p className="small" data-testid="upcoming-advice"><b>{advice.title}.</b> {advice.suggestShort || advice.rest ? 'Today’s workout is adjusted for it.' : advice.body}</p>}
      {list.length === 0 ? (
        <p className="small muted">Got a fight, a trip or a busy week ahead? Add it and your plan adjusts: tapering before competitions, short bodyweight sessions while travelling.</p>
      ) : (
        <ul className="plain-list">
          {list.map((e) => (
            <li key={e.id} className="row-between small" data-testid="upcoming-item">
              <span><b>{e.label || KIND_LABEL[e.kind]}</b> <span className="muted">· {formatShortDate(e.date)}{e.endDate ? `–${formatShortDate(e.endDate)}` : ''}</span></span>
              <button className="btn btn-ghost btn-sm" aria-label={`Remove ${e.label || KIND_LABEL[e.kind]}`} onClick={() => store.removeUpcoming(e.id)}>Remove</button>
            </li>
          ))}
        </ul>
      )}
      {add && <AddUpcomingSheet onClose={() => setAdd(false)} />}
    </section>
  );
}

export function AddUpcomingSheet({ onClose, initialKind = 'competition' }: { onClose: () => void; initialKind?: UpcomingKind }) {
  const toast = useToast();
  const today = toDateKey(new Date());
  const [f, setF] = useState({ kind: initialKind, label: '', date: addDays(today, 7), endDate: '' });
  const [err, setErr] = useState<string | null>(null);
  const ranged = f.kind === 'travel' || f.kind === 'busy';
  return (
    <Sheet title="What’s coming up?" onClose={onClose}>
      <form className="stack" onSubmit={(e) => {
        e.preventDefault();
        if (f.date < today) return setErr('Pick today or a later day.');
        if (f.endDate && f.endDate < f.date) return setErr('The last day is before the first day.');
        store.addUpcoming({ kind: f.kind, label: f.label, date: f.date, endDate: ranged ? f.endDate || undefined : undefined });
        toast('Added. Your plan will adjust around it.');
        onClose();
      }}>
        <div className="chips" role="radiogroup" aria-label="Type">
          {(Object.keys(KIND_LABEL) as UpcomingKind[]).map((k) => <button type="button" key={k} role="radio" aria-checked={f.kind === k} className={'chip' + (f.kind === k ? ' on' : '')} onClick={() => setF({ ...f, kind: k })} data-testid={`up-kind-${k}`}>{KIND_LABEL[k]}</button>)}
        </div>
        <div className="field"><label className="label" htmlFor="up-l">Name (optional)</label><input id="up-l" className="input" maxLength={60} placeholder={f.kind === 'competition' ? 'e.g. Golden Gloves, 5K, tryouts' : f.kind === 'travel' ? 'e.g. Trip to Philly' : 'e.g. Finals week'} value={f.label} onChange={(e) => setF({ ...f, label: e.target.value })} data-testid="up-label" /></div>
        <div className="row">
          <div className="field grow"><label className="label" htmlFor="up-d">{ranged ? 'First day' : 'Day'}</label><input id="up-d" className="input" type="date" min={today} value={f.date} onChange={(e) => setF({ ...f, date: e.target.value })} data-testid="up-date" /></div>
          {ranged && <div className="field grow"><label className="label" htmlFor="up-e">Last day</label><input id="up-e" className="input" type="date" min={f.date} value={f.endDate} onChange={(e) => setF({ ...f, endDate: e.target.value })} /></div>}
        </div>
        {err && <p className="form-error" role="alert">{err}</p>}
        <button className="btn btn-primary btn-block" data-testid="up-save">Save</button>
      </form>
    </Sheet>
  );
}
