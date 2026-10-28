import React, { useState } from 'react';
import { store, useData, useToast, type Route } from '../components/core';
import { LineChart } from '../components/widgets';
import { computeInsights, insightReadiness, recommendationOutcome, RULE_LABELS, type Insight } from '../lib/insights';
import { addDays, formatShortDate, toDateKey } from '../lib/dates';

const md = (k: string) => `${Number(k.slice(5, 7))}/${Number(k.slice(8, 10))}`;

function InsightCard({ ins }: { ins: Insight }) {
  const toast = useToast();
  return (
    <article className="card insight" aria-labelledby={`i-${ins.id}`} data-testid={`insight-${ins.id}`}>
      <div className="row-between">
        <span className="eyebrow">{RULE_LABELS[ins.id]}</span>
        <span className={'badge ' + (ins.strength === 'consistent' ? 'badge-moss' : 'badge-ember')} title={ins.strength === 'consistent' ? 'Each group has 6 or more days' : 'Each group has 3–5 days. Treat this as a hunch.'}>
          <span className="dot" />{ins.strength === 'consistent' ? 'Consistent pattern' : 'Early signal'}
        </span>
      </div>
      <h2 id={`i-${ins.id}`} className="insight-title display">{ins.title}</h2>
      <p>{ins.observation}</p>
      <div className="evidence" aria-label="Evidence">
        {ins.evidence.map((e) => (
          <div key={e.label} className="ev-row">
            <span className="small">{e.label}</span>
            <span className="small tnum"><b>{e.done}</b> / {e.total}</span>
            <div className="ev-bar" aria-hidden><i style={{ width: `${e.total ? (e.done / e.total) * 100 : 0}%` }} /></div>
          </div>
        ))}
      </div>
      <div className="why-box"><b>Why this might help: </b>{ins.why}</div>
      <p className="small muted">{ins.caveat}</p>
      <div className="stack" style={{ gap: 8 }}>
        <button className="btn btn-ink btn-block" data-testid={`accept-${ins.id}`} onClick={() => { store.decide(ins, 'accepted'); toast(ins.action.kind === 'acknowledge' ? 'Noted' : 'Done. The app will track whether it helps.'); }}>{ins.action.label}</button>
        <div className="row" style={{ justifyContent: 'center' }}>
          <button className="btn btn-ghost btn-sm" onClick={() => { store.decide(ins, 'dismissed'); toast('Hidden for 3 weeks'); }}>Not now</button>
          <button className="btn btn-ghost btn-sm" onClick={() => { store.decide(ins, 'not_accurate'); toast('Thanks. This pattern is hidden for 6 weeks.'); }}>This isn’t right</button>
        </div>
      </div>
    </article>
  );
}

export function Insights({ go }: { go: (r: Route) => void }) {
  const data = useData();
  const [metric, setMetric] = useState<'energy' | 'mood' | 'sleepHours'>('energy');
  const insights = computeInsights(data);
  const ready = insightReadiness(data);
  const today = toDateKey(new Date());
  const days = Array.from({ length: 28 }, (_, i) => addDays(today, i - 27));
  const byDate = new Map(data.checkins.map((c) => [c.date, c]));
  const pts = days.map((d) => ({ x: md(d), y: (byDate.get(d)?.[metric] as number | undefined) ?? null }));
  const checkinCount = days.filter((d) => byDate.get(d)?.[metric] !== undefined).length;
  const decisions = [...data.recommendations].sort((a, b) => b.createdAt.localeCompare(a.createdAt));

  return (
    <div className="page">
      <header className="page-head"><h1 className="page-title display">Insights</h1></header>
      <p className="muted">Patterns from your own log, each with the counts behind it. They show what tends to happen together, not what causes what.</p>

      {insights.length ? insights.map((i) => <InsightCard key={i.id} ins={i} />) : (
        <section className="card stack">
          <h2 className="display" style={{ fontSize: 'var(--t-xl)' }}>Still learning your week</h2>
          <p className="muted">Insights appear once there’s enough data to compare fairly, usually after 2–3 weeks. Until then, nothing is guessed.</p>
          <div className="readiness">
            <div><div className="row-between small"><span>Planned days resolved</span><b className="tnum">{Math.min(ready.plannedDays, ready.plannedTarget)} / {ready.plannedTarget}</b></div><div className="meter"><i style={{ width: `${Math.min(100, (ready.plannedDays / ready.plannedTarget) * 100)}%` }} /></div></div>
            {data.profile!.checkinsEnabled && <div><div className="row-between small"><span>Check-ins</span><b className="tnum">{Math.min(ready.checkins, ready.checkinTarget)} / {ready.checkinTarget}</b></div><div className="meter"><i style={{ width: `${Math.min(100, (ready.checkins / ready.checkinTarget) * 100)}%` }} /></div></div>}
          </div>
          <p className="small muted">Logging a reason when you skip a day also helps.</p>
        </section>
      )}

      {data.profile!.checkinsEnabled && (
        <section className="card stack" aria-labelledby="t-h">
          <div className="row-between">
            <h2 id="t-h" className="eyebrow">Last 28 days</h2>
            <div className="seg" role="group" aria-label="Check-in metric">
              <button aria-pressed={metric === 'energy'} onClick={() => setMetric('energy')}>Energy</button>
              <button aria-pressed={metric === 'mood'} onClick={() => setMetric('mood')}>Mood</button>
              <button aria-pressed={metric === 'sleepHours'} onClick={() => setMetric('sleepHours')}>Sleep</button>
            </div>
          </div>
          <LineChart label={`${metric} over the last 28 days`} points={pts} min={metric === 'sleepHours' ? 4 : 1} max={metric === 'sleepHours' ? 10 : 5} />
          <p className="small muted">{checkinCount} of 28 days logged. Gaps are days without a check-in; nothing is filled in.</p>
        </section>
      )}

      {decisions.length > 0 && (
        <section className="card" aria-labelledby="d-h">
          <h2 id="d-h" className="eyebrow" style={{ marginBottom: 8 }}>Your decisions</h2>
          <div className="list">
            {decisions.map((r) => {
              const o = r.status === 'accepted' ? recommendationOutcome(data, r) : null;
              return (
                <div key={r.id} className="list-row" style={{ alignItems: 'flex-start' }}>
                  <div className="stack" style={{ gap: 2 }}>
                    <b>{r.summary}</b>
                    <span className="small muted">{r.status === 'accepted' ? 'Accepted' : r.status === 'dismissed' ? 'Not now' : 'Marked not accurate'} · {formatShortDate(toDateKey(new Date(r.createdAt)))}</span>
                    {o && (o.ready
                      ? <span className="small">Planned days hit: <b>{o.before.rate === null ? '—' : Math.round(o.before.rate * 100) + '%'}</b> in the 2 weeks before → <b>{o.after.rate === null ? '—' : Math.round(o.after.rate * 100) + '%'}</b> after ({o.after.planned} planned days). Other things changed too, so read this loosely.</span>
                      : <span className="small muted">Measuring: day {o.daysObserved} of 14.</span>)}
                  </div>
                </div>
              );
            })}
          </div>
        </section>
      )}

      <button className="link" onClick={() => go('you')} style={{ alignSelf: 'flex-start' }}>Choose which patterns the app looks for</button>
      <p className="small muted">Mood tracking here is for reflection and training decisions. It can’t diagnose anything. If low mood is persistent or heavy, talking to a professional can help.</p>
    </div>
  );
}
