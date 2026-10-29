// End-to-end tests for accounts, sync, PX Plus checkout and the AI coach.
// Runs a build with accounts switched on (PX_SUPABASE_URL=https://sb.test) against
// an in-memory fake of Supabase and fake /api functions. No real network calls.
import { chromium, devices } from 'playwright';
import { createServer } from 'node:http';
import { readFileSync, mkdirSync } from 'node:fs';
import assert from 'node:assert/strict';

const html = readFileSync('.e2e-cloud/index.html');
const plainHtml = readFileSync('dist/index.html');

// ── fake backend state ────────────────────────────────────────────────────
const db = { users: new Map(), userData: new Map(), subs: new Map(), aiCalls: [], aiMode: 'ok', checkoutCalls: 0 };
const b64u = (o) => Buffer.from(JSON.stringify(o)).toString('base64url');
const jwt = (u) => `h.${b64u({ sub: u.id, email: u.email, exp: Math.floor(Date.now() / 1000) + 3600 })}.s`;
const userFromAuth = (h) => { try { const p = JSON.parse(Buffer.from((h || '').replace('Bearer ', '').split('.')[1], 'base64url').toString()); return [...db.users.values()].find((u) => u.id === p.sub) ?? null; } catch { return null; } };
const session = (u) => ({ access_token: jwt(u), refresh_token: 'r-' + u.id, expires_in: 3600, token_type: 'bearer', user: { id: u.id, email: u.email } });
let nextId = 1;

const server = createServer(async (req, res) => {
  const send = (status, body) => { res.writeHead(status, { 'content-type': 'application/json' }); res.end(JSON.stringify(body)); };
  const u = new URL(req.url, 'http://x');
  if (u.pathname.startsWith('/api/')) {
    let body = ''; for await (const c of req) body += c;
    const user = userFromAuth(req.headers.authorization);
    if (!user) return send(401, { error: 'Sign in first.', code: 'signed_out' });
    if (u.pathname === '/api/checkout') {
      db.checkoutCalls++;
      setTimeout(() => db.subs.set(user.id, { status: 'active', current_period_end: '2026-12-01T00:00:00Z', cancel_at_period_end: false }), 300); // the "webhook"
      return send(200, { url: `${origin}?checkout=success#you` });
    }
    if (u.pathname === '/api/portal') return send(200, { url: `${origin}#you` });
    if (u.pathname === '/api/checkin') {
      const { messages } = JSON.parse(body);
      db.aiCalls.push(messages);
      if (db.aiMode === 'limit') return send(429, { error: 'limit', code: 'daily_limit' });
      if (!['active', 'trialing'].includes(db.subs.get(user.id)?.status)) return send(402, { error: 'PX Plus', code: 'not_subscribed' });
      const turns = messages.filter((m) => m.role === 'user').length;
      if (turns < 2) return send(200, { reply: 'Thanks. How did you sleep, and how much time do you have today?', checkin: null, done: false });
      return send(200, { reply: 'Saved. Keep it light today and go easy on that knee.', checkin: { mood: 2, energy: 2, sleepHours: 6, availableMinutes: 20, remember: 'knee felt cranky' }, done: true });
    }
    return send(404, {});
  }
  res.writeHead(200, { 'content-type': 'text/html' });
  res.end(u.pathname === '/plain' ? plainHtml : html);
}).listen(0);
const origin = `http://127.0.0.1:${server.address().port}/`;

async function fakeSupabase(route) {
  const req = route.request();
  const u = new URL(req.url());
  const body = req.postDataJSON?.() ?? null;
  const json = (status, b) => route.fulfill({ status, contentType: 'application/json', body: b === undefined ? '' : JSON.stringify(b) });
  const me = userFromAuth(req.headers().authorization);
  const p = u.pathname;
  if (p === '/auth/v1/signup') {
    if ([...db.users.values()].some((x) => x.email === body.email)) return json(422, { code: 'user_already_exists', msg: 'User already registered' });
    const user = { id: 'u' + nextId++, email: body.email, password: body.password };
    db.users.set(user.email, user);
    return body.email.includes('confirm') ? json(200, { id: user.id, email: user.email }) : json(200, session(user));
  }
  if (p === '/auth/v1/token') {
    if (u.searchParams.get('grant_type') === 'password') {
      const user = db.users.get(body.email);
      if (!user || user.password !== body.password) return json(400, { error_code: 'invalid_credentials', msg: 'Invalid login credentials' });
      return json(200, session(user));
    }
    const user = [...db.users.values()].find((x) => 'r-' + x.id === body.refresh_token);
    return user ? json(200, session(user)) : json(400, { error_code: 'refresh_token_not_found' });
  }
  if (p === '/auth/v1/logout') return json(204);
  if (p === '/auth/v1/recover') return json(200, {});
  if (p === '/auth/v1/user') return me ? json(200, { id: me.id, email: me.email }) : json(401, {});
  if (!me) return json(401, { message: 'JWT expired' });
  if (p === '/rest/v1/user_data') {
    if (req.method() === 'GET') { const r = db.userData.get(me.id); return json(200, r ? [r] : []); }
    if (req.method() === 'DELETE') { db.userData.delete(me.id); return json(204); }
    assert.equal(body.user_id, me.id, 'can only write own row');
    const row = { data: body.data, updated_at: new Date().toISOString() };
    db.userData.set(me.id, row);
    return json(201, [row]);
  }
  if (p === '/rest/v1/subscriptions') { const s = db.subs.get(me.id); return json(200, s ? [s] : []); }
  return json(404, {});
}

// ── harness ───────────────────────────────────────────────────────────────
mkdirSync('e2e/shots', { recursive: true });
const browser = await chromium.launch();
const results = [];
let page;
const errors = [];
const step = async (n, fn) => { try { await fn(); results.push(['PASS', n]); } catch (e) { results.push(['FAIL', n, e.message.replace(/\s+/g, ' ').slice(0, 900)]); try { await page.screenshot({ path: `e2e/shots/cloudfail-${results.length}.png` }); } catch {} } };
async function newPage() {
  const ctx = await browser.newContext({ ...devices['iPhone 13'] });
  await ctx.route(/fonts\./, (r) => r.abort());
  await ctx.route('https://sb.test/**', fakeSupabase);
  const pg = await ctx.newPage();
  pg.setDefaultTimeout(8000);
  pg.on('pageerror', (e) => errors.push(e.message));
  return pg;
}
async function onboard(pg, name) {
  await pg.goto(origin + '#welcome');
  await pg.getByTestId('cta-start').click();
  await pg.getByTestId('goal-strength').click();
  await pg.getByTestId('onb-next').click();
  if (name) { /* name field is optional; onboarding continues */ }
  for (let i = 0; i < 5; i++) await pg.getByTestId('onb-next').click();
  await pg.getByTestId('onb-finish').click();
  await pg.getByTestId('open-chat').waitFor();
}

await step('accounts stay hidden when Supabase isn’t configured', async () => {
  page = await newPage();
  await page.goto(origin + 'plain#welcome');
  await page.getByTestId('cta-start').waitFor();
  assert.equal(await page.getByTestId('landing-signin').count(), 0);
  await page.evaluate(() => globalThis.__kova.replaceAll({ ...globalThis.__kova.get(), profile: null }));
  await page.close();
});

page = await newPage();

await step('create an account from the You tab; data is backed up', async () => {
  await onboard(page);
  await page.goto(origin + '#you');
  await page.getByTestId('account-card').waitFor();
  await page.getByTestId('account-signup').click();
  await page.getByTestId('auth-email').fill('sam@px.test');
  await page.getByTestId('auth-password').fill('short');
  await page.getByTestId('auth-submit').click();
  await page.getByText('Use a password with at least 8 characters.').waitFor();
  await page.getByTestId('auth-password').fill('correct-horse-1');
  await page.getByTestId('auth-submit').click();
  await page.getByTestId('account-email').getByText('sam@px.test').waitFor();
  await page.getByTestId('sync-status').getByText(/Backed up/).waitFor();
  await page.getByTestId('plan-status').getByText('Free').waitFor();
  assert.ok(db.userData.get('u1')?.data?.profile, 'profile uploaded');
  await page.screenshot({ path: 'e2e/shots/cloud-account.png' });
});

await step('changes keep backing up automatically', async () => {
  const before = db.userData.get('u1').updated_at;
  await page.evaluate(() => globalThis.__kova.setSettings({ suggestShortWhenLow: false }));
  await page.waitForFunction(() => true);
  await new Promise((r) => setTimeout(r, 3200));
  assert.notEqual(db.userData.get('u1').updated_at, before);
  assert.equal(db.userData.get('u1').data.settings.suggestShortWhenLow, false);
});

await step('free users get the quick check-in; the AI coach is never called', async () => {
  await page.goto(origin + '#home');
  await page.getByTestId('open-chat').click();
  await page.getByTestId('chip-Okay').waitFor();
  assert.equal(await page.getByTestId('ai-chat').count(), 0);
  await page.getByLabel('Close check-in').click();
  assert.equal(db.aiCalls.length, 0);
});

await step('upgrade: PX Plus sheet → checkout → back in the app with Plus on', async () => {
  await page.goto(origin + '#you');
  await page.getByTestId('account-upgrade').click();
  await page.getByTestId('upgrade-sheet').waitFor();
  await page.getByText('$25').first().waitFor();
  await page.getByText(/Everything else stays free/).waitFor();
  await page.screenshot({ path: 'e2e/shots/cloud-upgrade.png' });
  await page.getByTestId('upgrade-checkout').click();
  await page.waitForURL(/#you/);
  await page.getByRole('status').getByText(/PX Plus is on/).waitFor({ timeout: 12000 });
  await page.getByTestId('plan-status').getByText('PX Plus').waitFor();
  await page.getByTestId('manage-billing').waitFor();
  assert.equal(new URL(page.url()).search, '', 'checkout query removed from the URL');
  assert.equal(db.checkoutCalls, 1);
});

await step('subscribers get the AI coach, and it saves a structured check-in', async () => {
  await page.goto(origin + '#home');
  await page.getByTestId('open-chat').click();
  await page.getByTestId('ai-chat').waitFor();
  await page.getByTestId('chat-text').fill('kinda wiped honestly');
  await page.getByTestId('chat-send').click();
  await page.getByText('Thanks. How did you sleep').waitFor();
  await page.getByTestId('chat-text').fill('6 hours, have 20 min, knee is cranky');
  await page.getByTestId('chat-send').click();
  await page.getByText(/Saved. Keep it light/).waitFor();
  await page.screenshot({ path: 'e2e/shots/cloud-ai-chat.png' });
  const c = await page.evaluate(() => globalThis.__kova.get().checkins.at(-1));
  assert.deepEqual([c.energy, c.sleepHours, c.availableMinutes], [2, 6, 20]);
  assert.ok(await page.evaluate(() => globalThis.__kova.get().checkinMemory.some((m) => /knee/.test(m.text))));
  // Only the person's words and the coach's replies were sent; app greetings stayed on the device.
  const last = db.aiCalls.at(-1);
  assert.equal(last[0].role, 'user');
  assert.ok(!last.some((m) => /Good (morning|afternoon|evening)|How are you feeling today/.test(m.content)));
  await page.getByTestId('chat-done').click();
});

await step('crisis messages are handled on the device and never sent to the AI', async () => {
  await page.getByTestId('open-chat').click();
  await page.getByTestId('ai-chat').waitFor();
  await page.waitForTimeout(400); // the mood tapped on Today goes as the first message
  await page.getByLabel('Coach is typing').waitFor({ state: 'detached' });
  const before = db.aiCalls.length;
  await page.getByTestId('chat-text').fill('i want to die');
  await page.getByTestId('chat-send').click();
  await page.getByText(/988/).waitFor();
  await page.waitForTimeout(300);
  assert.equal(db.aiCalls.length, before);
  await page.getByLabel('Close check-in').click();
});

await step('hitting the daily AI limit falls back to the quick check-in', async () => {
  db.aiMode = 'limit';
  if (await page.getByTestId('ai-chat').count()) await page.getByLabel('Close check-in').click();
  await page.getByTestId('open-chat').click();
  await page.getByTestId('ai-fallback').getByText(/today’s AI coach messages/).waitFor();
  await page.getByText('Scripted assistant', { exact: false }).waitFor();
  db.aiMode = 'ok';
  await page.getByLabel('Close check-in').click();
});

await step('wrong password shows a plain message', async () => {
  const p2 = await newPage();
  await p2.goto(origin + '#welcome');
  await p2.getByTestId('landing-signin').click();
  await p2.getByTestId('auth-email').fill('sam@px.test');
  await p2.getByTestId('auth-password').fill('wrong-password');
  await p2.getByTestId('auth-submit').click();
  await p2.getByTestId('auth-error').getByText('That email and password don’t match.').waitFor();
  await p2.close();
});

await step('signing in on a new phone brings the data and the plan back', async () => {
  const p2 = await newPage();
  page = p2;
  await p2.goto(origin + '#welcome');
  await p2.getByTestId('landing-signin').click();
  await p2.getByTestId('auth-email').fill('sam@px.test');
  await p2.getByTestId('auth-password').fill('correct-horse-1');
  await p2.getByTestId('auth-submit').click();
  await p2.getByTestId('open-chat').waitFor();
  assert.ok(await p2.evaluate(() => !!globalThis.__kova.get().profile));
  assert.equal(await p2.evaluate(() => globalThis.__kova.get().settings.suggestShortWhenLow), false);
  await p2.goto(origin + '#you');
  await p2.getByTestId('plan-status').getByText('PX Plus').waitFor();
  await p2.close();
});

await step('a device with different data asks which copy to keep', async () => {
  const p2 = await newPage();
  page = p2;
  await onboard(p2);
  await p2.evaluate(() => globalThis.__kova.updateProfile({ name: 'OnlyOnThisPhone' }, false));
  await p2.goto(origin + '#you');
  await p2.getByTestId('account-signin').click();
  await p2.getByTestId('auth-email').fill('sam@px.test');
  await p2.getByTestId('auth-password').fill('correct-horse-1');
  await p2.getByTestId('auth-submit').click();
  await p2.getByTestId('sync-conflict').waitFor();
  await p2.screenshot({ path: 'e2e/shots/cloud-conflict.png' });
  await p2.getByTestId('keep-account').click();
  await p2.getByTestId('sync-conflict').waitFor({ state: 'detached' });
  const after = await p2.evaluate(() => globalThis.__kova.get());
  assert.notEqual(after.profile.name, 'OnlyOnThisPhone', 'account copy replaced local');
  assert.equal(after.settings.suggestShortWhenLow, false);
  await p2.close();
});

await step('sign-up that needs email confirmation explains the next step', async () => {
  const p2 = await newPage();
  page = p2;
  await p2.goto(origin + '#welcome');
  await p2.getByTestId('landing-signin').click();
  await p2.getByTestId('auth-to-signup').click();
  await p2.getByTestId('auth-email').fill('confirm-me@px.test');
  await p2.getByTestId('auth-password').fill('long-enough-1');
  await p2.getByTestId('auth-submit').click();
  await p2.getByTestId('auth-sent').getByText(/confirmation link to confirm-me@px.test/).waitFor();
  await p2.close();
});

await step('password-reset email link opens “choose a new password” and cleans the URL', async () => {
  const p2 = await newPage();
  page = p2;
  const user = db.users.get('sam@px.test');
  await p2.goto(`${origin}#access_token=${jwt(user)}&expires_in=3600&refresh_token=r-${user.id}&token_type=bearer&type=recovery`);
  await p2.getByText('Choose a new password').waitFor();
  assert.ok(p2.url().endsWith('#you'));
  assert.ok(!p2.url().includes('access_token'));
  await p2.close();
});

await step('expired email link shows a clear message', async () => {
  const p2 = await newPage();
  page = p2;
  await p2.goto(`${origin}#error=access_denied&error_code=otp_expired&error_description=Email+link+is+invalid+or+has+expired`);
  await p2.getByRole('status').getByText('That link has expired. Request a new one.').waitFor();
  await p2.close();
});

await step('sign out keeps data on the device', async () => {
  const p2 = await newPage();
  page = p2;
  await p2.goto(origin + '#welcome');
  await p2.getByTestId('landing-signin').click();
  await p2.getByTestId('auth-email').fill('sam@px.test');
  await p2.getByTestId('auth-password').fill('correct-horse-1');
  await p2.getByTestId('auth-submit').click();
  await p2.getByTestId('open-chat').waitFor();
  await p2.goto(origin + '#you');
  await p2.getByTestId('account-signout').click();
  await p2.getByRole('button', { name: 'Sign out' }).last().click();
  await p2.getByTestId('account-signup').waitFor();
  assert.ok(await p2.evaluate(() => !!globalThis.__kova.get().profile));
  assert.equal(await p2.evaluate(() => localStorage.getItem('px:auth')), null);
  assert.ok(await p2.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth) <= 1, 'no sideways scroll');
  await p2.close();
});

await step('no page errors', async () => { assert.deepEqual(errors, []); });

await browser.close();
server.close();
for (const r of results) console.log(r.join('  '));
const failed = results.filter((r) => r[0] === 'FAIL').length;
console.log(`\n${results.length - failed}/${results.length} passed`);
process.exit(failed ? 1 : 0);
