import React from 'react';
import { DISCIPLINES, GOALS, needsPrimary } from '../lib/goals';
import type { Discipline, Goal } from '../lib/types';

// Original pictograms. Deliberately abstract (no bodies): goals are about
// what the user wants, not what a body "should" look like.
const S = { fill: 'none', stroke: 'currentColor', strokeWidth: 2, strokeLinecap: 'round' as const, strokeLinejoin: 'round' as const };
const ART: Record<string, React.ReactNode> = {
  lose_fat: <><path d="M16 4c3 5 8 8 8 15a8 8 0 0 1-16 0c0-4 2-6 4-8 0 3 1 5 3 5 1-4-1-8 1-12z" {...S} /></>,
  build_muscle: <><rect x="3" y="12" width="4" height="8" rx="1" {...S} /><rect x="25" y="12" width="4" height="8" rx="1" {...S} /><rect x="8" y="9" width="4" height="14" rx="1" {...S} /><rect x="20" y="9" width="4" height="14" rx="1" {...S} /><path d="M12 16h8" {...S} /></>,
  gain_weight: <><path d="M6 24l7-7 5 4 9-11" {...S} /><path d="M21 10h6v6" {...S} /></>,
  lean_muscle: <><path d="M6 26c10 0 18-8 20-20C14 8 6 16 6 26z" {...S} /><path d="M6 26L18 14" {...S} /></>,
  recomp: <><path d="M6 11h17l-4-4" {...S} /><path d="M26 21H9l4 4" {...S} /></>,
  general: <><path d="M16 26s-10-6-10-13a5 5 0 0 1 10-2 5 5 0 0 1 10 2c0 7-10 13-10 13z" {...S} /></>,
  endurance: <><path d="M3 18c3-6 6-6 9 0s6 6 9 0 6-6 8-2" {...S} /></>,
  strength: <><path d="M4 16h24" {...S} strokeWidth={3} /><rect x="6" y="9" width="4" height="14" rx="1" {...S} /><rect x="22" y="9" width="4" height="14" rx="1" {...S} /></>,
  mobility: <><path d="M6 24a12 12 0 0 1 20-14" {...S} /><circle cx="26" cy="10" r="2.5" fill="currentColor" /><path d="M6 24l-1 4" {...S} /></>,
  maintain: <><path d="M7 13h18M7 19h18" {...S} /></>,
  athletic: <><path d="M18 3L8 18h8l-2 11 10-15h-8l2-11z" {...S} /></>,
};

function Art({ id }: { id: string }) {
  return <svg width="32" height="32" viewBox="0 0 32 32" aria-hidden className="goal-art">{ART[id] ?? ART.general}</svg>;
}

export interface BuildValue { goal: Goal; secondaryGoals: Goal[]; disciplines: Discipline[]; primaryDiscipline: Discipline | null }

export function GoalPicker({ v, set }: { v: BuildValue; set: (p: Partial<BuildValue>) => void }) {
  return (
    <div className="stack-lg">
      <div className="goal-grid" role="radiogroup" aria-label="Primary goal">
        {GOALS.map((g) => (
          <button key={g.id} type="button" role="radio" aria-checked={v.goal === g.id} className="goal-card" data-testid={`goal-${g.id}`}
            onClick={() => set({ goal: g.id, secondaryGoals: v.secondaryGoals.filter((x) => x !== g.id) })}>
            <Art id={g.id} />
            <b>{g.label}</b>
            <span>{g.desc}</span>
          </button>
        ))}
      </div>
      <div className="field">
        <div className="label" id="sec-l">Also working on <span className="muted">(optional, up to 2)</span></div>
        <div className="chips" role="group" aria-labelledby="sec-l">
          {GOALS.filter((g) => g.id !== v.goal).map((g) => {
            const on = v.secondaryGoals.includes(g.id);
            const full = !on && v.secondaryGoals.length >= 2;
            return <button key={g.id} type="button" className="chip" aria-pressed={on} disabled={full} onClick={() => set({ secondaryGoals: on ? v.secondaryGoals.filter((x) => x !== g.id) : [...v.secondaryGoals, g.id] })}>{g.label}</button>;
          })}
        </div>
      </div>
    </div>
  );
}

export function DisciplinePicker({ v, set }: { v: BuildValue; set: (p: Partial<BuildValue>) => void }) {
  const conflict = needsPrimary(v.disciplines);
  return (
    <div className="stack-lg">
      <p className="muted">Pick any styles you train, or none. They shape exercise choice and rep ranges.</p>
      <div className="stack" role="group" aria-label="Training styles">
        {DISCIPLINES.map((d) => {
          const on = v.disciplines.includes(d.id);
          return (
            <button key={d.id} type="button" aria-pressed={on} className="option" data-testid={`disc-${d.id}`}
              onClick={() => {
                const ds = on ? v.disciplines.filter((x) => x !== d.id) : [...v.disciplines, d.id];
                // A new conflict always asks the user; a single style is the focus automatically.
                const keep = v.disciplines.length > 1 && ds.includes(v.primaryDiscipline as Discipline);
                set({ disciplines: ds, primaryDiscipline: needsPrimary(ds) ? (keep ? v.primaryDiscipline : null) : (ds[0] ?? null) });
              }}>
              <b>{d.label}</b><span>{d.desc}</span>
            </button>
          );
        })}
      </div>
      {conflict && (
        <div className="field card card-tight" style={{ borderColor: 'var(--ember)' }}>
          <div className="label" id="prim-l">These pull training in different directions. Which is your main focus?</div>
          <div className="chips" role="radiogroup" aria-labelledby="prim-l">
            {v.disciplines.map((d) => <button key={d} type="button" role="radio" aria-checked={v.primaryDiscipline === d} className="chip" data-testid={`primary-${d}`} onClick={() => set({ primaryDiscipline: d })}>{DISCIPLINES.find((x) => x.id === d)!.label}</button>)}
          </div>
          {v.primaryDiscipline && <p className="small muted">{DISCIPLINES.find((x) => x.id === v.primaryDiscipline)!.emphasis}. The others still show up in your plan.</p>}
        </div>
      )}
    </div>
  );
}

export function buildValid(v: BuildValue) {
  return !needsPrimary(v.disciplines) || !!v.primaryDiscipline;
}
