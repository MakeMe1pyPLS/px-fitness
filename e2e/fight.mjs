// Fight camp: setup from You, plan by size & stance, camp countdown feeds Today, round timer.
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
const step = async (n, fn) => { try { await fn(); results.push(['PASS', n]); } catch (e) { results.push(['FAIL', n, e.message.split('\n')[0]]); await page.screenshot({ path: `e2e/shots/ffail-${results.length}.png` }).catch(() => {}); } };
const inDays = (n) => { const d = new Date(); d.setDate(d.getDate() + n); return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`; };

await step('set up your fighter profile from You', async () => {
  await page.goto(url + '#welcome');
  await page.getByTestId('cta-start').click();
  await page.getByTestId('goal-strength').click();
  for (let i = 0; i < 6; i++) await page.getByTestId('onb-next').click();
  await page.getByTestId('onb-finish').click();
  await page.getByTestId('open-chat').waitFor();
  await page.goto(url + '#you');
  await page.getByTestId('open-fight').click();
  await page.getByTestId('lessons').waitFor();
  await page.getByTestId('ft-edit').click();
  await page.getByTestId('ft-sport').selectOption('Boxing');
  await page.getByTestId('ft-stance-orthodox').click();
  await page.getByTestId('ft-height-ft').fill('6');
  await page.getByTestId('ft-height-in').fill('0');
  await page.getByTestId('ft-weight').fill('170');
  await page.getByTestId('ft-date').fill(inDays(20));
  await page.getByTestId('ft-name').fill('Golden Gloves');
  await page.getByTestId('ft-save').click();
  assert.match(await page.getByTestId('fight-profile').innerText(), /Boxing · Orthodox · 6′0″ · 170 lb/);
  assert.match(await page.getByTestId('build-tips').innerText(), /Tall and rangy/);
  assert.match(await page.getByTestId('fight-camp').innerText(), /Sharpen/i);
  const up = await page.evaluate(() => globalThis.__kova.get().upcoming);
  assert.equal(up.filter((u) => u.kind === 'competition' && u.label === 'Golden Gloves').length, 1);
});
await step('heavier opponent: the bigger-and-stronger plan', async () => {
  await page.getByTestId('facing-nums').click();
  await page.getByTestId('op-weight').fill('200');
  assert.equal(await page.getByTestId('plan').getAttribute('data-facing'), 'bigger');
  assert.equal(await page.getByTestId('plan-head').innerText(), 'Don’t fight their fight');
  assert.match(await page.getByTestId('size-line').innerText(), /30 lb heavier/);
});
await step('same weight, taller southpaw: get past the reach + open stance', async () => {
  await page.getByTestId('op-weight').fill('172');
  await page.getByTestId('op-height-ft').fill('6');
  await page.getByTestId('op-height-in').fill('4');
  await page.getByTestId('op-stance-southpaw').click();
  assert.equal(await page.getByTestId('plan').getAttribute('data-facing'), 'taller');
  assert.match(await page.getByTestId('stance-plan').innerText(), /Open stance/);
  await page.getByTestId('facing-shorter').click();
  assert.equal(await page.getByTestId('plan-head').innerText(), 'Keep it long');
  await page.screenshot({ path: 'e2e/shots/fight-plan.png', fullPage: true });
});
await step('lesson path: start lesson 1, diagram, practice, move on', async () => {
  assert.match(await page.getByTestId('lessons-done').innerText(), /0 of 13/);
  await page.getByTestId('lesson-next').click();
  await page.getByTestId('lesson-sheet').waitFor();
  await page.getByTestId('diagram-stance').waitFor();
  await page.getByTestId('lesson-done').click();
  await page.getByTestId('diagram-step').waitFor(); // next lesson: footwork
  await page.keyboard.press('Escape');
  assert.match(await page.getByTestId('lessons-done').innerText(), /1 of 13/);
  assert.match(await page.getByTestId('lesson-next').innerText(), /Footwork/);
  assert.equal((await page.evaluate(() => globalThis.__kova.get().fightLearn.stance.count)), 1);
});
await step('plan links straight to the lessons it recommends', async () => {
  await page.getByTestId('learn-jab').click();
  assert.match(await page.getByTestId('lesson-sheet').innerText(), /most important punch/);
  await page.getByTestId('drill-start').click();
  await page.getByTestId('drill-live').waitFor();
  await page.keyboard.press('Escape');
});
await step('kicking sports add kick lessons', async () => {
  await page.getByTestId('ft-edit').click();
  await page.getByTestId('ft-sport').selectOption('Muay Thai');
  await page.getByTestId('ft-save').click();
  assert.match(await page.getByTestId('lessons-done').innerText(), /of 16/);
  await page.getByTestId('lesson-roundhouse').waitFor();
});
await step('practice timer is tucked away and still works', async () => {
  await page.getByTestId('practice').locator('summary').click();
  await page.getByTestId('rt-start').click();
  assert.match(await page.getByTestId('rt-live').innerText(), /Get ready/i);
  await page.getByTestId('rt-stop').click();
});
await step('Today shows the fight card; removing the profile clears the event', async () => {
  await page.goto(url + '#home');
  assert.match(await page.getByTestId('fight-entry').innerText(), /20 days to Golden Gloves/);
  await page.getByTestId('fight-entry').click();
  await page.getByTestId('ft-edit').click();
  await page.getByTestId('ft-remove').click();
  const up = await page.evaluate(() => globalThis.__kova.get().upcoming.filter((u) => u.kind === 'competition'));
  assert.equal(up.length, 0);
});
await step('no page errors', async () => assert.deepEqual(errors, []));
for (const r of results) console.log(r.join('  '));
console.log(`${results.filter((r) => r[0] === 'PASS').length}/${results.length} passed`);
await browser.close(); server.close();
process.exit(results.every((r) => r[0] === 'PASS') ? 0 : 1);
