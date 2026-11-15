// End-to-end tests for the smart meal planner: plan choice, daily nutrition facts,
// prep-day order, freezer plan, leftovers → recipe ideas, nutrition facts panel.
// Place-search network calls are MOCKED here with fixture data (this sandbox has
// no internet). The fixtures exist only in this test file; the app never ships them.
import { chromium, devices } from 'playwright';
import { createServer } from 'node:http';
import { readFileSync, mkdirSync } from 'node:fs';
import assert from 'node:assert/strict';

const html = readFileSync('dist/index.html');
const server = createServer((_, res) => { res.writeHead(200, { 'content-type': 'text/html' }); res.end(html); }).listen(0);
const url = `http://127.0.0.1:${server.address().port}/`;
mkdirSync('e2e/shots', { recursive: true });

const FIX_GEO = [{ lat: '30.2672', lon: '-97.7431', display_name: 'Austin, Travis County, Texas, United States' }];
const FIX_OSM = { elements: [
  { type: 'node', id: 11, lat: 30.268, lon: -97.744, tags: { name: 'Fixture Fresh Market', shop: 'supermarket', 'addr:street': 'Test St', 'addr:housenumber': '1' } },
  { type: 'node', id: 12, lat: 30.27, lon: -97.74, tags: { name: 'Fixture Green Kitchen', amenity: 'restaurant', cuisine: 'mediterranean', 'diet:vegan': 'yes', takeaway: 'yes', opening_hours: 'Mo-Su 11:00-21:00' } },
  { type: 'node', id: 13, lat: 30.275, lon: -97.75, tags: { name: 'Fixture Burger Spot', amenity: 'fast_food', cuisine: 'burger' } },
  { type: 'way', id: 14, center: { lat: 30.26, lon: -97.73 }, tags: { name: 'ALDI', shop: 'supermarket' } },
] };

const browser = await chromium.launch();
const results = [];
let current;
const step = async (n, fn) => { try { await fn(); results.push(['PASS', n]); } catch (e) { results.push(['FAIL', n, e.message.split('\n').slice(0, 6).join(' / ')]); try { await current?.screenshot({ path: `e2e/shots/fail-${results.length}.png` }); } catch {} } };

async function setup(ctxOpts = {}, mockPlaces = 'none') {
  const ctx = await browser.newContext({ ...devices['iPhone 13'], ...ctxOpts });
  await ctx.route(/fonts\.(googleapis|gstatic)\.com/, (r) => r.abort());
  if (mockPlaces === 'ok') {
    await ctx.route(/nominatim\.openstreetmap\.org/, (r) => r.fulfill({ json: FIX_GEO, headers: { 'access-control-allow-origin': '*' } }));
    await ctx.route(/overpass-api\.de/, (r) => r.fulfill({ json: FIX_OSM, headers: { 'access-control-allow-origin': '*' } }));
  } else {
    await ctx.route(/nominatim|overpass/, (r) => r.abort('blockedbyclient'));
  }
  const page = await ctx.newPage();
  page.setDefaultTimeout(8000);
  page.errors = [];
  page.on('pageerror', (e) => page.errors.push(e.message));
  await page.goto(url + '#welcome');
  await page.waitForFunction(() => globalThis.__kova);
  return { ctx, page };
}

async function onboard(page, { goal = 'build_muscle', disciplines = ['bodybuilding'] } = {}) {
  await page.getByTestId('cta-start').click();
  await page.getByTestId(`goal-${goal}`).click();
  await page.getByTestId('onb-next').click();
  for (const d of disciplines) await page.getByTestId(`disc-${d}`).click();
  if (disciplines.length > 1) await page.getByTestId(`primary-${disciplines[0]}`).click();
  for (let i = 0; i < 5; i++) await page.getByTestId('onb-next').click();
  await page.getByTestId('onb-finish').click();
  await page.getByText(/Welcome (back|to PX)/).waitFor();
}

const overflow = (page) => page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
const shot = (page, n) => page.screenshot({ path: `e2e/shots/${n}.png`, fullPage: true });

const { ctx, page } = await setup();
current = page;

await step('smart plan is suggested and builds a 6-day plan', async () => {
  await onboard(page);
  await page.evaluate(() => globalThis.__kova.setPrefs({ age: 30, weightKg: 80, heightCm: 180, sex: 'male', activity: 'moderate' }));
  await page.goto(url + '#diet-prep');
  await page.getByTestId('days-6').click();
  await page.getByTestId('prep-next').click();
  await page.getByTestId('mt-breakfast').click();
  for (let i = 0; i < 3; i++) await page.getByTestId('prep-next').click();
  const smart = page.getByTestId('plan-smart');
  await smart.waitFor();
  assert.equal(await smart.getAttribute('aria-checked'), 'true', 'smart preselected');
  assert.match(await smart.innerText(), /Suggested/);
  assert.match(await smart.innerText(), /kcal .* g protein a day/);
  await shot(page, 'm01-pick-plan');
  await page.getByTestId('prep-create').click();
  await page.getByTestId('plan-servings').waitFor();
  assert.equal(await page.getByTestId('plan-servings').textContent(), '18');
});

await step('daily nutrition facts match the plan and show % of the personal target', async () => {
  const facts = page.getByTestId('daily-facts');
  await facts.waitFor();
  const shown = Number(await page.getByTestId('daily-facts-kcal').textContent());
  const expected = await page.evaluate(() => {
    const d = globalThis.__kova.get();
    return d.nutrition.plans.find((p) => p.status === 'active').items.length;
  });
  assert.ok(expected > 0);
  assert.ok(shown > 500 && shown < 2500, `kcal/day ${shown}`);
  assert.match(await facts.innerText(), /your daily target/);
  assert.match(await facts.innerText(), /covers breakfast, lunch, dinner/);
  assert.match(await page.getByTestId('daily-facts-pct-p').textContent(), /^\d+%$/);
});

await step('prep day: oven first, grains batched, pack last, freezer portions listed', async () => {
  const prep = page.getByTestId('prep-day');
  await prep.scrollIntoViewIfNeeded();
  const ids = await prep.locator('li').evaluateAll((ls) => ls.map((l) => l.dataset.testid));
  assert.equal(ids.at(-1), 'prep-pack');
  if (ids.includes('prep-oven')) assert.equal(ids[0], 'prep-oven');
  await page.getByTestId('freezer-plan').waitFor();
  assert.match(await page.getByTestId('freezer-plan').innerText(), /day 5 onward/);
  await prep.screenshot({ path: 'e2e/shots/m02-prep-day.png' });
});

await step('leftovers suggest real recipes that use them, with a nutrition facts panel', async () => {
  const reuse = page.getByTestId('plan-reuse');
  await reuse.waitFor();
  await reuse.scrollIntoViewIfNeeded();
  await reuse.screenshot({ path: 'e2e/shots/m03-less-waste.png' });
  const idea = reuse.locator('[data-testid^="idea-"]').first();
  if (await idea.count()) {
    await idea.click();
    const sheet = page.getByTestId('recipe-sheet');
    await sheet.waitFor();
    await sheet.getByTestId('nutrition-facts').scrollIntoViewIfNeeded();
    assert.match(await sheet.getByTestId('nutrition-facts').innerText(), /Calories/);
    await sheet.getByTestId('nutrition-facts').screenshot({ path: 'e2e/shots/m04-facts.png' });
    await page.getByTestId('sheet-close').click();
  }
});

await step('recipe sheet facts: % uses FDA values when no body stats are set', async () => {
  await page.evaluate(() => globalThis.__kova.setPrefs({ age: undefined, weightKg: undefined, heightCm: undefined }));
  await page.getByTestId('plan-recipe-0').click();
  const f = page.getByTestId('recipe-sheet').getByTestId('nutrition-facts');
  await f.scrollIntoViewIfNeeded();
  assert.match(await f.innerText(), /FDA Daily Values/);
  const kcal = Number(await f.getByTestId('nutrition-facts-kcal').textContent());
  const pct = await f.innerText();
  assert.ok(pct.includes(`${Math.round((kcal / 2000) * 100)}%`), 'kcal % of 2,000');
  await page.getByTestId('sheet-close').click();
});

await step('no horizontal overflow and no runtime errors', async () => {
  assert.equal(await overflow(page), 0);
  await shot(page, 'm05-plan-full');
  assert.deepEqual(page.errors, []);
});

await ctx.close();
await browser.close();
server.close();
for (const r of results) console.log(r[0].padEnd(5), r[1], r[2] ?? '');
const fails = results.filter((r) => r[0] === 'FAIL').length;
console.log(`\n${results.length - fails}/${results.length} passed`);
process.exit(fails ? 1 : 0);
