// Combat sports: fighter profile, size/stance matchup plans, fight-camp phases
// and round-timer presets. The plans are the general, widely taught principles
// for fighting a taller/shorter or same/opposite-stance opponent. They're a
// starting point to talk through with a coach, not a substitute for one.

export const SPORTS = ['Boxing', 'Kickboxing', 'Muay Thai', 'MMA', 'Wrestling', 'Jiu-jitsu'] as const;
export type Sport = (typeof SPORTS)[number];
export type Stance = 'orthodox' | 'southpaw' | 'switch';
export const STANCE_LABEL: Record<Stance, string> = { orthodox: 'Orthodox (left foot forward)', southpaw: 'Southpaw (right foot forward)', switch: 'Switch / both' };

export interface Fighter {
  sport: Sport;
  stance?: Stance;
  heightCm?: number;
  reachCm?: number;
  weightKg?: number;
  fightDate?: string; // YYYY-MM-DD
  fightName?: string;
  upcomingId?: string; // the matching "coming up" event, so the plan tapers
}
export interface Opponent { heightCm?: number; reachCm?: number; stance?: Stance }

type Group = 'striking' | 'mma' | 'grappling';
export const groupOf = (s: Sport): Group => (s === 'MMA' ? 'mma' : s === 'Wrestling' || s === 'Jiu-jitsu' ? 'grappling' : 'striking');
const kicks = (s: Sport) => s === 'Kickboxing' || s === 'Muay Thai' || s === 'MMA';

export type Size = 'taller' | 'shorter' | 'even';
export interface Matchup {
  size: Size;
  heightDiffCm: number | null;
  reachDiffCm: number | null;
  reachEstimated: boolean;
  headline: string;
  summary: string;
  doThis: string[];
  avoid: string[];
  stance: { title: string; tips: string[] } | null;
  cues: string[]; // short calls for the round timer
}

const IN = 2.54;
export const cmToIn = (cm: number) => cm / IN;
export const fmtDiff = (cm: number, imperial: boolean) => {
  const v = imperial ? Math.round(Math.abs(cm) / IN) : Math.round(Math.abs(cm));
  return `${v} ${imperial ? 'in' : 'cm'}`;
};
export const fmtHeight = (cm: number, imperial: boolean) => {
  if (!imperial) return `${Math.round(cm)} cm`;
  const t = Math.round(cm / IN);
  return `${Math.floor(t / 12)}′${t % 12}″`;
};

/** Reach is usually close to height, so use height when reach isn't known. */
const reachOf = (f: { heightCm?: number; reachCm?: number }) => f.reachCm ?? f.heightCm;

export function matchup(me: Fighter, opp: Opponent): Matchup {
  const g = groupOf(me.sport);
  const hd = me.heightCm && opp.heightCm ? me.heightCm - opp.heightCm : null;
  const myR = reachOf(me), opR = reachOf(opp);
  const rd = myR && opR ? myR - opR : null;
  const reachEstimated = !(me.reachCm && opp.reachCm);
  // Reach decides range more than height does; fall back to height.
  const basis = rd ?? hd ?? 0;
  const size: Size = basis >= 5 ? 'taller' : basis <= -5 ? 'shorter' : 'even';
  const k = kicks(me.sport);

  let headline = '', summary = '', doThis: string[] = [], avoid: string[] = [], cues: string[] = [];

  if (g === 'grappling') {
    if (size === 'taller') {
      headline = 'Use your length';
      summary = 'Longer limbs help you hold distance with frames and attack from range.';
      doThis = ['Frame on the head and shoulders to stop them getting under you', 'Keep your hips back and sprawl hard on their level changes', me.sport === 'Jiu-jitsu' ? 'Play guards that use long legs: closed guard, triangles, distance guards' : 'Work from a front headlock when they shoot', 'Use long arms for body locks and wide grips they can’t break'];
      avoid = ['Standing tall with your hips square: it gives up your legs', 'Letting them win inside position under your arms'];
      cues = ['Frames up', 'Hips back', 'Sprawl', 'Head control'];
    } else if (size === 'shorter') {
      headline = 'Get under them';
      summary = 'A lower centre of gravity is your edge. Win inside position and stay low.';
      doThis = ['Change levels: your shots come from under their arms and hips', 'Fight for underhooks and inside ties', 'Keep your head tight to their body so they can’t frame', 'Stay heavy on top: chest-to-chest pressure takes their length away'];
      avoid = ['Reaching for grips at arm’s length: that’s their range', 'Giving them space to extend their legs or frames'];
      cues = ['Level change', 'Underhooks', 'Head in', 'Stay heavy'];
    } else {
      headline = 'Win the hand fight';
      summary = 'Even size: grips, position and pace decide it.';
      doThis = ['Win the first grip or tie in every exchange', 'Chain attacks: their reaction to one sets up the next', 'Set a pace they have to match', 'Finish in good position before chasing the next move'];
      avoid = ['Waiting: let them grip first and you’re playing their game', 'Burning out early on low-percentage attacks'];
      cues = ['First grip', 'Chain it', 'Pace', 'Position first'];
    }
  } else if (size === 'taller') {
    headline = 'Keep it long';
    summary = 'You have the range. Make them pay every time they step into it.';
    doThis = ['Keep them at the end of your jab and work behind it', 'Use the rear straight to stop them when they come forward', 'Step back at an angle or pivot off when they rush, instead of straight back', 'Uppercuts when they duck their head to come in'];
    if (k) doThis.push('Teeps and long kicks to stop their forward movement');
    if (me.sport === 'Muay Thai') doThis.push('Knees when they close the distance');
    if (g === 'mma') doThis.push('Sprawl and keep your hips back when they change levels');
    avoid = ['Leaning in to trade on the inside: that’s their range', 'Reaching with arm punches when you’re out of range', 'Backing up in a straight line to the ropes or cage'];
    cues = ['Jab', 'Keep range', 'Angle out', k ? 'Teep' : 'Straight down the middle'];
  } else if (size === 'shorter') {
    headline = 'Close the distance';
    summary = 'Their range is your danger zone. Get through it fast and do your work up close.';
    doThis = ['Enter behind a jab or feint, never empty-handed', 'Move your head off the centre line as you step in: slip, roll, change levels', 'Work the body to bring their hands down', 'Cut off the ring: step to the side they want to escape to'];
    if (k) doThis.push('Check their kicks, then step in behind them to counter');
    if (g === 'mma') doThis.push('Mix strikes with takedown threats so they can’t just stay long');
    avoid = ['Standing at mid-range where they can hit you and you can’t reach', 'Coming in on a straight line with your head still', 'Waiting for them to come to you'];
    cues = ['Head moves', 'Cut it off', 'Body', 'Stay close'];
  } else {
    headline = 'Win the centre';
    summary = 'Similar size: position, feints and pace will decide it.';
    doThis = ['Control the centre and make them move', 'Feint to read their reactions before you commit', 'Win the jab exchanges', 'Throw combinations off your defence: block or slip, then fire back'];
    if (k) doThis.push('Kick the lead leg to slow them down');
    avoid = ['Following them around: cut angles instead', 'Throwing single shots and stopping'];
    cues = ['Centre', 'Feint', 'Jab', 'Counter'];
  }

  let stance: Matchup['stance'] = null;
  if (me.stance && opp.stance && me.stance !== 'switch' && opp.stance !== 'switch' && g !== 'grappling') {
    if (me.stance !== opp.stance) {
      stance = { title: 'Open stance (orthodox vs southpaw)', tips: ['Fight for outside lead-foot position: keep your lead foot outside theirs', 'Your rear straight lines up straight down the middle', 'Circle away from their rear (power) hand', k ? 'Rear kick to their open side: the body is right there' : 'Lead hook is a strong counter when they step in'] };
      cues.push('Outside foot');
    } else {
      stance = { title: 'Closed stance (same stance)', tips: ['The jab is your main tool: lead hand to lead hand', 'Circle away from their rear (power) hand', 'Lead hook to the head and body are open'] };
    }
  }
  return { size, heightDiffCm: hd, reachDiffCm: rd, reachEstimated, headline, summary, doThis, avoid, stance, cues };
}

// ── Fight camp ──────────────────────────────────────────────────────────────
export interface CampPhase { id: 'base' | 'build' | 'sharpen' | 'fight-week' | 'fight-day' | 'done'; name: string; days: number; focus: string; tips: string[] }
export function campPhase(fightDate: string, today: string): CampPhase {
  const days = Math.round((Date.parse(fightDate + 'T00:00:00') - Date.parse(today + 'T00:00:00')) / 86400000);
  if (days < 0) return { id: 'done', name: 'Fight done', days, focus: 'Recover, then set the next goal.', tips: ['Take a few easy days', 'Write down what worked and what to fix'] };
  if (days === 0) return { id: 'fight-day', name: 'Fight day', days, focus: 'No training. Eat familiar food, stay calm, warm up properly.', tips: ['Familiar meals only', 'Warm up until you break a light sweat', 'Trust the work you’ve done'] };
  if (days <= 7) return { id: 'fight-week', name: 'Fight week', days, focus: 'Taper: short, sharp sessions. Freshness over fitness.', tips: ['Light pad work and shadow boxing', 'Cut volume, keep a little speed', 'Sleep and food come first'] };
  if (days <= 28) return { id: 'sharpen', name: 'Sharpen', days, focus: 'Fight-specific: sparring, game plan, rounds at fight pace.', tips: ['Drill the game plan for this opponent', 'Rounds at fight length and pace', 'Strength work: keep it, but less of it'] };
  if (days <= 56) return { id: 'build', name: 'Build', days, focus: 'Raise conditioning and strength. Technique under fatigue.', tips: ['Hard conditioning 2–3× a week', 'Technique drills when tired', 'Strength 2× a week'] };
  return { id: 'base', name: 'Base', days, focus: 'Build your engine and fix technique before camp gets specific.', tips: ['Steady cardio and skill work', 'Full-body strength', 'Fix one technical habit at a time'] };
}

// ── Round timer ─────────────────────────────────────────────────────────────
export interface RoundPreset { rounds: number; workSec: number; restSec: number }
export function presetFor(s: Sport): RoundPreset {
  switch (s) {
    case 'MMA': return { rounds: 3, workSec: 300, restSec: 60 };
    case 'Wrestling': return { rounds: 3, workSec: 120, restSec: 30 };
    case 'Jiu-jitsu': return { rounds: 5, workSec: 300, restSec: 60 };
    default: return { rounds: 3, workSec: 180, restSec: 60 };
  }
}
export const fmtClock = (s: number) => `${Math.floor(Math.max(0, s) / 60)}:${String(Math.max(0, s) % 60).padStart(2, '0')}`;
