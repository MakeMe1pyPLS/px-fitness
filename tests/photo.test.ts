import { test } from 'node:test';
import assert from 'node:assert/strict';
import handler from '../api/food-photo';
import { parseScan, regram, totals } from '../src/lib/foodPhoto';

// ── client helpers ─────────────────────────────────────────────────────────
test('parseScan clamps junk and never trusts the server blindly', () => {
  const r = parseScan({ not_food: false, meal_name: 'x'.repeat(200), items: [
    { name: 'Rice', grams: 180, kcal: 234, protein_g: 4.9, carbs_g: 50.8, fat_g: 0.5, confidence: 'high' },
    { name: 'Bad', grams: -5, kcal: 'lots' },
    { name: 'Huge', grams: 99999, kcal: 99999, protein_g: 9999, carbs_g: 0, fat_g: 0, confidence: 'wild' },
  ] });
  assert.equal(r.mealName.length, 60);
  assert.equal(r.items.length, 2, 'zero-gram item dropped');
  assert.deepEqual(r.items[1], { name: 'Huge', grams: 2000, kcal: 4000, p: 300, c: 0, f: 0, confidence: 'low' });
  assert.deepEqual(parseScan(null), { notFood: false, mealName: '', items: [], caveat: '', demo: false });
});

test('editing grams rescales calories and macros; totals add up', () => {
  const i = { name: 'Chicken', grams: 150, kcal: 248, p: 46.5, c: 0, f: 5.4, confidence: 'medium' as const };
  const d = regram(i, 300);
  assert.equal(d.kcal, 496); assert.equal(d.p, 93); assert.equal(d.f, 10.8);
  assert.equal(regram(i, 0).kcal, 0);
  assert.deepEqual(totals([i, d]), { kcal: 744, p: 140, c: 0, f: 16 });
});

// ── server endpoint (fetch mocked; no real keys) ───────────────────────────
type Call = { url: string; body: any };
function mock(opts: { credit?: any; user?: boolean; ai?: any; aiOk?: boolean }) {
  const calls: Call[] = [];
  globalThis.fetch = (async (url: string, init?: RequestInit) => {
    const body = init?.body ? JSON.parse(String(init.body)) : null;
    calls.push({ url: String(url), body });
    if (String(url).endsWith('/auth/v1/user')) return new Response(JSON.stringify(opts.user === false ? {} : { id: 'u1', email: 'a@b.c' }), { status: opts.user === false ? 401 : 200 });
    if (String(url).includes('use_ai_credit')) return new Response(JSON.stringify(opts.credit ?? { allowed: true }));
    if (String(url).startsWith('https://api.anthropic.com')) return new Response(JSON.stringify(opts.ai ?? { content: [{ type: 'tool_use', name: 'record_food', input: { not_food: false, items: [{ name: 'Rice', grams: 100, kcal: 130, protein_g: 2.7, carbs_g: 28, fat_g: 0.3, confidence: 'high' }] } }] }), { status: opts.aiOk === false ? 500 : 200 });
    throw new Error('unexpected ' + url);
  }) as typeof fetch;
  return calls;
}
const env = (k?: boolean) => { process.env.SUPABASE_URL = 'https://sb.test'; process.env.SUPABASE_ANON_KEY = 'anon'; if (k === false) delete process.env.ANTHROPIC_API_KEY; else process.env.ANTHROPIC_API_KEY = 'sk-test-not-real'; };
const req = (body: unknown, auth = true) => new Request('https://x/api/food-photo', { method: 'POST', headers: { 'content-type': 'application/json', ...(auth ? { authorization: 'Bearer tok' } : {}) }, body: JSON.stringify(body) });
const IMG = { image: 'AAAA'.repeat(50), mediaType: 'image/jpeg' };

test('food-photo: off until the key is set; needs sign-in and PX Plus', async () => {
  env(false); mock({});
  assert.equal((await handler(req(IMG))).status, 503);
  env(); mock({ user: false });
  assert.equal((await handler(req(IMG, false))).status, 401);
  mock({ credit: { allowed: false, reason: 'not_subscribed' } });
  const r = await handler(req(IMG));
  assert.equal(r.status, 402);
  assert.equal((await r.json()).code, 'not_subscribed');
  mock({ credit: { allowed: false, reason: 'daily_limit' } });
  assert.equal((await handler(req(IMG))).status, 429);
});

test('food-photo: bad images are rejected before using an AI credit', async () => {
  env();
  const calls = mock({});
  assert.equal((await handler(req({ image: 'AAAA', mediaType: 'image/gif' }))).status, 400);
  assert.equal((await handler(req({ image: '<script>', mediaType: 'image/jpeg' }))).status, 400);
  assert.equal((await handler(req({ image: 'A'.repeat(3_000_001), mediaType: 'image/jpeg' }))).status, 413);
  assert.ok(!calls.some((c) => c.url.includes('use_ai_credit')), 'no credit used');
});

test('food-photo: sends the photo to Claude vision with a forced tool and returns only the estimate', async () => {
  env();
  const calls = mock({});
  const res = await handler(req({ ...IMG, note: 'cooked in butter' }));
  assert.equal(res.status, 200);
  const out = await res.json();
  assert.equal(out.items[0].name, 'Rice');
  assert.ok(!JSON.stringify(out).includes('sk-test'), 'key never returned');
  const ai = calls.find((c) => c.url.startsWith('https://api.anthropic.com'))!;
  assert.equal(ai.body.model, 'claude-haiku-5-5');
  assert.deepEqual(ai.body.tool_choice, { type: 'tool', name: 'record_food' });
  const content = ai.body.messages[0].content;
  assert.equal(content[0].type, 'image');
  assert.equal(content[0].source.media_type, 'image/jpeg');
  assert.match(content[1].text, /cooked in butter/);
  // credit checked before the AI call
  assert.ok(calls.findIndex((c) => c.url.includes('use_ai_credit')) < calls.indexOf(ai));
  mock({ aiOk: false });
  assert.equal((await handler(req(IMG))).status, 502);
});
