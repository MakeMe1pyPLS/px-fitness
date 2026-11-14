// End-to-end: two people (Alex and Bri) become friends, share, cheer, unshare, unfriend.
// Uses a cloud-enabled build and an in-memory fake of Supabase that applies the same
// "friends only" rules as the real database (tested separately in supabase/tests).
import { chromium, devices } from 'playwright';
import { createServer } from 'node:http';
import { readFileSync, mkdirSync } from 'node:fs';
import assert from 'node:assert/strict';
import zlib from 'node:zlib';

const html = readFileSync('.e2e-cloud/index.html');
const server = createServer(async (req, res) => {
  if (req.url.startsWith('/api/')) {
    let raw = ''; for await (const c of req) raw += c;
    const body = raw ? JSON.parse(raw) : {};
    const me = who(req.headers.authorization)?.id;
    const send = (st, b) => { res.writeHead(st, { 'content-type': 'application/json' }); res.end(JSON.stringify(b)); };
    if (!me) return send(401, { error: 'Sign in first.', code: 'signed_out' });
    if (req.url === '/api/connect') {
      if (!db.profiles.get(me)?.is_coach) return send(403, { error: 'Turn on coach mode first.', code: 'not_coach' });
      if (body.action === 'status') { const p = db.payouts.get(me); return send(200, { connected: !!p, chargesEnabled: !!p?.charges_enabled }); }
      db.payouts.set(me, { coach_id: me, stripe_account_id: 'acct_' + me.slice(0, 8), charges_enabled: true }); // onboarding "completed"
      return send(200, { url: `${origin}?payouts=done#friends` });
    }
    if (req.url === '/api/coach-checkout') {
      const offer = db.offers.find((o) => o.id === body.offerId && o.active);
      if (!offer) return send(404, { error: 'That option isn’t available anymore.' });
      if (!db.coach.some((l) => l.client_id === me && l.coach_id === offer.coach_id && l.status === 'accepted')) return send(403, { error: 'Connect with this coach first.' });
      if (!db.payouts.get(offer.coach_id)?.charges_enabled) return send(409, { error: 'Your coach hasn’t finished setting up payments yet.' });
      // Simulates Stripe checkout + the connected-account webhook recording the payment.
      db.payments.unshift({ id: uuid(), coach_id: offer.coach_id, client_id: me, offer_name: offer.name, amount_cents: offer.price_cents, currency: 'usd', status: 'paid', note: body.note || null, created_at: new Date().toISOString() });
      return send(200, { url: `${origin}?coachpay=success#friends` });
    }
    return send(404, {});
  }
  res.writeHead(200, { 'content-type': 'text/html' }); res.end(html);
}).listen(0);
const origin = `http://127.0.0.1:${server.address().port}/`;

// ── fake Supabase with friends-only rules ─────────────────────────────────
const db = { users: new Map(), userData: new Map(), profiles: new Map(), friendships: [], photos: [], cheers: [], files: new Map(), coach: [], notes: [], invites: [], challenges: [], members: [], payouts: new Map(), offers: [], payments: [], events: [], rsvps: [], staff: new Map() };
let nextId = 1;
const b64u = (o) => Buffer.from(JSON.stringify(o)).toString('base64url');
const jwt = (u) => `h.${b64u({ sub: u.id, email: u.email, exp: Math.floor(Date.now() / 1000) + 3600 })}.s`;
const who = (h) => { try { const p = JSON.parse(Buffer.from((h || '').replace('Bearer ', '').split('.')[1], 'base64url').toString()); return [...db.users.values()].find((u) => u.id === p.sub) ?? null; } catch { return null; } };
const sessionFor = (u) => ({ access_token: jwt(u), refresh_token: 'r-' + u.id, expires_in: 3600, user: { id: u.id, email: u.email } });
const pair = (a, b) => (a < b ? [a, b] : [b, a]);
const friendRow = (a, b) => { const [x, y] = pair(a, b); return db.friendships.find((f) => f.user_a === x && f.user_b === y); };
const areFriends = (a, b) => friendRow(a, b)?.status === 'accepted';
const canSee = (me, owner) => me === owner || areFriends(me, owner);
const ids = (q, col) => { const v = q.get(col); if (!v) return null; if (v.startsWith('eq.')) return [v.slice(3)]; if (v.startsWith('in.(')) return v.slice(4, -1).split(','); return null; };
const uuid = () => `00000000-0000-4000-8000-${String(nextId++).padStart(12, '0')}`;

async function supabase(route) {
  const req = route.request();
  const u = new URL(req.url());
  const p = u.pathname, q = u.searchParams, m = req.method();
  const json = (status, b) => route.fulfill({ status, contentType: 'application/json', body: b === undefined ? '' : JSON.stringify(b) });
  const body = (() => { try { return req.postDataJSON(); } catch { return null; } })();
  if (p === '/auth/v1/signup') { const user = { id: `${String(nextId++).padStart(8, '0')}-0000-4000-8000-000000000000`, email: body.email, password: body.password }; db.users.set(user.email, user); return json(200, sessionFor(user)); }
  if (p === '/auth/v1/token') { const user = db.users.get(body?.email) ?? [...db.users.values()].find((x) => 'r-' + x.id === body?.refresh_token); return user ? json(200, sessionFor(user)) : json(400, { error_code: 'invalid_credentials' }); }
  if (p === '/auth/v1/logout') return json(204);
  const me = who(req.headers().authorization)?.id;
  if (!me) return json(401, { message: 'JWT expired' });
  if (p === '/rest/v1/user_data') { if (m === 'GET') { const r = db.userData.get(me); return json(200, r ? [r] : []); } const row = { data: body.data, updated_at: new Date().toISOString() }; db.userData.set(me, row); return json(201, [row]); }
  if (p === '/rest/v1/subscriptions') return json(200, []);

  if (p === '/rest/v1/rpc/my_role') return json(200, db.staff.get(me) ?? null);
  if (p === '/rest/v1/rpc/public_coaches') return json(200, [...db.staff].map(([id, role]) => ({ user_id: id, display_name: db.profiles.get(id)?.display_name, friend_code: db.profiles.get(id)?.friend_code, role })));
  if (p === '/rest/v1/rpc/list_staff') return json(200, db.staff.get(me) === 'owner' ? [...db.staff].map(([id, role]) => ({ user_id: id, role, display_name: db.profiles.get(id)?.display_name ?? null, created_at: '' })) : []);
  if (p === '/rest/v1/social_profiles') {
    if (m === 'GET') return json(200, (ids(q, 'user_id') ?? [...db.profiles.keys()]).map((id) => db.profiles.get(id)).filter((r) => r && canSee(me, r.user_id)));
    if (m === 'POST') {
      if (body.user_id !== me) return json(403, { message: 'row-level security' });
      if ([...db.profiles.values()].some((r) => r.friend_code === body.friend_code)) return json(409, { code: '23505' });
      const row = { share_routine: false, share_workouts: false, shared: {}, ...body, is_coach: db.staff.has(me), updated_at: new Date().toISOString() };
      db.profiles.set(me, row); return json(201, [row]);
    }
    if (m === 'PATCH') { const id = ids(q, 'user_id')?.[0]; if (id !== me) return json(200, []); const row = { ...db.profiles.get(me), ...body, is_coach: db.staff.has(me) }; db.profiles.set(me, row); return json(200, [row]); }
  }
  if (p === '/rest/v1/rpc/my_connections') return json(200, db.friendships.filter((f) => [f.user_a, f.user_b].includes(me)).map((f) => { const other = f.user_a === me ? f.user_b : f.user_a; return { user_id: other, display_name: db.profiles.get(other)?.display_name ?? null, status: f.status, incoming: f.requested_by !== me, created_at: f.created_at }; }));
  if (p === '/rest/v1/rpc/request_friend') {
    if (!db.profiles.has(me)) return json(200, { ok: false, reason: 'no_profile' });
    const them = [...db.profiles.values()].find((r) => r.friend_code === body.code);
    if (!them) return json(200, { ok: false, reason: 'not_found' });
    if (them.user_id === me) return json(200, { ok: false, reason: 'self' });
    const ex = friendRow(me, them.user_id);
    if (ex?.status === 'accepted') return json(200, { ok: false, reason: 'already_friends' });
    if (ex && ex.requested_by === them.user_id) { ex.status = 'accepted'; return json(200, { ok: true, status: 'accepted', name: them.display_name }); }
    if (!ex) { const [a, b] = pair(me, them.user_id); db.friendships.push({ user_a: a, user_b: b, requested_by: me, status: 'pending', created_at: new Date().toISOString() }); }
    return json(200, { ok: true, status: 'pending', name: them.display_name });
  }
  if (p === '/rest/v1/rpc/accept_friend') { const f = friendRow(me, body.other); const ok = !!f && f.status === 'pending' && f.requested_by === body.other; if (ok) f.status = 'accepted'; return json(200, ok); }
  if (p === '/rest/v1/friendships' && m === 'DELETE') {
    const a = ids(q, 'user_a')[0], b = ids(q, 'user_b')[0];
    if (![a, b].includes(me)) return json(204);
    db.friendships = db.friendships.filter((f) => !(f.user_a === a && f.user_b === b));
    db.cheers = db.cheers.filter((c) => !([c.from_user, c.to_user].includes(a) && [c.from_user, c.to_user].includes(b)));
    return json(204);
  }
  if (p === '/rest/v1/shared_photos') {
    if (m === 'GET') return json(200, db.photos.filter((r) => (ids(q, 'user_id') ?? []).includes(r.user_id) && canSee(me, r.user_id)));
    if (m === 'POST') { if (body.user_id !== me || !body.path.startsWith(me + '/')) return json(403, {}); const row = { caption: null, created_at: new Date().toISOString(), ...body }; db.photos.push(row); return json(201, [row]); }
    if (m === 'DELETE') { const id = ids(q, 'id')[0]; db.photos = db.photos.filter((r) => !(r.id === id && r.user_id === me)); return json(204); }
  }
  if (p === '/rest/v1/cheers') {
    if (m === 'GET') return json(200, db.cheers.filter((c) => [c.from_user, c.to_user].includes(me)));
    if (m === 'POST') { if (body.from_user !== me || !areFriends(me, body.to_user)) return json(403, { message: 'row-level security' }); db.cheers.push({ ...body, created_at: new Date().toISOString() }); return json(201); }
    if (m === 'DELETE') { const to = ids(q, 'to_user')[0], t = decodeURIComponent(q.get('target').slice(3)); db.cheers = db.cheers.filter((c) => !(c.from_user === me && c.to_user === to && c.target === t)); return json(204); }
  }

  // ── collaboration add-ons ──
  if (p === '/rest/v1/rpc/request_coach') {
    const c = [...db.profiles.values()].find((r) => r.friend_code === body.code);
    if (!c) return json(200, { ok: false, reason: 'not_found' });
    if (c.user_id === me) return json(200, { ok: false, reason: 'self' });
    if (!c.is_coach) return json(200, { ok: false, reason: 'not_coach' });
    if (!db.coach.some((l) => l.client_id === me && l.coach_id === c.user_id)) db.coach.push({ client_id: me, coach_id: c.user_id, status: 'pending', share_checkins: false, client_shared: {}, created_at: new Date().toISOString() });
    return json(200, { ok: true, status: 'pending', name: c.display_name });
  }
  if (p === '/rest/v1/rpc/accept_client') { const l = db.coach.find((x) => x.coach_id === me && x.client_id === body.client && x.status === 'pending' && db.profiles.get(me)?.is_coach); if (l) l.status = 'accepted'; return json(200, !!l); }
  if (p === '/rest/v1/rpc/set_coach_share') { const l = db.coach.find((x) => x.client_id === me && x.coach_id === body.coach && x.status === 'accepted'); if (l) { l.share_checkins = body.checkins_on; const c = { ...body.payload }; if (!body.checkins_on) delete c.checkins; l.client_shared = c; } return json(200, !!l); }
  if (p === '/rest/v1/rpc/my_coach_links') return json(200, db.coach.filter((l) => [l.client_id, l.coach_id].includes(me)).map((l) => { const iCoach = l.coach_id === me; const other = iCoach ? l.client_id : l.coach_id; return { other_id: other, display_name: db.profiles.get(other)?.display_name ?? null, i_am: iCoach ? 'coach' : 'client', status: l.status, share_checkins: l.share_checkins, client_shared: iCoach && l.status !== 'accepted' ? {} : l.client_shared, created_at: l.created_at }; }));
  if (p === '/rest/v1/coach_links' && m === 'DELETE') { const c = ids(q, 'client_id')[0], k = ids(q, 'coach_id')[0]; if ([c, k].includes(me)) db.coach = db.coach.filter((l) => !(l.client_id === c && l.coach_id === k)); return json(204); }
  if (p === '/rest/v1/coach_notes') {
    if (m === 'GET') return json(200, db.notes.filter((n) => [n.coach_id, n.client_id].includes(me)));
    if (m === 'POST') { if (body.coach_id !== me || !db.coach.some((l) => l.coach_id === me && l.client_id === body.client_id && l.status === 'accepted')) return json(403, {}); const n = { id: uuid(), created_at: new Date().toISOString(), ...body }; db.notes.unshift(n); return json(201, [n]); }
    if (m === 'DELETE') { const id = ids(q, 'id')[0]; db.notes = db.notes.filter((n) => !(n.id === id && n.coach_id === me)); return json(204); }
  }
  if (p === '/rest/v1/train_invites') {
    if (m === 'GET') return json(200, db.invites.filter((i) => [i.from_user, i.to_user].includes(me)));
    if (m === 'POST') { if (body.from_user !== me || !areFriends(me, body.to_user)) return json(403, {}); const i = { id: uuid(), status: 'pending', created_at: new Date().toISOString(), ...body }; db.invites.push(i); return json(201, [i]); }
  }
  if (p === '/rest/v1/rpc/respond_train') { const i = db.invites.find((x) => x.id === body.invite); const r = body.response; const ok = !!i && ['pending', 'accepted'].includes(i.status) && ((i.to_user === me && ['accepted', 'declined', 'cancelled'].includes(r)) || (i.from_user === me && r === 'cancelled')); if (ok) i.status = r; return json(200, ok); }
  const inCh = (c, u) => db.members.some((x) => x.challenge_id === c && x.user_id === u);
  if (p === '/rest/v1/challenges') {
    if (m === 'GET') return json(200, db.challenges.filter((c) => c.owner === me || inCh(c.id, me)));
    if (m === 'POST') { const c = { id: uuid(), created_at: new Date().toISOString(), ...body }; db.challenges.push(c); db.members.push({ challenge_id: c.id, user_id: me, status: 'joined', progress: 0 }); return json(201, [c]); }
    if (m === 'DELETE') { const id = ids(q, 'id')[0]; if (db.challenges.find((c) => c.id === id)?.owner === me) { db.challenges = db.challenges.filter((c) => c.id !== id); db.members = db.members.filter((x) => x.challenge_id !== id); } return json(204); }
  }
  if (p === '/rest/v1/challenge_members') {
    if (m === 'GET') return json(200, db.members.filter((x) => inCh(x.challenge_id, me)));
    if (m === 'DELETE') { const c = ids(q, 'challenge_id')[0]; db.members = db.members.filter((x) => !(x.challenge_id === c && x.user_id === me)); return json(204); }
  }
  if (p === '/rest/v1/rpc/invite_to_challenge') { const c = db.challenges.find((x) => x.id === body.challenge && x.owner === me); if (!c || !areFriends(me, body.friend)) return json(200, false); if (!inCh(c.id, body.friend)) db.members.push({ challenge_id: c.id, user_id: body.friend, status: 'invited', progress: 0 }); return json(200, true); }
  if (p === '/rest/v1/rpc/join_challenge') { const x = db.members.find((y) => y.challenge_id === body.challenge && y.user_id === me && y.status === 'invited'); if (x) x.status = 'joined'; return json(200, !!x); }
  if (p === '/rest/v1/rpc/set_challenge_progress') { const x = db.members.find((y) => y.challenge_id === body.challenge && y.user_id === me && y.status === 'joined'); if (x) x.progress = body.n; return json(200, !!x); }
  if (p === '/rest/v1/rpc/my_challenge_people') return json(200, [...new Set(db.members.filter((x) => db.members.some((y) => y.challenge_id === x.challenge_id && y.user_id === me)).map((x) => x.user_id))].map((u) => ({ user_id: u, display_name: db.profiles.get(u)?.display_name })));

  // ── payments & events ──
  if (p === '/rest/v1/coach_payouts') { const x = db.payouts.get(me); return json(200, x ? [{ charges_enabled: x.charges_enabled }] : []); }
  if (p === '/rest/v1/coach_offers') {
    if (m === 'GET') return json(200, db.offers.filter((o) => o.active && (o.coach_id === me || db.coach.some((l) => l.coach_id === o.coach_id && l.client_id === me && l.status === 'accepted'))));
    if (m === 'POST') { if (body.coach_id !== me || !db.profiles.get(me)?.is_coach) return json(403, {}); db.offers.push({ id: uuid(), active: true, sessions: 1, minutes: null, ...body }); return json(201); }
    if (m === 'PATCH') { const id = ids(q, 'id')[0]; const o = db.offers.find((x) => x.id === id && x.coach_id === me); if (o) Object.assign(o, body); return json(204); }
  }
  if (p === '/rest/v1/coaching_payments') return json(200, db.payments.filter((x) => [x.coach_id, x.client_id].includes(me)));
  const view = (e) => ({ ...e, coach_name: db.profiles.get(e.coach_id)?.display_name ?? null, going: db.rsvps.filter((r) => r.event_id === e.id).length, me_going: db.rsvps.some((r) => r.event_id === e.id && r.user_id === me) });
  if (p === '/rest/v1/coach_events') {
    if (m === 'POST') { if (body.coach_id !== me || !db.profiles.get(me)?.is_coach) return json(403, {}); db.events.push({ id: uuid(), minutes: 60, cancelled: false, created_at: new Date().toISOString(), ...body }); return json(201); }
    if (m === 'PATCH') { const id = ids(q, 'id')[0]; const e = db.events.find((x) => x.id === id && x.coach_id === me); if (e) Object.assign(e, body); return json(204); }
  }
  if (p === '/rest/v1/rpc/my_events') return json(200, db.events.filter((e) => e.coach_id === me || areFriends(e.coach_id, me) || db.coach.some((l) => l.coach_id === e.coach_id && l.client_id === me && l.status === 'accepted') || db.rsvps.some((r) => r.event_id === e.id && r.user_id === me)).map(view));
  if (p === '/rest/v1/rpc/get_event') { const e = db.events.find((x) => x.id === body.event); return json(200, e ? view(e) : null); }
  if (p === '/rest/v1/rpc/rsvp_event') {
    const e = db.events.find((x) => x.id === body.event);
    if (!e) return json(200, { ok: false, reason: 'not_found' });
    if (e.cancelled) return json(200, { ok: false, reason: 'cancelled' });
    if (!db.rsvps.some((r) => r.event_id === e.id && r.user_id === me)) { if (e.capacity && db.rsvps.filter((r) => r.event_id === e.id).length >= e.capacity) return json(200, { ok: false, reason: 'full' }); db.rsvps.push({ event_id: e.id, user_id: me }); }
    return json(200, { ok: true });
  }
  if (p === '/rest/v1/event_rsvps' && m === 'DELETE') { const id = ids(q, 'event_id')[0]; db.rsvps = db.rsvps.filter((r) => !(r.event_id === id && r.user_id === me)); return json(204); }
  if (p === '/rest/v1/rpc/event_attendees') { const e = db.events.find((x) => x.id === body.event && x.coach_id === me); return json(200, e ? db.rsvps.filter((r) => r.event_id === e.id).map((r) => ({ user_id: r.user_id, display_name: db.profiles.get(r.user_id)?.display_name ?? 'PX member', created_at: '' })) : []); }
  const store = p.match(/^\/storage\/v1\/object\/(?:authenticated\/)?friend-photos\/(.+)$/);
  if (store) {
    const path = store[1], owner = path.split('/')[0];
    if (m === 'POST') { if (owner !== me) return json(403, {}); db.files.set(path, { type: req.headers()['content-type'], body: req.postDataBuffer() }); return json(200, { Key: path }); }
    if (m === 'DELETE') { if (owner === me) db.files.delete(path); return json(200, {}); }
    const f = db.files.get(path);
    if (!f || !canSee(me, owner)) return json(404, { error: 'not_found' });
    return route.fulfill({ status: 200, contentType: f.type, body: f.body });
  }
  return json(404, { path: p });
}

// ── helpers ───────────────────────────────────────────────────────────────
function png(w, h) {
  const crc = (b) => { let c, t = []; for (let n = 0; n < 256; n++) { c = n; for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1; t[n] = c >>> 0; } let x = 0xffffffff; for (const v of b) x = t[(x ^ v) & 0xff] ^ (x >>> 8); return (x ^ 0xffffffff) >>> 0; };
  const chunk = (type, data) => { const l = Buffer.alloc(4); l.writeUInt32BE(data.length); const td = Buffer.concat([Buffer.from(type), data]); const c = Buffer.alloc(4); c.writeUInt32BE(crc(td)); return Buffer.concat([l, td, c]); };
  const ihdr = Buffer.alloc(13); ihdr.writeUInt32BE(w, 0); ihdr.writeUInt32BE(h, 4); ihdr[8] = 8; ihdr[9] = 2;
  const raw = Buffer.alloc((w * 3 + 1) * h); for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) { const o = y * (w * 3 + 1) + 1 + x * 3; raw[o] = 40; raw[o + 1] = 120; raw[o + 2] = 200; }
  return Buffer.concat([Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]), chunk('IHDR', ihdr), chunk('IDAT', zlib.deflateSync(raw)), chunk('IEND', Buffer.alloc(0))]);
}

mkdirSync('e2e/shots', { recursive: true });
const browser = await chromium.launch();
const results = [];
const errors = [];
let page;
const step = async (n, fn) => { try { await fn(); results.push(['PASS', n]); } catch (e) { results.push(['FAIL', n, e.message.replace(/\s+/g, ' ').slice(0, 900)]); try { await page.screenshot({ path: `e2e/shots/friendsfail-${results.length}.png` }); } catch {} } };
async function person() {
  const ctx = await browser.newContext({ ...devices['iPhone 13'] });
  await ctx.route(/fonts\./, (r) => r.abort());
  await ctx.route('https://sb.test/**', supabase);
  await ctx.grantPermissions(['clipboard-read', 'clipboard-write']).catch(() => undefined);
  const pg = await ctx.newPage();
  pg.setDefaultTimeout(8000);
  pg.on('pageerror', (e) => errors.push(e.message));
  return pg;
}
async function onboardAndSignUp(pg, email) {
  await pg.goto(origin + '#welcome');
  await pg.getByTestId('cta-start').click();
  await pg.getByTestId('goal-strength').click();
  for (let i = 0; i < 6; i++) await pg.getByTestId('onb-next').click();
  await pg.getByTestId('onb-finish').click();
  await pg.goto(origin + '#you');
  await pg.getByTestId('account-signup').click();
  await pg.getByTestId('auth-email').fill(email);
  await pg.getByTestId('auth-password').fill('password-123');
  await pg.getByTestId('auth-submit').click();
  await pg.getByTestId('account-email').waitFor();
}
const toast = (pg, re) => pg.getByRole('status').getByText(re).waitFor();

const alex = await person();
const bri = await person();
let alexCode = '';

await step('Friends tab is in the nav and fits on a phone', async () => {
  page = alex;
  await onboardAndSignUp(alex, 'alex@px.test');
  const tab = alex.getByRole('link', { name: 'Friends' });
  await tab.waitFor();
  assert.equal(await alex.locator('.nav a').count(), 7);
  for (const a of await alex.locator('.nav a').all()) { const b = await a.boundingBox(); assert.ok(b.width >= 44 && b.height >= 44, 'tap target'); }
  assert.ok(await alex.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth) <= 1);
  await tab.click();
  await alex.getByTestId('friends-setup').waitFor();
});

await step('setup: sharing is off by default; turn on workouts only', async () => {
  page = alex;
  // Give Alex a finished workout with a private note that must not be shared.
  await alex.evaluate(() => { const s = globalThis.__kova; const d = new Date(); const k = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`; s.replaceAll({ ...s.get(), sessions: [{ id: 'sess1', templateId: null, name: 'Push Day', variant: 'full', plannedFor: k, startedAt: new Date(Date.now() - 40 * 60000).toISOString(), endedAt: new Date().toISOString(), status: 'completed', exercises: [{ exerciseId: 'goblet-squat', target: '8–10 reps', sets: [{ done: true, weight: 50, reps: 10 }] }], note: 'PRIVATE knee note', effort: 2 }] }); });
  const switches = alex.getByTestId('friends-setup').getByRole('switch');
  assert.deepEqual(await switches.evaluateAll((els) => els.map((e) => e.getAttribute('aria-checked'))), ['false', 'false']);
  await alex.getByTestId('friends-name').fill('Alex');
  await alex.getByRole('switch', { name: 'Share my workouts' }).click();
  await alex.screenshot({ path: 'e2e/shots/friends-setup.png' });
  await alex.getByTestId('friends-create').click();
  await alex.getByTestId('invite-card').waitFor();
  alexCode = (await alex.getByTestId('my-code').first().textContent()).replace('-', '');
  assert.match(alexCode, /^[A-HJ-NP-Z2-9]{8}$/);
  const shared = [...db.profiles.values()][0];
  assert.equal(shared.share_routine, false);
  assert.equal(shared.shared.routine, undefined, 'plan not uploaded');
  assert.equal(shared.shared.recent[0].name, 'Push Day');
  assert.ok(!JSON.stringify(shared).includes('PRIVATE'), 'private note never uploaded');
  assert.ok(!JSON.stringify(shared).includes('"weight"'), 'weights never uploaded');
});

await step('share a progress photo, picked one at a time', async () => {
  page = alex;
  await alex.goto(origin + '#progress');
  await alex.getByTestId('photo-input').setInputFiles({ name: 'p.png', mimeType: 'image/png', buffer: png(60, 80) });
  await alex.getByTestId('photo').first().waitFor();
  await alex.goto(origin + '#friends');
  await alex.getByTestId('ftab-people').click();
  await alex.getByTestId('choose-photos').click();
  await alex.getByTestId('share-photo').first().click();
  await toast(alex, 'Photo shared with friends');
  assert.equal(await alex.getByTestId('share-photo').first().getAttribute('aria-pressed'), 'true');
  assert.equal(db.photos.length, 1);
  assert.equal(db.files.size, 1);
  await alex.screenshot({ path: 'e2e/shots/friends-sharing.png' });
  await alex.keyboard.press('Escape');
});

await step('Bri follows Alex’s invite link; the code is filled in', async () => {
  page = bri;
  await onboardAndSignUp(bri, 'bri@px.test');
  await bri.goto(origin + '#friends');
  await bri.getByTestId('friends-name').fill('Bri');
  await bri.getByTestId('friends-create').click();
  await bri.getByTestId('invite-card').waitFor();
  await bri.goto(`${origin}?invite=${alexCode}#friends`);
  await bri.getByTestId('friend-code').waitFor();
  assert.equal(await bri.getByTestId('friend-code').inputValue(), `${alexCode.slice(0, 4)}-${alexCode.slice(4)}`);
  assert.ok(!bri.url().includes('invite='), 'invite removed from URL');
  await bri.getByTestId('send-request').click();
  await toast(bri, 'Request sent to Alex');
  await bri.getByTestId('ftab-feed').click();
  await bri.getByText('Waiting on').waitFor();
});

await step('nothing is visible before Alex accepts', async () => {
  page = bri;
  assert.equal(await bri.getByTestId('feed-item').count(), 0);
  const seen = await bri.evaluate(() => globalThis.__social.get());
  assert.deepEqual(Object.keys(seen.friends), []);
  assert.equal(seen.photos.length, 0);
});

await step('wrong or own codes get plain messages', async () => {
  page = bri;
  await bri.getByTestId('add-friend').click();
  await bri.getByTestId('friend-code').fill('ZZZZ9999');
  await bri.getByTestId('send-request').click();
  await bri.getByTestId('add-error').getByText('No one has that code. Check it and try again.').waitFor();
  const own = [...db.profiles.values()].find((r) => r.display_name === 'Bri').friend_code;
  await bri.getByTestId('friend-code').fill(own);
  await bri.getByTestId('send-request').click();
  await bri.getByTestId('add-error').getByText('That’s your own code.').waitFor();
  await bri.keyboard.press('Escape');
});

await step('Alex accepts the request', async () => {
  page = alex;
  await alex.reload();
  await alex.getByTestId('ftab-feed').click();
  await alex.getByTestId('requests').getByText('Bri').waitFor();
  await alex.getByTestId('accept').click();
  await toast(alex, 'You and Bri are friends');
  await alex.getByTestId('ftab-people').click();
  await alex.getByTestId('friend-list').getByText('Bri').waitFor();
});

await step('Bri sees Alex’s workout and photo, and cheers the workout', async () => {
  page = bri;
  await bri.reload();
  await bri.getByTestId('ftab-feed').click();
  await bri.getByTestId('feed-item').first().waitFor();
  assert.equal(await bri.getByTestId('feed-item').count(), 2);
  await bri.getByText('Finished Push Day').waitFor();
  await bri.waitForFunction(() => [...document.querySelectorAll('.feed-photo img')].some((i) => i.src.startsWith('blob:') && i.naturalWidth > 0));
  await bri.locator('[data-testid="feed-item"]', { hasText: 'Finished Push Day' }).getByTestId('cheer').click();
  await bri.locator('[data-testid="feed-item"]', { hasText: 'Finished Push Day' }).getByText('Cheered').waitFor();
  assert.equal(db.cheers.length, 1);
  await bri.screenshot({ path: 'e2e/shots/friends-feed.png', fullPage: false });
});

await step('Alex’s profile shows only what Alex shares', async () => {
  page = bri;
  await bri.getByTestId('ftab-people').click();
  await bri.getByTestId('friend').first().click();
  const sheet = bri.getByTestId('friend-sheet');
  await sheet.getByText('Push Day').first().waitFor();
  await sheet.getByText('Alex isn’t sharing their plan.').waitFor();
  assert.equal(await sheet.getByTestId('friend-routine').count(), 0);
  assert.equal(await sheet.getByTestId('friend-photo').count(), 1);
  await bri.screenshot({ path: 'e2e/shots/friends-profile.png' });
  await bri.keyboard.press('Escape');
});

await step('Alex sees the cheer, then shares the plan too', async () => {
  page = alex;
  await alex.reload();
  await alex.getByTestId('ftab-feed').click();
  await alex.getByText('Cheers for you').waitFor();
  await alex.getByText(/Bri\s*cheered Push Day/).waitFor();
  await alex.getByTestId('ftab-people').click();
  await alex.getByTestId('edit-sharing').click();
  await alex.getByRole('switch', { name: 'Share my plan' }).click();
  await alex.waitForFunction(() => globalThis.__social.get().me?.share_routine === true);
  await alex.keyboard.press('Escape');
  page = bri;
  await bri.reload();
  await bri.getByTestId('ftab-people').click();
  await bri.getByTestId('friend').first().click();
  await bri.getByTestId('friend-routine').first().waitFor();
  await bri.keyboard.press('Escape');
});


await step('train together: Alex invites Bri for today; Bri accepts; it shows on Today', async () => {
  page = alex;
  await alex.goto(origin + '#friends');
  await alex.getByTestId('ftab-plans').click();
  await alex.getByTestId('plan-session').click();
  await alex.getByTestId('pt-day').fill(await alex.evaluate(() => { const d = new Date(); return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`; }));
  await alex.getByTestId('pt-workout').fill('Push Day');
  await alex.getByTestId('pt-send').click();
  await toast(alex, 'Invite sent to Bri');
  await alex.getByTestId('train-item').getByText('waiting for a reply').waitFor();
  page = bri;
  await bri.goto(origin + '#friends');
  await bri.reload();
  await bri.getByTestId('ftab-feed').click();
  await bri.getByTestId('train-invite').getByText(/Alex\s*wants to train together/).waitFor();
  await bri.getByTestId('train-accept').click();
  await toast(bri, 'It’s a plan');
  await bri.goto(origin + '#home');
  await bri.getByTestId('train-today').getByText(/Push Day\s*with Alex/).waitFor();
  await bri.screenshot({ path: 'e2e/shots/collab-today.png' });
});

await step('challenges: Alex starts one, Bri joins, both progress bars show', async () => {
  page = alex;
  await alex.reload();
  await alex.getByTestId('ftab-plans').click();
  await alex.getByTestId('new-challenge').click();
  await alex.getByTestId('ch-name').fill('12 in November');
  await alex.getByTestId('ch-create').click();
  await toast(alex, 'Challenge started. Invites sent.');
  page = bri;
  await bri.goto(origin + '#friends');
  await bri.reload();
  await bri.getByTestId('ftab-feed').click();
  await bri.getByTestId('challenge-invite').getByText('12 in November').waitFor();
  await bri.getByTestId('challenge-join').click();
  await bri.getByTestId('ftab-plans').click();
  await bri.getByTestId('challenge').getByText('12 in November').waitFor();
  await bri.getByTestId('challenge').locator('.ch-row').nth(1).waitFor();
  const rows = await bri.getByTestId('challenge').locator('.ch-row').allTextContents();
  assert.ok(rows.some((r) => /Alex.*1\/12/.test(r)), 'Alex reported 1 finished workout: ' + rows.join(' | '));
  assert.ok(rows.some((r) => /You.*0\/12/.test(r)), rows.join(' | '));
  await bri.screenshot({ path: 'e2e/shots/collab-challenge.png' });
});

await step('coach: Alex turns on coach mode; Bri connects; check-ins only after Bri allows', async () => {
  page = alex;
  await alex.goto(origin + '#friends');
  await alex.getByTestId('ftab-coach').click();
  assert.equal(await alex.getByRole('switch', { name: 'Coach mode' }).count(), 0, 'members can’t make themselves coaches');
  // PX bootstraps the owner in the database (supabase/migrations/0005).
  const alexId = [...db.profiles.values()].find((r) => r.display_name === 'Alex').user_id;
  db.staff.set(alexId, 'owner'); db.profiles.get(alexId).is_coach = true;
  await alex.reload();
  await alex.getByTestId('ftab-coach').click();
  await alex.getByTestId('staff-badge').getByText('You run PX coaching').waitFor();
  await alex.getByTestId('team').getByText('Owner').waitFor();
  page = bri;
  await bri.evaluate(() => { const s = globalThis.__kova; const d = new Date(); const k = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`; s.saveCheckin(k, { mood: 2, energy: 2, sleepHours: 5, note: 'PRIVATE bad night' }); });
  await bri.goto(origin + '#friends');
  await bri.getByTestId('ftab-coach').click();
  await bri.getByTestId('connect-coach').click();
  await bri.getByTestId('coach-list').getByText('Alex').waitFor();
  await bri.getByTestId('coach-pick').click();
  await toast(bri, 'Request sent to Alex');
  page = alex;
  await alex.reload();
  await alex.getByTestId('ftab-coach').click();
  await alex.getByTestId('client-request').getByText('Bri').waitFor();
  await alex.getByTestId('client-accept').click();
  await toast(alex, 'Bri is now your client');
  page = bri;
  await bri.reload();
  await bri.getByTestId('my-coach').getByText('Connected').waitFor();
  await bri.waitForFunction(() => true);
  await new Promise((r) => setTimeout(r, 800));
  assert.equal(db.coach[0].client_shared.checkins, undefined, 'check-ins private by default');
  await bri.getByRole('switch', { name: 'Share check-ins with my coach' }).click();
  await toast(bri, 'Check-ins shared with your coach');
  assert.equal(db.coach[0].client_shared.checkins[0].mood, 2);
  assert.ok(!JSON.stringify(db.coach[0].client_shared).includes('PRIVATE'), 'notes never shared');
});

await step('coach: Alex sees Bri’s check-ins and sends a note Bri can read', async () => {
  page = alex;
  await alex.reload();
  await alex.getByTestId('ftab-coach').click();
  await alex.getByTestId('client').getByText('Bri').click();
  await alex.getByTestId('client-checkins').waitFor();
  await alex.getByTestId('note-body').fill('Rough sleep. Keep today light and get to bed early.');
  await alex.getByTestId('note-send').click();
  await toast(alex, 'Note sent');
  await alex.screenshot({ path: 'e2e/shots/collab-client.png' });
  await alex.keyboard.press('Escape');
  page = bri;
  await bri.reload();
  await bri.getByTestId('coach-note').getByText(/Keep today light/).waitFor();
});

await step('combat: similar-size badge and fight night in the feed', async () => {
  page = alex;
  await alex.getByTestId('ftab-people').click();
  await alex.getByTestId('cb-sport').selectOption('Boxing');
  await alex.getByTestId('cb-feet').fill('5');
  await alex.getByTestId('cb-inches').fill('11');
  await alex.getByTestId('cb-pounds').fill('176');
  const d = await alex.evaluate(() => { const x = new Date(Date.now() + 10 * 86400000); return `${x.getFullYear()}-${String(x.getMonth() + 1).padStart(2, '0')}-${String(x.getDate()).padStart(2, '0')}`; });
  await alex.getByTestId('cb-date').fill(d);
  await alex.getByTestId('cb-event').fill('Golden Gloves');
  await alex.getByTestId('cb-share').click();
  await toast(alex, 'Shared with friends');
  page = bri;
  await bri.getByTestId('ftab-people').click();
  await bri.getByTestId('cb-sport').selectOption('Boxing');
  await bri.getByTestId('cb-feet').fill('5');
  await bri.getByTestId('cb-inches').fill('10');
  await bri.getByTestId('cb-pounds').fill('183');
  await bri.getByTestId('cb-share').click();
  await toast(bri, 'Shared with friends');
  await bri.reload();
  await bri.getByTestId('size-matches').getByText('Alex').waitFor();
  await bri.getByTestId('size-badge').waitFor();
  await bri.getByTestId('ftab-feed').click();
  await bri.getByText('Fight night: Golden Gloves').waitFor();
  await bri.screenshot({ path: 'e2e/shots/collab-feed.png' });
});


await step('skill levels: Alex levels up; Bri sees it in the feed', async () => {
  page = alex;
  await alex.goto(origin + '#progress');
  await alex.getByTestId('skill-levels').waitFor();
  await alex.getByTestId('levelup-pushup').click();
  await alex.getByRole('button', { name: 'Yes, level up' }).click();
  await toast(alex, 'Level up! Wall push-up');
  await alex.getByTestId('skill-pushup').getByText('Level 1: Wall push-up').waitFor();
  await alex.screenshot({ path: 'e2e/shots/more-skills.png' });
  await alex.waitForFunction(() => (globalThis.__social.get().me?.shared?.skills ?? []).some((k) => k.id === 'pushup'), null, { timeout: 8000 });
  page = bri;
  await bri.goto(origin + '#friends');
  await bri.reload();
  await bri.getByTestId('ftab-feed').click();
  await bri.getByText('Level up: Wall push-up').waitFor();
});

await step('coming up: Bri adds a fight tomorrow; Today tapers; coach sees it', async () => {
  page = bri;
  await bri.goto(origin + '#home');
  await bri.evaluate(() => globalThis.__kova.updateProfile({ trainingDays: [0, 1, 2, 3, 4, 5, 6] }, false));
  await bri.getByTestId('add-upcoming').click();
  await bri.getByTestId('up-label').fill('Golden Gloves');
  const tmr = await bri.evaluate(() => { const x = new Date(Date.now() + 86400000); return `${x.getFullYear()}-${String(x.getMonth() + 1).padStart(2, '0')}-${String(x.getDate()).padStart(2, '0')}`; });
  await bri.getByTestId('up-date').fill(tmr);
  await bri.getByTestId('up-save').click();
  await bri.getByTestId('upcoming-advice').getByText(/Golden Gloves in 1 day/).waitFor();
  await bri.getByTestId('why').getByText(/Taper time/).waitFor();
  assert.ok((await bri.getByTestId('start-short').getAttribute('class')).includes('btn-primary'), 'short version leads');
  await bri.locator('[data-testid="coming-up"]').scrollIntoViewIfNeeded();
  await bri.screenshot({ path: 'e2e/shots/more-comingup.png' });
  await bri.waitForTimeout(3600); // shares refresh after changes
  page = alex;
  await alex.goto(origin + '#friends');
  await alex.reload();
  await alex.getByTestId('ftab-coach').click();
  await alex.getByTestId('client').getByText('Bri').click();
  await alex.getByTestId('client-upcoming').getByText('Golden Gloves').waitFor();
  await alex.keyboard.press('Escape');
});

await step('payments: Alex connects Stripe and sets a price; Bri pays; both see it', async () => {
  page = alex;
  await alex.getByTestId('connect-stripe').click();
  await toast(alex, /Stripe is connected/);
  assert.ok(!alex.url().includes('payouts='), 'return flag cleared');
  await alex.getByTestId('add-offer').click();
  await alex.getByTestId('of-price').fill('80');
  await alex.getByTestId('of-save').click();
  await toast(alex, 'Price added');
  await alex.getByTestId('my-offer').getByText('$80').waitFor();
  page = bri;
  await bri.goto(origin + '#friends');
  await bri.reload();
  await bri.getByTestId('ftab-coach').click();
  await bri.getByTestId('pay-coach').getByText('Single session').waitFor();
  await bri.getByTestId('pay-offer').click();
  await bri.getByTestId('pay-note').fill('Saturday mornings');
  await bri.getByTestId('pay-go').click();
  await toast(bri, /Payment sent/);
  await bri.getByTestId('pay-coach').getByText(/Paid: Single session \$80/).waitFor({ timeout: 10000 });
  page = alex;
  await alex.reload();
  await alex.getByTestId('payments-received').getByText(/This month:\s*\$80/).waitFor();
  await alex.locator('[data-testid="coach-payments"]').scrollIntoViewIfNeeded();
  await alex.screenshot({ path: 'e2e/shots/more-payments.png' });
});

let eventId = '';
await step('PX Saturdays: Alex posts a session; his client signs up', async () => {
  page = alex;
  await alex.getByTestId('ftab-plans').click();
  await alex.getByTestId('post-event').click();
  await alex.getByTestId('ev-location').fill('Farquhar Park, by the pavilion');
  await alex.getByTestId('ev-capacity').fill('20');
  await alex.getByTestId('ev-post').click();
  await toast(alex, /Session posted/);
  await alex.getByTestId('event').getByText('PX Saturday: free calisthenics').waitFor();
  eventId = db.events[0].id;
  page = bri;
  await bri.reload();
  await bri.getByTestId('ftab-plans').click();
  await bri.getByTestId('event').first().click();
  await bri.getByTestId('event-rsvp').click();
  await toast(bri, /You’re in/);
  await bri.getByText('You’re going. See you there.').waitFor();
  await bri.screenshot({ path: 'e2e/shots/more-event.png' });
  await bri.keyboard.press('Escape');
});

await step('PX Saturdays: a new person from a Facebook link signs up without adding friends', async () => {
  const p = await person();
  page = p;
  await onboardAndSignUp(p, 'newbie@px.test');
  await p.goto(`${origin}?event=${eventId}#friends`);
  await p.getByTestId('event-sheet').getByText('Farquhar Park, by the pavilion').waitFor();
  assert.ok(!p.url().includes('event='), 'link cleaned');
  await p.getByTestId('event-rsvp').click();
  await toast(p, /You’re in/);
  await p.getByTestId('event-count').getByText('2').waitFor();
  await p.close();
  page = alex;
  await alex.reload();
  await alex.getByTestId('ftab-plans').click();
  await alex.getByTestId('event').first().click();
  await alex.getByTestId('attendees').getByText('Bri').waitFor();
  await alex.getByTestId('attendees').getByText('PX member').waitFor();
  await alex.keyboard.press('Escape');
});


if (process.env.CAPTURE) await step('capture full screens (design audit)', async () => {
  const dir = process.env.CAPTURE;
  for (const [who, pg] of [['coach', alex], ['client', bri]]) {
    page = pg;
    for (const r of ['home', 'progress', 'friends', 'you', 'diet', 'insights']) {
      await pg.goto(origin + '#' + r);
      await pg.waitForTimeout(700);
      // Scroll through so scroll-triggered reveals run, then capture the whole page.
      for (let y = 0; y < 12000; y += 500) { await pg.evaluate((v) => window.scrollTo(0, v), y); await pg.waitForTimeout(60); }
      await pg.evaluate(() => window.scrollTo(0, 0));
      await pg.waitForTimeout(500);
      await pg.addStyleTag({ content: '.nav{position:static!important}' }).catch(() => undefined);
      await pg.screenshot({ path: `${dir}/${who}-${r}.png`, fullPage: true });
    }
    await pg.goto(origin + '#friends'); await pg.reload();
    for (const t of ['feed', 'people', 'coach']) {
      await pg.getByTestId('ftab-' + t).click();
      await pg.waitForTimeout(500);
      await pg.addStyleTag({ content: '.nav{position:static!important}' }).catch(() => undefined);
      await pg.screenshot({ path: `${dir}/${who}-friends-${t}.png`, fullPage: true });
    }
    await pg.getByTestId('ftab-feed').click();
  }
});

await step('unsharing a photo removes it for friends', async () => {
  page = alex;
  await alex.getByTestId('ftab-people').click();
  await alex.getByTestId('choose-photos').click();
  await alex.getByTestId('share-photo').first().click();
  await toast(alex, 'Photo is private again');
  assert.equal(db.photos.length, 0);
  assert.equal(db.files.size, 0, 'file deleted from storage');
  await alex.keyboard.press('Escape');
  page = bri;
  await bri.reload();
  await bri.getByTestId('ftab-feed').click();
  await bri.getByTestId('feed-item').first().waitFor();
  assert.equal(await bri.locator('.feed-photo').count(), 0, 'photo gone from the feed');
  assert.equal(await bri.getByText('Finished Push Day').count(), 1, 'workout still there');
});

await step('removing a friend ends access both ways', async () => {
  page = bri;
  await bri.getByTestId('ftab-people').click();
  await bri.getByTestId('friend').first().click();
  await bri.getByTestId('remove-friend').click();
  await bri.getByRole('button', { name: 'Remove' }).last().click();
  await toast(bri, 'Friend removed');
  await bri.getByTestId('ftab-feed').click();
  await bri.getByTestId('invite-card').waitFor();
  assert.equal(db.friendships.length, 0);
  assert.equal(db.cheers.length, 0);
  page = alex;
  await alex.reload();
  await alex.getByTestId('ftab-feed').click();
  await alex.getByTestId('invite-card').waitFor();
});

await step('signed-out view explains why an account is needed', async () => {
  const p = await person();
  page = p;
  await p.goto(origin + '#welcome');
  await p.getByTestId('cta-start').click();
  await p.getByTestId('goal-strength').click();
  for (let i = 0; i < 6; i++) await p.getByTestId('onb-next').click();
  await p.getByTestId('onb-finish').click();
  await p.goto(origin + '#friends');
  await p.getByTestId('friends-signedout').waitFor();
  await p.screenshot({ path: 'e2e/shots/friends-signedout.png' });
  await p.close();
});

await step('no page errors', async () => { assert.deepEqual(errors, []); });

await browser.close();
server.close();
for (const r of results) console.log(r.join('  '));
const failed = results.filter((r) => r[0] === 'FAIL').length;
console.log(`\n${results.length - failed}/${results.length} passed`);
process.exit(failed ? 1 : 0);
