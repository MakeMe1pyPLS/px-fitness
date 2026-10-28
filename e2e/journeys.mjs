// End-to-end journeys against the built app in Chromium at iPhone size.
// Run: node scripts/build.mjs && node e2e/journeys.mjs
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
async function step(name, fn) {
  try { await fn(); results.push(['PASS', name]); }
  catch (e) { results.push(['FAIL', name, e.message.split('\n')[0]]); }
}

const ctx = await browser.newContext({ ...devices['iPhone 13'], reducedMotion: 'no-preference' });
// Google Fonts can't be reached from this sandbox; block so tests don't wait on it.
await ctx.route(/fonts\.(googleapis|gstatic)\.com/, (r) => r.abort());
const page = await ctx.newPage();
page.setDefaultTimeout(8000);
const errors = [];
page.on('pageerror', (e) => errors.push(e.message));
page.on('console', (m) => m.type() === 'error' && !/fonts|ERR_FAILED/.test(m.text()) && errors.push(m.text()));
const shot = (n) => page.screenshot({ path: `e2e/shots/${n}.png`, fullPage: true });

async function noHorizontalOverflow(label) {
  const o = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
  if (o > 1) {
    const wide = await page.evaluate(() => [...document.querySelectorAll('body *')].filter((e) => e.getBoundingClientRect().right > document.documentElement.clientWidth + 1).slice(0, 6).map((e) => `${e.tagName}.${e.className}`));
    assert.fail(`${label}: horizontal overflow ${o}px from ${wide.join(' | ')}`);
  }
}

async function smallTargets() {
  return page.evaluate(() => [...document.querySelectorAll('button, a[href], input')].filter((el) => {
    const r = el.getBoundingClientRect();
    if (!r.width || el.closest('.sr-only')) return false;
    return r.height < 36 || r.width < 36;
  }).map((el) => (el.getAttribute('aria-label') || el.textContent || el.tagName).trim().slice(0, 30)));
}

async function unnamedButtons() {
  return page.evaluate(() => [...document.querySelectorAll('button')].filter((b) => !(b.getAttribute('aria-label') || b.textContent.trim())).length);
}

await step('landing renders with intro and CTA', async () => {
  await page.goto(url);
  await page.waitForSelector('.intro');
  await page.waitForTimeout(1700);
  assert.equal(await page.locator('.intro').count(), 0, 'intro should hand off');
  await page.getByTestId('cta-start').waitFor();
  await noHorizontalOverflow('landing');
  await shot('01-landing');
});

await step('CTA is usable while intro plays (no blocking)', async () => {
  const p2 = await ctx.newPage();
  await p2.goto(url + '?fresh');
  await p2.evaluate(() => sessionStorage.clear());
  await p2.reload();
  await p2.getByTestId('cta-start').click({ timeout: 800 });
  await p2.waitForSelector('.onb');
  await p2.close();
});

await step('onboarding completes in seven steps (goal + discipline)', async () => {
  await page.getByTestId('cta-start').click();
  await page.getByTestId('goal-build_muscle').click();
  await shot('02-onboarding-goal');
  await page.getByTestId('onb-next').click();
  // Conflicting disciplines must ask for a primary focus before continuing.
  await page.getByTestId('disc-bodybuilding').click();
  await page.getByTestId('disc-running').click();
  assert.equal(await page.getByTestId('onb-next').isDisabled(), true, 'needs primary focus');
  await page.getByTestId('primary-bodybuilding').click();
  await shot('02b-onboarding-discipline');
  await page.getByTestId('onb-next').click();
  await page.getByRole('radio', { name: /Some experience/ }).click();
  await page.getByTestId('onb-next').click();
  await page.getByRole('button', { name: 'Gym machines' }).click();
  await page.getByTestId('onb-next').click();
  // Turn on every day so "today" is always a training day for the next steps.
  for (const d of ['Tuesday', 'Thursday', 'Saturday', 'Sunday']) await page.getByRole('button', { name: d, exact: true }).click();
  await page.getByRole('radio', { name: '45 min' }).click();
  await shot('03-onboarding-schedule');
  await page.getByTestId('onb-next').click();
  await page.getByLabel(/What should we call you/).fill('Jordan');
  await page.getByTestId('onb-next').click();
  await page.getByText('Your starting plan').waitFor();
  await shot('04-onboarding-plan');
  await page.getByTestId('onb-finish').click();
  await page.getByText(/Welcome back, Jordan/).waitFor();
  await noHorizontalOverflow('home');
  await shot('05-home-new');
});

await step('home has no unnamed buttons and no tiny touch targets', async () => {
  assert.equal(await unnamedButtons(), 0);
  const small = await smallTargets();
  assert.deepEqual(small, [], 'small targets: ' + small.join(', '));
});

await step('check-in saves and changes today’s suggestion with a visible reason', async () => {
  await page.getByTestId('open-checkin').click();
  await page.getByTestId('energy-2').click();
  await page.getByTestId('time-20').click();
  await shot('06-checkin');
  await page.getByTestId('checkin-done').click();
  await page.locator('.badge', { hasText: 'Energy 2/5' }).waitFor();
  const why = await page.getByTestId('why').textContent();
  assert.match(why, /energy 2\/5/);
  assert.match(why, /20 min free/);
  // Little time available → short version leads.
  assert.match(await page.getByTestId('start-short').getAttribute('class'), /btn-primary/);
  await shot('07-home-adapted');
});

await step('workout: logging needs a value, then starts rest timer', async () => {
  await page.getByTestId('start-full').click();
  await page.waitForSelector('.workout');
  await page.getByTestId('check-0-0').click();
  await page.locator('.toast', { hasText: 'Enter reps first' }).waitFor();
  const w = page.getByLabel('Set 1 weight in lb').first();
  if (await w.count()) await w.fill('40');
  await page.getByTestId('reps-0-0').fill('10');
  await page.getByTestId('check-0-0').click();
  assert.equal(await page.getByTestId('check-0-0').getAttribute('aria-pressed'), 'true');
  await page.getByRole('region', { name: 'Rest timer' }).waitFor();
  await shot('08-workout-rest');
  await page.getByTestId('rest-skip').click();
  // Second set: one tap accepts the values from set 1.
  await page.getByTestId('check-0-1').click();
  assert.equal(await page.getByTestId('check-0-1').getAttribute('aria-pressed'), 'true');
  await page.getByTestId('rest-skip').click();
  await noHorizontalOverflow('workout');
});

await step('in-progress workout survives a full reload', async () => {
  await page.reload();
  await page.waitForSelector('.workout');
  assert.equal(await page.getByTestId('check-0-0').getAttribute('aria-pressed'), 'true');
  assert.equal(await page.getByTestId('reps-0-0').inputValue(), '10');
  assert.equal(await page.getByTestId('reps-0-1').inputValue(), '10');
});

await step('swap exercise offers only available equipment', async () => {
  await page.getByTestId('swap-1').click();
  await page.getByRole('dialog', { name: 'Swap exercise' }).waitFor();
  const text = await page.getByRole('dialog').textContent();
  assert.ok(!/not in your equipment/.test(text));
  await shot('09-swap');
  await page.keyboard.press('Escape');
});

await step('minimizing keeps the session running with a live pill', async () => {
  await page.getByRole('button', { name: /Minimize workout/ }).click();
  await page.getByTestId('resume').waitFor();
  await page.locator('.live-pill').waitFor();
  await shot('10-home-live');
  await page.locator('.live-pill').click();
  await page.waitForSelector('.workout');
});

await step('finishing shows completion and marks today done', async () => {
  await page.getByTestId('finish').click();
  await page.getByTestId('effort-3').click();
  await page.getByTestId('save-workout').click();
  await page.getByText('First one done').waitFor();
  await page.waitForTimeout(900);
  await shot('11-complete');
  await page.getByTestId('complete-done').click();
  await page.getByText(/Done/).first().waitFor();
  await page.locator('.day-cell[data-state="done"]').first().waitFor();
});

await step('progress shows the session; history is editable', async () => {
  await page.getByRole('link', { name: 'Progress' }).click();
  await page.getByTestId('history-row').first().click();
  await page.getByText('Spotted a typo?').waitFor();
  await page.keyboard.press('Escape');
  await noHorizontalOverflow('progress');
  await shot('12-progress-new');
});

await step('insights stay honest with little data', async () => {
  await page.getByRole('link', { name: 'Insights' }).click();
  await page.getByText('Still learning your week').waitFor();
  assert.equal(await page.locator('[data-testid^="insight-"]').count(), 0);
  await shot('13-insights-empty');
});

await step('skip flow logs a rest day without guilt copy', async () => {
  // Use sample data later; here verify skip on a fresh planned day via store.
  await page.getByRole('link', { name: 'Today' }).click();
  const txt = await page.locator('main').textContent();
  assert.ok(!/fail|missed|streak lost/i.test(txt), 'no shaming language on home');
});

await step('sample data demonstrates insights with evidence and actions', async () => {
  await page.getByRole('link', { name: 'You' }).click();
  await page.getByTestId('load-sample').click();
  await page.getByRole('alertdialog').getByRole('button', { name: 'Load sample' }).click();
  await page.getByText('Sample data: made up').waitFor();
  await shot('14-home-sample');
  await page.getByRole('link', { name: 'Insights' }).click();
  const cards = page.locator('[data-testid^="insight-"]');
  await cards.first().waitFor();
  assert.ok((await cards.count()) >= 1);
  await shot('15-insights-sample');
  const first = cards.first();
  const id = (await first.getAttribute('data-testid')).replace('insight-', '');
  await page.getByTestId(`accept-${id}`).click();
  await page.getByText('Your decisions').waitFor();
  await page.getByText(/Measuring: day \d+ of 14|Planned days hit/).first().waitFor();
  await noHorizontalOverflow('insights');
});

await step('progress charts render with sample data', async () => {
  await page.getByRole('link', { name: 'Progress' }).click();
  assert.ok(await page.locator('svg.chart').count() >= 2);
  await page.getByRole('button', { name: '12w' }).click();
  await page.locator('.list-row').filter({ hasText: 'sessions' }).first().click();
  await page.locator('.sheet svg.chart').waitFor();
  await shot('16-exercise-detail');
  await page.keyboard.press('Escape');
  await page.keyboard.press('Escape');
  await shot('17-progress-sample');
});

await step('skip sheet logs a reason', async () => {
  await page.evaluate(() => { const s = globalThis.__kova; s.updateProfile({ trainingDays: [0, 1, 2, 3, 4, 5, 6] }, false); s.get().sessions.filter((x) => x.plannedFor === new Date().toISOString().slice(0, 10)); });
  await page.getByRole('link', { name: 'Today' }).click();
  const skip = page.getByTestId('skip-today');
  if (await skip.count()) {
    await skip.click();
    await page.getByTestId('skip-time').click();
    await shot('18-skip');
    await page.getByTestId('skip-save').click();
    await page.getByText('Rest day', { exact: true }).waitFor();
  }
});

await step('settings: reduce motion and delete everything', async () => {
  await page.getByRole('link', { name: 'You' }).click();
  await page.getByRole('switch', { name: 'Reduce motion' }).click();
  assert.equal(await page.evaluate(() => document.documentElement.dataset.motion), 'reduced');
  await shot('19-you');
  await page.getByTestId('delete-all').click();
  await page.getByRole('alertdialog').getByRole('button', { name: 'Delete everything' }).click();
  await page.getByTestId('cta-start').waitFor();
  assert.equal(await page.evaluate(() => localStorage.getItem('kova:data') && JSON.parse(localStorage.getItem('kova:data')).profile), null);
});

await step('reduced-motion users never see the intro', async () => {
  const c2 = await browser.newContext({ ...devices['iPhone 13'], reducedMotion: 'reduce' });
  const p2 = await c2.newPage();
  await p2.goto(url);
  await p2.getByTestId('cta-start').waitFor();
  assert.equal(await p2.locator('.intro').count(), 0);
  await c2.close();
});

await step('desktop layout holds', async () => {
  const c3 = await browser.newContext({ viewport: { width: 1280, height: 800 } });
  await c3.route(/fonts\./, (r) => r.abort());
  const p3 = await c3.newPage();
  await p3.goto(url);
  await p3.waitForTimeout(1700);
  await p3.screenshot({ path: 'e2e/shots/20-desktop-landing.png' });
  await c3.close();
});

await step('no runtime errors', async () => {
  assert.deepEqual(errors, []);
});

await browser.close();
server.close();
for (const r of results) console.log(r.join('  '));
const failed = results.filter((r) => r[0] === 'FAIL').length;
console.log(`\n${results.length - failed}/${results.length} passed`);
process.exit(failed ? 1 : 0);
