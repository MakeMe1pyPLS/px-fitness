// Finishing a workout should take as few taps as possible:
// tick sets without typing (uses the plan's target), no rest timer after the
// last set, Finish reachable from the rest timer too.
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
const step = async (n, fn) => { try { await fn(); results.push(['PASS', n]); } catch (e) { results.push(['FAIL', n, e.message.split('\n')[0]]); await page.screenshot({ path: `e2e/shots/finfail-${results.length}.png` }).catch(() => {}); } };

await step('ticking a set without typing logs the plan’s reps', async () => {
  await page.goto(url + '#welcome');
  await page.getByTestId('cta-start').click();
  await page.getByTestId('goal-strength').click();
  for (let i = 0; i < 6; i++) await page.getByTestId('onb-next').click();
  await page.getByTestId('onb-finish').click();
  await page.getByTestId('start-short').first().click();
  await page.getByTestId('check-0-0').click();
  const s = await page.evaluate(() => globalThis.__kova.get().sessions.find((x) => x.status === 'in_progress'));
  const want = Number(s.exercises[0].target.match(/\d+/)[0]);
  assert.equal(s.exercises[0].sets[0].done, true);
  assert.equal(s.exercises[0].sets[0].reps, want);
  assert.equal(await page.locator('#in-0-0-reps').inputValue(), String(want));
});
await step('Finish is reachable from the rest timer', async () => {
  await page.getByTestId('rest-finish').waitFor();
});
await step('after the last set: no rest timer, Finish lights up', async () => {
  const s = await page.evaluate(() => globalThis.__kova.get().sessions.find((x) => x.status === 'in_progress'));
  for (let i = 0; i < s.exercises.length; i++) for (let j = 0; j < s.exercises[i].sets.length; j++) {
    if (i === 0 && j === 0) continue;
    await page.getByTestId(`check-${i}-${j}`).click();
  }
  await page.locator('.rest-bar').waitFor({ state: 'detached' });
  assert.match(await page.getByTestId('finish').innerText(), /All sets done/);
  await page.screenshot({ path: 'e2e/shots/finish-ready.png' });
});
await step('three taps to done: Finish → Save → Back to today', async () => {
  await page.getByTestId('finish').click();
  await page.getByTestId('save-workout').click();
  await page.getByTestId('complete-done').click();
  await page.getByTestId('open-chat').waitFor();
  const last = await page.evaluate(() => globalThis.__kova.get().sessions.at(-1));
  assert.equal(last.status, 'completed');
});
await step('no page errors', async () => assert.deepEqual(errors, []));
for (const r of results) console.log(r.join('  '));
console.log(`${results.filter((r) => r[0] === 'PASS').length}/${results.length} passed`);
await browser.close(); server.close();
process.exit(results.every((r) => r[0] === 'PASS') ? 0 : 1);
