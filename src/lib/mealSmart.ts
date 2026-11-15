// What the planner tells you about a plan: nutrition per person per day, how much
// it reuses ingredients, what will be left over (and what to make with it), and
// a prep-day order. Everything is derived from the plan's own recipes and the
// same ingredient values used elsewhere, so there is one source of truth.

import { RECIPES, ingredient, recipe as getRecipe, type Recipe } from './foods';
import { computeTargets, packagesFor, planDetails, prefsOf, type Nutrients, type Targets } from './nutrition';
import type { AppData, MealPlan } from './types';

const MINOR = new Set(['olive-oil', 'seasoning', 'soy-sauce', 'garlic', 'honey', 'curry-powder', 'lemon', 'salsa']);
const GRAINS: Record<string, string> = { rice: 'rice', 'brown-rice': 'brown rice', quinoa: 'quinoa', spaghetti: 'pasta' };

/** FDA reference Daily Values used on U.S. Nutrition Facts labels (2,000 kcal diet). */
export const FDA_DV = { kcal: 2000, p: 50, c: 275, f: 78, fib: 28 };

export interface DailyRef { kcal: number; p: number; c: number; f: number; fib: number; personal: boolean }

/** Daily reference: the user's own targets when they've set weight/height/age, else FDA label values. */
export function dailyRef(data: AppData): DailyRef {
  const t: Targets = computeTargets(data.profile, prefsOf(data));
  if (t.kcal && t.proteinG) {
    return { kcal: t.kcal, p: Math.round((t.proteinG[0] + t.proteinG[1]) / 2), c: t.carbG ?? FDA_DV.c, f: t.fatG ?? FDA_DV.f, fib: t.fiberG ?? FDA_DV.fib, personal: true };
  }
  return { ...FDA_DV, personal: false };
}

export const pctOf = (n: Nutrients, ref: DailyRef) => ({
  kcal: Math.round((n.kcal / ref.kcal) * 100), p: Math.round((n.p / ref.p) * 100), c: Math.round((n.c / ref.c) * 100),
  f: Math.round((n.f / ref.f) * 100), fib: Math.round((n.fib / ref.fib) * 100),
});

export interface PrepStep { id: string; title: string; detail: string; minutes: number }
export interface Leftover { id: string; name: string; grams: number; ideas: { id: string; name: string }[] }

export function planInsights(data: AppData, plan: MealPlan) {
  const d = planDetails(data, plan);
  const ref = dailyRef(data);
  const personDays = Math.max(1, plan.days * plan.people);
  const tot: Nutrients = { kcal: 0, p: 0, c: 0, f: 0, fib: 0 };
  for (const it of d.items) (Object.keys(tot) as (keyof Nutrients)[]).forEach((k) => (tot[k] += it.perServing[k] * it.item.servings));
  const perDay: Nutrients = { kcal: 0, p: 0, c: 0, f: 0, fib: 0 };
  (Object.keys(tot) as (keyof Nutrients)[]).forEach((k) => (perDay[k] = Math.round(tot[k] / personDays)));
  const coveredShare = plan.mealTypes.reduce((s, m) => s + ({ breakfast: 0.25, lunch: 0.3, dinner: 0.32, snack: 0.13 }[m]), 0);

  // Reuse: main ingredients that appear in two or more recipes in this plan.
  const uses = new Map<string, Set<string>>();
  for (const it of d.items) for (const i of it.resolved.ingredients) if (!MINOR.has(i.id)) (uses.get(i.id) ?? uses.set(i.id, new Set()).get(i.id)!).add(it.resolved.recipe.id);
  const short = (id: string) => ingredient(id).name.split(',')[0].replace(/^canned |^frozen /i, '');
  const shared = [...uses.entries()].filter(([, r]) => r.size >= 2).map(([id, r]) => ({ id, name: short(id), recipes: r.size }));

  // Leftovers: whole packages bought minus what the plan uses.
  const inPlan = new Set(plan.items.map((i) => i.recipeId));
  const leftovers: Leftover[] = [];
  for (const g of d.grocery) {
    if (MINOR.has(g.id)) continue;
    const pk = packagesFor(data, g.id, g.grams);
    const left = pk.count * pk.pkgGrams - g.grams;
    if (left < Math.max(120, pk.pkgGrams * 0.3) || pk.price / pk.pkgGrams * left < 0.75) continue;
    const ideas = RECIPES.filter((r) => !inPlan.has(r.id) && r.ingredients.some((i) => i.id === g.id)).slice(0, 2).map((r) => ({ id: r.id, name: r.name }));
    leftovers.push({ id: g.id, name: ingredient(g.id).name, grams: Math.round(left), ideas });
  }
  leftovers.sort((a, b) => b.grams - a.grams);

  return { ...d, perDay, pct: pctOf(perDay, ref), ref, coveredShare, shared, leftovers: leftovers.slice(0, 4), prep: prepSchedule(data, plan), prepMin: prepMinutes(plan), freezer: freezerPlan(plan) };
}

/**
 * Batch-cook order for prep day: longest hands-off cooking first (oven), all
 * grains in one go, stovetop next, no-cook assembly last, then cool and pack.
 */
export function prepSchedule(data: AppData, plan: MealPlan): PrepStep[] {
  const d = planDetails(data, plan);
  const recs = d.items.map((i) => ({ r: i.resolved.recipe, scaled: i.scaled }));
  const steps: PrepStep[] = [];
  const oven = recs.filter((x) => x.r.kitchen.includes('oven')).sort((a, b) => b.r.cookMin - a.r.cookMin);
  const stove = recs.filter((x) => !x.r.kitchen.includes('oven') && x.r.cookMin > 0);
  const cold = recs.filter((x) => x.r.cookMin === 0);
  if (oven.length) {
    steps.push({ id: 'oven', title: 'Oven on first', detail: `Start the longest bake: ${oven.map((x) => `${x.r.name} (${x.r.cookMin} min)`).join(', ')}. It cooks while you do everything else.`, minutes: oven[0].r.prepMin });
  }
  const grains = new Map<string, number>();
  for (const x of recs) for (const i of x.scaled) if (GRAINS[i.id]) grains.set(i.id, (grains.get(i.id) ?? 0) + i.grams);
  if (grains.size) {
    const unit = data.profile?.unit ?? 'lb';
    const list = [...grains.entries()].map(([id, g]) => `${unit === 'lb' ? `${(g / 185).toFixed(1)} cups` : `${Math.round(g)} g`} dry ${GRAINS[id]}`);
    steps.push({ id: 'grains', title: 'Cook all the grains at once', detail: `${list.join(', ')}, for every recipe that needs them. Spread rice on a tray to cool fast.`, minutes: 5 });
  }
  if (stove.length) {
    steps.push({ id: 'stove', title: 'Stovetop', detail: `${stove.map((x) => x.r.name).join(', ')}. Chop for every recipe first, then run two burners at once${oven.length || grains.size ? ' while the ' + [oven.length ? 'oven' : '', grains.size ? 'grains' : ''].filter(Boolean).join(' and ') + ' cook' : ''}.`, minutes: stove.reduce((n, x) => n + x.r.prepMin, 0) });
  }
  if (cold.length) steps.push({ id: 'cold', title: 'No-cook assembly', detail: `${cold.map((x) => x.r.name).join(', ')}. Do these while hot food cools.`, minutes: cold.reduce((n, x) => n + x.r.prepMin, 0) });
  steps.push({ id: 'pack', title: 'Cool, portion, label', detail: 'Get cooked food into the fridge within 2 hours. Shallow containers cool faster. Label each with the dish and date.', minutes: 10 });
  return steps;
}

/**
 * Rough prep-day length: all chopping/assembly, plus cooking with two things
 * going at once (oven + burner), part of which overlaps with chopping.
 */
export function prepMinutes(plan: MealPlan) {
  const rs = plan.items.map((i) => getRecipe(i.recipeId)).filter(Boolean) as Recipe[];
  const cooks = rs.map((r) => r.cookMin).sort((a, b) => b - a);
  const cook = cooks.filter((_, i) => i % 2 === 0).reduce((n, m) => n + m, 0);
  return Math.round((rs.reduce((n, r) => n + r.prepMin, 0) + cook * 0.6 + 10) / 5) * 5;
}

/** Servings to freeze: anything eaten after day 4 that freezes well. */
export function freezerPlan(plan: MealPlan) {
  if (plan.days <= 4) return [] as { id: string; name: string; servings: number }[];
  const fridgeShare = 4 / plan.days;
  return plan.items
    .map((i) => ({ r: getRecipe(i.recipeId) as Recipe, n: i.servings }))
    .filter((x) => /Freezes/.test(x.r.storage))
    .map((x) => ({ id: x.r.id, name: x.r.name, servings: Math.max(1, Math.round(x.n * (1 - fridgeShare))) }));
}
