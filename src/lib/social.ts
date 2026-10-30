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
import { CloudError, type Cloud } from './cloud';
import type { Store } from './store';

export interface SharedRoutine { name: string; focus: string; exercises: { name: string; sets: number; target: string }[] }
export interface SharedWorkout { id: string; name: string; date: string; minutes: number | null; short: boolean; exercises: string[]; sets: number }
export interface SharedSnapshot { routine?: SharedRoutine[]; recent?: SharedWorkout[] }

export interface SocialProfile { user_id: string; display_name: string; friend_code?: string; share_routine: boolean; share_workouts: boolean; shared: SharedSnapshot; updated_at: string }
export interface Connection { user_id: string; display_name: string | null; status: 'pending' | 'accepted'; incoming: boolean; created_at: string }
export interface SharedPhoto { id: string; user_id: string; local_id: string; path: string; taken_on: string; caption: string | null; created_at: string }
export interface Cheer { from_user: string; to_user: string; target: string; created_at: string }

export type FeedItem =
  | { kind: 'workout'; key: string; user: string; name: string; date: string; workout: SharedWorkout }
  | { kind: 'photo'; key: string; user: string; name: string; date: string; photo: SharedPhoto };

export interface SocialState {
  loaded: boolean;
  loading: boolean;
  error: string | null;
  me: SocialProfile | null;
  connections: Connection[];
  friends: Record<string, SocialProfile>;
  photos: SharedPhoto[]; // mine and friends'
  cheers: Cheer[];
}

// ── pure helpers (unit-tested) ──────────────────────────────────────────────
export const CODE_ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'; // no I, O, 0, 1
export function makeFriendCode(rand: (n: number) => number = secureRandom): string {
  let s = '';
  for (let i = 0; i < 8; i++) s += CODE_ALPHABET[rand(CODE_ALPHABET.length)];
  return s;
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
  }
  return out;
}

/** Friends' shared workouts and photos, newest first. */
export function buildFeed(friends: Record<string, SocialProfile>, photos: SharedPhoto[], limit = 40): FeedItem[] {
  const items: FeedItem[] = [];
  for (const f of Object.values(friends)) {
    if (!f.share_workouts) continue;
    for (const w of f.shared?.recent ?? []) items.push({ kind: 'workout', key: `w:${w.id}`, user: f.user_id, name: f.display_name, date: w.date, workout: w });
  }
  for (const p of photos) {
    const f = friends[p.user_id];
    if (f) items.push({ kind: 'photo', key: `p:${p.id}`, user: p.user_id, name: f.display_name, date: p.taken_on, photo: p });
  }
  return items.sort((a, b) => b.date.localeCompare(a.date) || b.key.localeCompare(a.key)).slice(0, limit);
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
  self: 'That’s your own code.',
  already_friends: 'You’re already friends.',
  no_profile: 'Set up your Friends profile first.',
  too_many: 'You have a lot of pending requests. Wait for some to be accepted first.',
  signed_out: 'Sign in first.',
};

// ── live state ──────────────────────────────────────────────────────────────
type Listener = () => void;
const empty = (): SocialState => ({ loaded: false, loading: false, error: null, me: null, connections: [], friends: {}, photos: [], cheers: [] });

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
      this.set({ loaded: true, loading: false, me: mine?.[0] ?? null, connections: connections ?? [], friends, photos: photos ?? [], cheers: cheers ?? [] });
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
    await this.patchMe({ ...patch, ...(patch.display_name !== undefined ? { display_name: patch.display_name.trim() } : {}), shared: buildSnapshot(this.store.get(), { routine, workouts }) });
  }

  async newCode() {
    for (let attempt = 0; attempt < 4; attempt++) {
      try { await this.patchMe({ friend_code: makeFriendCode() }); return; } catch (e) { if (!(e instanceof CloudError && e.status === 409)) throw e; }
    }
  }

  /** Keep the shared snapshot current after workouts or plan changes. */
  private schedulePush() {
    const me = this.state.me;
    if (!me || (!me.share_routine && !me.share_workouts)) return;
    if (this.pushTimer) clearTimeout(this.pushTimer);
    this.pushTimer = setTimeout(() => {
      this.pushTimer = null;
      const cur = this.state.me;
      if (!cur) return;
      const shared = buildSnapshot(this.store.get(), { routine: cur.share_routine, workouts: cur.share_workouts });
      if (JSON.stringify(shared) === JSON.stringify(cur.shared)) return;
      void this.patchMe({ shared }).catch(() => undefined);
    }, 3000);
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
