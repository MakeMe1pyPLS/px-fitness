import { test } from 'node:test';
import assert from 'node:assert/strict';
import { parseWhen, parseKind, parseUpcoming, upcomingAdvice, activeUpcoming, type UpcomingEvent } from '../src/lib/upcoming';
import { LADDERS, levelOf, nextLevel, skillSummary } from '../src/lib/skills';
import { buildCoachShare, buildSnapshot, buildFeed, eventsOn, money, type CoachEvent, type SocialProfile } from '../src/lib/social';
import { nextStep } from '../src/lib/checkinBot';
import { emptyData, migrate, Store } from '../src/lib/store';
import { coachPaymentRow } from '../api/stripe-webhook';

const T = '2026-11-11'; // a Wednesday
const ev = (o: Partial<UpcomingEvent>): UpcomingEvent => ({ id: 'e', kind: 'competition', label: '', date: T, createdAt: '', ...o });

test('dates from everyday phrases', () => {
  assert.equal(parseWhen('fight tomorrow', T), '2026-11-12');
  assert.equal(parseWhen('meet on saturday', T), '2026-11-14');
  assert.equal(parseWhen('next saturday', T), '2026-11-21');
  assert.equal(parseWhen('travelling wednesday', T), '2026-11-18', 'same weekday means next week');
  assert.equal(parseWhen('in 5 days', T), '2026-11-16');
  assert.equal(parseWhen('this weekend', T), '2026-11-14');
  assert.equal(parseWhen('race 12/14', T), '2026-12-14');
  assert.equal(parseWhen('race 1/3', T), '2027-01-03', 'past month/day rolls to next year');
  assert.equal(parseWhen('I sat down and felt fine', T), null, 'no false weekday');
  assert.equal(parseWhen('nothing much', T), null);
});

test('kind of event from free text', () => {
  assert.equal(parseKind('golden gloves fight'), 'competition');
  assert.equal(parseKind('flight to Atlanta'), 'travel');
  assert.equal(parseKind('finals week'), 'busy');
  assert.equal(parseKind('double shifts all week'), 'busy');
  assert.equal(parseKind('all good'), null);
  assert.deepEqual(parseUpcoming('Fight on Saturday', T), { kind: 'competition', date: '2026-11-14', label: 'Fight' });
  assert.equal(parseUpcoming('i have a golden gloves fight next saturday', T).label, 'Golden gloves fight');
  assert.equal(parseUpcoming('travel tomorrow', T).label, 'Travel');
});

test('plan advice: taper before a competition, rest on the day', () => {
  const d = { ...emptyData(), upcoming: [ev({ label: 'Golden Gloves', date: '2026-11-13' })] };
  const a = upcomingAdvice(d, T)!;
  assert.equal(a.suggestShort, true);
  assert.match(a.title, /Golden Gloves in 2 days/);
  assert.equal(upcomingAdvice(d, '2026-11-13')!.rest, true);
  assert.equal(upcomingAdvice(d, '2026-11-14'), null, 'over once it has passed');
  assert.equal(upcomingAdvice({ ...emptyData(), upcoming: [ev({ date: '2026-11-25' })] }, T), null, 'nothing to change two weeks out');
});

test('plan advice: travel and busy stretches suggest the short version while they last', () => {
  const d = { ...emptyData(), upcoming: [ev({ kind: 'travel', label: 'Philly', date: '2026-11-10', endDate: '2026-11-12' }), ev({ id: 'b', kind: 'busy', date: '2026-11-11' })] };
  const a = upcomingAdvice(d, T)!;
  assert.equal(a.suggestShort, true);
  assert.equal(a.event.kind, 'travel', 'travel (bodyweight) wins the tie');
  assert.equal(a.bodyweightOnly, true);
  assert.equal(upcomingAdvice(d, '2026-11-13'), null);
  assert.deepEqual(activeUpcoming(d, '2026-11-12').map((e) => e.kind), ['travel']);
});

test('check-in asks about what’s coming up unless something is already planned', () => {
  const all = { mood: 3, energy: 3, sleepHours: 7, availableMinutes: 30, soreness: 1 };
  assert.equal(nextStep(all, ['mood', 'energy', 'sleep', 'time', 'body']), 'ahead');
  assert.equal(nextStep(all, ['mood', 'energy', 'sleep', 'time', 'body'], true), 'note');
  assert.equal(nextStep(all, ['mood', 'energy', 'sleep', 'time', 'body', 'ahead']), 'note');
});

test('store: upcoming events and skill levels persist and migrate', () => {
  const old = migrate({ version: 3, profile: null });
  assert.deepEqual(old.upcoming, []);
  assert.deepEqual(old.skills, {});
  const mem = new Map<string, string>();
  const s = new Store({ getItem: (k) => mem.get(k) ?? null, setItem: (k, v) => void mem.set(k, v), removeItem: (k) => void mem.delete(k) });
  const e = s.addUpcoming({ kind: 'travel', label: '  Trip  ', date: '2099-01-01', endDate: '2098-01-01' });
  assert.equal(e.label, 'Trip');
  assert.equal(e.endDate, undefined, 'end before start is dropped');
  s.setSkillLevel('pullup', 4, '2026-11-11');
  s.setSkillLevel('pullup', 3, '2026-11-12');
  const again = new Store({ getItem: (k) => mem.get(k) ?? null, setItem: (k, v) => void mem.set(k, v), removeItem: (k) => void mem.delete(k) });
  assert.equal(again.get().upcoming.length, 1);
  assert.equal(levelOf(again.get(), 'pullup'), 3, 'moving back a level is allowed');
  s.removeUpcoming(e.id);
  assert.equal(s.get().upcoming.length, 0);
});

test('skill ladders: next level, top level, and what is shared', () => {
  for (const l of LADDERS) { assert.ok(l.levels.length >= 5); for (const x of l.levels) assert.ok(x.test.length > 3); }
  const d = { ...emptyData(), skills: { pullup: { level: 3, history: [{ level: 3, date: '2026-11-01' }] }, core: { level: 5, history: [{ level: 5, date: '2026-11-02' }] } } };
  assert.equal(nextLevel(d, 'pullup')!.name, 'First pull-up');
  assert.equal(nextLevel(d, 'pullup')!.number, 4);
  assert.equal(nextLevel(d, 'core'), null, 'L-sit ladder has 5 levels');
  assert.equal(nextLevel(d, 'pushup')!.number, 1);
  assert.deepEqual(skillSummary(d).map((k) => [k.id, k.level, k.name, k.date]), [['pullup', 3, 'Slow negatives', '2026-11-01'], ['core', 5, 'L-sit', '2026-11-02']]);
  assert.equal(buildSnapshot(d, { routine: false, workouts: false }).skills, undefined, 'not shared unless workouts are shared');
  assert.equal(buildSnapshot(d, { routine: false, workouts: true }).skills?.length, 2);
});

test('level-ups show in friends’ feeds for 30 days', () => {
  const f: SocialProfile = { user_id: 'a', display_name: 'Alex', share_routine: false, share_workouts: true, updated_at: '', shared: { skills: [{ id: 'pullup', ladder: 'Pull-up', level: 4, of: 6, name: 'First pull-up', date: '2026-11-10' }] } };
  assert.deepEqual(buildFeed({ a: f }, [], 40, T).map((x) => x.key), ['l:pullup:4']);
  assert.deepEqual(buildFeed({ a: f }, [], 40, '2026-12-20'), []);
  assert.deepEqual(buildFeed({ a: { ...f, share_workouts: false } }, [], 40, T), []);
});

test('coach sees skill levels always, upcoming events only with check-ins on', () => {
  const d = { ...emptyData(), skills: { pushup: { level: 2, history: [{ level: 2, date: T }] } }, upcoming: [ev({ label: 'Meet', date: '2026-11-20' })] };
  const off = buildCoachShare(d, false, T);
  assert.equal(off.skills?.[0].name, 'Incline push-up');
  assert.equal(off.upcoming, undefined);
  assert.equal(buildCoachShare(d, true, T).upcoming?.[0].label, 'Meet');
});

test('events on a day, and money formatting', () => {
  const e = (o: Partial<CoachEvent>): CoachEvent => ({ id: 'x', coach_id: 'c', coach_name: 'Phil', title: 'PX Saturday', starts_at: new Date(2026, 10, 14, 9).toISOString(), minutes: 60, location: 'Park', details: null, capacity: null, cancelled: false, going: 0, me_going: true, ...o });
  assert.equal(eventsOn([e({}), e({ id: 'y', cancelled: true }), e({ id: 'z', starts_at: new Date(2026, 10, 15, 9).toISOString() })], '2026-11-14').length, 1);
  assert.equal(money(8000), '$80');
  assert.equal(money(2550), '$25.50');
});

test('coach payments are recorded only for the coach who owns the Stripe account', () => {
  const s = { id: 'cs_1', amount_total: 8000, currency: 'usd', metadata: { px_kind: 'coaching', coach_id: 'coach-1', client_id: 'client-1', offer_name: 'Single session', note: 'Sat mornings' } };
  const row = coachPaymentRow(s, 'acct_1', 'coach-1')!;
  assert.deepEqual([row.coach_id, row.client_id, row.amount_cents, row.stripe_session_id, row.note], ['coach-1', 'client-1', 8000, 'cs_1', 'Sat mornings']);
  assert.equal(coachPaymentRow(s, 'acct_2', 'coach-2'), null, 'metadata naming another coach is ignored');
  assert.equal(coachPaymentRow(s, 'acct_1', null), null, 'unknown account');
  assert.equal(coachPaymentRow({ ...s, metadata: { ...s.metadata, px_kind: 'other' } }, 'acct_1', 'coach-1'), null);
});
