// End-to-end tests for goals + Diet Plan, mapped to the 17 checks in the brief.
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

await step('1. user selects a goal and a training discipline', async () => {
  await onboard(page, { goal: 'lose_fat', disciplines: ['calisthenics'] });
  const p = await page.evaluate(() => globalThis.__kova.get().profile);
  assert.equal(p.goal, 'lose_fat');
  assert.deepEqual(p.disciplines, ['calisthenics']);
  const ex = await page.evaluate(() => globalThis.__kova.get().templates.flatMap((t) => t.exercises.map((e) => e.exerciseId)));
  assert.ok(ex.some((id) => ['pull-up', 'negative-pull-up', 'dip', 'hollow-hold'].includes(id)), 'calisthenics plan');
});

await step('2. selections persist after refreshing', async () => {
  await page.reload();
  await page.getByRole('link', { name: 'You' }).click();
  await page.getByText('Lose body fat').first().waitFor();
  await page.getByText('Calisthenics').first().waitFor();
});

await step('3. Diet Plan reflects the goal; usable before setting preferences', async () => {
  await page.getByRole('link', { name: 'Meals' }).click();
  await page.locator('.badge', { hasText: 'Lose body fat' }).waitFor();
  await page.locator('.badge', { hasText: 'Calisthenics' }).waitFor();
  await page.getByTestId('choose-meal').getByTestId('rec-name').waitFor();
  await page.getByTestId('meal-prep-btn').waitFor();
  await page.getByTestId('near-btn').waitFor();
  assert.ok(await overflow(page) <= 1, 'overflow');
  await shot(page, 'd01-diet-home');
});

await step('7. Choose a Meal for Me: shuffle, reject, accept and log', async () => {
  const cm = page.getByTestId('choose-meal');
  const first = await cm.getByTestId('rec-name').textContent();
  await cm.getByTestId('rec-shuffle').click();
  const second = await cm.getByTestId('rec-name').textContent();
  assert.notEqual(first, second);
  await cm.getByTestId('rec-reject').click();
  const third = await cm.getByTestId('rec-name').textContent();
  assert.ok(third !== second && third !== first);
  await cm.getByTestId('rec-accept').click();
  const log = await page.evaluate(() => globalThis.__kova.get().nutrition.log.map((l) => l.name));
  assert.ok(log.includes(third));
  const fb = await page.evaluate(() => globalThis.__kova.get().nutrition.feedback.map((f) => f.kind));
  assert.deepEqual(fb.slice(-3), ['shuffled', 'rejected', 'accepted']);
});

await step('5. vegan + peanut allergy: suggestions and recipes respect them', async () => {
  await page.getByTestId('nav-diet-prefs').click();
  await page.getByTestId('pattern-vegan').click();
  await page.getByTestId('allergy-peanut').click();
  await page.getByTestId('body-age').fill('30');
  await page.getByTestId('body-ft').fill('5');
  await page.getByTestId('body-in').fill('9');
  await page.getByTestId('body-lb').fill('170');
  await shot(page, 'd02-prefs');
  await page.getByTestId('prefs-save').click();
  for (const mt of ['Breakfast', 'Lunch', 'Dinner', 'Snack']) {
    await page.getByTestId('choose-meal').getByRole('button', { name: mt, exact: true }).click();
    if (!(await page.getByTestId('choose-meal').getByTestId('rec-recipe').count())) continue;
    await page.getByTestId('choose-meal').getByTestId('rec-recipe').click();
    const text = (await page.getByTestId('recipe-sheet').locator('.ing-list li .grow').allTextContents()).map((t) => t.replace(/\(instead of.*\)/, '')).join(' | ');
    assert.ok(!/Peanut butter|Chicken|Ground beef|Eggs, large|Milk|yogurt|Cheddar|tuna/i.test(text), `${mt}: ${text}`);
    await page.keyboard.press('Escape');
  }
  // Targets now available (estimates)
  await page.getByText('Daily targets · estimates').waitFor();
  await page.getByText(/kcal/).first().waitFor();
});

await step('4. set and change a food budget; spending updates remaining', async () => {
  await page.getByTestId('nav-diet-budget').click();
  await page.getByTestId('budget-amount').fill('60');
  await page.getByTestId('budget-save').click();
  await page.getByTestId('budget-remaining').waitFor();
  assert.equal(await page.getByTestId('budget-remaining').textContent(), '$60.00');
  await page.getByTestId('spend-amount').fill('22.5');
  await page.getByTestId('spend-add').click();
  assert.equal(await page.getByTestId('budget-remaining').textContent(), '$37.50');
  await page.getByTestId('period-day').click();
  await page.getByTestId('budget-amount').fill('10');
  await page.getByTestId('budget-save').click();
  assert.equal(await page.getByTestId('budget-remaining').textContent(), '$47.50');
  await shot(page, 'd03-budget');
  await page.getByRole('button', { name: 'Back to Diet Plan' }).click();
});

await step('6. Meal Prep creates a usable plan with a consolidated grocery list', async () => {
  await page.getByTestId('meal-prep-btn').click();
  await page.getByTestId('days-3').click();
  await page.getByTestId('prep-next').click();
  await page.getByTestId('prep-next').click();
  await page.getByTestId('prep-next').click();
  await page.getByTestId('prep-next').click();
  await page.getByTestId('plan-budget').waitFor();
  await shot(page, 'd04-prep-compare');
  await page.getByTestId('plan-budget').click();
  await page.getByTestId('prep-create').click();
  await page.getByTestId('plan-servings').waitFor();
  assert.equal(await page.getByTestId('plan-servings').textContent(), '6');
  await shot(page, 'd05-plan');
  const ids = await page.evaluate(() => globalThis.__kova.get().nutrition.grocery.map((g) => g.ingredientId).filter(Boolean));
  assert.ok(ids.length > 3);
  assert.equal(new Set(ids).size, ids.length, '9. no duplicate ingredients');
});

await step('8. recipe serving changes update ingredient quantities', async () => {
  await page.getByTestId('plan-recipe-0').click();
  const firstQty = page.getByTestId('recipe-sheet').locator('.qty').first();
  const before = await firstQty.textContent();
  const n = Number(await page.getByTestId('serv-count').textContent());
  for (let i = 0; i < n; i++) await page.getByTestId('serv-plus').click(); // double it
  const after = await firstQty.textContent();
  assert.notEqual(before, after, `${before} → ${after}`);
  const num = (s) => parseFloat(s);
  assert.ok(Math.abs(num(after) / num(before) - 2) < 0.35, `${before} → ${after} should roughly double`);
});

await step('10. ingredient substitution updates plan, grocery list and cost', async () => {
  const sheet = page.getByTestId('recipe-sheet');
  const select = sheet.locator('select.swap-select').first();
  assert.ok(await select.count(), 'a swappable ingredient');
  const costBefore = await sheet.getByTestId('batch-cost').textContent();
  const opts = await select.locator('option').evaluateAll((os) => os.map((o) => o.value).filter(Boolean));
  await select.selectOption(opts[0]);
  const costAfter = await sheet.getByTestId('batch-cost').textContent();
  assert.notEqual(costBefore, costAfter, 'cost recalculated');
  await page.keyboard.press('Escape');
  const g = await page.evaluate((id) => globalThis.__kova.get().nutrition.grocery.some((x) => x.ingredientId === id), opts[0]);
  assert.ok(g, 'grocery list includes the substitute');
  await page.getByText('Your swaps:').first().waitFor();
});

await step('grocery list: check off, edit price, total recalculates, persists', async () => {
  await page.getByTestId('to-grocery').click();
  const total0 = await page.getByTestId('grocery-total').textContent();
  const priceBtn = page.locator('.price-btn').first();
  await priceBtn.click();
  await page.getByTestId('price-input').fill('19.99');
  await page.getByTestId('price-save').click();
  const total1 = await page.getByTestId('grocery-total').textContent();
  assert.notEqual(total0, total1);
  await page.locator('.price-btn .src-you').first().waitFor();
  await page.getByTestId('grocery-check').first().check();
  await page.getByTestId('grocery-add').fill('Coffee');
  await page.getByTestId('grocery-add').press('Enter');
  await shot(page, 'd06-grocery');
  await page.reload();
  await page.getByText('Coffee').waitFor();
  assert.equal(await page.getByTestId('grocery-check').first().isChecked(), true);
});

await step('11a. location search with manual entry (mock blocked network) shows honest fallback', async () => {
  await page.goto(url + '#diet-near');
  await page.getByTestId('loc-input').fill('Austin TX');
  await page.getByTestId('loc-search').click();
  await page.getByTestId('near-error').waitFor();
  await page.getByTestId('map-links').waitFor();
  assert.equal(await page.getByTestId('place').count(), 0, '13. no fabricated listings');
  await shot(page, 'd07-near-blocked');
});

await ctx.close();

// Mocked live search
const live = await setup({ geolocation: { latitude: 30.26715, longitude: -97.74306 }, permissions: ['geolocation'] }, 'ok');
await step('11b/12. manual location search returns sourced places with filters, list and map', async () => {
  const p = live.page;
  await onboard(p);
  await p.goto(url + '#diet-near');
  await p.getByTestId('loc-input').fill('Austin TX');
  await p.getByTestId('loc-search').click();
  await p.getByTestId('place').first().waitFor();
  assert.equal(await p.getByTestId('place').count(), 4);
  await p.getByText(/OpenStreetMap contributors/).waitFor();
  await p.getByText('Prices and menu nutrition aren’t available for this place.').first().waitFor();
  await p.getByText(/Listed hours \(may be out of date\)/).waitFor();
  assert.equal(await p.getByRole('button', { name: 'Open now' }).isDisabled(), true, '13. open-now disabled without reliable hours');
  await shot(p, 'd08-near-results');
  await p.getByRole('button', { name: 'Vegan', exact: true }).click();
  const names = await p.getByTestId('place').locator('b').allTextContents();
  assert.ok(names.includes('Fixture Green Kitchen') && !names.includes('Fixture Burger Spot'), names.join());
  await p.getByRole('button', { name: 'Map', exact: true }).click();
  await p.locator('svg[aria-label^="Map of"]').waitFor();
  await shot(p, 'd09-near-map');
  await p.getByRole('button', { name: 'List', exact: true }).click();
  await p.getByRole('button', { name: /Save Fixture Green Kitchen/ }).click();
  await p.getByText('Saved places').waitFor();
  const loc = await p.evaluate(() => globalThis.__kova.get().nutrition.location);
  assert.equal(loc.lat, 30.27, 'location stored coarsely');
});

await step('11c. device location with permission (explained first, coarse only)', async () => {
  const p = live.page;
  await p.getByTestId('use-location').click();
  await p.getByText(/rounded to about 1 km/).waitFor();
  await p.getByTestId('geo-allow').click();
  await p.getByTestId('place').first().waitFor();
  const loc = await p.evaluate(() => globalThis.__kova.get().nutrition.location);
  assert.equal(loc.label, 'Near you (approx.)');
  assert.equal(loc.lat, 30.27);
});
await live.ctx.close();

const denied = await setup({ permissions: [] }, 'ok');
await step('11d. location permission denied falls back to manual entry', async () => {
  const p = denied.page;
  await onboard(p);
  await p.goto(url + '#diet-near');
  await p.getByTestId('use-location').click();
  await p.getByTestId('geo-allow').click();
  await p.getByText(/enter a city or ZIP instead/i).waitFor({ timeout: 15000 });
});
await denied.ctx.close();

const g = await setup();
await step('14. changing goal/discipline updates both workout plan and diet', async () => {
  const p = g.page;
  await onboard(p, { goal: 'build_muscle', disciplines: ['bodybuilding'] });
  await p.getByRole('link', { name: 'You' }).click();
  await p.getByTestId('edit-goals').click();
  await p.getByTestId('goal-gain_weight').click();
  await p.getByRole('button', { name: 'Training style' }).click();
  await p.getByTestId('disc-bodybuilding').click();
  await p.getByTestId('disc-powerlifting').click();
  await p.getByTestId('save-goals').click();
  const t = await p.evaluate(() => globalThis.__kova.get().templates.map((x) => x.name));
  assert.ok(t.includes('Squat Day'), t.join());
  await p.getByRole('link', { name: 'Meals' }).click();
  await p.locator('.badge', { hasText: 'Gain weight' }).waitFor();
  await p.locator('.badge', { hasText: 'Powerlifting' }).waitFor();
  const hist = await p.evaluate(() => globalThis.__kova.get().profile.goalHistory.length);
  assert.ok(hist >= 2, 'goal history kept');
});

await step('15. saved preferences influence future recommendations', async () => {
  const p = g.page;
  const before = await p.getByTestId('choose-meal').getByTestId('rec-name').textContent();
  await p.getByTestId('choose-meal').getByTestId('rec-reject').click();
  await p.reload();
  await p.getByTestId('choose-meal').getByTestId('rec-name').waitFor();
  const after = await p.getByTestId('choose-meal').getByTestId('rec-name').textContent();
  assert.notEqual(before, after, 'rejected meal stays down after reload');
});

await step('16. mobile, tablet and desktop layouts have no horizontal overflow', async () => {
  const p = g.page;
  for (const [w, h] of [[390, 844], [820, 1180], [1280, 800]]) {
    await p.setViewportSize({ width: w, height: h });
    for (const r of ['diet', 'diet-prep', 'diet-grocery', 'diet-near', 'diet-budget', 'diet-prefs', 'diet-saved', 'diet-meals']) {
      await p.goto(url + '#' + r);
      await p.waitForTimeout(150);
      assert.ok(await overflow(p) <= 1, `${r} @${w}px overflows`);
    }
  }
  await p.setViewportSize({ width: 1280, height: 800 });
  await p.goto(url + '#diet');
  await p.screenshot({ path: 'e2e/shots/d10-desktop-diet.png' });
});

await step('17. empty states and no runtime errors', async () => {
  const p = g.page;
  await p.setViewportSize({ width: 390, height: 844 });
  await p.goto(url + '#diet-grocery');
  await p.getByText(/Your list is empty/).waitFor();
  await p.goto(url + '#diet-saved');
  await p.getByRole('button', { name: 'Saved', exact: true }).click();
  await p.getByText(/Save or rate a recipe/).waitFor();
  assert.deepEqual(p.errors, []);
});
await g.ctx.close();

await browser.close();
server.close();
for (const r of results) console.log(r.join('  '));
const failed = results.filter((r) => r[0] === 'FAIL').length;
console.log(`\n${results.length - failed}/${results.length} passed`);
process.exit(failed ? 1 : 0);
