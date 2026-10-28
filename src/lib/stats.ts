import type { AppData, Session, SetEntry } from './types';
import { addDays, daysBetween, toDateKey, weekStart } from './dates';
import { isTrainingDay } from './planner';

export type DayOutcome = 'done' | 'skipped' | 'missed' | 'rest' | 'extra' | 'pending' | 'before';

export function completedSessions(data: AppData): Session[] {
  return data.sessions.filter((s) => s.status === 'completed');
}

export function sessionsOn(data: AppData, date: string): Session[] {
  return completedSessions(data).filter((s) => s.plannedFor === date);
}

/**
 * What happened on a day, relative to the plan. Days before the profile was
 * created are 'before' so a new user never sees a wall of "missed".
 */
export function dayOutcome(data: AppData, date: string, today = toDateKey(new Date())): DayOutcome {
  const p = data.profile;
  if (!p) return 'before';
  const start = toDateKey(new Date(p.createdAt));
  if (date < start) return 'before';
  const trained = sessionsOn(data, date).length > 0;
  const planned = isTrainingDay(p, date);
  if (trained) return planned ? 'done' : 'extra';
  if (!planned) return 'rest';
  if (data.skips.some((s) => s.date === date)) return 'skipped';
  if (date >= today) return 'pending';
  return 'missed';
}

export interface PlanWindow {
  planned: number;
  done: number;
  extra: number;
  rate: number | null; // null when nothing was planned
}

export function planWindow(data: AppData, from: string, to: string, today = toDateKey(new Date())): PlanWindow {
  let planned = 0;
  let done = 0;
  let extra = 0;
  for (let d = from; d <= to; d = addDays(d, 1)) {
    const o = dayOutcome(data, d, today);
    if (o === 'pending' || o === 'before') continue;
    if (o === 'extra') extra++;
    if (o === 'done' || o === 'skipped' || o === 'missed') planned++;
    if (o === 'done') done++;
  }
  return { planned, done, extra, rate: planned ? done / planned : null };
}

export function weeklyConsistency(data: AppData, weeks: number, today = toDateKey(new Date())) {
  const thisWeek = weekStart(today);
  const out: { week: string; planned: number; done: number; extra: number }[] = [];
  for (let i = weeks - 1; i >= 0; i--) {
    const ws = addDays(thisWeek, -7 * i);
    const we = addDays(ws, 6);
    const w = planWindow(data, ws, we < today ? we : today, today);
    // Count today as done if a session already finished today.
    out.push({ week: ws, planned: w.planned, done: w.done, extra: w.extra });
  }
  return out;
}

export function setVolume(s: SetEntry): number {
  return s.done && s.weight && s.reps ? s.weight * s.reps : 0;
}

export function sessionVolume(s: Session): number {
  return s.exercises.reduce((v, e) => v + e.sets.reduce((a, set) => a + setVolume(set), 0), 0);
}

export function setsDone(s: Session): number {
  return s.exercises.reduce((n, e) => n + e.sets.filter((x) => x.done).length, 0);
}

export function weeklyVolume(data: AppData, weeks: number, today = toDateKey(new Date())) {
  const thisWeek = weekStart(today);
  const out: { week: string; volume: number; sets: number }[] = [];
  for (let i = weeks - 1; i >= 0; i--) {
    const ws = addDays(thisWeek, -7 * i);
    const we = addDays(ws, 6);
    const ss = completedSessions(data).filter((s) => s.plannedFor >= ws && s.plannedFor <= we);
    out.push({ week: ws, volume: ss.reduce((v, s) => v + sessionVolume(s), 0), sets: ss.reduce((n, s) => n + setsDone(s), 0) });
  }
  return out;
}

/** Epley estimate. Only meaningful for 1–12 reps; labelled as an estimate in the UI. */
export function estimate1RM(weight: number, reps: number): number {
  if (reps <= 1) return weight;
  return Math.round(weight * (1 + reps / 30));
}

export interface ExerciseBest {
  exerciseId: string;
  bestWeight?: { weight: number; reps: number; date: string };
  bestEst1RM?: { value: number; date: string };
  bestReps?: { reps: number; date: string };
  bestSeconds?: { seconds: number; date: string };
  sessions: number;
}

export function exerciseBests(data: AppData): Map<string, ExerciseBest> {
  const map = new Map<string, ExerciseBest>();
  for (const s of completedSessions(data)) {
    for (const e of s.exercises) {
      const b = map.get(e.exerciseId) ?? { exerciseId: e.exerciseId, sessions: 0 };
      let any = false;
      for (const set of e.sets) {
        if (!set.done) continue;
        any = true;
        if (set.weight && set.reps) {
          if (!b.bestWeight || set.weight > b.bestWeight.weight || (set.weight === b.bestWeight.weight && set.reps > b.bestWeight.reps)) b.bestWeight = { weight: set.weight, reps: set.reps, date: s.plannedFor };
          const est = estimate1RM(set.weight, set.reps);
          if (set.reps <= 12 && (!b.bestEst1RM || est > b.bestEst1RM.value)) b.bestEst1RM = { value: est, date: s.plannedFor };
        } else if (set.reps) {
          if (!b.bestReps || set.reps > b.bestReps.reps) b.bestReps = { reps: set.reps, date: s.plannedFor };
        }
        if (set.seconds && (!b.bestSeconds || set.seconds > b.bestSeconds.seconds)) b.bestSeconds = { seconds: set.seconds, date: s.plannedFor };
      }
      if (any) b.sessions++;
      map.set(e.exerciseId, b);
    }
  }
  return map;
}

/** Per-session top set for one exercise, oldest first. */
export function exerciseSeries(data: AppData, exerciseId: string) {
  return completedSessions(data)
    .filter((s) => s.exercises.some((e) => e.exerciseId === exerciseId))
    .sort((a, b) => a.startedAt.localeCompare(b.startedAt))
    .map((s) => {
      const sets = s.exercises.filter((e) => e.exerciseId === exerciseId).flatMap((e) => e.sets.filter((x) => x.done));
      const topWeight = Math.max(0, ...sets.map((x) => x.weight ?? 0));
      const topReps = Math.max(0, ...sets.map((x) => x.reps ?? 0));
      const topSeconds = Math.max(0, ...sets.map((x) => x.seconds ?? 0));
      const est = Math.max(0, ...sets.filter((x) => x.weight && x.reps && x.reps <= 12).map((x) => estimate1RM(x.weight!, x.reps!)));
      return { date: s.plannedFor, topWeight, topReps, topSeconds, est };
    });
}

/** The sets from the most recent completed session that included this exercise. */
export function lastPerformance(data: AppData, exerciseId: string, excludeSessionId?: string): SetEntry[] | null {
  const prev = completedSessions(data)
    .filter((s) => s.id !== excludeSessionId && s.exercises.some((e) => e.exerciseId === exerciseId))
    .sort((a, b) => b.startedAt.localeCompare(a.startedAt))[0];
  if (!prev) return null;
  return prev.exercises.find((e) => e.exerciseId === exerciseId)!.sets.filter((s) => s.done);
}

/** A session-level PR check used for the completion screen. */
export function newRecordsIn(data: AppData, session: Session): string[] {
  const before = exerciseBests({ ...data, sessions: data.sessions.filter((s) => s.id !== session.id) });
  const out: string[] = [];
  for (const e of session.exercises) {
    const b = before.get(e.exerciseId);
    if (!b || b.sessions === 0) continue; // first time isn't a "record", it's a baseline
    for (const set of e.sets) {
      if (!set.done) continue;
      if (set.weight && b.bestWeight && set.weight > b.bestWeight.weight) { out.push(e.exerciseId); break; }
      if (!set.weight && set.reps && b.bestReps && set.reps > b.bestReps.reps) { out.push(e.exerciseId); break; }
      if (set.seconds && b.bestSeconds && set.seconds > b.bestSeconds.seconds) { out.push(e.exerciseId); break; }
    }
  }
  return out;
}

export function daysSinceLastWorkout(data: AppData, today = toDateKey(new Date())): number | null {
  const last = completedSessions(data).map((s) => s.plannedFor).sort().pop();
  return last ? daysBetween(last, today) : null;
}
