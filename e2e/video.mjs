// Demo videos: empty slot, preview a link on this phone, tap-to-load player, workouts too.
import { chromium, devices } from 'playwright';
import { createServer } from 'node:http';
import { readFileSync } from 'node:fs';
import assert from 'node:assert/strict';
const html = readFileSync('dist/index.html');
const server = createServer((_, res) => { res.writeHead(200, { 'content-type': 'text/html' }); res.end(html); }).listen(0);
const url = `http://127.0.0.1:${server.address().port}/`;
const browser = await chromium.launch();
const ctx = await browser.newContext({ ...devices['iPhone 13'] });
await ctx.route(/fonts\.|youtube|ytimg|tiktok/, (r) => r.abort());
const page = await ctx.newPage(); page.setDefaultTimeout(8000);
const errors = []; page.on('pageerror', (e) => errors.push(e.message));
const results = [];
const step = async (n, fn) => { try { await fn(); results.push(['PASS', n]); } catch (e) { results.push(['FAIL', n, e.message.split('\n')[0]]); await page.screenshot({ path: `e2e/shots/vfail-${results.length}.png` }).catch(() => {}); } };

await step('lesson shows a coming-soon slot, nothing loads from video sites', async () => {
  await page.goto(url + '#welcome');
  await page.getByTestId('cta-start').click();
  await page.getByTestId('goal-strength').click();
  for (let i = 0; i < 6; i++) await page.getByTestId('onb-next').click();
  await page.getByTestId('onb-finish').click();
  await page.getByTestId('open-chat').waitFor();
  await page.locator('nav').getByText('Fight').click();
  await page.getByTestId('lesson-jab').click();
  await page.getByTestId('video-empty-jab').waitFor();
  assert.equal(await page.locator('iframe').count(), 0);
});
await step('preview a link: bad link is refused, a Short shows a tap-to-play poster', async () => {
  await page.getByTestId('video-add').click();
  await page.getByTestId('video-link').fill('not a link');
  await page.getByTestId('video-save').click();
  await page.getByText('Paste a YouTube, TikTok, Instagram Reel or Vimeo link').first().waitFor();
  await page.getByTestId('video-link').fill('https://youtube.com/shorts/dQw4w9WgXcQ');
  await page.getByTestId('video-save').click();
  const f = page.getByTestId('video-jab').locator('iframe');
  await f.waitFor({ state: 'attached' });
  assert.match(await f.getAttribute('src'), /^https:\/\/www\.youtube-nocookie\.com\/embed\/dQw4w9WgXcQ/);
  assert.equal(await page.getByTestId('video-jab').getAttribute('class'), 'vdemo vertical');
  await page.keyboard.press('Escape');
});
await step('reopening shows the poster first; remove clears it', async () => {
  await page.getByTestId('lesson-jab').click();
  await page.getByTestId('video-play').waitFor();
  assert.equal(await page.locator('iframe').count(), 0);
  await page.getByTestId('video-remove').click();
  await page.getByTestId('video-empty-jab').waitFor();
  await page.keyboard.press('Escape');
});
await step('workout: an exercise with a video gets a play button', async () => {
  await page.goto(url + '#home');
  const exId = await page.evaluate(() => globalThis.__kova.get().templates[0].exercises[0].exerciseId);
  await page.evaluate((id) => localStorage.setItem('px:videos', JSON.stringify({ [id]: 'https://www.tiktok.com/@pxfitnessltd/video/7301234567890123456' })), exId);
  await page.getByTestId('start-full').first().click();
  await page.getByTestId('how-0').click();
  assert.equal(await page.getByTestId('how-0').innerText(), '▶');
  await page.getByTestId(`video-${exId}`).getByTestId('video-play').click();
  assert.equal(await page.getByTestId(`video-${exId}`).locator('iframe').getAttribute('src'), 'https://www.tiktok.com/embed/v2/7301234567890123456');
});
await step('no page errors', async () => assert.deepEqual(errors, []));
for (const r of results) console.log(r.join('  '));
console.log(`${results.filter((r) => r[0] === 'PASS').length}/${results.length} passed`);
await browser.close(); server.close();
process.exit(results.every((r) => r[0] === 'PASS') ? 0 : 1);
