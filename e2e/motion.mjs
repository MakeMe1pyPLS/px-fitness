// Motion + PX dashboard checks: layout order, springs installed, entrance
// animation completes, count-ups land on the right numbers, sliding indicators,
// workout-start view transition, reduced-motion resolver, frame rate.
import { chromium, devices } from 'playwright';
import { createServer } from 'node:http';
import { readFileSync, mkdirSync } from 'node:fs';
import assert from 'node:assert/strict';

const html = readFileSync('dist/index.html');
const server = createServer((_, res) => { res.writeHead(200, { 'content-type': 'text/html' }); res.end(html); }).listen(0);
const url = `http://127.0.0.1:${server.address().port}/`;
mkdirSync('e2e/shots', { recursive: true });
const browser = await chromium.launch();
const results = [];
let page;
const step = async (n, fn) => { try { await fn(); results.push(['PASS', n]); } catch (e) { results.push(['FAIL', n, e.message.split('\n').slice(0, 3).join(' / ')]); try { await page.screenshot({ path: `e2e/shots/mfail-${results.length}.png` }); } catch {} } };

async function onboarded(ctxOpts = {}) {
  const ctx = await browser.newContext({ ...devices['iPhone 13'], ...ctxOpts });
  await ctx.route(/fonts\./, (r) => r.abort());
  const p = await ctx.newPage();
  p.setDefaultTimeout(8000);
  p.errors = [];
  p.on('pageerror', (e) => p.errors.push(e.message));
  await p.goto(url);
  await p.waitForFunction(() => globalThis.__kova);
  // Every day a training day so the workout card always shows.
  await p.evaluate(() => globalThis.__kova.completeOnboarding({ name: 'Jordan', goal: 'build_muscle', secondaryGoals: [], disciplines: [], primaryDiscipline: null, goalHistory: [], experience: 'beginner', equipment: ['dumbbells'], sessionMinutes: 30, trainingDays: [0, 1, 2, 3, 4, 5, 6], preferredTime: 'evening', unit: 'lb', checkinsEnabled: true, createdAt: new Date(Date.now() - 30 * 864e5).toISOString() }));
  await p.goto(url + '#home');
  return { ctx, p };
}

const a = await onboarded();
page = a.p;

await step('dashboard follows PX’s original order', async () => {
  await page.getByText('Welcome back, Jordan').waitFor();
  const order = await page.evaluate(() => {
    const want = ['Progress that fits real life', 'Your fitness, your pace', 'Weekly sessions', 'Active streak', 'Next check-in', 'Meal budget', 'Today’s workout', 'How are you feeling today?', 'This week’s plan', 'Make food fit your budget', 'Want a coach in your corner?'];
    const all = document.querySelector('main').textContent;
    return want.map((w) => all.indexOf(w));
  });
  assert.ok(order.every((x) => x >= 0), 'all PX sections present: ' + order.join());
  assert.deepEqual([...order].sort((x, y) => x - y), order, 'in PX order');
});

await step('spring tokens are real linear() curves from the solver', async () => {
  const v = await page.evaluate(() => getComputedStyle(document.documentElement).getPropertyValue('--spring-bouncy').trim());
  assert.match(v, /^linear\(0, /);
  const ms = await page.evaluate(() => getComputedStyle(document.documentElement).getPropertyValue('--spring-smooth-ms').trim());
  assert.match(ms, /^\d+ms$/);
});

await step('cards enter staggered and settle fully visible', async () => {
  await page.reload();
  const early = await page.evaluate(() => [...document.querySelectorAll('.reveal')].slice(0, 6).map((e) => Number(getComputedStyle(e).opacity)));
  // Scroll through so below-the-fold cards reveal as a user would see them.
  for (let y = 0; y < 4000; y += 400) { await page.evaluate((yy) => window.scrollTo(0, yy), y); await page.waitForTimeout(90); }
  await page.waitForTimeout(1300);
  await page.evaluate(() => window.scrollTo(0, 0));
  await page.screenshot({ path: 'e2e/shots/m-dashboard.png', fullPage: true });
  const late = await page.evaluate(() => [...document.querySelectorAll('.reveal.in')].map((e) => [Number(getComputedStyle(e).opacity), getComputedStyle(e).transform]));
  assert.ok(early.some((o) => o < 1), 'something was mid-animation at load');
  assert.ok(late.length >= 8);
  assert.ok(late.every(([o, t]) => o === 1 && (t === 'none' || t === 'matrix(1, 0, 0, 1, 0, 0)')), JSON.stringify(late.find(([o]) => o !== 1)));
});

await step('count-ups land on real values; ring reflects sessions', async () => {
  await page.evaluate(() => {
    const s = globalThis.__kova; const st = s.startSession('full'); s.updateSet(st.id, 0, 0, { reps: 8, done: true }); s.finishSession(st.id, 3);
  });
  await page.reload();
  await page.waitForTimeout(1500);
  assert.equal(await page.getByTestId('ring-count').textContent(), '1');
  assert.match(await page.locator('.ring-wrap').getAttribute('aria-label'), /^1 of 7 sessions this week$/);
  const dash = await page.evaluate(() => Number(document.querySelector('.ring-val').getAttribute('stroke-dashoffset')));
  const circ = await page.evaluate(() => Number(document.querySelector('.ring-val').getAttribute('stroke-dasharray')));
  assert.ok(Math.abs(dash - circ * (1 - 1 / 7)) < 1, `${dash} vs ${circ}`);
  await page.getByText('1 week').first().waitFor(); // active streak
});

await step('mood picker: indicator slides to the choice and saves the check-in', async () => {
  await page.getByTestId('mood-good').click();
  await page.waitForTimeout(500);
  const [ind, opt] = await page.evaluate(() => [document.querySelector('.picker-ind').getBoundingClientRect().x, document.querySelector('[data-testid="mood-good"]').getBoundingClientRect().x]);
  assert.ok(Math.abs(ind - opt) < 2, `indicator ${ind} vs option ${opt}`);
  assert.equal(await page.evaluate(() => globalThis.__kova.get().checkins.at(-1).mood), 4);
  await page.getByTestId('tile-checkin').getByText('Done').waitFor();
  await page.getByTestId('mood-low').click();
  await page.waitForTimeout(120);
  const mid = await page.evaluate(() => document.querySelector('.picker-ind').getBoundingClientRect().x);
  await page.waitForTimeout(600);
  const end = await page.evaluate(() => [document.querySelector('.picker-ind').getBoundingClientRect().x, document.querySelector('[data-testid="mood-low"]').getBoundingClientRect().x]);
  assert.ok(Math.abs(mid - end[1]) > 2, 'indicator was moving (not a jump)');
  assert.ok(Math.abs(end[0] - end[1]) < 2);
});

await step('“Tell me more” opens the chat with mood already answered', async () => {
  await page.getByTestId('open-chat').click();
  await page.getByText('And your energy?').waitFor();
  await page.locator('.bubble.me', { hasText: 'Low' }).waitFor();
  await page.getByRole('button', { name: 'Close check-in' }).click();
});

await step('nav indicator sits under the active tab and moves on navigation', async () => {
  const pos = async () => page.evaluate(() => { const i = document.querySelector('.nav-ind').getBoundingClientRect(); const a = document.querySelector('.nav a[aria-current="page"]').getBoundingClientRect(); return [i.x + i.width / 2, a.x + a.width / 2]; });
  let [ix, ax] = await pos();
  assert.ok(Math.abs(ix - ax) < 3, `${ix} vs ${ax}`);
  await page.getByRole('link', { name: 'Insights' }).click();
  await page.waitForTimeout(600);
  [ix, ax] = await pos();
  assert.ok(Math.abs(ix - ax) < 3, `after nav ${ix} vs ${ax}`);
  await page.getByRole('link', { name: 'Today' }).click();
});

await step('workout start uses a View Transition and lands on the workout', async () => {
  await page.evaluate(() => { const s = globalThis.__kova; s.replaceAll({ ...s.get(), sessions: [] }); });
  await page.evaluate(() => { const orig = document.startViewTransition.bind(document); globalThis.__vt = 0; document.startViewTransition = (cb) => { globalThis.__vt++; return orig(cb); }; });
  await page.getByTestId('start-short').click();
  await page.locator('.workout').waitFor();
  assert.equal(await page.evaluate(() => globalThis.__vt), 1);
  await page.evaluate(() => { const s = globalThis.__kova; s.endSessionEarly(s.get().sessions.find((x) => x.status === 'in_progress').id); });
});

await step('frame rate stays smooth during the entrance (headless estimate)', async () => {
  await page.goto(url + '#home');
  await page.reload();
  const fps = await page.evaluate(() => new Promise((res) => { let n = 0; const t0 = performance.now(); const f = () => { n++; if (performance.now() - t0 < 1000) requestAnimationFrame(f); else res(n); }; requestAnimationFrame(f); }));
  assert.ok(fps >= 45, `fps ${fps}`);
});

await step('layout: tiles 2×2 on phone, 4 across on tablet; no overflow', async () => {
  const cols = async () => page.evaluate(() => getComputedStyle(document.querySelector('.tiles')).gridTemplateColumns.split(' ').length);
  assert.equal(await cols(), 2);
  await page.setViewportSize({ width: 820, height: 1180 });
  await page.waitForTimeout(200);
  assert.equal(await cols(), 4);
  await page.screenshot({ path: 'e2e/shots/m-dashboard-tablet.png' });
  for (const w of [390, 820, 1280]) { await page.setViewportSize({ width: w, height: 900 }); await page.waitForTimeout(100); assert.ok(await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth) <= 1, `${w}`); }
  await page.setViewportSize({ width: 390, height: 844 });
  assert.deepEqual(page.errors, []);
});
await a.ctx.close();

const r = await onboarded({ reducedMotion: 'reduce' });
page = r.p;
await step('reduced motion: no movement (opacity only), no ambient spin, no view transition', async () => {
  await page.reload();
  await page.waitForTimeout(60);
  const tr = await page.evaluate(() => [...document.querySelectorAll('.reveal')].map((e) => getComputedStyle(e).transform));
  assert.ok(tr.every((t) => t === 'none' || t === 'matrix(1, 0, 0, 1, 0, 0)'), 'no translate/scale: ' + tr.find((t) => t !== 'none'));
  assert.equal(await page.evaluate(() => getComputedStyle(document.querySelector('.aura')).animationName), 'none');
  await page.waitForTimeout(1200);
  assert.ok(await page.evaluate(() => [...document.querySelectorAll('.reveal.in')].every((e) => getComputedStyle(e).opacity === '1')), 'content fades in fully');
  await page.evaluate(() => { globalThis.__vt = 0; const o = document.startViewTransition?.bind(document); if (o) document.startViewTransition = (cb) => { globalThis.__vt++; return o(cb); }; });
  await page.getByTestId('start-full').click();
  await page.locator('.workout').waitFor();
  assert.equal(await page.evaluate(() => globalThis.__vt), 0);
  assert.deepEqual(page.errors, []);
});
await r.ctx.close();

await browser.close();
server.close();
for (const x of results) console.log(x.join('  '));
const failed = results.filter((x) => x[0] === 'FAIL').length;
console.log(`\n${results.length - failed}/${results.length} passed`);
process.exit(failed ? 1 : 0);
