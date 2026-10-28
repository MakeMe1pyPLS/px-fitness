import React, { useMemo, useState } from 'react';
import { Icon, Switch, store } from '../components/core';
import { generateTemplates, estimateMinutes, planNote } from '../lib/planner';
import { getExercise } from '../lib/exercises';
import { DAY_SHORT, DAY_LONG } from '../lib/dates';
import type { Equipment, Experience, Profile, TimeOfDay } from '../lib/types';
import { DisciplinePicker, GoalPicker, buildValid } from '../components/BuildSelector';

const LEVELS: { id: Experience; t: string; d: string }[] = [
  { id: 'beginner', t: 'New or returning', d: 'Less than 6 months of regular training' },
  { id: 'intermediate', t: 'Some experience', d: 'Comfortable with the main lifts' },
  { id: 'advanced', t: 'Experienced', d: 'Years of structured training' },
];
const EQUIP: { id: Equipment; t: string }[] = [
  { id: 'dumbbells', t: 'Dumbbells' }, { id: 'barbell', t: 'Barbell & rack' }, { id: 'machines', t: 'Gym machines' },
  { id: 'kettlebell', t: 'Kettlebell' }, { id: 'bands', t: 'Resistance bands' },
];
const TIMES: { id: TimeOfDay; t: string }[] = [{ id: 'morning', t: 'Morning' }, { id: 'midday', t: 'Midday' }, { id: 'evening', t: 'Evening' }, { id: 'varies', t: 'It varies' }];

export function Onboarding({ onDone, onExit }: { onDone: () => void; onExit: () => void }) {
  const [step, setStep] = useState(0);
  const [p, setP] = useState<Omit<Profile, 'createdAt'>>({
    name: '', goal: 'general', secondaryGoals: [], disciplines: [], primaryDiscipline: null, goalHistory: [], experience: 'beginner', equipment: ['dumbbells'], sessionMinutes: 30,
    trainingDays: [1, 3, 5], preferredTime: 'evening', unit: 'lb', checkinsEnabled: true,
  });
  const set = (patch: Partial<typeof p>) => setP((x) => ({ ...x, ...patch }));
  const preview = useMemo(() => generateTemplates({ ...p, createdAt: '' }), [p]);
  const steps = 7;
  const canNext = (step !== 4 || p.trainingDays.length > 0) && (step !== 1 || buildValid(p));

  const finish = () => {
    const now = new Date().toISOString();
    store.completeOnboarding({ ...p, name: p.name.trim(), createdAt: now, goalHistory: [{ date: now.slice(0, 10), goal: p.goal, discipline: p.primaryDiscipline ?? p.disciplines[0] ?? null }] });
    onDone();
  };

  return (
    <div className="onb">
      <div className="row-between">
        <button className="icon-btn" aria-label={step ? 'Back' : 'Close'} onClick={() => (step ? setStep(step - 1) : onExit())}>{step ? <Icon.back /> : <Icon.close />}</button>
        <span className="eyebrow">Step {step + 1} of {steps}</span>
        <span style={{ width: 44 }} />
      </div>
      <div className="onb-progress" aria-hidden>{Array.from({ length: steps }, (_, i) => <i key={i} data-on={i <= step} />)}</div>

      <div className="onb-body" key={step}>
        {step === 0 && (
          <>
            <h1 className="onb-q display">What are you working toward?</h1>
            <GoalPicker v={p} set={set} />
          </>
        )}
        {step === 1 && (
          <>
            <h1 className="onb-q display">How do you like to train?</h1>
            <DisciplinePicker v={p} set={set} />
          </>
        )}
        {step === 2 && (
          <>
            <h1 className="onb-q display">How much training experience?</h1>
            <div className="stack" role="radiogroup" aria-label="Experience">
              {LEVELS.map((g) => <button key={g.id} role="radio" aria-checked={p.experience === g.id} className="option" onClick={() => set({ experience: g.id })}><b>{g.t}</b><span>{g.d}</span></button>)}
            </div>
          </>
        )}
        {step === 3 && (
          <>
            <h1 className="onb-q display">What can you use?</h1>
            <p className="muted">Bodyweight moves are always included. Pick everything you have access to.</p>
            <div className="stack" role="group" aria-label="Equipment">
              {EQUIP.map((e) => {
                const on = p.equipment.includes(e.id);
                return <button key={e.id} aria-pressed={on} className="option" onClick={() => set({ equipment: on ? p.equipment.filter((x) => x !== e.id) : [...p.equipment, e.id] })}><b>{e.t}</b></button>;
              })}
            </div>
          </>
        )}
        {step === 4 && (
          <>
            <h1 className="onb-q display">What does a realistic week look like?</h1>
            <div className="field">
              <div className="label" id="days-l">Training days</div>
              <div className="daypick" role="group" aria-labelledby="days-l">
                {[1, 2, 3, 4, 5, 6, 0].map((d) => {
                  const on = p.trainingDays.includes(d);
                  return <button key={d} aria-pressed={on} aria-label={DAY_LONG[d]} className="chip" onClick={() => set({ trainingDays: on ? p.trainingDays.filter((x) => x !== d) : [...p.trainingDays, d].sort() })}>{DAY_SHORT[d].slice(0, 2)}</button>;
                })}
              </div>
              <p className="small muted">{p.trainingDays.length ? `${p.trainingDays.length} day${p.trainingDays.length > 1 ? 's' : ''} a week. Start with fewer than you think; you can add more later.` : 'Pick at least one day.'}</p>
            </div>
            <div className="field">
              <div className="label" id="min-l">Time per session</div>
              <div className="chips" role="radiogroup" aria-labelledby="min-l">
                {[20, 30, 45, 60].map((m) => <button key={m} role="radio" aria-checked={p.sessionMinutes === m} className="chip" onClick={() => set({ sessionMinutes: m })}>{m} min</button>)}
              </div>
            </div>
            <div className="field">
              <div className="label" id="tod-l">Usually train in the</div>
              <div className="chips" role="radiogroup" aria-labelledby="tod-l">
                {TIMES.map((t) => <button key={t.id} role="radio" aria-checked={p.preferredTime === t.id} className="chip" onClick={() => set({ preferredTime: t.id })}>{t.t}</button>)}
              </div>
            </div>
          </>
        )}
        {step === 5 && (
          <>
            <h1 className="onb-q display">A few last details</h1>
            <div className="field">
              <label className="label" htmlFor="name">What should we call you? <span className="muted">(optional)</span></label>
              <input id="name" className="input" value={p.name} autoComplete="given-name" onChange={(e) => set({ name: e.target.value })} />
            </div>
            <div className="field">
              <div className="label" id="unit-l">Weight unit</div>
              <div className="seg" role="group" aria-labelledby="unit-l">
                {(['lb', 'kg'] as const).map((u) => <button key={u} aria-pressed={p.unit === u} onClick={() => set({ unit: u })}>{u}</button>)}
              </div>
            </div>
            <div className="card card-tight">
              <div className="setting-row">
                <div>
                  <b>Daily check-in</b>
                  <p className="small muted">A 10-second tap for energy, sleep and time. It powers personal insights. You can skip it any day or turn it off.</p>
                </div>
                <Switch label="Daily check-in" checked={p.checkinsEnabled} onChange={(v) => set({ checkinsEnabled: v })} />
              </div>
            </div>
          </>
        )}
        {step === 6 && (
          <>
            <h1 className="onb-q display">Your starting plan</h1>
            <p className="muted">{preview.length} sessions that rotate across your {p.trainingDays.length} training days, sized to about {p.sessionMinutes} minutes. Swap any exercise mid-workout.</p>
            {planNote({ ...p, createdAt: '' }) && <p className="why-box small">{planNote({ ...p, createdAt: '' })}</p>}
            <div className="stack">
              {preview.map((t) => (
                <div key={t.name} className="card card-tight">
                  <div className="row-between"><b className="display" style={{ fontSize: 'var(--t-lg)' }}>{t.name}</b><span className="badge">~{estimateMinutes(t)} min</span></div>
                  <p className="small muted" style={{ marginTop: 6 }}>{t.exercises.map((e) => getExercise(e.exerciseId)?.name).join(' · ')}</p>
                </div>
              ))}
            </div>
            <p className="small muted">This is general fitness guidance, not medical advice. If you have an injury, a medical condition or pain during exercise, check with a qualified professional.</p>
          </>
        )}
      </div>

      <div style={{ paddingTop: 24 }}>
        {step < steps - 1 ? (
          <button className="btn btn-ink btn-lg btn-block" disabled={!canNext} onClick={() => setStep(step + 1)} data-testid="onb-next">Continue</button>
        ) : (
          <button className="btn btn-primary btn-lg btn-block" onClick={finish} data-testid="onb-finish">Start training</button>
        )}
      </div>
    </div>
  );
}
