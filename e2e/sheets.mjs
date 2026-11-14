// Finish-workout sheet: drag down to close (small drags spring back), close button,
// Back to workout, and dragging inside the note box doesn't close it.
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
const cdp = await ctx.newCDPSession(page);
const errors = []; page.on('pageerror', (e) => errors.push(e.message));
const results = [];
const step = async (n, fn) => { try { await fn(); results.push(['PASS', n]); } catch (e) { results.push(['FAIL', n, e.message.split('\n')[0]]); await page.screenshot({ path: `e2e/shots/sfail-${results.length}.png` }).catch(() => {}); } };
const swipe = async (x, y, dy, steps = 8, ms = 16) => {
  await cdp.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [{ x, y }] });
  for (let i = 1; i <= steps; i++) { await cdp.send('Input.dispatchTouchEvent', { type: 'touchMove', touchPoints: [{ x, y: y + (dy * i) / steps }] }); await page.waitForTimeout(ms); }
  await cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
};
const sheet = () => page.locator('.sheet');
const openFinish = async () => { await page.getByTestId('finish').click(); await page.getByTestId('save-workout').waitFor(); await page.waitForTimeout(400); };
const handle = async () => { const b = await page.locator('.sheet .sheet-title').boundingBox(); return [b.x + 40, b.y + b.height / 2]; };

await step('set up a workout with one set done', async () => {
  await page.goto(url + '#welcome');
  await page.getByTestId('cta-start').click();
  await page.getByTestId('goal-strength').click();
  for (let i = 0; i < 6; i++) await page.getByTestId('onb-next').click();
  await page.getByTestId('onb-finish').click();
  await page.getByTestId('start-full').first().click();
  const w = page.getByLabel('Set 1 weight in lb').first(); if (await w.count()) await w.fill('40');
  await page.getByTestId('reps-0-0').fill('10');
  await page.getByTestId('check-0-0').click();
  const skip = page.getByTestId('rest-skip'); if (await skip.count()) await skip.click();
});
await step('a small drag springs back', async () => {
  await openFinish();
  const [x, y] = await handle();
  await swipe(x, y, 50);
  await page.waitForTimeout(500);
  assert.equal(await sheet().count(), 1);
  assert.equal(await sheet().evaluate((e) => e.style.transform), '');
});
await step('dragging down closes it, back on the workout', async () => {
  const [x, y] = await handle();
  await swipe(x, y, 320);
  await sheet().waitFor({ state: 'detached' });
  await page.getByTestId('finish').waitFor();
});
await step('dragging inside the note box doesn’t close it', async () => {
  await openFinish();
  await page.locator('#wk-note').fill('Felt strong');
  const b = await page.locator('#wk-note').boundingBox();
  await swipe(b.x + 20, b.y + 10, 200);
  await page.waitForTimeout(400);
  assert.equal(await sheet().count(), 1);
});
await step('Back to workout and the close button both close it', async () => {
  await page.getByTestId('back-to-workout').click();
  await sheet().waitFor({ state: 'detached' });
  await openFinish();
  await page.getByTestId('sheet-close').click();
  await sheet().waitFor({ state: 'detached' });
});
await step('saving still works', async () => {
  await openFinish();
  await page.getByTestId('effort-3').click();
  await page.screenshot({ path: 'e2e/shots/finish-sheet.png' });
  await page.getByTestId('save-workout').click();
  await page.locator('.complete').waitFor();
});
await step('no page errors', async () => assert.deepEqual(errors, []));
for (const r of results) console.log(r.join('  '));
console.log(`${results.filter((r) => r[0] === 'PASS').length}/${results.length} passed`);
await browser.close(); server.close();
process.exit(results.every((r) => r[0] === 'PASS') ? 0 : 1);
