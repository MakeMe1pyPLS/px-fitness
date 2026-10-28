import React, { useState } from 'react';
import { flushSync } from 'react-dom';
import { Icon, store, useData, useToast, type Route } from '../components/core';
import { CheckinSheet, SkipSheet, WeekLegend, WeekStrip } from '../components/widgets';
import { ChatCheckin } from '../components/ChatCheckin';
import { CountUp, Reveal, Ring, SlidingPicker } from '../components/motion';
import { activeSession, estimateMinutes, isTrainingDay, nextTemplate, shortVersion } from '../lib/planner';
import { getExercise } from '../lib/exercises';
import { addDays, DAY_LONG, toDateKey, weekStart } from '../lib/dates';
import { completedSessions, daysSinceLastWorkout, planWindow, sessionsOn, setsDone } from '../lib/stats';
import { computeInsights } from '../lib/insights';
import { budgetSummary } from '../lib/nutrition';
import { withViewTransition } from '../lib/motion';
import { BRAND } from '../brand';
import type { AppData } from '../lib/types';

// Original mood glyphs (simple faces; no emoji, consistent stroke with the icon set).
const face = (mouth: string) => (
  <svg width="20" height="20" viewBox="0 0 24 24" aria-hidden fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><circle cx="12" cy="12" r="9" /><circle cx="9" cy="10" r="0.6" fill="currentColor" /><circle cx="15" cy="10" r="0.6" fill="currentColor" /><path d={mouth} /></svg>
);
const MOODS = [
  { id: 'low', label: 'Low', value: 2, icon: face('M8.5 16c1-1.3 2.2-2 3.5-2s2.5.7 3.5 2') },
  { id: 'okay', label: 'Okay', value: 3, icon: face('M9 15h6') },
  { id: 'good', label: 'Good', value: 4, icon: face('M8.5 14.5c1 1.2 2.2 1.8 3.5 1.8s2.5-.6 3.5-1.8') },
  { id: 'great', label: 'Great', value: 5, icon: face('M8 14c1 2 2.4 3 4 3s3-1 4-3Z') },
] as const;
type MoodId = (typeof MOODS)[number]['id'];

/** Weeks in a row with at least one session. Missing a day never resets it; the current week can't break it. */
function activeWeeks(data: AppData, today: string) {
  const done = new Set(completedSessions(data).map((s) => weekStart(s.plannedFor)));
  let ws = weekStart(today);
  if (!done.has(ws)) ws = addDays(ws, -7);
  let n = 0;
  while (done.has(ws)) { n++; ws = addDays(ws, -7); }
  return n;
}

const EXP: Record<string, string> = { beginner: 'beginner friendly', intermediate: 'intermediate', advanced: 'advanced' };

export function Home({ go }: { go: (r: Route) => void }) {
  const data = useData();
  const toast = useToast();
  const [sheet, setSheet] = useState<'checkin' | 'skip' | 'chat' | null>(null);
  const [chatMood, setChatMood] = useState<{ label: string; value: number } | undefined>();
  const [promo, setPromo] = useState(() => { try { return localStorage.getItem('px:promo') !== 'hidden'; } catch { return true; } });
  const p = data.profile!;
  const today = toDateKey(new Date());
  const t = nextTemplate(data);
  const active = activeSession(data);
  const doneToday = sessionsOn(data, today);
  const skippedToday = data.skips.find((s) => s.date === today);
  const planned = isTrainingDay(p, today);
  const checkin = data.checkins.find((c) => c.date === today);
  const ws = weekStart(today);
  const week = planWindow(data, ws, addDays(ws, 6), addDays(today, 1));
  const weekDone = completedSessions(data).filter((s) => s.plannedFor >= ws && s.plannedFor <= addDays(ws, 6)).length;
  const goal = Math.max(1, p.trainingDays.length);
  const streak = activeWeeks(data, today);
  const insights = computeInsights(data);
  const gap = daysSinceLastWorkout(data);
  const budget = budgetSummary(data);
  const mood = MOODS.find((m) => m.value === checkin?.mood)?.id as MoodId | undefined;

  const fullMin = t ? estimateMinutes(t) : 0;
  const shortMin = t ? estimateMinutes({ exercises: shortVersion(t) }) : 0;

  const reasons: string[] = [];
  let preferShort = false;
  if (checkin?.energy !== undefined && checkin.energy <= 2) { reasons.push(`energy ${checkin.energy}/5`); preferShort = true; }
  if (checkin?.sleepHours !== undefined && checkin.sleepHours <= 5) { reasons.push(`about ${checkin.sleepHours} h sleep`); preferShort = true; }
  if (checkin?.availableMinutes !== undefined && checkin.availableMinutes < fullMin) { reasons.push(`${checkin.availableMinutes} min free`); preferShort = true; }
  if ((checkin?.soreness ?? 0) >= 4) { reasons.push('very sore'); preferShort = true; }
  const leadShort = preferShort && (data.settings.suggestShortWhenLow || (checkin?.availableMinutes ?? 999) < fullMin || (checkin?.soreness ?? 0) >= 4);

  // Trigger: Start. Start: the workout card. Move: View Transition morph into the
  // workout header. Settle: workout screen. Reduced motion / unsupported: instant.
  const start = (variant: 'full' | 'short') => withViewTransition(() => flushSync(() => { store.startSession(variant); go('workout'); }));

  const nextPlanned = (() => {
    for (let i = 1; i <= 7; i++) { const d = addDays(today, i); if (isTrainingDay(p, d)) return DAY_LONG[new Date(d + 'T12:00').getDay()]; }
    return null;
  })();

  const pickMood = (id: MoodId) => {
    const m = MOODS.find((x) => x.id === id)!;
    store.saveCheckin(today, { mood: m.value });
  };

  let i = 0; // stagger index for Reveal
  return (
    <div className="page dash">
      <Reveal i={i++} className="dash-top">
        <div className="row" style={{ gap: 10 }}>
          <span className="px-avatar" aria-hidden>{BRAND.monogram}</span>
          <div><b>{BRAND.name}</b><div className="small muted">Private on this device</div></div>
        </div>
        <button className="btn btn-outline" onClick={() => go('you')}>{p.name ? p.name : 'Profile'}</button>
      </Reveal>

      {promo && (
        <Reveal i={i++} className="promo" role="note">
          <div>
            <b>Progress that fits real life</b>
            <p className="small muted">Coaching, training and meals that flex around your week.</p>
            <button className="link" onClick={() => go('coach')}>Explore coaching →</button>
          </div>
          <button className="icon-btn" aria-label="Dismiss" onClick={() => { setPromo(false); try { localStorage.setItem('px:promo', 'hidden'); } catch { /* ignore */ } }}><Icon.close size={18} /></button>
        </Reveal>
      )}

      <Reveal i={i++} as="section" className="hero-card" aria-labelledby="welcome-h">
        <div className="aura" aria-hidden />
        <div className="hero-copy">
          <span className="eyebrow">Your fitness, your pace</span>
          <h1 id="welcome-h" className="display hero-h">Welcome{p.name ? ` back, ${p.name}` : ' to PX'}<span className="ember-dot">.</span></h1>
          <p className="muted">A clear plan for training, food, and progress you can keep.</p>
        </div>
        <div className="hero-ring">
          <Ring value={weekDone} max={goal} label={`${weekDone} of ${goal} sessions this week`}>
            <b className="ring-num"><CountUp value={weekDone} testId="ring-count" /><span className="ring-of">/{goal}</span></b>
            <span className="small muted">this week</span>
          </Ring>
          <div className="stack" style={{ gap: 6 }}>
            <span className="eyebrow">One day at a time</span>
            <p className="small">{weekDone >= goal ? 'Weekly goal reached. Anything else is a bonus.' : weekDone === 0 ? 'Build strength for the life you live.' : `${goal - weekDone} to go this week.`}</p>
            <div className="row wrap" style={{ gap: 6 }}>
              <button className="btn btn-primary" onClick={() => go('coach')} data-testid="hero-coaching">Coaching plans →</button>
              <button className="btn btn-outline" onClick={() => go('progress')}>View progress</button>
            </div>
          </div>
        </div>
      </Reveal>

      <div className="tiles">
        <Reveal i={i++} className="tile"><span className="tile-k">Weekly sessions</span><b className="tile-v"><CountUp value={weekDone} delay={80} /><span className="tile-s"> / {goal} goal</span></b></Reveal>
        <Reveal i={i++} className="tile" title="Weeks in a row with at least one session. Missing a day never resets it."><span className="tile-k">Active streak</span><b className="tile-v"><CountUp value={streak} delay={140} /><span className="tile-s"> {streak === 1 ? 'week' : 'weeks'}</span></b></Reveal>
        <Reveal i={i++} className={'tile' + (checkin ? ' tile-done' : '')}><span className="tile-k">Next check-in</span><b className="tile-v" data-testid="tile-checkin">{!p.checkinsEnabled ? 'Off' : checkin ? <span className="row" style={{ gap: 6 }}><span className="tick-pop"><Icon.check size={18} /></span>Done</span> : 'Today'}</b></Reveal>
        <button className="tile tile-btn reveal in" style={{ ['--i' as string]: i++ }} onClick={() => go(budget ? 'diet-budget' : 'diet')}>
          <span className="tile-k">Meal budget</span>
          <b className="tile-v">{budget ? <><CountUp value={Math.max(0, budget.remaining)} format={(n) => `$${Math.round(n)}`} delay={200} /><span className="tile-s"> left / week</span></> : <span className="tile-s" style={{ fontSize: 'var(--t-md)' }}>Set a budget</span>}</b>
        </button>
      </div>

      {active ? (
        <Reveal i={i++} as="section" className="card card-ink today stack vt-workout">
          <span className="eyebrow">In progress</span>
          <h2 className="today-name display">{active.name}</h2>
          <p className="muted">{setsDone(active)} sets logged. Everything is saved, so pick up where you left off.</p>
          <button className="btn btn-primary btn-lg btn-block" onClick={() => withViewTransition(() => flushSync(() => go('workout')))} data-testid="resume">Resume workout</button>
        </Reveal>
      ) : doneToday.length ? (
        <Reveal i={i++} as="section" className="card card-ink today stack">
          <span className="eyebrow">Today’s workout</span>
          <h2 className="today-name display">Done<span className="ember-dot">.</span></h2>
          <p className="muted">{doneToday[0].name} · {setsDone(doneToday[0])} sets. Recovery is part of the plan too.</p>
          {nextPlanned && <p className="small muted">Next up: {t?.name} on {nextPlanned}.</p>}
        </Reveal>
      ) : skippedToday ? (
        <Reveal i={i++} as="section" className="card card-ink today stack">
          <span className="eyebrow">Today’s workout</span>
          <h2 className="today-name display">Rest day</h2>
          <p className="muted">Logged. Nothing to make up. {nextPlanned ? `${t?.name} is waiting on ${nextPlanned}.` : ''}</p>
          <div className="row wrap">
            <button className="btn btn-outline btn-sm" onClick={() => store.removeSkip(today)}>Undo</button>
            <button className="btn btn-outline btn-sm" onClick={() => start('short')}>Changed my mind: short session</button>
          </div>
        </Reveal>
      ) : t ? (
        <Reveal i={i++} as="section" className="card card-ink today stack vt-workout" aria-labelledby="today-name">
          <span className="eyebrow">{planned ? 'Today’s workout' : 'Rest day · optional'}</span>
          <div>
            <h2 id="today-name" className="today-name display">{t.name}</h2>
            <p className="muted small">{t.focus ? `${t.focus} · ` : ''}{fullMin} min · {EXP[p.experience]}</p>
          </div>
          <ul className="ex-list stagger">
            {t.exercises.map((e, k) => <li key={e.exerciseId} style={{ ['--k' as string]: k }}><span>{getExercise(e.exerciseId, data.customExercises)?.name}</span><span>{e.sets} × {e.target}</span></li>)}
          </ul>
          <div className="why" data-testid="why">
            {preferShort ? (
              <>You checked in with <strong>{reasons.join(', ')}</strong>. The short version (first 3 exercises, ~{shortMin} min) may fit today better. It still counts.</>
            ) : gap !== null && gap >= 7 ? (
              <>It’s been <strong>{gap} days</strong>. Welcome back. Nothing to catch up on; the plan just picks up where you left off.</>
            ) : planned ? (
              <>A flexible strength session. {p.checkinsEnabled && !checkin ? 'A quick check-in below can tailor it.' : 'Swap any exercise if equipment is busy.'}</>
            ) : (
              <>Not on your plan today. A bonus session is welcome, and so is rest.</>
            )}
          </div>
          <div className="stack" style={{ gap: 8 }}>
            {leadShort ? (
              <>
                <button className="btn btn-primary btn-lg btn-block" onClick={() => start('short')} data-testid="start-short">Start short version · {shortMin} min</button>
                <button className="btn btn-outline btn-block" onClick={() => start('full')} data-testid="start-full">Full session · {fullMin} min</button>
              </>
            ) : (
              <>
                <button className="btn btn-primary btn-lg btn-block" onClick={() => start('full')} data-testid="start-full">Start · {fullMin} min</button>
                <button className="btn btn-outline btn-block" onClick={() => start('short')} data-testid="start-short">Short version · {shortMin} min</button>
              </>
            )}
            {planned && <button className="btn btn-ghost btn-block" onClick={() => setSheet('skip')} data-testid="skip-today">Not today</button>}
          </div>
        </Reveal>
      ) : null}

      {p.checkinsEnabled && (
        <Reveal i={i++} as="section" className="card stack" aria-labelledby="ci-h">
          <div className="row-between">
            <h2 id="ci-h" style={{ fontSize: 'var(--t-lg)' }}>How are you feeling today?</h2>
            <span className="badge">Private check-in</span>
          </div>
          <SlidingPicker label="Mood" options={MOODS.map((m) => ({ id: m.id, label: m.label, icon: m.icon }))} value={mood} onChange={(id) => { pickMood(id); toast('Check-in saved'); }} testPrefix="mood" />
          <p className="small muted">No pressure to be perfect. Your plan can flex with you.</p>
          {checkin && (
            <div className="row wrap" style={{ gap: 6 }}>
              {checkin.energy !== undefined && <span className="badge">Energy {checkin.energy}/5</span>}
              {checkin.sleepHours !== undefined && <span className="badge">Sleep {checkin.sleepHours} h</span>}
              {checkin.availableMinutes !== undefined && <span className="badge">{checkin.availableMinutes} min free</span>}
              {checkin.soreness !== undefined && checkin.soreness >= 3 && <span className="badge">Sore</span>}
            </div>
          )}
          <div className="row" style={{ gap: 8 }}>
            <button className="btn btn-ink grow" onClick={() => { const m = MOODS.find((x) => x.id === mood); setChatMood(m ? { label: m.label, value: m.value } : undefined); setSheet('chat'); }} data-testid="open-chat">{checkin?.energy !== undefined ? 'Update in chat' : mood ? 'Tell me more' : 'Check in'}</button>
            <button className="btn btn-outline" onClick={() => setSheet('checkin')} data-testid="open-checkin">{checkin ? 'Edit' : 'Form'}</button>
          </div>
        </Reveal>
      )}

      <Reveal i={i++} as="section" className="card stack" aria-labelledby="wk-h">
        <div className="row-between">
          <h2 id="wk-h" style={{ fontSize: 'var(--t-lg)' }}>This week’s plan</h2>
          <span className="small"><b className="tnum">{week.done}</b> <span className="muted">of {Array.from({ length: 7 }, (_, k) => addDays(ws, k)).filter((d) => isTrainingDay(p, d) && d >= toDateKey(new Date(p.createdAt))).length} planned{week.extra ? ` · +${week.extra} bonus` : ''}</span></span>
        </div>
        <WeekStrip data={data} />
        <WeekLegend />
        <button className="link" style={{ alignSelf: 'flex-start' }} onClick={() => go('you')}>See plan →</button>
      </Reveal>

      <Reveal i={i++} as="section" className="card stack" aria-labelledby="mb-h">
        <h2 id="mb-h" style={{ fontSize: 'var(--t-lg)' }}>Make food fit your budget</h2>
        {budget ? (
          <>
            <div className="row-between small"><span><b className="tnum">${Math.round(budget.plannedGrocery + budget.spentGrocery)}</b> <span className="muted">planned of ${Math.round(budget.groceryBudget || budget.weekly)}</span></span><span className="muted">this week</span></div>
            <div className="meter-anim" aria-hidden><i style={{ ['--w' as string]: `${Math.min(100, ((budget.plannedGrocery + budget.spentGrocery) / Math.max(1, budget.groceryBudget || budget.weekly)) * 100)}%` }} /></div>
            <p className="small muted">Planned groceries plus what you’ve logged. Prices are estimates.</p>
          </>
        ) : <p className="small muted">Set a weekly food budget and the meal planner keeps suggestions within it.</p>}
        <button className="link" style={{ alignSelf: 'flex-start' }} onClick={() => go('diet')}>Meal planner →</button>
      </Reveal>

      {insights[0] && (
        <Reveal i={i++}>
          <button className="card stack card-press" style={{ textAlign: 'left', cursor: 'pointer', width: '100%' }} onClick={() => go('insights')}>
            <div className="row-between"><span className="eyebrow">Pattern spotted</span><span className={'badge ' + (insights[0].strength === 'consistent' ? 'badge-moss' : 'badge-ember')}>{insights[0].strength === 'consistent' ? 'Consistent' : 'Early signal'}</span></div>
            <b className="display" style={{ fontSize: 'var(--t-xl)' }}>{insights[0].title}</b>
            <span className="row small" style={{ fontWeight: 700 }}>See the evidence <Icon.arrow size={16} /></span>
          </button>
        </Reveal>
      )}

      <Reveal i={i++}>
        <button className="card stack card-press coach-prompt" style={{ textAlign: 'left', cursor: 'pointer', width: '100%' }} onClick={() => go('coach')} data-testid="home-coaching">
          <b style={{ fontSize: 'var(--t-lg)' }}>{data.coach.profile.name ? `Train with ${data.coach.profile.name}` : 'Want a coach in your corner?'}</b>
          <span className="small muted">1–3 sessions a week{data.coach.tiers.length ? `, from $${Math.min(...data.coach.tiers.map((x) => x.pricePerSession))} a session` : ''}. More sessions cost less each.</span>
          <span className="small" style={{ fontWeight: 700 }}>View coaching options →</span>
        </button>
      </Reveal>

      <p className="small muted">General fitness support only, not medical or mental-health diagnosis or treatment. Adjust movements to how you feel, and talk to a professional about any health concerns.</p>

      {sheet === 'checkin' && <CheckinSheet data={data} date={today} onClose={() => setSheet(null)} />}
      {sheet === 'skip' && <SkipSheet date={today} onClose={() => setSheet(null)} />}
      {sheet === 'chat' && <ChatCheckin onClose={() => setSheet(null)} go={go} initialMood={chatMood} />}
    </div>
  );
}
