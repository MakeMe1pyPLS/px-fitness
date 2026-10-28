import { test } from 'node:test';
import assert from 'node:assert/strict';
import { Store, STORAGE_KEY, type StorageLike } from '../src/lib/store';
import { generateTemplates, estimateMinutes, shortVersion } from '../src/lib/planner';
import { getExercise, isAvailable, availableSubstitutes } from '../src/lib/exercises';
import { computeInsights, insightReadiness, MIN_GROUP } from '../src/lib/insights';
import { dayOutcome, planWindow, estimate1RM, newRecordsIn, exerciseBests } from '../src/lib/stats';
import { buildSampleData } from '../src/lib/sample';
import { addDays, toDateKey, weekday } from '../src/lib/dates';
import type { AppData, Profile } from '../src/lib/types';

class MemStorage implements StorageLike {
  m = new Map<string, string>();
  getItem(k: string) { return this.m.get(k) ?? null; }
  setItem(k: string, v: string) { this.m.set(k, v); }
  removeItem(k: string) { this.m.delete(k); }
}

const today = toDateKey(new Date());

function profile(over: Partial<Profile> = {}): Profile {
  return { name: 'T', goal: 'general', secondaryGoals: [], disciplines: [], primaryDiscipline: null, goalHistory: [], experience: 'beginner', equipment: ['dumbbells'], sessionMinutes: 30, trainingDays: [1, 3, 5], preferredTime: 'evening', unit: 'lb', checkinsEnabled: true, createdAt: new Date(addDays(today, -60) + 'T00:00:00').toISOString(), ...over };
}

test('templates respect equipment and time budget', () => {
  for (const minutes of [20, 30, 45, 60]) {
    for (const equipment of [[], ['dumbbells'], ['barbell', 'machines']] as Profile['equipment'][]) {
      const p = profile({ sessionMinutes: minutes, equipment });
      const ts = generateTemplates(p);
      assert.ok(ts.length >= 2);
      for (const t of ts) {
        assert.ok(t.exercises.length >= 3, 'at least three exercises');
        for (const e of t.exercises) assert.ok(isAvailable(getExercise(e.exerciseId)!, equipment), `${e.exerciseId} needs equipment the user lacks`);
        // Floor is 3 exercises; above that, it must fit.
        if (t.exercises.length > 3) assert.ok(estimateMinutes(t) <= minutes, `${t.name} ${estimateMinutes(t)}min > ${minutes}`);
      }
    }
  }
});

test('4+ training days produce an upper/lower split', () => {
  const ts = generateTemplates(profile({ trainingDays: [1, 2, 4, 5] }));
  assert.equal(ts.length, 4);
  assert.match(ts[0].name, /Lower/);
});

test('short version is three exercises, max two sets', () => {
  const t = generateTemplates(profile({ experience: 'advanced', sessionMinutes: 60 }))[0];
  const s = shortVersion(t);
  assert.equal(s.length, 3);
  assert.ok(s.every((e) => e.sets <= 2));
});

test('substitutes only include available equipment', () => {
  const subs = availableSubstitutes('back-squat', ['dumbbells']);
  assert.ok(subs.length > 0);
  assert.ok(subs.every((e) => isAvailable(e, ['dumbbells'])));
});

test('in-progress workout survives a reload', () => {
  const storage = new MemStorage();
  const a = new Store(storage);
  a.completeOnboarding(profile());
  const s = a.startSession('full')!;
  a.updateSet(s.id, 0, 0, { weight: 40, reps: 10, done: true });
  const b = new Store(storage); // simulate a new page load
  const resumed = b.get().sessions.find((x) => x.status === 'in_progress');
  assert.ok(resumed);
  assert.deepEqual(resumed!.exercises[0].sets[0], { weight: 40, reps: 10, done: true });
  // starting again resumes instead of creating a duplicate
  assert.equal(b.startSession('full')!.id, s.id);
});

test('ending early with nothing logged discards; with sets keeps as abandoned', () => {
  const st = new Store(new MemStorage());
  st.completeOnboarding(profile());
  const s1 = st.startSession('full')!;
  st.endSessionEarly(s1.id);
  assert.equal(st.get().sessions.length, 0);
  const s2 = st.startSession('full')!;
  st.updateSet(s2.id, 0, 0, { reps: 5, done: true });
  st.endSessionEarly(s2.id);
  assert.equal(st.get().sessions[0].status, 'abandoned');
});

test('finishing advances rotation and clears same-day skip', () => {
  const st = new Store(new MemStorage());
  st.completeOnboarding(profile());
  st.logSkip(today, 'time');
  const s = st.startSession('short')!;
  st.finishSession(s.id, 3);
  assert.equal(st.get().rotationIndex, 1);
  assert.equal(st.get().skips.length, 0);
  assert.equal(st.get().sessions[0].status, 'completed');
});

test('corrupt storage does not crash and keeps a backup', () => {
  const storage = new MemStorage();
  storage.setItem(STORAGE_KEY, '{not json');
  const st = new Store(storage);
  assert.equal(st.get().profile, null);
  assert.ok(st.lastError);
  assert.equal(storage.getItem(STORAGE_KEY + ':corrupt-backup'), '{not json');
});

test('no storage available falls back to memory', () => {
  const st = new Store(null);
  assert.equal(st.persistent, false);
  st.completeOnboarding(profile());
  assert.ok(st.get().profile);
});

test('days before the profile existed are never "missed"', () => {
  const st = new Store(new MemStorage());
  st.completeOnboarding(profile({ createdAt: new Date().toISOString(), trainingDays: [0, 1, 2, 3, 4, 5, 6] }));
  assert.equal(dayOutcome(st.get(), addDays(today, -3)), 'before');
  assert.equal(dayOutcome(st.get(), today), 'pending');
});

test('check-in upsert keeps one record per day and allows partial fields', () => {
  const st = new Store(new MemStorage());
  st.completeOnboarding(profile());
  st.saveCheckin(today, { energy: 2 });
  st.saveCheckin(today, { mood: 4 });
  assert.equal(st.get().checkins.length, 1);
  assert.equal(st.get().checkins[0].energy, 2);
  assert.equal(st.get().checkins[0].mood, 4);
  st.saveCheckin(today, { energy: undefined });
  assert.equal(st.get().checkins[0].energy, undefined);
});

// Build N weeks of planned Mon/Wed/Fri with a controlled pattern.
function scenario(fn: (date: string, i: number) => { trained: boolean; energy?: number; sleep?: number; minutes?: number; skip?: 'time' | 'energy' }) {
  const st = new Store(new MemStorage());
  const p = profile({ createdAt: new Date(addDays(today, -56) + 'T00:00:00').toISOString() });
  st.completeOnboarding(p);
  let i = 0;
  for (let d = addDays(today, -55); d < today; d = addDays(d, 1)) {
    if (!p.trainingDays.includes(weekday(d))) continue;
    const r = fn(d, i++);
    if (r.energy || r.sleep || r.minutes) st.saveCheckin(d, { energy: r.energy, sleepHours: r.sleep, availableMinutes: r.minutes });
    if (r.trained) {
      const s = st.startSession('full')!;
      st.replaceAll({ ...st.get(), sessions: st.get().sessions.map((x) => (x.id === s.id ? { ...x, plannedFor: d, startedAt: new Date(d + 'T18:00:00').toISOString() } : x)) });
      st.finishSession(s.id, 3);
    } else if (r.skip) st.logSkip(d, r.skip);
  }
  return st;
}

test('insights stay silent with too little data', () => {
  const st = new Store(new MemStorage());
  st.completeOnboarding(profile({ createdAt: new Date(addDays(today, -6) + 'T00:00:00').toISOString() }));
  st.saveCheckin(addDays(today, -1), { energy: 1 });
  assert.deepEqual(computeInsights(st.get()), []);
  const r = insightReadiness(st.get());
  assert.ok(r.plannedDays < r.plannedTarget);
});

test('energy insight appears only with enough data in both groups', () => {
  // Alternate: low energy → skipped, high energy → trained.
  const st = scenario((_, i) => (i % 2 ? { trained: true, energy: 5 } : { trained: false, energy: 1 }));
  const ins = computeInsights(st.get()).find((x) => x.id === 'energy_training');
  assert.ok(ins, 'energy insight expected');
  assert.ok(ins!.evidence.every((e) => e.total >= MIN_GROUP));
  assert.match(ins!.caveat, /not that one causes/);
  // Same pattern but only 2 low days → silent
  const thin = scenario((_, i) => (i < 2 ? { trained: false, energy: 1 } : { trained: true, energy: 5 }));
  assert.equal(computeInsights(thin.get()).find((x) => x.id === 'energy_training'), undefined);
});

test('no energy insight when there is no real difference', () => {
  const st = scenario((_, i) => ({ trained: i % 3 !== 0, energy: i % 2 ? 5 : 1 }));
  const ins = computeInsights(st.get()).find((x) => x.id === 'energy_training');
  // trained rate is ~2/3 in both groups → no insight
  assert.equal(ins, undefined);
});

test('weekday insight suggests moving a consistently missed day, and accepting applies it', () => {
  const st = scenario((d) => ({ trained: weekday(d) !== 3 }));
  const ins = computeInsights(st.get()).find((x) => x.id === 'weekday_adherence');
  assert.ok(ins);
  assert.equal(ins!.action.kind, 'move_day');
  st.decide(ins!, 'accepted');
  assert.ok(!st.get().profile!.trainingDays.includes(3));
  assert.equal(st.get().profile!.trainingDays.length, 3);
  // Accepted rules go quiet instead of repeating immediately.
  assert.equal(computeInsights(st.get()).find((x) => x.id === 'weekday_adherence'), undefined);
});

test('dismissed rules go quiet; disabled rules never run', () => {
  const st = scenario((_, i) => (i % 2 ? { trained: true, energy: 5 } : { trained: false, energy: 1 }));
  const ins = computeInsights(st.get()).find((x) => x.id === 'energy_training')!;
  st.decide(ins, 'dismissed');
  assert.equal(computeInsights(st.get()).find((x) => x.id === 'energy_training'), undefined);
  st.clearInsightHistory();
  st.toggleRule('energy_training', false);
  assert.equal(computeInsights(st.get()).find((x) => x.id === 'energy_training'), undefined);
});

test('skip-reason insight needs a majority reason', () => {
  const st = scenario((_, i) => (i < 6 && i % 2 === 0 ? { trained: false, skip: 'time' } : { trained: true }));
  // skips are older than 30 days in this scenario except the recent ones; build recent instead
  const st2 = new Store(new MemStorage());
  st2.completeOnboarding(profile());
  for (let k = 1; k <= 4; k++) st2.logSkip(addDays(today, -k * 2), k === 4 ? 'energy' : 'time');
  const ins = computeInsights(st2.get()).find((x) => x.id === 'skip_reason');
  assert.ok(ins);
  assert.match(ins!.observation, /3 of your 4/);
  assert.ok(st); // first scenario just shouldn't throw
});

test('plan window counts done vs planned, ignoring rest days', () => {
  const st = scenario((_, i) => ({ trained: i % 2 === 0 }));
  const w = planWindow(st.get(), addDays(today, -55), addDays(today, -1));
  assert.ok(w.planned > 10);
  assert.ok(Math.abs((w.rate ?? 0) - 0.5) < 0.1);
});

test('records: first session is a baseline, not a PR', () => {
  const st = new Store(new MemStorage());
  st.completeOnboarding(profile());
  const s = st.startSession('full')!;
  const exIdx = s.exercises.findIndex((e) => getExercise(e.exerciseId)!.metric === 'weight_reps');
  st.updateSet(s.id, exIdx, 0, { weight: 30, reps: 10, done: true });
  st.finishSession(s.id);
  assert.deepEqual(newRecordsIn(st.get(), st.get().sessions[0]), []);
  const s2 = st.startSession('full', st.get().templates[0].id)!;
  st.updateSet(s2.id, exIdx, 0, { weight: 35, reps: 8, done: true });
  st.finishSession(s2.id);
  const data = st.get();
  assert.deepEqual(newRecordsIn(data, data.sessions[1]), [s.exercises[exIdx].exerciseId]);
  assert.equal(exerciseBests(data).get(s.exercises[exIdx].exerciseId)!.bestWeight!.weight, 35);
});

test('Epley estimate', () => {
  assert.equal(estimate1RM(100, 1), 100);
  assert.equal(estimate1RM(100, 10), 133);
});

test('sample data is flagged and produces at least one insight', () => {
  const d: AppData = buildSampleData();
  assert.equal(d.settings.sampleData, true);
  assert.ok(d.sessions.length > 10);
  assert.ok(computeInsights(d).length >= 1, 'sample data should demonstrate insights');
});
