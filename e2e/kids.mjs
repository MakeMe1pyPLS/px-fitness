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
await step('background stays behind every screen (never covers text)', async () => {
  const z = await page.getByTestId('backdrop').evaluate((c) => getComputedStyle(c).zIndex);
  assert.ok(Number(z) < 0, `backdrop z-index ${z}`);
  // the canvas must paint before (under) plain, unpositioned text in the app
  const under = await page.evaluate(() => { const c = document.querySelector('.backdrop'); const t = document.querySelector('main h1, main h2, main p'); return !!c && !!t && c.compareDocumentPosition(t) & Node.DOCUMENT_POSITION_FOLLOWING; });
  assert.ok(under);
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
  await page.getByTestId('kids-plinko').click();
  for (let i = 0; i < 10; i++) { await tapCanvas(0.15 + i * 0.07, 0.06); await page.waitForTimeout(120); }
  await page.waitForTimeout(1500);
  await page.screenshot({ path: 'e2e/shots/kids-plinko.png' });
  await page.getByTestId('kids-over').waitFor({ timeout: 20000 });
  const final = Number(await page.getByTestId('kids-final').innerText());
  assert.ok(final >= 50, `scored ${final}`);
  assert.equal(await page.evaluate(() => Number(localStorage.getItem('px:kids-best:plinko'))), final);
  await page.getByText('New best!').waitFor();
  await page.screenshot({ path: 'e2e/shots/kids-over.png' });
  await page.getByTestId('kids-again').click();
  await page.getByTestId('kids-over').waitFor({ state: 'detached' });
  assert.match(await page.getByTestId('kids-score').innerText(), new RegExp(`^0\\s*Best ${final}`));
  await page.getByTestId('kids-merge').click();
  for (let i = 0; i < 8; i++) { await tapCanvas(0.3 + (i % 3) * 0.2, 0.3); await page.waitForTimeout(450); }
  await page.waitForTimeout(1500);
  await page.screenshot({ path: 'e2e/shots/kids-merge.png' });
  await page.getByTestId('kids-bubbles').click(); await page.waitForTimeout(2500);
  await page.screenshot({ path: 'e2e/shots/kids-bubbles.png' });
  await page.getByTestId('kids-catch').click(); await page.waitForTimeout(2000);
  await page.screenshot({ path: 'e2e/shots/kids-catch.png' });
});
await step('fits the visible screen, even when the browser bars shrink it', async () => {
  const fits = async (label) => {
    const vh = await page.evaluate(() => window.visualViewport?.height ?? window.innerHeight);
    const box = async (sel) => page.locator(sel).first().boundingBox();
    const z = await box('.kids'), cvs = await box('.kids-canvas'), bot = await box('.kids-bottom'), exit = await box('[data-testid="kids-exit"]');
    assert.ok(z.y + z.height <= vh + 1, `${label}: zone ${z.y + z.height} > ${vh}`);
    assert.ok(exit.y + exit.height <= vh, `${label}: exit button off screen`);
    assert.ok(cvs.y + cvs.height <= bot.y + 1, `${label}: canvas runs under the controls`);
    const px = await page.getByTestId('kids-canvas').evaluate((c) => [c.width / (window.devicePixelRatio > 2 ? 2 : window.devicePixelRatio), c.getBoundingClientRect().height]);
    assert.ok(Math.abs(px[0] - cvs.width) < 2, `${label}: canvas not resized`);
  };
  await fits('phone');
  await page.setViewportSize({ width: 390, height: 560 }); await page.waitForTimeout(400);
  await fits('short screen');
  await page.screenshot({ path: 'e2e/shots/kids-short.png' });
  await page.setViewportSize({ width: 390, height: 664 }); await page.waitForTimeout(300);
});
await step('a quick tap does not exit; a 2-second hold does', async () => {
  await page.getByTestId('kids-exit').click();
  await page.waitForTimeout(300);
  assert.equal(await page.getByTestId('kids-zone').count(), 1);
  const e = await page.getByTestId('kids-exit').boundingBox();
  await page.mouse.move(e.x + 10, e.y + 10); await page.mouse.down(); await page.waitForTimeout(1800); await page.mouse.up();
  await page.getByTestId('kids-zone').waitFor({ state: 'detached' });
  await page.getByTestId('finish').waitFor();
  assert.equal(await page.evaluate(() => globalThis.__kova.get().sessions.filter((s) => s.status === 'in_progress').length), 1);
});
await step('✕ asks a grown-up question: wrong answer stays, right answer exits', async () => {
  await page.getByTestId('open-kids').click();
  await page.getByTestId('kids-zone').waitFor();
  await page.getByTestId('kids-x').click();
  const [a, b] = (await page.getByTestId('gate-q').innerText()).split('+').map((x) => Number(x.trim()));
  const wrong = await page.locator('[data-testid^="gate-"]').evaluateAll((els, ans) => els.map((e) => e.dataset.testid).find((id) => /^gate-\d+$/.test(id) && id !== `gate-${ans}`), a + b);
  await page.getByTestId(wrong).click();
  await page.getByTestId('kids-gate').waitFor({ state: 'detached' });
  assert.equal(await page.getByTestId('kids-zone').count(), 1);
  await page.getByTestId('kids-x').click();
  const [c, d] = (await page.getByTestId('gate-q').innerText()).split('+').map((x) => Number(x.trim()));
  await page.screenshot({ path: 'e2e/shots/kids-gate.png' });
  await page.getByTestId(`gate-${c + d}`).click();
  await page.getByTestId('kids-zone').waitFor({ state: 'detached' });
  await page.getByTestId('finish').waitFor();
});
await step('touch-and-hold exits too (how phones do it)', async () => {
  await page.getByTestId('open-kids').click();
  await page.getByTestId('kids-zone').waitFor();
  const cdp = await ctx.newCDPSession(page);
  const e = await page.getByTestId('kids-exit').boundingBox();
  await cdp.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [{ x: e.x + 20, y: e.y + 20 }] });
  await page.waitForTimeout(1800);
  await cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
  await page.getByTestId('kids-zone').waitFor({ state: 'detached' });
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
