import React, { useState } from 'react';
import { ConfirmDialog, Icon, Sheet, store, useData, useToast, type Route } from '../components/core';
import { Bars, Empty, LineChart, PairBars } from '../components/widgets';
import { PhotosMilestones } from '../components/PhotosMilestones';
import { exerciseBests, exerciseSeries, planWindow, sessionVolume, setsDone, weeklyConsistency, weeklyVolume } from '../lib/stats';
import { getExercise } from '../lib/exercises';
import { addDays, formatShortDate, minutesBetween, toDateKey } from '../lib/dates';
import type { AppData, Session } from '../lib/types';

export function Progress({ go }: { go: (r: Route) => void }) {
  const data = useData();
  const [weeks, setWeeks] = useState(8);
  const [exercise, setExercise] = useState<string | null>(null);
  const [session, setSession] = useState<string | null>(null);
  const today = toDateKey(new Date());
  const unit = data.profile!.unit;
  const history = data.sessions.filter((s) => s.status !== 'in_progress').sort((a, b) => b.startedAt.localeCompare(a.startedAt));
  const completed = history.filter((s) => s.status === 'completed');

  if (!completed.length) {
    return (
      <div className="page">
        <header className="page-head"><h1 className="page-title display">Progress</h1></header>
        <Empty title="Your first session sets the baseline" body="Once you log a workout, this page shows consistency, strength trends and personal bests, all from what you actually did." action={<button className="btn btn-primary" onClick={() => go('home')}>Go to today</button>} />
        <PhotosMilestones />
      </div>
    );
  }

  const cons = weeklyConsistency(data, weeks);
  const vol = weeklyVolume(data, weeks);
  const win = planWindow(data, addDays(today, -7 * weeks + 1), today);
  const inRange = completed.filter((s) => s.plannedFor >= addDays(today, -7 * weeks + 1));
  const bests = [...exerciseBests(data).values()].filter((b) => b.sessions > 0).sort((a, b) => b.sessions - a.sessions);
  const wl = (k: string) => `${Number(k.slice(5, 7))}/${Number(k.slice(8, 10))}`;

  return (
    <div className="page">
      <header className="page-head">
        <h1 className="page-title display">Progress</h1>
        <div className="seg" role="group" aria-label="Time range">
          {[4, 8, 12].map((w) => <button key={w} aria-pressed={weeks === w} onClick={() => setWeeks(w)}>{w}w</button>)}
        </div>
      </header>

      <div className="metrics">
        <div className="metric"><b>{inRange.length}</b><span>sessions</span></div>
        <div className="metric"><b>{win.rate === null ? '—' : `${Math.round(win.rate * 100)}%`}</b><span>planned days hit</span></div>
        <div className="metric"><b>{inRange.reduce((n, s) => n + setsDone(s), 0)}</b><span>sets</span></div>
      </div>

      <PhotosMilestones />

      <section className="card stack" aria-labelledby="c-h">
        <div className="row-between"><h2 id="c-h" className="eyebrow">Consistency</h2><span className="legend"><span><i style={{ borderColor: 'var(--ink)' }} />Planned</span><span><i style={{ background: 'var(--ember)', borderColor: 'var(--ember)' }} />Done</span></span></div>
        <PairBars label={`Planned versus completed sessions per week, last ${weeks} weeks`} data={cons.map((c) => ({ label: wl(c.week), a: c.planned, b: c.done + c.extra }))} />
        <p className="small muted">Done includes bonus sessions on rest days. Weeks before you joined show as empty, not missed.</p>
      </section>

      <section className="card stack" aria-labelledby="v-h">
        <h2 id="v-h" className="eyebrow">Weekly volume · {unit} × reps</h2>
        <Bars label={`Weekly training volume, last ${weeks} weeks`} data={vol.map((v) => ({ label: wl(v.week), v: Math.round(v.volume) }))} format={(v) => (v >= 1000 ? `${(v / 1000).toFixed(1)}k` : String(v))} />
        <p className="small muted">Counts weighted sets only. Bodyweight and timed work show up in sets, not here. Week-to-week swings are normal.</p>
      </section>

      <section className="card" aria-labelledby="r-h">
        <h2 id="r-h" className="eyebrow" style={{ marginBottom: 8 }}>Personal bests</h2>
        <div className="list">
          {bests.map((b) => {
            const ex = getExercise(b.exerciseId, data.customExercises);
            const main = b.bestWeight ? `${b.bestWeight.weight} ${unit} × ${b.bestWeight.reps}` : b.bestReps ? `${b.bestReps.reps} reps` : b.bestSeconds ? `${b.bestSeconds.seconds} s` : '—';
            return (
              <button key={b.exerciseId} className="list-row" onClick={() => setExercise(b.exerciseId)}>
                <span><b>{ex?.name}</b><br /><span className="small muted">{b.sessions} session{b.sessions > 1 ? 's' : ''}</span></span>
                <span className="row"><b className="tnum">{main}</b><Icon.arrow size={16} /></span>
              </button>
            );
          })}
        </div>
      </section>

      <section className="card" aria-labelledby="h-h">
        <h2 id="h-h" className="eyebrow" style={{ marginBottom: 8 }}>History</h2>
        <div className="list">
          {history.slice(0, 40).map((s) => (
            <button key={s.id} className="list-row" onClick={() => setSession(s.id)} data-testid="history-row">
              <span><b>{s.name}</b><br /><span className="small muted">{formatShortDate(s.plannedFor)} · {setsDone(s)} sets{s.endedAt ? ` · ${minutesBetween(s.startedAt, s.endedAt)} min` : ''}</span></span>
              {s.status === 'abandoned' ? <span className="badge">Unfinished</span> : <Icon.arrow size={16} />}
            </button>
          ))}
        </div>
      </section>

      {exercise && <ExerciseSheet data={data} id={exercise} onClose={() => setExercise(null)} />}
      {session && <SessionSheet data={data} id={session} onClose={() => setSession(null)} />}
    </div>
  );
}

function ExerciseSheet({ data, id, onClose }: { data: AppData; id: string; onClose: () => void }) {
  const ex = getExercise(id, data.customExercises)!;
  const series = exerciseSeries(data, id).slice(-16);
  const [mode, setMode] = useState<'top' | 'est'>('top');
  const unit = data.profile!.unit;
  const weighted = ex.metric === 'weight_reps' && series.some((s) => s.topWeight > 0);
  const pts = series.map((s) => ({ x: `${Number(s.date.slice(5, 7))}/${Number(s.date.slice(8, 10))}`, y: ex.metric === 'time' ? s.topSeconds || null : weighted ? (mode === 'top' ? s.topWeight : s.est) || null : s.topReps || null }));
  return (
    <Sheet title={ex.name} onClose={onClose}>
      <div className="stack-lg">
        {weighted && (
          <div className="seg" role="group" aria-label="Metric">
            <button aria-pressed={mode === 'top'} onClick={() => setMode('top')}>Top set</button>
            <button aria-pressed={mode === 'est'} onClick={() => setMode('est')}>Est. 1-rep max</button>
          </div>
        )}
        <LineChart label={`${ex.name} trend`} points={pts} yLabel={(v) => String(Math.round(v))} />
        <p className="small muted">
          {ex.metric === 'time' ? 'Longest hold per session, in seconds.' : !weighted ? 'Most reps in a single set per session.' : mode === 'top' ? `Heaviest completed set per session (${unit}).` : `Estimated with the Epley formula from sets of 12 reps or fewer. It’s an estimate, not a tested max.`}
        </p>
        <p className="small">{ex.cue}</p>
      </div>
    </Sheet>
  );
}

function SessionSheet({ data, id, onClose }: { data: AppData; id: string; onClose: () => void }) {
  const s = data.sessions.find((x) => x.id === id) as Session | undefined;
  const [confirm, setConfirm] = useState(false);
  const toast = useToast();
  if (!s) return null;
  const unit = data.profile!.unit;
  const num = (v: string) => (v === '' ? undefined : Math.max(0, Number(v)));
  return (
    <Sheet title={s.name} onClose={onClose}>
      <p className="muted small" style={{ marginBottom: 12 }}>{formatShortDate(s.plannedFor)}{s.endedAt ? ` · ${minutesBetween(s.startedAt, s.endedAt)} min` : ''}{sessionVolume(s) ? ` · ${Math.round(sessionVolume(s)).toLocaleString()} ${unit}` : ''}{s.effort ? ` · effort ${s.effort}/5` : ''}</p>
      {s.note && <p className="why-box" style={{ marginBottom: 12 }}>{s.note}</p>}
      <p className="small muted" style={{ marginBottom: 12 }}>Spotted a typo? Edit any value below; it saves right away.</p>
      <div className="stack">
        {s.exercises.map((e, exIdx) => {
          const ex = getExercise(e.exerciseId, data.customExercises)!;
          return (
            <div key={exIdx}>
              <b>{ex.name}</b>
              <div className="stack" style={{ gap: 6, marginTop: 6 }}>
                {e.sets.map((set, i) => set.done && (
                  <div key={i} className="row small">
                    <span className="muted tnum" style={{ width: 20 }}>{i + 1}</span>
                    {ex.metric === 'weight_reps' && <><input className="input tnum" style={{ width: 80 }} type="number" inputMode="decimal" aria-label={`${ex.name} set ${i + 1} weight`} value={set.weight ?? ''} onChange={(ev) => store.editCompletedSet(s.id, exIdx, i, { weight: num(ev.target.value) })} /><span className="muted">{unit} ×</span></>}
                    {ex.metric === 'time'
                      ? <><input className="input tnum" style={{ width: 80 }} type="number" aria-label={`${ex.name} set ${i + 1} seconds`} value={set.seconds ?? ''} onChange={(ev) => store.editCompletedSet(s.id, exIdx, i, { seconds: num(ev.target.value) })} /><span className="muted">s</span></>
                      : <><input className="input tnum" style={{ width: 70 }} type="number" aria-label={`${ex.name} set ${i + 1} reps`} value={set.reps ?? ''} onChange={(ev) => store.editCompletedSet(s.id, exIdx, i, { reps: num(ev.target.value) })} /><span className="muted">reps</span></>}
                  </div>
                ))}
                {!e.sets.some((x) => x.done) && <span className="small muted">Not done</span>}
              </div>
            </div>
          );
        })}
        <hr className="divider" />
        <button className="btn btn-danger" onClick={() => setConfirm(true)}><Icon.trash /> Delete session</button>
      </div>
      {confirm && <ConfirmDialog danger title="Delete this session?" body="It will be removed from history, progress and insights. This can’t be undone." confirmLabel="Delete" onCancel={() => setConfirm(false)} onConfirm={() => { store.deleteSession(s.id); toast('Session deleted'); onClose(); }} />}
    </Sheet>
  );
}
