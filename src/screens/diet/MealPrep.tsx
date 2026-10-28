import React, { useMemo, useState } from 'react';
import { ConfirmDialog, Icon, Sheet, store, useData, useToast, type Route } from '../../components/core';
import { budgetSummary, generatePlan, planDetails, prefsOf, recommend, type PrepOptions } from '../../lib/nutrition';
import { recipe as getRecipe } from '../../lib/foods';
import type { AppData, MealPlan, MealType } from '../../lib/types';
import { SubHead } from './DietHome';
import { NutrientRow, RecipeSheet, money } from './shared';

const MT: MealType[] = ['breakfast', 'lunch', 'dinner', 'snack'];
const MT_LABEL: Record<MealType, string> = { breakfast: 'Breakfast', lunch: 'Lunch', dinner: 'Dinner', snack: 'Snack' };

export function MealPrepView({ go }: { go: (r: Route) => void }) {
  const data = useData();
  const active = data.nutrition.plans.find((p) => p.status === 'active');
  const [wizard, setWizard] = useState(!active);
  return (
    <div className="page">
      <SubHead title="Meal prep" go={go} />
      {wizard || !active ? <Wizard data={data} onDone={() => setWizard(false)} onCancel={active ? () => setWizard(false) : undefined} /> : <PlanEditor data={data} plan={active} go={go} onNew={() => setWizard(true)} />}
    </div>
  );
}

function Wizard({ data, onDone, onCancel }: { data: AppData; onDone: () => void; onCancel?: () => void }) {
  const prefs = prefsOf(data);
  const b = budgetSummary(data);
  const [step, setStep] = useState(0);
  const [o, setO] = useState<Omit<PrepOptions, 'strategy'>>({ days: 4, people: prefs.people, mealTypes: ['lunch', 'dinner'], mode: data.nutrition.saved.length ? 'mix' : 'new' });
  const set = (p: Partial<typeof o>) => setO((x) => ({ ...x, ...p }));
  const options = useMemo(() => step === 4 ? (['balanced', 'budget'] as const).map((strategy) => { const plan = generatePlan(data, { ...o, strategy }); return { strategy, plan, d: planDetails(data, plan) }; }) : [], [step, data, o]);
  const [pick, setPick] = useState<'balanced' | 'budget' | null>(null);
  const suggested = b && (b.overspendWeeks >= 2 || (b.groceryBudget > 0 && options.length && options[0].d.cash > b.groceryBudget * (o.days / 7) * 1.05)) ? 'budget' : 'balanced';
  const chosen = pick ?? suggested;
  const toast = useToast();

  return (
    <section className="card stack-lg" aria-label="Meal prep planner">
      <div className="onb-progress" aria-hidden style={{ margin: 0 }}>{[0, 1, 2, 3, 4].map((i) => <i key={i} data-on={i <= step} />)}</div>
      {step === 0 && (
        <div className="stack-lg">
          <h2 className="display" style={{ fontSize: 'var(--t-xl)' }}>How many days are you prepping for?</h2>
          <div className="chips" role="radiogroup" aria-label="Days">
            {[2, 3, 4, 5, 6, 7].map((d) => <button key={d} role="radio" aria-checked={o.days === d} className="chip" onClick={() => set({ days: d })} data-testid={`days-${d}`}>{d} days</button>)}
          </div>
          {o.days > 4 && <p className="small why-box">Cooked meals keep 3–4 days in the fridge. For day 5 onward, the plan favors dishes that freeze well. Freeze those portions on prep day and thaw them in the fridge overnight.</p>}
        </div>
      )}
      {step === 1 && (
        <div className="stack-lg">
          <h2 className="display" style={{ fontSize: 'var(--t-xl)' }}>Which meals, and for how many people?</h2>
          <div className="chips" role="group" aria-label="Meals to prep">
            {MT.map((m) => { const on = o.mealTypes.includes(m); return <button key={m} aria-pressed={on} className="chip" onClick={() => set({ mealTypes: on ? o.mealTypes.filter((x) => x !== m) : MT.filter((x) => x === m || o.mealTypes.includes(x)) })} data-testid={`mt-${m}`}>{MT_LABEL[m]}</button>; })}
          </div>
          <div className="row-between"><span className="label">People</span><div className="stepper"><button className="icon-btn" aria-label="Fewer people" onClick={() => set({ people: Math.max(1, o.people - 1) })}>−</button><b className="tnum">{o.people}</b><button className="icon-btn" aria-label="More people" onClick={() => set({ people: Math.min(8, o.people + 1) })}>+</button></div></div>
          <p className="small muted">That’s <b>{o.days * o.people * o.mealTypes.length}</b> servings in total ({o.days * o.people} per meal).</p>
        </div>
      )}
      {step === 2 && (
        <div className="stack-lg">
          <h2 className="display" style={{ fontSize: 'var(--t-xl)' }}>Favorites or something new?</h2>
          <div className="stack" role="radiogroup" aria-label="Recipe mix">
            {([['favorites', 'Reuse favorites', 'Saved and highly rated meals first'], ['new', 'Discover new meals', 'Things you haven’t had yet'], ['mix', 'A mix', 'Best fit overall']] as const).map(([id, t, d]) => (
              <button key={id} role="radio" aria-checked={o.mode === id} className="option" onClick={() => set({ mode: id })} disabled={id === 'favorites' && !data.nutrition.saved.length && !Object.keys(data.nutrition.ratings).length}><b>{t}</b><span>{id === 'favorites' && !data.nutrition.saved.length && !Object.keys(data.nutrition.ratings).length ? 'Save or rate a meal first' : d}</span></button>
            ))}
          </div>
        </div>
      )}
      {step === 3 && (
        <div className="stack">
          <h2 className="display" style={{ fontSize: 'var(--t-xl)' }}>Using what you’ve told the app</h2>
          <ul className="small" style={{ margin: 0, paddingLeft: 18, lineHeight: 1.8 }}>
            <li>Goal: {data.profile ? data.profile.goal.replace(/_/g, ' ') : 'not set'}</li>
            <li>Diet: {prefs.pattern}{prefs.allergies.length ? `, avoiding ${prefs.allergies.join(', ').replace(/_/g, ' ')}` : ''}{prefs.dislikes.length ? `, ${prefs.dislikes.length} disliked ingredient(s)` : ''}</li>
            <li>Kitchen: {prefs.kitchen.join(', ') || 'no cooking equipment'} · up to {prefs.maxPrepMinutes} min per recipe</li>
            <li>Budget: {b ? `${money(data, b.groceryBudget)} a week for groceries` : 'not set'}</li>
          </ul>
          {!data.nutrition.prefs && <p className="small muted">These are defaults. You can set preferences any time.</p>}
        </div>
      )}
      {step === 4 && (
        <div className="stack">
          <h2 className="display" style={{ fontSize: 'var(--t-xl)' }}>Compare two plans</h2>
          {suggested === 'budget' && <p className="small why-box">{b && b.overspendWeeks >= 2 ? `Logged grocery spending went over budget in ${b.overspendWeeks} recent weeks, so the budget plan is preselected.` : 'The balanced plan would go over your grocery budget for these days, so the budget plan is preselected.'}</p>}
          <div className="compare" role="radiogroup" aria-label="Plan options">
            {options.map(({ strategy, plan, d }) => (
              <button key={strategy} role="radio" aria-checked={chosen === strategy} className="option" onClick={() => setPick(strategy)} data-testid={`plan-${strategy}`}>
                <b>{strategy === 'balanced' ? 'Best fit' : 'Budget saver'}</b>
                <span>{plan.items.map((i) => getRecipe(i.recipeId)!.name).join(' · ') || 'No recipes fit'}</span>
                <span className="tnum">Groceries ~{money(data, d.cash)} · {money(data, d.perServingCost)}/serving</span>
                {prefsOf(data).showNumbers && d.items.length > 0 && <span className="tnum">Avg ~{Math.round(d.items.reduce((n, i) => n + i.perServing.p * i.item.servings, 0) / d.servings)} g protein/serving</span>}
              </button>
            ))}
          </div>
          <p className="small muted">Grocery totals count whole packages you’d buy. Per-serving cost counts only what each serving uses. All prices are estimates.</p>
        </div>
      )}
      <div className="row" style={{ justifyContent: 'space-between' }}>
        {step > 0 ? <button className="btn btn-ghost" onClick={() => setStep(step - 1)}>Back</button> : onCancel ? <button className="btn btn-ghost" onClick={onCancel}>Cancel</button> : <span />}
        {step < 4 ? <button className="btn btn-ink" disabled={step === 1 && !o.mealTypes.length} onClick={() => setStep(step + 1)} data-testid="prep-next">Continue</button>
          : <button className="btn btn-primary" disabled={!options.find((x) => x.strategy === chosen)?.plan.items.length} onClick={() => { store.savePlan(options.find((x) => x.strategy === chosen)!.plan); toast('Plan saved, grocery list ready'); onDone(); }} data-testid="prep-create">Use this plan</button>}
      </div>
    </section>
  );
}

function PlanEditor({ data, plan, go, onNew }: { data: AppData; plan: MealPlan; go: (r: Route) => void; onNew: () => void }) {
  const d = planDetails(data, plan);
  const b = budgetSummary(data);
  const [recipeOpen, setRecipeOpen] = useState<number | null>(null);
  const [replace, setReplace] = useState<number | null>(null);
  const [confirm, setConfirm] = useState(false);
  const toast = useToast();
  return (
    <>
      <section className="card stack">
        <div className="row-between"><h2 className="eyebrow">Active plan · {plan.days} days · {plan.people} {plan.people > 1 ? 'people' : 'person'}</h2></div>
        <div className="metrics">
          <div className="metric"><b className="tnum" data-testid="plan-servings">{d.servings}</b><span>servings</span></div>
          <div className="metric"><b className="tnum" data-testid="plan-cash">{money(data, d.cash)}</b><span>est. groceries</span></div>
          <div className="metric"><b className="tnum">{money(data, d.perServingCost)}</b><span>per serving</span></div>
        </div>
        {b && b.groceryBudget > 0 && (() => {
          const share = b.groceryBudget * Math.min(1, plan.days / 7);
          return <p className="small">{d.cash <= share ? '✓ ' : ''}Your grocery budget for {plan.days} days is about <b>{money(data, share)}</b>. {d.cash > share ? <>This plan runs about <b>{money(data, d.cash - share)}</b> over. Try fewer servings, cheaper swaps, or the budget plan.</> : 'This plan fits.'}</p>;
        })()}
      </section>

      {d.items.map((it, i) => (
        <section key={i} className="card stack" data-testid="plan-item">
          <div className="row-between" style={{ alignItems: 'flex-start' }}>
            <div><span className="eyebrow">{MT_LABEL[it.item.mealType]}</span><h3 className="display" style={{ fontSize: 'var(--t-lg)' }}>{it.resolved.recipe.name}</h3></div>
            <button className="icon-btn" aria-label={`Remove ${it.resolved.recipe.name}`} onClick={() => store.removePlanItem(plan.id, i)}><Icon.trash /></button>
          </div>
          {Object.keys(it.item.swaps).length > 0 && <p className="small muted">Your swaps: {Object.entries(it.item.swaps).map(([a, b2]) => `${a.replace(/-/g, ' ')} → ${b2.replace(/-/g, ' ')}`).join(', ')}</p>}
          {it.resolved.autoSwaps.length > 0 && <p className="small muted">Adjusted: {it.resolved.autoSwaps.join('; ')}</p>}
          <NutrientRow n={it.perServing} data={data} />
          <div className="row-between">
            <div className="stepper" role="group" aria-label={`Servings of ${it.resolved.recipe.name}`}>
              <button className="icon-btn" aria-label="Fewer servings" onClick={() => it.item.servings > 1 && store.updatePlanItem(plan.id, i, { servings: it.item.servings - 1 })}>−</button>
              <b className="tnum">{it.item.servings}</b>
              <button className="icon-btn" aria-label="More servings" onClick={() => store.updatePlanItem(plan.id, i, { servings: it.item.servings + 1 })} data-testid={`plan-plus-${i}`}>+</button>
            </div>
            <span className="small tnum">{money(data, it.portionCost)} total</span>
          </div>
          <div className="row" style={{ gap: 8 }}>
            <button className="btn btn-outline btn-sm grow" onClick={() => setRecipeOpen(i)} data-testid={`plan-recipe-${i}`}>Recipe & swaps</button>
            <button className="btn btn-outline btn-sm grow" onClick={() => setReplace(i)}><Icon.swap size={16} /> Replace meal</button>
          </div>
        </section>
      ))}

      <div className="stack" style={{ gap: 8 }}>
        <button className="btn btn-primary btn-lg" onClick={() => go('diet-grocery')} data-testid="to-grocery"><Icon.cart /> Grocery list</button>
        <button className="btn btn-outline" onClick={() => go('diet-meals')}>Track what you eat from this plan</button>
        <button className="btn btn-ghost" onClick={() => setConfirm(true)}>Start a new plan</button>
      </div>

      {recipeOpen !== null && d.items[recipeOpen] && (
        <RecipeSheet data={data} recipeId={d.items[recipeOpen].item.recipeId} servings={d.items[recipeOpen].item.servings} swaps={d.items[recipeOpen].item.swaps}
          onSwap={(sw) => store.updatePlanItem(plan.id, recipeOpen, { swaps: sw })} onServings={(n) => store.updatePlanItem(plan.id, recipeOpen, { servings: n })} onClose={() => setRecipeOpen(null)} />
      )}
      {replace !== null && d.items[replace] && (
        <Sheet title="Replace meal" onClose={() => setReplace(null)}>
          <div className="list">
            {recommend(data, d.items[replace].item.mealType, plan.items.map((x) => x.recipeId)).slice(0, 8).map((r) => (
              <button key={r.resolved.recipe.id} className="list-row" onClick={() => { store.updatePlanItem(plan.id, replace, { recipeId: r.resolved.recipe.id, swaps: {} }); store.mealFeedback(d.items[replace].item.recipeId, 'shuffled'); setReplace(null); toast('Meal replaced, list updated'); }}>
                <span><b>{r.resolved.recipe.name}</b><br /><span className="small muted">{money(data, r.costPerServing)}/serving{prefsOf(data).showNumbers ? ` · ${r.perServing.p} g protein` : ''}</span></span><Icon.arrow size={16} />
              </button>
            ))}
          </div>
        </Sheet>
      )}
      {confirm && <ConfirmDialog title="Start a new plan?" body="The current plan is archived. Items you added to the grocery list by hand are kept." confirmLabel="New plan" onCancel={() => setConfirm(false)} onConfirm={() => { store.archivePlan(plan.id); setConfirm(false); onNew(); }} />}
    </>
  );
}
