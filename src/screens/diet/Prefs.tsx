import React, { useState } from 'react';
import { ConfirmDialog, Switch, store, useData, useToast, type Route } from '../../components/core';
import { ALLERGEN_LABEL, INGREDIENTS, RECIPES } from '../../lib/foods';
import { DEFAULT_PREFS, defaultActivity, prefsOf } from '../../lib/nutrition';
import type { Allergen, DietPattern, Kitchen, NutritionPrefs } from '../../lib/types';
import { SubHead } from './DietHome';

const CUISINES = [...new Set(RECIPES.map((r) => r.cuisine))];

export function PrefsView({ go }: { go: (r: Route) => void }) {
  const data = useData();
  const toast = useToast();
  const miles = (data.profile?.unit ?? 'lb') === 'lb';
  const [p, setP] = useState<NutritionPrefs>(prefsOf(data));
  const [confirm, setConfirm] = useState<null | 'history' | 'all'>(null);
  const set = (x: Partial<NutritionPrefs>) => setP((v) => ({ ...v, ...x }));
  const toggle = <T,>(arr: T[], v: T) => (arr.includes(v) ? arr.filter((x) => x !== v) : [...arr, v]);
  const ft = p.heightCm ? Math.floor(p.heightCm / 2.54 / 12) : undefined;
  const inch = p.heightCm ? Math.round(p.heightCm / 2.54 - (ft ?? 0) * 12) : undefined;
  const num = (v: string) => (v === '' ? undefined : Number(v));

  return (
    <div className="page">
      <SubHead title="Nutrition preferences" go={go} />
      <p className="muted small">Everything is optional. Suggestions start from sensible defaults and get more personal as you add detail.</p>

      <section className="card stack-lg">
        <div className="field"><div className="label">Eating pattern</div><div className="chips" role="radiogroup" aria-label="Eating pattern">{(['omnivore', 'pescatarian', 'vegetarian', 'vegan'] as DietPattern[]).map((d) => <button key={d} role="radio" aria-checked={p.pattern === d} className="chip" onClick={() => set({ pattern: d })} data-testid={`pattern-${d}`}>{d === 'omnivore' ? 'Everything' : d[0].toUpperCase() + d.slice(1)}</button>)}</div></div>
        <div className="field"><div className="label">Allergies & intolerances</div><div className="chips" role="group" aria-label="Allergies">{(Object.keys(ALLERGEN_LABEL) as Allergen[]).map((a) => <button key={a} className="chip" aria-pressed={p.allergies.includes(a)} onClick={() => set({ allergies: toggle(p.allergies, a) })} data-testid={`allergy-${a}`}>{ALLERGEN_LABEL[a]}</button>)}</div>
          <p className="small muted">Recipes with these are swapped or hidden. Always check labels, since packaged foods can contain traces. For severe allergies, follow your doctor’s guidance.</p></div>
        <div className="field"><div className="label">Foods you don’t like</div><div className="chips" role="group" aria-label="Disliked foods">{INGREDIENTS.filter((i) => !['seasoning', 'olive-oil'].includes(i.id)).map((i) => <button key={i.id} className="chip" aria-pressed={p.dislikes.includes(i.id)} onClick={() => set({ dislikes: toggle(p.dislikes, i.id) })}>{i.name.replace(/\s*\(.*\)/, '')}</button>)}</div></div>
        <div className="field"><div className="label">Cuisines you enjoy</div><div className="chips" role="group" aria-label="Cuisines">{CUISINES.map((c) => <button key={c} className="chip" aria-pressed={p.cuisines.includes(c)} onClick={() => set({ cuisines: toggle(p.cuisines, c) })}>{c}</button>)}</div></div>
      </section>

      <section className="card stack-lg">
        <div className="field"><div className="label">Kitchen equipment</div><div className="chips" role="group" aria-label="Kitchen">{(['stove', 'oven', 'microwave', 'rice_cooker', 'blender'] as Kitchen[]).map((k) => <button key={k} className="chip" aria-pressed={p.kitchen.includes(k)} onClick={() => set({ kitchen: toggle(p.kitchen, k) })} data-testid={`kitchen-${k}`}>{k.replace('_', ' ')}</button>)}</div></div>
        <div className="field"><div className="label">Cooking comfort</div><div className="chips" role="radiogroup" aria-label="Cooking skill">{(['basic', 'comfortable', 'confident'] as const).map((k) => <button key={k} role="radio" aria-checked={p.cookingSkill === k} className="chip" onClick={() => set({ cookingSkill: k })}>{k}</button>)}</div></div>
        <div className="field"><div className="label">Time per recipe</div><div className="chips" role="radiogroup" aria-label="Time per recipe">{[10, 20, 30, 45, 60].map((m) => <button key={m} role="radio" aria-checked={p.maxPrepMinutes === m} className="chip" onClick={() => set({ maxPrepMinutes: m })} data-testid={`prep-${m}`}>{m === 60 ? '60+ min' : `≤ ${m} min`}</button>)}</div></div>
        <div className="row" style={{ gap: 12 }}>
          <div className="field grow"><label className="label" htmlFor="pp-people">People fed</label><input id="pp-people" className="input tnum" type="number" min={1} max={12} value={p.people} onChange={(e) => set({ people: Math.max(1, Math.min(12, Number(e.target.value) || 1)) })} /></div>
          <div className="field grow"><label className="label" htmlFor="pp-meals">Meals a day</label><input id="pp-meals" className="input tnum" type="number" min={1} max={6} value={p.mealsPerDay} onChange={(e) => set({ mealsPerDay: Math.max(1, Math.min(6, Number(e.target.value) || 1)) })} /></div>
        </div>
      </section>

      <section className="card stack-lg">
        <div className="setting-row" style={{ padding: 0 }}>
          <div><b>Show calories & macros</b><p className="small muted">Turn off to see meal ideas without numbers.</p></div>
          <Switch label="Show calories and macros" checked={p.showNumbers} onChange={(v) => set({ showNumbers: v })} />
        </div>
        {p.showNumbers && (
          <>
            <p className="small muted">Optional, used only to estimate energy and protein. Stored on this device only. Leave blank to skip.</p>
            <div className="field"><div className="label">Sex (for the estimate formula)</div><div className="chips" role="radiogroup" aria-label="Sex">{([['female', 'Female'], ['male', 'Male'], ['unspecified', 'Prefer not to say']] as const).map(([id, t]) => <button key={id} role="radio" aria-checked={p.sex === id} className="chip" onClick={() => set({ sex: p.sex === id ? undefined : id })}>{t}</button>)}</div></div>
            <div className="row wrap" style={{ gap: 12 }}>
              <div className="field" style={{ width: 90 }}><label className="label" htmlFor="pp-age">Age</label><input id="pp-age" className="input tnum" type="number" min={13} max={100} value={p.age ?? ''} onChange={(e) => set({ age: num(e.target.value) })} data-testid="body-age" /></div>
              {miles ? (
                <>
                  <div className="field" style={{ width: 80 }}><label className="label" htmlFor="pp-ft">Height ft</label><input id="pp-ft" className="input tnum" type="number" min={3} max={8} value={ft ?? ''} onChange={(e) => { const f = num(e.target.value); set({ heightCm: f === undefined ? undefined : Math.round((f * 12 + (inch ?? 0)) * 2.54) }); }} data-testid="body-ft" /></div>
                  <div className="field" style={{ width: 80 }}><label className="label" htmlFor="pp-in">in</label><input id="pp-in" className="input tnum" type="number" min={0} max={11} value={inch ?? ''} onChange={(e) => set({ heightCm: Math.round(((ft ?? 5) * 12 + (num(e.target.value) ?? 0)) * 2.54) })} data-testid="body-in" /></div>
                  <div className="field" style={{ width: 100 }}><label className="label" htmlFor="pp-lb">Weight lb</label><input id="pp-lb" className="input tnum" type="number" min={60} max={700} value={p.weightKg ? Math.round(p.weightKg * 2.2046) : ''} onChange={(e) => { const v = num(e.target.value); set({ weightKg: v === undefined ? undefined : Math.round((v / 2.2046) * 10) / 10 }); }} data-testid="body-lb" /></div>
                </>
              ) : (
                <>
                  <div className="field" style={{ width: 100 }}><label className="label" htmlFor="pp-cm">Height cm</label><input id="pp-cm" className="input tnum" type="number" min={100} max={250} value={p.heightCm ?? ''} onChange={(e) => set({ heightCm: num(e.target.value) })} /></div>
                  <div className="field" style={{ width: 100 }}><label className="label" htmlFor="pp-kg">Weight kg</label><input id="pp-kg" className="input tnum" type="number" min={30} max={300} value={p.weightKg ?? ''} onChange={(e) => set({ weightKg: num(e.target.value) })} /></div>
                </>
              )}
            </div>
            <div className="field"><div className="label">Overall activity</div><div className="chips" role="radiogroup" aria-label="Activity">{(['light', 'moderate', 'high'] as const).map((a) => <button key={a} role="radio" aria-checked={(p.activity ?? defaultActivity(data.profile)) === a} className="chip" onClick={() => set({ activity: a })}>{a}</button>)}</div><p className="small muted">{p.activity ? 'Set by you.' : `Estimated from your ${data.profile?.trainingDays.length ?? 0} training days a week.`}</p></div>
            {(p.age || p.heightCm || p.weightKg) && <button className="btn btn-ghost btn-sm" style={{ alignSelf: 'flex-start' }} onClick={() => set({ age: undefined, heightCm: undefined, weightKg: undefined, sex: undefined, activity: undefined })}>Clear body details</button>}
          </>
        )}
      </section>

      <button className="btn btn-ink btn-lg" onClick={() => { store.setPrefs(p); toast('Preferences saved'); go('diet'); }} data-testid="prefs-save">Save preferences</button>

      <section className="card stack">
        <h2 className="eyebrow">Food data</h2>
        <p className="small muted">What the app has learned from: {data.nutrition.log.length} logged meals, {data.nutrition.feedback.length} suggestion responses, {Object.keys(data.nutrition.ratings).length} ratings, {data.nutrition.spending.length} spending entries.</p>
        <button className="btn btn-outline" onClick={() => setConfirm('history')}>Clear food history & feedback</button>
        <button className="btn btn-danger" onClick={() => setConfirm('all')}>Reset all nutrition data</button>
      </section>
      {confirm === 'history' && <ConfirmDialog danger title="Clear food history?" body="Logged meals, ratings, suggestion feedback and spending are deleted. Preferences, budget and plans stay." confirmLabel="Clear" onCancel={() => setConfirm(null)} onConfirm={() => { store.clearFoodHistory(); setConfirm(null); toast('Food history cleared'); }} />}
      {confirm === 'all' && <ConfirmDialog danger title="Reset nutrition data?" body="Preferences, budget, prices, plans, grocery list, history, saved meals and saved places are all deleted. Workouts aren’t affected." confirmLabel="Reset" onCancel={() => setConfirm(null)} onConfirm={() => { store.resetNutrition(); setConfirm(null); setP({ ...DEFAULT_PREFS, updatedAt: '' }); toast('Nutrition data reset'); }} />}
    </div>
  );
}
