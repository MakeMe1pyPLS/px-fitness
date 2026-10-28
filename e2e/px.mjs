// End-to-end tests for the PX-Fitness merge: brand/theme, chat check-in,
// coaching (client booking → coach desk), coach tools, photos, milestones.
import { chromium, devices } from 'playwright';
import { createServer } from 'node:http';
import { readFileSync, mkdirSync } from 'node:fs';
import assert from 'node:assert/strict';
import zlib from 'node:zlib';

const html = readFileSync('dist/index.html');
const server = createServer((_, res) => { res.writeHead(200, { 'content-type': 'text/html' }); res.end(html); }).listen(0);
const url = `http://127.0.0.1:${server.address().port}/`;
mkdirSync('e2e/shots', { recursive: true });
const browser = await chromium.launch();
const results = [];
let page;
const step = async (n, fn) => { try { await fn(); results.push(['PASS', n]); } catch (e) { results.push(['FAIL', n, e.message.replace(/\s+/g, ' ').slice(0, 900)]); try { await page.screenshot({ path: `e2e/shots/pxfail-${results.length}.png` }); } catch {} } };

// Tiny valid PNG (solid color) for the photo upload test.
function png(w, h) {
  const crc = (b) => { let c, t = []; for (let n = 0; n < 256; n++) { c = n; for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1; t[n] = c >>> 0; } let x = 0xffffffff; for (const v of b) x = t[(x ^ v) & 0xff] ^ (x >>> 8); return (x ^ 0xffffffff) >>> 0; };
  const chunk = (type, data) => { const l = Buffer.alloc(4); l.writeUInt32BE(data.length); const td = Buffer.concat([Buffer.from(type), data]); const c = Buffer.alloc(4); c.writeUInt32BE(crc(td)); return Buffer.concat([l, td, c]); };
  const ihdr = Buffer.alloc(13); ihdr.writeUInt32BE(w, 0); ihdr.writeUInt32BE(h, 4); ihdr[8] = 8; ihdr[9] = 2;
  const raw = Buffer.alloc((w * 3 + 1) * h); for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) { const o = y * (w * 3 + 1) + 1 + x * 3; raw[o] = 255; raw[o + 1] = 90; raw[o + 2] = 31; }
  return Buffer.concat([Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]), chunk('IHDR', ihdr), chunk('IDAT', zlib.deflateSync(raw)), chunk('IEND', Buffer.alloc(0))]);
}

const ctx = await browser.newContext({ ...devices['iPhone 13'] });
await ctx.route(/fonts\./, (r) => r.abort());
page = await ctx.newPage();
page.setDefaultTimeout(8000);
const errors = [];
page.on('pageerror', (e) => errors.push(e.message));

await step('PX brand on landing; book a session works without an account', async () => {
  await page.goto(url);
  assert.equal(await page.title(), 'PX-Fitness — Train for your life.');
  await page.getByText('Build strength').waitFor();
  assert.equal(await page.evaluate(() => getComputedStyle(document.querySelector('.landing')).backgroundColor), 'rgb(9, 9, 9)');
  await page.getByTestId('cta-book').click();
  await page.getByText('Choose your pace').waitFor();
  await page.getByText('About $480 for 4 weeks (8 sessions)').waitFor();
  await page.getByText(/draft rates/).waitFor();
});

await step('client requests coaching → appears in the coach desk', async () => {
  await page.getByTestId('tier-3').click();
  await page.getByTestId('bk-name').fill('Ana Ruiz');
  await page.getByTestId('bk-contact').fill('ana@example.com');
  await page.getByTestId('bk-send').click();
  await page.getByText('Request saved.').waitFor();
  await page.getByText(/stored on this device only/).waitFor();
  await page.goto(url + '#welcome');
  await page.getByTestId('cta-coach').click();
  await page.getByText('Business desk').waitFor();
  assert.equal(await page.getByTestId('m-inq').textContent(), '1');
  await page.getByText('Ana Ruiz').waitFor();
  await page.getByText(/3 sessions a week/).first().waitFor();
});

await step('coach converts inquiry, programs a week, schedules and logs payments', async () => {
  await page.getByTestId('convert').click();
  assert.equal(await page.getByTestId('m-clients').textContent(), '1');
  await page.getByRole('link', { name: 'Clients' }).click();
  await page.getByTestId('program-week').click();
  await page.getByTestId('wk-Mon').fill('Lower A: squat 3x8, RDL 3x10');
  await page.getByTestId('wk-Thu').fill('Upper A');
  await page.getByTestId('wk-save').click();
  await page.getByText('2 days programmed this week').waitFor();
  await page.getByRole('link', { name: 'Schedule' }).click();
  await page.getByTestId('add-session').click();
  await page.getByLabel('Client').selectOption({ label: 'Ana Ruiz' });
  await page.getByTestId('ss-save').click();
  await page.getByTestId('session').first().waitFor();
  const href = await page.getByRole('link', { name: 'Add to Google Calendar' }).first().getAttribute('href');
  assert.match(href, /calendar\.google\.com\/calendar\/render\?action=TEMPLATE/);
  await page.screenshot({ path: 'e2e/shots/px-schedule.png', fullPage: true });
  await page.getByRole('link', { name: 'Payments' }).click();
  await page.getByTestId('add-payment').click();
  await page.getByLabel('Client').selectOption({ label: 'Ana Ruiz' });
  await page.getByTestId('pm-amount').fill('150');
  await page.getByTestId('pm-due').click();
  await page.getByTestId('pm-save').click();
  assert.equal(await page.getByTestId('pay-due').textContent(), '$150');
  await page.getByTestId('mark-paid').click();
  assert.equal(await page.getByTestId('pay-due').textContent(), '$0');
  assert.equal(await page.getByTestId('pay-month').textContent(), '$150');
});

await step('coach setup: profile, links validated, confirmed prices reach the client page', async () => {
  await page.getByRole('link', { name: 'Setup' }).click();
  await page.getByTestId('cp-name').fill('Coach Dre');
  await page.getByTestId('ln-calendly').fill('not a url');
  assert.equal(await page.getByTestId('setup-save').isDisabled(), true, 'invalid link blocks save');
  await page.getByTestId('ln-calendly').fill('https://calendly.com/coach-dre');
  await page.getByTestId('tp-1').fill('85');
  await page.getByTestId('tiers-confirmed').check();
  await page.getByTestId('setup-save').click();
  await page.screenshot({ path: 'e2e/shots/px-setup.png', fullPage: true });
  await page.getByTestId('exit-coach').click();
  await page.goto(url + '#coach');
  await page.getByText('Coach Dre').waitFor();
  await page.getByText('About $340 for 4 weeks (4 sessions)').waitFor();
  assert.equal(await page.getByText(/draft rates/).count(), 0);
  assert.equal(await page.getByRole('link', { name: 'Pick a time on Calendly' }).getAttribute('href'), 'https://calendly.com/coach-dre');
});

await step('client onboarding, then the chat check-in saves structured data', async () => {
  await page.goto(url + '#welcome');
  await page.getByTestId('cta-start').click();
  await page.getByTestId('goal-strength').click();
  for (let i = 0; i < 6; i++) await page.getByTestId('onb-next').click();
  await page.getByTestId('onb-finish').click();
  await page.getByTestId('open-chat').click();
  await page.getByText('How are you feeling today?').first().waitFor();
  await page.getByTestId('chip-Okay').click();
  await page.getByTestId('chat-text').fill('tired, slept 6 hours, only 20 min');
  await page.getByTestId('chat-send').click();
  await page.getByText('Anything going on with your body or your day?').waitFor();
  await page.getByTestId('chip-A bit sore').click();
  await page.getByTestId('chat-text').fill('left knee a little cranky after stairs');
  await page.getByTestId('chat-send').click();
  await page.getByText(/Got it: feeling okay, energy 2\/5, 6 h sleep, 20 min free/).waitFor();
  await page.screenshot({ path: 'e2e/shots/px-chat-done.png' });
  const c = await page.evaluate(() => globalThis.__kova.get().checkins.at(-1));
  assert.deepEqual([c.mood, c.energy, c.sleepHours, c.availableMinutes, c.soreness], [3, 2, 6, 20, 3]);
  assert.match(c.note, /knee/);
  await page.getByTestId('chat-go-today').click();
  // Today's suggestion picked it up and leads with the short version.
  assert.match(await page.getByTestId('start-short').getAttribute('class'), /btn-primary/);
});

await step('the bot recalls what you told it, and you can see and delete it', async () => {
  // Pretend that note was from yesterday.
  await page.evaluate(() => { const s = globalThis.__kova; const d = new Date(Date.now() - 86400000); const k = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`; s.replaceAll({ ...s.get(), checkins: [], checkinMemory: s.get().checkinMemory.map((m) => ({ ...m, date: k })) }); });
  await page.reload();
  await page.getByTestId('open-chat').click();
  await page.getByText(/Last time you mentioned “left knee a little cranky/).waitFor();
  await page.getByRole('button', { name: 'Close check-in' }).click();
  await page.getByRole('link', { name: 'You' }).click();
  await page.getByText('What the check-in remembers').waitFor();
  const n = await page.getByRole('button', { name: 'Forget this' }).count();
  assert.ok(n >= 1);
  await page.getByRole('button', { name: 'Forget all' }).click();
  assert.equal(await page.evaluate(() => globalThis.__kova.get().checkinMemory.length), 0);
});

await step('safety: crisis language stops the check-in, shows 988, and is not saved', async () => {
  await page.getByRole('link', { name: 'Today' }).click();
  await page.getByTestId('open-chat').click();
  await page.getByTestId('chat-text').fill('honestly I want to die');
  await page.getByTestId('chat-send').click();
  await page.getByText(/call or text 988/).waitFor();
  assert.equal(await page.getByTestId('chat-text').count(), 0, 'input closed');
  const st = await page.evaluate(() => JSON.stringify(globalThis.__kova.get()));
  assert.ok(!/want to die/.test(st), 'crisis text not stored');
  await page.getByRole('button', { name: 'Close', exact: true }).click();
});

await step('pain language gets cautious guidance and marks soreness high', async () => {
  await page.getByTestId('open-chat').click();
  await page.getByTestId('chip-Good').click();
  await page.getByTestId('chat-text').fill('sharp pain in my shoulder');
  await page.getByTestId('chat-send').click();
  await page.getByText(/Pain is different from normal soreness/).waitFor();
  await page.getByRole('button', { name: 'Close check-in' }).click();
  const c = await page.evaluate(() => globalThis.__kova.get().checkins.at(-1));
  assert.ok(c.soreness >= 4);
});

await step('progress photo: upload, compress, persist separately, delete', async () => {
  await page.getByRole('link', { name: 'Progress' }).click();
  await page.getByTestId('photo-input').setInputFiles({ name: 'me.png', mimeType: 'image/png', buffer: png(1200, 1600) });
  await page.getByTestId('photo').first().waitFor();
  const stored = await page.evaluate(() => JSON.parse(localStorage.getItem('px:photos')));
  assert.equal(stored.length, 1);
  assert.match(stored[0].dataUrl, /^data:image\/jpeg/);
  assert.ok(!(await page.evaluate(() => (localStorage.getItem('kova:data') ?? '').includes('data:image'))), 'photos not in main doc');
  await page.reload();
  await page.getByTestId('photo').first().click();
  await page.getByRole('button', { name: 'Delete photo' }).click();
  await page.getByRole('alertdialog').getByRole('button', { name: 'Delete' }).click();
  assert.equal(await page.getByTestId('photo').count(), 0);
});

await step('milestones: user-added saved; auto milestones come from real data', async () => {
  await page.getByTestId('add-milestone').click();
  await page.getByTestId('ms-title').fill('First unassisted pull-up');
  await page.getByTestId('ms-save').click();
  await page.getByText('First unassisted pull-up').waitFor();
  assert.equal(await page.getByText('First workout logged').count(), 0, 'no fake auto milestone before any workout');
});

await step('overlays sit on screen even when opened from a long, scrolled page', async () => {
  await page.goto(url + '#diet-prefs');
  await page.evaluate(() => window.scrollTo(0, document.body.scrollHeight));
  await page.goto(url + '#you');
  await page.evaluate(() => window.scrollTo(0, document.body.scrollHeight));
  await page.getByTestId('delete-all').click();
  const box = await page.getByRole('alertdialog').boundingBox();
  const vh = page.viewportSize().height;
  assert.ok(box.y >= 0 && box.y + box.height <= vh, `dialog at ${box.y}`);
  await page.getByRole('alertdialog').getByRole('button', { name: 'Cancel' }).click();
});

await step('dark theme: body text meets 4.5:1 contrast on key screens', async () => {
  const bad = [];
  for (const r of ['home', 'coach', 'diet', 'progress', 'insights', 'you']) {
    await page.goto(url + '#' + r);
    await page.waitForTimeout(400);
    const res = await page.evaluate(() => {
      const lum = (c) => { const [r, g, b] = c.map((v) => { v /= 255; return v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4; }); return 0.2126 * r + 0.7152 * g + 0.0722 * b; };
      const parse = (s) => (s.match(/[\d.]+/g) || []).map(Number);
      const bgOf = (el) => { for (let e = el; e; e = e.parentElement) { const c = parse(getComputedStyle(e).backgroundColor); if (c.length >= 3 && (c[3] === undefined || c[3] > 0.9)) return c.slice(0, 3); } return [9, 9, 9]; };
      const out = [];
      for (const el of document.querySelectorAll('main p, main span, main b, main button, main label, main h1, main h2, main h3, main a')) {
        if (!el.childNodes.length || ![...el.childNodes].some((n) => n.nodeType === 3 && n.textContent.trim())) continue;
        const st = getComputedStyle(el);
        if (st.visibility === 'hidden' || st.display === 'none' || el.closest('[disabled]') || el.closest('.sr-only') || parseFloat(st.opacity) < 1) continue;
        const fg = parse(st.color).slice(0, 3);
        // The selected picker option sits on the separate sliding indicator (ember).
        const bg = el.closest('.picker-opt[aria-checked="true"]') ? parse(getComputedStyle(el.closest('.picker').querySelector('.picker-ind')).backgroundColor).slice(0, 3) : bgOf(el);
        const [a, b] = [lum(fg), lum(bg)].sort((x, y) => y - x);
        const ratio = (a + 0.05) / (b + 0.05);
        const large = parseFloat(st.fontSize) >= 18.66 || (parseFloat(st.fontSize) >= 14 && Number(st.fontWeight) >= 700);
        if (ratio < (large ? 3 : 4.5)) out.push(`${el.textContent.trim().slice(0, 30)} (${ratio.toFixed(2)})`);
      }
      return out;
    });
    bad.push(...res.map((x) => `${r}: ${x}`));
  }
  assert.deepEqual(bad, []);
});

await step('no horizontal overflow on new screens; no runtime errors', async () => {
  for (const r of ['coach', 'you', 'progress']) { await page.goto(url + '#' + r); await page.waitForTimeout(150); assert.ok(await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth) <= 1, r); }
  await page.evaluate(() => globalThis.__kova.setCoach({ viewAsCoach: true }));
  for (const r of ['biz', 'biz-clients', 'biz-schedule', 'biz-pay', 'biz-setup']) { await page.goto(url + '#' + r); await page.waitForTimeout(150); assert.ok(await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth) <= 1, r); }
  assert.deepEqual(errors, []);
});

await browser.close();
server.close();
for (const r of results) console.log(r.join('  '));
const failed = results.filter((r) => r[0] === 'FAIL').length;
console.log(`\n${results.length - failed}/${results.length} passed`);
process.exit(failed ? 1 : 0);
