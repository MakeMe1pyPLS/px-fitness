import React, { useEffect, useMemo, useRef, useState } from 'react';
import { ConfirmDialog, Icon, Sheet, fmtClock, haptic, store, useData, useNow, useToast, type Route } from '../components/core';
import { activeSession } from '../lib/planner';
import { allExercises, availableSubstitutes, getExercise } from '../lib/exercises';
import { lastPerformance, newRecordsIn, sessionVolume, setsDone } from '../lib/stats';
import { minutesBetween } from '../lib/dates';
import type { AppData, Exercise, Session, SetEntry } from '../lib/types';

const REST_DEFAULT = { weight_reps: 90, reps: 60, time: 45 } as const;

function fmtSet(s: SetEntry | undefined, unit: string) {
  if (!s) return '—';
  if (s.seconds) return `${s.seconds}s`;
  if (s.weight && s.reps) return `${s.weight}${unit === 'kg' ? 'kg' : ''}×${s.reps}`;
  if (s.reps) return `${s.reps} reps`;
  return '—';
}

export function Workout({ go, onComplete }: { go: (r: Route) => void; onComplete: (id: string) => void }) {
  const data = useData();
  const s = activeSession(data);
  const now = useNow(1000);
  const toast = useToast();
  const [rest, setRest] = useState<{ until: number; total: number } | null>(null);
  const [sheet, setSheet] = useState<{ kind: 'swap' | 'add' | 'finish' | 'menu'; exIdx?: number } | null>(null);
  const [confirmEnd, setConfirmEnd] = useState(false);
  const restAlerted = useRef(false);

  const remaining = rest ? Math.ceil((rest.until - now) / 1000) : 0;
  useEffect(() => {
    if (rest && remaining <= 0 && !restAlerted.current) { restAlerted.current = true; haptic(200); }
  }, [rest, remaining]);

  if (!s) {
    return (
      <div className="workout" style={{ display: 'grid', placeItems: 'center', padding: 24 }}>
        <div className="stack" style={{ textAlign: 'center' }}>
          <p>No workout in progress.</p>
          <button className="btn btn-primary" onClick={() => go('home')}>Back to today</button>
        </div>
      </div>
    );
  }

  const total = s.exercises.reduce((n, e) => n + e.sets.length, 0);
  const done = setsDone(s);
  const elapsed = (now - new Date(s.startedAt).getTime()) / 1000;

  const startRest = (seconds: number) => {
    restAlerted.current = false;
    setRest({ until: Date.now() + seconds * 1000, total: seconds });
  };

  return (
    <div className="workout">
      <header className="workout-head vt-workout">
        <button className="icon-btn" aria-label="Minimize workout (it keeps running)" onClick={() => go('home')}><Icon.back /></button>
        <div style={{ textAlign: 'center' }}>
          <div className="small muted" style={{ fontWeight: 700 }}>{s.name}</div>
          <div className="clock" aria-label={`Elapsed ${fmtClock(elapsed)}`} role="timer">{fmtClock(elapsed)}</div>
        </div>
        <button className="icon-btn" aria-label="Workout options" onClick={() => setSheet({ kind: 'menu' })} data-testid="wk-menu"><Icon.more /></button>
      </header>
      <div style={{ padding: '0 16px' }}>
        <div className="progress-track" role="progressbar" aria-valuemin={0} aria-valuemax={total} aria-valuenow={done} aria-label="Sets completed"><div className="progress-fill" style={{ width: `${total ? (done / total) * 100 : 0}%` }} /></div>
        <p className="small muted" style={{ marginTop: 6 }}><span className="tnum">{done}</span> of {total} sets</p>
      </div>

      <div className="stack" style={{ padding: 16, gap: 14 }}>
        {s.exercises.map((e, exIdx) => (
          <ExerciseCard key={exIdx + e.exerciseId} data={data} session={s} exIdx={exIdx} onSetDone={(ex) => startRest(REST_DEFAULT[ex.metric])} onSwap={() => setSheet({ kind: 'swap', exIdx })} />
        ))}
        <button className="btn ghost-dark btn-block" onClick={() => setSheet({ kind: 'add' })} data-testid="add-exercise"><Icon.plus /> Add exercise</button>
      </div>

      {rest && remaining > -3 ? (
        <div className="rest-bar" role="region" aria-label="Rest timer">
          <div className="row-between">
            <div>
              <div className="eyebrow" style={{ color: 'var(--night-ink-2)' }}>{remaining > 0 ? 'Rest' : 'Rest over'}</div>
              <div className="rest-time" role="timer" aria-live="off">{remaining > 0 ? fmtClock(remaining) : 'Go'}</div>
            </div>
            <div className="row">
              <button className="btn ghost-dark btn-sm" onClick={() => setRest({ ...rest, until: rest.until - 15000 })} aria-label="Subtract 15 seconds">−15</button>
              <button className="btn ghost-dark btn-sm" onClick={() => setRest({ ...rest, until: rest.until + 15000 })} aria-label="Add 15 seconds">+15</button>
              <button className="btn btn-primary btn-sm" onClick={() => setRest(null)} data-testid="rest-skip">{remaining > 0 ? 'Skip' : 'Close'}</button>
            </div>
          </div>
          <div className="progress-track" style={{ marginTop: 10 }}><div className="progress-fill" style={{ width: `${Math.max(0, Math.min(100, (remaining / rest.total) * 100))}%`, transition: 'width 1s linear' }} /></div>
        </div>
      ) : (
        <div className="finish-bar">
          <button className="btn btn-primary btn-lg btn-block" onClick={() => setSheet({ kind: 'finish' })} data-testid="finish">Finish workout</button>
        </div>
      )}

      {sheet?.kind === 'menu' && (
        <Sheet title="Workout" onClose={() => setSheet(null)} dark>
          <div className="stack">
            <button className="btn ghost-dark btn-block" onClick={() => setSheet({ kind: 'add' })}><Icon.plus /> Add exercise</button>
            <button className="btn ghost-dark btn-block" onClick={() => { setSheet(null); setConfirmEnd(true); }} data-testid="end-early">End without finishing</button>
          </div>
        </Sheet>
      )}
      {sheet?.kind === 'swap' && sheet.exIdx !== undefined && (
        <PickSheet title="Swap exercise" data={data} options={availableSubstitutes(s.exercises[sheet.exIdx].exerciseId, data.profile!.equipment, data.customExercises)} onClose={() => setSheet(null)}
          onPick={(id) => { store.swapExercise(s.id, sheet.exIdx!, id); setSheet(null); toast(`Swapped to ${getExercise(id, data.customExercises)?.name}`); }} />
      )}
      {sheet?.kind === 'add' && (
        <PickSheet title="Add exercise" data={data} options={allExercises(data.customExercises)} onClose={() => setSheet(null)}
          onPick={(id) => { store.addExercise(s.id, id); setSheet(null); }} search />
      )}
      {sheet?.kind === 'finish' && <FinishSheet s={s} total={total} done={done} onClose={() => setSheet(null)} onSave={(effort, note) => { store.finishSession(s.id, effort, note); onComplete(s.id); }} />}
      {confirmEnd && (
        <ConfirmDialog title="End this workout?" body={done ? `Your ${done} logged sets are kept in history as an unfinished session. It won’t count as a completed day.` : 'Nothing has been logged yet, so this session will be discarded.'}
          confirmLabel="End workout" onCancel={() => setConfirmEnd(false)} onConfirm={() => { store.endSessionEarly(s.id); setConfirmEnd(false); go('home'); }} />
      )}
    </div>
  );
}

function ExerciseCard({ data, session, exIdx, onSetDone, onSwap }: { data: AppData; session: Session; exIdx: number; onSetDone: (ex: Exercise) => void; onSwap: () => void }) {
  const e = session.exercises[exIdx];
  const ex = getExercise(e.exerciseId, data.customExercises)!;
  const prev = useMemo(() => lastPerformance(data, e.exerciseId, session.id), [data, e.exerciseId, session.id]);
  const [showCue, setShowCue] = useState(false);
  const unit = data.profile!.unit;
  const hasWeight = ex.metric === 'weight_reps';
  const complete = e.sets.every((x) => x.done);
  const toast = useToast();

  // Default for a set: the previous set in this session, else the same set last time.
  const suggestion = (i: number): SetEntry | undefined => {
    for (let j = i - 1; j >= 0; j--) if (e.sets[j].done) return e.sets[j];
    return prev?.[i] ?? prev?.[prev.length - 1];
  };

  const toggle = (i: number) => {
    const set = e.sets[i];
    if (set.done) { store.updateSet(session.id, exIdx, i, { done: false }); return; }
    const sug = suggestion(i);
    const patch: Partial<SetEntry> = { done: true };
    if (ex.metric === 'time') patch.seconds = set.seconds ?? sug?.seconds;
    else {
      patch.reps = set.reps ?? sug?.reps;
      if (hasWeight) patch.weight = set.weight ?? sug?.weight;
    }
    if ((ex.metric === 'time' && !patch.seconds) || (ex.metric !== 'time' && !patch.reps)) {
      toast(ex.metric === 'time' ? 'Enter the seconds first' : 'Enter reps first');
      document.getElementById(`in-${exIdx}-${i}-${ex.metric === 'time' ? 'sec' : 'reps'}`)?.focus();
      return;
    }
    store.updateSet(session.id, exIdx, i, patch);
    haptic(12);
    onSetDone(ex);
  };

  const num = (v: string) => (v === '' ? undefined : Math.max(0, Number(v)));

  return (
    <section className="ex-card" data-complete={complete} aria-labelledby={`ex-${exIdx}`}>
      <div className="row-between" style={{ alignItems: 'flex-start' }}>
        <div>
          <h3 id={`ex-${exIdx}`} className="ex-name">{ex.name}</h3>
          <div className="small muted">{e.sets.length} × {e.target}{e.swappedFrom ? ` · swapped from ${getExercise(e.swappedFrom, data.customExercises)?.name}` : ''}</div>
        </div>
        <div className="row" style={{ gap: 0 }}>
          <button className="icon-btn" aria-label={`How to do ${ex.name}`} aria-expanded={showCue} onClick={() => setShowCue(!showCue)} style={{ fontWeight: 800 }}>?</button>
          <button className="icon-btn" aria-label={`Swap ${ex.name}`} onClick={onSwap} data-testid={`swap-${exIdx}`}><Icon.swap /></button>
        </div>
      </div>
      {showCue && <p className="ex-cue" style={{ margin: '8px 0 4px' }}>{ex.cue}</p>}

      <div className={'set-grid' + (hasWeight ? '' : ' no-weight')} style={{ marginTop: 12 }}>
        <span className="set-head" style={{ textAlign: 'center' }}>Set</span>
        <span className="set-head">Last time</span>
        {hasWeight && <span className="set-head" style={{ textAlign: 'center' }}>{unit}</span>}
        <span className="set-head" style={{ textAlign: 'center' }}>{ex.metric === 'time' ? 'Sec' : 'Reps'}</span>
        <span />
        {e.sets.map((set, i) => {
          const sug = suggestion(i);
          return (
            <React.Fragment key={i}>
              <span className="set-idx set-row" data-done={set.done}>{i + 1}</span>
              <span className="prev">{fmtSet(prev?.[i], unit)}</span>
              {hasWeight && (
                <input id={`in-${exIdx}-${i}-w`} className="num-input set-row" data-done={set.done} inputMode="decimal" type="number" min={0} step="any" aria-label={`Set ${i + 1} weight in ${unit}`}
                  placeholder={sug?.weight ? String(sug.weight) : '0'} value={set.weight ?? ''} onChange={(ev) => store.updateSet(session.id, exIdx, i, { weight: num(ev.target.value) })} />
              )}
              {ex.metric === 'time' ? (
                <input id={`in-${exIdx}-${i}-sec`} className="num-input" data-done={set.done} inputMode="numeric" type="number" min={0} aria-label={`Set ${i + 1} seconds`}
                  placeholder={sug?.seconds ? String(sug.seconds) : e.target.replace(/\D/g, '')} value={set.seconds ?? ''} onChange={(ev) => store.updateSet(session.id, exIdx, i, { seconds: num(ev.target.value) })} />
              ) : (
                <input id={`in-${exIdx}-${i}-reps`} className="num-input" data-done={set.done} inputMode="numeric" type="number" min={0} aria-label={`Set ${i + 1} reps`}
                  placeholder={sug?.reps ? String(sug.reps) : '–'} value={set.reps ?? ''} onChange={(ev) => store.updateSet(session.id, exIdx, i, { reps: num(ev.target.value) })} data-testid={`reps-${exIdx}-${i}`} />
              )}
              <button className="check" aria-pressed={set.done} aria-label={`Set ${i + 1} ${set.done ? 'completed, tap to undo' : 'mark complete'}`} onClick={() => toggle(i)} data-testid={`check-${exIdx}-${i}`}><Icon.check /></button>
            </React.Fragment>
          );
        })}
      </div>
      <div className="row" style={{ marginTop: 10 }}>
        <button className="btn ghost-dark btn-sm" onClick={() => store.addSet(session.id, exIdx)}><Icon.plus size={16} /> Set</button>
        {e.sets.length > 1 && !e.sets[e.sets.length - 1].done && <button className="btn ghost-dark btn-sm" onClick={() => store.removeSet(session.id, exIdx, e.sets.length - 1)}>Remove last set</button>}
      </div>
    </section>
  );
}

function PickSheet({ title, data, options, onPick, onClose, search }: { title: string; data: AppData; options: Exercise[]; onPick: (id: string) => void; onClose: () => void; search?: boolean }) {
  const [q, setQ] = useState('');
  const eq = data.profile!.equipment;
  const list = options.filter((o) => !q || o.name.toLowerCase().includes(q.toLowerCase()));
  return (
    <Sheet title={title} onClose={onClose} dark>
      {search && <input className="num-input" style={{ textAlign: 'left', fontSize: 16, marginBottom: 12, padding: '0 12px' }} placeholder="Search exercises" aria-label="Search exercises" value={q} onChange={(e) => setQ(e.target.value)} />}
      {!list.length && <p className="muted">No matches with your equipment.</p>}
      <div className="list">
        {list.map((o) => (
          <button key={o.id} className="list-row" style={{ color: 'var(--night-ink)', borderColor: 'var(--night-line)' }} onClick={() => onPick(o.id)}>
            <span><b>{o.name}</b><br /><span className="small" style={{ color: 'var(--night-ink-2)' }}>{o.muscle} · {o.equipment}{o.equipment !== 'bodyweight' && !eq.includes(o.equipment) ? ' (not in your equipment)' : ''}</span></span>
            <Icon.arrow size={18} />
          </button>
        ))}
      </div>
    </Sheet>
  );
}

function FinishSheet({ s, total, done, onClose, onSave }: { s: Session; total: number; done: number; onClose: () => void; onSave: (effort: Session['effort'], note: string) => void }) {
  const [effort, setEffort] = useState<Session['effort']>();
  const [note, setNote] = useState('');
  const labels = ['Very easy', 'Easy', 'Solid', 'Hard', 'All-out'];
  return (
    <Sheet title="Nice work" onClose={onClose} dark>
      <p className="muted" style={{ marginBottom: 16 }}>{done} of {total} sets logged{done < total ? '. Unfinished sets are fine; what you did is what counts' : ''}.</p>
      <div className="stack-lg">
        <div className="field" role="radiogroup" aria-label="How hard did that feel?">
          <div className="label">How hard did that feel?</div>
          <div className="scale">
            {[1, 2, 3, 4, 5].map((n) => <button key={n} role="radio" aria-checked={effort === n} aria-label={labels[n - 1]} className="chip" style={effort === n ? { background: 'var(--ember)', color: 'var(--ink)', borderColor: 'var(--ember)' } : { background: 'var(--night-3)', color: 'var(--night-ink)', borderColor: 'var(--night-line)' }} onClick={() => setEffort(n as Session['effort'])} data-testid={`effort-${n}`}>{n}</button>)}
          </div>
          <div className="scale-labels" style={{ color: 'var(--night-ink-2)' }}><span>Very easy</span><span>All-out</span></div>
        </div>
        <div className="field">
          <label className="label" htmlFor="wk-note">Note <span className="muted">(optional)</span></label>
          <textarea id="wk-note" className="textarea" style={{ background: 'var(--night-3)', borderColor: 'var(--night-line)' }} value={note} onChange={(e) => setNote(e.target.value)} placeholder="How it went, anything to change next time" />
        </div>
        <button className="btn btn-primary btn-lg btn-block" onClick={() => onSave(effort, note)} disabled={done === 0} data-testid="save-workout">{done === 0 ? 'Log at least one set' : 'Save workout'}</button>
      </div>
    </Sheet>
  );
}

export function Complete({ id, go }: { id: string; go: (r: Route) => void }) {
  const data = useData();
  const s = data.sessions.find((x) => x.id === id);
  const bits = useMemo(() => Array.from({ length: 14 }, (_, i) => ({ x: Math.cos((i / 14) * Math.PI * 2) * (90 + (i % 3) * 20), y: Math.sin((i / 14) * Math.PI * 2) * (90 + (i % 3) * 20) })), []);
  if (!s) return null;
  const total = s.exercises.reduce((n, e) => n + e.sets.length, 0);
  const done = setsDone(s);
  const r = 70, circ = 2 * Math.PI * r;
  const records = newRecordsIn(data, s).map((x) => getExercise(x, data.customExercises)?.name);
  const vol = sessionVolume(s);
  const firstEver = data.sessions.filter((x) => x.status === 'completed').length === 1;
  return (
    <div className="complete" role="main">
      <div style={{ position: 'relative', display: 'grid', placeItems: 'center' }}>
        <svg className="ring" viewBox="0 0 168 168" aria-hidden>
          <circle className="track" cx="84" cy="84" r={r} />
          <circle className="val" cx="84" cy="84" r={r} strokeDasharray={circ} strokeDashoffset={circ * (1 - done / Math.max(1, total))} style={{ ['--circ' as string]: circ }} />
        </svg>
        <div style={{ position: 'absolute', textAlign: 'center' }}>
          <div className="clock" style={{ fontSize: 'var(--t-2xl)' }}>{done}/{total}</div>
          <div className="small muted">sets</div>
        </div>
        <div className="burst" aria-hidden style={{ position: 'absolute', inset: 0, display: 'grid', placeItems: 'center' }}>
          {bits.map((b, i) => <span key={i} style={{ ['--x' as string]: `${b.x}px`, ['--y' as string]: `${b.y}px`, animationDelay: `${300 + i * 15}ms`, background: i % 3 ? 'var(--ember)' : 'var(--night-ink)' }} />)}
        </div>
      </div>
      <div className="stack" style={{ alignItems: 'center' }}>
        <h1 className="display" style={{ fontSize: 'var(--t-3xl)' }}>{firstEver ? 'First one done' : 'Session logged'}</h1>
        <p className="muted" style={{ maxWidth: '30ch' }}>{firstEver ? 'Everything you lift from here gets compared against today. This is your baseline.' : `${s.name} · ${minutesBetween(s.startedAt, s.endedAt!)} min${vol ? ` · ${Math.round(vol).toLocaleString()} ${data.profile!.unit} moved` : ''}`}</p>
      </div>
      {records.length > 0 && (
        <div className="stack" style={{ alignItems: 'center' }}>
          <span className="badge badge-ember">New best{records.length > 1 ? 's' : ''}</span>
          <p style={{ fontWeight: 700 }}>{records.join(' · ')}</p>
        </div>
      )}
      <button className="btn btn-primary btn-lg" onClick={() => go('home')} data-testid="complete-done">Back to today</button>
    </div>
  );
}
