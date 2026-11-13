// Fight: learn to fight one lesson at a time, game plans for bigger/taller/
// shorter opponents (by weight and height), fight-camp countdown, practice timer.

import React, { useEffect, useMemo, useRef, useState } from 'react';
import { Sheet, store, useData, useToast, type Route } from '../components/core';
import { FightDiagram } from '../components/FightArt';
import { LESSONS, FACING_LABEL, buildTips, facingFrom, lessonsFor, strategy, type Facing, type Lesson } from '../lib/fightLessons';
import { SlidingPicker } from '../components/motion';
import { buzz } from '../lib/fx';
import { toDateKey, formatShortDate, plural } from '../lib/dates';
import { SPORTS, STANCE_LABEL, campPhase, fmtClock, fmtDiff, fmtHeight, matchup, presetFor, type Fighter, type Sport, type Stance } from '../lib/combat';

const OPP_KEY = 'px:opponent';
const IN = 2.54, LB = 2.20462;

export function Fight({ go: _go }: { go: (r: Route) => void }) {
  const data = useData();
  const f = data.combat;
  const [editing, setEditing] = useState(false);
  const [lesson, setLesson] = useState<Lesson | null>(null);
  const imperial = (data.profile?.unit ?? 'lb') === 'lb';
  const me = { sport: f?.sport, stance: f?.stance, heightCm: f?.heightCm ?? data.nutrition?.prefs?.heightCm, reachCm: f?.reachCm, weightKg: f?.weightKg ?? data.nutrition?.prefs?.weightKg };
  const lessons = lessonsFor(f?.sport);
  const open = (id: string) => { const l = LESSONS.find((x) => x.id === id); if (l) setLesson(l); };
  return (
    <div className="page stack-lg">
      <header className="page-head stack" style={{ gap: 4 }}>
        <h1 className="page-title display">Fight</h1>
        <p className="muted" style={{ margin: 0 }}>Learn to fight one skill at a time, and how to beat someone bigger, taller or stronger.</p>
      </header>
      {editing
        ? <ProfileForm initial={f} imperial={imperial} heightCm={me.heightCm} weightKg={me.weightKg} onDone={() => setEditing(false)} onCancel={() => setEditing(false)} />
        : <ProfileSummary f={f} me={me} imperial={imperial} onEdit={() => setEditing(true)} />}
      <FacingCard me={me} imperial={imperial} onLesson={open} />
      <LessonPath lessons={lessons} progress={data.fightLearn ?? {}} onOpen={setLesson} />
      {f?.fightDate && <Camp f={f} />}
      <details className="card practice" data-testid="practice">
        <summary className="row-between"><span><span className="eyebrow">Practice timer</span><br /><span className="small muted">Rounds with a bell for drills and bag work</span></span><span aria-hidden>▾</span></summary>
        <RoundTimer sport={f?.sport ?? 'Boxing'} me={f ?? { sport: 'Boxing' }} />
      </details>
      <p className="small muted">These are the standard basics taught in boxing, kickboxing and MMA gyms, for sport and fitness. Learn contact and sparring in a gym with a coach and proper gear. Outside the gym, the safest move is always to get away. Making weight: plan it with your coach and a doctor.</p>
      {lesson && <LessonSheet lesson={lesson} me={me} done={data.fightLearn?.[lesson.id]?.count ?? 0} onClose={() => setLesson(null)} next={() => { const i = lessons.findIndex((x) => x.id === lesson.id); setLesson(lessons[i + 1] ?? null); }} />}
    </div>
  );
}

// ── Profile ─────────────────────────────────────────────────────────────────
function ProfileForm({ initial, imperial, heightCm, weightKg, onDone, onCancel }: { initial?: Fighter; imperial: boolean; heightCm?: number; weightKg?: number; onDone: () => void; onCancel?: () => void }) {
  const toast = useToast();
  const [sport, setSport] = useState<Sport | ''>(initial?.sport ?? '');
  const [stance, setStance] = useState<Stance | ''>(initial?.stance ?? '');
  const [h, setH] = useState(initial?.heightCm ?? heightCm);
  const [r, setR] = useState(initial?.reachCm);
  const [w, setW] = useState(initial?.weightKg ?? weightKg);
  const [date, setDate] = useState(initial?.fightDate ?? '');
  const [name, setName] = useState(initial?.fightName ?? '');
  const save = () => {
    if (!sport) { toast('Pick your sport'); return; }
    store.setCombat({ sport, stance: stance || undefined, heightCm: h, reachCm: r, weightKg: w, fightDate: date || undefined, fightName: name.trim() || undefined });
    buzz([8, 40, 12]); toast(date ? 'Saved. Training will taper before the fight.' : 'Saved'); onDone();
  };
  return (
    <section className="card stack" data-testid="fight-form">
      <h2 className="eyebrow">Your fighter profile</h2>
      <div className="field"><label className="label" htmlFor="ft-sport">Sport</label>
        <select id="ft-sport" className="input" value={sport} onChange={(e) => setSport(e.target.value as Sport)} data-testid="ft-sport"><option value="">Choose…</option>{SPORTS.map((s) => <option key={s}>{s}</option>)}</select></div>
      <div className="field"><span className="label">Stance</span>
        <div className="chips" role="group" aria-label="Stance">{(Object.keys(STANCE_LABEL) as Stance[]).map((s) => <button key={s} type="button" className="chip" aria-pressed={stance === s} onClick={() => setStance(stance === s ? '' : s)} data-testid={`ft-stance-${s}`}>{STANCE_LABEL[s].split(' (')[0]}</button>)}</div></div>
      <div className="row">
        <LenField id="ft-h" label="Height" cm={h} imperial={imperial} onChange={setH} testid="ft-height" />
        <LenField id="ft-r" label="Reach (optional)" cm={r} imperial={imperial} onChange={setR} testid="ft-reach" />
      </div>
      <div className="field"><label className="label" htmlFor="ft-w">Weight ({imperial ? 'lb' : 'kg'})</label>
        <input id="ft-w" className="input" type="number" inputMode="decimal" value={w ? Math.round(imperial ? w * LB : w) : ''} onChange={(e) => setW(e.target.value ? Number(e.target.value) / (imperial ? LB : 1) : undefined)} data-testid="ft-weight" /></div>
      <div className="row">
        <div className="field grow"><label className="label" htmlFor="ft-d">Next fight (optional)</label><input id="ft-d" className="input" type="date" min={toDateKey(new Date())} value={date} onChange={(e) => setDate(e.target.value)} data-testid="ft-date" /></div>
        <div className="field grow"><label className="label" htmlFor="ft-n">Event name</label><input id="ft-n" className="input" maxLength={40} placeholder="e.g. Golden Gloves" value={name} onChange={(e) => setName(e.target.value)} data-testid="ft-name" /></div>
      </div>
      <div className="row">
        <button className="btn btn-primary grow" onClick={save} data-testid="ft-save">Save</button>
        {onCancel && <button className="btn btn-outline" onClick={onCancel}>Cancel</button>}
      </div>
      {initial && <button className="link-quiet small" onClick={() => { store.setCombat(null); toast('Combat profile removed'); }} data-testid="ft-remove">Remove combat profile</button>}
    </section>
  );
}

/** Height/reach input: ft+in or cm. */
function LenField({ id, label, cm, imperial, onChange, testid }: { id: string; label: string; cm?: number; imperial: boolean; onChange: (cm?: number) => void; testid: string }) {
  const tot = cm ? Math.round(cm / IN) : null;
  const [ft, setFt] = useState(tot ? String(Math.floor(tot / 12)) : '');
  const [inch, setInch] = useState(tot ? String(tot % 12) : '');
  if (!imperial) return <div className="field grow"><label className="label" htmlFor={id}>{label} (cm)</label><input id={id} className="input" type="number" inputMode="numeric" value={cm ? Math.round(cm) : ''} onChange={(e) => onChange(e.target.value ? Number(e.target.value) : undefined)} data-testid={testid} /></div>;
  const set = (a: string, b: string) => { setFt(a); setInch(b); const t = (Number(a) || 0) * 12 + (Number(b) || 0); onChange(t ? t * IN : undefined); };
  return (
    <div className="field grow"><label className="label" htmlFor={id}>{label}</label>
      <div className="row" style={{ gap: 6 }}>
        <input id={id} className="input" type="number" inputMode="numeric" aria-label={`${label} feet`} placeholder="ft" value={ft} onChange={(e) => set(e.target.value, inch)} data-testid={`${testid}-ft`} />
        <input className="input" type="number" inputMode="numeric" aria-label={`${label} inches`} placeholder="in" value={inch} onChange={(e) => set(ft, e.target.value)} data-testid={`${testid}-in`} />
      </div>
    </div>
  );
}

function ProfileSummary({ f, me, imperial, onEdit }: { f?: Fighter; me: { heightCm?: number; weightKg?: number }; imperial: boolean; onEdit: () => void }) {
  const bits = [f?.sport, f?.stance && STANCE_LABEL[f.stance].split(' (')[0], me.heightCm && fmtHeight(me.heightCm, imperial), f?.reachCm && `${fmtHeight(f.reachCm, imperial)} reach`, me.weightKg && `${Math.round(imperial ? me.weightKg * LB : me.weightKg)} ${imperial ? 'lb' : 'kg'}`].filter(Boolean);
  const tips = buildTips(me);
  return (
    <section className="card stack" data-testid="fight-profile">
      <div className="row-between">
        <div><h2 className="eyebrow">You</h2><p className="h3" style={{ margin: 0 }}>{bits.length ? bits.join(' · ') : 'Add your style and size for tips made for you'}</p></div>
        <button className="btn btn-outline btn-sm" onClick={onEdit} data-testid="ft-edit">{f ? 'Edit' : 'Set up'}</button>
      </div>
      {tips && <div data-testid="build-tips"><b className="small">Your build: {tips.title}</b><ul className="tips">{tips.tips.map((t) => <li key={t}>{t}</li>)}</ul></div>}
    </section>
  );
}

// ── Camp phase ────────────────────────────────────────────────────────────
function Camp({ f }: { f: Fighter }) {
  const today = toDateKey(new Date());
  const ph = campPhase(f.fightDate!, today);
  const phases = ['base', 'build', 'sharpen', 'fight-week', 'fight-day'] as const;
  const at = phases.indexOf(ph.id as (typeof phases)[number]);
  return (
    <section className="card card-ink today stack" data-testid="fight-camp">
      <div className="row-between">
        <h2 className="eyebrow">{f.fightName || `${f.sport} fight`} · {formatShortDate(f.fightDate!)}</h2>
        {ph.days > 0 && <b className="tnum" data-testid="camp-days">{plural(ph.days, 'day')}</b>}
      </div>
      <p className="display" style={{ fontSize: 'var(--t-2xl)', margin: 0 }}>{ph.name}</p>
      <div className="camp-track" aria-hidden>{phases.map((p, i) => <i key={p} data-on={at >= 0 && i <= at} />)}</div>
      <p style={{ margin: 0 }}>{ph.focus}</p>
      <ul className="tips">{ph.tips.map((t) => <li key={t}>{t}</li>)}</ul>
    </section>
  );
}

// ── Who are you facing? ───────────────────────────────────────────────────
interface Them { heightCm?: number; weightKg?: number; reachCm?: number; stance?: Stance; pick?: Facing }
function FacingCard({ me, imperial, onLesson }: { me: { sport?: Sport; stance?: Stance; heightCm?: number; weightKg?: number; reachCm?: number }; imperial: boolean; onLesson: (id: string) => void }) {
  const [t, setT] = useState<Them>(() => { try { return JSON.parse(localStorage.getItem(OPP_KEY) ?? '{}'); } catch { return {}; } });
  const upd = (o: Them) => { setT(o); try { localStorage.setItem(OPP_KEY, JSON.stringify(o)); } catch { /* ignore */ } };
  const [nums, setNums] = useState(!!(t.heightCm || t.weightKg));
  const auto = facingFrom(me, t);
  const facing: Facing | null = t.pick ?? auto;
  const st = facing ? strategy(facing, me.sport) : null;
  const stance = useMemo(() => me.sport && me.stance && t.stance ? matchup({ sport: me.sport, stance: me.stance }, { stance: t.stance }).stance : null, [me.sport, me.stance, t.stance]);
  const diffs: string[] = [];
  if (me.weightKg && t.weightKg && Math.abs(t.weightKg - me.weightKg) >= 1) { const d = t.weightKg - me.weightKg; diffs.push(`${Math.round(Math.abs(imperial ? d * LB : d))} ${imperial ? 'lb' : 'kg'} ${d > 0 ? 'heavier' : 'lighter'}`); }
  if (me.heightCm && t.heightCm && Math.abs(t.heightCm - me.heightCm) >= 2) { const d = t.heightCm - me.heightCm; diffs.push(`${fmtDiff(d, imperial)} ${d > 0 ? 'taller' : 'shorter'}`); }
  return (
    <section className="card stack" data-testid="facing">
      <h2 className="eyebrow">Who are you up against?</h2>
      <div className="chips" role="group" aria-label="Opponent">
        {(Object.keys(FACING_LABEL) as Facing[]).map((k) => <button key={k} type="button" className="chip" aria-pressed={facing === k} onClick={() => upd({ ...t, pick: t.pick === k ? undefined : k })} data-testid={`facing-${k}`}>{FACING_LABEL[k]}</button>)}
      </div>
      <button className="btn btn-ghost btn-sm" style={{ alignSelf: 'flex-start' }} onClick={() => setNums(!nums)} aria-expanded={nums} data-testid="facing-nums">{nums ? 'Hide their numbers' : 'Know their height or weight? Enter it'}</button>
      {nums && (
        <div className="stack" style={{ gap: 10 }}>
          <div className="row">
            <LenField id="op-h" label="Their height" cm={t.heightCm} imperial={imperial} onChange={(v) => upd({ ...t, heightCm: v, pick: undefined })} testid="op-height" />
            <div className="field grow"><label className="label" htmlFor="op-w">Their weight ({imperial ? 'lb' : 'kg'})</label><input id="op-w" className="input" type="number" inputMode="decimal" value={t.weightKg ? Math.round(imperial ? t.weightKg * LB : t.weightKg) : ''} onChange={(e) => upd({ ...t, weightKg: e.target.value ? Number(e.target.value) / (imperial ? LB : 1) : undefined, pick: undefined })} data-testid="op-weight" /></div>
          </div>
          {(!me.heightCm || !me.weightKg) && <p className="small muted" style={{ margin: 0 }}>Add your own height and weight above to compare.</p>}
          <div className="chips" role="group" aria-label="Their stance">{(['orthodox', 'southpaw'] as Stance[]).map((s) => <button key={s} type="button" className="chip" aria-pressed={t.stance === s} onClick={() => upd({ ...t, stance: t.stance === s ? undefined : s })} data-testid={`op-stance-${s}`}>{s === 'orthodox' ? 'They’re orthodox' : 'They’re southpaw'}</button>)}</div>
        </div>
      )}
      {st ? (
        <div className="stack plan" data-testid="plan" data-facing={st.facing}>
          {diffs.length > 0 && <p className="small muted" style={{ margin: 0 }} data-testid="size-line">They’re {diffs.join(' and ')}</p>}
          <p className="h2" style={{ margin: 0 }} data-testid="plan-head">{st.headline}</p>
          <p style={{ margin: 0 }}>{st.summary}</p>
          <div><b className="small">Do this</b><ul className="tips">{st.doThis.map((x) => <li key={x}>{x}</li>)}</ul></div>
          <div><b className="small">Avoid</b><ul className="tips tips-avoid">{st.avoid.map((x) => <li key={x}>{x}</li>)}</ul></div>
          {stance && <div data-testid="stance-plan"><b className="small">{stance.title}</b><ul className="tips">{stance.tips.map((x) => <li key={x}>{x}</li>)}</ul></div>}
          <div><b className="small">Learn these first</b>
            <div className="chips" style={{ marginTop: 6 }}>{st.learnFirst.map((id) => { const l = LESSONS.find((x) => x.id === id); return l ? <button key={id} className="chip" onClick={() => onLesson(id)} data-testid={`learn-${id}`}>{l.title}</button> : null; })}</div>
          </div>
        </div>
      ) : <p className="small muted" style={{ margin: 0 }}>Pick one to get a game plan.</p>}
    </section>
  );
}

// ── Lesson path ─────────────────────────────────────────────────────────
function LessonPath({ lessons, progress, onOpen }: { lessons: Lesson[]; progress: Record<string, { count: number }>; onOpen: (l: Lesson) => void }) {
  const done = lessons.filter((l) => progress[l.id]?.count).length;
  const next = lessons.find((l) => !progress[l.id]?.count);
  const units = [...new Set(lessons.map((l) => l.unit))];
  return (
    <section className="card stack" data-testid="lessons">
      <div className="row-between"><h2 className="eyebrow">Learn to fight</h2><b className="small tnum" data-testid="lessons-done">{done} of {lessons.length}</b></div>
      <div className="progress-track"><div className="progress-fill" style={{ width: `${(done / lessons.length) * 100}%` }} /></div>
      {next && <button className="btn btn-primary btn-block" onClick={() => onOpen(next)} data-testid="lesson-next">{done ? 'Next lesson' : 'Start lesson 1'}: {next.title}</button>}
      {units.map((u) => (
        <div key={u} className="stack" style={{ gap: 6 }}>
          <span className="small muted" style={{ fontWeight: 700 }}>{u}</span>
          {lessons.filter((l) => l.unit === u).map((l) => {
            const n = lessons.indexOf(l) + 1, c = progress[l.id]?.count ?? 0;
            return (
              <button key={l.id} className={'lesson-row' + (c ? ' done' : '') + (next?.id === l.id ? ' next' : '')} onClick={() => onOpen(l)} data-testid={`lesson-${l.id}`}>
                <span className="lesson-n tnum" aria-hidden>{c ? '✓' : n}</span>
                <span className="grow" style={{ textAlign: 'left' }}>{l.title}</span>
                <span className="small muted">{c ? `Practiced ${plural(c, 'time')}` : next?.id === l.id ? 'Up next' : ''}</span>
              </button>
            );
          })}
        </div>
      ))}
    </section>
  );
}

function LessonSheet({ lesson: l, me, done, onClose, next }: { lesson: Lesson; me: { sport?: Sport; heightCm?: number; weightKg?: number }; done: number; onClose: () => void; next: () => void }) {
  const toast = useToast();
  const [drill, setDrill] = useState(false);
  const tips = buildTips(me);
  return (
    <Sheet title={l.title} onClose={onClose} label={l.title}>
      <div className="stack" data-testid="lesson-sheet">
        <p className="small muted" style={{ margin: 0 }}>{l.unit}</p>
        <p style={{ margin: 0 }}>{l.why}</p>
        <FightDiagram kind={l.diagram} />
        <div><b className="small">How to do it</b><ol className="steps-list">{l.steps.map((x) => <li key={x}>{x}</li>)}</ol></div>
        <div><b className="small">Common mistakes</b><ul className="tips tips-avoid">{l.mistakes.map((x) => <li key={x}>{x}</li>)}</ul></div>
        {l.id === 'stance' && me.sport && <p className="small muted" style={{ margin: 0 }}>Left-handed or more comfortable the other way? Try southpaw: right foot forward, and mirror everything.</p>}
        {tips && ['stance', 'footwork', 'angles', 'clinch'].includes(l.id) && <p className="small" style={{ margin: 0 }}><b>For your build ({tips.title.toLowerCase()}):</b> {tips.tips[0]}.</p>}
        <div className="card drill-box stack" style={{ gap: 8 }}>
          <b className="small">Drill · {plural(l.drill.rounds, 'round')} of {l.drill.sec >= 60 ? `${l.drill.sec / 60} min` : `${l.drill.sec} s`}</b>
          <p className="small" style={{ margin: 0 }}>{l.drill.text}</p>
          {drill ? <DrillTimer rounds={l.drill.rounds} sec={l.drill.sec} onDone={() => setDrill(false)} /> : <button className="btn btn-outline" onClick={() => setDrill(true)} data-testid="drill-start">Start drill</button>}
        </div>
        <button className="btn btn-primary btn-block" onClick={() => { store.practiceLesson(l.id); buzz([8, 40, 12]); toast(done ? 'Logged another practice' : 'Nice. Lesson done'); next(); }} data-testid="lesson-done">{done ? 'I practiced it again' : 'I practiced this'}</button>
      </div>
    </Sheet>
  );
}

/** A small round clock inside a lesson. */
function DrillTimer({ rounds, sec, onDone }: { rounds: number; sec: number; onDone: () => void }) {
  const [r, setR] = useState(1);
  const [rest, setRest] = useState(false);
  const [left, setLeft] = useState(sec);
  useEffect(() => {
    const id = setInterval(() => setLeft((x) => x - 1), 1000);
    return () => clearInterval(id);
  }, []);
  useEffect(() => {
    if (left > 0) return;
    if (!rest && r >= rounds) { buzz([200, 100, 200]); onDone(); return; }
    buzz(rest ? 60 : [120, 80, 120]);
    if (rest) { setRest(false); setR(r + 1); setLeft(sec); } else { setRest(true); setLeft(30); }
  }, [left]); // eslint-disable-line react-hooks/exhaustive-deps
  return (
    <div className="row-between" data-testid="drill-live">
      <span><b className="tnum" style={{ fontSize: 28 }}>{fmtClock(left)}</b><br /><span className="small muted">{rest ? 'Rest' : `Round ${r} of ${rounds}`}</span></span>
      <button className="btn btn-outline btn-sm" onClick={onDone}>Stop</button>
    </div>
  );
}

// ── Round timer ───────────────────────────────────────────────────────────
type Phase = 'idle' | 'ready' | 'work' | 'rest' | 'done';
function beep(freq = 880, ms = 180) {
  try {
    const Ctx = (window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext);
    const ctx = (beep as unknown as { c?: AudioContext }).c ?? ((beep as unknown as { c?: AudioContext }).c = new Ctx());
    const o = ctx.createOscillator(), g = ctx.createGain();
    o.frequency.value = freq; o.type = 'triangle'; g.gain.value = 0.18;
    o.connect(g).connect(ctx.destination); o.start(); g.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + ms / 1000); o.stop(ctx.currentTime + ms / 1000);
  } catch { /* no audio */ }
}

function RoundTimer({ sport, me }: { sport: Sport; me: Fighter }) {
  const pre = presetFor(sport);
  const [rounds, setRounds] = useState(pre.rounds);
  const [work, setWork] = useState(pre.workSec);
  const [rest, setRest] = useState(pre.restSec);
  const [phase, setPhase] = useState<Phase>('idle');
  const [round, setRound] = useState(1);
  const [left, setLeft] = useState(0);
  const [sound, setSound] = useState(true);
  const [logged, setLogged] = useState(false);
  const cues = useMemo(() => { try { const o = JSON.parse(localStorage.getItem(OPP_KEY) ?? '{}'); return matchup(me, o).cues; } catch { return matchup(me, {}).cues; } }, [me, phase === 'ready']); // eslint-disable-line react-hooks/exhaustive-deps
  const lock = useRef<{ release?: () => Promise<void> } | null>(null);
  const st = useRef({ phase, round, end: 0 });

  const bell = (n: number) => { buzz(n === 3 ? [200, 100, 200, 100, 200] : n === 2 ? [120, 80, 120] : 60); if (sound) for (let i = 0; i < n; i++) setTimeout(() => beep(n === 1 ? 1200 : 660, 220), i * 260); };
  const enter = (p: Phase, sec: number, r = st.current.round) => { st.current = { phase: p, round: r, end: Date.now() + sec * 1000 }; setPhase(p); setRound(r); setLeft(sec); };

  useEffect(() => {
    if (phase === 'idle' || phase === 'done') return;
    const id = setInterval(() => {
      const s = st.current;
      const l = Math.ceil((s.end - Date.now()) / 1000);
      if (l === 10 && s.phase === 'work') { buzz([30, 60, 30]); if (sound) beep(1500, 90); }
      if (l <= 0) {
        if (s.phase === 'ready') { bell(1); enter('work', work, 1); }
        else if (s.phase === 'work') { if (s.round >= rounds) { bell(3); setPhase('done'); st.current.phase = 'done'; release(); } else { bell(2); enter('rest', rest); } }
        else if (s.phase === 'rest') { bell(1); enter('work', work, s.round + 1); }
        return;
      }
      setLeft(l);
    }, 250);
    return () => clearInterval(id);
  }, [phase, rounds, work, rest, sound]); // eslint-disable-line react-hooks/exhaustive-deps

  const release = () => { lock.current?.release?.().catch(() => {}); lock.current = null; };
  const start = async () => {
    try { lock.current = await (navigator as unknown as { wakeLock?: { request: (t: string) => Promise<{ release: () => Promise<void> }> } }).wakeLock?.request('screen') ?? null; } catch { /* ignore */ }
    if (sound) beep(1, 1); // unlock audio on iOS within the tap
    enter('ready', 5, 1);
  };
  const stop = () => { setPhase('idle'); st.current.phase = 'idle'; release(); };
  useEffect(() => () => release(), []);

  const running = phase !== 'idle' && phase !== 'done';
  const total = phase === 'work' ? work : phase === 'rest' ? rest : 5;
  const pct = running ? Math.max(0, Math.min(1, left / total)) : 1;
  const cue = cues[(round - 1) % Math.max(1, cues.length)];
  return (
    <section className="card stack" data-testid="round-timer">
      <h2 className="eyebrow">Round timer</h2>
      {!running && phase !== 'done' && (
        <>
          <Picker label="Rounds" value={String(rounds)} onChange={(v) => setRounds(Number(v))} options={['1', '3', '5', '8', '12']} test="rt-rounds" />
          <Picker label="Round length" value={String(work)} onChange={(v) => setWork(Number(v))} options={['60', '120', '180', '300']} fmt={(v) => `${Number(v) / 60} min`} test="rt-work" />
          <Picker label="Rest" value={String(rest)} onChange={(v) => setRest(Number(v))} options={['30', '60', '120']} fmt={(v) => Number(v) < 60 ? `${v} s` : `${Number(v) / 60} min`} test="rt-rest" />
          <label className="check-row small"><input type="checkbox" checked={sound} onChange={(e) => setSound(e.target.checked)} /> Bell sound</label>
          <button className="btn btn-primary btn-block" onClick={start} data-testid="rt-start">Start {plural(rounds, 'round')}</button>
        </>
      )}
      {running && (
        <div className="rt" data-phase={phase} data-testid="rt-live">
          <div className="rt-ring" style={{ ['--p' as string]: pct }}>
            <div className="rt-inner">
              <span className="rt-label">{phase === 'ready' ? 'Get ready' : phase === 'work' ? `Round ${round} of ${rounds}` : 'Rest'}</span>
              <span className="rt-time tnum" data-testid="rt-time">{fmtClock(left)}</span>
              {phase === 'work' && cue && <span className="rt-cue" data-testid="rt-cue">{cue}</span>}
              {phase === 'rest' && <span className="rt-cue">Next: {cues[round % Math.max(1, cues.length)]}</span>}
            </div>
          </div>
          <button className="btn btn-outline btn-block" onClick={stop} data-testid="rt-stop">Stop</button>
        </div>
      )}
      {phase === 'done' && (
        <div className="stack" data-testid="rt-done">
          <p className="h2" style={{ margin: 0 }}>{plural(rounds, 'round')} done.</p>
          {logged
            ? <p className="small muted" style={{ margin: 0 }} data-testid="rt-logged">Logged in your workouts.</p>
            : <button className="btn btn-primary" onClick={() => { store.logRounds(rounds, work, sport); setLogged(true); buzz([8, 40, 12]); }} data-testid="rt-log">Log these rounds</button>}
          <button className="btn btn-outline" onClick={() => { setPhase('idle'); setLogged(false); }}>Again</button>
        </div>
      )}
    </section>
  );
}

function Picker({ label, value, onChange, options, fmt, test }: { label: string; value: string; onChange: (v: string) => void; options: string[]; fmt?: (v: string) => string; test: string }) {
  return (
    <div className="field"><span className="label">{label}</span>
      <SlidingPicker label={label} value={value} onChange={onChange} testPrefix={test} options={options.map((o) => ({ id: o, label: fmt ? fmt(o) : o }))} />
    </div>
  );
}
