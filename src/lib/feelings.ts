// Picks up how someone felt from their post-workout note: tired, sore, a body
// part that hurts, too easy, too hard, felt great, rough day. Plain keyword
// matching (no AI, nothing leaves the phone). "Not tired" / "no pain" are skipped.
// What it finds is saved on the session and shapes the next workouts.

import type { AppData, Session } from './types';
import { getExercise } from './exercises';

export type FeelKind = 'tired' | 'energized' | 'pain' | 'sore' | 'easy' | 'hard' | 'good' | 'low';
export type BodyPart = 'knee' | 'shoulder' | 'back' | 'wrist' | 'elbow' | 'hip' | 'ankle' | 'neck';
export interface FeelTag { kind: FeelKind; word: string; part?: BodyPart; start: number; end: number }
export interface SavedFeel { kind: FeelKind; word: string; part?: BodyPart }

export const FEEL_LABEL: Record<FeelKind, string> = { tired: 'Tired', energized: 'Energized', pain: 'Pain', sore: 'Sore', easy: 'Too easy', hard: 'Tough', good: 'Felt good', low: 'Rough day' };
export const PART_LABEL: Record<BodyPart, string> = { knee: 'knee', shoulder: 'shoulder', back: 'back', wrist: 'wrist', elbow: 'elbow', hip: 'hip', ankle: 'ankle', neck: 'neck' };

const LEX: [FeelKind, RegExp][] = [
  ['pain', /\b(pain(?:ful)?|hurt(?:s|ing)?|tweak(?:ed)?|injur(?:ed|y)|strain(?:ed)?|sharp|twinge|pinch(?:ed|ing)?|achy|aching|aches?)\b/gi],
  ['sore', /\b(sore(?:ness)?|stiff|doms|tight)\b/gi],
  ['tired', /\b(tired|exhausted|drained|wiped(?: out)?|gassed|fatigued?|sleepy|no energy|low energy|sluggish|dead)\b/gi],
  ['energized', /\b(energi[sz]ed|fresh|pumped|fired up|full of energy|rested)\b/gi],
  ['easy', /\b(too easy|easy|light|breeze|could(?:'ve| have)? done more|not enough)\b/gi],
  ['hard', /\b(too hard|hard|brutal|struggled|struggling|tough|couldn'?t finish|failed|heavy|killed me)\b/gi],
  ['good', /\b(great|strong|good|awesome|amazing|love(?:d)? it|proud|fun|felt good|solid|crushed it|smooth)\b/gi],
  ['low', /\b(stressed|stress|anxious|sad|frustrated|overwhelmed|unmotivated|rough day|bad day|annoyed)\b/gi],
];
const PARTS: [BodyPart, RegExp][] = [
  ['knee', /\bknees?\b/i], ['shoulder', /\bshoulders?\b/i], ['back', /\b(lower back|upper back|back)\b/i], ['wrist', /\bwrists?\b/i],
  ['elbow', /\belbows?\b/i], ['hip', /\b(hips?|groin)\b/i], ['ankle', /\b(ankles?|achilles)\b/i], ['neck', /\bneck\b/i],
];
const NEG = /\b(not|no|never|without|wasn'?t|isn'?t|didn'?t|don'?t|doesn'?t|zero)\s+(?:\w+\s+){0,2}$/i;

/** Find feeling words in a note, with their positions (for highlighting). */
export function extractFeelings(text: string): FeelTag[] {
  if (!text) return [];
  const found: FeelTag[] = [];
  for (const [kind, re] of LEX) {
    re.lastIndex = 0;
    let m: RegExpExecArray | null;
    while ((m = re.exec(text))) {
      const start = m.index, end = start + m[0].length;
      if (found.some((f) => start < f.end && end > f.start)) continue; // first kind wins ("too easy" before "easy")
      if (NEG.test(text.slice(Math.max(0, start - 30), start))) continue;
      // "back" as a body part, not "came back"; "light" as weight is still "easy"
      const tag: FeelTag = { kind, word: m[0], start, end };
      if (kind === 'pain' || kind === 'sore') {
        const win = text.slice(Math.max(0, start - 28), Math.min(text.length, end + 28));
        for (const [part, pr] of PARTS) if (pr.test(win)) { tag.part = part; break; }
      }
      found.push(tag);
    }
  }
  // "easy" next to "hard"/"good" words often describes a warm-up; keep it, but drop "good" when there's real pain
  return found.sort((a, b) => a.start - b.start);
}

/** What gets saved: one per kind (+ body part), in order. */
export function summarize(tags: { kind: FeelKind; word: string; part?: BodyPart }[]): SavedFeel[] {
  const seen = new Set<string>(); const out: SavedFeel[] = [];
  for (const t of tags) { const k = t.kind + (t.part ?? ''); if (seen.has(k)) continue; seen.add(k); out.push({ kind: t.kind, word: t.word.toLowerCase(), part: t.part }); }
  return out;
}

export const feelLabel = (f: SavedFeel) => f.part ? `${PART_LABEL[f.part][0].toUpperCase()}${PART_LABEL[f.part].slice(1)} ${f.kind === 'pain' ? 'pain' : 'sore'}` : FEEL_LABEL[f.kind];

// Exercises that load each body part, so we can flag them next time.
const PART_EXERCISES: Record<BodyPart, RegExp> = {
  knee: /squat|lunge|leg-press|leg-curl|pistol|jump|sprawl|rope|run/,
  shoulder: /press|ohp|bench|dip|pike|push-up|pull-up|pulldown|handstand|heavy-bag|shadow/,
  back: /deadlift|rdl|row|swing|good-morning|carry|squat/,
  wrist: /push-up|plank|bench|press|dip|handstand|mountain|curl/,
  elbow: /curl|dip|pull-up|chin|press|push-up|heavy-bag/,
  hip: /squat|lunge|deadlift|rdl|bridge|swing|split|hip|kick/,
  ankle: /jump|rope|run|lunge|squat|sprawl|walk/,
  neck: /shrug|ohp|press|bridge|sprawl/,
};
export const exerciseLoads = (exerciseId: string, part: BodyPart) => PART_EXERCISES[part].test(exerciseId);

export interface NoteAdvice {
  from: { name: string; date: string };
  said: SavedFeel[];
  suggestShort: boolean;
  cautionParts: BodyPart[];
  pushHarder: boolean;
  holdSteady: boolean;
  headline: string;
  body: string;
}

/** Advice for the next workout from the most recent note (last 4 days). */
export function noteAdvice(data: AppData, today: string): NoteAdvice | null {
  const last = [...data.sessions].filter((s) => s.status === 'completed' && s.feelings?.length).sort((a, b) => (b.endedAt ?? '').localeCompare(a.endedAt ?? ''))[0];
  if (!last) return null;
  const day = (last.endedAt ?? last.startedAt).slice(0, 10);
  const age = Math.round((Date.parse(today + 'T12:00') - Date.parse(day + 'T12:00')) / 86400000);
  if (age > 4 || age < 0) return null;
  const f = last.feelings!;
  const has = (k: FeelKind) => f.some((x) => x.kind === k);
  const parts = [...new Set(f.filter((x) => (x.kind === 'pain' || x.kind === 'sore') && x.part).map((x) => x.part!))];
  const painParts = [...new Set(f.filter((x) => x.kind === 'pain' && x.part).map((x) => x.part!))];
  const suggestShort = has('tired') || has('low') || (has('pain') && !painParts.length);
  const pushHarder = has('easy') && !has('pain') && !has('tired');
  const holdSteady = has('hard') && !pushHarder;
  const when = age === 0 ? 'today' : age === 1 ? 'yesterday' : `${age} days ago`;
  let headline = '', body = '';
  if (painParts.length) { headline = `Go easy on your ${painParts.map((p) => PART_LABEL[p]).join(' and ')}`; body = `After ${last.name} ${when} you mentioned ${painParts.map((p) => PART_LABEL[p]).join(' and ')} pain. Moves that load it are marked: go lighter or swap them. If the pain is sharp or keeps coming back, get it checked.`; }
  else if (has('pain')) { headline = 'Take it lighter today'; body = `You mentioned pain after ${last.name} ${when}. The short version keeps it gentle. If it's sharp or doesn't settle, get it checked.`; }
  else if (has('tired') || has('low')) { headline = has('low') ? 'Keep it simple today' : 'Ease back in'; body = `After ${last.name} ${when} you said you felt ${f.filter((x) => x.kind === 'tired' || x.kind === 'low').map((x) => x.word).join(', ')}. The short version still counts.`; }
  else if (parts.length) { headline = `Warm up that ${parts.map((p) => PART_LABEL[p]).join(' and ')}`; body = `You were sore after ${last.name} ${when}. Take an extra warm-up set on the marked moves.`; }
  else if (pushHarder) { headline = 'Time to push a little'; body = `You said ${last.name} felt ${f.find((x) => x.kind === 'easy')!.word}. Add a rep or a little weight on each move today.`; }
  else if (holdSteady) { headline = 'Same weights, cleaner reps'; body = `${last.name} felt ${f.find((x) => x.kind === 'hard')!.word}. Hold the same weights today and own every rep.`; }
  else if (has('good') || has('energized')) { headline = 'Keep that going'; body = `You felt ${f.filter((x) => x.kind === 'good' || x.kind === 'energized').map((x) => x.word).join(', ')} after ${last.name}. Same plan, same energy.`; }
  else return null;
  return { from: { name: last.name, date: day }, said: f, suggestShort, cautionParts: parts, pushHarder, holdSteady, headline, body };
}

/** Counts over the last N days, for Progress. */
export function feelingTrends(sessions: Session[], today: string, days = 30): { label: string; count: number; kind: FeelKind }[] {
  const from = Date.parse(today + 'T12:00') - days * 86400000;
  const counts = new Map<string, { label: string; count: number; kind: FeelKind }>();
  for (const s of sessions) {
    if (s.status !== 'completed' || !s.feelings?.length || Date.parse((s.endedAt ?? s.startedAt)) < from) continue;
    for (const f of s.feelings) { const l = feelLabel(f); const c = counts.get(l) ?? { label: l, count: 0, kind: f.kind }; c.count++; counts.set(l, c); }
  }
  return [...counts.values()].sort((a, b) => b.count - a.count);
}

export const exerciseName = (id: string, data: AppData) => getExercise(id, data.customExercises)?.name ?? id;
