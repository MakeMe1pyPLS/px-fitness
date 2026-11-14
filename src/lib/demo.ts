// DEMO MODE — preview accounts, Friends, coaching, payments and PX Saturdays before the real
// backend is connected. Everything runs in this browser against sample people; nothing is sent
// anywhere and no money moves. Only available while real accounts aren't configured, and only
// after the person taps "Preview" (You → Demo). A banner shows the whole time.
//
// It works by answering the app's own Supabase / /api requests in memory, using the same
// friends-only rules as the real database (supabase/migrations).

export const DEMO_BASE = 'https://demo.px-fitness.invalid';
const FLAG = 'px:demo';
const DB_KEY = 'px:demo-db';
const ME = '00000000-0000-4000-8000-00000000d0e0';
const P = {
  coach: '00000000-0000-4000-8000-00000000c0ac',
  jordan: '00000000-0000-4000-8000-0000000010d0',
  maya: '00000000-0000-4000-8000-000000000a1a',
  chris: '00000000-0000-4000-8000-00000000c415',
  taylor: '00000000-0000-4000-8000-0000000017a1',
};

const ls = (): Storage | null => { try { return globalThis.localStorage ?? null; } catch { return null; } };
export const demoRequested = () => ls()?.getItem(FLAG) === 'on';
export function startDemo(asCoach = false) { ls()?.setItem(FLAG, 'on'); if (asCoach) ls()?.setItem('px:demo-role', 'owner'); else ls()?.removeItem('px:demo-role'); ls()?.removeItem(DB_KEY); ls()?.removeItem('px:auth'); ls()?.removeItem('px:sync'); history.replaceState(null, '', location.pathname + '#friends'); location.reload(); }
export function exitDemo() { ls()?.removeItem(FLAG); ls()?.removeItem('px:demo-role'); ls()?.removeItem(DB_KEY); ls()?.removeItem('px:auth'); ls()?.removeItem('px:sync'); history.replaceState(null, '', location.pathname + '#you'); location.reload(); }

// ── helpers ────────────────────────────────────────────────────────────────
const day = (n: number) => { const d = new Date(); d.setDate(d.getDate() + n); return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`; };
const at = (n: number, h: number, m = 0) => { const d = new Date(); d.setDate(d.getDate() + n); d.setHours(h, m, 0, 0); return d.toISOString(); };
const nextSat = () => { const w = new Date().getDay(); return w === 6 ? 7 : 6 - w; };
const b64u = (o: unknown) => btoa(JSON.stringify(o)).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
const token = () => `demo.${b64u({ sub: ME, email: 'you@demo.px', exp: Math.floor(Date.now() / 1000) + 60 * 60 * 24 * 30 })}.demo`;
let n = 1;
const uuid = () => `00000000-0000-4000-9000-${String(Date.now() % 1e8).padStart(8, '0')}${String(n++).padStart(4, '0')}`;
const pair = (a: string, b: string) => (a < b ? [a, b] : [b, a]);

type Row = Record<string, any>; // eslint-disable-line @typescript-eslint/no-explicit-any
interface DB { role: 'owner' | 'coach' | null; staff: Row[]; profiles: Row[]; friendships: Row[]; photos: Row[]; cheers: Row[]; coach: Row[]; notes: Row[]; invites: Row[]; challenges: Row[]; members: Row[]; payouts: Row[]; offers: Row[]; payments: Row[]; events: Row[]; rsvps: Row[]; subs: Row[]; userData: Row | null }

const workout = (id: string, name: string, d: number, min: number, ex: string[], sets: number, short = false) => ({ id, name, date: day(d), minutes: min, short, exercises: ex, sets });

function seed(): DB {
  const myName = (() => { try { return JSON.parse(ls()?.getItem('kova:data') ?? '{}')?.profile?.name || 'You'; } catch { return 'You'; } })();
  const role = ls()?.getItem('px:demo-role') === 'owner' ? 'owner' as const : null;
  return {
    role,
    staff: [...(role ? [{ user_id: ME, role: 'owner', created_at: at(-30, 9) }] : []), { user_id: P.coach, role: role ? 'coach' : 'owner', created_at: at(-30, 9) }],
    profiles: [
      { user_id: ME, display_name: myName, friend_code: 'DEMO2345', share_routine: false, share_workouts: true, share_combat: false, is_coach: !!role, shared: {}, updated_at: new Date().toISOString() },
      { user_id: P.coach, display_name: 'PX Coach', friend_code: 'PXCH8888', is_coach: true, share_routine: true, share_workouts: true, share_combat: false, updated_at: '', shared: {
        routine: [{ name: 'PX Boot Camp A', focus: 'Full body', exercises: [{ name: 'Push-up', sets: 3, target: '8–12 reps' }, { name: 'Pull-up', sets: 3, target: '3–6 reps' }, { name: 'Pistol squat (box)', sets: 3, target: '5 each leg' }] }],
        recent: [workout('cw1', 'Handstand practice', -1, 25, ['Wall walk', 'Chest-to-wall hold'], 9)],
        skills: [{ id: 'handstand', ladder: 'Handstand', level: 6, of: 6, name: 'Freestanding handstand', date: day(-3) }],
      } },
      { user_id: P.jordan, display_name: 'Jordan', friend_code: 'JRDN2222', share_routine: true, share_workouts: true, share_combat: true, updated_at: '', shared: {
        routine: [{ name: 'Upper Push', focus: 'Upper', exercises: [{ name: 'Dumbbell Bench Press', sets: 3, target: '8–10 reps' }, { name: 'Push-up', sets: 3, target: '10–15 reps' }] }],
        recent: [workout('jw1', 'Upper Push', 0, 38, ['Dumbbell Bench Press', 'Push-up', 'Plank'], 9), workout('jw2', 'Leg Day', -2, 44, ['Goblet Squat', 'Reverse Lunge'], 8), workout('jw3', 'Conditioning', -4, 20, ['Burpees', 'Mountain Climbers'], 6, true)],
        skills: [{ id: 'pullup', ladder: 'Pull-up', level: 4, of: 6, name: 'First pull-up', date: day(-1) }],
        combat: { sport: 'Boxing', heightCm: 178, weightKg: 79, fightDate: day(10), fightName: 'Golden Gloves' },
      } },
      { user_id: P.maya, display_name: 'Maya', friend_code: 'MAYA3333', share_routine: false, share_workouts: true, share_combat: false, updated_at: '', shared: {
        recent: [workout('mw1', 'Full Body B', -1, 32, ['Romanian Deadlift', 'Shoulder Press', 'Farmer Carry'], 9), workout('mw2', 'Park Calisthenics', -3, 40, ['Pull-up', 'Dips', 'L-sit'], 10)],
        skills: [{ id: 'core', ladder: 'L-sit', level: 3, of: 5, name: 'Tuck L-sit', date: day(-2) }],
      } },
      { user_id: P.chris, display_name: 'Chris', friend_code: 'CHRS4444', share_routine: false, share_workouts: false, updated_at: '', shared: {} },
      { user_id: P.taylor, display_name: 'Taylor', friend_code: 'TYLR5555', share_routine: false, share_workouts: false, updated_at: '', shared: {} },
    ],
    friendships: [
      ...[P.coach, P.jordan, P.maya].map((o) => { const [a, b] = pair(ME, o); return { user_a: a, user_b: b, requested_by: o, status: 'accepted', created_at: at(-20, 10) }; }),
      (() => { const [a, b] = pair(ME, P.chris); return { user_a: a, user_b: b, requested_by: P.chris, status: 'pending', created_at: at(0, 8) }; })(),
    ],
    photos: [{ id: '00000000-0000-4000-8000-0000000f0101', user_id: P.jordan, local_id: 'j1', path: `${P.jordan}/sample-1.svg`, taken_on: day(-1), caption: '8 weeks in. Shoulders finally showing up.', created_at: at(-1, 18) }],
    cheers: [{ from_user: P.maya, to_user: ME, target: 'w:any', created_at: at(-1, 20) }],
    coach: [
      { client_id: ME, coach_id: P.coach, status: 'accepted', share_checkins: false, client_shared: {}, created_at: at(-14, 9) },
      ...(role ? [{ client_id: P.taylor, coach_id: ME, status: 'pending', share_checkins: false, client_shared: {}, created_at: at(0, 7) }] : []),
    ],
    notes: [{ id: '00000000-0000-4000-8000-00000000a07e', coach_id: P.coach, client_id: ME, body: 'Great consistency this week. Add one more set to your push-ups on Wednesday and keep Saturday light.', created_at: at(-1, 19) }],
    invites: [{ id: '00000000-0000-4000-8000-0000000017e1', from_user: P.jordan, to_user: ME, day: day(1), at_time: '18:00', workout: 'Upper Push', note: 'Gym on 5th St?', status: 'pending', created_at: at(0, 9) }],
    challenges: [{ id: '00000000-0000-4000-8000-00000000c4a1', owner: P.maya, name: 'November 12', goal: 12, starts: day(-11), ends: day(18), created_at: at(-11, 9) }],
    members: [
      { challenge_id: '00000000-0000-4000-8000-00000000c4a1', user_id: P.maya, status: 'joined', progress: 7 },
      { challenge_id: '00000000-0000-4000-8000-00000000c4a1', user_id: P.jordan, status: 'joined', progress: 9 },
      { challenge_id: '00000000-0000-4000-8000-00000000c4a1', user_id: ME, status: 'invited', progress: 0 },
    ],
    payouts: [{ coach_id: P.coach, stripe_account_id: 'acct_demo', charges_enabled: true }],
    offers: [
      { id: '00000000-0000-4000-8000-0000000000f1', coach_id: P.coach, name: '1× a week · per session', price_cents: 8000, sessions: 1, minutes: 60, active: true },
      { id: '00000000-0000-4000-8000-0000000000f2', coach_id: P.coach, name: '2× a week · per session', price_cents: 6000, sessions: 1, minutes: 60, active: true },
      { id: '00000000-0000-4000-8000-0000000000f3', coach_id: P.coach, name: '3× a week · per session', price_cents: 5000, sessions: 1, minutes: 60, active: true },
    ],
    payments: [],
    events: [{ id: '00000000-0000-4000-8000-0000000e0e01', coach_id: P.coach, title: 'PX Saturday: free calisthenics', starts_at: at(nextSat(), 9), minutes: 60, location: 'Farquhar Park, by the pavilion (sample)', details: 'Free, all levels. Bring water and a mat if you have one.', capacity: 20, cancelled: false, created_at: at(-3, 9) }],
    rsvps: [{ event_id: '00000000-0000-4000-8000-0000000e0e01', user_id: P.jordan }, { event_id: '00000000-0000-4000-8000-0000000e0e01', user_id: P.maya }],
    subs: [],
    userData: null,
  };
}

let db: DB;
const save = () => { try { ls()?.setItem(DB_KEY, JSON.stringify(db)); } catch { /* storage full: keep in memory */ } };
const files = new Map<string, Blob>();

const samplePhoto = (caption: string) => new Blob([`<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 400 500"><defs><linearGradient id="g" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#3a2a20"/><stop offset="1" stop-color="#120d0a"/></linearGradient></defs><rect width="400" height="500" fill="url(#g)"/><circle cx="200" cy="150" r="52" fill="#6b5446"/><path d="M95 500 C95 330 130 250 200 250 C270 250 305 330 305 500 Z" fill="#6b5446"/><rect x="20" y="20" width="132" height="34" rx="17" fill="#ff5a1f"/><text x="86" y="43" font-family="system-ui,sans-serif" font-size="16" font-weight="700" fill="#090909" text-anchor="middle">SAMPLE</text><text x="200" y="470" font-family="system-ui,sans-serif" font-size="18" fill="#f4f1e8" text-anchor="middle">${caption}</text></svg>`], { type: 'image/svg+xml' });

// ── request router ─────────────────────────────────────────────────────────
const json = (status: number, body?: unknown) => new Response(body === undefined ? null : JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } });
const prof = (id: string) => db.profiles.find((p) => p.user_id === id);
const friendRow = (a: string, b: string) => { const [x, y] = pair(a, b); return db.friendships.find((f) => f.user_a === x && f.user_b === y); };
const areFriends = (a: string, b: string) => friendRow(a, b)?.status === 'accepted';
const canSee = (owner: string) => owner === ME || areFriends(ME, owner);
const coachOf = (coach: string, client: string) => db.coach.some((l) => l.coach_id === coach && l.client_id === client && l.status === 'accepted');
const ids = (q: URLSearchParams, col: string) => { const v = q.get(col); if (!v) return null; if (v.startsWith('eq.')) return [decodeURIComponent(v.slice(3))]; if (v.startsWith('in.(')) return v.slice(4, -1).split(','); return null; };
const eventView = (e: Row) => ({ ...e, coach_name: prof(e.coach_id)?.display_name ?? null, going: db.rsvps.filter((r) => r.event_id === e.id).length, me_going: db.rsvps.some((r) => r.event_id === e.id && r.user_id === ME) });
const inCh = (c: string, u: string) => db.members.some((m) => m.challenge_id === c && m.user_id === u);

async function route(url: URL, method: string, body: any): Promise<Response> { // eslint-disable-line @typescript-eslint/no-explicit-any
  const p = url.pathname, q = url.searchParams, m = method.toUpperCase();
  const ses = { access_token: token(), refresh_token: 'demo-refresh', expires_in: 60 * 60 * 24 * 30, user: { id: ME, email: 'you@demo.px' } };
  // auth
  if (p === '/auth/v1/signup' || p === '/auth/v1/token') return json(200, ses);
  if (p === '/auth/v1/user') return json(200, { id: ME, email: 'you@demo.px' });
  if (p === '/auth/v1/logout' || p === '/auth/v1/recover') return json(200, {});
  // backup & plan
  if (p === '/rest/v1/user_data') { if (m === 'GET') return json(200, db.userData ? [db.userData] : []); if (m === 'DELETE') { db.userData = null; save(); return json(204); } db.userData = { data: body.data, updated_at: new Date().toISOString() }; save(); return json(201, [db.userData]); }
  if (p === '/rest/v1/subscriptions') return json(200, db.subs);
  // social
  if (p === '/rest/v1/social_profiles') {
    if (m === 'GET') return json(200, (ids(q, 'user_id') ?? db.profiles.map((x) => x.user_id)).map(prof).filter((r) => r && canSee(r.user_id)));
    if (m === 'POST') { const row = { share_routine: false, share_workouts: false, share_combat: false, is_coach: false, shared: {}, ...body, updated_at: new Date().toISOString() }; db.profiles = db.profiles.filter((x) => x.user_id !== ME).concat(row); save(); return json(201, [row]); }
    if (m === 'PATCH') { const me = prof(ME); if (me) Object.assign(me, body, { is_coach: !!db.role }); save(); return json(200, me ? [me] : []); }
  }
  if (p === '/rest/v1/rpc/my_role') return json(200, db.role);
  if (p === '/rest/v1/rpc/public_coaches') return json(200, db.staff.map((x) => ({ user_id: x.user_id, display_name: prof(x.user_id)?.display_name, friend_code: prof(x.user_id)?.friend_code, role: x.role })));
  if (p === '/rest/v1/rpc/list_staff') return json(200, db.role === 'owner' ? db.staff.map((x) => ({ ...x, display_name: prof(x.user_id)?.display_name ?? null })) : []);
  if (p === '/rest/v1/rpc/add_coach') {
    if (db.role !== 'owner') return json(200, { ok: false, reason: 'not_owner' });
    const them = db.profiles.find((r) => r.friend_code === body.code);
    if (!them) return json(200, { ok: false, reason: 'not_found' });
    if (db.staff.some((x) => x.user_id === them.user_id)) return json(200, { ok: false, reason: 'already' });
    db.staff.push({ user_id: them.user_id, role: 'coach', created_at: new Date().toISOString() }); them.is_coach = true; save();
    return json(200, { ok: true, name: them.display_name });
  }
  if (p === '/rest/v1/rpc/remove_coach') { if (db.role !== 'owner') return json(200, false); const had = db.staff.some((x) => x.user_id === body.coach && x.role === 'coach'); db.staff = db.staff.filter((x) => !(x.user_id === body.coach && x.role === 'coach')); const pr = prof(body.coach); if (pr && had) pr.is_coach = false; save(); return json(200, had); }
  if (p === '/rest/v1/rpc/my_connections') return json(200, db.friendships.filter((f) => [f.user_a, f.user_b].includes(ME)).map((f) => { const o = f.user_a === ME ? f.user_b : f.user_a; return { user_id: o, display_name: prof(o)?.display_name ?? null, status: f.status, incoming: f.requested_by !== ME, created_at: f.created_at }; }));
  if (p === '/rest/v1/rpc/request_friend') {
    const them = db.profiles.find((r) => r.friend_code === body.code);
    if (!them) return json(200, { ok: false, reason: 'not_found' });
    if (them.user_id === ME) return json(200, { ok: false, reason: 'self' });
    const ex = friendRow(ME, them.user_id);
    if (ex?.status === 'accepted') return json(200, { ok: false, reason: 'already_friends' });
    if (ex) { ex.status = 'accepted'; save(); return json(200, { ok: true, status: 'accepted', name: them.display_name }); }
    const [a, b] = pair(ME, them.user_id); db.friendships.push({ user_a: a, user_b: b, requested_by: ME, status: 'accepted', created_at: new Date().toISOString() }); save(); // sample people accept right away
    return json(200, { ok: true, status: 'accepted', name: them.display_name });
  }
  if (p === '/rest/v1/rpc/accept_friend') { const f = friendRow(ME, body.other); const ok = !!f && f.status === 'pending'; if (f) f.status = 'accepted'; save(); return json(200, ok); }
  if (p === '/rest/v1/friendships' && m === 'DELETE') { const a = ids(q, 'user_a')![0], b = ids(q, 'user_b')![0]; db.friendships = db.friendships.filter((f) => !(f.user_a === a && f.user_b === b)); save(); return json(204); }
  if (p === '/rest/v1/shared_photos') {
    if (m === 'GET') return json(200, db.photos.filter((r) => (ids(q, 'user_id') ?? []).includes(r.user_id) && canSee(r.user_id)));
    if (m === 'POST') { const row = { caption: null, created_at: new Date().toISOString(), ...body }; db.photos.push(row); save(); return json(201, [row]); }
    if (m === 'DELETE') { const id = ids(q, 'id')![0]; db.photos = db.photos.filter((r) => !(r.id === id && r.user_id === ME)); save(); return json(204); }
  }
  if (p === '/rest/v1/cheers') {
    if (m === 'GET') return json(200, db.cheers.filter((c) => [c.from_user, c.to_user].includes(ME)));
    if (m === 'POST') { db.cheers.push({ ...body, created_at: new Date().toISOString() }); save(); return json(201); }
    if (m === 'DELETE') { const to = ids(q, 'to_user')![0], t = decodeURIComponent((q.get('target') ?? '').slice(3)); db.cheers = db.cheers.filter((c) => !(c.from_user === ME && c.to_user === to && c.target === t)); save(); return json(204); }
  }
  // coach & clients
  if (p === '/rest/v1/rpc/my_coach_links') return json(200, db.coach.filter((l) => [l.client_id, l.coach_id].includes(ME)).map((l) => { const iCoach = l.coach_id === ME; const o = iCoach ? l.client_id : l.coach_id; return { other_id: o, display_name: prof(o)?.display_name ?? null, i_am: iCoach ? 'coach' : 'client', status: l.status, share_checkins: l.share_checkins, client_shared: l.client_shared, created_at: l.created_at }; }));
  if (p === '/rest/v1/rpc/request_coach') { const c = db.profiles.find((r) => r.friend_code === body.code); if (!c) return json(200, { ok: false, reason: 'not_found' }); if (!c.is_coach) return json(200, { ok: false, reason: 'not_coach' }); if (!db.coach.some((l) => l.client_id === ME && l.coach_id === c.user_id)) db.coach.push({ client_id: ME, coach_id: c.user_id, status: 'accepted', share_checkins: false, client_shared: {}, created_at: new Date().toISOString() }); save(); return json(200, { ok: true, status: 'accepted', name: c.display_name }); }
  if (p === '/rest/v1/rpc/accept_client') { const l = db.coach.find((x) => x.coach_id === ME && x.client_id === body.client); if (l) { l.status = 'accepted'; l.client_shared = { recent: [workout('tw1', 'Full Body A', -1, 30, ['Goblet Squat', 'Push-up'], 6)], skills: [{ id: 'pushup', ladder: 'Push-up', level: 2, of: 7, name: 'Incline push-up', date: day(-2) }] }; } save(); return json(200, !!l); }
  if (p === '/rest/v1/rpc/set_coach_share') { const l = db.coach.find((x) => x.client_id === ME && x.coach_id === body.coach); if (l) { l.share_checkins = body.checkins_on; l.client_shared = body.checkins_on ? body.payload : { ...body.payload, checkins: undefined }; } save(); return json(200, !!l); }
  if (p === '/rest/v1/coach_links' && m === 'DELETE') { const c = ids(q, 'client_id')![0], k = ids(q, 'coach_id')![0]; db.coach = db.coach.filter((l) => !(l.client_id === c && l.coach_id === k)); save(); return json(204); }
  if (p === '/rest/v1/coach_notes') {
    if (m === 'GET') return json(200, db.notes.filter((x) => [x.coach_id, x.client_id].includes(ME)));
    if (m === 'POST') { const x = { id: uuid(), created_at: new Date().toISOString(), ...body }; db.notes.unshift(x); save(); return json(201, [x]); }
    if (m === 'DELETE') { const id = ids(q, 'id')![0]; db.notes = db.notes.filter((x) => !(x.id === id && x.coach_id === ME)); save(); return json(204); }
  }
  // train together, challenges
  if (p === '/rest/v1/train_invites') {
    if (m === 'GET') return json(200, db.invites.filter((i) => [i.from_user, i.to_user].includes(ME)));
    if (m === 'POST') { const i = { id: uuid(), created_at: new Date().toISOString(), ...body, status: 'accepted' }; db.invites.push(i); save(); return json(201, [{ ...i, status: 'pending' }]); }
  }
  if (p === '/rest/v1/rpc/respond_train') { const i = db.invites.find((x) => x.id === body.invite); if (i) i.status = body.response; save(); return json(200, !!i); }
  if (p === '/rest/v1/challenges') {
    if (m === 'GET') return json(200, db.challenges.filter((c) => c.owner === ME || inCh(c.id, ME)));
    if (m === 'POST') { const c = { id: uuid(), created_at: new Date().toISOString(), ...body }; db.challenges.push(c); db.members.push({ challenge_id: c.id, user_id: ME, status: 'joined', progress: 0 }); save(); return json(201, [c]); }
    if (m === 'DELETE') { const id = ids(q, 'id')![0]; db.challenges = db.challenges.filter((c) => c.id !== id); db.members = db.members.filter((x) => x.challenge_id !== id); save(); return json(204); }
  }
  if (p === '/rest/v1/challenge_members') {
    if (m === 'GET') return json(200, db.members.filter((x) => inCh(x.challenge_id, ME)));
    if (m === 'DELETE') { const c = ids(q, 'challenge_id')![0]; db.members = db.members.filter((x) => !(x.challenge_id === c && x.user_id === ME)); save(); return json(204); }
  }
  if (p === '/rest/v1/rpc/invite_to_challenge') { if (!inCh(body.challenge, body.friend)) db.members.push({ challenge_id: body.challenge, user_id: body.friend, status: 'joined', progress: Math.floor(Math.random() * 4) }); save(); return json(200, true); }
  if (p === '/rest/v1/rpc/join_challenge') { const x = db.members.find((y) => y.challenge_id === body.challenge && y.user_id === ME); if (x) x.status = 'joined'; save(); return json(200, !!x); }
  if (p === '/rest/v1/rpc/set_challenge_progress') { const x = db.members.find((y) => y.challenge_id === body.challenge && y.user_id === ME); if (x) x.progress = body.n; save(); return json(200, !!x); }
  if (p === '/rest/v1/rpc/my_challenge_people') return json(200, db.profiles.map((x) => ({ user_id: x.user_id, display_name: x.display_name })));
  // payments & events
  if (p === '/rest/v1/coach_payouts') return json(200, db.payouts.filter((x) => x.coach_id === ME).map((x) => ({ charges_enabled: x.charges_enabled })));
  if (p === '/rest/v1/coach_offers') {
    if (m === 'GET') return json(200, db.offers.filter((o) => o.active && (o.coach_id === ME || coachOf(o.coach_id, ME))));
    if (m === 'POST') { db.offers.push({ id: uuid(), active: true, sessions: 1, minutes: null, ...body }); save(); return json(201); }
    if (m === 'PATCH') { const id = ids(q, 'id')![0]; const o = db.offers.find((x) => x.id === id && x.coach_id === ME); if (o) Object.assign(o, body); save(); return json(204); }
  }
  if (p === '/rest/v1/coaching_payments') return json(200, db.payments.filter((x) => [x.coach_id, x.client_id].includes(ME)));
  if (p === '/rest/v1/coach_events') {
    if (m === 'POST') { db.events.push({ id: uuid(), minutes: 60, cancelled: false, created_at: new Date().toISOString(), ...body }); save(); return json(201); }
    if (m === 'PATCH') { const id = ids(q, 'id')![0]; const e = db.events.find((x) => x.id === id && x.coach_id === ME); if (e) Object.assign(e, body); save(); return json(204); }
  }
  if (p === '/rest/v1/rpc/my_events') return json(200, db.events.filter((e) => e.coach_id === ME || areFriends(e.coach_id, ME) || coachOf(e.coach_id, ME)).map(eventView));
  if (p === '/rest/v1/rpc/get_event') { const e = db.events.find((x) => x.id === body.event); return json(200, e ? eventView(e) : null); }
  if (p === '/rest/v1/rpc/rsvp_event') { const e = db.events.find((x) => x.id === body.event); if (!e) return json(200, { ok: false, reason: 'not_found' }); if (!db.rsvps.some((r) => r.event_id === e.id && r.user_id === ME)) db.rsvps.push({ event_id: e.id, user_id: ME }); save(); return json(200, { ok: true }); }
  if (p === '/rest/v1/event_rsvps' && m === 'DELETE') { const id = ids(q, 'event_id')![0]; db.rsvps = db.rsvps.filter((r) => !(r.event_id === id && r.user_id === ME)); save(); return json(204); }
  if (p === '/rest/v1/rpc/event_attendees') { const e = db.events.find((x) => x.id === body.event && x.coach_id === ME); return json(200, e ? db.rsvps.filter((r) => r.event_id === e.id).map((r) => ({ user_id: r.user_id, display_name: prof(r.user_id)?.display_name ?? 'PX member', created_at: '' })) : []); }
  // storage
  const st = p.match(/^\/storage\/v1\/object\/(?:authenticated\/)?friend-photos\/(.+)$/);
  if (st) {
    const path = st[1];
    if (m === 'POST') { files.set(path, new Blob([body as BlobPart])); return json(200, { Key: path }); }
    if (m === 'DELETE') { files.delete(path); return json(200, {}); }
    const f = files.get(path) ?? (path.includes('sample') ? samplePhoto('Sample photo') : null);
    return f ? new Response(f, { status: 200, headers: { 'content-type': f.type || 'image/jpeg' } }) : json(404, {});
  }
  // server functions (/api)
  const back = `${location.origin}${location.pathname}`;
  if (p === '/api/checkout') { db.subs = [{ status: 'active', current_period_end: at(30, 0), cancel_at_period_end: false }]; save(); return json(200, { url: `${back}?checkout=success#you` }); }
  if (p === '/api/portal') return json(200, { url: `${back}#you` });
  if (p === '/api/connect') { if (body?.action === 'status') { const x = db.payouts.find((y) => y.coach_id === ME); return json(200, { connected: !!x, chargesEnabled: !!x?.charges_enabled }); } if (!db.payouts.some((y) => y.coach_id === ME)) db.payouts.push({ coach_id: ME, stripe_account_id: 'acct_demo_me', charges_enabled: true }); save(); return json(200, { url: `${back}?payouts=done#friends` }); }
  if (p === '/api/coach-checkout') { const o = db.offers.find((x) => x.id === body.offerId); if (!o) return json(404, { error: 'That option isn’t available anymore.' }); db.payments.unshift({ id: uuid(), coach_id: o.coach_id, client_id: ME, offer_name: o.name, amount_cents: o.price_cents, currency: 'usd', status: 'paid', note: body.note || null, created_at: new Date().toISOString() }); save(); return json(200, { url: `${back}?coachpay=success#friends` }); }
  if (p === '/api/checkin') return json(503, { error: 'The AI coach isn’t part of the demo.', code: 'not_configured' });
  return json(404, { error: 'Not in demo' });
}

/** Answer the app's backend requests in memory. Call once, before the app starts. */
export function installDemo() {
  try { db = JSON.parse(ls()?.getItem(DB_KEY) ?? 'null') ?? seed(); } catch { db = seed(); }
  if (!db.staff) db = seed(); // saved before roles existed
  if (!db.userData && !ls()?.getItem(DB_KEY)) save();
  // Start signed in as the demo user.
  if (!ls()?.getItem('px:auth')) ls()?.setItem('px:auth', JSON.stringify({ access_token: token(), refresh_token: 'demo-refresh', expires_at: Math.floor(Date.now() / 1000) + 60 * 60 * 24 * 30, user: { id: ME, email: 'you@demo.px' } }));
  const real = globalThis.fetch.bind(globalThis);
  globalThis.fetch = async (input: RequestInfo | URL, init?: RequestInit) => {
    const href = typeof input === 'string' ? input : input instanceof URL ? input.href : input.url;
    const isDemo = href.startsWith(DEMO_BASE) || href.startsWith('/api/');
    if (!isDemo) return real(input, init);
    const url = new URL(href, DEMO_BASE);
    let body: unknown = null;
    if (init?.body instanceof Blob) body = init.body;
    else if (typeof init?.body === 'string' && init.body) { try { body = JSON.parse(init.body); } catch { body = init.body; } }
    await new Promise((r) => setTimeout(r, 120)); // feel like a network
    return route(url, init?.method ?? 'GET', body);
  };
}
