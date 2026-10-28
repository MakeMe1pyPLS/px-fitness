// Nutrition engine: targets, recipe resolution (diet/allergy swaps), cost,
// meal recommendations, meal-prep plans, grocery consolidation and budget.
// Every number produced here is an estimate and is labelled that way in the UI.

import type { AppData, Budget, GroceryItem, MealPlan, MealType, NutritionPrefs, PlanItem, Profile } from './types';
import { INGREDIENTS, RECIPES, ingredient, recipe as getRecipe, allowedByPattern, type Ingredient, type Recipe, PRICE_SOURCE } from './foods';
import { isProteinForward } from './goals';
import { addDays, daysBetween, toDateKey, uid, weekStart } from './dates';
import { isTrainingDay, nextTemplate, estimateMinutes } from './planner';

export const DEFAULT_PREFS: Omit<NutritionPrefs, 'updatedAt'> = {
  pattern: 'omnivore', allergies: [], dislikes: [], cuisines: [], cookingSkill: 'basic', kitchen: ['stove', 'microwave'],
  maxPrepMinutes: 45, people: 1, mealsPerDay: 3, showNumbers: true,
};

export function prefsOf(data: AppData): NutritionPrefs {
  return data.nutrition.prefs ?? { ...DEFAULT_PREFS, updatedAt: '' };
}

// ── Targets ────────────────────────────────────────────────────────────────
export interface Targets {
  kcal?: number;
  proteinG?: [number, number];
  fatG?: number;
  carbG?: number;
  fiberG?: number;
  basis: string[];
  missing: string[];
  blocked?: string;
}

const ACTIVITY = { light: 1.375, moderate: 1.55, high: 1.725 } as const;

export function defaultActivity(profile: Profile | null): 'light' | 'moderate' | 'high' {
  const n = profile?.trainingDays.length ?? 0;
  return n <= 2 ? 'light' : n <= 4 ? 'moderate' : 'high';
}

const GOAL_FACTOR: Partial<Record<Profile['goal'], [number, string]>> = {
  lose_fat: [0.85, 'about 15% below maintenance (a moderate deficit, capped at 500 kcal)'],
  recomp: [0.95, 'slightly below maintenance'],
  gain_weight: [1.12, 'about 12% above maintenance (capped at +500 kcal)'],
  build_muscle: [1.08, 'about 8% above maintenance'],
  lean_muscle: [1.05, 'about 5% above maintenance'],
};

export function computeTargets(profile: Profile | null, prefs: NutritionPrefs): Targets {
  const basis: string[] = [];
  const missing: string[] = [];
  if (prefs.age !== undefined && prefs.age < 18) {
    return { basis, missing, blocked: 'Energy and macro estimates here are built for adults. For under-18s, growth needs vary a lot, so a doctor or registered dietitian is the right source. Meal ideas still work.' };
  }
  if (!prefs.weightKg) missing.push('weight');
  if (!prefs.heightCm) missing.push('height');
  if (!prefs.age) missing.push('age');
  const t: Targets = { basis, missing };
  if (prefs.weightKg) {
    const fwd = profile ? isProteinForward(profile) : false;
    const [lo, hi] = fwd ? [1.6, 2.2] : [1.2, 1.6];
    t.proteinG = [Math.round(prefs.weightKg * lo / 5) * 5, Math.round(prefs.weightKg * hi / 5) * 5];
    basis.push(`Protein: ${lo}–${hi} g per kg of body weight, a common reference range for ${fwd ? 'people training for strength, muscle or fat loss' : 'active adults'}.`);
  }
  if (prefs.weightKg && prefs.heightCm && prefs.age) {
    const sexAdj = prefs.sex === 'male' ? 5 : prefs.sex === 'female' ? -161 : -78;
    const bmr = 10 * prefs.weightKg + 6.25 * prefs.heightCm - 5 * prefs.age + sexAdj;
    const act = prefs.activity ?? defaultActivity(profile);
    const maint = bmr * ACTIVITY[act];
    const g = profile ? GOAL_FACTOR[profile.goal] : undefined;
    let kcal = maint * (g?.[0] ?? 1);
    if (g && g[0] < 1) kcal = Math.max(kcal, maint - 500, bmr);
    if (g && g[0] > 1) kcal = Math.min(kcal, maint + 500);
    t.kcal = Math.round(kcal / 50) * 50;
    t.fatG = Math.round((t.kcal * 0.3) / 9);
    const proteinMid = t.proteinG ? (t.proteinG[0] + t.proteinG[1]) / 2 : 0;
    t.carbG = Math.max(0, Math.round((t.kcal - t.fatG * 9 - proteinMid * 4) / 4));
    t.fiberG = Math.round((t.kcal / 1000) * 14);
    basis.unshift(
      `Energy: Mifflin-St Jeor resting estimate${prefs.sex === 'unspecified' || !prefs.sex ? ' (sex not given, so the midpoint of the two formulas)' : ''} × ${ACTIVITY[act]} for ${act} activity${prefs.activity ? '' : ' (from your training days)'}, then ${g ? g[1] : 'kept at maintenance'} for your goal.`,
      'Fat about 30% of energy; carbohydrates fill the rest. Fiber: 14 g per 1,000 kcal (U.S. Dietary Guidelines).',
    );
  }
  return t;
}

export const HYDRATION_NOTE = 'General reference: the U.S. National Academies’ adequate total water intake is about 3.7 L a day for men and 2.7 L for women, counting all drinks and food. Needs rise with heat and long sessions.';

// ── Prices ─────────────────────────────────────────────────────────────────
export function priceOf(data: AppData, id: string) {
  const o = data.nutrition.prices[id];
  const ing = ingredient(id);
  if (o) return { price: o.price, pkgGrams: o.pkgGrams, label: ing.pkg.label, source: 'you' as const, sourceLabel: PRICE_SOURCE.you };
  return { price: ing.pkg.price, pkgGrams: ing.pkg.grams, label: ing.pkg.label, source: ing.pkg.source, sourceLabel: PRICE_SOURCE[ing.pkg.source] };
}

// ── Recipe resolution ──────────────────────────────────────────────────────
export interface ResolvedIngredient { id: string; grams: number; swappedFrom?: string; reason?: string }
export interface Resolved {
  recipe: Recipe;
  ingredients: ResolvedIngredient[]; // for the whole recipe (recipe.servings)
  autoSwaps: string[];
  ok: boolean;
  blockReason?: string;
}

function conflicts(ing: Ingredient, prefs: NutritionPrefs): string | null {
  if (!allowedByPattern(ing, prefs.pattern)) return `not ${prefs.pattern}`;
  const a = ing.allergens.find((x) => prefs.allergies.includes(x));
  if (a) return `contains ${a.replace('_', ' ')}`;
  if (prefs.dislikes.includes(ing.id)) return 'on your dislike list';
  return null;
}

/** Applies user swaps, then automatic swaps for diet, allergies and dislikes. */
export function resolveRecipe(r: Recipe, prefs: NutritionPrefs, userSwaps: Record<string, string> = {}): Resolved {
  const out: ResolvedIngredient[] = [];
  const autoSwaps: string[] = [];
  for (const it of r.ingredients) {
    let id = it.id;
    let grams = it.grams;
    let swappedFrom: string | undefined;
    if (userSwaps[id]) {
      const sub = ingredient(id).subs.find((s) => s.id === userSwaps[id]);
      swappedFrom = id;
      grams = Math.round(grams * (sub?.factor ?? 1));
      id = userSwaps[id];
    }
    const why = conflicts(ingredient(id), prefs);
    if (why) {
      const alt = ingredient(id).subs.find((s) => !conflicts(ingredient(s.id), prefs));
      if (!alt) return { recipe: r, ingredients: [], autoSwaps, ok: false, blockReason: `${ingredient(id).name} is ${why}, with no suitable swap` };
      autoSwaps.push(`${ingredient(id).name} → ${ingredient(alt.id).name} (${why})`);
      swappedFrom = swappedFrom ?? id;
      grams = Math.round(grams * alt.factor);
      id = alt.id;
    }
    const existing = out.find((x) => x.id === id);
    if (existing) existing.grams += grams;
    else out.push({ id, grams, swappedFrom });
  }
  return { recipe: r, ingredients: out, autoSwaps, ok: true };
}

export function kitchenOk(r: Recipe, prefs: NutritionPrefs): boolean {
  return r.kitchen.every((k) => prefs.kitchen.includes(k));
}

export interface Nutrients { kcal: number; p: number; c: number; f: number; fib: number }

export function nutrientsOf(items: { id: string; grams: number }[], servings: number): Nutrients {
  const n = { kcal: 0, p: 0, c: 0, f: 0, fib: 0 };
  for (const it of items) {
    const v = ingredient(it.id).per100;
    (Object.keys(n) as (keyof Nutrients)[]).forEach((k) => (n[k] += (v[k] * it.grams) / 100));
  }
  (Object.keys(n) as (keyof Nutrients)[]).forEach((k) => (n[k] = Math.round(n[k] / servings)));
  return n;
}

/** Cost of the portion actually used (not the whole package). */
export function portionCost(data: AppData, items: { id: string; grams: number }[]): number {
  return items.reduce((s, it) => { const p = priceOf(data, it.id); return s + (it.grams / p.pkgGrams) * p.price; }, 0);
}

export function scaleItems(items: { id: string; grams: number }[], factor: number) {
  return items.map((i) => ({ ...i, grams: Math.round(i.grams * factor) }));
}

export function eligibleRecipes(prefs: NutritionPrefs, mealType?: MealType) {
  return RECIPES.filter((r) => (!mealType || r.mealTypes.includes(mealType)) && kitchenOk(r, prefs))
    .map((r) => resolveRecipe(r, prefs))
    .filter((x) => x.ok);
}

// ── Recommendation ─────────────────────────────────────────────────────────
export function mealTypeNow(d = new Date()): MealType {
  const h = d.getHours() + d.getMinutes() / 60;
  return h < 10.5 ? 'breakfast' : h < 15 ? 'lunch' : h < 17 ? 'snack' : 'dinner';
}

export function budgetPerMeal(data: AppData): number | null {
  const b = data.nutrition.budget;
  if (!b) return null;
  if (b.perMeal) return b.perMeal;
  const prefs = prefsOf(data);
  const weekly = weeklyAmount(b) * groceryShare(b);
  if (!weekly) return null;
  return weekly / (7 * prefs.mealsPerDay * prefs.people);
}

/** How often the user has replaced each ingredient in past plans. */
export function swapCounts(data: AppData): Map<string, number> {
  const m = new Map<string, number>();
  data.nutrition.plans.forEach((p) => p.items.forEach((i) => Object.keys(i.swaps).forEach((k) => m.set(k, (m.get(k) ?? 0) + 1))));
  return m;
}

export interface Recommendation { resolved: Resolved; perServing: Nutrients; costPerServing: number; reasons: string[]; score: number }

export function recommend(data: AppData, mealType: MealType, exclude: string[] = [], today = toDateKey(new Date())): Recommendation[] {
  const prefs = prefsOf(data);
  const p = data.profile;
  const fwd = p ? isProteinForward(p) : false;
  const perMeal = budgetPerMeal(data);
  const recent = new Set(data.nutrition.log.filter((l) => l.recipeId && daysBetween(l.date, today) <= 3).map((l) => l.recipeId!));
  const rejected = new Set(data.nutrition.feedback.filter((f) => f.kind === 'rejected' && daysBetween(f.at.slice(0, 10), today) <= 14).map((f) => f.recipeId));
  const accepted = data.nutrition.feedback.filter((f) => f.kind === 'accepted').map((f) => getRecipe(f.recipeId)).filter(Boolean) as Recipe[];
  const quickPreference = accepted.length >= 3 && accepted.filter((r) => r.prepMin + r.cookMin <= 15).length / accepted.length >= 0.6;
  const swaps = swapCounts(data);
  const training = p ? isTrainingDay(p, today) : false;

  const options = eligibleRecipes(prefs, mealType).filter((x) => !exclude.includes(x.recipe.id));
  // Respect time limit unless nothing fits.
  const timed = options.filter((x) => x.recipe.prepMin + x.recipe.cookMin <= prefs.maxPrepMinutes);
  const pool = timed.length ? timed : options;

  return pool.map((res) => {
    const r = res.recipe;
    const n = nutrientsOf(res.ingredients, r.servings);
    const cost = portionCost(data, res.ingredients) / r.servings;
    const reasons: string[] = [];
    let s = 0;
    const g = p?.goal;
    if (fwd && n.p >= 25) { s += 1 + n.p / 60; reasons.push(`${n.p} g protein per serving`); } else s += n.p / 80;
    if (g === 'lose_fat' && n.kcal <= 600 && n.fib >= 6) { s += 0.8; reasons.push('filling: fiber-rich at a moderate size'); }
    if (g === 'gain_weight' && n.kcal >= 550) { s += 0.8; reasons.push('energy-dense for weight gain'); }
    if (perMeal !== null) {
      if (cost <= perMeal) { s += 0.8; reasons.push(`about $${cost.toFixed(2)} a serving, within your ~$${perMeal.toFixed(2)} per meal`); }
      else {
        // Penalty grows with how far over budget a serving is.
        const over = (cost - perMeal) / perMeal;
        s -= 1.2 + Math.min(4, over * 2);
        if (over < 0.5) reasons.push(`about $${cost.toFixed(2)} a serving, a little over your ~$${perMeal.toFixed(2)} per meal`);
      }
    }
    const mins = r.prepMin + r.cookMin;
    if (quickPreference && mins <= 15) { s += 0.8; reasons.push('quick, like the meals you usually pick'); }
    if (mins <= 10) s += 0.2;
    const rating = data.nutrition.ratings[r.id];
    if (rating && rating >= 4) { s += rating === 5 ? 2 : 1.4; reasons.push(`you rated it ${rating}/5`); }
    if (rating && rating <= 2) s -= 2;
    if (data.nutrition.saved.includes(r.id)) { s += 0.6; reasons.push('in your saved meals'); }
    if (recent.has(r.id)) s -= 2;
    if (rejected.has(r.id)) s -= 3;
    if (prefs.cuisines.includes(r.cuisine)) { s += 0.5; reasons.push(`${r.cuisine} cuisine`); }
    if (training && (mealType === 'lunch' || mealType === 'dinner') && n.c >= 50) { s += 0.3; reasons.push('carbs and protein on a training day'); }
    for (const it of res.ingredients) if ((swaps.get(it.id) ?? 0) >= 2) s -= 0.7;
    if (res.autoSwaps.length) reasons.push(`adjusted for you: ${res.autoSwaps.join('; ')}`);
    return { resolved: res, perServing: n, costPerServing: cost, reasons, score: s };
  }).sort((a, b) => b.score - a.score);
}

// ── Meal prep ──────────────────────────────────────────────────────────────
export interface PrepOptions { days: number; people: number; mealTypes: MealType[]; mode: 'favorites' | 'new' | 'mix'; strategy: 'balanced' | 'budget' }

const freezable = (r: Recipe) => /Freezes/.test(r.storage);

export function generatePlan(data: AppData, o: PrepOptions): MealPlan {
  const prefs = prefsOf(data);
  const items: PlanItem[] = [];
  const used = new Set<string>();
  for (const mt of o.mealTypes) {
    const needed = o.days * o.people;
    let ranked = recommend(data, mt, [...used]);
    if (o.strategy === 'budget') ranked = [...ranked].sort((a, b) => a.costPerServing - b.costPerServing || b.score - a.score);
    if (o.mode === 'favorites') ranked.sort((a, b) => Number(isFav(data, b.resolved.recipe.id)) - Number(isFav(data, a.resolved.recipe.id)));
    if (o.mode === 'new') ranked.sort((a, b) => Number(isFav(data, a.resolved.recipe.id) || eaten(data, a.resolved.recipe.id)) - Number(isFav(data, b.resolved.recipe.id) || eaten(data, b.resolved.recipe.id)));
    // Past day 4, prefer dishes that freeze well.
    if (o.days > 4) ranked.sort((a, b) => Number(freezable(b.resolved.recipe)) - Number(freezable(a.resolved.recipe)));
    const count = mt === 'breakfast' || mt === 'snack' ? (o.days >= 5 ? 2 : 1) : o.days >= 5 ? 3 : 2;
    const chosen = ranked.slice(0, Math.min(count, ranked.length));
    if (!chosen.length) continue;
    const base = Math.floor(needed / chosen.length);
    chosen.forEach((c, i) => {
      used.add(c.resolved.recipe.id);
      items.push({ recipeId: c.resolved.recipe.id, mealType: mt, servings: base + (i < needed % chosen.length ? 1 : 0), swaps: {} });
    });
  }
  return { id: uid('mp_'), createdAt: new Date().toISOString(), days: o.days, people: o.people, mealTypes: o.mealTypes, items, status: 'active', prepped: false, eaten: {} };
}

const isFav = (d: AppData, id: string) => d.nutrition.saved.includes(id) || (d.nutrition.ratings[id] ?? 0) >= 4;
const eaten = (d: AppData, id: string) => d.nutrition.log.some((l) => l.recipeId === id);

export interface ItemDetail { item: PlanItem; resolved: Resolved; scaled: ResolvedIngredient[]; perServing: Nutrients; portionCost: number }

export function planDetails(data: AppData, plan: MealPlan) {
  const prefs = prefsOf(data);
  const items: ItemDetail[] = plan.items.map((item) => {
    const r = getRecipe(item.recipeId)!;
    const resolved = resolveRecipe(r, prefs, item.swaps);
    const scaled = scaleItems(resolved.ingredients, item.servings / r.servings) as ResolvedIngredient[];
    return { item, resolved, scaled, perServing: nutrientsOf(resolved.ingredients, r.servings), portionCost: portionCost(data, scaled) };
  });
  const grocery = consolidate(items.flatMap((i) => i.scaled));
  const cash = grocery.reduce((s, g) => s + packagesFor(data, g.id, g.grams).cost, 0);
  const servings = plan.items.reduce((n, i) => n + i.servings, 0);
  const portion = items.reduce((s, i) => s + i.portionCost, 0);
  return { items, grocery, cash, portion, servings, perServingCost: servings ? portion / servings : 0 };
}

export function consolidate(items: { id: string; grams: number }[]) {
  const m = new Map<string, number>();
  items.forEach((i) => m.set(i.id, (m.get(i.id) ?? 0) + i.grams));
  return [...m.entries()].map(([id, grams]) => ({ id, grams }));
}

export function packagesFor(data: AppData, id: string, grams: number) {
  const p = priceOf(data, id);
  const count = Math.max(1, Math.ceil(grams / p.pkgGrams - 0.02)); // tolerate rounding
  return { count, cost: count * p.price, ...p };
}

export function groceryFromPlan(data: AppData, plan: MealPlan, previous: GroceryItem[]): GroceryItem[] {
  const { grocery } = planDetails(data, plan);
  const manual = previous.filter((g) => g.manual);
  const fromPlan = grocery.map((g) => {
    const prev = previous.find((x) => x.ingredientId === g.id && !x.manual);
    return { id: prev?.id ?? uid('g_'), ingredientId: g.id, name: ingredient(g.id).name, grams: g.grams, category: ingredient(g.id).category, checked: prev?.checked ?? false, manual: false };
  });
  return [...fromPlan, ...manual];
}

export function groceryCost(data: AppData, list: GroceryItem[]) {
  let total = 0;
  let unknown = 0;
  for (const g of list) {
    if (g.ingredientId && g.grams) total += packagesFor(data, g.ingredientId, g.grams).cost;
    else unknown++;
  }
  return { total, unknown };
}

// ── Quantities ─────────────────────────────────────────────────────────────
export function formatQty(id: string, grams: number, unit: 'lb' | 'kg' = 'lb'): string {
  const ing = ingredient(id);
  if (ing.unit) {
    const n = grams / ing.unit.grams;
    const r = n < 3 ? Math.round(n * 2) / 2 : Math.round(n);
    const abbr = ing.unit.name === 'tbsp' || ing.unit.name === 'tsp';
    return `${r % 1 ? r.toFixed(1) : r} ${ing.unit.name}${r === 1 || abbr ? '' : ing.unit.name.endsWith('h') ? 'es' : 's'}`;
  }
  if (id === 'milk') return unit === 'lb' ? `${(grams / 240).toFixed(grams < 480 ? 1 : 0)} cup${grams > 240 ? 's' : ''}` : `${Math.round(grams)} ml`;
  if (unit === 'lb') {
    if (grams >= 340) return `${(grams / 453.6).toFixed(1)} lb`;
    return `${Math.round(grams / 28.35)} oz`;
  }
  return grams >= 1000 ? `${(grams / 1000).toFixed(2)} kg` : `${Math.round(grams)} g`;
}

// ── Budget ─────────────────────────────────────────────────────────────────
export function weeklyAmount(b: Budget): number {
  return b.period === 'day' ? b.amount * 7 : b.period === 'month' ? (b.amount * 12) / 52 : b.amount;
}
export function groceryShare(b: Budget): number {
  return b.scope === 'groceries' ? 1 : b.scope === 'eating_out' ? 0 : 1 - b.eatingOutShare;
}

export function budgetSummary(data: AppData, today = toDateKey(new Date())) {
  const b = data.nutrition.budget;
  if (!b) return null;
  const ws = weekStart(today);
  const we = addDays(ws, 6);
  const week = data.nutrition.spending.filter((s) => s.date >= ws && s.date <= we);
  const spentGrocery = week.filter((s) => s.kind === 'grocery').reduce((n, s) => n + s.amount, 0);
  const spentOut = week.filter((s) => s.kind === 'eating_out').reduce((n, s) => n + s.amount, 0);
  const weekly = weeklyAmount(b);
  const groceryBudget = b.scope === 'eating_out' ? 0 : weekly * groceryShare(b);
  const outBudget = b.scope === 'groceries' ? 0 : weekly - groceryBudget;
  const active = data.nutrition.plans.find((p) => p.status === 'active');
  const planned = active ? planDetails(data, active).cash : 0;
  const spent = spentGrocery + spentOut;
  const prefs = prefsOf(data);
  return {
    weekly, groceryBudget, outBudget, spentGrocery, spentOut, spent,
    remaining: weekly - spent,
    plannedGrocery: planned,
    perDay: weekly / 7,
    perMeal: weekly / (7 * prefs.mealsPerDay * prefs.people),
    perPerson: weekly / prefs.people,
    overspendWeeks: overspendStreak(data),
  };
}

/** Number of recent weeks (up to 4) where logged grocery spend beat the grocery budget. */
function overspendStreak(data: AppData): number {
  const b = data.nutrition.budget;
  if (!b || b.scope === 'eating_out') return 0;
  const gb = weeklyAmount(b) * groceryShare(b);
  let n = 0;
  for (let i = 1; i <= 4; i++) {
    const ws = addDays(weekStart(toDateKey(new Date())), -7 * i);
    const we = addDays(ws, 6);
    const spent = data.nutrition.spending.filter((s) => s.kind === 'grocery' && s.date >= ws && s.date <= we).reduce((x, s) => x + s.amount, 0);
    if (spent > gb && spent > 0) n++;
  }
  return n;
}

// ── Training link ─────────────────────────────────────────────────────────
export function trainingContext(data: AppData, today = toDateKey(new Date())) {
  const p = data.profile;
  if (!p || !data.templates.length) return { kind: 'none' as const, text: 'No workout plan yet. Meal ideas still work on their own.' };
  if (!isTrainingDay(p, today)) return { kind: 'rest' as const, text: 'Rest day. Same targets as any other day: recovery still needs protein and regular meals.' };
  const t = nextTemplate(data)!;
  const mins = estimateMinutes(t);
  return {
    kind: 'train' as const,
    session: t.name,
    minutes: mins,
    text: `Training day: ${t.name}, about ${mins} min. A meal with carbohydrates and protein 1–3 hours before, and a protein-containing meal within a few hours after, works well for most people.${mins >= 60 || p.disciplines.includes('running') ? ' For longer or endurance sessions, a carb-rich snack beforehand can help.' : ''}`,
  };
}

export { INGREDIENTS, RECIPES };
