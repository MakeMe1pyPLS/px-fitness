// Kids Zone + backgrounds: games respond to taps, exit needs a 2-second hold,
// the workout keeps running underneath; background settings switch modes.
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
const step = async (n, fn) => { try { await fn(); results.push(['PASS', n]); } catch (e) { results.push(['FAIL', n, e.message.split('\n')[0]]); await page.screenshot({ path: `e2e/shots/kfail-${results.length}.png` }).catch(() => {}); } };
const tapCanvas = async (fx, fy) => { const b = await page.getByTestId('kids-canvas').boundingBox(); await page.mouse.click(b.x + b.width * fx, b.y + b.height * fy); };

await step('background: a design is drawn and settings switch it', async () => {
  await page.goto(url + '#welcome');
  await page.getByTestId('cta-start').click();
  await page.getByTestId('goal-strength').click();
  for (let i = 0; i < 6; i++) await page.getByTestId('onb-next').click();
  await page.getByTestId('onb-finish').click();
  await page.getByTestId('open-chat').waitFor();
  const st = await page.getByTestId('backdrop').getAttribute('data-style');
  assert.ok(['embers', 'contours', 'constellation', 'pulse', 'orbits'].includes(st));
  await page.goto(url + '#you');
  await page.getByTestId('bgmode-fidget').click();
  await page.getByTestId('bg-orbits').click();
  assert.equal(await page.getByTestId('backdrop').getAttribute('data-style'), 'orbits');
  assert.equal(await page.getByTestId('backdrop').getAttribute('data-mode'), 'fidget');
});
await step('a new design each time the app opens (auto)', async () => {
  await page.getByTestId('bg-auto').click();
  const seen = new Set();
  for (let i = 0; i < 3; i++) {
    const p2 = await ctx.newPage(); await p2.goto(url + '#home'); await p2.getByTestId('backdrop').waitFor({ state: 'attached' });
    seen.add(await p2.getByTestId('backdrop').getAttribute('data-style')); await p2.close();
  }
  assert.ok(seen.size >= 2, `got ${[...seen]}`);
});
await step('Kids Zone from a workout: games respond, workout keeps running', async () => {
  await page.goto(url + '#home');
  await page.getByTestId('start-full').first().click();
  await page.getByTestId('open-kids').click();
  await page.getByTestId('kids-zone').waitFor();
  await page.getByTestId('kids-bounce').click();
  await tapCanvas(0.5, 0.3); await tapCanvas(0.3, 0.2); await tapCanvas(0.7, 0.25);
  await page.getByTestId('kids-score').filter({ hasText: '3 balls' }).waitFor();
  await page.waitForTimeout(1200);
  await page.screenshot({ path: 'e2e/shots/kids-bounce.png' });
  await page.getByTestId('kids-catch').click(); await page.waitForTimeout(1500);
  await page.screenshot({ path: 'e2e/shots/kids-catch.png' });
  await page.getByTestId('kids-sparkle').click();
  const b = await page.getByTestId('kids-canvas').boundingBox();
  await page.mouse.move(b.x + 60, b.y + 120); await page.mouse.down();
  for (let i = 0; i < 20; i++) await page.mouse.move(b.x + 60 + i * 12, b.y + 120 + Math.sin(i / 3) * 60);
  await page.mouse.up(); await page.waitForTimeout(300);
  await page.screenshot({ path: 'e2e/shots/kids-sparkle.png' });
  await page.getByTestId('kids-bubbles').click(); await page.waitForTimeout(2500);
  await page.screenshot({ path: 'e2e/shots/kids-bubbles.png' });
});
await step('a quick tap does not exit; a 2-second hold does', async () => {
  await page.getByTestId('kids-exit').click();
  await page.waitForTimeout(300);
  assert.equal(await page.getByTestId('kids-zone').count(), 1);
  const e = await page.getByTestId('kids-exit').boundingBox();
  await page.mouse.move(e.x + 10, e.y + 10); await page.mouse.down(); await page.waitForTimeout(2300); await page.mouse.up();
  await page.getByTestId('kids-zone').waitFor({ state: 'detached' });
  await page.getByTestId('finish').waitFor();
  assert.equal(await page.evaluate(() => globalThis.__kova.get().sessions.filter((s) => s.status === 'in_progress').length), 1);
});
await step('Kids card on Today opens it too', async () => {
  await page.goto(url + '#home');
  await page.evaluate(() => { const d = JSON.parse(localStorage.getItem('kova:data')); d.sessions = d.sessions.filter((s) => s.status !== 'in_progress'); localStorage.setItem('kova:data', JSON.stringify(d)); });
  await page.reload();
  await page.getByTestId('kids-card').click();
  await page.getByTestId('kids-zone').waitFor();
});
await step('no page errors', async () => assert.deepEqual(errors, []));
for (const r of results) console.log(r.join('  '));
console.log(`${results.filter((r) => r[0] === 'PASS').length}/${results.length} passed`);
await browser.close(); server.close();
process.exit(results.every((r) => r[0] === 'PASS') ? 0 : 1);
