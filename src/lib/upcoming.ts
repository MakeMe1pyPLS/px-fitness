// "What's coming up": fights/competitions, travel and busy stretches the person tells the app
// about, and how today's plan should flex around them. Stored on the device only (and shared
// with a linked coach only if the person shares check-ins).
import type { AppData } from './types';
import { addDays, daysBetween, weekday } from './dates';

export type UpcomingKind = 'competition' | 'travel' | 'busy' | 'other';
export interface UpcomingEvent { id: string; kind: UpcomingKind; label: string; date: string; endDate?: string; createdAt: string }

export const KIND_LABEL: Record<UpcomingKind, string> = { competition: 'Fight or competition', travel: 'Travel', busy: 'Busy stretch', other: 'Something else' };

export interface Advice { event: UpcomingEvent; title: string; body: string; suggestShort: boolean; bodyweightOnly: boolean; rest: boolean }

const end = (e: UpcomingEvent) => e.endDate && e.endDate >= e.date ? e.endDate : e.date;

/** Events that haven't finished yet, soonest first. */
export function activeUpcoming(data: AppData, today: string): UpcomingEvent[] {
  return (data.upcoming ?? []).filter((e) => end(e) >= today).sort((a, b) => a.date.localeCompare(b.date));
}

/** The one thing that should change today's plan, if any. */
export function upcomingAdvice(data: AppData, today: string): Advice | null {
  const list: Advice[] = [];
  for (const e of activeUpcoming(data, today)) {
    const until = daysBetween(today, e.date);
    const during = today >= e.date && today <= end(e);
    const name = e.label || KIND_LABEL[e.kind];
    if (e.kind === 'competition') {
      if (until === 0) list.push({ event: e, title: `${name} today`, body: 'No workout today. Warm up well, eat and drink like you planned, and go get it.', suggestShort: false, bodyweightOnly: false, rest: true });
      else if (until > 0 && until <= 2) list.push({ event: e, title: `${name} in ${until} day${until > 1 ? 's' : ''}`, body: 'Taper time: keep it short and light so you show up fresh. No new exercises, no going to failure.', suggestShort: true, bodyweightOnly: false, rest: false });
      else if (until > 2 && until <= 7) list.push({ event: e, title: `${name} in ${until} days`, body: until <= 4 ? 'Last harder session should be about now. Ease off over the next couple of days.' : 'Good week to sharpen up. Plan to ease off 2 days out.', suggestShort: false, bodyweightOnly: false, rest: false });
    } else if (e.kind === 'travel') {
      if (during) list.push({ event: e, title: `Travelling${e.label ? `: ${e.label}` : ''}`, body: 'Short bodyweight session is plenty. Push-ups, squats, lunges and planks work in any room.', suggestShort: true, bodyweightOnly: true, rest: false });
      else if (until === 1) list.push({ event: e, title: `${name} tomorrow`, body: 'Train today if you can, and pack shoes for a quick bodyweight session.', suggestShort: false, bodyweightOnly: false, rest: false });
    } else if (e.kind === 'busy') {
      if (during) list.push({ event: e, title: e.label || 'Busy stretch', body: 'The short version counts. Showing up for 15 minutes keeps the habit going.', suggestShort: true, bodyweightOnly: false, rest: false });
    } else if (during || until === 1) {
      list.push({ event: e, title: until === 1 ? `${name} tomorrow` : name, body: 'Plan around it. The short version is always an option.', suggestShort: false, bodyweightOnly: false, rest: false });
    }
  }
  const rank = (a: Advice) => (a.rest ? 0 : a.suggestShort ? 1 : 2);
  return list.sort((a, b) => rank(a) - rank(b) || a.event.date.localeCompare(b.event.date))[0] ?? null;
}

const WEEKDAYS = ['sunday', 'monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday'];

/** Pull a date out of everyday phrases. Returns null when there isn't one. */
export function parseWhen(text: string, today: string): string | null {
  const t = text.toLowerCase();
  if (/\btoday|tonight\b/.test(t)) return today;
  if (/\btomorrow\b/.test(t)) return addDays(today, 1);
  const inN = /\bin (\d{1,2}) days?\b/.exec(t);
  if (inN) return addDays(today, Math.min(60, Number(inN[1])));
  if (/\bthis weekend\b/.test(t)) { const w = weekday(today); return addDays(today, w === 6 ? 0 : w === 0 ? 0 : 6 - w); }
  if (/\bnext week\b/.test(t)) return addDays(today, 7);
  for (let i = 0; i < 7; i++) {
    if (new RegExp(`\\b${WEEKDAYS[i]}s?\\b`).test(t)) {
      let diff = (i - weekday(today) + 7) % 7;
      if (diff === 0) diff = 7;
      if (new RegExp(`\\bnext ${WEEKDAYS[i]}`).test(t) && diff < 7) diff += 7;
      return addDays(today, diff);
    }
  }
  const md = /\b(\d{1,2})\/(\d{1,2})\b/.exec(t);
  if (md) {
    const [y] = today.split('-').map(Number);
    const m = Number(md[1]), d = Number(md[2]);
    if (m >= 1 && m <= 12 && d >= 1 && d <= 31) {
      let key = `${y}-${String(m).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
      if (key < today) key = `${y + 1}-${key.slice(5)}`;
      return key;
    }
  }
  return null;
}

/** Recognise what kind of thing is coming up from free text. */
export function parseKind(text: string): UpcomingKind | null {
  const t = text.toLowerCase();
  if (/\b(fight|bout|competition|comp|meet|tournament|match|race|game|tryouts?|weigh[- ]?in|marathon|5k|10k)\b/.test(t)) return 'competition';
  if (/\b(travel|travell?ing|trip|flight|flying|vacation|holiday|out of town|road trip)\b/.test(t)) return 'travel';
  if (/\b(busy|exams?|finals|deadline|double shifts?|overtime|long shifts?|moving|work trip)\b/.test(t)) return 'busy';
  return null;
}

export function parseUpcoming(text: string, today: string): { kind: UpcomingKind | null; date: string | null; label: string } {
  const kind = parseKind(text);
  const date = parseWhen(text, today);
  // Keep what it is, drop the "when" words: "Fight on Saturday" → "Fight".
  const label = text
    .replace(/\b(on |this |next )?(sunday|monday|tuesday|wednesday|thursday|friday|saturday)s?\b/gi, '')
    .replace(/\b(today|tonight|tomorrow|this weekend|next week|in \d{1,2} days?)\b/gi, '')
    .replace(/\b(on )?\d{1,2}\/\d{1,2}\b/g, '')
    .replace(/\b(i have|i've got|got|have) (a |an )?/gi, '')
    .replace(/\s+/g, ' ').replace(/[\s,.;:-]+$/, '').trim();
  return { kind, date, label: label ? (label.charAt(0).toUpperCase() + label.slice(1)).slice(0, 60) : '' };
}
