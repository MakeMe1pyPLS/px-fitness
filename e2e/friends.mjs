// End-to-end: two people (Alex and Bri) become friends, share, cheer, unshare, unfriend.
// Uses a cloud-enabled build and an in-memory fake of Supabase that applies the same
// "friends only" rules as the real database (tested separately in supabase/tests).
import { chromium, devices } from 'playwright';
import { createServer } from 'node:http';
import { readFileSync, mkdirSync } from 'node:fs';
import assert from 'node:assert/strict';
import zlib from 'node:zlib';

const html = readFileSync('.e2e-cloud/index.html');
const server = createServer((_, res) => { res.writeHead(200, { 'content-type': 'text/html' }); res.end(html); }).listen(0);
const origin = `http://127.0.0.1:${server.address().port}/`;

// ── fake Supabase with friends-only rules ─────────────────────────────────
const db = { users: new Map(), userData: new Map(), profiles: new Map(), friendships: [], photos: [], cheers: [], files: new Map() };
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

  if (p === '/rest/v1/social_profiles') {
    if (m === 'GET') return json(200, (ids(q, 'user_id') ?? [...db.profiles.keys()]).map((id) => db.profiles.get(id)).filter((r) => r && canSee(me, r.user_id)));
    if (m === 'POST') {
      if (body.user_id !== me) return json(403, { message: 'row-level security' });
      if ([...db.profiles.values()].some((r) => r.friend_code === body.friend_code)) return json(409, { code: '23505' });
      const row = { share_routine: false, share_workouts: false, shared: {}, ...body, updated_at: new Date().toISOString() };
      db.profiles.set(me, row); return json(201, [row]);
    }
    if (m === 'PATCH') { const id = ids(q, 'user_id')?.[0]; if (id !== me) return json(200, []); const row = { ...db.profiles.get(me), ...body }; db.profiles.set(me, row); return json(200, [row]); }
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
  assert.equal(await alex.locator('.nav a').count(), 6);
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
  await alex.getByTestId('requests').getByText('Bri').waitFor();
  await alex.getByTestId('accept').click();
  await toast(alex, 'You and Bri are friends');
  await alex.getByTestId('friend-list').getByText('Bri').waitFor();
});

await step('Bri sees Alex’s workout and photo, and cheers the workout', async () => {
  page = bri;
  await bri.reload();
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
  await alex.getByText('Cheers for you').waitFor();
  await alex.getByText(/Bri\s*cheered Push Day/).waitFor();
  await alex.getByTestId('edit-sharing').click();
  await alex.getByRole('switch', { name: 'Share my plan' }).click();
  await alex.waitForFunction(() => globalThis.__social.get().me?.share_routine === true);
  await alex.keyboard.press('Escape');
  page = bri;
  await bri.reload();
  await bri.getByTestId('friend').first().click();
  await bri.getByTestId('friend-routine').first().waitFor();
  await bri.keyboard.press('Escape');
});

await step('unsharing a photo removes it for friends', async () => {
  page = alex;
  await alex.getByTestId('choose-photos').click();
  await alex.getByTestId('share-photo').first().click();
  await toast(alex, 'Photo is private again');
  assert.equal(db.photos.length, 0);
  assert.equal(db.files.size, 0, 'file deleted from storage');
  await alex.keyboard.press('Escape');
  page = bri;
  await bri.reload();
  await bri.getByTestId('feed-item').first().waitFor();
  assert.equal(await bri.getByTestId('feed-item').count(), 1);
});

await step('removing a friend ends access both ways', async () => {
  page = bri;
  await bri.getByTestId('friend').first().click();
  await bri.getByTestId('remove-friend').click();
  await bri.getByRole('button', { name: 'Remove' }).last().click();
  await toast(bri, 'Friend removed');
  await bri.getByTestId('invite-card').waitFor();
  assert.equal(db.friendships.length, 0);
  assert.equal(db.cheers.length, 0);
  page = alex;
  await alex.reload();
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
