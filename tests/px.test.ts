import { test } from 'node:test';
import assert from 'node:assert/strict';
import { Store, type StorageLike } from '../src/lib/store';
import { detectSafety, parseFreeText, nextStep, recall, summarize, QUESTIONS } from '../src/lib/checkinBot';
import { fourWeek, deskMetrics, calendarUrl, clientBalance, weekPlanText, isValidUrl, paymentsCsv, DEFAULT_TIERS, upcoming } from '../src/lib/coach';
import { PhotoStore, autoMilestones, MAX_PHOTOS } from '../src/lib/photos';
import { addDays, toDateKey } from '../src/lib/dates';
import type { Profile } from '../src/lib/types';

class Mem implements StorageLike { m = new Map<string, string>(); getItem(k: string) { return this.m.get(k) ?? null; } setItem(k: string, v: string) { this.m.set(k, v); } removeItem(k: string) { this.m.delete(k); } }
const today = toDateKey(new Date());
const profile = (o: Partial<Profile> = {}): Profile => ({ name: 'Sam', goal: 'general', secondaryGoals: [], disciplines: [], primaryDiscipline: null, goalHistory: [], experience: 'beginner', equipment: ['dumbbells'], sessionMinutes: 45, trainingDays: [0, 1, 2, 3, 4, 5, 6], preferredTime: 'evening', unit: 'lb', checkinsEnabled: true, createdAt: new Date().toISOString(), ...o });

test('safety: crisis, eating-disorder and pain language are detected first', () => {
  assert.equal(detectSafety('honestly I want to die'), 'crisis');
  assert.equal(detectSafety('been thinking about hurting myself'), 'crisis');
  assert.equal(detectSafety('I skip meals to make weight and purge'), 'ed');
  assert.equal(detectSafety('sharp pain in my knee'), 'pain');
  assert.equal(detectSafety('my shoulder hurts'), 'pain');
  assert.equal(detectSafety('pretty sore from legs'), null, 'soreness is not pain');
  assert.equal(detectSafety('feeling great today'), null);
});

test('free text fills several fields at once', () => {
  assert.deepEqual(parseFreeText('Tired, slept 5 hours, only have 20 min'), { energy: 2, sleepHours: 5, availableMinutes: 20 });
  const p = parseFreeText('feeling good but very sore and stressed about work');
  assert.equal(p.mood, 4); assert.equal(p.soreness, 4); assert.equal(p.stress, 4);
  assert.equal(parseFreeText('not great tbh').mood, 2);
  assert.equal(parseFreeText('got maybe 6.5 hrs').sleepHours, 6.5);
  assert.equal(parseFreeText('have an hour').availableMinutes, 60);
  assert.deepEqual(parseFreeText('blue'), {});
});

test('bot skips questions already answered by free text', () => {
  const a = parseFreeText('slept 7 hours, energy is low');
  assert.equal(nextStep({ mood: 3, ...a }, ['mood']), 'time');
  assert.equal(nextStep({ mood: 3, energy: 3, sleepHours: 7, availableMinutes: 30, soreness: 1 }, ['mood', 'energy', 'sleep', 'time']), 'note');
  assert.equal(nextStep({}, ['mood', 'energy', 'sleep', 'time', 'body', 'note']), null);
  assert.equal(QUESTIONS.mood.chips.map((c) => c.label).join(), 'Low,Okay,Good,Great', 'PX mood options kept');
});

test('recall references only real saved memory from the last 3 days', () => {
  const s = new Store(new Mem());
  s.completeOnboarding(profile());
  assert.equal(recall(s.get()), null);
  s.remember(addDays(today, -1), 'older note');
  s.remember(addDays(today, -1), 'left knee a little cranky');
  assert.match(recall(s.get())!, /left knee a little cranky/, 'newest note wins on the same day');
  s.clearMemory();
  s.remember(addDays(today, -6), 'old note');
  assert.equal(recall(s.get()), null, 'stale memory not recalled');
  s.saveCheckin(addDays(today, -1), { soreness: 5 });
  assert.match(recall(s.get())!, /very sore/);
});

test('summary suggests the short version on low days, full otherwise', () => {
  const s = new Store(new Mem());
  s.completeOnboarding(profile());
  assert.equal(summarize(s.get(), { energy: 1 }).short, true);
  assert.equal(summarize(s.get(), { energy: 4, sleepHours: 8, availableMinutes: 60 }).short, false);
  assert.match(summarize(s.get(), { availableMinutes: 5 }).suggestion, /one exercise counts/);
  assert.deepEqual(summarize(s.get(), { mood: 4, energy: 2 }).lines, ['feeling good', 'energy 2/5']);
});

test('coaching: tiers, four-week totals, desk metrics, balances', () => {
  assert.deepEqual(DEFAULT_TIERS.map(fourWeek), [320, 480, 600]);
  const s = new Store(new Mem());
  s.completeOnboarding(profile());
  s.requestCoaching({ name: 'Ana', contact: 'ana@example.com', tierId: 'tier2', preferred: 'Tue/Thu evenings', message: 'Want to get stronger' });
  let c = s.get().coach;
  assert.equal(deskMetrics(c).newInquiries, 1);
  s.convertInquiry(c.inquiries[0].id);
  c = s.get().coach;
  assert.equal(c.clients.length, 1);
  assert.equal(c.inquiries[0].status, 'converted');
  assert.match(c.clients[0].notes, /Tue\/Thu evenings/);
  const cid = c.clients[0].id;
  s.savePayment({ clientId: cid, payer: 'Ana', amount: 480, date: today, method: 'Cash App', status: 'paid' });
  s.savePayment({ clientId: cid, payer: 'Ana', amount: 120, date: today, method: 'Cash App', status: 'due' });
  c = s.get().coach;
  const m = deskMetrics(c);
  assert.equal(m.activeClients, 1); assert.equal(m.openInquiries, 0); assert.equal(m.due, 120); assert.equal(m.collectedMonth, 480);
  assert.deepEqual(clientBalance(c, cid), { paid: 480, due: 120 });
  assert.match(paymentsCsv(s.get()), /480\.00,paid,Cash App/);
});

test('schedule: upcoming ordering and calendar link', () => {
  const s = new Store(new Mem());
  s.saveSession({ name: 'Ana', date: addDays(today, 2), time: '18:00', minutes: 60, kind: 'video', status: 'scheduled' });
  s.saveSession({ name: 'Ben', date: addDays(today, 1), time: '07:30', minutes: 45, kind: 'in_person', status: 'scheduled' });
  s.saveSession({ name: 'Old', date: addDays(today, -1), time: '07:30', minutes: 45, kind: 'in_person', status: 'scheduled' });
  const u = upcoming(s.get().coach);
  assert.deepEqual(u.map((x) => x.name), ['Ben', 'Ana']);
  const url = calendarUrl(u[1], 'Coach P', 'https://meet.google.com/abc-defg-hij');
  assert.match(url, /^https:\/\/calendar\.google\.com\/calendar\/render\?action=TEMPLATE/);
  assert.match(decodeURIComponent(url), /meet\.google\.com/);
  assert.match(url, /dates=\d{8}T\d{6}Z\/\d{8}T\d{6}Z/);
});

test('helpers: week plan text, URL validation', () => {
  assert.equal(weekPlanText('Ana', { Mon: 'Lower A', Wed: '', Fri: 'Upper A' }), 'Week plan for Ana\nMon: Lower A\nFri: Upper A');
  assert.equal(isValidUrl('https://calendly.com/x'), true);
  assert.equal(isValidUrl('javascript:alert(1)'), false);
  assert.equal(isValidUrl(''), true);
});

test('photos: separate storage, limits enforced, auto milestones from real data', () => {
  const m = new Mem();
  const ps = new PhotoStore(m);
  ps.add(today, 'data:image/jpeg;base64,' + 'A'.repeat(4000));
  assert.equal(new PhotoStore(m).list().length, 1, 'persists');
  for (let i = 1; i < MAX_PHOTOS; i++) ps.add(today, 'data:image/jpeg;base64,AAAA');
  assert.throws(() => ps.add(today, 'data:image/jpeg;base64,AAAA'), /up to 24/);
  const auto = autoMilestones([{ plannedFor: '2026-10-01' }, ...Array.from({ length: 9 }, () => ({ plannedFor: '2026-10-05' }))], 2, 3);
  assert.deepEqual(auto.map((a) => a.title), ['First workout logged', '10 workouts logged', '2 personal bests set']);
});

test('v2 data migrates to v3 with empty coach data', () => {
  const m = new Mem();
  m.setItem('kova:data', JSON.stringify({ version: 2, profile: null, nutrition: { saved: ['x'] } }));
  const s = new Store(m);
  assert.equal(s.get().coach.tiers.length, 3);
  assert.deepEqual(s.get().checkinMemory, []);
  assert.deepEqual(s.get().nutrition.saved, ['x']);
});

import { simulate, springEasing, SPRINGS } from '../src/lib/motion';

test('motion: springs settle, bouncy overshoots, press does not ring much', () => {
  for (const [name, s] of Object.entries(SPRINGS)) {
    const { pts, duration } = simulate(s);
    assert.ok(duration > 0.15 && duration < 2, `${name} settles in ${duration.toFixed(2)}s`);
    assert.ok(Math.abs(pts[pts.length - 1].x - 1) < 0.002, `${name} ends at 1`);
  }
  const peak = (s: { stiffness: number; damping: number }) => Math.max(...simulate(s).pts.map((p) => p.x));
  assert.ok(peak(SPRINGS.bouncy) > 1.1, 'bouncy overshoots');
  assert.ok(peak(SPRINGS.smooth) < 1.08, 'smooth barely overshoots');
});

test('motion: linear() easing string is well formed and ends at 1', () => {
  const { easing, ms } = springEasing(SPRINGS.smooth);
  assert.match(easing, /^linear\(0, [\d.,\s-]+, 1\)$/);
  assert.equal(easing.split(',').length, 37);
  assert.ok(ms > 200 && ms < 1500);
});
