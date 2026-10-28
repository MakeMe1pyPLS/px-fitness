// Coach business logic (from PX-Fitness): tiers, clients, schedule, inquiries,
// payments. Everything here is on-device in the prototype; nothing is sent to
// the coach until accounts and a backend exist, and the UI says so.

import type { AppData, CoachData, CoachSession, CoachTier } from './types';
import { addDays, toDateKey, weekStart } from './dates';

export const DEFAULT_TIERS: CoachTier[] = [
  { id: 'tier1', perWeek: 1, pricePerSession: 80 },
  { id: 'tier2', perWeek: 2, pricePerSession: 60 },
  { id: 'tier3', perWeek: 3, pricePerSession: 50 },
];

export function emptyCoach(): CoachData {
  return {
    viewAsCoach: false,
    profile: { name: '', headline: '', bio: '', specialties: '', location: '' },
    hours: { Mon: '', Tue: '', Wed: '', Thu: '', Fri: '', Sat: '', Sun: '' },
    links: { calendly: '', meet: '', email: '' },
    tiers: DEFAULT_TIERS,
    tiersConfirmed: false,
    clients: [], sessions: [], inquiries: [], payments: [],
  };
}

/** Four-week cost for a tier (PX showed the label but no figure). */
export const fourWeek = (t: CoachTier) => t.perWeek * t.pricePerSession * 4;
export const tierLabel = (t: CoachTier) => `${t.perWeek} session${t.perWeek > 1 ? 's' : ''} a week`;

export function deskMetrics(c: CoachData, today = toDateKey(new Date())) {
  const ws = weekStart(today);
  const we = addDays(ws, 6);
  const month = today.slice(0, 7);
  return {
    activeClients: c.clients.filter((x) => x.status === 'active').length,
    openInquiries: c.inquiries.filter((x) => x.status === 'new' || x.status === 'contacted').length,
    newInquiries: c.inquiries.filter((x) => x.status === 'new').length,
    due: c.payments.filter((p) => p.status === 'due').reduce((n, p) => n + p.amount, 0),
    collectedMonth: c.payments.filter((p) => p.status === 'paid' && p.date.startsWith(month)).reduce((n, p) => n + p.amount, 0),
    sessionsThisWeek: c.sessions.filter((s) => s.date >= ws && s.date <= we && s.status !== 'cancelled').length,
  };
}

export function upcoming(c: CoachData, now = new Date()): CoachSession[] {
  const today = toDateKey(now);
  return c.sessions.filter((s) => s.status === 'scheduled' && s.date >= today).sort((a, b) => (a.date + a.time).localeCompare(b.date + b.time));
}

export function clientBalance(c: CoachData, clientId: string) {
  const ps = c.payments.filter((p) => p.clientId === clientId);
  return { paid: ps.filter((p) => p.status === 'paid').reduce((n, p) => n + p.amount, 0), due: ps.filter((p) => p.status === 'due').reduce((n, p) => n + p.amount, 0) };
}

/** A Google Calendar "add event" link. Needs no OAuth: the user confirms it in Google. */
export function calendarUrl(s: CoachSession, coachName: string, meet?: string) {
  const [y, m, d] = s.date.split('-');
  const [hh, mm] = (s.time || '09:00').split(':').map(Number);
  const start = new Date(Number(y), Number(m) - 1, Number(d), hh, mm);
  const end = new Date(start.getTime() + s.minutes * 60000);
  const fmt = (x: Date) => x.toISOString().replace(/[-:]/g, '').replace(/\.\d{3}/, '');
  const text = `${coachName || 'Coaching'} session: ${s.name}`;
  const details = s.kind === 'video' && meet ? `Video link: ${meet}` : 'In-person session';
  return `https://calendar.google.com/calendar/render?action=TEMPLATE&text=${encodeURIComponent(text)}&dates=${fmt(start)}/${fmt(end)}&details=${encodeURIComponent(details)}`;
}

export function isValidUrl(u: string) {
  if (!u) return true;
  try { const x = new URL(u); return x.protocol === 'https:' || x.protocol === 'http:'; } catch { return false; }
}

export function weekPlanText(name: string, week: Record<string, string>) {
  const days = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];
  return [`Week plan for ${name}`, ...days.filter((d) => week[d]?.trim()).map((d) => `${d}: ${week[d].trim()}`)].join('\n');
}

export function paymentsCsv(data: AppData) {
  const c = data.coach;
  const rows = [['date', 'payer', 'amount', 'status', 'method', 'note'], ...c.payments.map((p) => [p.date, p.payer, p.amount.toFixed(2), p.status, p.method, p.note ?? ''])];
  return rows.map((r) => r.map((x) => (/[",\n]/.test(String(x)) ? `"${String(x).replace(/"/g, '""')}"` : String(x))).join(',')).join('\n');
}
