import React, { useState } from 'react';
import { ConfirmDialog, Icon, Sheet, Switch, store, useData, useToast, type Route } from '../components/core';
import { RULE_LABELS } from '../lib/insights';
import { estimateMinutes } from '../lib/planner';
import { getExercise } from '../lib/exercises';
import { DAY_LONG, DAY_SHORT } from '../lib/dates';
import { buildSampleData } from '../lib/sample';
import type { Equipment, InsightRuleId, Profile } from '../lib/types';
import { DisciplinePicker, GoalPicker, buildValid } from '../components/BuildSelector';
import { disciplineLabel, goalLabel } from '../lib/goals';

const EXP_LABEL = { beginner: 'New or returning', intermediate: 'Some experience', advanced: 'Experienced' };
const EQUIP: Equipment[] = ['dumbbells', 'barbell', 'machines', 'kettlebell', 'bands'];

export function You({ go }: { go: (r: Route) => void }) {
  const data = useData();
  const p = data.profile!;
  const toast = useToast();
  const [edit, setEdit] = useState(false);
  const [goals, setGoals] = useState(false);
  const [confirm, setConfirm] = useState<null | 'delete' | 'sample' | 'clearSample' | 'checkins' | 'history'>(null);

  const copyExport = async () => {
    try { await navigator.clipboard.writeText(store.exportJSON()); toast('Your data was copied as JSON'); }
    catch { toast('Copy isn’t available here. Try a different browser.'); }
  };

  return (
    <div className="page">
      <header className="page-head"><h1 className="page-title display">You</h1></header>

      <section className="card stack">
        <div className="row-between">
          <h2 className="eyebrow">Training profile</h2>
          <div className="row"><button className="btn btn-outline btn-sm" onClick={() => setGoals(true)} data-testid="edit-goals">Goals</button><button className="btn btn-outline btn-sm" onClick={() => setEdit(true)} data-testid="edit-profile">Edit</button></div>
        </div>
        <div className="list small">
          <div className="list-row"><span className="muted">Goal</span><b style={{ textAlign: 'right' }}>{goalLabel(p.goal)}{p.secondaryGoals.length ? ` + ${p.secondaryGoals.map(goalLabel).join(', ')}` : ''}</b></div>
          <div className="list-row"><span className="muted">Training style</span><b style={{ textAlign: 'right' }}>{p.disciplines.length ? p.disciplines.map((d) => disciplineLabel(d) + (p.primaryDiscipline === d && p.disciplines.length > 1 ? ' (main)' : '')).join(', ') : 'Not set'}</b></div>
          <div className="list-row"><span className="muted">Experience</span><b>{EXP_LABEL[p.experience]}</b></div>
          <div className="list-row"><span className="muted">Days</span><b>{[1, 2, 3, 4, 5, 6, 0].filter((d) => p.trainingDays.includes(d)).map((d) => DAY_SHORT[d]).join(', ')}</b></div>
          <div className="list-row"><span className="muted">Session length</span><b>{p.sessionMinutes} min</b></div>
          <div className="list-row"><span className="muted">Equipment</span><b style={{ textAlign: 'right' }}>{['bodyweight', ...p.equipment].join(', ')}</b></div>
        </div>
      </section>

      <section className="card stack">
        <h2 className="eyebrow">Your plan · rotates in order</h2>
        {data.templates.map((t, i) => (
          <div key={t.id}>
            <div className="row-between"><b>{t.name}{i === data.rotationIndex % data.templates.length ? <span className="badge badge-ember" style={{ marginLeft: 8 }}>Next</span> : null}</b><span className="small muted">~{estimateMinutes(t)} min</span></div>
            <p className="small muted">{t.exercises.map((e) => `${getExercise(e.exerciseId, data.customExercises)?.name} ${e.sets}×`).join(' · ')}</p>
          </div>
        ))}
      </section>

      <section className="card">
        <h2 className="eyebrow">Check-ins & insights</h2>
        <div className="setting-row">
          <div><b>Daily check-in</b><p className="small muted">Energy, mood, sleep and time, all optional.</p></div>
          <Switch label="Daily check-in" checked={p.checkinsEnabled} onChange={(v) => store.updateProfile({ checkinsEnabled: v }, false)} />
        </div>
        <div className="setting-row">
          <div><b>Lead with the short version on low days</b><p className="small muted">When your check-in shows low energy, short sleep or little time.</p></div>
          <Switch label="Lead with short version on low days" checked={data.settings.suggestShortWhenLow} onChange={(v) => store.setSettings({ suggestShortWhenLow: v })} />
        </div>
        <p className="small muted" style={{ marginTop: 12 }}>Patterns the app may look for:</p>
        {(Object.keys(RULE_LABELS) as InsightRuleId[]).map((id) => (
          <div key={id} className="setting-row">
            <b className="small">{RULE_LABELS[id]}</b>
            <Switch label={RULE_LABELS[id]} checked={!data.settings.disabledRules.includes(id)} onChange={(v) => store.toggleRule(id, v)} />
          </div>
        ))}
      </section>

      <section className="card stack">
        <h2 className="eyebrow">Coaching</h2>
        <button className="btn btn-outline" onClick={() => go('coach')} data-testid="open-coaching">Coaching options & booking</button>
        <button className="btn btn-ghost" onClick={() => { store.setCoach({ viewAsCoach: true }); go('biz'); }} data-testid="enter-coach">Switch to coach view</button>
        <p className="small muted">Coach view holds the business desk. In this prototype anyone on this device can open it; a real launch puts it behind the coach’s own login.</p>
      </section>

      <section className="card stack">
        <h2 className="eyebrow">What the check-in remembers</h2>
        {data.checkinMemory.length === 0 ? <p className="small muted">Nothing yet. When you tell the check-in something in your own words, it keeps a short note so it can ask about it next time.</p> : (
          <div className="list">{data.checkinMemory.map((m, i) => <div key={i} className="list-row"><span className="small"><span className="muted">{m.date.slice(5)} · </span>{m.text}</span><button className="icon-btn" aria-label="Forget this" onClick={() => store.forgetMemory(i)}><Icon.trash /></button></div>)}</div>
        )}
        {data.checkinMemory.length > 0 && <button className="btn btn-ghost btn-sm" style={{ alignSelf: 'flex-start' }} onClick={() => store.clearMemory()}>Forget all</button>}
      </section>

      <section className="card">
        <h2 className="eyebrow">Accessibility</h2>
        <div className="setting-row">
          <div><b>Reduce motion</b><p className="small muted">Turns off animations. The app also follows your device setting.</p></div>
          <Switch label="Reduce motion" checked={data.settings.reducedMotion === 'on'} onChange={(v) => store.setSettings({ reducedMotion: v ? 'on' : 'system' })} />
        </div>
      </section>

      <section className="card stack">
        <h2 className="eyebrow">Your data</h2>
        <p className="small muted">{store.persistent ? 'Everything is stored only in this browser on this device. There’s no account and nothing is sent anywhere.' : 'This browser is blocking storage, so data lasts only until you close the page.'}</p>
        <button className="btn btn-outline" onClick={copyExport}>Copy all my data (JSON)</button>
        <button className="btn btn-outline" onClick={() => setConfirm('checkins')}>Delete all check-ins</button>
        <button className="btn btn-outline" onClick={() => setConfirm('history')}>Reset insight decisions</button>
        <button className="btn btn-danger" onClick={() => setConfirm('delete')} data-testid="delete-all">Delete everything</button>
      </section>

      <section className="card stack">
        <h2 className="eyebrow">Demo</h2>
        {data.settings.sampleData
          ? <button className="btn btn-outline" onClick={() => setConfirm('clearSample')}>Clear sample data</button>
          : <><p className="small muted">Load 7 weeks of made-up training to preview progress charts and insights. It replaces what’s here, and a banner marks it as sample data.</p><button className="btn btn-outline" onClick={() => setConfirm('sample')} data-testid="load-sample">Load sample data</button></>}
      </section>

      <p className="small muted">This app offers general fitness guidance, not medical advice. Stop if something hurts, and check with a qualified professional about injuries, pain or medical conditions.</p>

      {edit && <EditProfile p={p} onClose={() => setEdit(false)} />}
      {goals && <EditGoals p={p} onClose={() => setGoals(false)} />}
      {confirm === 'delete' && <ConfirmDialog danger title="Delete everything?" body="Your profile, plan, workouts, check-ins and insight history will be erased from this device. This can’t be undone." confirmLabel="Delete everything" onCancel={() => setConfirm(null)} onConfirm={() => { store.resetAll(); setConfirm(null); go('welcome'); }} />}
      {confirm === 'sample' && <ConfirmDialog title="Load sample data?" body="This replaces everything currently stored in the app with made-up demo data. Copy your data first if you want to keep it." confirmLabel="Load sample" onCancel={() => setConfirm(null)} onConfirm={() => { store.replaceAll(buildSampleData()); setConfirm(null); toast('Sample data loaded'); go('home'); }} />}
      {confirm === 'clearSample' && <ConfirmDialog title="Clear sample data?" body="The app returns to a fresh start so you can set up your own plan." confirmLabel="Clear" onCancel={() => setConfirm(null)} onConfirm={() => { store.resetAll(); setConfirm(null); go('onboarding'); }} />}
      {confirm === 'checkins' && <ConfirmDialog danger title="Delete all check-ins?" body="Mood, energy, sleep and time entries are erased. Workouts stay." confirmLabel="Delete check-ins" onCancel={() => setConfirm(null)} onConfirm={() => { store.clearCheckins(); setConfirm(null); toast('Check-ins deleted'); }} />}
      {confirm === 'history' && <ConfirmDialog title="Reset insight decisions?" body="Hidden patterns can show up again, and outcome tracking restarts." confirmLabel="Reset" onCancel={() => setConfirm(null)} onConfirm={() => { store.clearInsightHistory(); setConfirm(null); toast('Insight decisions reset'); }} />}
    </div>
  );
}

function EditProfile({ p, onClose }: { p: Profile; onClose: () => void }) {
  const [d, setD] = useState(p);
  const toast = useToast();
  const set = (patch: Partial<Profile>) => setD((x) => ({ ...x, ...patch }));
  const planChanged = d.experience !== p.experience || d.sessionMinutes !== p.sessionMinutes || d.equipment.join() !== p.equipment.join() || (d.trainingDays.length >= 4) !== (p.trainingDays.length >= 4) || (d.trainingDays.length === 3) !== (p.trainingDays.length === 3);
  return (
    <Sheet title="Edit profile" onClose={onClose}>
      <div className="stack-lg">
        <div className="field"><label className="label" htmlFor="pn">Name</label><input id="pn" className="input" value={d.name} onChange={(e) => set({ name: e.target.value })} /></div>
        <div className="field"><div className="label">Experience</div><div className="chips">{(Object.keys(EXP_LABEL) as Profile['experience'][]).map((g) => <button key={g} className="chip" aria-pressed={d.experience === g} onClick={() => set({ experience: g })}>{EXP_LABEL[g]}</button>)}</div></div>
        <div className="field"><div className="label">Training days</div><div className="daypick">{[1, 2, 3, 4, 5, 6, 0].map((x) => { const on = d.trainingDays.includes(x); return <button key={x} className="chip" aria-pressed={on} aria-label={DAY_LONG[x]} onClick={() => set({ trainingDays: on ? d.trainingDays.filter((y) => y !== x) : [...d.trainingDays, x].sort() })}>{DAY_SHORT[x].slice(0, 2)}</button>; })}</div></div>
        <div className="field"><div className="label">Session length</div><div className="chips">{[20, 30, 45, 60].map((m) => <button key={m} className="chip" aria-pressed={d.sessionMinutes === m} onClick={() => set({ sessionMinutes: m })}>{m} min</button>)}</div></div>
        <div className="field"><div className="label">Equipment</div><div className="chips">{EQUIP.map((e) => { const on = d.equipment.includes(e); return <button key={e} className="chip" aria-pressed={on} onClick={() => set({ equipment: on ? d.equipment.filter((y) => y !== e) : [...d.equipment, e] })}>{e}</button>; })}</div></div>
        <div className="field"><div className="label">Usually train in the</div><div className="chips">{(['morning', 'midday', 'evening', 'varies'] as const).map((t) => <button key={t} className="chip" aria-pressed={d.preferredTime === t} onClick={() => set({ preferredTime: t })}>{t}</button>)}</div></div>
        <div className="field"><div className="label">Unit</div><div className="seg">{(['lb', 'kg'] as const).map((u) => <button key={u} aria-pressed={d.unit === u} onClick={() => set({ unit: u })}>{u}</button>)}</div>{d.unit !== p.unit && <p className="small muted">Past entries keep their numbers. They aren’t converted.</p>}</div>
        {planChanged && <p className="why-box small">Saving rebuilds your session plan to match. Your workout history is kept.</p>}
        <button className="btn btn-ink btn-lg" disabled={!d.trainingDays.length} onClick={() => { store.updateProfile(d, planChanged); toast(planChanged ? 'Profile saved, plan rebuilt' : 'Profile saved'); onClose(); }}>Save</button>
      </div>
    </Sheet>
  );
}

function EditGoals({ p, onClose }: { p: Profile; onClose: () => void }) {
  const [v, setV] = useState({ goal: p.goal, secondaryGoals: p.secondaryGoals, disciplines: p.disciplines, primaryDiscipline: p.primaryDiscipline });
  const [tab, setTab] = useState<'goal' | 'style'>('goal');
  const toast = useToast();
  const set = (patch: Partial<typeof v>) => setV((x) => ({ ...x, ...patch }));
  return (
    <Sheet title="Goals & training style" onClose={onClose}>
      <div className="stack-lg">
        <div className="seg" role="group" aria-label="Section"><button aria-pressed={tab === 'goal'} onClick={() => setTab('goal')}>Goal</button><button aria-pressed={tab === 'style'} onClick={() => setTab('style')}>Training style</button></div>
        {tab === 'goal' ? <GoalPicker v={v} set={set} /> : <DisciplinePicker v={v} set={set} />}
        <p className="why-box small">Saving rebuilds your workout plan and updates meal suggestions. Your workout history, progress and records are kept.</p>
        <button className="btn btn-ink btn-lg" disabled={!buildValid(v)} data-testid="save-goals" onClick={() => { store.updateProfile({ ...v, primaryDiscipline: v.primaryDiscipline ?? v.disciplines[0] ?? null }, true); toast('Goals saved, plan rebuilt'); onClose(); }}>{buildValid(v) ? 'Save' : 'Pick a main focus to save'}</button>
      </div>
    </Sheet>
  );
}
