import type { Equipment, Exercise } from './types';

// A deliberately compact starter library. Each exercise has a form cue and
// substitutes so a user can swap mid-workout when equipment is taken.
export const EXERCISES: Exercise[] = [
  // Legs
  { id: 'goblet-squat', name: 'Goblet Squat', muscle: 'legs', equipment: 'dumbbells', metric: 'weight_reps', cue: 'Elbows inside knees, chest tall, sit between your heels.', substitutes: ['bw-squat', 'back-squat', 'leg-press'] },
  { id: 'back-squat', name: 'Back Squat', muscle: 'legs', equipment: 'barbell', metric: 'weight_reps', cue: 'Brace before you descend; knees track over toes.', substitutes: ['goblet-squat', 'leg-press', 'bw-squat'] },
  { id: 'bw-squat', name: 'Bodyweight Squat', muscle: 'legs', equipment: 'bodyweight', metric: 'reps', cue: 'Full foot pressure; pause briefly at the bottom.', substitutes: ['goblet-squat', 'split-squat'] },
  { id: 'leg-press', name: 'Leg Press', muscle: 'legs', equipment: 'machines', metric: 'weight_reps', cue: 'Lower back stays on the pad the whole rep.', substitutes: ['goblet-squat', 'back-squat'] },
  { id: 'split-squat', name: 'Split Squat', muscle: 'legs', equipment: 'bodyweight', metric: 'reps', cue: 'Back knee drops straight down; front heel stays planted.', substitutes: ['db-lunge', 'bw-squat'] },
  { id: 'db-lunge', name: 'Dumbbell Reverse Lunge', muscle: 'legs', equipment: 'dumbbells', metric: 'weight_reps', cue: 'Step back long; push through the front heel.', substitutes: ['split-squat', 'goblet-squat'] },
  { id: 'rdl', name: 'Romanian Deadlift', muscle: 'legs', equipment: 'barbell', metric: 'weight_reps', cue: 'Hips back, bar close, soft knees, flat back.', substitutes: ['db-rdl', 'glute-bridge'] },
  { id: 'db-rdl', name: 'Dumbbell Romanian Deadlift', muscle: 'legs', equipment: 'dumbbells', metric: 'weight_reps', cue: 'Slide the bells down your thighs; stop when hips stop.', substitutes: ['rdl', 'kb-swing', 'glute-bridge'] },
  { id: 'glute-bridge', name: 'Glute Bridge', muscle: 'legs', equipment: 'bodyweight', metric: 'reps', cue: 'Ribs down, squeeze at the top for a second.', substitutes: ['db-rdl'] },
  { id: 'kb-swing', name: 'Kettlebell Swing', muscle: 'legs', equipment: 'kettlebell', metric: 'weight_reps', cue: 'Hinge, snap the hips; arms just guide the bell.', substitutes: ['db-rdl', 'glute-bridge'] },
  { id: 'leg-curl', name: 'Leg Curl', muscle: 'legs', equipment: 'machines', metric: 'weight_reps', cue: 'Control the lowering for two seconds.', substitutes: ['glute-bridge', 'db-rdl'] },
  // Push
  { id: 'push-up', name: 'Push-up', muscle: 'push', equipment: 'bodyweight', metric: 'reps', cue: 'Body in one line; chest meets the floor first.', substitutes: ['db-bench', 'incline-push-up'] },
  { id: 'incline-push-up', name: 'Incline Push-up', muscle: 'push', equipment: 'bodyweight', metric: 'reps', cue: 'Hands on a bench; same straight line as a push-up.', substitutes: ['push-up'] },
  { id: 'db-bench', name: 'Dumbbell Bench Press', muscle: 'push', equipment: 'dumbbells', metric: 'weight_reps', cue: 'Shoulder blades pinned; press up and slightly in.', substitutes: ['bench-press', 'push-up', 'chest-press'] },
  { id: 'bench-press', name: 'Bench Press', muscle: 'push', equipment: 'barbell', metric: 'weight_reps', cue: 'Feet planted, bar to lower chest, press back over shoulders.', substitutes: ['db-bench', 'push-up'] },
  { id: 'chest-press', name: 'Machine Chest Press', muscle: 'push', equipment: 'machines', metric: 'weight_reps', cue: 'Handles at mid-chest; don’t lock out hard.', substitutes: ['db-bench', 'push-up'] },
  { id: 'db-ohp', name: 'Dumbbell Shoulder Press', muscle: 'push', equipment: 'dumbbells', metric: 'weight_reps', cue: 'Ribs down; finish with biceps by your ears.', substitutes: ['ohp', 'pike-push-up'] },
  { id: 'ohp', name: 'Overhead Press', muscle: 'push', equipment: 'barbell', metric: 'weight_reps', cue: 'Squeeze glutes; head moves through once the bar passes.', substitutes: ['db-ohp'] },
  { id: 'pike-push-up', name: 'Pike Push-up', muscle: 'push', equipment: 'bodyweight', metric: 'reps', cue: 'Hips high; lower the top of your head between your hands.', substitutes: ['db-ohp', 'push-up'] },
  { id: 'band-press', name: 'Band Chest Press', muscle: 'push', equipment: 'bands', metric: 'reps', cue: 'Anchor behind you; press straight forward.', substitutes: ['push-up'] },
  // Pull
  { id: 'db-row', name: 'One-arm Dumbbell Row', muscle: 'pull', equipment: 'dumbbells', metric: 'weight_reps', cue: 'Pull the elbow to your hip, not your armpit.', substitutes: ['barbell-row', 'band-row', 'lat-pulldown'] },
  { id: 'barbell-row', name: 'Barbell Row', muscle: 'pull', equipment: 'barbell', metric: 'weight_reps', cue: 'Torso near 45°, bar to lower ribs.', substitutes: ['db-row', 'seated-row'] },
  { id: 'lat-pulldown', name: 'Lat Pulldown', muscle: 'pull', equipment: 'machines', metric: 'weight_reps', cue: 'Lead with elbows; bar to upper chest.', substitutes: ['band-pulldown', 'db-row'] },
  { id: 'seated-row', name: 'Seated Cable Row', muscle: 'pull', equipment: 'machines', metric: 'weight_reps', cue: 'Sit tall; squeeze shoulder blades at the end.', substitutes: ['db-row', 'band-row'] },
  { id: 'band-row', name: 'Band Row', muscle: 'pull', equipment: 'bands', metric: 'reps', cue: 'Elbows close; pause with the band at your ribs.', substitutes: ['db-row', 'inverted-row'] },
  { id: 'band-pulldown', name: 'Band Pulldown', muscle: 'pull', equipment: 'bands', metric: 'reps', cue: 'Pull down to the chest, slow on the way up.', substitutes: ['lat-pulldown'] },
  { id: 'inverted-row', name: 'Inverted Row (table or bar)', muscle: 'pull', equipment: 'bodyweight', metric: 'reps', cue: 'Body stiff; pull chest to the edge.', substitutes: ['band-row', 'db-row'] },
  { id: 'pull-up', name: 'Pull-up', muscle: 'pull', equipment: 'bodyweight', metric: 'reps', cue: 'Start from a dead hang; chin clears the bar.', substitutes: ['lat-pulldown', 'band-pulldown'] },
  { id: 'db-curl', name: 'Dumbbell Curl', muscle: 'pull', equipment: 'dumbbells', metric: 'weight_reps', cue: 'Elbows still; lower slowly.', substitutes: ['band-row'] },
  // Core
  { id: 'plank', name: 'Plank', muscle: 'core', equipment: 'bodyweight', metric: 'time', cue: 'Squeeze glutes and pull elbows toward toes.', substitutes: ['dead-bug'] },
  { id: 'dead-bug', name: 'Dead Bug', muscle: 'core', equipment: 'bodyweight', metric: 'reps', cue: 'Low back pressed down the whole time.', substitutes: ['plank'] },
  { id: 'side-plank', name: 'Side Plank', muscle: 'core', equipment: 'bodyweight', metric: 'time', cue: 'Hips high; stack the shoulders.', substitutes: ['plank'] },
  { id: 'farmer-carry', name: 'Farmer Carry', muscle: 'core', equipment: 'dumbbells', metric: 'time', cue: 'Tall posture, short quick steps.', substitutes: ['plank'] },
  // Conditioning
  { id: 'brisk-walk', name: 'Brisk Walk', muscle: 'conditioning', equipment: 'bodyweight', metric: 'time', cue: 'A pace where talking takes a little effort.', substitutes: ['jumping-jacks'] },
  { id: 'jumping-jacks', name: 'Jumping Jacks', muscle: 'conditioning', equipment: 'bodyweight', metric: 'time', cue: 'Land softly; steady rhythm.', substitutes: ['brisk-walk'] },
  { id: 'mountain-climber', name: 'Mountain Climbers', muscle: 'conditioning', equipment: 'bodyweight', metric: 'time', cue: 'Hips level with shoulders.', substitutes: ['jumping-jacks'] },
  // Added for discipline-specific plans
  { id: 'deadlift', name: 'Deadlift', muscle: 'legs', equipment: 'barbell', metric: 'weight_reps', cue: 'Bar over mid-foot, push the floor away, lock hips and knees together.', substitutes: ['rdl', 'db-rdl', 'kb-swing'] },
  { id: 'dip', name: 'Dip (bars or bench)', muscle: 'push', equipment: 'bodyweight', metric: 'reps', cue: 'Shoulders down; lower until upper arms are about parallel.', substitutes: ['push-up', 'incline-push-up'] },
  { id: 'hollow-hold', name: 'Hollow Body Hold', muscle: 'core', equipment: 'bodyweight', metric: 'time', cue: 'Low back glued down; bend the knees to make it easier.', substitutes: ['dead-bug', 'plank'] },
  { id: 'negative-pull-up', name: 'Pull-up Negative', muscle: 'pull', equipment: 'bodyweight', metric: 'reps', cue: 'Jump to the top, lower yourself over 3–5 seconds.', substitutes: ['inverted-row', 'band-pulldown'] },
  { id: 'easy-run', name: 'Easy Run or Brisk Walk', muscle: 'conditioning', equipment: 'bodyweight', metric: 'time', cue: 'Conversational pace: you could speak in full sentences.', substitutes: ['brisk-walk'] },
  { id: 'deep-squat-hold', name: 'Deep Squat Hold', muscle: 'legs', equipment: 'bodyweight', metric: 'time', cue: 'Hold a support if needed; heels down, chest up, breathe.', substitutes: ['bw-squat'] },
  { id: 'hip-flexor-stretch', name: 'Half-kneeling Hip Flexor Stretch', muscle: 'legs', equipment: 'bodyweight', metric: 'time', cue: 'Tuck the pelvis and squeeze the back glute; gentle, never painful.', substitutes: ['deep-squat-hold'] },
  { id: 'thoracic-rotation', name: 'Open-book Rotation', muscle: 'core', equipment: 'bodyweight', metric: 'time', cue: 'Lying on your side, rotate the top arm open while knees stay stacked.', substitutes: ['dead-bug'] },
  { id: 'jump-squat', name: 'Jump Squat', muscle: 'legs', equipment: 'bodyweight', metric: 'reps', cue: 'Land softly and quietly; stop the set before landings get sloppy.', substitutes: ['bw-squat', 'kb-swing'] },
];

const byId = new Map(EXERCISES.map((e) => [e.id, e]));

export function getExercise(id: string, custom: Exercise[] = []): Exercise | undefined {
  return byId.get(id) ?? custom.find((c) => c.id === id);
}

export function allExercises(custom: Exercise[] = []): Exercise[] {
  return [...EXERCISES, ...custom];
}

export function isAvailable(ex: Exercise, equipment: Equipment[]): boolean {
  return ex.equipment === 'bodyweight' || equipment.includes(ex.equipment);
}

/** Substitutes the user can actually do with their equipment. */
export function availableSubstitutes(id: string, equipment: Equipment[], custom: Exercise[] = []): Exercise[] {
  const ex = getExercise(id, custom);
  if (!ex) return [];
  const direct = ex.substitutes.map((s) => getExercise(s, custom)).filter((e): e is Exercise => !!e && isAvailable(e, equipment));
  const sameMuscle = allExercises(custom).filter((e) => e.muscle === ex.muscle && e.id !== ex.id && isAvailable(e, equipment) && !direct.includes(e));
  return [...direct, ...sameMuscle].slice(0, 6);
}
