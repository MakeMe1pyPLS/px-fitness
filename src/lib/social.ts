// Friends: private friend codes, requests, opt-in sharing, shared photos, cheers.
//
// What can be shared (each off by default, each switched on by its owner):
//   * routine  — plan names and exercises (no weights)
//   * workouts — last 12 completed workouts: name, date, minutes, exercise names, sets done
//   * photos   — one at a time, chosen by the owner, uploaded only when shared
// Never shared: check-ins, mood, sleep, notes, effort ratings, meals, coaching.
// The database enforces "friends only" (see supabase/migrations/0002_friends.sql).

import type { AppData, ProgressPhoto } from './types';
import { getExercise } from './exercises';
import { addDays, toDateKey } from './dates';
import { skillSummary } from './skills';
import { activeUpcoming } from './upcoming';
import { CloudError, type Cloud } from './cloud';
import type { Store } from './store';

export interface SharedRoutine { name: string; focus: string; exercises: { name: string; sets: number; target: string }[] }
export interface SharedWorkout { id: string; name: string; date: string; minutes: number | null; short: boolean; exercises: string[]; sets: number }
export const COMBAT_SPORTS = ['Boxing', 'Kickboxing', 'Muay Thai', 'MMA', 'Wrestling', 'Jiu-jitsu'] as const;
export interface CombatInfo { sport: string; heightCm?: number; weightKg?: number; fightDate?: string; fightName?: string }
export interface SharedSkill { id: string; ladder: string; level: number; of: number; name: string; date: string }
export interface SharedSnapshot { routine?: SharedRoutine[]; recent?: SharedWorkout[]; combat?: CombatInfo; skills?: SharedSkill[] }

export interface SocialProfile { user_id: string; display_name: string; friend_code?: string; share_routine: boolean; share_workouts: boolean; share_combat?: boolean; is_coach?: boolean; shared: SharedSnapshot; updated_at: string }
export interface SharedCheckin { date: string; mood?: number; energy?: number; stress?: number; sleepHours?: number; soreness?: number }
export interface CoachShare { recent?: SharedWorkout[]; checkins?: SharedCheckin[]; skills?: SharedSkill[]; upcoming?: { kind: string; label: string; date: string; endDate?: string }[] }
export interface CoachLink { other_id: string; display_name: string | null; i_am: 'coach' | 'client'; status: 'pending' | 'accepted'; share_checkins: boolean; client_shared: CoachShare; created_at: string }
export interface CoachNote { id: string; coach_id: string; client_id: string; body: string; created_at: string }
export interface TrainInvite { id: string; from_user: string; to_user: string; day: string; at_time: string | null; workout: string; note: string | null; status: 'pending' | 'accepted' | 'declined' | 'cancelled'; created_at: string }
export interface Challenge { id: string; owner: string; name: string; goal: number; starts: string; ends: string; created_at: string }
export interface ChallengeMember { challenge_id: string; user_id: string; status: 'invited' | 'joined'; progress: number }
export interface CoachEvent { id: string; coach_id: string; coach_name: string | null; title: string; starts_at: string; minutes: number; location: string; details: string | null; capacity: number | null; cancelled: boolean; going: number; me_going: boolean }
export interface CoachOffer { id: string; coach_id: string; name: string; price_cents: number; sessions: number; minutes: number | null; active: boolean }
export interface CoachingPayment { id: string; coach_id: string; client_id: string; offer_name: string; amount_cents: number; currency: string; status: 'paid' | 'refunded'; note: string | null; created_at: string }

export const money = (cents: number) => `$${(cents / 100).toFixed(cents % 100 ? 2 : 0)}`;

/** Events happening on a given local day. */
export function eventsOn(events: CoachEvent[], day: string): CoachEvent[] {
  return events.filter((e) => !e.cancelled && toDateKey(new Date(e.starts_at)) === day);
}

const EVENT_ERRORS: Record<string, string> = { full: 'That session is full.', cancelled: 'That session was cancelled.', past: 'That session already happened.', not_found: 'That session doesn’t exist anymore.', signed_out: 'Sign in first.' };
export interface Connection { user_id: string; display_name: string | null; status: 'pending' | 'accepted'; incoming: boolean; created_at: string }
export interface SharedPhoto { id: string; user_id: string; local_id: string; path: string; taken_on: string; caption: string | null; created_at: string }
export interface Cheer { from_user: string; to_user: string; target: string; created_at: string }

export type FeedItem =
  | { kind: 'workout'; key: string; user: string; name: string; date: string; workout: SharedWorkout }
  | { kind: 'photo'; key: string; user: string; name: string; date: string; photo: SharedPhoto }
  | { kind: 'fight'; key: string; user: string; name: string; date: string; combat: CombatInfo }
  | { kind: 'level'; key: string; user: string; name: string; date: string; skill: SharedSkill };

export interface SocialState {
  loaded: boolean;
  loading: boolean;
  error: string | null;
  me: SocialProfile | null;
  connections: Connection[];
  friends: Record<string, SocialProfile>;
  photos: SharedPhoto[]; // mine and friends'
  cheers: Cheer[];
  coachLinks: CoachLink[];
  notes: CoachNote[];
  invites: TrainInvite[];
  challenges: Challenge[];
  members: ChallengeMember[];
  people: Record<string, string>; // user id → display name (friends, coach links, challenge members)
  events: CoachEvent[];
  offers: CoachOffer[];
  payments: CoachingPayment[];
  payouts: { connected: boolean; chargesEnabled: boolean } | null;
  role: StaffRole; // set by PX, never by the member
  coaches: PublicCoach[]; // PX coaches members can connect to
  staff: StaffMember[]; // owner only: the coaching team
}
export type StaffRole = 'owner' | 'coach' | null;
export interface PublicCoach { user_id: string; display_name: string; friend_code: string; role: 'owner' | 'coach' }
export interface StaffMember { user_id: string; display_name: string | null; role: 'owner' | 'coach'; created_at: string }

// ── pure helpers (unit-tested) ──────────────────────────────────────────────
export const CODE_ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'; // no I, O, 0, 1
export function makeFriendCode(rand: (n: number) => number = secureRandom): string {
  let s = '';
  for (let i = 0; i < 8; i++) s += CODE_ALPHABET[rand(CODE_ALPHABET.length)];
  return s;
}
function addDaysKey(n: number) {
  const d = new Date();
  d.setDate(d.getDate() + n);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}
function secureRandom(n: number) {
  const a = new Uint32Array(1);
  crypto.getRandomValues(a);
  return a[0] % n;
}
export const normalizeCode = (s: string) => s.toUpperCase().replace(/[^A-Z0-9]/g, '').slice(0, 8);
export const isCode = (s: string) => new RegExp(`^[${CODE_ALPHABET}]{8}$`).test(s);
export const formatCode = (c: string) => (c.length === 8 ? `${c.slice(0, 4)}-${c.slice(4)}` : c);
export const validName = (s: string) => s.trim().length >= 1 && s.trim().length <= 40;

/** Build exactly what a person chose to share, nothing else. */
export function buildSnapshot(data: AppData, opts: { routine: boolean; workouts: boolean }): SharedSnapshot {
  const out: SharedSnapshot = {};
  const name = (id: string) => getExercise(id, data.customExercises)?.name ?? 'Exercise';
  if (opts.routine) out.routine = data.templates.map((t) => ({ name: t.name, focus: t.focus, exercises: t.exercises.map((e) => ({ name: name(e.exerciseId), sets: e.sets, target: e.target })) }));
  if (opts.workouts) {
    out.recent = data.sessions
      .filter((s) => s.status === 'completed')
      .sort((a, b) => (b.endedAt ?? b.startedAt).localeCompare(a.endedAt ?? a.startedAt))
      .slice(0, 12)
      .map((s) => ({
        id: s.id,
        name: s.name,
        date: s.plannedFor,
        minutes: s.endedAt ? Math.max(1, Math.round((new Date(s.endedAt).getTime() - new Date(s.startedAt).getTime()) / 60000)) : null,
        short: s.variant === 'short',
        exercises: s.exercises.filter((e) => e.sets.some((x) => x.done)).map((e) => name(e.exerciseId)),
        sets: s.exercises.reduce((n, e) => n + e.sets.filter((x) => x.done).length, 0),
      }));
    const skills = skillSummary(data);
    if (skills.length) out.skills = skills;
  }
  return out;
}

/** Friends' shared workouts and photos, newest first. */
export function buildFeed(friends: Record<string, SocialProfile>, photos: SharedPhoto[], limit = 40, today = toDateKey(new Date())): FeedItem[] {
  const items: FeedItem[] = [];
  for (const f of Object.values(friends)) {
    if (!f.share_workouts) continue;
    for (const w of f.shared?.recent ?? []) items.push({ kind: 'workout', key: `w:${w.id}`, user: f.user_id, name: f.display_name, date: w.date, workout: w });
  }
  for (const p of photos) {
    const f = friends[p.user_id];
    if (f) items.push({ kind: 'photo', key: `p:${p.id}`, user: p.user_id, name: f.display_name, date: p.taken_on, photo: p });
  }
  for (const f of Object.values(friends)) {
    if (!f.share_workouts) continue;
    for (const k of f.shared?.skills ?? []) if (k.date && k.date >= addDays(today, -30)) items.push({ kind: 'level', key: `l:${k.id}:${k.level}`, user: f.user_id, name: f.display_name, date: k.date, skill: k });
  }
  for (const f of Object.values(friends)) {
    const c = f.share_combat ? f.shared?.combat : undefined;
    if (c?.fightDate && c.fightDate >= today) items.push({ kind: 'fight', key: `f:${c.fightDate}`, user: f.user_id, name: f.display_name, date: c.fightDate, combat: c });
  }
  return items.sort((a, b) => b.date.localeCompare(a.date) || b.key.localeCompare(a.key)).slice(0, limit);
}

/** Friends close to your size in the same sport: within 8 cm and 10% body weight. */
export function sizeMatches(me: CombatInfo | undefined, friends: Record<string, SocialProfile>): string[] {
  if (!me?.heightCm || !me.weightKg) return [];
  return Object.values(friends).filter((f) => {
    const c = f.share_combat ? f.shared?.combat : undefined;
    if (!c?.heightCm || !c.weightKg || c.sport !== me.sport) return false;
    return Math.abs(c.heightCm - me.heightCm!) <= 8 && Math.abs(c.weightKg - me.weightKg!) / me.weightKg! <= 0.1;
  }).map((f) => f.user_id);
}

/** Finished workouts inside a challenge's dates. */
export function challengeCount(data: AppData, starts: string, ends: string): number {
  return data.sessions.filter((s) => s.status === 'completed' && s.plannedFor >= starts && s.plannedFor <= ends).length;
}

/** What a coach sees: recent workouts always; check-in numbers only if switched on. Never notes. */
export function buildCoachShare(data: AppData, checkins: boolean, today = toDateKey(new Date())): CoachShare {
  const snap = buildSnapshot(data, { routine: false, workouts: true });
  const out: CoachShare = { recent: snap.recent ?? [], ...(snap.skills ? { skills: snap.skills } : {}) };
  if (checkins) {
    const from = new Date(new Date(today + 'T12:00:00Z').getTime() - 13 * 86400000).toISOString().slice(0, 10);
    out.checkins = data.checkins.filter((c) => c.date >= from && c.date <= today).sort((a, b) => b.date.localeCompare(a.date))
      .map((c) => ({ date: c.date, mood: c.mood, energy: c.energy, stress: c.stress, sleepHours: c.sleepHours, soreness: c.soreness }));
    const ups = activeUpcoming(data, today).slice(0, 6).map((e) => ({ kind: e.kind, label: e.label, date: e.date, ...(e.endDate ? { endDate: e.endDate } : {}) }));
    if (ups.length) out.upcoming = ups;
  }
  return out;
}

export const pairOf = (a: string, b: string): [string, string] => (a < b ? [a, b] : [b, a]);

export function dataUrlToBlob(dataUrl: string): Blob {
  const [head, b64] = dataUrl.split(',');
  const type = /data:([^;]+)/.exec(head)?.[1] ?? 'image/jpeg';
  const bin = atob(b64);
  const bytes = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
  return new Blob([bytes], { type });
}

const REQUEST_ERRORS: Record<string, string> = {
  not_found: 'No one has that code. Check it and try again.',
  not_coach: 'That person hasn’t turned on coach mode yet.',
  self: 'That’s your own code.',
  already_friends: 'You’re already friends.',
  no_profile: 'Set up your Friends profile first.',
  too_many: 'You have a lot of pending requests. Wait for some to be accepted first.',
  signed_out: 'Sign in first.',
};

// ── live state ──────────────────────────────────────────────────────────────
type Listener = () => void;
const empty = (): SocialState => ({ loaded: false, loading: false, error: null, me: null, connections: [], friends: {}, photos: [], cheers: [], coachLinks: [], notes: [], invites: [], challenges: [], members: [], people: {}, events: [], offers: [], payments: [], payouts: null, role: null, coaches: [], staff: [] });

export class Social {
  private state: SocialState = empty();
  private listeners = new Set<Listener>();
  private pushTimer: ReturnType<typeof setTimeout> | null = null;
  private urls = new Map<string, Promise<string>>();
  private lastUser: string | null = null;

  constructor(private cloud: Cloud, private store: Store) {
    store.subscribe(() => this.schedulePush());
    cloud.subscribe(() => {
      const id = cloud.get().session?.user.id ?? null;
      if (id !== this.lastUser) { this.lastUser = id; this.reset(); }
    });
  }

  get = () => this.state;
  subscribe = (fn: Listener) => { this.listeners.add(fn); return () => this.listeners.delete(fn); };
  private set(p: Partial<SocialState>) { this.state = { ...this.state, ...p }; this.listeners.forEach((l) => l()); }
  private reset() {
    for (const u of this.urls.values()) void u.then((x) => URL.revokeObjectURL(x)).catch(() => undefined);
    this.urls.clear();
    this.state = empty();
    this.listeners.forEach((l) => l());
  }
  private uid() { return this.cloud.get().session?.user.id ?? ''; }

  async load() {
    const me = this.uid();
    if (!me) return;
    this.set({ loading: true, error: null });
    try {
      const [mine, connections, cheers] = await Promise.all([
        this.cloud.req(`/rest/v1/social_profiles?select=*&user_id=eq.${me}`) as Promise<SocialProfile[]>,
        this.cloud.req('/rest/v1/rpc/my_connections', { method: 'POST', body: '{}' }) as Promise<Connection[]>,
        this.cloud.req(`/rest/v1/cheers?select=*&or=(from_user.eq.${me},to_user.eq.${me})&order=created_at.desc&limit=200`) as Promise<Cheer[]>,
      ]);
      const accepted = (connections ?? []).filter((c) => c.status === 'accepted').map((c) => c.user_id);
      const ids = [me, ...accepted];
      const [profiles, photos] = await Promise.all([
        accepted.length ? (this.cloud.req(`/rest/v1/social_profiles?select=user_id,display_name,share_routine,share_workouts,shared,updated_at&user_id=in.(${accepted.join(',')})`) as Promise<SocialProfile[]>) : Promise.resolve([] as SocialProfile[]),
        this.cloud.req(`/rest/v1/shared_photos?select=*&user_id=in.(${ids.join(',')})&order=taken_on.desc,created_at.desc&limit=200`) as Promise<SharedPhoto[]>,
      ]);
      const friends: Record<string, SocialProfile> = {};
      for (const p of profiles ?? []) friends[p.user_id] = p;
      const [coachLinks, notes, invites, challenges, members, people] = await Promise.all([
        this.cloud.req('/rest/v1/rpc/my_coach_links', { method: 'POST', body: '{}' }) as Promise<CoachLink[]>,
        this.cloud.req('/rest/v1/coach_notes?select=*&order=created_at.desc&limit=100') as Promise<CoachNote[]>,
        this.cloud.req(`/rest/v1/train_invites?select=*&day=gte.${addDaysKey(-1)}&order=day.asc&limit=100`) as Promise<TrainInvite[]>,
        this.cloud.req(`/rest/v1/challenges?select=*&ends=gte.${addDaysKey(-7)}&order=ends.asc`) as Promise<Challenge[]>,
        this.cloud.req('/rest/v1/challenge_members?select=challenge_id,user_id,status,progress') as Promise<ChallengeMember[]>,
        this.cloud.req('/rest/v1/rpc/my_challenge_people', { method: 'POST', body: '{}' }) as Promise<{ user_id: string; display_name: string }[]>,
      ]);
      const names: Record<string, string> = {};
      for (const x of people ?? []) names[x.user_id] = x.display_name;
      for (const x of coachLinks ?? []) if (x.display_name) names[x.other_id] = x.display_name;
      for (const x of connections ?? []) if (x.display_name) names[x.user_id] = x.display_name;
      if (mine?.[0]) names[me] = mine[0].display_name;
      const [events, offers, payments, payouts, role, coaches] = await Promise.all([
        this.cloud.req('/rest/v1/rpc/my_events', { method: 'POST', body: '{}' }) as Promise<CoachEvent[]>,
        this.cloud.req('/rest/v1/coach_offers?select=*&active=eq.true&order=price_cents.asc') as Promise<CoachOffer[]>,
        this.cloud.req('/rest/v1/coaching_payments?select=*&order=created_at.desc&limit=100') as Promise<CoachingPayment[]>,
        this.cloud.req(`/rest/v1/coach_payouts?select=charges_enabled&coach_id=eq.${me}`) as Promise<{ charges_enabled: boolean }[]>,
        (this.cloud.req('/rest/v1/rpc/my_role', { method: 'POST', body: '{}' }) as Promise<StaffRole>).catch(() => null),
        (this.cloud.req('/rest/v1/rpc/public_coaches', { method: 'POST', body: '{}' }) as Promise<PublicCoach[]>).catch(() => [] as PublicCoach[]),
      ]);
      const staff = role === 'owner' ? ((await this.cloud.req('/rest/v1/rpc/list_staff', { method: 'POST', body: '{}' }).catch(() => [])) as StaffMember[]) : [];
      this.set({ loaded: true, loading: false, me: mine?.[0] ?? null, connections: connections ?? [], friends, photos: photos ?? [], cheers: cheers ?? [], coachLinks: coachLinks ?? [], notes: notes ?? [], invites: invites ?? [], challenges: challenges ?? [], members: members ?? [], people: names, events: events ?? [], offers: offers ?? [], payments: payments ?? [], payouts: payouts?.[0] ? { connected: true, chargesEnabled: payouts[0].charges_enabled } : { connected: false, chargesEnabled: false }, role: role ?? null, coaches: coaches ?? [], staff: staff ?? [] });
      void this.syncProgress();
      void this.pushCoachShares();
    } catch (e) {
      this.set({ loading: false, loaded: true, error: e instanceof Error ? e.message : 'Couldn’t load friends.' });
    }
  }

  // ── my profile & sharing ────────────────────────────────────────────────
  async createProfile(displayName: string, shareRoutine: boolean, shareWorkouts: boolean) {
    const me = this.uid();
    if (!validName(displayName)) throw new CloudError('Pick a name between 1 and 40 characters.');
    for (let attempt = 0; attempt < 4; attempt++) {
      try {
        const shared = buildSnapshot(this.store.get(), { routine: shareRoutine, workouts: shareWorkouts });
        const rows = (await this.cloud.req('/rest/v1/social_profiles', {
          method: 'POST',
          headers: { prefer: 'return=representation' },
          body: JSON.stringify({ user_id: me, display_name: displayName.trim(), friend_code: makeFriendCode(), share_routine: shareRoutine, share_workouts: shareWorkouts, shared }),
        })) as SocialProfile[];
        this.set({ me: rows[0] });
        return rows[0];
      } catch (e) {
        if (e instanceof CloudError && e.status === 409 && attempt < 3) continue; // code collision: try another
        throw e;
      }
    }
    throw new CloudError('Couldn’t create your profile. Try again.');
  }

  private async patchMe(patch: Partial<SocialProfile>) {
    const me = this.uid();
    const rows = (await this.cloud.req(`/rest/v1/social_profiles?user_id=eq.${me}`, {
      method: 'PATCH',
      headers: { prefer: 'return=representation' },
      body: JSON.stringify({ ...patch, updated_at: new Date().toISOString() }),
    })) as SocialProfile[];
    if (rows?.[0]) this.set({ me: rows[0] });
  }

  async setSharing(patch: { share_routine?: boolean; share_workouts?: boolean; display_name?: string }) {
    const cur = this.state.me;
    if (!cur) return;
    const routine = patch.share_routine ?? cur.share_routine;
    const workouts = patch.share_workouts ?? cur.share_workouts;
    if (patch.display_name !== undefined && !validName(patch.display_name)) throw new CloudError('Pick a name between 1 and 40 characters.');
    await this.patchMe({ ...patch, ...(patch.display_name !== undefined ? { display_name: patch.display_name.trim() } : {}), shared: this.snapshot(routine, workouts) });
  }

  async newCode() {
    for (let attempt = 0; attempt < 4; attempt++) {
      try { await this.patchMe({ friend_code: makeFriendCode() }); return; } catch (e) { if (!(e instanceof CloudError && e.status === 409)) throw e; }
    }
  }

  private snapshot(routine: boolean, workouts: boolean, combat = this.state.me?.share_combat ? this.state.me?.shared?.combat : undefined): SharedSnapshot {
    const s = buildSnapshot(this.store.get(), { routine, workouts });
    return combat ? { ...s, combat } : s;
  }

  /** Keep shared snapshots current after workouts or plan changes. */
  private schedulePush() {
    const me = this.state.me;
    if (!me) return;
    if (this.pushTimer) clearTimeout(this.pushTimer);
    this.pushTimer = setTimeout(() => {
      this.pushTimer = null;
      const cur = this.state.me;
      if (!cur) return;
      void this.syncProgress();
      void this.pushCoachShares();
      if (!cur.share_routine && !cur.share_workouts) return;
      const shared = this.snapshot(cur.share_routine, cur.share_workouts);
      if (JSON.stringify(shared) === JSON.stringify(cur.shared)) return;
      void this.patchMe({ shared }).catch(() => undefined);
    }, 3000);
  }

  // ── combat sports ───────────────────────────────────────────────────────
  async setCombat(info: CombatInfo | null, share: boolean) {
    const cur = this.state.me;
    if (!cur) return;
    const clean = info ? {
      sport: info.sport,
      heightCm: info.heightCm && info.heightCm >= 120 && info.heightCm <= 230 ? Math.round(info.heightCm) : undefined,
      weightKg: info.weightKg && info.weightKg >= 35 && info.weightKg <= 250 ? Math.round(info.weightKg * 10) / 10 : undefined,
      fightDate: info.fightDate || undefined,
      fightName: info.fightName?.trim().slice(0, 60) || undefined,
    } : undefined;
    await this.patchMe({ share_combat: share, shared: this.snapshot(cur.share_routine, cur.share_workouts, share ? clean : undefined) });
  }

  // ── coach & clients ─────────────────────────────────────────────────────
  /** Fresh list of PX coaches (when someone opens "Connect with a coach"). */
  async refreshCoaches() { try { const c = await this.cloud.req('/rest/v1/rpc/public_coaches', { method: 'POST', body: '{}' }) as PublicCoach[]; this.set({ coaches: c ?? [] }); } catch { /* keep what we had */ } }

  // ── coaching team (owner only; the database enforces it) ────────────────
  async addCoach(code: string): Promise<{ ok: boolean; reason?: string; name?: string }> {
    const r = await this.cloud.req('/rest/v1/rpc/add_coach', { method: 'POST', body: JSON.stringify({ code: normalizeCode(code) }) }) as { ok: boolean; reason?: string; name?: string };
    if (r.ok) await this.load();
    return r;
  }
  async removeCoach(id: string) { await this.cloud.req('/rest/v1/rpc/remove_coach', { method: 'POST', body: JSON.stringify({ coach: id }) }); await this.load(); }

  async connectCoach(code: string) {
    const clean = normalizeCode(code);
    if (!isCode(clean)) throw new CloudError('Coach codes are 8 letters and numbers, like ABCD-2345.');
    const r = (await this.cloud.req('/rest/v1/rpc/request_coach', { method: 'POST', body: JSON.stringify({ code: clean }) })) as { ok: boolean; reason?: string; status?: string; name?: string };
    if (!r?.ok) throw new CloudError(REQUEST_ERRORS[r?.reason ?? ''] ?? 'Couldn’t connect to that coach.');
    await this.load();
    return { status: r.status ?? 'pending', name: r.name ?? 'your coach' };
  }

  async acceptClient(client: string) {
    await this.cloud.req('/rest/v1/rpc/accept_client', { method: 'POST', body: JSON.stringify({ client }) });
    await this.load();
  }

  async endCoachLink(other: string, iAm: 'coach' | 'client') {
    const me = this.uid();
    const [client, coach] = iAm === 'coach' ? [other, me] : [me, other];
    await this.cloud.req(`/rest/v1/coach_links?client_id=eq.${client}&coach_id=eq.${coach}`, { method: 'DELETE' });
    this.set({ coachLinks: this.state.coachLinks.filter((l) => l.other_id !== other) });
  }

  async setCoachCheckins(coach: string, on: boolean) {
    await this.cloud.req('/rest/v1/rpc/set_coach_share', { method: 'POST', body: JSON.stringify({ coach, checkins_on: on, payload: buildCoachShare(this.store.get(), on) }) });
    this.set({ coachLinks: this.state.coachLinks.map((l) => (l.other_id === coach && l.i_am === 'client' ? { ...l, share_checkins: on } : l)) });
  }

  private async pushCoachShares() {
    for (const l of this.state.coachLinks) {
      if (l.i_am !== 'client' || l.status !== 'accepted') continue;
      await this.cloud.req('/rest/v1/rpc/set_coach_share', { method: 'POST', body: JSON.stringify({ coach: l.other_id, checkins_on: l.share_checkins, payload: buildCoachShare(this.store.get(), l.share_checkins) }) }).catch(() => undefined);
    }
  }

  async addNote(client: string, body: string) {
    const text = body.trim();
    if (!text) return;
    const rows = (await this.cloud.req('/rest/v1/coach_notes', { method: 'POST', headers: { prefer: 'return=representation' }, body: JSON.stringify({ coach_id: this.uid(), client_id: client, body: text.slice(0, 1000) }) })) as CoachNote[];
    this.set({ notes: [rows[0], ...this.state.notes] });
  }

  async deleteNote(id: string) {
    await this.cloud.req(`/rest/v1/coach_notes?id=eq.${id}`, { method: 'DELETE' });
    this.set({ notes: this.state.notes.filter((n) => n.id !== id) });
  }

  // ── train together ──────────────────────────────────────────────────────
  async proposeTraining(friend: string, day: string, time: string, workout: string, note?: string) {
    if (!workout.trim()) throw new CloudError('Name the workout.');
    const rows = (await this.cloud.req('/rest/v1/train_invites', { method: 'POST', headers: { prefer: 'return=representation' }, body: JSON.stringify({ from_user: this.uid(), to_user: friend, day, at_time: time || null, workout: workout.trim().slice(0, 80), note: note?.trim().slice(0, 200) || null }) })) as TrainInvite[];
    this.set({ invites: [...this.state.invites, rows[0]].sort((a, b) => a.day.localeCompare(b.day)) });
  }

  async respondTraining(id: string, response: 'accepted' | 'declined' | 'cancelled') {
    const ok = await this.cloud.req('/rest/v1/rpc/respond_train', { method: 'POST', body: JSON.stringify({ invite: id, response }) });
    if (ok === false) throw new CloudError('That invite has already changed. Pull to refresh.');
    this.set({ invites: this.state.invites.map((i) => (i.id === id ? { ...i, status: response } : i)) });
  }

  // ── PX Saturdays / coach events ────────────────────────────────────────
  async postEvent(e: { title: string; startsAt: string; minutes: number; location: string; details?: string; capacity?: number | null }) {
    if (!e.title.trim()) throw new CloudError('Give the session a name.');
    if (!e.location.trim()) throw new CloudError('Add where to meet.');
    if (new Date(e.startsAt).getTime() < Date.now()) throw new CloudError('Pick a time in the future.');
    await this.cloud.req('/rest/v1/coach_events', { method: 'POST', body: JSON.stringify({ coach_id: this.uid(), title: e.title.trim().slice(0, 80), starts_at: e.startsAt, minutes: e.minutes, location: e.location.trim().slice(0, 160), details: e.details?.trim().slice(0, 500) || null, capacity: e.capacity || null }) });
    await this.refreshEvents();
  }

  async cancelEvent(id: string) {
    await this.cloud.req(`/rest/v1/coach_events?id=eq.${id}`, { method: 'PATCH', body: JSON.stringify({ cancelled: true }) });
    await this.refreshEvents();
  }

  async refreshEvents() {
    const events = (await this.cloud.req('/rest/v1/rpc/my_events', { method: 'POST', body: '{}' })) as CoachEvent[];
    this.set({ events: events ?? [] });
  }

  async getEvent(id: string): Promise<CoachEvent | null> {
    if (!/^[0-9a-f-]{36}$/.test(id)) return null;
    return (await this.cloud.req('/rest/v1/rpc/get_event', { method: 'POST', body: JSON.stringify({ event: id }) })) as CoachEvent | null;
  }

  async rsvp(id: string) {
    const r = (await this.cloud.req('/rest/v1/rpc/rsvp_event', { method: 'POST', body: JSON.stringify({ event: id }) })) as { ok: boolean; reason?: string };
    if (!r?.ok) throw new CloudError(EVENT_ERRORS[r?.reason ?? ''] ?? 'Couldn’t save your spot.');
    await this.refreshEvents();
  }

  async cancelRsvp(id: string) {
    await this.cloud.req(`/rest/v1/event_rsvps?event_id=eq.${id}&user_id=eq.${this.uid()}`, { method: 'DELETE' });
    await this.refreshEvents();
  }

  async attendees(id: string) {
    return (await this.cloud.req('/rest/v1/rpc/event_attendees', { method: 'POST', body: JSON.stringify({ event: id }) })) as { user_id: string; display_name: string; created_at: string }[];
  }

  // ── coaching payments ───────────────────────────────────────────────────
  async addOffer(o: { name: string; priceCents: number; sessions: number; minutes?: number | null }) {
    if (!o.name.trim()) throw new CloudError('Name the option, like “Single session”.');
    if (!(o.priceCents >= 500 && o.priceCents <= 100000)) throw new CloudError('Price must be between $5 and $1,000.');
    await this.cloud.req('/rest/v1/coach_offers', { method: 'POST', body: JSON.stringify({ coach_id: this.uid(), name: o.name.trim().slice(0, 60), price_cents: Math.round(o.priceCents), sessions: o.sessions, minutes: o.minutes || null }) });
    await this.refreshOffers();
  }

  async removeOffer(id: string) {
    await this.cloud.req(`/rest/v1/coach_offers?id=eq.${id}`, { method: 'PATCH', body: JSON.stringify({ active: false }) });
    await this.refreshOffers();
  }

  async refreshOffers() {
    const offers = (await this.cloud.req('/rest/v1/coach_offers?select=*&active=eq.true&order=price_cents.asc')) as CoachOffer[];
    this.set({ offers: offers ?? [] });
  }

  async connectPayouts(returnTo?: string): Promise<string> {
    const r = (await this.cloud.callApi('/api/connect', { action: 'onboard', returnTo })) as { url: string };
    return r.url;
  }

  async payoutStatus() {
    const r = (await this.cloud.callApi('/api/connect', { action: 'status' })) as { connected: boolean; chargesEnabled: boolean };
    this.set({ payouts: r });
    return r;
  }

  async payCoach(offerId: string, note?: string, returnTo?: string): Promise<string> {
    const r = (await this.cloud.callApi('/api/coach-checkout', { offerId, note, returnTo })) as { url: string };
    return r.url;
  }

  // ── challenges ──────────────────────────────────────────────────────────
  async createChallenge(name: string, goal: number, starts: string, ends: string, friendIds: string[]) {
    if (!name.trim()) throw new CloudError('Give the challenge a name.');
    if (!(goal >= 1 && goal <= 200)) throw new CloudError('Pick a goal between 1 and 200 workouts.');
    if (ends < starts) throw new CloudError('The end date is before the start date.');
    const rows = (await this.cloud.req('/rest/v1/challenges', { method: 'POST', headers: { prefer: 'return=representation' }, body: JSON.stringify({ owner: this.uid(), name: name.trim().slice(0, 60), goal, starts, ends }) })) as Challenge[];
    const c = rows[0];
    for (const f of friendIds) await this.cloud.req('/rest/v1/rpc/invite_to_challenge', { method: 'POST', body: JSON.stringify({ challenge: c.id, friend: f }) });
    await this.load();
    return c;
  }

  async joinChallenge(id: string) {
    await this.cloud.req('/rest/v1/rpc/join_challenge', { method: 'POST', body: JSON.stringify({ challenge: id }) });
    await this.load();
  }

  async leaveChallenge(id: string) {
    const c = this.state.challenges.find((x) => x.id === id);
    if (c?.owner === this.uid()) await this.cloud.req(`/rest/v1/challenges?id=eq.${id}`, { method: 'DELETE' });
    else await this.cloud.req(`/rest/v1/challenge_members?challenge_id=eq.${id}&user_id=eq.${this.uid()}`, { method: 'DELETE' });
    this.set({ challenges: this.state.challenges.filter((x) => x.id !== id), members: this.state.members.filter((m) => m.challenge_id !== id) });
  }

  /** Each person's app reports their own finished-workout count for each challenge they joined. */
  private async syncProgress() {
    const me = this.uid();
    const data = this.store.get();
    for (const c of this.state.challenges) {
      const m = this.state.members.find((x) => x.challenge_id === c.id && x.user_id === me);
      if (!m || m.status !== 'joined') continue;
      const n = challengeCount(data, c.starts, c.ends);
      if (n === m.progress) continue;
      this.set({ members: this.state.members.map((x) => (x === m ? { ...x, progress: n } : x)) });
      await this.cloud.req('/rest/v1/rpc/set_challenge_progress', { method: 'POST', body: JSON.stringify({ challenge: c.id, n }) }).catch(() => undefined);
    }
  }

  // ── friends ─────────────────────────────────────────────────────────────
  async addFriend(code: string): Promise<{ status: 'pending' | 'accepted'; name: string }> {
    const clean = normalizeCode(code);
    if (!isCode(clean)) throw new CloudError('Friend codes are 8 letters and numbers, like ABCD-2345.');
    const r = (await this.cloud.req('/rest/v1/rpc/request_friend', { method: 'POST', body: JSON.stringify({ code: clean }) })) as { ok: boolean; reason?: string; status?: 'pending' | 'accepted'; name?: string };
    if (!r?.ok) throw new CloudError(REQUEST_ERRORS[r?.reason ?? ''] ?? 'Couldn’t send that request.');
    await this.load();
    return { status: r.status ?? 'pending', name: r.name ?? 'your friend' };
  }

  async accept(other: string) {
    await this.cloud.req('/rest/v1/rpc/accept_friend', { method: 'POST', body: JSON.stringify({ other }) });
    await this.load();
  }

  /** Decline a request, cancel yours, or remove a friend. Their access ends immediately. */
  async remove(other: string) {
    const [a, b] = pairOf(this.uid(), other);
    await this.cloud.req(`/rest/v1/friendships?user_a=eq.${a}&user_b=eq.${b}`, { method: 'DELETE' });
    const friends = { ...this.state.friends };
    delete friends[other];
    this.set({ connections: this.state.connections.filter((c) => c.user_id !== other), friends, photos: this.state.photos.filter((p) => p.user_id !== other), cheers: this.state.cheers.filter((c) => c.from_user !== other && c.to_user !== other) });
  }

  // ── photos ──────────────────────────────────────────────────────────────
  sharedFor(localId: string) { return this.state.photos.find((p) => p.user_id === this.uid() && p.local_id === localId) ?? null; }

  async sharePhoto(photo: ProgressPhoto, caption?: string) {
    const me = this.uid();
    if (!this.state.me) throw new CloudError('Set up your Friends profile first.');
    if (this.sharedFor(photo.id)) return;
    const blob = dataUrlToBlob(photo.dataUrl);
    const id = crypto.randomUUID();
    const ext = blob.type === 'image/png' ? 'png' : blob.type === 'image/webp' ? 'webp' : 'jpg';
    const path = `${me}/${id}.${ext}`;
    const up = await this.cloud.raw(`/storage/v1/object/friend-photos/${path}`, { method: 'POST', headers: { 'content-type': blob.type, 'x-upsert': 'false' }, body: blob });
    if (!up.ok) throw new CloudError(up.status === 413 ? 'That photo is too large to share.' : 'Couldn’t upload the photo. Try again.', up.status);
    try {
      const rows = (await this.cloud.req('/rest/v1/shared_photos', { method: 'POST', headers: { prefer: 'return=representation' }, body: JSON.stringify({ id, user_id: me, local_id: photo.id, path, taken_on: photo.date, caption: caption?.trim() || null }) })) as SharedPhoto[];
      this.set({ photos: [rows[0], ...this.state.photos] });
    } catch (e) {
      await this.cloud.raw(`/storage/v1/object/friend-photos/${path}`, { method: 'DELETE' }).catch(() => undefined);
      throw e;
    }
  }

  async unsharePhoto(localId: string) {
    const p = this.sharedFor(localId);
    if (!p) return;
    await this.cloud.req(`/rest/v1/shared_photos?id=eq.${p.id}`, { method: 'DELETE' });
    await this.cloud.raw(`/storage/v1/object/friend-photos/${p.path}`, { method: 'DELETE' }).catch(() => undefined);
    this.set({ photos: this.state.photos.filter((x) => x.id !== p.id) });
  }

  /** Private files: download with the user's token and show as a local object URL. */
  photoUrl(path: string): Promise<string> {
    let u = this.urls.get(path);
    if (!u) {
      u = this.cloud.raw(`/storage/v1/object/authenticated/friend-photos/${path}`).then(async (r) => {
        if (!r.ok) throw new CloudError('Photo unavailable', r.status);
        return URL.createObjectURL(await r.blob());
      });
      u.catch(() => this.urls.delete(path));
      this.urls.set(path, u);
    }
    return u;
  }

  // ── cheers ──────────────────────────────────────────────────────────────
  cheered(to: string, target: string) { return this.state.cheers.some((c) => c.from_user === this.uid() && c.to_user === to && c.target === target); }
  cheersFor(target: string, owner: string) { return this.state.cheers.filter((c) => c.to_user === owner && c.target === target).length; }

  async toggleCheer(to: string, target: string) {
    const me = this.uid();
    if (this.cheered(to, target)) {
      this.set({ cheers: this.state.cheers.filter((c) => !(c.from_user === me && c.to_user === to && c.target === target)) });
      await this.cloud.req(`/rest/v1/cheers?from_user=eq.${me}&to_user=eq.${to}&target=eq.${encodeURIComponent(target)}`, { method: 'DELETE' }).catch(() => undefined);
    } else {
      const c: Cheer = { from_user: me, to_user: to, target, created_at: new Date().toISOString() };
      this.set({ cheers: [c, ...this.state.cheers] });
      try { await this.cloud.req('/rest/v1/cheers', { method: 'POST', body: JSON.stringify({ from_user: me, to_user: to, target }) }); }
      catch (e) { this.set({ cheers: this.state.cheers.filter((x) => x !== c) }); throw e; }
    }
  }
}
