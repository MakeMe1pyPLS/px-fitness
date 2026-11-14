// Workout note: feeling words highlight as you type, chips can be ignored,
// and the next workout adapts (Today advice + caution on knee moves).
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
const step = async (n, fn) => { try { await fn(); results.push(['PASS', n]); } catch (e) { results.push(['FAIL', n, e.message.split('\n')[0]]); await page.screenshot({ path: `e2e/shots/felfail-${results.length}.png` }).catch(() => {}); } };

await step('finish a workout and write a note: words light up', async () => {
  await page.goto(url + '#welcome');
  await page.getByTestId('cta-start').click();
  await page.getByTestId('goal-strength').click();
  for (let i = 0; i < 6; i++) await page.getByTestId('onb-next').click();
  await page.getByTestId('onb-finish').click();
  await page.getByTestId('start-full').first().click();
  const w = page.getByLabel('Set 1 weight in lb').first(); if (await w.count()) await w.fill('40');
  await page.getByTestId('reps-0-0').fill('10');
  await page.getByTestId('check-0-0').click();
  await page.getByRole('button', { name: 'Skip', exact: true }).click();
  await page.getByTestId('finish').click();
  await page.getByTestId('wk-note').fill('Felt strong but my left knee was sore on lunges. Not tired though, kind of stressed');
  assert.deepEqual(await page.locator('.hl-back mark').allTextContents(), ['strong', 'sore', 'stressed']);
  assert.deepEqual(await page.getByTestId('feelings').locator('.feel-chip').allTextContents(), ['Felt good ×', 'Knee sore ×', 'Rough day ×']);
  await page.screenshot({ path: 'e2e/shots/feelings-note.png' });
});
await step('tap a chip to ignore it, then save', async () => {
  await page.getByTestId('feel-low').click();
  assert.equal(await page.getByTestId('feel-low').getAttribute('aria-pressed'), 'false');
  await page.getByTestId('effort-3').click();
  await page.getByTestId('save-workout').click();
  await page.locator('.complete').waitFor();
  const s = await page.evaluate(() => globalThis.__kova.get().sessions.at(-1));
  assert.deepEqual(s.feelings.map((f) => f.kind + (f.part ?? '')), ['good', 'soreknee']);
});
await step('next workout: Today explains and knee moves are flagged', async () => {
  await page.getByTestId('complete-done').click();
  await page.goto(url + '#progress');
  await page.getByTestId('feelings-card').getByText('Knee sore').waitFor();
  // pretend the workout was yesterday so it's "the last one"
  await page.evaluate(() => { const d = JSON.parse(localStorage.getItem('kova:data')); const y = new Date(Date.now() - 86400000); const s = d.sessions.at(-1); s.endedAt = y.toISOString(); s.startedAt = y.toISOString(); s.plannedFor = `${y.getFullYear()}-${String(y.getMonth() + 1).padStart(2, '0')}-${String(y.getDate()).padStart(2, '0')}`; localStorage.setItem('kova:data', JSON.stringify(d)); });
  await page.reload();
  await page.goto(url + '#home');
  assert.match(await page.getByTestId('note-advice').innerText(), /Warm up that knee/);
  await page.getByTestId('start-full').first().click();
  assert.match(await page.getByTestId('wk-note-advice').innerText(), /knee/);
  const ids = await page.evaluate(() => globalThis.__kova.get().sessions.find((x) => x.status === 'in_progress').exercises.map((e) => e.exerciseId));
  const knee = ids.map((id, i) => /squat|lunge|leg-press|leg-curl|pistol|jump|sprawl|rope|run/.test(id) ? i : -1).filter((i) => i >= 0);
  const flagged = await page.locator('[data-testid^="caution-"]').evaluateAll((els) => els.map((e) => Number(e.dataset.testid.split('-')[1])));
  assert.deepEqual(flagged, knee, `flagged ${flagged} for ${ids}`);
  await page.screenshot({ path: 'e2e/shots/feelings-next.png' });
});
await step('no page errors', async () => assert.deepEqual(errors, []));
for (const r of results) console.log(r.join('  '));
console.log(`${results.filter((r) => r[0] === 'PASS').length}/${results.length} passed`);
await browser.close(); server.close();
process.exit(results.every((r) => r[0] === 'PASS') ? 0 : 1);
