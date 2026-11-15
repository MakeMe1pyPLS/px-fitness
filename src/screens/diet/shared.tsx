import { RecipeArt } from '../../components/RecipeArt';
import React, { useMemo, useState } from 'react';
import { Icon, Sheet, store, useToast } from '../../components/core';
import { ALLERGEN_LABEL, ingredient, recipe as getRecipe, type Recipe } from '../../lib/foods';
import { formatQty, nutrientsOf, portionCost, prefsOf, priceOf, resolveRecipe, type Nutrients } from '../../lib/nutrition';
import { toDateKey } from '../../lib/dates';
import { dailyRef, pctOf } from '../../lib/mealSmart';
import type { AppData, Budget, NutritionPrefs } from '../../lib/types';

const SYM: Record<Budget['currency'], string> = { USD: '$', CAD: 'CA$', GBP: '£', EUR: '€' };
export function money(data: AppData, n: number) {
  const c = data.nutrition.budget?.currency ?? 'USD';
  return `${SYM[c]}${n.toFixed(2)}`;
}

export function NutrientRow({ n, data, label = 'per serving' }: { n: Nutrients; data: AppData; label?: string }) {
  if (!prefsOf(data).showNumbers) return null;
  return (
    <div className="nutri" aria-label={`Estimated nutrition ${label}`}>
      <span><b>{n.kcal}</b> kcal</span><span><b>{n.p}</b>g protein</span><span><b>{n.c}</b>g carbs</span><span><b>{n.f}</b>g fat</span><span><b>{n.fib}</b>g fiber</span>
    </div>
  );
}


/** Nutrition Facts panel: grams plus % of the user's own daily target (or FDA label values). */
export function NutritionFacts({ n, data, title = 'Per serving', note, testId = 'nutrition-facts' }: { n: Nutrients; data: AppData; title?: string; note?: string; testId?: string }) {
  if (!prefsOf(data).showNumbers) return null;
  const ref = dailyRef(data);
  const pct = pctOf(n, ref);
  const kcalP = n.p * 4, kcalC = n.c * 4, kcalF = n.f * 9, sum = kcalP + kcalC + kcalF || 1;
  const rows: [string, number, string, number, string][] = [
    ['Protein', n.p, 'g', pct.p, 'p'], ['Carbohydrate', n.c, 'g', pct.c, 'c'], ['Fat', n.f, 'g', pct.f, 'f'], ['Fiber', n.fib, 'g', pct.fib, 'fib'],
  ];
  return (
    <div className="facts" data-testid={testId} aria-label={`Nutrition facts, ${title.toLowerCase()}`}>
      <div className="facts-head"><b>Nutrition facts</b><span className="small muted">{title}</span></div>
      <div className="facts-kcal"><span>Calories</span><b className="tnum" data-testid={`${testId}-kcal`}>{n.kcal}</b><span className="small muted tnum">{pct.kcal}%</span></div>
      <div className="facts-split" aria-hidden>
        <i className="fx-p" style={{ width: `${(kcalP / sum) * 100}%` }} /><i className="fx-c" style={{ width: `${(kcalC / sum) * 100}%` }} /><i className="fx-f" style={{ width: `${(kcalF / sum) * 100}%` }} />
      </div>
      <div className="small muted facts-split-key"><span><i className="dot fx-p" />protein {Math.round((kcalP / sum) * 100)}%</span><span><i className="dot fx-c" />carbs {Math.round((kcalC / sum) * 100)}%</span><span><i className="dot fx-f" />fat {Math.round((kcalF / sum) * 100)}%</span></div>
      {rows.map(([label, v, u, p, k]) => (
        <div key={k} className="facts-row">
          <span>{label}</span><b className="tnum">{v}{u}</b>
          <span className="facts-bar" aria-hidden><i style={{ width: `${Math.min(100, p)}%` }} /></span>
          <span className="tnum small" data-testid={`${testId}-pct-${k}`}>{p}%</span>
        </div>
      ))}
      <p className="small muted" style={{ margin: 0 }}>
        % = share of {ref.personal ? <>your daily target (~{ref.kcal.toLocaleString()} kcal, {ref.p} g protein)</> : <>FDA Daily Values on a 2,000-kcal diet. Add weight, height and age in preferences for your own targets</>}. {note ?? 'Estimated from USDA values for each ingredient; brands and portions vary.'}
      </p>
    </div>
  );
}

export function allergensIn(items: { id: string }[]) {
  return [...new Set(items.flatMap((i) => ingredient(i.id).allergens))].map((a) => ALLERGEN_LABEL[a]);
}

/** Compatible swap options for an ingredient under the user's prefs. */
export function swapOptions(id: string, prefs: NutritionPrefs) {
  return ingredient(id).subs.filter((s) => {
    const ing = ingredient(s.id);
    if (prefs.allergies.some((a) => ing.allergens.includes(a)) || prefs.dislikes.includes(s.id)) return false;
    if (!ing.animal || prefs.pattern === 'omnivore') return true;
    if (prefs.pattern === 'pescatarian') return ing.animal !== 'meat';
    if (prefs.pattern === 'vegetarian') return ing.animal === 'egg' || ing.animal === 'dairy';
    return false;
  });
}

export function RecipeSheet({ data, recipeId, onClose, servings: initial, swaps: initialSwaps, onSwap, onServings }: {
  data: AppData; recipeId: string; onClose: () => void; servings?: number; swaps?: Record<string, string>;
  onSwap?: (swaps: Record<string, string>) => void; onServings?: (n: number) => void;
}) {
  const r = getRecipe(recipeId) as Recipe;
  const prefs = prefsOf(data);
  const toast = useToast();
  const [servings, setServings] = useState(initial ?? r.servings);
  const [swaps, setSwaps] = useState<Record<string, string>>(initialSwaps ?? {});
  const resolved = useMemo(() => resolveRecipe(r, prefs, swaps), [r, prefs, swaps]);
  const factor = servings / r.servings;
  const scaled = resolved.ingredients.map((i) => ({ ...i, grams: Math.round(i.grams * factor) }));
  const n = nutrientsOf(resolved.ingredients, r.servings);
  const batchCost = portionCost(data, scaled);
  const unit = data.profile?.unit ?? 'lb';
  const saved = data.nutrition.saved.includes(r.id);
  const rating = data.nutrition.ratings[r.id] ?? 0;
  const allergens = allergensIn(resolved.ingredients);
  const sources = new Set(scaled.map((i) => priceOf(data, i.id).source));

  const setServ = (v: number) => { const x = Math.max(1, Math.min(24, v)); setServings(x); onServings?.(x); };
  const swap = (orig: string, to: string) => {
    const next = { ...swaps };
    if (!to) delete next[orig]; else next[orig] = to;
    setSwaps(next);
    onSwap?.(next);
    if (to) store.mealFeedback(r.id, 'shuffled');
  };

  return (
    <Sheet title={r.name} onClose={onClose}>
      <div className="stack-lg" data-testid="recipe-sheet">
        <RecipeArt id={r.id} name={r.name} />
        <div className="row wrap" style={{ gap: 6 }}>
          <span className="badge">{r.prepMin} min prep</span>
          {r.cookMin > 0 && <span className="badge">{r.cookMin} min cook</span>}
          <span className="badge">{r.cuisine}</span>
          {r.kitchen.length ? <span className="badge">Needs: {r.kitchen.join(', ')}</span> : <span className="badge">No cooking</span>}
        </div>
        {allergens.length > 0 && <p className="small" role="note"><b>Contains:</b> {allergens.join(', ')}</p>}
        {resolved.autoSwaps.length > 0 && <p className="why-box small">Adjusted for your preferences: {resolved.autoSwaps.join('; ')}.</p>}

        <div className="row-between">
          <div className="label">Servings</div>
          <div className="stepper" role="group" aria-label="Servings">
            <button className="icon-btn" aria-label="Fewer servings" onClick={() => setServ(servings - 1)} data-testid="serv-minus">−</button>
            <b className="tnum" aria-live="polite" data-testid="serv-count">{servings}</b>
            <button className="icon-btn" aria-label="More servings" onClick={() => setServ(servings + 1)} data-testid="serv-plus">+</button>
          </div>
        </div>

        <div>
          <div className="label" style={{ marginBottom: 6 }}>Ingredients</div>
          <ul className="ing-list">
            {scaled.map((i) => {
              const orig = i.swappedFrom ?? i.id;
              const opts = swapOptions(orig, prefs);
              return (
                <li key={i.id}>
                  <span className="tnum qty" data-testid={`qty-${i.id}`}>{formatQty(i.id, i.grams, unit)}</span>
                  <span className="grow">{ingredient(i.id).name}{i.swappedFrom && <span className="small muted"> (instead of {ingredient(i.swappedFrom).name.toLowerCase()})</span>}</span>
                  {opts.length > 0 && (
                    <select className="swap-select" aria-label={`Swap ${ingredient(i.id).name}`} value={swaps[orig] ?? ''} onChange={(e) => swap(orig, e.target.value)} data-testid={`swap-${orig}`}>
                      <option value="">{swaps[orig] ? 'Undo swap' : 'Swap'}</option>
                      {opts.map((o) => <option key={o.id} value={o.id}>{ingredient(o.id).name}</option>)}
                    </select>
                  )}
                </li>
              );
            })}
          </ul>
        </div>

        <div className="card card-tight stack" style={{ gap: 8 }}>
          <div className="row-between small"><span>Estimated cost, this batch</span><b className="tnum" data-testid="batch-cost">{money(data, batchCost)}</b></div>
          <div className="row-between small"><span>Per serving</span><b className="tnum">{money(data, batchCost / servings)}</b></div>
          <p className="small muted">Counts only the portion of each package used. Prices: {[...sources].map((s) => (s === 'bls' ? 'BLS U.S. averages (Sep 2026)' : s === 'you' ? 'your prices' : 'labeled estimates')).join(' + ')}. Edit prices in the grocery list.</p>
        </div>
        <NutritionFacts n={n} data={data} />

        <div>
          <div className="label" style={{ marginBottom: 6 }}>Steps</div>
          <ol className="steps">{r.steps.map((s, i) => <li key={i}>{s}</li>)}</ol>
        </div>
        <div className="why-box small"><b>Storage & food safety: </b>{r.storage}</div>
        {r.notes && <p className="small muted">{r.notes}</p>}
        <div className="small"><b>Substitutions:</b> {r.substitutions.join(' ')}</div>

        <div className="field">
          <div className="label">Your rating</div>
          <div className="row" role="radiogroup" aria-label="Rating">
            {[1, 2, 3, 4, 5].map((k) => <button key={k} role="radio" aria-checked={rating === k} aria-label={`${k} star${k > 1 ? 's' : ''}`} className="icon-btn" style={{ color: k <= rating ? 'var(--ember-deep)' : 'var(--ink-3)' }} onClick={() => store.rateRecipe(r.id, rating === k ? null : k)} data-testid={`rate-${k}`}><Icon.star filled={k <= rating} /></button>)}
          </div>
        </div>

        <div className="stack" style={{ gap: 8 }}>
          <button className="btn btn-ink btn-block" data-testid="log-eaten" onClick={() => { store.logMeal({ recipeId: r.id, name: r.name, where: 'home', date: toDateKey(new Date()) }); store.mealFeedback(r.id, 'accepted'); toast('Logged as eaten today'); onClose(); }}>I ate this today</button>
          <div className="row">
            <button className="btn btn-outline grow" onClick={() => { scaled.forEach((i) => store.addGrocery(ingredient(i.id).name, `for ${r.name}`, i.id, i.grams, ingredient(i.id).category)); toast(`${scaled.length} items added to your grocery list`); }} data-testid="add-to-grocery"><Icon.cart /> Add to list</button>
            <button className="btn btn-outline grow" aria-pressed={saved} onClick={() => { store.toggleSaved(r.id); toast(saved ? 'Removed from saved' : 'Saved'); }} data-testid="save-recipe"><Icon.star filled={saved} /> {saved ? 'Saved' : 'Save'}</button>
          </div>
        </div>
      </div>
    </Sheet>
  );
}
