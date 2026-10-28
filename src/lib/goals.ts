import type { Discipline, Goal, Profile } from './types';

export interface GoalInfo { id: Goal; label: string; desc: string; nutrition: string }
export interface DisciplineInfo { id: Discipline; label: string; desc: string; emphasis: string }

export const GOALS: GoalInfo[] = [
  { id: 'lose_fat', label: 'Lose body fat', desc: 'Reduce fat while keeping strength', nutrition: 'Filling, protein-forward meals in a moderate energy deficit' },
  { id: 'build_muscle', label: 'Build muscle', desc: 'Grow size with steady progression', nutrition: 'Enough energy and protein to support growth' },
  { id: 'gain_weight', label: 'Gain weight', desc: 'Put on healthy weight steadily', nutrition: 'Energy-dense, practical meals and snacks' },
  { id: 'lean_muscle', label: 'Build lean muscle', desc: 'Add muscle with minimal fat gain', nutrition: 'A small surplus with plenty of protein' },
  { id: 'recomp', label: 'Recomposition', desc: 'Lose fat while building or keeping muscle', nutrition: 'Around maintenance energy, high protein' },
  { id: 'general', label: 'General fitness', desc: 'Feel better and build a lasting habit', nutrition: 'Balanced, realistic meals' },
  { id: 'endurance', label: 'Cardio endurance', desc: 'Go longer with less effort', nutrition: 'Carbohydrate-supported meals around longer sessions' },
  { id: 'strength', label: 'Get stronger', desc: 'Lift heavier on key movements', nutrition: 'Steady energy and protein for recovery' },
  { id: 'mobility', label: 'Mobility & flexibility', desc: 'Move freely and comfortably', nutrition: 'Balanced, everyday meals' },
  { id: 'maintain', label: 'Maintain', desc: 'Keep your current fitness and physique', nutrition: 'Maintenance energy, consistent habits' },
  { id: 'athletic', label: 'Athletic performance', desc: 'Speed, power and conditioning', nutrition: 'Fueling for training and recovery' },
];

export const DISCIPLINES: DisciplineInfo[] = [
  { id: 'bodybuilding', label: 'Bodybuilding', desc: 'Hypertrophy, volume, balanced physique', emphasis: '8–12 rep work, more sets per muscle, progressive overload' },
  { id: 'powerlifting', label: 'Powerlifting', desc: 'Squat, bench, deadlift', emphasis: 'Competition lifts, low reps, technique practice' },
  { id: 'olympic', label: 'Olympic weightlifting', desc: 'Snatch and clean & jerk foundations', emphasis: 'Squats, pulls and overhead strength, done explosively. The full lifts are best learned with a coach.' },
  { id: 'calisthenics', label: 'Calisthenics', desc: 'Bodyweight strength and skills', emphasis: 'Pull-up, dip and push-up progressions, core control' },
  { id: 'gymnastics', label: 'Gymnastics-style', desc: 'Body control and foundational strength', emphasis: 'Holds, mobility and progressions from the basics up' },
  { id: 'general_strength', label: 'General strength', desc: 'Get stronger across the board', emphasis: 'Compound lifts, moderate reps' },
  { id: 'functional', label: 'Functional fitness', desc: 'Strength for everyday life', emphasis: 'Carries, hinges, squats, conditioning' },
  { id: 'running', label: 'Endurance & running', desc: 'Aerobic base and run fitness', emphasis: 'Easy aerobic work plus strength to stay resilient' },
  { id: 'hybrid', label: 'Hybrid athlete', desc: 'Strength and endurance together', emphasis: 'Lifting plus conditioning in the same week' },
  { id: 'sport', label: 'Sport conditioning', desc: 'Support a sport you play', emphasis: 'Power, single-leg work, conditioning' },
];

export const goalLabel = (g: Goal) => GOALS.find((x) => x.id === g)?.label ?? g;
export const disciplineLabel = (d: Discipline) => DISCIPLINES.find((x) => x.id === d)?.label ?? d;

/** Older saved profiles used four goal ids. */
export function migrateGoal(g: string): Goal {
  if (g === 'muscle') return 'build_muscle';
  return (GOALS.some((x) => x.id === g) ? g : 'general') as Goal;
}

// Disciplines that pull training in different directions. If the user picks
// more than one, they must name a primary focus.
const FAMILY: Record<Discipline, string> = {
  bodybuilding: 'hypertrophy', powerlifting: 'maxstrength', olympic: 'power', calisthenics: 'bodyweight', gymnastics: 'bodyweight',
  general_strength: 'strength', functional: 'strength', running: 'aerobic', hybrid: 'mixed', sport: 'power',
};
export function needsPrimary(ds: Discipline[]): boolean {
  return new Set(ds.map((d) => FAMILY[d])).size > 1;
}

/** The discipline that drives programming: explicit primary, else the only one. */
export function drivingDiscipline(p: Pick<Profile, 'disciplines' | 'primaryDiscipline'>): Discipline | null {
  if (p.primaryDiscipline && p.disciplines.includes(p.primaryDiscipline)) return p.primaryDiscipline;
  return p.disciplines[0] ?? null;
}

/** Protein-forward goals get a higher g/kg reference range. */
export function isProteinForward(p: Pick<Profile, 'goal' | 'secondaryGoals' | 'disciplines'>): boolean {
  const g = [p.goal, ...p.secondaryGoals];
  return g.some((x) => ['build_muscle', 'lean_muscle', 'recomp', 'lose_fat', 'gain_weight', 'strength'].includes(x)) || p.disciplines.some((d) => ['bodybuilding', 'powerlifting', 'olympic', 'calisthenics', 'gymnastics', 'general_strength', 'hybrid'].includes(d));
}
