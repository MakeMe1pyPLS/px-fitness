// Combat as part of the app: onboarding discipline, fight plan, Fight tab, logged rounds.
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
await page.clock.install();
const errors = []; page.on('pageerror', (e) => errors.push(e.message));
const results = [];
const step = async (n, fn) => { try { await fn(); results.push(['PASS', n]); } catch (e) { results.push(['FAIL', n, e.message.split('\n')[0]]); await page.screenshot({ path: `e2e/shots/fcfail-${results.length}.png` }).catch(() => {}); } };

await step('Combat sports is a training style in setup and shapes the plan', async () => {
  await page.goto(url + '#welcome');
  await page.getByTestId('cta-start').click();
  await page.getByTestId('goal-athletic').click();
  await page.getByTestId('onb-next').click();
  await page.getByTestId('disc-combat').click();
  for (let i = 0; i < 5; i++) await page.getByTestId('onb-next').click();
  await page.getByTestId('onb-finish').click();
  await page.getByTestId('open-chat').waitFor();
  const t = await page.evaluate(() => globalThis.__kova.get().templates);
  assert.deepEqual(t.map((x) => x.name).slice(0, 2), ['Fight Rounds', 'Fight Strength']);
  assert.ok(t[0].exercises.some((e) => e.exerciseId === 'heavy-bag' || e.exerciseId === 'shadow-boxing'));
});
await step('Today invites them to set up Fight', async () => {
  assert.match(await page.getByTestId('fight-entry').innerText(), /Set up your fight profile/);
});
await step('Fight tab is in the menu; the round timer works before setup', async () => {
  await page.locator('nav').getByText('Fight').click();
  await page.getByTestId('fight-form').waitFor();
  await page.getByTestId('rt-rounds-1').click();
  await page.getByTestId('rt-work-60').click();
  await page.getByTestId('rt-start').click();
  await page.clock.runFor(6000);
  await page.getByText(/Round 1 of 1/i).waitFor();
  await page.clock.runFor(61000);
  await page.getByTestId('rt-done').waitFor();
});
await step('rounds can be logged as a workout', async () => {
  await page.getByTestId('rt-log').click();
  await page.getByTestId('rt-logged').waitFor();
  const s = await page.evaluate(() => globalThis.__kova.get().sessions.at(-1));
  assert.equal(s.name, 'Boxing rounds'); assert.equal(s.status, 'completed');
  assert.deepEqual(s.exercises[0].sets.map((x) => x.seconds), [60]);
});
await step('no page errors', async () => assert.deepEqual(errors, []));
for (const r of results) console.log(r.join('  '));
console.log(`${results.filter((r) => r[0] === 'PASS').length}/${results.length} passed`);
await browser.close(); server.close();
process.exit(results.every((r) => r[0] === 'PASS') ? 0 : 1);
