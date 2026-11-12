// PX Boot Camp levels: calisthenics skill ladders. Each level has a clear test so people know
// exactly when they've earned it. These are starting defaults: the coach can rename or reorder
// them before launch (see docs/PAYWALL.md).
import type { AppData } from './types';

export interface SkillLevel { name: string; test: string }
export interface Ladder { id: string; name: string; levels: SkillLevel[] }

export const LADDERS: Ladder[] = [
  { id: 'pushup', name: 'Push-up', levels: [
    { name: 'Wall push-up', test: '3 sets of 15' },
    { name: 'Incline push-up', test: '3 sets of 12 on a bench or counter' },
    { name: 'Knee push-up', test: '3 sets of 12' },
    { name: 'First full push-up', test: '1 clean rep, chest to fist height' },
    { name: 'Push-up', test: '3 sets of 10' },
    { name: 'Diamond push-up', test: '3 sets of 10' },
    { name: 'Archer push-up', test: '5 each side' },
  ] },
  { id: 'pullup', name: 'Pull-up', levels: [
    { name: 'Dead hang', test: '30 seconds' },
    { name: 'Scap pulls', test: '3 sets of 10' },
    { name: 'Slow negatives', test: '5 reps, 5 seconds down' },
    { name: 'First pull-up', test: '1 clean rep, chin over the bar' },
    { name: '5 pull-ups', test: '5 in a row' },
    { name: '10 pull-ups', test: '10 in a row' },
  ] },
  { id: 'handstand', name: 'Handstand', levels: [
    { name: 'Plank', test: '60 seconds' },
    { name: 'Pike hold', test: 'Hips high, 30 seconds' },
    { name: 'Wall walk', test: '3 walks up and down' },
    { name: 'Chest-to-wall hold', test: '30 seconds' },
    { name: 'Wall handstand', test: '60 seconds' },
    { name: 'Freestanding handstand', test: '10 seconds' },
  ] },
  { id: 'legs', name: 'Pistol squat', levels: [
    { name: 'Bodyweight squat', test: '3 sets of 20' },
    { name: 'Split squat', test: '3 sets of 10 each leg' },
    { name: 'Bulgarian split squat', test: '3 sets of 10 each leg' },
    { name: 'Box pistol', test: '5 each leg to a bench' },
    { name: 'First pistol squat', test: '1 each leg' },
    { name: 'Pistol squat', test: '5 each leg' },
  ] },
  { id: 'core', name: 'L-sit', levels: [
    { name: 'Dead bug', test: '3 sets of 10' },
    { name: 'Hollow hold', test: '30 seconds' },
    { name: 'Tuck L-sit', test: '10 seconds' },
    { name: 'One-leg L-sit', test: '10 seconds each leg' },
    { name: 'L-sit', test: '10 seconds' },
  ] },
];

export const ladder = (id: string) => LADDERS.find((l) => l.id === id);

/** Current level (0 = not started yet). */
export const levelOf = (data: AppData, id: string) => data.skills?.[id]?.level ?? 0;

export function nextLevel(data: AppData, id: string): (SkillLevel & { number: number }) | null {
  const l = ladder(id);
  if (!l) return null;
  const n = levelOf(data, id);
  return n < l.levels.length ? { ...l.levels[n], number: n + 1 } : null;
}

/** What friends and a coach see: ladder, level number and name. */
export function skillSummary(data: AppData): { id: string; ladder: string; level: number; of: number; name: string; date: string }[] {
  const out: { id: string; ladder: string; level: number; of: number; name: string; date: string }[] = [];
  for (const l of LADDERS) {
    const s = data.skills?.[l.id];
    if (!s || s.level < 1) continue;
    const last = [...s.history].reverse().find((h) => h.level === s.level);
    out.push({ id: l.id, ladder: l.name, level: s.level, of: l.levels.length, name: l.levels[Math.min(s.level, l.levels.length) - 1].name, date: last?.date ?? '' });
  }
  return out;
}
