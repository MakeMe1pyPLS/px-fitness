import { test } from 'node:test';
import assert from 'node:assert/strict';
import { Store, type StorageLike } from '../src/lib/store';
import { RECIPES, INGREDIENTS, ingredient, recipe } from '../src/lib/foods';
import { computeTargets, resolveRecipe, nutrientsOf, recommend, generatePlan, planDetails, consolidate, budgetSummary, portionCost, packagesFor, DEFAULT_PREFS, eligibleRecipes, formatQty } from '../src/lib/nutrition';
import { generateTemplates } from '../src/lib/planner';
import { getExercise } from '../src/lib/exercises';
import { needsPrimary, migrateGoal } from '../src/lib/goals';
import { parseOverpass, coarse, buildQuery } from '../src/lib/places';
import { addDays, toDateKey } from '../src/lib/dates';
import type { NutritionPrefs, Profile } from '../src/lib/types';

class Mem implements StorageLike { m = new Map<string, string>(); getItem(k: string) { return this.m.get(k) ?? null; } setItem(k: string, v: string) { this.m.set(k, v); } removeItem(k: string) { this.m.delete(k); } }
const prefs = (o: Partial<NutritionPrefs> = {}): NutritionPrefs => ({ ...DEFAULT_PREFS, kitchen: ['stove', 'oven', 'microwave'], updatedAt: '', ...o });
const profile = (o: Partial<Profile> = {}): Profile => ({ name: '', goal: 'build_muscle', secondaryGoals: [], disciplines: [], primaryDiscipline: null, goalHistory: [], experience: 'intermediate', equipment: ['dumbbells', 'barbell'], sessionMinutes: 45, trainingDays: [1, 3, 5], preferredTime: 'evening', unit: 'lb', checkinsEnabled: true, createdAt: new Date().toISOString(), ...o });
function store(p = profile(), pr = prefs()) { const s = new Store(new Mem()); s.completeOnboarding(p); s.setPrefs(pr); return s; }

test('library integrity: every recipe ingredient exists and has a price and nutrition', () => {
  for (const r of RECIPES) for (const i of r.ingredients) assert.ok(ingredient(i.id), `${r.id} → ${i.id}`);
  for (const i of INGREDIENTS) { assert.ok(i.pkg.price > 0 && i.pkg.grams > 0, i.id); assert.ok(i.per100.kcal >= 0, i.id); for (const s of i.subs) assert.ok(ingredient(s.id), `${i.id} sub ${s.id}`); }
});

test('per-serving nutrition is plausible for every recipe (100–900 kcal)', () => {
  for (const r of RECIPES) {
    const n = nutrientsOf(r.ingredients, r.servings);
    assert.ok(n.kcal >= 100 && n.kcal <= 900, `${r.id}: ${n.kcal} kcal`);
    // Macros roughly reconcile with calories (within 15%).
    const fromMacros = n.p * 4 + n.c * 4 + n.f * 9;
    assert.ok(Math.abs(fromMacros - n.kcal) / n.kcal < 0.15, `${r.id}: macros ${fromMacros} vs ${n.kcal}`);
  }
});

test('allergies are never present in recommended meals', () => {
  for (const allergy of ['peanut', 'dairy', 'gluten', 'egg', 'fish', 'soy'] as const) {
    const s = store(profile(), prefs({ allergies: [allergy] }));
    for (const mt of ['breakfast', 'lunch', 'dinner', 'snack'] as const) {
      for (const rec of recommend(s.get(), mt)) {
        for (const it of rec.resolved.ingredients) assert.ok(!ingredient(it.id).allergens.includes(allergy), `${rec.resolved.recipe.id} has ${allergy} via ${it.id}`);
      }
    }
  }
});

test('vegan pattern swaps or excludes animal foods; swaps are explained', () => {
  const p = prefs({ pattern: 'vegan' });
  for (const r of eligibleRecipes(p)) for (const it of r.ingredients) assert.equal(ingredient(it.id).animal, null, `${r.recipe.id}: ${it.id}`);
  const chicken = resolveRecipe(recipe('chicken-rice-broccoli')!, p);
  assert.ok(chicken.ok);
  assert.match(chicken.autoSwaps[0], /Chicken breast.*→/);
});

test('dislikes are respected', () => {
  const p = prefs({ dislikes: ['spinach', 'onion'] });
  for (const r of eligibleRecipes(p)) assert.ok(!r.ingredients.some((i) => i.id === 'spinach' || i.id === 'onion'), r.recipe.id);
});

test('kitchen equipment filters recipes', () => {
  const noOven = eligibleRecipes(prefs({ kitchen: ['stove'] }));
  assert.ok(!noOven.some((r) => r.recipe.id === 'sheet-pan-chicken'));
  const none = eligibleRecipes(prefs({ kitchen: [] }));
  assert.ok(none.length > 0 && none.every((r) => r.recipe.kitchen.length === 0));
});

test('targets: missing body data → no calorie number, under-18 → blocked', () => {
  assert.equal(computeTargets(profile(), prefs()).kcal, undefined);
  assert.deepEqual(computeTargets(profile(), prefs()).missing, ['weight', 'height', 'age']);
  const minor = computeTargets(profile(), prefs({ age: 16, weightKg: 60, heightCm: 170 }));
  assert.ok(minor.blocked && minor.kcal === undefined);
});

test('targets: fat-loss deficit is moderate and never below resting estimate', () => {
  const base = { age: 30, weightKg: 80, heightCm: 180, sex: 'male' as const, activity: 'moderate' as const };
  const maint = computeTargets(profile({ goal: 'maintain' }), prefs(base)).kcal!;
  const cut = computeTargets(profile({ goal: 'lose_fat' }), prefs(base)).kcal!;
  const bulk = computeTargets(profile({ goal: 'gain_weight' }), prefs(base)).kcal!;
  assert.ok(maint - cut <= 500 && maint - cut > 0, `deficit ${maint - cut}`);
  assert.ok(bulk - maint <= 500 && bulk > maint);
  const bmr = 10 * 80 + 6.25 * 180 - 5 * 30 + 5;
  const tiny = computeTargets(profile({ goal: 'lose_fat' }), prefs({ ...base, activity: 'light', weightKg: 45, heightCm: 150, sex: 'female' })).kcal!;
  assert.ok(tiny >= 10 * 45 + 6.25 * 150 - 150 - 161 - 50, 'never below BMR');
  assert.ok(cut > bmr);
});

test('serving changes scale ingredients proportionally', () => {
  const s = store();
  const plan = generatePlan(s.get(), { days: 3, people: 1, mealTypes: ['lunch'], mode: 'mix', strategy: 'balanced' });
  s.savePlan(plan);
  const before = planDetails(s.get(), s.get().nutrition.plans[0]);
  const item = before.items[0];
  s.updatePlanItem(plan.id, 0, { servings: item.item.servings * 2 });
  const after = planDetails(s.get(), s.get().nutrition.plans.find((p) => p.id === plan.id)!);
  item.scaled.forEach((ing, i) => assert.ok(Math.abs(after.items[0].scaled[i].grams - ing.grams * 2) <= 2, ing.id));
});

test('meal prep: servings match days × people per meal type', () => {
  const s = store();
  const plan = generatePlan(s.get(), { days: 4, people: 2, mealTypes: ['breakfast', 'lunch', 'dinner'], mode: 'mix', strategy: 'balanced' });
  for (const mt of plan.mealTypes) assert.equal(plan.items.filter((i) => i.mealType === mt).reduce((n, i) => n + i.servings, 0), 8, mt);
  // lunch and dinner don't reuse the same recipe
  const ids = plan.items.map((i) => i.recipeId);
  assert.equal(new Set(ids).size, ids.length);
});

test('meal prep over 4 days prefers freezer-friendly dishes', () => {
  const s = store();
  const plan = generatePlan(s.get(), { days: 6, people: 1, mealTypes: ['dinner'], mode: 'mix', strategy: 'balanced' });
  assert.ok(plan.items.every((i) => /Freezes/.test(recipe(i.recipeId)!.storage)), plan.items.map((i) => i.recipeId).join());
});

test('grocery list consolidates the same ingredient across recipes', () => {
  const merged = consolidate([{ id: 'rice', grams: 300 }, { id: 'onion', grams: 100 }, { id: 'rice', grams: 450 }]);
  assert.deepEqual(merged.find((m) => m.id === 'rice'), { id: 'rice', grams: 750 });
  const s = store();
  s.savePlan(generatePlan(s.get(), { days: 5, people: 1, mealTypes: ['lunch', 'dinner'], mode: 'mix', strategy: 'balanced' }));
  const ids = s.get().nutrition.grocery.map((g) => g.ingredientId);
  assert.equal(new Set(ids).size, ids.length, 'no duplicate ingredients');
});

test('grocery list keeps checks and manual items across regeneration', () => {
  const s = store();
  const plan = generatePlan(s.get(), { days: 3, people: 1, mealTypes: ['dinner'], mode: 'mix', strategy: 'balanced' });
  s.savePlan(plan);
  const first = s.get().nutrition.grocery[0];
  s.toggleGrocery(first.id);
  s.addGrocery('Coffee');
  s.updatePlanItem(plan.id, 0, { servings: 5 });
  const g = s.get().nutrition.grocery;
  assert.ok(g.find((x) => x.id === first.id)?.checked);
  assert.ok(g.some((x) => x.name === 'Coffee' && x.manual));
});

test('portion cost ≠ package cost; edited prices flow into totals', () => {
  const s = store();
  const d = s.get();
  const portion = portionCost(d, [{ id: 'olive-oil', grams: 27 }]);
  const pkg = packagesFor(d, 'olive-oil', 27).cost;
  assert.ok(portion < 1 && pkg === 6.5);
  s.setPrice('rice', 5, 907);
  assert.equal(packagesFor(s.get(), 'rice', 900).cost, 5);
  assert.equal(packagesFor(s.get(), 'rice', 1000).count, 2);
});

test('ingredient substitution updates nutrition and cost', () => {
  const s = store();
  const plan = generatePlan(s.get(), { days: 3, people: 1, mealTypes: ['lunch'], mode: 'mix', strategy: 'balanced' });
  plan.items = [{ recipeId: 'chicken-rice-broccoli', mealType: 'lunch', servings: 3, swaps: {} }];
  s.savePlan(plan);
  const a = planDetails(s.get(), s.get().nutrition.plans.at(-1)!);
  s.updatePlanItem(plan.id, 0, { swaps: { 'chicken-breast': 'tofu' } });
  const b = planDetails(s.get(), s.get().nutrition.plans.at(-1)!);
  assert.notEqual(a.portion.toFixed(2), b.portion.toFixed(2));
  assert.ok(b.items[0].scaled.some((i) => i.id === 'tofu') && !b.items[0].scaled.some((i) => i.id === 'chicken-breast'));
  assert.ok(s.get().nutrition.grocery.some((g) => g.ingredientId === 'tofu'));
});

test('budget summary math', () => {
  const s = store(profile(), prefs({ people: 2, mealsPerDay: 3 }));
  s.setBudget({ amount: 140, period: 'week', scope: 'combined', eatingOutShare: 0.25, currency: 'USD' });
  s.addSpend({ date: toDateKey(new Date()), amount: 40, kind: 'grocery' });
  s.addSpend({ date: toDateKey(new Date()), amount: 15, kind: 'eating_out' });
  const b = budgetSummary(s.get())!;
  assert.equal(b.weekly, 140);
  assert.equal(b.groceryBudget, 105);
  assert.equal(b.outBudget, 35);
  assert.equal(b.remaining, 85);
  assert.ok(Math.abs(b.perMeal - 140 / 42) < 0.001);
  s.setBudget({ amount: 600, period: 'month', scope: 'groceries', eatingOutShare: 0, currency: 'USD' });
  assert.ok(Math.abs(budgetSummary(s.get())!.weekly - 600 * 12 / 52) < 0.01);
});

test('tight budget favors cheaper meals', () => {
  const s = store();
  s.setBudget({ amount: 3, period: 'day', scope: 'groceries', eatingOutShare: 0, currency: 'USD' });
  const top = recommend(s.get(), 'dinner')[0];
  s.setBudget({ amount: 200, period: 'day', scope: 'groceries', eatingOutShare: 0, currency: 'USD' });
  const all = recommend(s.get(), 'dinner');
  const median = all.map((r) => r.costPerServing).sort((a, b) => a - b)[Math.floor(all.length / 2)];
  assert.ok(top.costPerServing <= median, `${top.costPerServing} vs median ${median}`);
});

test('recommendations avoid recently eaten and rejected meals, and learn from ratings', () => {
  const s = store();
  const first = recommend(s.get(), 'dinner')[0].resolved.recipe.id;
  s.logMeal({ recipeId: first, name: 'x', where: 'home', date: toDateKey(new Date()) });
  assert.notEqual(recommend(s.get(), 'dinner')[0].resolved.recipe.id, first);
  const second = recommend(s.get(), 'dinner')[0].resolved.recipe.id;
  s.mealFeedback(second, 'rejected');
  const third = recommend(s.get(), 'dinner')[0].resolved.recipe.id;
  assert.ok(third !== second && third !== first);
  const low = recommend(s.get(), 'dinner').at(-1)!.resolved.recipe.id;
  s.rateRecipe(low, 5);
  s.toggleSaved(low);
  const rank = recommend(s.get(), 'dinner').findIndex((r) => r.resolved.recipe.id === low);
  assert.ok(rank <= 3, `rated meal rank ${rank}`);
});

test('quick-meal preference is learned from accepted meals', () => {
  const s = store();
  for (const id of ['pb-banana-toast', 'yogurt-pb-snack', 'tuna-chickpea-wraps', 'yogurt-berry-bowl']) s.mealFeedback(id, 'accepted');
  const top = recommend(s.get(), 'lunch')[0];
  assert.ok(top.reasons.some((r) => /quick/.test(r)) || top.resolved.recipe.prepMin + top.resolved.recipe.cookMin <= 15);
});

test('fat-loss vs gain goals shape recommendations differently', () => {
  const cut = store(profile({ goal: 'lose_fat' }));
  const gain = store(profile({ goal: 'gain_weight' }));
  const avg = (s: Store) => { const r = recommend(s.get(), 'dinner').slice(0, 3); return r.reduce((n, x) => n + x.perServing.kcal, 0) / r.length; };
  assert.ok(avg(gain) > avg(cut), `${avg(gain)} vs ${avg(cut)}`);
});

test('disciplines shape the workout plan', () => {
  const pl = generateTemplates(profile({ disciplines: ['powerlifting'], primaryDiscipline: 'powerlifting' }));
  const ids = pl.flatMap((t) => t.exercises.map((e) => e.exerciseId));
  assert.ok(ids.includes('back-squat') && ids.includes('bench-press') && ids.includes('deadlift'));
  assert.ok(pl.every((t) => t.exercises.filter((e) => getExercise(e.exerciseId)!.metric === 'weight_reps').every((e) => e.target === '3–5 reps')));
  const cal = generateTemplates(profile({ disciplines: ['calisthenics'], equipment: [] }));
  assert.ok(cal.flatMap((t) => t.exercises).every((e) => getExercise(e.exerciseId)!.equipment === 'bodyweight'));
  assert.ok(cal.flatMap((t) => t.exercises).some((e) => ['pull-up', 'negative-pull-up', 'dip'].includes(e.exerciseId)));
  const run = generateTemplates(profile({ disciplines: ['running'] }));
  assert.ok(run.flatMap((t) => t.exercises).some((e) => e.exerciseId === 'easy-run'));
  const mob = generateTemplates(profile({ goal: 'mobility' }));
  assert.ok(mob.flatMap((t) => t.exercises).some((e) => e.exerciseId.startsWith('hip-') || e.exerciseId === 'deep-squat-hold'));
});

test('primary focus is required only for conflicting disciplines', () => {
  assert.equal(needsPrimary(['calisthenics', 'gymnastics']), false);
  assert.equal(needsPrimary(['powerlifting', 'running']), true);
  assert.equal(migrateGoal('muscle'), 'build_muscle');
});

test('changing goals keeps history and logs the change', () => {
  const s = store();
  const st = s.startSession('full')!;
  s.updateSet(st.id, 0, 0, { reps: 5, done: true });
  s.finishSession(st.id);
  s.updateProfile({ goal: 'lose_fat', disciplines: ['running'], primaryDiscipline: 'running' }, true);
  assert.equal(s.get().sessions.length, 1);
  assert.equal(s.get().profile!.goalHistory.at(-1)!.goal, 'lose_fat');
});

test('v1 data migrates (old goal ids, no nutrition)', () => {
  const m = new Mem();
  m.setItem('kova:data', JSON.stringify({ version: 1, profile: { name: '', goal: 'muscle', experience: 'beginner', equipment: [], sessionMinutes: 30, trainingDays: [1], preferredTime: 'evening', unit: 'lb', checkinsEnabled: true, createdAt: new Date().toISOString() }, sessions: [] }));
  const s = new Store(m);
  assert.equal(s.get().profile!.goal, 'build_muscle');
  assert.deepEqual(s.get().profile!.disciplines, []);
  assert.ok(s.get().nutrition && Array.isArray(s.get().nutrition.plans));
});

test('places: parse OSM, classify, sort by distance, keep only coarse location', () => {
  const origin = { lat: 40.0, lon: -75.0 };
  const json = { elements: [
    { type: 'node', id: 1, lat: 40.01, lon: -75.0, tags: { name: 'Far Diner', amenity: 'restaurant', cuisine: 'american;burger', takeaway: 'yes' } },
    { type: 'way', id: 2, center: { lat: 40.001, lon: -75.0 }, tags: { name: 'ALDI', shop: 'supermarket' } },
    { type: 'node', id: 3, lat: 40.002, lon: -75.0, tags: { name: 'Green Bowl', amenity: 'restaurant', 'diet:vegan': 'yes' } },
    { type: 'node', id: 4, lat: 40.003, lon: -75.0, tags: { amenity: 'restaurant' } },
  ] };
  const ps = parseOverpass(json, origin);
  assert.deepEqual(ps.map((p) => p.name), ['ALDI', 'Green Bowl', 'Far Diner']);
  assert.equal(ps[0].kind, 'discount');
  assert.equal(ps[1].vegan, true);
  assert.equal(ps[1].vegetarian, null, 'untagged stays unknown, not false');
  assert.deepEqual(ps[2].cuisine, ['american', 'burger']);
  assert.equal(coarse(40.712776), 40.71);
  assert.match(buildQuery(40, -75, 2000, ['grocery']), /supermarket/);
});

test('quantities display in friendly units', () => {
  assert.equal(formatQty('eggs', 400), '8 eggs');
  assert.equal(formatQty('rice', 907), '2.0 lb');
  assert.equal(formatQty('rice', 907, 'kg'), '907 g');
  assert.equal(formatQty('olive-oil', 27), '2 tbsp');
});
