// Demo mode on the plain build (no Supabase configured): one tap shows Friends,
// coaching, payments and PX Saturdays with sample people, all in the browser.
// Run: node scripts/build.mjs && node e2e/demo.mjs
import { chromium, devices } from 'playwright';
import { createServer } from 'node:http';
import { readFileSync, mkdirSync } from 'node:fs';
import assert from 'node:assert/strict';

const html = readFileSync('dist/index.html');
const server = createServer((_, res) => { res.writeHead(200, { 'content-type': 'text/html' }); res.end(html); }).listen(0);
const url = `http://127.0.0.1:${server.address().port}/`;
mkdirSync('e2e/shots', { recursive: true });
const browser = await chromium.launch();
const results = [];
const ctx = await browser.newContext({ ...devices['iPhone 13'] });
await ctx.route(/fonts\./, (r) => r.abort());
const outside = [];
ctx.on('request', (r) => { const u = r.url(); if (!u.startsWith(url) && !u.startsWith('data:') && !u.startsWith('blob:') && !/fonts\./.test(u)) outside.push(u); });
const page = await ctx.newPage();
page.setDefaultTimeout(8000);
const errors = [];
page.on('pageerror', (e) => errors.push(e.message));
const step = async (n, fn) => { try { await fn(); results.push(['PASS', n]); } catch (e) { results.push(['FAIL', n, e.message.replace(/\s+/g, ' ').slice(0, 600)]); await page.screenshot({ path: `e2e/shots/demofail-${results.length}.png`, fullPage: true }).catch(() => {}); } };
const tab = (id) => page.locator(`nav [href="#${id}"], nav button`).filter({ hasText: new RegExp(id, 'i') }).first();

await step('plain build: no Friends tab, preview button on You', async () => {
  await page.goto(url + '#welcome');
  await page.getByTestId('cta-start').click();
  await page.getByTestId('goal-strength').click();
  for (let i = 0; i < 6; i++) await page.getByTestId('onb-next').click();
  await page.getByTestId('onb-finish').click();
  await page.getByTestId('open-chat').waitFor();
  assert.equal(await page.locator('nav').getByText('Friends').count(), 0);
  await page.goto(url + '#you');
  await page.getByTestId('demo-on').click();
  await page.getByTestId('demo-banner').waitFor();
});

await step('Friends tab shows sample friends, request and cheers', async () => {
  await page.getByTestId('feed-item').first().waitFor(); // preview opens on Friends
  const t = await page.locator('main, .app').first().innerText();
  assert.match(t, /Jordan/); assert.match(t, /Chris/);
  await page.getByTestId('accept').first().click();
  await page.getByTestId('challenge-join').first().click();
  await page.screenshot({ path: 'e2e/shots/demo-feed.png', fullPage: true });
});

await step('Plans: PX Saturday RSVP, train invite, challenge', async () => {
  await page.getByTestId('ftab-plans').click();
  await page.getByTestId('event').first().click();
  await page.getByTestId('event-rsvp').click();
  await page.getByTestId('event-unrsvp').waitFor();
  await page.keyboard.press('Escape');
  await page.getByTestId('challenges').getByText('November 12').waitFor();
  await page.screenshot({ path: 'e2e/shots/demo-plans.png', fullPage: true });
});

await step('Coach: notes from sample coach and paying for a session', async () => {
  await page.getByTestId('ftab-coach').click();
  await page.getByTestId('my-coach').waitFor();
  assert.match(await page.getByTestId('coach-section').innerText(), /PX Coach/);
  await page.getByTestId('pay-coach').click();
  await page.getByTestId('pay-offer').first().click();
  await page.getByTestId('pay-go').click();
  await page.getByRole('status').filter({ hasText: 'Payment sent' }).waitFor();
  await page.getByTestId('demo-banner').waitFor();
  await page.screenshot({ path: 'e2e/shots/demo-coach.png' });
});

await step('nothing was sent off the device', async () => { assert.deepEqual(outside, []); });

await step('exit returns to normal app with own data', async () => {
  await page.getByTestId('demo-exit').click();
  await page.waitForTimeout(800);
  assert.equal(await page.getByTestId('demo-banner').count(), 0);
  assert.equal(await page.locator('nav').getByText('Friends').count(), 0);
  await page.getByTestId('demo-on').waitFor();
});

await step('no page errors', async () => { assert.deepEqual(errors, []); });

for (const r of results) console.log(r.join('  '));
console.log(`${results.filter((r) => r[0] === 'PASS').length}/${results.length} passed`);
await browser.close(); server.close();
process.exit(results.every((r) => r[0] === 'PASS') ? 0 : 1);
