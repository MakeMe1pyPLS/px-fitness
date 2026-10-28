// Conversational check-in.
//
// The bot asks a few short questions (tap a chip or type), reads free text for
// the same fields, recalls what the user said recently, and saves a normal
// Check-in record, so the existing insights engine keeps working unchanged.
//
// This is the SCRIPTED engine: no AI, no network, no cost. The AI engine
// (api/checkin.ts) is meant to replace only `parseFreeText` and the wording of
// replies; the safety checks below run on the device first, either way.

import type { AppData, Checkin } from './types';
import { addDays, daysBetween, toDateKey } from './dates';
import { nextTemplate, isTrainingDay, estimateMinutes, shortVersion } from './planner';

export type Patch = Partial<Omit<Checkin, 'date' | 'updatedAt'>>;
export type Safety = 'crisis' | 'pain' | 'ed' | null;

export interface Chip { label: string; patch: Patch; skip?: boolean }
export interface Question { id: StepId; text: string; chips: Chip[]; hint?: string }
export type StepId = 'mood' | 'energy' | 'sleep' | 'time' | 'body' | 'note';

// ── Safety (always on-device, always first) ────────────────────────────────
const CRISIS = /\b(suicid\w*|kill (my ?self|me)|end (it all|my life)|want to die|don'?t want to (live|be here)|self[- ]?harm|hurt(ing)? myself|cut(ting)? myself)\b/i;
const PAIN = /\b(pain|painful|injur\w*|sprain\w*|strain(ed)?|sharp|tweak(ed)?|pulled|swollen|numb\w*|chest (hurts|tight)|dizz\w*|faint\w*)\b|\bhurts?\b/i;
const ED = /\b(purg\w*|starv\w*|throw(ing)? up after|binge\w*|haven'?t eaten in|skip(ping)? meals to)\b/i;

export function detectSafety(text: string): Safety {
  if (CRISIS.test(text)) return 'crisis';
  if (ED.test(text)) return 'ed';
  if (PAIN.test(text)) return 'pain';
  return null;
}

export const SAFETY_REPLY: Record<Exclude<Safety, null>, string> = {
  crisis: 'I’m really glad you said something. I’m an app and can’t help with this the way a person can, but you don’t have to go through it alone. In the U.S. you can call or text 988 (Suicide & Crisis Lifeline) any time, or text HOME to 741741. If you’re in immediate danger, call 911. Training can wait.',
  ed: 'Thanks for telling me. Eating and exercise can get tangled up, and you deserve real support with that, not an app. A doctor or the National Alliance for Eating Disorders (allianceforeatingdisorders.com) can help. I won’t suggest calorie numbers today.',
  pain: 'Got it. Pain is different from normal soreness. Skip anything that hurts, and if it’s sharp, swollen, or still there in a few days, check with a doctor or physical therapist. I’ll keep today’s suggestion light.',
};

// ── Free-text reading ──────────────────────────────────────────────────────
const WORDS: [RegExp, Patch][] = [
  [/\b(exhausted|drained|wiped( out)?|dead tired|no energy|running on empty)\b/i, { energy: 1 }],
  [/\b(tired|sluggish|low energy|sleepy|drowsy)\b|\benergy\W+(is\W+)?(pretty\W+|kinda\W+|really\W+)?(low|down|bad|meh)\b/i, { energy: 2 }],
  [/\benergy\W+(is\W+)?(pretty\W+|really\W+)?(good|high|solid|decent)\b/i, { energy: 4 }],
  [/\b(energi[sz]ed|lots of energy|full of energy|pumped|charged|wired)\b/i, { energy: 5 }],
  [/\b(awful|terrible|miserable|really down|very low)\b/i, { mood: 1 }],
  [/\b(sad|down|meh|blah|not great|rough|bad day)\b/i, { mood: 2 }],
  [/\b(okay|ok|fine|alright|so-so)\b/i, { mood: 3 }],
  [/\b(good|happy|solid|decent)\b/i, { mood: 4 }],
  [/\b(great|amazing|awesome|fantastic|excellent)\b/i, { mood: 5 }],
  [/\b(very sore|super sore|really sore|so sore)\b/i, { soreness: 4 }],
  [/\b(sore|stiff|aching|achy|doms)\b/i, { soreness: 3 }],
  [/\b(not sore|no soreness)\b/i, { soreness: 1 }],
  [/\b(stressed|overwhelmed|anxious|swamped|slammed)\b/i, { stress: 4 }],
  [/\b(calm|relaxed|chill)\b/i, { stress: 1 }],
  [/\b(busy|no time|packed day|long shift|working late)\b/i, { availableMinutes: 20 }],
];

export function parseFreeText(text: string): Patch {
  const p: Patch = {};
  const t = text.toLowerCase();
  for (const [re, patch] of WORDS) if (re.test(t)) for (const [k, v] of Object.entries(patch)) if ((p as Record<string, number>)[k] === undefined) (p as Record<string, number>)[k] = v as number;
  // "not good", "not great" flip the mood guess.
  if (/\bnot (good|great|okay|ok)\b/.test(t)) p.mood = 2;
  const sleep = t.match(/(?:slept|sleep|got)\D{0,12}?(\d{1,2}(?:\.\d)?)\s*(?:h|hr|hrs|hours?)\b/) ?? t.match(/(\d{1,2}(?:\.\d)?)\s*(?:h|hr|hrs|hours?)\s*(?:of\s*)?sleep/);
  if (sleep) p.sleepHours = Math.max(0, Math.min(14, Number(sleep[1])));
  else if (/\b(barely slept|didn'?t sleep|no sleep|bad sleep|slept badly|slept poorly)\b/.test(t)) p.sleepHours = 5;
  else if (/\b(slept (great|well)|good sleep)\b/.test(t)) p.sleepHours = 8;
  const mins = t.match(/(\d{1,3})\s*(?:min|mins|minutes)\b/);
  if (mins) p.availableMinutes = Math.min(180, Number(mins[1]));
  else if (/\b(an|one) hour\b/.test(t)) p.availableMinutes = 60;
  else if (/\bhalf (an )?hour\b/.test(t)) p.availableMinutes = 30;
  return p;
}

// ── Questions ──────────────────────────────────────────────────────────────
export const QUESTIONS: Record<StepId, Question> = {
  mood: { id: 'mood', text: 'How are you feeling today?', hint: 'Choose what feels closest, or tell me in your own words.', chips: [{ label: 'Low', patch: { mood: 2 } }, { label: 'Okay', patch: { mood: 3 } }, { label: 'Good', patch: { mood: 4 } }, { label: 'Great', patch: { mood: 5 } }] },
  energy: { id: 'energy', text: 'And your energy?', chips: [{ label: 'Drained', patch: { energy: 1 } }, { label: 'Low', patch: { energy: 2 } }, { label: 'Steady', patch: { energy: 3 } }, { label: 'Good', patch: { energy: 4 } }, { label: 'Charged', patch: { energy: 5 } }] },
  sleep: { id: 'sleep', text: 'How much did you sleep last night?', chips: [{ label: '5 h or less', patch: { sleepHours: 5 } }, { label: '6 h', patch: { sleepHours: 6 } }, { label: '7 h', patch: { sleepHours: 7 } }, { label: '8 h', patch: { sleepHours: 8 } }, { label: '9 h+', patch: { sleepHours: 9 } }] },
  time: { id: 'time', text: 'How much time do you have for training today?', chips: [{ label: '10 min', patch: { availableMinutes: 10 } }, { label: '20 min', patch: { availableMinutes: 20 } }, { label: '30 min', patch: { availableMinutes: 30 } }, { label: '45 min', patch: { availableMinutes: 45 } }, { label: 'An hour+', patch: { availableMinutes: 60 } }] },
  body: { id: 'body', text: 'Anything going on with your body or your day?', chips: [{ label: 'All good', patch: { soreness: 1 } }, { label: 'A bit sore', patch: { soreness: 3 } }, { label: 'Very sore', patch: { soreness: 4 } }, { label: 'Stressed', patch: { stress: 4 } }] },
  note: { id: 'note', text: 'Anything else you want me to remember?', hint: 'Optional. A word or two is plenty.', chips: [{ label: 'No, that’s it', patch: {}, skip: true }] },
};

const ORDER: StepId[] = ['mood', 'energy', 'sleep', 'time', 'body', 'note'];
const FIELD: Partial<Record<StepId, keyof Patch>> = { mood: 'mood', energy: 'energy', sleep: 'sleepHours', time: 'availableMinutes' };

/** Next unanswered question; free text can answer several at once. */
export function nextStep(answers: Patch, asked: StepId[]): StepId | null {
  for (const s of ORDER) {
    if (asked.includes(s)) continue;
    const f = FIELD[s];
    if (f && answers[f] !== undefined) continue;
    if (s === 'body' && (answers.soreness !== undefined || answers.stress !== undefined)) continue;
    return s;
  }
  return null;
}

/** A line that references what the user told the bot recently, if anything. */
export function recall(data: AppData, today = toDateKey(new Date())): string | null {
  // Newest first: later entries win ties on the same date.
  const mem = [...data.checkinMemory].reverse().filter((m) => m.date < today && daysBetween(m.date, today) <= 3).sort((a, b) => b.date.localeCompare(a.date))[0];
  if (mem) return `Last time you mentioned “${mem.text.length > 70 ? mem.text.slice(0, 67) + '…' : mem.text}”. How’s that going?`;
  const prev = data.checkins.filter((c) => c.date < today && c.date >= addDays(today, -2)).sort((a, b) => b.date.localeCompare(a.date))[0];
  if (prev?.soreness && prev.soreness >= 4) return 'You were very sore last time. Hope it’s easing up.';
  if (prev?.energy !== undefined && prev.energy <= 2) return 'Energy was low last time. Let’s see where you are today.';
  if (prev?.sleepHours !== undefined && prev.sleepHours <= 5) return 'Sleep was short last time. Hope last night was better.';
  return null;
}

export function greeting(data: AppData, now = new Date()): string {
  const h = now.getHours();
  const hi = h < 12 ? 'Morning' : h < 18 ? 'Hey' : 'Evening';
  return `${hi}${data.profile?.name ? `, ${data.profile.name}` : ''}. Quick check-in, under a minute.`;
}

/** Plain-language read-back and today's suggestion, from the saved answers only. */
export function summarize(data: AppData, a: Patch, today = toDateKey(new Date())): { lines: string[]; suggestion: string; short: boolean } {
  const lines: string[] = [];
  const moodW = ['', 'rough', 'low', 'okay', 'good', 'great'];
  if (a.mood) lines.push(`feeling ${moodW[a.mood]}`);
  if (a.energy) lines.push(`energy ${a.energy}/5`);
  if (a.sleepHours !== undefined) lines.push(`${a.sleepHours} h sleep`);
  if (a.availableMinutes !== undefined) lines.push(`${a.availableMinutes} min free`);
  if (a.soreness && a.soreness >= 3) lines.push(a.soreness >= 4 ? 'very sore' : 'a bit sore');
  if (a.stress && a.stress >= 4) lines.push('stressed');
  const p = data.profile;
  const t = data.templates.length ? nextTemplate(data) : null;
  if (!p || !t) return { lines, suggestion: 'Thanks. That’s saved.', short: false };
  const full = estimateMinutes(t);
  const short = estimateMinutes({ exercises: shortVersion(t) });
  const training = isTrainingDay(p, today);
  const low = (a.energy !== undefined && a.energy <= 2) || (a.sleepHours !== undefined && a.sleepHours <= 5) || (a.soreness ?? 0) >= 4 || (a.availableMinutes !== undefined && a.availableMinutes < full);
  if (!training) return { lines, suggestion: 'It’s a rest day on your plan. A walk or some stretching is a nice option, and so is full rest.', short: false };
  if (a.availableMinutes !== undefined && a.availableMinutes < short) return { lines, suggestion: `Only ${a.availableMinutes} minutes? Even one exercise counts. Or take today off and log it; no catching up needed.`, short: true };
  if (low) return { lines, suggestion: `Today’s ${t.name} is about ${full} min. Given what you said, the short version (~${short} min) might fit better. It still counts.`, short: true };
  return { lines, suggestion: `You’re set for ${t.name}, about ${full} min. Have a good one.`, short: false };
}
