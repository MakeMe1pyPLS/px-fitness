// Transparent pattern detection.
//
// Every rule here:
//  - only uses data the user recorded in the app,
//  - refuses to speak until each comparison group has a minimum sample,
//  - reports the raw counts it used, so the UI can show its work,
//  - describes a co-occurrence, never a cause.
//
// Thresholds are intentionally conservative. A wrong insight costs more trust
// than a missing one.

import type { AppData, InsightRuleId, RecommendationRecord, SkipReason, TimeOfDay } from './types';
import { addDays, daysBetween, DAY_LONG, hourBlock, toDateKey, weekday } from './dates';
import { dayOutcome, planWindow } from './stats';
import { estimateMinutes } from './planner';

export const MIN_GROUP = 3; // smallest group we will compare
export const STRONG_GROUP = 6; // at this size we call it "consistent" instead of "early"
const LOOKBACK_DAYS = 56;

export interface Evidence {
  label: string;
  done: number;
  total: number;
}

export type InsightAction =
  | { kind: 'move_day'; label: string; from: number; to: number }
  | { kind: 'set_time'; label: string; time: TimeOfDay }
  | { kind: 'suggest_short_when_low'; label: string }
  | { kind: 'set_session_minutes'; label: string; minutes: number }
  | { kind: 'reduce_sets'; label: string }
  | { kind: 'acknowledge'; label: string };

export interface Insight {
  id: InsightRuleId;
  title: string;
  observation: string;
  evidence: Evidence[];
  strength: 'early' | 'consistent';
  why: string;
  action: InsightAction;
  caveat: string;
}

const CORRELATION_NOTE = 'This shows two things happening together in your log, not that one causes the other.';

export const RULE_LABELS: Record<InsightRuleId, string> = {
  duration_adherence: 'Session length and finishing',
  energy_training: 'Energy check-ins and training',
  sleep_training: 'Sleep and training',
  weekday_adherence: 'Which days work',
  skip_reason: 'Reasons for skipped days',
  time_of_day_finish: 'When you actually train',
};

function pct(done: number, total: number) {
  return total ? Math.round((done / total) * 100) : 0;
}

function strength(...groups: number[]): 'early' | 'consistent' {
  return Math.min(...groups) >= STRONG_GROUP ? 'consistent' : 'early';
}

function plannedDays(data: AppData, today: string) {
  const out: { date: string; done: boolean }[] = [];
  for (let i = LOOKBACK_DAYS; i >= 1; i--) {
    const d = addDays(today, -i);
    const o = dayOutcome(data, d, today);
    if (o === 'done' || o === 'missed' || o === 'skipped') out.push({ date: d, done: o === 'done' });
  }
  // Today counts only once it's resolved (trained or explicitly skipped).
  const t = dayOutcome(data, today, today);
  if (t === 'done' || t === 'skipped') out.push({ date: today, done: t === 'done' });
  return out;
}

function compareGroups(a: { done: boolean }[], b: { done: boolean }[], minDiff: number) {
  if (a.length < MIN_GROUP || b.length < MIN_GROUP) return null;
  const ra = a.filter((x) => x.done).length / a.length;
  const rb = b.filter((x) => x.done).length / b.length;
  if (Math.abs(ra - rb) < minDiff) return null;
  return { ra, rb };
}

// ── Rules ────────────────────────────────────────────────────────────────

function energyRule(data: AppData, today: string): Insight | null {
  const days = plannedDays(data, today);
  const byDate = new Map(data.checkins.map((c) => [c.date, c]));
  const low = days.filter((d) => (byDate.get(d.date)?.energy ?? 0) > 0 && byDate.get(d.date)!.energy! <= 2);
  const high = days.filter((d) => (byDate.get(d.date)?.energy ?? 0) >= 4);
  const r = compareGroups(low, high, 0.25);
  if (!r || r.ra >= r.rb) return null;
  const lowDone = low.filter((d) => d.done).length;
  const highDone = high.filter((d) => d.done).length;
  return {
    id: 'energy_training',
    title: 'Low-energy days are where workouts slip',
    observation: `On planned days when you rated energy 1–2, you trained ${pct(lowDone, low.length)}% of the time, compared with ${pct(highDone, high.length)}% when you rated it 4–5.`,
    evidence: [
      { label: 'Planned days, energy 1–2', done: lowDone, total: low.length },
      { label: 'Planned days, energy 4–5', done: highDone, total: high.length },
    ],
    strength: strength(low.length, high.length),
    why: 'A shorter, lighter session on those days keeps the habit going without asking for energy you don’t have. Short sessions still count fully toward your plan.',
    action: { kind: 'suggest_short_when_low', label: 'Lead with the short version when I check in low' },
    caveat: CORRELATION_NOTE,
  };
}

function sleepRule(data: AppData, today: string): Insight | null {
  const days = plannedDays(data, today);
  const byDate = new Map(data.checkins.map((c) => [c.date, c]));
  const short = days.filter((d) => { const h = byDate.get(d.date)?.sleepHours; return h !== undefined && h < 6; });
  const rested = days.filter((d) => { const h = byDate.get(d.date)?.sleepHours; return h !== undefined && h >= 7; });
  const r = compareGroups(short, rested, 0.25);
  if (!r || r.ra >= r.rb) return null;
  const a = short.filter((d) => d.done).length;
  const b = rested.filter((d) => d.done).length;
  return {
    id: 'sleep_training',
    title: 'Short-sleep days are harder to train on',
    observation: `After nights under 6 hours you trained on ${pct(a, short.length)}% of planned days, compared with ${pct(b, rested.length)}% after 7+ hours.`,
    evidence: [
      { label: 'Planned days after < 6 h sleep', done: a, total: short.length },
      { label: 'Planned days after 7 h+ sleep', done: b, total: rested.length },
    ],
    strength: strength(short.length, rested.length),
    why: 'On short-sleep days, a lighter session or a walk may be easier to start. If poor sleep is persistent, that’s worth raising with a doctor.',
    action: { kind: 'suggest_short_when_low', label: 'Lead with the short version after short nights' },
    caveat: CORRELATION_NOTE,
  };
}

function weekdayRule(data: AppData, today: string): Insight | null {
  const p = data.profile;
  if (!p || p.trainingDays.length < 2) return null;
  const days = plannedDays(data, today);
  const stats = p.trainingDays.map((wd) => {
    const g = days.filter((d) => weekday(d.date) === wd);
    return { wd, total: g.length, done: g.filter((d) => d.done).length };
  });
  const eligible = stats.filter((s) => s.total >= 4);
  if (eligible.length < 2) return null;
  const worst = [...eligible].sort((a, b) => a.done / a.total - b.done / b.total)[0];
  const others = eligible.filter((s) => s !== worst);
  const otherDone = others.reduce((n, s) => n + s.done, 0);
  const otherTotal = others.reduce((n, s) => n + s.total, 0);
  if (worst.done / worst.total > 0.5 || otherDone / otherTotal < 0.75) return null;

  // Suggest the rest day the user already trains on most, otherwise the
  // nearest free day after the problem day.
  const extras = new Map<number, number>();
  for (let i = LOOKBACK_DAYS; i >= 0; i--) {
    const d = addDays(today, -i);
    if (dayOutcome(data, d, today) === 'extra') extras.set(weekday(d), (extras.get(weekday(d)) ?? 0) + 1);
  }
  const free = [1, 2, 3, 4, 5, 6, 0].filter((d) => !p.trainingDays.includes(d));
  if (!free.length) return null;
  const to = [...free].sort((a, b) => (extras.get(b) ?? 0) - (extras.get(a) ?? 0) || ((a - worst.wd + 7) % 7) - ((b - worst.wd + 7) % 7))[0];

  return {
    id: 'weekday_adherence',
    title: `${DAY_LONG[worst.wd]}s rarely happen`,
    observation: `You trained on ${worst.done} of ${worst.total} planned ${DAY_LONG[worst.wd]}s, compared with ${otherDone} of ${otherTotal} on your other training days.`,
    evidence: [
      { label: `Planned ${DAY_LONG[worst.wd]}s`, done: worst.done, total: worst.total },
      { label: 'Other planned days', done: otherDone, total: otherTotal },
    ],
    strength: strength(worst.total, otherTotal),
    why: (extras.get(to) ?? 0) > 0
      ? `You’ve already trained on ${DAY_LONG[to]}s ${extras.get(to)} time(s) when it wasn’t planned, so it may fit your week better.`
      : `Moving it to ${DAY_LONG[to]} keeps the same number of sessions in your week.`,
    action: { kind: 'move_day', label: `Move ${DAY_LONG[worst.wd]} to ${DAY_LONG[to]}`, from: worst.wd, to },
    caveat: 'Based on your own log only. Your week may have changed recently, and that wouldn’t show up here.',
  };
}

const REASON_COPY: Record<SkipReason, { title: string; why: string; action: InsightAction }> = {
  time: {
    title: 'Time is the main thing getting in the way',
    why: 'When time is the limiter, a 20-minute version you actually do tends to beat a full session you skip.',
    action: { kind: 'set_session_minutes', label: 'Rebuild my sessions to fit 30 minutes', minutes: 30 },
  },
  energy: {
    title: 'Low energy is the most common reason for skipping',
    why: 'Shorter, lighter sessions are easier to start on those days, and they still count toward your plan.',
    action: { kind: 'suggest_short_when_low', label: 'Lead with the short version on low days' },
  },
  sore: {
    title: 'Soreness keeps coming up',
    why: 'Frequent soreness can mean the volume is ahead of your recovery. Fewer sets for a couple of weeks is a common fix. Pain that is sharp or lasts more than a few days is worth checking with a professional.',
    action: { kind: 'reduce_sets', label: 'Trim one set per exercise for now' },
  },
  motivation: {
    title: 'Motivation is the usual blocker',
    why: 'On those days, committing to just the first exercise is often enough to get started. You can stop there and it still counts as showing up.',
    action: { kind: 'acknowledge', label: 'Got it' },
  },
  unwell: {
    title: 'Several days off for feeling unwell',
    why: 'Resting when you’re unwell is the right call, and the app won’t treat these days as failures. If it keeps happening, it’s worth talking to a doctor.',
    action: { kind: 'acknowledge', label: 'Got it' },
  },
  other: {
    title: 'Several skipped days lately',
    why: 'Notes on skipped days help the app find a pattern. You can add one next time.',
    action: { kind: 'acknowledge', label: 'Got it' },
  },
};

const REASON_LABEL: Record<SkipReason, string> = {
  time: 'Not enough time', energy: 'Low energy', sore: 'Too sore', unwell: 'Unwell', motivation: 'Not motivated', other: 'Other',
};

function skipRule(data: AppData, today: string): Insight | null {
  const recent = data.skips.filter((s) => daysBetween(s.date, today) <= 30 && s.date <= today);
  if (recent.length < MIN_GROUP) return null;
  const counts = new Map<SkipReason, number>();
  recent.forEach((s) => counts.set(s.reason, (counts.get(s.reason) ?? 0) + 1));
  const [top, n] = [...counts.entries()].sort((a, b) => b[1] - a[1])[0];
  if (n / recent.length < 0.5) return null;
  let copy = REASON_COPY[top];
  if (top === 'time' && data.profile) {
    const minutes = Math.max(15, Math.min(30, data.profile.sessionMinutes - 15));
    copy = { ...copy, action: { kind: 'set_session_minutes', label: `Rebuild my sessions to fit ${minutes} minutes`, minutes } };
  }
  return {
    id: 'skip_reason',
    title: copy.title,
    observation: `${n} of your ${recent.length} skipped days in the last 30 days were marked “${REASON_LABEL[top]}”.`,
    evidence: [...counts.entries()].sort((a, b) => b[1] - a[1]).map(([r, c]) => ({ label: REASON_LABEL[r], done: c, total: recent.length })),
    strength: strength(recent.length),
    why: copy.why,
    action: copy.action,
    caveat: 'Based only on the reasons you picked when skipping.',
  };
}

function durationRule(data: AppData, today: string): Insight | null {
  // Compare planned days where the user's check-in said they had less time
  // than the planned session vs. days where they had enough.
  const p = data.profile;
  if (!p || !data.templates.length) return null;
  const planned = Math.max(...data.templates.map(estimateMinutes));
  const days = plannedDays(data, today);
  const byDate = new Map(data.checkins.map((c) => [c.date, c]));
  const tight = days.filter((d) => { const m = byDate.get(d.date)?.availableMinutes; return m !== undefined && m < planned; });
  const roomy = days.filter((d) => { const m = byDate.get(d.date)?.availableMinutes; return m !== undefined && m >= planned; });
  const r = compareGroups(tight, roomy, 0.25);
  if (!r || r.ra >= r.rb) return null;
  const shortDone = data.sessions.filter((s) => s.status === 'completed' && s.variant === 'short' && tight.some((d) => d.date === s.plannedFor)).length;
  const a = tight.filter((d) => d.done).length;
  const b = roomy.filter((d) => d.done).length;
  return {
    id: 'duration_adherence',
    title: 'Busy days are where sessions drop off',
    observation: `When your check-in said you had less than ~${planned} minutes, you trained on ${pct(a, tight.length)}% of planned days, compared with ${pct(b, roomy.length)}% when you had more time.${shortDone ? ` ${shortDone} of those were short versions.` : ''}`,
    evidence: [
      { label: `Planned days with < ${planned} min available`, done: a, total: tight.length },
      { label: `Planned days with ${planned}+ min`, done: b, total: roomy.length },
    ],
    strength: strength(tight.length, roomy.length),
    why: 'Your current sessions may simply be longer than most of your days allow. Shorter sessions you complete keep the habit going, and they may hold up better over time than long ones you skip.',
    action: (() => { const m = Math.max(15, Math.min(30, p.sessionMinutes - 10)); return { kind: 'set_session_minutes' as const, label: `Rebuild my sessions to fit ${m} minutes`, minutes: m }; })(),
    caveat: CORRELATION_NOTE,
  };
}

function timeOfDayRule(data: AppData, today: string): Insight | null {
  const p = data.profile;
  if (!p || p.preferredTime === 'varies') return null;
  const recent = data.sessions.filter((s) => s.status === 'completed' && daysBetween(s.plannedFor, today) <= LOOKBACK_DAYS);
  if (recent.length < STRONG_GROUP) return null;
  const counts = { morning: 0, midday: 0, evening: 0 };
  recent.forEach((s) => counts[hourBlock(s.startedAt)]++);
  const [block, n] = (Object.entries(counts) as [keyof typeof counts, number][]).sort((a, b) => b[1] - a[1])[0];
  if (block === p.preferredTime || n / recent.length < 0.7) return null;
  return {
    id: 'time_of_day_finish',
    title: `You mostly train in the ${block}`,
    observation: `${n} of your last ${recent.length} workouts started in the ${block}, though your plan is set to ${p.preferredTime}.`,
    evidence: (Object.entries(counts) as [string, number][]).map(([k, v]) => ({ label: `Started in the ${k}`, done: v, total: recent.length })),
    strength: strength(recent.length),
    why: 'Matching your plan to when you actually train makes the home screen and future reminders show up at the right time.',
    action: { kind: 'set_time', label: `Switch my plan to ${block}s`, time: block },
    caveat: 'This only counts when you pressed Start, not when you would prefer to train.',
  };
}

const RULES: Record<InsightRuleId, (d: AppData, t: string) => Insight | null> = {
  duration_adherence: durationRule,
  energy_training: energyRule,
  sleep_training: sleepRule,
  weekday_adherence: weekdayRule,
  skip_reason: skipRule,
  time_of_day_finish: timeOfDayRule,
};

/** Days a decision on a rule keeps it quiet. */
const QUIET_DAYS: Record<RecommendationRecord['status'], number> = { accepted: 28, dismissed: 21, not_accurate: 45 };

export function isQuiet(data: AppData, id: InsightRuleId, today: string): boolean {
  const last = data.recommendations.filter((r) => r.ruleId === id).sort((a, b) => b.createdAt.localeCompare(a.createdAt))[0];
  if (!last) return false;
  return daysBetween(toDateKey(new Date(last.createdAt)), today) < QUIET_DAYS[last.status];
}

export function computeInsights(data: AppData, today = toDateKey(new Date())): Insight[] {
  if (!data.profile) return [];
  return (Object.keys(RULES) as InsightRuleId[])
    .filter((id) => !data.settings.disabledRules.includes(id) && !isQuiet(data, id, today))
    .map((id) => RULES[id](data, today))
    .filter((x): x is Insight => !!x)
    .sort((a, b) => (a.strength === b.strength ? 0 : a.strength === 'consistent' ? -1 : 1));
}

/** What's still needed before insights can appear: shown on the empty state. */
export function insightReadiness(data: AppData, today = toDateKey(new Date())) {
  const days = plannedDays(data, today);
  const checkins = data.checkins.filter((c) => daysBetween(c.date, today) <= LOOKBACK_DAYS).length;
  return {
    plannedDays: days.length,
    plannedTarget: 8,
    checkins,
    checkinTarget: 8,
  };
}

/** Outcome of an accepted recommendation: plan completion 14 days before vs after. */
export function recommendationOutcome(data: AppData, rec: RecommendationRecord, today = toDateKey(new Date())) {
  const decided = toDateKey(new Date(rec.createdAt));
  const before = planWindow(data, addDays(decided, -14), addDays(decided, -1), today);
  const afterEnd = addDays(decided, 13) < today ? addDays(decided, 13) : today;
  const after = planWindow(data, decided, afterEnd, today);
  const daysObserved = Math.max(0, daysBetween(decided, afterEnd) + 1);
  return { before, after, daysObserved, ready: daysObserved >= 14 && after.planned >= 3 };
}
