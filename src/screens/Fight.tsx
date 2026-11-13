// Fight camp: combat profile, matchup plan by size and stance, camp phase
// countdown, and a round timer that calls your game-plan cues each round.

import React, { useEffect, useMemo, useRef, useState } from 'react';
import { Icon, store, useData, useToast, type Route } from '../components/core';
import { SlidingPicker } from '../components/motion';
import { buzz } from '../lib/fx';
import { toDateKey, formatShortDate, plural } from '../lib/dates';
import { SPORTS, STANCE_LABEL, campPhase, fmtClock, fmtDiff, fmtHeight, matchup, presetFor, type Fighter, type Opponent, type Sport, type Stance } from '../lib/combat';

const OPP_KEY = 'px:opponent';
const IN = 2.54, LB = 2.20462;

export function Fight({ go }: { go: (r: Route) => void }) {
  const data = useData();
  const f = data.combat;
  const [editing, setEditing] = useState(!f);
  const imperial = (data.profile?.unit ?? 'lb') === 'lb';
  return (
    <div className="page stack-lg">
      <header className="page-head row" style={{ gap: 10 }}>
        <button className="icon-btn" aria-label="Back" onClick={() => go('home')}><Icon.back /></button>
        <h1 className="page-title display">Fight camp</h1>
      </header>
      {editing || !f
        ? <ProfileForm initial={f} imperial={imperial} heightCm={data.nutrition?.prefs?.heightCm} weightKg={data.nutrition?.prefs?.weightKg} onDone={() => setEditing(false)} onCancel={f ? () => setEditing(false) : undefined} />
        : <>
          <ProfileSummary f={f} imperial={imperial} onEdit={() => setEditing(true)} />
          {f.fightDate && <Camp f={f} />}
          <MatchupCard me={f} imperial={imperial} />
          <RoundTimer sport={f.sport} me={f} />
        </>}
      <p className="small muted">General fight principles to talk through with your coach. Making weight: plan it with your coach and a doctor, and don’t crash diet or dehydrate.</p>
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

function ProfileSummary({ f, imperial, onEdit }: { f: Fighter; imperial: boolean; onEdit: () => void }) {
  const bits = [f.sport, f.stance && STANCE_LABEL[f.stance].split(' (')[0], f.heightCm && fmtHeight(f.heightCm, imperial), f.reachCm && `${fmtHeight(f.reachCm, imperial)} reach`, f.weightKg && `${Math.round(imperial ? f.weightKg * LB : f.weightKg)} ${imperial ? 'lb' : 'kg'}`].filter(Boolean);
  return (
    <section className="card row-between" data-testid="fight-profile">
      <div><h2 className="eyebrow">You</h2><p className="h3" style={{ margin: 0 }}>{bits.join(' · ')}</p></div>
      <button className="btn btn-outline btn-sm" onClick={onEdit} data-testid="ft-edit">Edit</button>
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

// ── Matchup ───────────────────────────────────────────────────────────────
function MatchupCard({ me, imperial }: { me: Fighter; imperial: boolean }) {
  const [opp, setOpp] = useState<Opponent>(() => { try { return JSON.parse(localStorage.getItem(OPP_KEY) ?? '{}'); } catch { return {}; } });
  const upd = (o: Opponent) => { setOpp(o); try { localStorage.setItem(OPP_KEY, JSON.stringify(o)); } catch { /* ignore */ } };
  const m = useMemo(() => matchup(me, opp), [me, opp]);
  const known = !!(opp.heightCm || opp.reachCm);
  const sizeLine = m.reachDiffCm !== null && Math.abs(m.reachDiffCm) >= 1
    ? `${m.reachDiffCm > 0 ? 'Longer' : 'Shorter'} reach by ${fmtDiff(m.reachDiffCm, imperial)}${m.reachEstimated ? ' (estimated from height)' : ''}`
    : m.heightDiffCm !== null ? (Math.abs(m.heightDiffCm) < 2 ? 'About the same height' : `${m.heightDiffCm > 0 ? 'Taller' : 'Shorter'} by ${fmtDiff(m.heightDiffCm, imperial)}`) : null;
  return (
    <section className="card stack" data-testid="matchup">
      <h2 className="eyebrow">Game plan vs your opponent</h2>
      {!me.heightCm && <p className="small muted">Add your height to your profile to compare sizes.</p>}
      <div className="row">
        <LenField id="op-h" label="Their height" cm={opp.heightCm} imperial={imperial} onChange={(v) => upd({ ...opp, heightCm: v })} testid="op-height" />
        <LenField id="op-r" label="Their reach" cm={opp.reachCm} imperial={imperial} onChange={(v) => upd({ ...opp, reachCm: v })} testid="op-reach" />
      </div>
      <div className="chips" role="group" aria-label="Their stance">{(['orthodox', 'southpaw'] as Stance[]).map((s) => <button key={s} type="button" className="chip" aria-pressed={opp.stance === s} onClick={() => upd({ ...opp, stance: opp.stance === s ? undefined : s })} data-testid={`op-stance-${s}`}>{s === 'orthodox' ? 'They’re orthodox' : 'They’re southpaw'}</button>)}</div>
      {known && me.heightCm ? (
        <div className="stack plan" data-testid="plan" data-size={m.size}>
          {sizeLine && <p className="small muted" style={{ margin: 0 }} data-testid="size-line">{sizeLine}</p>}
          <p className="h2" style={{ margin: 0 }} data-testid="plan-head">{m.headline}</p>
          <p style={{ margin: 0 }}>{m.summary}</p>
          <div><b className="small">Do this</b><ul className="tips">{m.doThis.map((t) => <li key={t}>{t}</li>)}</ul></div>
          <div><b className="small">Avoid</b><ul className="tips tips-avoid">{m.avoid.map((t) => <li key={t}>{t}</li>)}</ul></div>
          {m.stance && <div data-testid="stance-plan"><b className="small">{m.stance.title}</b><ul className="tips">{m.stance.tips.map((t) => <li key={t}>{t}</li>)}</ul></div>}
        </div>
      ) : <p className="small muted" style={{ margin: 0 }}>Enter their height (and reach if you know it) to get a plan.</p>}
    </section>
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
          <button className="btn btn-outline" onClick={() => setPhase('idle')}>Again</button>
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
