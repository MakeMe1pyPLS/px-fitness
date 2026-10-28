// Sample data for demos only. Every screen shows a "Sample data" banner while
// this is loaded, and loading it replaces nothing silently: the user confirms
// first, and "Clear sample data" returns the app to a fresh start.

import type { AppData, Checkin, Profile, Session, Skip } from './types';
import { generateTemplates } from './planner';
import { addDays, toDateKey, weekday } from './dates';
import { emptyData } from './store';
import { getExercise } from './exercises';

function rng(seed: number) {
  return () => {
    seed = (seed * 1664525 + 1013904223) % 4294967296;
    return seed / 4294967296;
  };
}

export function buildSampleData(today = toDateKey(new Date())): AppData {
  const r = rng(42);
  const start = addDays(today, -48);
  const profile: Profile = {
    name: 'Sample',
    goal: 'build_muscle',
    secondaryGoals: ['strength'],
    disciplines: ['bodybuilding'],
    primaryDiscipline: 'bodybuilding',
    goalHistory: [{ date: start, goal: 'build_muscle', discipline: 'bodybuilding' }],
    experience: 'intermediate',
    equipment: ['dumbbells', 'machines', 'barbell'],
    sessionMinutes: 50,
    trainingDays: [1, 3, 5], // Mon Wed Fri
    preferredTime: 'morning',
    unit: 'lb',
    checkinsEnabled: true,
    createdAt: new Date(start + 'T08:00:00').toISOString(),
  };
  const templates = generateTemplates(profile);
  const sessions: Session[] = [];
  const skips: Skip[] = [];
  const checkins: Checkin[] = [];
  let rotation = 0;
  const base: Record<string, number> = {};

  for (let d = start; d < today; d = addDays(d, 1)) {
    const wd = weekday(d);
    const energy = Math.max(1, Math.min(5, Math.round(1.5 + r() * 4)));
    const sleep = Math.round((5 + r() * 3.2) * 2) / 2;
    const minutes = r() < 0.3 ? 25 : 60;
    if (r() < 0.75) checkins.push({ date: d, energy, mood: Math.max(1, Math.min(5, energy + (r() < 0.5 ? 0 : 1))), sleepHours: sleep, availableMinutes: minutes, stress: Math.round(1 + r() * 4), updatedAt: new Date(d + 'T07:30:00').toISOString() });
    if (!profile.trainingDays.includes(wd)) {
      // An occasional unplanned Saturday session.
      if (wd === 6 && r() < 0.45) rotation = pushSession(d, 'midday');
      continue;
    }
    const lowDay = energy <= 2 || sleep < 6;
    const wednesdayDrag = wd === 3 && r() < 0.7;
    if (wednesdayDrag || (lowDay && r() < 0.7)) {
      if (r() < 0.8) skips.push({ id: 'k_' + d, date: d, reason: wednesdayDrag ? 'time' : 'energy', createdAt: new Date(d + 'T19:00:00').toISOString() });
      continue;
    }
    rotation = pushSession(d, r() < 0.7 ? 'evening' : 'morning', minutes < 50 && r() < 0.6);
  }

  function pushSession(d: string, block: 'morning' | 'midday' | 'evening', short = false): number {
    const t = templates[rotation % templates.length];
    const hour = block === 'morning' ? 7 : block === 'midday' ? 12 : 18;
    const startedAt = new Date(`${d}T${String(hour).padStart(2, '0')}:${String(Math.floor(r() * 50)).padStart(2, '0')}:00`);
    const list = short ? t.exercises.slice(0, 3).map((e) => ({ ...e, sets: 2 })) : t.exercises;
    const exercises = list.map((e) => {
      base[e.exerciseId] = (base[e.exerciseId] ?? 20 + Math.round(r() * 60)) + (r() < 0.4 ? 5 : 0);
      return {
        exerciseId: e.exerciseId,
        target: e.target,
        sets: Array.from({ length: e.sets }, () => {
          const m = getExercise(e.exerciseId)?.metric;
          if (m === 'time') return { seconds: 30 + Math.floor(r() * 20), done: true };
          if (m === 'reps') return { reps: 8 + Math.floor(r() * 6), done: true };
          return { weight: base[e.exerciseId], reps: 8 + Math.floor(r() * 4), done: true };
        }),
      };
    });
    const mins = short ? 22 : 45 + Math.floor(r() * 15);
    sessions.push({ id: 'sample_' + d, templateId: t.id, name: short ? `${t.name} · Short` : t.name, variant: short ? 'short' : 'full', plannedFor: d, startedAt: startedAt.toISOString(), endedAt: new Date(startedAt.getTime() + mins * 60000).toISOString(), status: 'completed', exercises, effort: (2 + Math.floor(r() * 3)) as 2 | 3 | 4 });
    return rotation + 1;
  }

  const nutrition = { ...emptyData().nutrition,
    prefs: { pattern: 'omnivore' as const, allergies: [], dislikes: [], cuisines: ['Mexican-inspired'], cookingSkill: 'basic' as const, kitchen: ['stove' as const, 'oven' as const, 'microwave' as const], maxPrepMinutes: 45, people: 1, mealsPerDay: 3, showNumbers: true, updatedAt: new Date().toISOString() },
    budget: { amount: 70, period: 'week' as const, scope: 'combined' as const, eatingOutShare: 0.2, currency: 'USD' as const },
    spending: [{ id: 'sp_s1', date: addDays(today, -1), amount: 38.4, kind: 'grocery' as const, note: 'Sample' }],
    saved: ['beef-bean-chili'], ratings: { 'beef-bean-chili': 5 } };
  return { ...emptyData(), profile, templates, rotationIndex: rotation, sessions, skips, checkins, nutrition, settings: { ...emptyData().settings, sampleData: true } };
}
