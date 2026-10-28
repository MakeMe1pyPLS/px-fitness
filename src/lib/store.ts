// Local-first store. All app state lives in one versioned document that is
// written to localStorage after every change, so an in-progress workout
// survives a refresh, a closed tab or a dead battery.
//
// The store is the only module that touches persistence. Moving to a backend
// (Supabase) means replacing load()/persist() with a sync adapter; screens
// don't change.

import type { AppData, Budget, Checkin, GroceryItem, InsightRuleId, MealFeedback, MealLogEntry, MealPlan, NutritionData, NutritionPrefs, PlanItem, Profile, SavedPlace, Spend, RecommendationRecord, Session, SetEntry, Settings, SkipReason, Template } from './types';
import { migrateGoal } from './goals';
import { emptyCoach } from './coach';
import type { CoachClient, CoachData, CoachSession, Inquiry, Milestone, Payment } from './types';
import { groceryFromPlan } from './nutrition';
import { generateTemplates, createSession, nextTemplate, activeSession } from './planner';
import { addDays, toDateKey, uid } from './dates';
import type { Insight } from './insights';
import { planWindow } from './stats';

export const STORAGE_KEY = 'kova:data'; // kept from the Kova prototype so existing data carries over
export const SCHEMA_VERSION = 3;

const defaultSettings: Settings = { disabledRules: [], reducedMotion: 'system', sampleData: false, suggestShortWhenLow: false };

export function emptyNutrition(): NutritionData {
  return { prefs: null, budget: null, prices: {}, plans: [], grocery: [], log: [], feedback: [], saved: [], ratings: {}, spending: [], location: null, places: [] };
}

export function emptyData(): AppData {
  return { version: SCHEMA_VERSION, profile: null, templates: [], rotationIndex: 0, customExercises: [], sessions: [], skips: [], checkins: [], recommendations: [], settings: { ...defaultSettings }, nutrition: emptyNutrition(), coach: emptyCoach(), milestones: [], checkinMemory: [] };
}

/** Fill fields added after v1 so older profiles keep working. */
export function migrateProfile(p: Profile | null | undefined): Profile | null {
  if (!p) return null;
  const goal = migrateGoal(p.goal as string);
  return {
    ...p,
    goal,
    secondaryGoals: (p.secondaryGoals ?? []).map((g) => migrateGoal(g as string)),
    disciplines: p.disciplines ?? [],
    primaryDiscipline: p.primaryDiscipline ?? null,
    goalHistory: p.goalHistory ?? [{ date: p.createdAt?.slice(0, 10) ?? '', goal, discipline: p.primaryDiscipline ?? null }],
  };
}

export interface StorageLike { getItem(k: string): string | null; setItem(k: string, v: string): void; removeItem(k: string): void }

function defaultStorage(): StorageLike | null {
  try {
    const s = globalThis.localStorage;
    const probe = '__kova_probe__';
    s.setItem(probe, '1');
    s.removeItem(probe);
    return s;
  } catch {
    return null; // private mode / sandboxed frame: fall back to memory
  }
}

/** Upgrade older documents in place. Add a case per schema bump. */
export function migrate(raw: unknown): AppData {
  if (!raw || typeof raw !== 'object') return emptyData();
  const d = raw as Partial<AppData>;
  const base = emptyData();
  return {
    ...base,
    ...d,
    version: SCHEMA_VERSION,
    profile: migrateProfile(d.profile),
    nutrition: { ...base.nutrition, ...(d.nutrition ?? {}) },
    coach: { ...base.coach, ...(d.coach ?? {}), profile: { ...base.coach.profile, ...(d.coach?.profile ?? {}) }, links: { ...base.coach.links, ...(d.coach?.links ?? {}) }, hours: { ...base.coach.hours, ...(d.coach?.hours ?? {}) } },
    milestones: Array.isArray(d.milestones) ? d.milestones : [],
    checkinMemory: Array.isArray(d.checkinMemory) ? d.checkinMemory : [],
    settings: { ...base.settings, ...(d.settings ?? {}) },
    sessions: Array.isArray(d.sessions) ? d.sessions : [],
    skips: Array.isArray(d.skips) ? d.skips : [],
    checkins: Array.isArray(d.checkins) ? d.checkins : [],
    recommendations: Array.isArray(d.recommendations) ? d.recommendations : [],
    templates: Array.isArray(d.templates) ? d.templates : [],
    customExercises: Array.isArray(d.customExercises) ? d.customExercises : [],
  };
}

type Listener = () => void;

export class Store {
  private data: AppData;
  private listeners = new Set<Listener>();
  readonly persistent: boolean;
  lastError: string | null = null;

  constructor(private storage: StorageLike | null = defaultStorage()) {
    this.persistent = !!storage;
    let loaded = emptyData();
    if (storage) {
      try {
        const raw = storage.getItem(STORAGE_KEY);
        if (raw) loaded = migrate(JSON.parse(raw));
      } catch {
        this.lastError = 'Saved data could not be read. Starting fresh; the old copy was kept under a backup key.';
        try { storage.setItem(STORAGE_KEY + ':corrupt-backup', storage.getItem(STORAGE_KEY) ?? ''); } catch { /* ignore */ }
      }
    }
    this.data = loaded;
  }

  get = (): AppData => this.data;

  subscribe = (fn: Listener) => {
    this.listeners.add(fn);
    return () => this.listeners.delete(fn);
  };

  private commit(next: AppData) {
    this.data = next;
    if (this.storage) {
      try {
        this.storage.setItem(STORAGE_KEY, JSON.stringify(next));
        this.lastError = null;
      } catch {
        this.lastError = 'Couldn’t save to this device. Your latest changes may be lost if you close the app.';
      }
    }
    this.listeners.forEach((l) => l());
  }

  private update(fn: (d: AppData) => AppData) {
    this.commit(fn(this.data));
  }

  // ── Onboarding & profile ───────────────────────────────────────────────
  completeOnboarding(profile: Profile) {
    this.update((d) => ({ ...d, profile, templates: generateTemplates(profile), rotationIndex: 0 }));
  }

  updateProfile(patch: Partial<Profile>, regenerate: boolean) {
    this.update((d) => {
      if (!d.profile) return d;
      let profile = { ...d.profile, ...patch };
      if (profile.goal !== d.profile.goal || profile.primaryDiscipline !== d.profile.primaryDiscipline) {
        profile = { ...profile, goalHistory: [...profile.goalHistory, { date: toDateKey(new Date()), goal: profile.goal, discipline: profile.primaryDiscipline }] };
      }
      return { ...d, profile, templates: regenerate ? generateTemplates(profile) : d.templates };
    });
  }

  updateTemplate(t: Template) {
    this.update((d) => ({ ...d, templates: d.templates.map((x) => (x.id === t.id ? t : x)) }));
  }

  // ── Sessions ───────────────────────────────────────────────────────────
  startSession(variant: 'full' | 'short', templateId?: string): Session | null {
    const existing = activeSession(this.data);
    if (existing) return existing;
    const t = templateId ? this.data.templates.find((x) => x.id === templateId) : nextTemplate(this.data);
    if (!t) return null;
    const s = createSession(t, variant);
    this.update((d) => ({ ...d, sessions: [...d.sessions, s] }));
    return s;
  }

  private patchSession(id: string, fn: (s: Session) => Session) {
    this.update((d) => ({ ...d, sessions: d.sessions.map((s) => (s.id === id ? fn(s) : s)) }));
  }

  updateSet(sessionId: string, exIdx: number, setIdx: number, patch: Partial<SetEntry>) {
    this.patchSession(sessionId, (s) => ({
      ...s,
      exercises: s.exercises.map((e, i) => (i !== exIdx ? e : { ...e, sets: e.sets.map((x, j) => (j === setIdx ? { ...x, ...patch } : x)) })),
    }));
  }

  addSet(sessionId: string, exIdx: number) {
    this.patchSession(sessionId, (s) => ({
      ...s,
      exercises: s.exercises.map((e, i) => {
        if (i !== exIdx) return e;
        const last = e.sets[e.sets.length - 1];
        return { ...e, sets: [...e.sets, { weight: last?.weight, reps: last?.reps, seconds: last?.seconds, done: false }] };
      }),
    }));
  }

  removeSet(sessionId: string, exIdx: number, setIdx: number) {
    this.patchSession(sessionId, (s) => ({
      ...s,
      exercises: s.exercises.map((e, i) => (i !== exIdx || e.sets.length <= 1 ? e : { ...e, sets: e.sets.filter((_, j) => j !== setIdx) })),
    }));
  }

  swapExercise(sessionId: string, exIdx: number, newId: string) {
    this.patchSession(sessionId, (s) => ({
      ...s,
      exercises: s.exercises.map((e, i) => (i !== exIdx ? e : { ...e, exerciseId: newId, swappedFrom: e.swappedFrom ?? e.exerciseId, sets: e.sets.map(() => ({ done: false })) })),
    }));
  }

  addExercise(sessionId: string, exerciseId: string) {
    this.patchSession(sessionId, (s) => ({ ...s, exercises: [...s.exercises, { exerciseId, target: '8–12 reps', sets: [{ done: false }, { done: false }] }] }));
  }

  removeExercise(sessionId: string, exIdx: number) {
    this.patchSession(sessionId, (s) => ({ ...s, exercises: s.exercises.filter((_, i) => i !== exIdx) }));
  }

  finishSession(sessionId: string, effort?: Session['effort'], note?: string) {
    this.update((d) => ({
      ...d,
      rotationIndex: d.rotationIndex + 1,
      // Finishing a session resolves any skip logged for the same day.
      skips: d.skips.filter((k) => k.date !== d.sessions.find((s) => s.id === sessionId)?.plannedFor),
      sessions: d.sessions.map((s) => (s.id === sessionId ? { ...s, status: 'completed', endedAt: new Date().toISOString(), effort, note: note?.trim() || undefined } : s)),
    }));
  }

  /** Ending early: keeps logged sets as an abandoned session; deletes if nothing was logged. */
  endSessionEarly(sessionId: string) {
    this.update((d) => {
      const s = d.sessions.find((x) => x.id === sessionId);
      if (!s) return d;
      const any = s.exercises.some((e) => e.sets.some((x) => x.done));
      return { ...d, sessions: any ? d.sessions.map((x) => (x.id === sessionId ? { ...x, status: 'abandoned', endedAt: new Date().toISOString() } : x)) : d.sessions.filter((x) => x.id !== sessionId) };
    });
  }

  deleteSession(sessionId: string) {
    this.update((d) => ({ ...d, sessions: d.sessions.filter((s) => s.id !== sessionId) }));
  }

  editCompletedSet(sessionId: string, exIdx: number, setIdx: number, patch: Partial<SetEntry>) {
    this.updateSet(sessionId, exIdx, setIdx, patch);
  }

  // ── Skips ──────────────────────────────────────────────────────────────
  logSkip(date: string, reason: SkipReason, note?: string) {
    this.update((d) => ({ ...d, skips: [...d.skips.filter((s) => s.date !== date), { id: uid('k_'), date, reason, note: note?.trim() || undefined, createdAt: new Date().toISOString() }] }));
  }

  removeSkip(date: string) {
    this.update((d) => ({ ...d, skips: d.skips.filter((s) => s.date !== date) }));
  }

  // ── Check-ins ──────────────────────────────────────────────────────────
  saveCheckin(date: string, patch: Partial<Omit<Checkin, 'date' | 'updatedAt'>>) {
    this.update((d) => {
      const prev = d.checkins.find((c) => c.date === date);
      const next: Checkin = { ...(prev ?? {}), ...patch, date, updatedAt: new Date().toISOString() };
      // Drop fields explicitly cleared.
      (Object.keys(next) as (keyof Checkin)[]).forEach((k) => next[k] === undefined && delete next[k]);
      return { ...d, checkins: [...d.checkins.filter((c) => c.date !== date), next].sort((a, b) => a.date.localeCompare(b.date)) };
    });
  }

  deleteCheckin(date: string) {
    this.update((d) => ({ ...d, checkins: d.checkins.filter((c) => c.date !== date) }));
  }

  // ── Recommendations ───────────────────────────────────────────────────
  decide(insight: Insight, status: RecommendationRecord['status']) {
    const today = toDateKey(new Date());
    const baseline = planWindow(this.data, addDays(today, -14), addDays(today, -1)).rate ?? undefined;
    const rec: RecommendationRecord = { id: uid('r_'), ruleId: insight.id, createdAt: new Date().toISOString(), status, summary: status === 'accepted' ? insight.action.label : insight.title, baselineRate: baseline };
    this.update((d) => {
      let next: AppData = { ...d, recommendations: [...d.recommendations, rec] };
      if (status === 'accepted' && next.profile) {
        const a = insight.action;
        if (a.kind === 'move_day') {
          const days = next.profile.trainingDays.filter((x) => x !== a.from).concat(a.to).sort();
          next = { ...next, profile: { ...next.profile, trainingDays: days } };
        } else if (a.kind === 'set_time') {
          next = { ...next, profile: { ...next.profile, preferredTime: a.time } };
        } else if (a.kind === 'set_session_minutes') {
          const profile = { ...next.profile, sessionMinutes: a.minutes };
          next = { ...next, profile, templates: generateTemplates(profile) };
        } else if (a.kind === 'reduce_sets') {
          next = { ...next, templates: next.templates.map((t) => ({ ...t, exercises: t.exercises.map((e) => ({ ...e, sets: Math.max(1, e.sets - 1) })) })) };
        } else if (a.kind === 'suggest_short_when_low') {
          next = { ...next, settings: { ...next.settings, suggestShortWhenLow: true } };
        }
      }
      return next;
    });
  }


  // ── Nutrition ──────────────────────────────────────────────────────────
  private nut(fn: (n: NutritionData, d: AppData) => Partial<NutritionData>) {
    this.update((d) => ({ ...d, nutrition: { ...d.nutrition, ...fn(d.nutrition, d) } }));
  }

  setPrefs(patch: Partial<NutritionPrefs>) {
    this.nut((n) => ({ prefs: { ...(n.prefs ?? { pattern: 'omnivore', allergies: [], dislikes: [], cuisines: [], cookingSkill: 'basic', kitchen: ['stove', 'microwave'], maxPrepMinutes: 45, people: 1, mealsPerDay: 3, showNumbers: true }), ...patch, updatedAt: new Date().toISOString() } }));
  }

  setBudget(b: Budget | null) { this.nut(() => ({ budget: b })); }

  setPrice(id: string, price: number | null, pkgGrams?: number) {
    this.nut((n) => {
      const prices = { ...n.prices };
      if (price === null || !(price >= 0)) delete prices[id];
      else prices[id] = { price, pkgGrams: pkgGrams ?? prices[id]?.pkgGrams ?? 0, updatedAt: new Date().toISOString() };
      return { prices };
    });
  }

  savePlan(plan: MealPlan) {
    this.nut((n, d) => {
      const plans = [...n.plans.map((p) => (p.status === 'active' ? { ...p, status: 'archived' as const } : p)), plan];
      const next = { ...d, nutrition: { ...n, plans } };
      return { plans, grocery: groceryFromPlan(next, plan, n.grocery.filter((g) => g.manual)), groceryPlanId: plan.id };
    });
  }

  private patchPlan(planId: string, fn: (p: MealPlan) => MealPlan, regroceries = true) {
    this.nut((n, d) => {
      const plans = n.plans.map((p) => (p.id === planId ? fn(p) : p));
      const plan = plans.find((p) => p.id === planId)!;
      if (!regroceries || n.groceryPlanId !== planId) return { plans };
      const next = { ...d, nutrition: { ...n, plans } };
      return { plans, grocery: groceryFromPlan(next, plan, n.grocery) };
    });
  }

  updatePlanItem(planId: string, idx: number, patch: Partial<PlanItem>) {
    this.patchPlan(planId, (p) => ({ ...p, items: p.items.map((it, i) => (i === idx ? { ...it, ...patch } : it)) }));
  }

  removePlanItem(planId: string, idx: number) {
    this.patchPlan(planId, (p) => ({ ...p, items: p.items.filter((_, i) => i !== idx) }));
  }

  setPlanPrepped(planId: string, prepped: boolean) {
    this.patchPlan(planId, (p) => ({ ...p, prepped }), false);
  }

  archivePlan(planId: string) {
    this.patchPlan(planId, (p) => ({ ...p, status: 'archived' }), false);
  }

  eatFromPlan(planId: string, recipeId: string, name: string) {
    this.patchPlan(planId, (p) => ({ ...p, eaten: { ...p.eaten, [recipeId]: (p.eaten[recipeId] ?? 0) + 1 } }), false);
    this.logMeal({ recipeId, name, where: 'home', date: toDateKey(new Date()) });
  }

  regenerateGrocery() {
    this.nut((n, d) => {
      const plan = n.plans.find((p) => p.status === 'active');
      if (!plan) return {};
      return { grocery: groceryFromPlan(d, plan, n.grocery), groceryPlanId: plan.id };
    });
  }

  toggleGrocery(id: string) { this.nut((n) => ({ grocery: n.grocery.map((g) => (g.id === id ? { ...g, checked: !g.checked } : g)) })); }
  addGrocery(name: string, note?: string, ingredientId?: string, grams?: number, category = 'Added by you') {
    const item: GroceryItem = { id: uid('g_'), name: name.trim(), note: note?.trim() || undefined, category, checked: false, manual: true, ingredientId, grams };
    if (!item.name) return;
    this.nut((n) => {
      // Merge with an existing manual entry for the same ingredient.
      const same = ingredientId ? n.grocery.find((g) => g.manual && g.ingredientId === ingredientId && !g.checked) : undefined;
      if (same) return { grocery: n.grocery.map((g) => (g === same ? { ...g, grams: (g.grams ?? 0) + (grams ?? 0), note: [g.note, note].filter(Boolean).join('; ') } : g)) };
      return { grocery: [...n.grocery, item] };
    });
  }
  removeGrocery(id: string) { this.nut((n) => ({ grocery: n.grocery.filter((g) => g.id !== id) })); }
  clearCheckedGrocery() { this.nut((n) => ({ grocery: n.grocery.filter((g) => !g.checked) })); }

  logMeal(e: Omit<MealLogEntry, 'id' | 'createdAt'>) {
    this.nut((n) => ({ log: [...n.log, { ...e, id: uid('ml_'), createdAt: new Date().toISOString() }] }));
  }
  updateMealLog(id: string, patch: Partial<MealLogEntry>) { this.nut((n) => ({ log: n.log.map((l) => (l.id === id ? { ...l, ...patch } : l)) })); }
  removeMealLog(id: string) { this.nut((n) => ({ log: n.log.filter((l) => l.id !== id) })); }

  rateRecipe(recipeId: string, rating: number | null) {
    this.nut((n) => { const r = { ...n.ratings }; if (rating) r[recipeId] = rating; else delete r[recipeId]; return { ratings: r }; });
  }
  toggleSaved(recipeId: string) {
    this.nut((n) => ({ saved: n.saved.includes(recipeId) ? n.saved.filter((x) => x !== recipeId) : [...n.saved, recipeId] }));
  }
  mealFeedback(recipeId: string, kind: MealFeedback['kind']) {
    this.nut((n) => ({ feedback: [...n.feedback, { recipeId, kind, at: new Date().toISOString() }].slice(-300) }));
  }

  addSpend(s: Omit<Spend, 'id'>) { this.nut((n) => ({ spending: [...n.spending, { ...s, id: uid('sp_') }] })); }
  removeSpend(id: string) { this.nut((n) => ({ spending: n.spending.filter((x) => x.id !== id) })); }

  setLocation(loc: NutritionData['location']) { this.nut(() => ({ location: loc })); }
  togglePlace(p: Omit<SavedPlace, 'savedAt'>) {
    this.nut((n) => ({ places: n.places.some((x) => x.id === p.id) ? n.places.filter((x) => x.id !== p.id) : [...n.places, { ...p, savedAt: new Date().toISOString() }] }));
  }

  clearFoodHistory() { this.nut(() => ({ log: [], feedback: [], ratings: {}, spending: [] })); }
  resetNutrition() { this.update((d) => ({ ...d, nutrition: emptyNutrition() })); }


  // ── Check-in memory (what the user told the bot) ──────────────────────
  remember(date: string, text: string) {
    const t = text.trim().slice(0, 200);
    if (!t) return;
    this.update((d) => ({ ...d, checkinMemory: [...d.checkinMemory, { date, text: t }].slice(-30) }));
  }
  forgetMemory(index: number) { this.update((d) => ({ ...d, checkinMemory: d.checkinMemory.filter((_, i) => i !== index) })); }
  clearMemory() { this.update((d) => ({ ...d, checkinMemory: [] })); }

  // ── Milestones ─────────────────────────────────────────────────────────
  addMilestone(m: Omit<Milestone, 'id'>) { this.update((d) => ({ ...d, milestones: [...d.milestones, { ...m, id: uid('ms_') }] })); }
  removeMilestone(id: string) { this.update((d) => ({ ...d, milestones: d.milestones.filter((x) => x.id !== id) })); }

  // ── Coaching ───────────────────────────────────────────────────────────
  private co(fn: (c: CoachData) => Partial<CoachData>) { this.update((d) => ({ ...d, coach: { ...d.coach, ...fn(d.coach) } })); }
  setCoach(patch: Partial<CoachData>) { this.co(() => patch); }
  requestCoaching(i: Omit<Inquiry, 'id' | 'createdAt' | 'status' | 'source'>) {
    this.co((c) => ({ inquiries: [...c.inquiries, { ...i, id: uid('iq_'), createdAt: new Date().toISOString(), status: 'new', source: 'app' }] }));
  }
  addInquiry(i: Omit<Inquiry, 'id' | 'createdAt' | 'status' | 'source'>) {
    this.co((c) => ({ inquiries: [...c.inquiries, { ...i, id: uid('iq_'), createdAt: new Date().toISOString(), status: 'new', source: 'manual' }] }));
  }
  setInquiry(id: string, status: Inquiry['status']) { this.co((c) => ({ inquiries: c.inquiries.map((x) => (x.id === id ? { ...x, status } : x)) })); }
  convertInquiry(id: string) {
    this.co((c) => {
      const q = c.inquiries.find((x) => x.id === id);
      if (!q) return {};
      const client: CoachClient = { id: uid('cl_'), name: q.name, contact: q.contact, goal: '', tierId: q.tierId, status: 'active', notes: [q.preferred && `Prefers: ${q.preferred}`, q.message].filter(Boolean).join('\n'), week: {}, createdAt: new Date().toISOString() };
      return { clients: [...c.clients, client], inquiries: c.inquiries.map((x) => (x.id === id ? { ...x, status: 'converted' } : x)) };
    });
  }
  saveClient(cl: Omit<CoachClient, 'id' | 'createdAt'> & { id?: string }) {
    this.co((c) => cl.id && c.clients.some((x) => x.id === cl.id)
      ? { clients: c.clients.map((x) => (x.id === cl.id ? { ...x, ...cl, id: x.id } : x)) }
      : { clients: [...c.clients, { ...cl, id: uid('cl_'), createdAt: new Date().toISOString() } as CoachClient] });
  }
  removeClient(id: string) { this.co((c) => ({ clients: c.clients.filter((x) => x.id !== id) })); }
  saveSession(s: Omit<CoachSession, 'id'> & { id?: string }) {
    this.co((c) => s.id && c.sessions.some((x) => x.id === s.id)
      ? { sessions: c.sessions.map((x) => (x.id === s.id ? { ...x, ...s, id: x.id } : x)) }
      : { sessions: [...c.sessions, { ...s, id: uid('cs_') } as CoachSession] });
  }
  removeSession(id: string) { this.co((c) => ({ sessions: c.sessions.filter((x) => x.id !== id) })); }
  savePayment(p: Omit<Payment, 'id'> & { id?: string }) {
    this.co((c) => p.id && c.payments.some((x) => x.id === p.id)
      ? { payments: c.payments.map((x) => (x.id === p.id ? { ...x, ...p, id: x.id } : x)) }
      : { payments: [...c.payments, { ...p, id: uid('pm_') } as Payment] });
  }
  removePayment(id: string) { this.co((c) => ({ payments: c.payments.filter((x) => x.id !== id) })); }
  resetBusiness() { this.co(() => ({ clients: [], sessions: [], inquiries: [], payments: [] })); }

  // ── Settings & data control ───────────────────────────────────────────
  setSettings(patch: Partial<Settings>) {
    this.update((d) => ({ ...d, settings: { ...d.settings, ...patch } }));
  }

  toggleRule(id: InsightRuleId, enabled: boolean) {
    this.update((d) => ({ ...d, settings: { ...d.settings, disabledRules: enabled ? d.settings.disabledRules.filter((x) => x !== id) : [...new Set([...d.settings.disabledRules, id])] } }));
  }

  clearInsightHistory() {
    this.update((d) => ({ ...d, recommendations: [] }));
  }

  clearCheckins() {
    this.update((d) => ({ ...d, checkins: [] }));
  }

  replaceAll(data: AppData) {
    this.commit(migrate(data));
  }

  resetAll() {
    if (this.storage) {
      try { this.storage.removeItem(STORAGE_KEY); } catch { /* ignore */ }
    }
    this.commit(emptyData());
  }

  exportJSON(): string {
    return JSON.stringify(this.data, null, 2);
  }
}
