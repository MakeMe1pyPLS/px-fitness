import { test } from 'node:test';
import assert from 'node:assert/strict';
import { syncPlan, parseAuthHash, friendlyAuthError, decodeJwt, isActive } from '../src/lib/cloud';
import { formEncode, hmacHex, verifyStripeSignature, safeReturn } from '../api/_shared';
import { subRow } from '../api/stripe-webhook';

const U = 'user-1';
const remote = { updated_at: '2026-10-20T10:00:00Z' };

test('sync: new account on a device with real data uploads it', () => {
  assert.equal(syncPlan({ localHasProfile: true, localIsSample: false, remote: null, lastSync: null, userId: U }), 'push');
});

test('sync: fresh device (or sample data) downloads the account copy', () => {
  assert.equal(syncPlan({ localHasProfile: false, localIsSample: false, remote, lastSync: null, userId: U }), 'pull');
  assert.equal(syncPlan({ localHasProfile: true, localIsSample: true, remote, lastSync: null, userId: U }), 'pull');
});

test('sync: nothing anywhere does nothing, and demo data is never uploaded', () => {
  assert.equal(syncPlan({ localHasProfile: false, localIsSample: false, remote: null, lastSync: null, userId: U }), 'nothing');
  assert.equal(syncPlan({ localHasProfile: true, localIsSample: true, remote: null, lastSync: null, userId: U }), 'nothing');
});

test('sync: real data on both sides from an unknown device asks the user', () => {
  assert.equal(syncPlan({ localHasProfile: true, localIsSample: false, remote, lastSync: null, userId: U }), 'conflict');
  assert.equal(syncPlan({ localHasProfile: true, localIsSample: false, remote, lastSync: { userId: 'someone-else', remoteUpdatedAt: remote.updated_at }, userId: U }), 'conflict');
});

test('sync: a known device pulls newer account data, otherwise pushes', () => {
  assert.equal(syncPlan({ localHasProfile: true, localIsSample: false, remote: { updated_at: '2026-10-21T10:00:00Z' }, lastSync: { userId: U, remoteUpdatedAt: '2026-10-20T10:00:00Z' }, userId: U }), 'pull');
  assert.equal(syncPlan({ localHasProfile: true, localIsSample: false, remote, lastSync: { userId: U, remoteUpdatedAt: remote.updated_at }, userId: U }), 'push');
});

test('email links: tokens, errors and normal hashes', () => {
  const ok = parseAuthHash('#access_token=aaa&expires_in=3600&refresh_token=rrr&token_type=bearer&type=signup');
  assert.deepEqual(ok?.tokens, { access_token: 'aaa', refresh_token: 'rrr', expires_in: 3600, type: 'signup' });
  assert.equal(parseAuthHash('#error=access_denied&error_code=otp_expired&error_description=Email+link+is+invalid+or+has+expired')?.error, 'That link has expired. Request a new one.');
  assert.equal(parseAuthHash('#home'), null);
  assert.equal(parseAuthHash(''), null);
});

test('auth errors become plain sentences', () => {
  assert.equal(friendlyAuthError(400, { error_code: 'invalid_credentials' }), 'That email and password don’t match.');
  assert.equal(friendlyAuthError(400, { msg: 'Email not confirmed' }), 'Check your email and tap the confirmation link first.');
  assert.equal(friendlyAuthError(422, { msg: 'User already registered' }), 'There’s already an account with that email. Try signing in.');
  assert.equal(friendlyAuthError(429, null), 'Too many tries. Wait a minute and try again.');
  assert.equal(friendlyAuthError(0, null), 'Can’t reach the server. Check your connection.');
});

test('jwt payload is decoded for display (url-safe base64)', () => {
  const payload = Buffer.from(JSON.stringify({ sub: 'abc', email: 'a@b.co', exp: 123 })).toString('base64url');
  assert.deepEqual(decodeJwt(`x.${payload}.y`), { sub: 'abc', email: 'a@b.co', exp: 123 });
  assert.deepEqual(decodeJwt('garbage'), {});
});

test('plan access: only active or trialing unlocks PX Plus', () => {
  assert.equal(isActive({ status: 'active', current_period_end: null, cancel_at_period_end: false }), true);
  assert.equal(isActive({ status: 'trialing', current_period_end: null, cancel_at_period_end: false }), true);
  for (const s of ['past_due', 'canceled', 'none', 'incomplete'] as const) assert.equal(isActive({ status: s, current_period_end: null, cancel_at_period_end: false }), false);
  assert.equal(isActive(null), false);
});

test('stripe form encoding handles nested objects and arrays', () => {
  const s = formEncode({ mode: 'subscription', line_items: [{ quantity: 1, price_data: { currency: 'usd', unit_amount: 2500, recurring: { interval: 'month' } } }], metadata: { user_id: 'u 1' }, skip: undefined });
  const parts = decodeURIComponent(s).split('&');
  assert.ok(parts.includes('mode=subscription'));
  assert.ok(parts.includes('line_items[0][quantity]=1'));
  assert.ok(parts.includes('line_items[0][price_data][unit_amount]=2500'));
  assert.ok(parts.includes('line_items[0][price_data][recurring][interval]=month'));
  assert.ok(parts.includes('metadata[user_id]=u 1'));
  assert.ok(!s.includes('skip'));
});

test('stripe webhook signature: valid, tampered, stale and missing', async () => {
  const secret = 'whsec_test';
  const body = '{"id":"evt_1","type":"customer.subscription.updated"}';
  const t = 1_800_000_000;
  const sig = await hmacHex(secret, `${t}.${body}`);
  assert.equal(await verifyStripeSignature(body, `t=${t},v1=${sig}`, secret, 300, t + 10), true);
  assert.equal(await verifyStripeSignature(body, `t=${t},v1=deadbeef,v1=${sig}`, secret, 300, t), true, 'any matching v1 passes');
  assert.equal(await verifyStripeSignature(body + ' ', `t=${t},v1=${sig}`, secret, 300, t), false, 'tampered body');
  assert.equal(await verifyStripeSignature(body, `t=${t},v1=${sig}`, secret, 300, t + 301), false, 'too old');
  assert.equal(await verifyStripeSignature(body, `t=${t},v1=${sig}`, 'whsec_other', 300, t), false, 'wrong secret');
  assert.equal(await verifyStripeSignature(body, null, secret), false);
  assert.equal(await verifyStripeSignature(body, `t=${t},v1=${sig}`, ''), false, 'unset secret never passes');
});

test('webhook maps a Stripe subscription to a row (old and new API shapes)', () => {
  const old = subRow({ id: 'sub_1', customer: 'cus_1', status: 'active', cancel_at_period_end: false, current_period_end: 1_800_000_000 }, U);
  assert.equal(old.status, 'active');
  assert.equal(old.current_period_end, new Date(1_800_000_000 * 1000).toISOString());
  const neu = subRow({ id: 'sub_1', customer: 'cus_1', status: 'active', cancel_at_period_end: true, items: { data: [{ current_period_end: 1_800_000_500 }] } }, U);
  assert.equal(neu.current_period_end, new Date(1_800_000_500 * 1000).toISOString());
  assert.equal(neu.cancel_at_period_end, true);
});

test('checkout only redirects back to the same site', () => {
  const req = new Request('https://px.example/api/checkout');
  assert.equal(safeReturn(req, 'https://px.example/'), 'https://px.example/');
  assert.equal(safeReturn(req, 'https://evil.example/steal'), 'https://px.example/');
  assert.equal(safeReturn(req, 'not a url'), 'https://px.example/');
});
