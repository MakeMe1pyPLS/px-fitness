import { EXERCISES, getExercise, isAvailable } from './exercises';
import type { AppData, Equipment, Exercise, Profile, Session, Template, TemplateExercise } from './types';
import { drivingDiscipline } from './goals';
import { toDateKey, uid, weekday } from './dates';

// Preference order for each movement slot. The first exercise the user has
// equipment for wins, so a dumbbell-only user and a full-gym user get
// different but equivalent plans.
const SLOTS: Record<string, string[]> = {
  squat: ['back-squat', 'goblet-squat', 'leg-press', 'bw-squat'],
  hinge: ['rdl', 'db-rdl', 'kb-swing', 'glute-bridge'],
  lunge: ['db-lunge', 'split-squat'],
  hamstring: ['leg-curl', 'glute-bridge', 'db-rdl'],
  hpush: ['bench-press', 'db-bench', 'chest-press', 'push-up', 'band-press'],
  vpush: ['ohp', 'db-ohp', 'pike-push-up'],
  hpull: ['barbell-row', 'db-row', 'seated-row', 'band-row', 'inverted-row'],
  vpull: ['lat-pulldown', 'pull-up', 'band-pulldown', 'inverted-row'],
  arms: ['db-curl', 'band-row'],
  core: ['plank', 'dead-bug', 'side-plank'],
  carry: ['farmer-carry', 'side-plank'],
  conditioning: ['mountain-climber', 'jumping-jacks', 'brisk-walk'],
  deadlift: ['deadlift', 'rdl', 'db-rdl', 'kb-swing'],
  dip: ['dip', 'push-up'],
  bwpull: ['pull-up', 'negative-pull-up', 'inverted-row'],
  bwpush: ['push-up', 'incline-push-up'],
  hollow: ['hollow-hold', 'dead-bug'],
  bwlegs: ['split-squat', 'bw-squat'],
  pike: ['pike-push-up'],
  aerobic: ['easy-run', 'brisk-walk'],
  power: ['jump-squat', 'kb-swing'],
  mob_hip: ['hip-flexor-stretch', 'deep-squat-hold'],
  mob_spine: ['thoracic-rotation'],
  mob_squat: ['deep-squat-hold'],
};

function pick(slot: string, equipment: Equipment[], avoid: Set<string>): Exercise {
  const options = SLOTS[slot].map((id) => getExercise(id)!).filter((e) => isAvailable(e, equipment));
  return options.find((e) => !avoid.has(e.id)) ?? options[0] ?? EXERCISES.find((e) => e.id === 'bw-squat')!;
}

function targetFor(ex: Exercise, profile: Profile): string {
  const d = drivingDiscipline(profile);
  if (ex.metric === 'time') {
    if (ex.id === 'easy-run') return profile.sessionMinutes >= 45 ? '20 min' : '10 min';
    if (ex.id.startsWith('hip-') || ex.id === 'deep-squat-hold' || ex.id === 'thoracic-rotation') return '45 s';
    return ex.muscle === 'conditioning' ? '40 s' : '30 s';
  }
  if (ex.id === 'jump-squat') return '5 reps';
  if (ex.metric === 'weight_reps') {
    if (d === 'powerlifting') return '3–5 reps';
    if (d === 'olympic') return '3 fast reps';
    if (d === 'bodybuilding') return '8–12 reps';
    if (profile.goal === 'strength' || d === 'general_strength') return '5–6 reps';
  }
  if (d === 'calisthenics' || d === 'gymnastics') return ex.id.includes('negative') ? '3–5 slow reps' : '5–10 reps';
  if (profile.goal === 'endurance' || d === 'running') return '12–15 reps';
  return '8–12 reps';
}

function baseSets(profile: Profile): number {
  const extra = drivingDiscipline(profile) === 'bodybuilding' && profile.experience !== 'beginner' ? 1 : 0;
  return (profile.experience === 'beginner' ? 2 : 3) + extra;
}

/** Roughly how many minutes a template takes, counting work + rest. */
export function estimateMinutes(t: { exercises: TemplateExercise[] }): number {
  const sets = t.exercises.reduce((n, e) => n + e.sets, 0);
  return Math.round(5 + sets * 2.25); // 5 min warm-up, ~2¼ min per set incl. rest
}

function build(name: string, focus: string, slots: string[], profile: Profile): Template {
  const used = new Set<string>();
  const exercises: TemplateExercise[] = [];
  for (const s of slots) {
    const ex = pick(s, profile.equipment, used);
    if (used.has(ex.id)) continue;
    used.add(ex.id);
    exercises.push({ exerciseId: ex.id, sets: baseSets(profile), target: targetFor(ex, profile) });
  }
  // Trim from the end until it fits the time the user said they have.
  const t: Template = { id: uid('t_'), name, focus, exercises };
  while (t.exercises.length > 3 && estimateMinutes(t) > profile.sessionMinutes) t.exercises.pop();
  if (estimateMinutes(t) < profile.sessionMinutes - 15 && profile.experience !== 'beginner') {
    t.exercises.forEach((e) => (e.sets = Math.min(4, e.sets + 1)));
    while (t.exercises.length > 3 && estimateMinutes(t) > profile.sessionMinutes) t.exercises.pop();
  }
  return t;
}

// Movement blueprints per discipline. [name, focus, slots]
type Blueprint = [string, string, string[]];
function blueprints(profile: Profile): Blueprint[] {
  const days = profile.trainingDays.length;
  const d = drivingDiscipline(profile);
  const mobility = profile.goal === 'mobility' || profile.secondaryGoals?.includes('mobility');
  const mob = mobility ? ['mob_hip', 'mob_spine'] : [];
  if (d === 'powerlifting') return [
    ['Squat Day', 'Squat + accessories', ['squat', 'hpush', 'hpull', 'core', ...mob]],
    ['Bench Day', 'Bench + upper back', ['hpush', 'vpull', 'vpush', 'hpull', ...mob]],
    ['Deadlift Day', 'Deadlift + legs', ['deadlift', 'lunge', 'vpull', 'core', ...mob]],
  ].slice(0, Math.max(2, Math.min(3, days))) as Blueprint[];
  if (d === 'olympic') return [
    ['Squat & Pull', 'Squat, explosive pulls', ['squat', 'power', 'deadlift', 'vpush', 'core']],
    ['Overhead & Power', 'Overhead strength, jumps', ['vpush', 'power', 'hinge', 'hpull', 'mob_squat']],
  ];
  if (d === 'calisthenics' || d === 'gymnastics') return [
    ['Pull & Core', 'Pull-up progression', ['bwpull', 'hpull', 'hollow', 'bwlegs', ...(d === 'gymnastics' ? ['mob_squat'] : mob)]],
    ['Push & Legs', 'Dip and push progressions', ['dip', 'bwpush', 'pike', 'bwlegs', ...(d === 'gymnastics' ? ['mob_hip'] : mob)]],
    ...(days >= 3 ? [['Skills & Control', 'Holds and full-body control', ['hollow', 'bwpull', 'bwpush', 'mob_spine', 'mob_hip']] as Blueprint] : []),
  ];
  if (d === 'running' || profile.goal === 'endurance') return [
    ['Aerobic + Legs', 'Easy run, leg strength', ['aerobic', 'lunge', 'hinge', 'core']],
    ['Strength Support', 'Full-body resilience', ['squat', 'hpull', 'hpush', 'carry', ...mob]],
    ...(days >= 3 ? [['Aerobic + Core', 'Easy run, trunk work', ['aerobic', 'core', 'hamstring', 'mob_hip']] as Blueprint] : []),
  ];
  if (d === 'hybrid' || d === 'functional' || d === 'sport' || profile.goal === 'athletic') return [
    ['Strength + Engine', 'Lift, then condition', ['squat', 'hpush', 'hpull', 'conditioning', 'carry']],
    ['Power + Pull', 'Explosive work, posterior chain', ['power', 'hinge', 'vpull', 'lunge', 'core']],
    ...(days >= 3 ? [['Aerobic + Upper', 'Upper body, aerobic finish', ['vpush', 'hpull', 'aerobic', ...mob]] as Blueprint] : []),
  ];
  if (mobility && profile.goal === 'mobility') return [
    ['Move Well A', 'Hips and squat', ['mob_hip', 'mob_squat', 'bwlegs', 'core', 'mob_spine']],
    ['Move Well B', 'Spine and shoulders', ['mob_spine', 'hpull', 'bwpush', 'mob_hip', 'hollow']],
  ];
  if (days >= 4) {
    return [
      ['Lower A', 'Legs & core', ['squat', 'hinge', 'lunge', 'core', 'hamstring', ...mob]],
      ['Upper A', 'Push & pull', ['hpush', 'hpull', 'vpush', 'vpull', 'arms']],
      ['Lower B', 'Legs & carry', ['hinge', 'lunge', 'squat', 'carry', 'conditioning']],
      ['Upper B', 'Pull & push', ['vpull', 'hpush', 'hpull', 'vpush', 'core', ...mob]],
    ];
  }
  return [
    ['Full Body A', 'Squat, press, row', ['squat', 'hpush', 'hpull', 'core', 'lunge', ...mob]],
    ['Full Body B', 'Hinge, overhead, pulldown', ['hinge', 'vpush', 'vpull', 'carry', 'conditioning']],
    ...(days === 3 ? [['Full Body C', 'Lunge, push, row', ['lunge', 'hpush', 'hpull', 'hamstring', 'core']] as Blueprint] : []),
  ];
}

export function generateTemplates(profile: Profile): Template[] {
  return blueprints(profile).map(([name, focus, slots]) => build(name, focus, slots, profile));
}

/** Plain-language note on how the plan reflects the user's discipline. */
export function planNote(profile: Profile): string | null {
  const d = drivingDiscipline(profile);
  if (d === 'powerlifting' && !profile.equipment.includes('barbell')) return 'Powerlifting works best with a barbell. Without one, the plan uses the closest substitutes.';
  if (d === 'olympic') return 'The full snatch and clean & jerk are technical. This plan builds the strength behind them; learn the lifts themselves with a qualified coach.';
  if (d === 'gymnastics') return 'This plan starts from foundational holds and progressions. It doesn’t assume a gymnastics background.';
  return null;
}

export function isTrainingDay(profile: Profile, dateKey: string): boolean {
  return profile.trainingDays.includes(weekday(dateKey));
}

export function nextTemplate(data: AppData): Template | null {
  if (!data.templates.length) return null;
  return data.templates[data.rotationIndex % data.templates.length];
}

/** Short variant: the first three movements, two sets each. */
export function shortVersion(t: Template): TemplateExercise[] {
  return t.exercises.slice(0, 3).map((e) => ({ ...e, sets: Math.min(2, e.sets) }));
}

export function createSession(t: Template, variant: 'full' | 'short', now = new Date()): Session {
  const list = variant === 'short' ? shortVersion(t) : t.exercises;
  return {
    id: uid('s_'),
    templateId: t.id,
    name: variant === 'short' ? `${t.name} · Short` : t.name,
    variant,
    plannedFor: toDateKey(now),
    startedAt: now.toISOString(),
    status: 'in_progress',
    exercises: list.map((e) => ({ exerciseId: e.exerciseId, target: e.target, sets: Array.from({ length: e.sets }, () => ({ done: false })) })),
  };
}

export function activeSession(data: AppData): Session | undefined {
  return data.sessions.find((s) => s.status === 'in_progress');
}
