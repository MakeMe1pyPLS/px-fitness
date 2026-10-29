// Accounts, sync and subscription status.
//
// Talks to Supabase Auth and the REST API with plain fetch (no SDK), using the
// public anon key plus the signed-in user's token. Row-level security on the
// server decides what each user can read or write. Payments are handled by
// /api/checkout and /api/portal (server-side) and confirmed by the Stripe
// webhook, so nothing here can mark an account as paid.

import { CLOUD, cloudEnabled } from '../config';
import type { AppData } from './types';
import { SCHEMA_VERSION, type Store } from './store';

export interface Session { access_token: string; refresh_token: string; expires_at: number; user: { id: string; email: string } }
export type SubStatus = 'none' | 'active' | 'trialing' | 'past_due' | 'canceled' | 'incomplete' | 'incomplete_expired' | 'unpaid' | 'paused';
export interface Subscription { status: SubStatus; current_period_end: string | null; cancel_at_period_end: boolean }
export type SyncState = 'off' | 'idle' | 'syncing' | 'synced' | 'error' | 'conflict';

export interface CloudState {
  enabled: boolean;
  session: Session | null;
  sub: Subscription | null;
  subLoading: boolean;
  sync: SyncState;
  syncedAt: string | null;
  syncError: string | null;
  conflict: { remoteUpdatedAt: string } | null;
}

const AUTH_KEY = 'px:auth';
const SYNC_KEY = 'px:sync';

export const isActive = (s: Subscription | null) => !!s && (s.status === 'active' || s.status === 'trialing');

export class CloudError extends Error {
  constructor(message: string, readonly status = 0, readonly code = '') { super(message); }
}

/** Turn Supabase auth errors into plain sentences. */
export function friendlyAuthError(status: number, body: { error_description?: string; msg?: string; message?: string; error_code?: string; code?: string } | null): string {
  const raw = (body?.error_description || body?.msg || body?.message || '').toLowerCase();
  const code = body?.error_code || body?.code || '';
  if (code === 'invalid_credentials' || raw.includes('invalid login')) return 'That email and password don’t match.';
  if (code === 'email_not_confirmed' || raw.includes('not confirmed')) return 'Check your email and tap the confirmation link first.';
  if (code === 'user_already_exists' || raw.includes('already registered')) return 'There’s already an account with that email. Try signing in.';
  if (code === 'weak_password' || raw.includes('password should')) return 'Use a password with at least 8 characters.';
  if (code === 'over_email_send_rate_limit' || status === 429) return 'Too many tries. Wait a minute and try again.';
  if (raw.includes('valid email') || code === 'validation_failed') return 'Enter a valid email address.';
  if (status === 0) return 'Can’t reach the server. Check your connection.';
  return 'Something went wrong. Please try again.';
}

/** Supabase email links land on the site with tokens in the hash. */
export function parseAuthHash(hash: string): { tokens?: { access_token: string; refresh_token: string; expires_in: number; type: string }; error?: string } | null {
  const h = hash.replace(/^#/, '');
  if (!/(access_token|error_description|error)=/.test(h)) return null;
  const p = new URLSearchParams(h);
  if (p.get('error') || p.get('error_description')) {
    const d = (p.get('error_description') || '').replace(/\+/g, ' ');
    return { error: /expired|invalid/i.test(d) ? 'That link has expired. Request a new one.' : 'That link didn’t work. Try again.' };
  }
  const at = p.get('access_token'), rt = p.get('refresh_token');
  if (!at || !rt) return null;
  return { tokens: { access_token: at, refresh_token: rt, expires_in: Number(p.get('expires_in') || 3600), type: p.get('type') || '' } };
}

/** Read the user id and email out of a Supabase access token (display only; the server re-checks it). */
export function decodeJwt(token: string): { sub?: string; email?: string; exp?: number } {
  try {
    const part = token.split('.')[1].replace(/-/g, '+').replace(/_/g, '/');
    return JSON.parse(decodeURIComponent(escape(atob(part.padEnd(part.length + ((4 - (part.length % 4)) % 4), '=')))));
  } catch { return {}; }
}

/** What to do when signing in on a device. Pure, so it can be unit-tested. */
export function syncPlan(opts: { localHasProfile: boolean; localIsSample: boolean; remote: { updated_at: string } | null; lastSync: { userId: string; remoteUpdatedAt: string } | null; userId: string }): 'push' | 'pull' | 'conflict' | 'nothing' {
  const { localHasProfile, localIsSample, remote, lastSync, userId } = opts;
  const localEmpty = !localHasProfile || localIsSample;
  if (!remote) return localEmpty ? 'nothing' : 'push';
  if (localEmpty) return 'pull';
  const knownHere = lastSync && lastSync.userId === userId;
  if (!knownHere) return 'conflict'; // both sides have real data and this device never synced with this account
  return new Date(remote.updated_at).getTime() > new Date(lastSync.remoteUpdatedAt).getTime() + 1000 ? 'pull' : 'push';
}

type Listener = () => void;

export class Cloud {
  private state: CloudState;
  private listeners = new Set<Listener>();
  private pushTimer: ReturnType<typeof setTimeout> | null = null;
  private applyingRemote = false;
  private refreshing: Promise<Session | null> | null = null;

  constructor(private store: Store, private ls: Storage | null = safeStorage()) {
    const session = this.readJSON<Session>(AUTH_KEY);
    this.state = { enabled: cloudEnabled(), session, sub: null, subLoading: false, sync: session ? 'idle' : 'off', syncedAt: this.readJSON<{ at: string }>(SYNC_KEY)?.at ?? null, syncError: null, conflict: null };
    store.subscribe(() => this.onLocalChange());
  }

  // ── state plumbing ──────────────────────────────────────────────────────
  get = () => this.state;
  subscribe = (fn: Listener) => { this.listeners.add(fn); return () => this.listeners.delete(fn); };
  private set(p: Partial<CloudState>) { this.state = { ...this.state, ...p }; this.listeners.forEach((l) => l()); }
  private readJSON<T>(k: string): T | null { try { const v = this.ls?.getItem(k); return v ? (JSON.parse(v) as T) : null; } catch { return null; } }
  private writeJSON(k: string, v: unknown) { try { if (v == null) this.ls?.removeItem(k); else this.ls?.setItem(k, JSON.stringify(v)); } catch { /* storage blocked */ } }

  // ── low-level HTTP ──────────────────────────────────────────────────────
  private async req(path: string, init: RequestInit & { auth?: boolean } = {}) {
    const headers: Record<string, string> = { apikey: CLOUD.supabaseAnonKey, 'content-type': 'application/json', ...(init.headers as Record<string, string>) };
    if (init.auth !== false) {
      const s = await this.validSession();
      if (!s) throw new CloudError('Signed out', 401);
      headers.authorization = `Bearer ${s.access_token}`;
    }
    let res: Response;
    try { res = await fetch(CLOUD.supabaseUrl + path, { ...init, headers }); } catch { throw new CloudError('Can’t reach the server. Check your connection.', 0); }
    const text = await res.text();
    const body = text ? safeParse(text) : null;
    if (!res.ok) throw new CloudError(path.startsWith('/auth') ? friendlyAuthError(res.status, body) : 'The server couldn’t save that.', res.status, body?.error_code || body?.code || '');
    return body;
  }

  private setSession(s: Session | null) {
    this.writeJSON(AUTH_KEY, s);
    this.set({ session: s, sync: s ? (this.state.sync === 'off' ? 'idle' : this.state.sync) : 'off', ...(s ? {} : { sub: null, conflict: null, syncError: null }) });
  }

  private fromTokens(t: { access_token: string; refresh_token: string; expires_in?: number; expires_at?: number; user?: { id: string; email?: string } }): Session {
    const jwt = decodeJwt(t.access_token);
    return {
      access_token: t.access_token,
      refresh_token: t.refresh_token,
      expires_at: t.expires_at ?? jwt.exp ?? Math.floor(Date.now() / 1000) + (t.expires_in ?? 3600),
      user: { id: t.user?.id ?? jwt.sub ?? '', email: t.user?.email ?? jwt.email ?? '' },
    };
  }

  async validSession(): Promise<Session | null> {
    const s = this.state.session;
    if (!s) return null;
    if (s.expires_at - 60 > Date.now() / 1000) return s;
    if (!this.refreshing) {
      this.refreshing = (async () => {
        try {
          const body = await this.req('/auth/v1/token?grant_type=refresh_token', { method: 'POST', auth: false, body: JSON.stringify({ refresh_token: s.refresh_token }) });
          const next = this.fromTokens(body);
          this.setSession(next);
          return next;
        } catch (e) {
          if (e instanceof CloudError && e.status >= 400 && e.status < 500) this.setSession(null); // refresh token revoked or expired
          return null;
        } finally { this.refreshing = null; }
      })();
    }
    return this.refreshing;
  }

  // ── auth ────────────────────────────────────────────────────────────────
  redirectTo() { return typeof location !== 'undefined' ? location.origin + location.pathname : undefined; }

  async signUp(email: string, password: string): Promise<'signed_in' | 'confirm_email'> {
    const r = this.redirectTo();
    const body = await this.req(`/auth/v1/signup${r ? `?redirect_to=${encodeURIComponent(r)}` : ''}`, { method: 'POST', auth: false, body: JSON.stringify({ email: email.trim(), password }) });
    if (body?.access_token) { await this.startSession(this.fromTokens(body)); return 'signed_in'; }
    return 'confirm_email';
  }

  async signIn(email: string, password: string) {
    const body = await this.req('/auth/v1/token?grant_type=password', { method: 'POST', auth: false, body: JSON.stringify({ email: email.trim(), password }) });
    await this.startSession(this.fromTokens(body));
  }

  async sendReset(email: string) {
    const r = this.redirectTo();
    await this.req(`/auth/v1/recover${r ? `?redirect_to=${encodeURIComponent(r)}` : ''}`, { method: 'POST', auth: false, body: JSON.stringify({ email: email.trim() }) });
  }

  async updatePassword(password: string) {
    await this.req('/auth/v1/user', { method: 'PUT', body: JSON.stringify({ password }) });
  }

  /** Called once on load if an email link brought tokens. Returns the link type ('signup', 'recovery', ...). */
  async acceptLink(tokens: { access_token: string; refresh_token: string; expires_in: number; type: string }) {
    await this.startSession(this.fromTokens(tokens));
    return tokens.type;
  }

  async signOut() {
    await this.flush().catch(() => undefined);
    try { await this.req('/auth/v1/logout', { method: 'POST' }); } catch { /* token may already be invalid */ }
    this.setSession(null);
    this.writeJSON(SYNC_KEY, null);
    this.set({ syncedAt: null });
  }

  /** Deletes the cloud copy of the user's data. The account and any subscription are separate. */
  async deleteCloudData() {
    const s = await this.validSession();
    if (!s) return;
    await this.req(`/rest/v1/user_data?user_id=eq.${s.user.id}`, { method: 'DELETE' });
    this.writeJSON(SYNC_KEY, null);
    this.set({ syncedAt: null });
  }

  private async startSession(s: Session) {
    this.setSession(s);
    await Promise.all([this.refreshSub(), this.initialSync()]);
  }

  /** On app start with a saved session. */
  async resume() {
    if (!this.state.enabled || !this.state.session) return;
    const s = await this.validSession();
    if (!s) return;
    await Promise.all([this.refreshSub(), this.initialSync()]);
  }

  // ── subscription ────────────────────────────────────────────────────────
  async refreshSub(): Promise<Subscription | null> {
    const s = await this.validSession();
    if (!s) return null;
    this.set({ subLoading: true });
    try {
      const rows = (await this.req(`/rest/v1/subscriptions?select=status,current_period_end,cancel_at_period_end&user_id=eq.${s.user.id}`)) as Subscription[];
      const sub = rows?.[0] ?? { status: 'none', current_period_end: null, cancel_at_period_end: false };
      this.set({ sub, subLoading: false });
      return sub;
    } catch {
      this.set({ subLoading: false });
      return this.state.sub;
    }
  }

  /** After returning from Stripe, the webhook may take a few seconds. */
  async waitForActive(tries = 8, delayMs = 2000) {
    for (let i = 0; i < tries; i++) {
      const sub = await this.refreshSub();
      if (isActive(sub)) return true;
      await new Promise((r) => setTimeout(r, delayMs));
    }
    return false;
  }

  private async callApi(path: string, payload: unknown = {}) {
    const s = await this.validSession();
    if (!s) throw new CloudError('Sign in first.', 401);
    let res: Response;
    try { res = await fetch(path, { method: 'POST', headers: { 'content-type': 'application/json', authorization: `Bearer ${s.access_token}` }, body: JSON.stringify(payload) }); } catch { throw new CloudError('Can’t reach the server. Check your connection.', 0); }
    const body = safeParse(await res.text());
    if (!res.ok) throw new CloudError(body?.error || 'Something went wrong. Please try again.', res.status, body?.code || '');
    return body;
  }

  async startCheckout(): Promise<string> {
    const body = await this.callApi('/api/checkout', { returnTo: this.redirectTo() });
    return body.url as string;
  }

  async openPortal(): Promise<string> {
    const body = await this.callApi('/api/portal', { returnTo: this.redirectTo() });
    return body.url as string;
  }

  async aiCheckin(messages: { role: 'user' | 'assistant'; content: string }[], context: Record<string, string>) {
    return this.callApi('/api/checkin', { messages, context }) as Promise<{ reply: string; checkin: Record<string, number | string> | null; done: boolean }>;
  }

  // ── sync ────────────────────────────────────────────────────────────────
  private async fetchRemote(userId: string): Promise<{ data: AppData; updated_at: string } | null> {
    const rows = (await this.req(`/rest/v1/user_data?select=data,updated_at&user_id=eq.${userId}`)) as { data: AppData; updated_at: string }[];
    return rows?.[0] ?? null;
  }

  async initialSync() {
    const s = await this.validSession();
    if (!s) return;
    this.set({ sync: 'syncing', syncError: null });
    try {
      const remote = await this.fetchRemote(s.user.id);
      const d = this.store.get();
      const plan = syncPlan({ localHasProfile: !!d.profile, localIsSample: !!d.settings.sampleData, remote, lastSync: this.readJSON(SYNC_KEY), userId: s.user.id });
      if (plan === 'pull' && remote) this.applyRemote(remote, s.user.id);
      else if (plan === 'push') await this.push();
      else if (plan === 'conflict' && remote) this.set({ sync: 'conflict', conflict: { remoteUpdatedAt: remote.updated_at } });
      else this.set({ sync: 'synced' });
    } catch (e) {
      this.set({ sync: 'error', syncError: e instanceof Error ? e.message : 'Sync failed.' });
    }
  }

  /** User picked a side after a conflict. */
  async resolveConflict(keep: 'account' | 'device') {
    const s = await this.validSession();
    if (!s) return;
    // Keep the choice on screen until the data is actually in place.
    this.set({ sync: 'syncing' });
    try {
      if (keep === 'account') {
        const remote = await this.fetchRemote(s.user.id);
        if (remote) this.applyRemote(remote, s.user.id);
      } else await this.push();
      this.set({ conflict: null });
    } catch (e) {
      this.set({ sync: 'conflict', syncError: e instanceof Error ? e.message : 'Sync failed.' });
    }
  }

  private applyRemote(remote: { data: AppData; updated_at: string }, userId: string) {
    this.applyingRemote = true;
    try { this.store.replaceAll(remote.data); } finally { this.applyingRemote = false; }
    this.markSynced(userId, remote.updated_at);
  }

  private markSynced(userId: string, remoteUpdatedAt: string) {
    const at = new Date().toISOString();
    this.writeJSON(SYNC_KEY, { userId, remoteUpdatedAt, at });
    this.set({ sync: 'synced', syncedAt: at, syncError: null });
  }

  private onLocalChange() {
    if (this.applyingRemote || !this.state.session || !this.state.enabled) return;
    if (this.state.conflict) return; // wait for the user's choice
    if (this.pushTimer) clearTimeout(this.pushTimer);
    this.pushTimer = setTimeout(() => { this.pushTimer = null; void this.push().catch(() => undefined); }, 2500);
  }

  /** Push now if a save is waiting (used before sign-out / page hide). */
  async flush() {
    if (!this.pushTimer) return;
    clearTimeout(this.pushTimer);
    this.pushTimer = null;
    await this.push();
  }

  async push() {
    const s = await this.validSession();
    if (!s) return;
    const d = this.store.get();
    if (d.settings.sampleData || !d.profile) { this.set({ sync: 'synced' }); return; } // never upload demo data
    this.set({ sync: 'syncing' });
    try {
      const rows = (await this.req('/rest/v1/user_data?on_conflict=user_id', {
        method: 'POST',
        headers: { prefer: 'resolution=merge-duplicates,return=representation' },
        body: JSON.stringify({ user_id: s.user.id, data: d, schema_version: SCHEMA_VERSION, updated_at: new Date().toISOString() }),
      })) as { updated_at: string }[];
      this.markSynced(s.user.id, rows?.[0]?.updated_at ?? new Date().toISOString());
    } catch (e) {
      this.set({ sync: 'error', syncError: e instanceof Error ? e.message : 'Sync failed.' });
      throw e;
    }
  }
}

function safeParse(t: string) { try { return JSON.parse(t); } catch { return null; } }
function safeStorage(): Storage | null { try { return globalThis.localStorage ?? null; } catch { return null; } }
