// Learn to fight: a fundamentals path for stand-up fighting, plus game plans
// for facing someone bigger, taller, shorter or about your size.
// Written for an orthodox stance (left foot forward). Southpaws mirror it.
// These are the standard basics taught in boxing, kickboxing and MMA gyms.
// They're for sport and fitness. Real contact belongs in a gym, with a coach.

import type { Sport } from './combat';

export type Diagram = 'stance' | 'step' | 'pivot' | 'angle' | 'slip' | 'roll' | 'sprawl' | 'none';
export interface Lesson {
  id: string;
  title: string;
  unit: 'Base' | 'Punches' | 'Defense' | 'Movement' | 'Kicks' | 'Clinch & ground';
  why: string;
  steps: string[];
  mistakes: string[];
  drill: { text: string; rounds: number; sec: number };
  diagram: Diagram;
  kicksOnly?: boolean;
}

export const LESSONS: Lesson[] = [
  { id: 'stance', unit: 'Base', title: 'Stance & guard', diagram: 'stance',
    why: 'Everything comes from your stance: balance to hit hard, and a guard that keeps your chin safe.',
    steps: ['Stand with your feet about shoulder-width apart, left foot forward.', 'Turn your back foot out about 45°, heel slightly off the floor.', 'Keep your knees soft and your weight in the middle, not on your heels.', 'Rear fist by your cheek, lead fist a little in front at eye level.', 'Elbows in to cover your ribs. Chin down, look through your eyebrows.'],
    mistakes: ['Feet in one line: a light push knocks you over', 'Standing square to your opponent', 'Chin up and hands dropping when you get tired'],
    drill: { text: 'Hold your stance in front of a mirror. Check feet, hands, chin. Have a friend push you gently from each side: you shouldn’t tip.', rounds: 3, sec: 60 } },
  { id: 'footwork', unit: 'Base', title: 'Footwork: step and drag', diagram: 'step',
    why: 'Good feet keep you balanced, in range when you want, and out of range when you don’t.',
    steps: ['To go forward, step with the front foot, then bring the back foot the same distance.', 'To go back, move the back foot first, then the front.', 'To go left, move the left foot first. To go right, the right foot first.', 'Small steps. Stay on the balls of your feet. Never cross your feet.', 'After every step you should be back in your stance.'],
    mistakes: ['Crossing your feet or bringing them together', 'Big lunging steps that leave you off balance', 'Bouncing high instead of gliding'],
    drill: { text: 'Move forward, back, left and right, two steps each way, staying in stance. Keep the guard up the whole time.', rounds: 3, sec: 120 } },
  { id: 'jab', unit: 'Punches', title: 'The jab', diagram: 'none',
    why: 'Your most important punch: it measures distance, sets up everything else and keeps people off you.',
    steps: ['From your stance, shoot the lead fist straight out from your face.', 'Turn the fist so the palm faces down as the arm straightens.', 'Lift your lead shoulder to cover your chin.', 'Rear hand stays glued to your cheek.', 'Snap it straight back to your face on the same line. Step in with it to cover distance.'],
    mistakes: ['Pulling the hand back before you throw (they see it coming)', 'Dropping the hand on the way back', 'Leaning forward instead of stepping'],
    drill: { text: 'Shadowbox jabs only: single jab, double jab, step-in jab, jab then step back.', rounds: 3, sec: 120 } },
  { id: 'cross', unit: 'Punches', title: 'The cross (rear straight)', diagram: 'pivot',
    why: 'Your power punch. The power comes from your legs and hips, not your arm.',
    steps: ['Push off your back foot and turn the heel out, like squashing a bug.', 'Rotate your hips and shoulders toward the target.', 'Throw the rear fist straight down the middle, palm down at the end.', 'Lead hand comes back to protect your face.', 'Return it fast to your cheek and reset your stance.'],
    mistakes: ['Arm-only punches with flat feet', 'Over-leaning past your front knee', 'Lead hand dropping while you throw'],
    drill: { text: 'Jab-cross (1-2) on the spot, then moving forward and back. Turn that back foot every time.', rounds: 3, sec: 120 } },
  { id: 'hook', unit: 'Punches', title: 'The lead hook', diagram: 'none',
    why: 'A short, powerful punch from the side. Great when someone is close or coming in.',
    steps: ['Bend your lead arm to about 90°, elbow up near shoulder height.', 'Turn on the ball of your lead foot and rotate your hips.', 'Your arm stays locked: the body turn throws the punch.', 'Keep it short. Your fist travels in a small arc.', 'Rear hand stays on your chin.'],
    mistakes: ['Winding up wide: it’s slow and easy to see', 'Swinging with the arm only', 'Leaving the chin open with the other hand down'],
    drill: { text: '1-2-3 (jab, cross, hook). Then hook off the jab: jab, hook.', rounds: 3, sec: 120 } },
  { id: 'uppercut', unit: 'Punches', title: 'Uppercuts', diagram: 'none',
    why: 'Comes from underneath, so it gets through a high guard and catches people ducking in.',
    steps: ['Dip slightly by bending your knees, not your waist.', 'Drive up from your legs and turn your hips.', 'The fist rises with your palm facing you, elbow bent.', 'Keep it short and tight: aim at the chin or body.', 'The other hand stays on guard.'],
    mistakes: ['Dropping your hand low first (they see it)', 'Throwing it from too far away', 'Standing straight up and losing your stance'],
    drill: { text: 'Rear uppercut, lead hook. Then lead uppercut, cross. Bend the knees every time.', rounds: 3, sec: 120 } },
  { id: 'combos', unit: 'Punches', title: 'Combinations', diagram: 'none',
    why: 'One punch is easy to stop. Two or three in a row are much harder.',
    steps: ['1-2: jab, cross.', '1-2-3: jab, cross, lead hook.', '1-1-2: double jab, cross.', '2-3-2: cross, hook, cross.', 'Always finish with defense or movement: slip, block, or step out at an angle.'],
    mistakes: ['Standing still in front of them after your combo', 'Loading up on every punch (you’ll be tired and slow)', 'Throwing with your eyes closed or head down'],
    drill: { text: 'Pick two combos. Throw each one, then move: step out to the side or slip.', rounds: 3, sec: 180 } },
  { id: 'block', unit: 'Defense', title: 'Blocking & parrying', diagram: 'none',
    why: 'Stopping punches you can’t avoid, without taking them clean.',
    steps: ['High guard: bring both fists to your temples, forearms tight, elbows in.', 'Parry a jab: tap it aside with your rear hand, a small movement only.', 'Body shots: drop the elbow on that side to cover your ribs.', 'Keep your eyes open: watch their chest and shoulders.', 'Fire back right after the block: block, then punch.'],
    mistakes: ['Closing your eyes or turning away', 'Reaching out to parry (it opens you up)', 'Covering up and never punching back'],
    drill: { text: 'Partner throws slow jabs and crosses; you parry or block, then answer with a 1-2. Light only.', rounds: 3, sec: 120 } },
  { id: 'slip', unit: 'Defense', title: 'Slip & roll', diagram: 'slip',
    why: 'Moving your head means they miss and you’re in position to hit back.',
    steps: ['Slip: turn your shoulders a little so your head moves just outside the punch.', 'Slip to the outside of their jab, or inside of their cross.', 'Roll under hooks: bend your knees and move your head in a U shape under the punch.', 'Bend at the knees, not the waist. Eyes stay on them.', 'Small movements: miss by inches and come back punching.'],
    mistakes: ['Bending forward at the waist', 'Moving too far and losing your stance', 'Looking at the floor'],
    drill: { text: 'Hang a string at head height and slip and roll along it. Then shadowbox: slip, then throw a 1-2.', rounds: 3, sec: 120 } },
  { id: 'angles', unit: 'Movement', title: 'Angles & pivots', diagram: 'angle',
    why: 'Get off the line of attack so you can hit them while they have to turn to find you. Key against bigger fighters.',
    steps: ['Pivot: keep your lead foot planted and swing your back foot around it.', 'Turn about a quarter-turn so you face their side, not their front.', 'Step off at 45°: step forward-left with your lead foot, then follow.', 'Throw as soon as you land at the new angle.', 'Never back up in a straight line: circle out.'],
    mistakes: ['Backing up straight to the ropes or a wall', 'Pivoting on the wrong foot', 'Turning away from them'],
    drill: { text: 'Throw a 1-2, pivot out. Then jab, step off at 45°, 1-2. Circle the room.', rounds: 3, sec: 120 } },
  { id: 'teep', unit: 'Kicks', title: 'Teep (push kick)', diagram: 'none', kicksOnly: true,
    why: 'A jab with your leg: stops people walking into you and keeps them at range.',
    steps: ['Lift your knee up toward your chest.', 'Push your foot out straight, hitting with the ball of the foot.', 'Aim at the stomach or hips.', 'Lean back slightly for balance; hands stay up.', 'Bring the leg back and land in your stance.'],
    mistakes: ['Swinging the leg instead of pushing', 'Dropping your hands', 'Slow return: they can catch it'],
    drill: { text: 'Lead-leg teep, then rear-leg teep. Then teep when you imagine them stepping in.', rounds: 3, sec: 120 } },
  { id: 'roundhouse', unit: 'Kicks', title: 'Roundhouse kick', diagram: 'none', kicksOnly: true,
    why: 'The power kick. Hits with your shin to the leg, body or head.',
    steps: ['Step your lead foot out slightly to the side.', 'Turn on the ball of the lead foot so your heel points at them.', 'Swing the rear leg round, rotating the hip through. Hit with the shin.', 'Swing the same-side arm down for balance; other hand guards your face.', 'Return to your stance or follow through and turn back.'],
    mistakes: ['Not turning the standing foot (hurts the knee, no power)', 'Kicking with the foot instead of the shin', 'Hands dropping'],
    drill: { text: 'Slow kicks to the body to learn the turn, then low kicks. Add a 1-2 before each kick.', rounds: 3, sec: 120 } },
  { id: 'check', unit: 'Kicks', title: 'Checking a kick', diagram: 'none', kicksOnly: true,
    why: 'Stops low kicks from taking your legs.',
    steps: ['Lift your knee so your shin points out to the side.', 'Knee comes toward the elbow on the same side.', 'Meet their kick with your shin, not your thigh.', 'Put the foot back down in your stance.', 'Fire back straight away.'],
    mistakes: ['Lifting too late', 'Turning your knee in', 'Losing balance and falling back'],
    drill: { text: 'Partner throws slow low kicks; check, then answer with a 1-2.', rounds: 3, sec: 120 } },
  { id: 'clinch', unit: 'Clinch & ground', title: 'Clinch & tying up', diagram: 'none',
    why: 'When someone crashes in, controlling their arms and head stops the damage, and lets you reset.',
    steps: ['Get your head on the side of theirs, ear to ear: don’t let them push it.', 'Fight for inside position: your arms inside theirs.', 'Underhook: slide an arm under their armpit and hold their back.', 'If they’re stronger, don’t push straight back: turn them, or frame and step out.', 'Break with a frame on their collarbone or bicep and step out at an angle.'],
    mistakes: ['Head down looking at the floor', 'Hugging with arms outside theirs', 'Trying to out-muscle a bigger person'],
    drill: { text: 'With a partner, light: pummel for underhooks, then practise framing and stepping out.', rounds: 3, sec: 120 } },
  { id: 'sprawl', unit: 'Clinch & ground', title: 'Sprawl (stop a takedown)', diagram: 'none',
    why: 'Stops someone grabbing your legs and taking you down.',
    steps: ['As they shoot for your legs, throw your legs back and drop your hips to the floor.', 'Put your hands on their head or shoulders and push down.', 'Keep your weight on them, hips heavy.', 'Circle off to the side.', 'Get back to your feet and back into your stance.'],
    mistakes: ['Hips staying high (they can still lift you)', 'Reaching for them with your arms only', 'Staying on the ground'],
    drill: { text: 'Sprawl and get back up into stance. Then shadowbox and throw in a sprawl every few combos.', rounds: 3, sec: 60 } },
  { id: 'standup', unit: 'Clinch & ground', title: 'Getting up safely', diagram: 'none',
    why: 'If you go down, get back up without leaving your head open.',
    steps: ['Sit up with one hand posted on the floor behind you.', 'Plant the opposite foot flat.', 'Lift your hips using the posted hand and planted foot.', 'Swing the other leg back underneath you.', 'Stand into your stance with your free hand up guarding your face.'],
    mistakes: ['Standing straight up, face first', 'Putting your hands on the floor in front of you', 'Turning your back'],
    drill: { text: 'Practice getting up on each side. Slowly first, then smooth.', rounds: 2, sec: 60 } },
];

export const kicksSport = (s?: Sport) => s === 'Kickboxing' || s === 'Muay Thai' || s === 'MMA';
export const lessonsFor = (s?: Sport) => LESSONS.filter((l) => !l.kicksOnly || kicksSport(s));

// ── Who are you facing? ────────────────────────────────────────────────────
export type Facing = 'bigger' | 'taller' | 'shorter' | 'similar';
export const FACING_LABEL: Record<Facing, string> = { bigger: 'Bigger & stronger', taller: 'Taller / longer reach', shorter: 'Smaller / shorter', similar: 'About my size' };

export interface Strategy { facing: Facing; headline: string; summary: string; doThis: string[]; avoid: string[]; learnFirst: string[] }

export function strategy(f: Facing, sport?: Sport): Strategy {
  const k = kicksSport(sport);
  switch (f) {
    case 'bigger': return { facing: f, headline: 'Don’t fight their fight', summary: 'A bigger, stronger person wants to stand in front of you and use their weight. Don’t give them that. Use speed, angles and timing.',
      doThis: ['Keep moving and don’t stand in front of them', 'Hit and get out: a short combo, then step off at an angle', 'Use your jab to keep them from setting their feet', 'Go to the body: it slows big people down over time', 'Circle away from their power hand', 'Make them chase you: it tires them out faster than you'],
      avoid: ['Trading punch for punch in the middle', 'Pushing or wrestling strength against strength', 'Getting pinned on the ropes, the fence or a wall', 'Backing up in a straight line'],
      learnFirst: ['footwork', 'angles', 'jab', 'slip', 'clinch', 'sprawl'] };
    case 'taller': return { facing: f, headline: 'Get past the long arms', summary: 'Their range is the danger zone. Get through it fast, do your work up close, and don’t hang around at the end of their jab.',
      doThis: ['Close the distance behind your jab or a feint, never empty-handed', 'Move your head off the line as you step in: slip or roll', 'Work the body when you get close', 'Cut off the space: step to the side they want to go', ...(k ? ['Check their kicks and step in right after'] : [])],
      avoid: ['Standing at the end of their reach', 'Stepping in on a straight line with your head still', 'Waiting for them to come to you'],
      learnFirst: ['slip', 'footwork', 'hook', 'uppercut', 'combos'] };
    case 'shorter': return { facing: f, headline: 'Keep it long', summary: 'You have the reach. Make them pay every time they try to get close.',
      doThis: ['Keep them at the end of your jab', 'Use the cross to stop them coming forward', 'Step off at an angle when they rush, don’t back straight up', 'Uppercuts when they duck their head to come in', ...(k ? ['Teeps to stop their forward movement'] : [])],
      avoid: ['Letting them get close and trading on the inside', 'Reaching with lazy arm punches from too far away', 'Backing up to the ropes or a wall'],
      learnFirst: ['jab', 'cross', 'angles', 'uppercut', ...(k ? ['teep'] : [])] };
    default: return { facing: f, headline: 'Out-think them', summary: 'Similar size means skill, feints and pace decide it.',
      doThis: ['Take the centre and make them move', 'Feint to see how they react before you commit', 'Win the jab exchanges', 'Throw combinations off your defense: block or slip, then fire back'],
      avoid: ['Following them around: cut the angle off instead', 'Single punches and then stopping'],
      learnFirst: ['jab', 'block', 'combos', 'angles'] };
  }
}

/** Work out who they're facing from numbers. Weight decides "bigger" first, then reach/height. */
export function facingFrom(me: { heightCm?: number; weightKg?: number; reachCm?: number }, them: { heightCm?: number; weightKg?: number; reachCm?: number }): Facing | null {
  const w = me.weightKg && them.weightKg ? them.weightKg / me.weightKg : null;
  if (w !== null && w >= 1.1) return 'bigger';
  const mr = me.reachCm ?? me.heightCm, tr = them.reachCm ?? them.heightCm;
  if (mr && tr && tr - mr >= 5) return 'taller';
  if (mr && tr && mr - tr >= 5) return 'shorter';
  if (w !== null && w <= 0.9) return 'shorter';
  return w !== null || (mr && tr) ? 'similar' : null;
}

/** Tips for your own build. */
export function buildTips(me: { heightCm?: number; weightKg?: number }): { title: string; tips: string[] } | null {
  if (!me.heightCm || !me.weightKg) return null;
  const bmi = me.weightKg / (me.heightCm / 100) ** 2;
  const tall = me.heightCm >= 182, short = me.heightCm <= 170, heavy = bmi >= 28 || me.weightKg >= 95, light = me.weightKg <= 65;
  if (tall && !heavy) return { title: 'Tall and rangy', tips: ['Your jab and reach are your weapons: stay long', 'Work on footwork so smaller people can’t get inside', 'Learn the clinch for when they do'] };
  if (heavy) return { title: 'Bigger and heavier', tips: ['Use your weight: patient pressure and cutting off space', 'Conditioning matters most: big fighters tire fastest', 'Keep your hands up when you walk forward'] };
  if (short) return { title: 'Shorter and compact', tips: ['Head movement and getting inside are your game', 'Hooks, uppercuts and body shots up close', 'Strong legs: stay low and balanced'] };
  if (light) return { title: 'Lighter and quicker', tips: ['Speed and volume: more punches, in and out', 'Angles: never stay in front of a bigger person', 'Don’t try to win the strength battle'] };
  return { title: 'Middle of the pack', tips: ['You can box long or work inside: learn both', 'Fundamentals win: a sharp jab and tight defense', 'Adjust to whoever is in front of you'] };
}
