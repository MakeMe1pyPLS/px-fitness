// Focus view, fidget pad, selection reward and rest-timer bubbles.
import { chromium, devices } from 'playwright';
import { createServer } from 'node:http';
import { readFileSync } from 'node:fs';
import assert from 'node:assert/strict';
const html = readFileSync('dist/index.html');
const server = createServer((_, res) => { res.writeHead(200, { 'content-type': 'text/html' }); res.end(html); }).listen(0);
const url = `http://127.0.0.1:${server.address().port}/`;
const browser = await chromium.launch();
const ctx = await browser.newContext({ ...devices['iPhone 13'] });
await ctx.route(/fonts\./, (r) => r.abort());
const page = await ctx.newPage(); page.setDefaultTimeout(8000);
const errors = []; page.on('pageerror', (e) => errors.push(e.message));
const results = [];
const step = async (n, fn) => { try { await fn(); results.push(['PASS', n]); } catch (e) { results.push(['FAIL', n, e.message.split('\n')[0]]); } };

await step('picking a goal marks it and fires a spark burst', async () => {
  await page.goto(url + '#welcome');
  await page.getByTestId('cta-start').click();
  await page.getByTestId('goal-strength').click();
  await page.locator('.fx-burst').first().waitFor({ state: 'attached' });
  assert.equal(await page.getByTestId('goal-strength').getAttribute('aria-checked'), 'true');
  for (let i = 0; i < 6; i++) await page.getByTestId('onb-next').click();
  await page.getByTestId('onb-finish').click();
  await page.getByTestId('open-chat').waitFor();
});
await step('Focus view shows only the next thing, and remembers it', async () => {
  await page.getByTestId('focus-toggle').click();
  await page.getByTestId('focus-note').waitFor();
  assert.equal(await page.locator('.dash > .tiles, .dash > .hero-card').evaluateAll((els) => els.filter((e) => getComputedStyle(e).display !== 'none').length), 0);
  assert.ok(await page.locator('.dash .today').isVisible());
  await page.reload();
  await page.getByTestId('focus-note').waitFor();
  await page.getByTestId('focus-toggle').click();
  assert.equal(await page.getByTestId('focus-note').count(), 0);
});
await step('Spin dial clicks through detents and counts spins', async () => {
  const dial = page.getByTestId('dial');
  await dial.focus();
  for (let i = 0; i < 13; i++) await page.keyboard.press('ArrowRight');
  await page.getByTestId('dial-turns').filter({ hasText: '1 spin' }).waitFor();
});
await step('Pop: bubbles pop and refill when all are gone', async () => {
  await page.getByTestId('fid-pop').click();
  const pops = page.getByTestId('pop');
  for (let i = 0; i < 16; i++) await pops.nth(i).click();
  await page.getByText('16 popped').waitFor();
  await page.waitForTimeout(700);
  assert.equal(await page.locator('[data-testid="pop"][aria-pressed="true"]').count(), 0);
});
await step('Breathe: orb runs the in / hold / out cycle', async () => {
  await page.getByTestId('fid-breathe').click();
  await page.getByTestId('orb').click();
  await page.getByText('Breathe in').waitFor();
  await page.getByTestId('orb').filter({ hasText: 'Hold' }).waitFor({ timeout: 6000 });
  await page.getByTestId('orb').click();
  await page.getByText('Tap to start').waitFor();
});
await step('Just 5 minutes starts the short session; rest timer has bubbles', async () => {
  await page.getByTestId('fid-start').click();
  await page.locator('.workout').waitFor();
  const w = page.getByLabel('Set 1 weight in lb').first();
  if (await w.count()) await w.fill('40');
  await page.getByTestId('reps-0-0').fill('10');
  await page.getByTestId('check-0-0').click();
  const pop = page.getByTestId('rest-pops').locator('.pop').first();
  await pop.click();
  assert.equal(await pop.getAttribute('aria-pressed'), 'true');
  await page.screenshot({ path: 'e2e/shots/hud-rest.png' });
});
await step('no page errors', async () => assert.deepEqual(errors, []));
for (const r of results) console.log(r.join('  '));
console.log(`${results.filter((r) => r[0] === 'PASS').length}/${results.length} passed`);
await browser.close(); server.close();
process.exit(results.every((r) => r[0] === 'PASS') ? 0 : 1);
