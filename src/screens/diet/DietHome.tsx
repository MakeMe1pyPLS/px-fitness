import React, { useMemo, useState } from 'react';
import { Icon, Sheet, store, useData, useToast, type Route } from '../../components/core';
import { goalLabel, disciplineLabel, drivingDiscipline, GOALS } from '../../lib/goals';
import { budgetSummary, computeTargets, mealTypeNow, nutrientsOf, planDetails, prefsOf, recommend, trainingContext, eligibleRecipes, HYDRATION_NOTE } from '../../lib/nutrition';
import { recipe as getRecipe, RECIPES } from '../../lib/foods';
import { toDateKey, formatShortDate } from '../../lib/dates';
import type { AppData, MealType } from '../../lib/types';
import { NutrientRow, RecipeSheet, money } from './shared';

const MT_LABEL: Record<MealType, string> = { breakfast: 'Breakfast', lunch: 'Lunch', dinner: 'Dinner', snack: 'Snack' };

export function SubHead({ title, go, back = 'diet' }: { title: string; go: (r: Route) => void; back?: Route }) {
  return (
    <header className="page-head" style={{ alignItems: 'center', justifyContent: 'flex-start' }}>
      <button className="icon-btn" aria-label="Back to Diet Plan" onClick={() => go(back)}><Icon.back /></button>
      <h1 className="display" style={{ fontSize: 'var(--t-xl)' }}>{title}</h1>
    </header>
  );
}

function todaysTotals(data: AppData) {
  const today = toDateKey(new Date());
  const entries = data.nutrition.log.filter((l) => l.date === today);
  const known = entries.filter((l) => l.recipeId && getRecipe(l.recipeId));
  const sum = { kcal: 0, p: 0 };
  known.forEach((l) => { const r = getRecipe(l.recipeId!)!; const n = nutrientsOf(r.ingredients, r.servings); sum.kcal += n.kcal; sum.p += n.p; });
  return { entries, sum, unknown: entries.length - known.length };
}

export function ChooseMeal({ data }: { data: AppData }) {
  const [mealType, setMealType] = useState<MealType>(mealTypeNow());
  const [seen, setSeen] = useState<string[]>([]);
  const [open, setOpen] = useState(false);
  const toast = useToast();
  const recs = useMemo(() => recommend(data, mealType, seen), [data, mealType, seen]);
  const top = recs[0];
  const prefs = prefsOf(data);
  return (
    <section className="card stack" aria-labelledby="cm-h" data-testid="choose-meal">
      <h2 id="cm-h" className="eyebrow">Choose a meal for me</h2>
      <div>
        <div className="seg" role="group" aria-label="Meal">
          {(['breakfast', 'lunch', 'dinner', 'snack'] as MealType[]).map((m) => <button key={m} aria-pressed={mealType === m} onClick={() => { setMealType(m); setSeen([]); }} style={{ padding: '0 10px' }}>{MT_LABEL[m]}</button>)}
        </div>
      </div>
      {!top ? (
        <p className="muted">Nothing in the recipe library fits your current preferences for {MT_LABEL[mealType].toLowerCase()}{seen.length ? ' that you haven’t seen yet' : ''}. {seen.length ? <button className="link" onClick={() => setSeen([])}>Start over</button> : 'Try loosening the prep time or kitchen settings.'}</p>
      ) : (
        <>
          <div>
            <h3 className="display" style={{ fontSize: 'var(--t-xl)' }} data-testid="rec-name">{top.resolved.recipe.name}</h3>
            <p className="small muted">{top.resolved.recipe.prepMin + top.resolved.recipe.cookMin} min · about {money(data, top.costPerServing)} a serving</p>
          </div>
          <NutrientRow n={top.perServing} data={data} />
          {top.reasons.length > 0 && <p className="small"><b>Why: </b>{top.reasons.slice(0, 3).join(' · ')}</p>}
          {!data.nutrition.prefs && <p className="small muted">Using default preferences. <a href="#diet-prefs">Set yours</a> for better picks.</p>}
          <div className="row wrap" style={{ gap: 8 }}>
            <button className="btn btn-primary grow" data-testid="rec-accept" onClick={() => { store.mealFeedback(top.resolved.recipe.id, 'accepted'); store.logMeal({ recipeId: top.resolved.recipe.id, name: top.resolved.recipe.name, where: 'home', date: toDateKey(new Date()) }); toast('Logged. Enjoy!'); }}>Eat this</button>
            <button className="btn btn-outline" data-testid="rec-shuffle" onClick={() => { store.mealFeedback(top.resolved.recipe.id, 'shuffled'); setSeen([...seen, top.resolved.recipe.id]); }}><Icon.shuffle /> Shuffle</button>
            <button className="btn btn-outline" data-testid="rec-recipe" onClick={() => setOpen(true)}>Recipe</button>
          </div>
          <button className="btn btn-ghost btn-sm" style={{ alignSelf: 'flex-start' }} onClick={() => { store.mealFeedback(top.resolved.recipe.id, 'rejected'); setSeen([...seen, top.resolved.recipe.id]); toast('Got it. You’ll see this less.'); }} data-testid="rec-reject">Not for me</button>
          {prefs.showNumbers && <p className="small muted">Numbers are estimates.</p>}
        </>
      )}
      {open && top && <RecipeSheet data={data} recipeId={top.resolved.recipe.id} onClose={() => setOpen(false)} />}
    </section>
  );
}

export function DietHome({ go }: { go: (r: Route) => void }) {
  const data = useData();
  const p = data.profile!;
  const prefs = prefsOf(data);
  const targets = computeTargets(p, prefs);
  const ctx = trainingContext(data);
  const b = budgetSummary(data);
  const active = data.nutrition.plans.find((x) => x.status === 'active');
  const details = active ? planDetails(data, active) : null;
  const totals = todaysTotals(data);
  const d = drivingDiscipline(p);
  const unchecked = data.nutrition.grocery.filter((g) => !g.checked).length;

  return (
    <div className="page">
      <header className="page-head">
        <div>
          <div className="eyebrow">Diet plan</div>
          <h1 className="page-title display">Eat for your goal</h1>
        </div>
      </header>

      <section className="card stack" aria-label="Your setup">
        <div className="row wrap" style={{ gap: 6 }}>
          <span className="badge badge-ember">{goalLabel(p.goal)}</span>
          {d && <span className="badge">{disciplineLabel(d)}</span>}
          <span className="badge">{prefs.pattern === 'omnivore' ? 'Eats everything' : prefs.pattern}</span>
          {prefs.allergies.length > 0 && <span className="badge">No {prefs.allergies.join(', ').replace(/_/g, ' ')}</span>}
          {b && <span className="badge">{money(data, b.weekly)}/week</span>}
        </div>
        <p className="small muted">{GOALS.find((g) => g.id === p.goal)?.nutrition}.</p>
        {!data.nutrition.prefs && <button className="btn btn-ink btn-block" onClick={() => go('diet-prefs')} data-testid="setup-prefs">Set food preferences · 1 min</button>}
      </section>

      <div className="row" style={{ gap: 8 }}>
        <button className="btn btn-primary btn-lg grow nowrap" onClick={() => go('diet-prep')} data-testid="meal-prep-btn">Meal Prep</button>
        <button className="btn btn-ink btn-lg grow nowrap" style={{ paddingInline: 16 }} onClick={() => go('diet-near')} data-testid="near-btn"><Icon.pin /> Near me</button>
      </div>

      <section className="card card-tight" aria-label="Training today"><p className="small"><b>{ctx.kind === 'train' ? 'Training day. ' : ctx.kind === 'rest' ? 'Rest day. ' : ''}</b>{ctx.text.replace(/^(Training day|Rest day)[.:]\s*/, '')}</p></section>

      <ChooseMeal data={data} />

      <section className="card stack" aria-labelledby="tm-h">
        <div className="row-between"><h2 id="tm-h" className="eyebrow">Today’s meals</h2><button className="btn btn-ghost btn-sm" onClick={() => go('diet-meals')}>Open</button></div>
        {details ? (
          <div className="list">
            {(['breakfast', 'lunch', 'dinner', 'snack'] as MealType[]).filter((m) => active!.mealTypes.includes(m)).map((m) => {
              const it = details.items.find((i) => i.item.mealType === m && (active!.eaten[i.item.recipeId] ?? 0) < i.item.servings) ?? details.items.find((i) => i.item.mealType === m);
              if (!it) return null;
              const left = it.item.servings - (active!.eaten[it.item.recipeId] ?? 0);
              return <div key={m} className="list-row"><span><span className="small muted">{MT_LABEL[m]}</span><br /><b>{it.resolved.recipe.name}</b></span><span className="small muted tnum">{left} left</span></div>;
            })}
          </div>
        ) : <p className="small muted">No meal plan yet. <button className="link" onClick={() => go('diet-prep')}>Plan a few days</button> or use “Choose a meal for me”.</p>}
        {totals.entries.length > 0 && <p className="small">Logged today: {totals.entries.map((e) => e.name).join(', ')}.</p>}
      </section>

      {prefs.showNumbers && (
        <section className="card stack" aria-labelledby="tg-h">
          <h2 id="tg-h" className="eyebrow">Daily targets · estimates</h2>
          {targets.blocked ? <p className="small">{targets.blocked}</p> : targets.kcal ? (
            <>
              <div className="metrics">
                <div className="metric"><b className="tnum">{targets.kcal.toLocaleString()}</b><span>kcal</span></div>
                <div className="metric"><b className="tnum">{targets.proteinG![0]}–{targets.proteinG![1]}</b><span>g protein</span></div>
                <div className="metric"><b className="tnum">{targets.fiberG}</b><span>g fiber</span></div>
              </div>
              {totals.sum.kcal > 0 && <p className="small">From meals logged in the app today: about <b>{totals.sum.kcal} kcal</b> and <b>{totals.sum.p} g protein</b>{totals.unknown ? ` (plus ${totals.unknown} meal${totals.unknown > 1 ? 's' : ''} without nutrition data)` : ''}.</p>}
              <p className="small muted">A starting point, not a prescription. Adjust based on how you feel and how your weight and training trend over a few weeks. If you have a medical condition, check with a doctor or registered dietitian.</p>
            </>
          ) : targets.proteinG ? (
            <p className="small">Protein reference: <b>{targets.proteinG[0]}–{targets.proteinG[1]} g/day</b>. Add {targets.missing.join(' and ')} in <button className="link" onClick={() => go('diet-prefs')}>preferences</button> for an energy estimate, or skip it. Meal ideas work either way.</p>
          ) : (
            <p className="small muted">Optional: add height, weight and age in <button className="link" onClick={() => go('diet-prefs')}>preferences</button> to see energy and protein estimates. Meal suggestions work without them.</p>
          )}
          <details className="small"><summary>Hydration</summary><p className="muted" style={{ marginTop: 6 }}>{HYDRATION_NOTE}</p></details>
        </section>
      )}

      <nav className="card" aria-label="Diet plan sections">
        <div className="list">
          {([
            ['diet-meals', 'Today’s meals & meal plan', active ? `${details!.servings} servings planned` : 'No plan yet'],
            ['diet-prep', 'Meal prep', active ? `Active plan · ${active.days} days` : 'Plan a few days at once'],
            ['diet-budget', 'Food budget', b ? `${money(data, Math.max(0, b.remaining))} left this week` : 'Not set'],
            ['diet-grocery', 'Grocery list', data.nutrition.grocery.length ? `${unchecked} to buy` : 'Empty'],
            ['diet-near', 'Find food near me', data.nutrition.location?.label ?? 'Set a location'],
            ['diet-prefs', 'Nutrition preferences', data.nutrition.prefs ? `Updated ${formatShortDate(data.nutrition.prefs.updatedAt.slice(0, 10))}` : 'Defaults'],
            ['diet-saved', 'Saved meals & recipes', `${data.nutrition.saved.length} saved · ${RECIPES.length} recipes`],
          ] as [Route, string, string][]).map(([r, t, sub]) => (
            <button key={r} className="list-row" onClick={() => go(r)} data-testid={`nav-${r}`}>
              <span><b>{t}</b><br /><span className="small muted">{sub}</span></span><Icon.arrow size={16} />
            </button>
          ))}
        </div>
      </nav>
    </div>
  );
}

export function MealsView({ go }: { go: (r: Route) => void }) {
  const data = useData();
  const toast = useToast();
  const [open, setOpen] = useState<string | null>(null);
  const [outOpen, setOutOpen] = useState(false);
  const active = data.nutrition.plans.find((x) => x.status === 'active');
  const details = active ? planDetails(data, active) : null;
  const today = toDateKey(new Date());
  const log = data.nutrition.log.filter((l) => l.date === today);
  return (
    <div className="page">
      <SubHead title="Today’s meals" go={go} />
      <section className="card stack">
        <h2 className="eyebrow">Logged today</h2>
        {log.length === 0 && <p className="small muted">Nothing logged yet. Logging is optional; it helps suggestions learn what you like.</p>}
        {log.map((l) => (
          <div key={l.id} className="stack" style={{ gap: 6, borderTop: '1px solid var(--line)', paddingTop: 10 }}>
            <div className="row-between"><b>{l.name}</b><button className="icon-btn" aria-label={`Remove ${l.name}`} onClick={() => store.removeMealLog(l.id)}><Icon.trash /></button></div>
            <div className="row wrap small" style={{ gap: 6 }}>
              <span className="muted">How full afterwards?</span>
              {[1, 2, 3, 4, 5].map((k) => <button key={k} className="chip" style={{ minHeight: 36, padding: '0 12px' }} aria-pressed={l.fullness === k} aria-label={`Fullness ${k} of 5`} onClick={() => store.updateMealLog(l.id, { fullness: k })}>{k}</button>)}
            </div>
            {l.cost !== undefined && <span className="small muted">Spent {money(data, l.cost)}</span>}
          </div>
        ))}
        <button className="btn btn-outline" onClick={() => setOutOpen(true)} data-testid="log-out">Log a meal out</button>
      </section>

      <section className="card stack" aria-labelledby="pl-h">
        <div className="row-between"><h2 id="pl-h" className="eyebrow">Personalized meal plan</h2>{active && <button className="btn btn-ghost btn-sm" onClick={() => go('diet-prep')}>Edit</button>}</div>
        {!details ? <p className="small muted">No active plan. <button className="link" onClick={() => go('diet-prep')}>Create one with Meal Prep</button>.</p> : (
          <>
            <label className="row small"><input type="checkbox" className="big-check" checked={active!.prepped} onChange={(e) => store.setPlanPrepped(active!.id, e.target.checked)} /> Prepped and in the fridge</label>
            {details.items.map((d) => {
              const eaten = active!.eaten[d.item.recipeId] ?? 0;
              return (
                <div key={d.item.recipeId} className="stack" style={{ gap: 6, borderTop: '1px solid var(--line)', paddingTop: 10 }}>
                  <div className="row-between"><span><span className="small muted">{MT_LABEL[d.item.mealType]}</span><br /><button className="link" style={{ padding: 0, minHeight: 0, textAlign: 'left' }} onClick={() => setOpen(d.item.recipeId)}>{d.resolved.recipe.name}</button></span><span className="small tnum">{eaten}/{d.item.servings} eaten</span></div>
                  <NutrientRow n={d.perServing} data={data} />
                  <button className="btn btn-outline btn-sm" disabled={eaten >= d.item.servings} onClick={() => { store.eatFromPlan(active!.id, d.item.recipeId, d.resolved.recipe.name); toast('Logged one serving'); }} data-testid="eat-serving">Ate a serving</button>
                </div>
              );
            })}
          </>
        )}
      </section>
      {open && <RecipeSheet data={data} recipeId={open} onClose={() => setOpen(null)} />}
      {outOpen && <LogOutSheet data={data} onClose={() => setOutOpen(false)} />}
    </div>
  );
}

function LogOutSheet({ data, onClose }: { data: AppData; onClose: () => void }) {
  const [name, setName] = useState('');
  const [cost, setCost] = useState('');
  const toast = useToast();
  return (
    <Sheet title="Meal out" onClose={onClose}>
      <div className="stack-lg">
        <div className="field"><label className="label" htmlFor="mo-n">What did you have?</label><input id="mo-n" className="input" value={name} onChange={(e) => setName(e.target.value)} placeholder="e.g. Chicken burrito bowl" /></div>
        <div className="field"><label className="label" htmlFor="mo-c">Cost <span className="muted">(optional, counts toward your eating-out budget)</span></label><input id="mo-c" className="input" inputMode="decimal" type="number" min={0} value={cost} onChange={(e) => setCost(e.target.value)} /></div>
        <p className="small muted">Restaurant nutrition isn’t estimated here unless the restaurant publishes it.</p>
        <button className="btn btn-ink btn-lg" disabled={!name.trim()} onClick={() => {
          const c = cost ? Math.max(0, Number(cost)) : undefined;
          store.logMeal({ name: name.trim(), where: 'out', date: toDateKey(new Date()), cost: c });
          if (c) store.addSpend({ date: toDateKey(new Date()), amount: c, kind: 'eating_out', note: name.trim() });
          toast('Logged'); onClose();
        }}>Log meal</button>
      </div>
    </Sheet>
  );
}

export function SavedView({ go }: { go: (r: Route) => void }) {
  const data = useData();
  const [open, setOpen] = useState<string | null>(null);
  const [filter, setFilter] = useState<'fits' | 'saved' | 'all'>(data.nutrition.saved.length ? 'saved' : 'fits');
  const prefs = prefsOf(data);
  const fits = new Set(eligibleRecipes(prefs).map((r) => r.recipe.id));
  const list = RECIPES.filter((r) => (filter === 'saved' ? data.nutrition.saved.includes(r.id) || (data.nutrition.ratings[r.id] ?? 0) >= 4 : filter === 'fits' ? fits.has(r.id) : true));
  return (
    <div className="page">
      <SubHead title="Saved meals & recipes" go={go} />
      <div className="seg" role="group" aria-label="Filter recipes">
        <button aria-pressed={filter === 'saved'} onClick={() => setFilter('saved')}>Saved</button>
        <button aria-pressed={filter === 'fits'} onClick={() => setFilter('fits')}>Fits you</button>
        <button aria-pressed={filter === 'all'} onClick={() => setFilter('all')}>All</button>
      </div>
      {list.length === 0 ? <div className="card"><p className="muted">{filter === 'saved' ? 'Save or rate a recipe 4+ stars and it shows up here.' : 'No recipes match.'}</p></div> : (
        <div className="card"><div className="list">
          {list.map((r) => {
            const n = nutrientsOf(r.ingredients, r.servings);
            return (
              <button key={r.id} className="list-row" onClick={() => setOpen(r.id)}>
                <span><b>{r.name}</b><br /><span className="small muted">{r.prepMin + r.cookMin} min · {r.mealTypes.join(', ')}{prefs.showNumbers ? ` · ~${n.p} g protein` : ''}{!fits.has(r.id) ? ' · doesn’t fit your preferences' : ''}</span></span>
                {data.nutrition.saved.includes(r.id) ? <Icon.star filled size={18} /> : <Icon.arrow size={16} />}
              </button>
            );
          })}
        </div></div>
      )}
      {open && <RecipeSheet data={data} recipeId={open} onClose={() => setOpen(null)} />}
    </div>
  );
}
