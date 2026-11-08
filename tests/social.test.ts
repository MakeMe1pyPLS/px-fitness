import { test } from 'node:test';
import assert from 'node:assert/strict';
import { buildSnapshot, buildFeed, makeFriendCode, normalizeCode, isCode, formatCode, pairOf, dataUrlToBlob, CODE_ALPHABET, type SocialProfile, type SharedPhoto } from '../src/lib/social';
import { emptyData } from '../src/lib/store';
import type { AppData, Session } from '../src/lib/types';

const session = (id: string, date: string, o: Partial<Session> = {}): Session => ({
  id, templateId: 't1', name: 'Push Day', variant: 'full', plannedFor: date,
  startedAt: `${date}T17:00:00Z`, endedAt: `${date}T17:42:00Z`, status: 'completed',
  exercises: [
    { exerciseId: 'goblet-squat', target: '8–10 reps', sets: [{ done: true, weight: 50, reps: 10 }, { done: true }, { done: false }] },
    { exerciseId: 'push-up', target: '8–12 reps', sets: [{ done: false }] },
  ],
  effort: 2, note: 'felt awful, bad sleep', ...o,
});
const data = (): AppData => ({ ...emptyData(), templates: [{ id: 't1', name: 'Push Day', focus: 'Upper', exercises: [{ exerciseId: 'goblet-squat', sets: 3, target: '8–10 reps' }] }], sessions: [session('s1', '2026-10-01'), session('s2', '2026-10-03', { status: 'abandoned' }), session('s3', '2026-10-05', { variant: 'short' })], checkins: [{ date: '2026-10-05', mood: 1, updatedAt: '' } as AppData['checkins'][number]] });

test('snapshot: nothing is shared unless switched on', () => {
  assert.deepEqual(buildSnapshot(data(), { routine: false, workouts: false }), {});
});

test('snapshot: plan shares names and targets, never weights', () => {
  const s = buildSnapshot(data(), { routine: true, workouts: false });
  assert.equal(s.recent, undefined);
  assert.equal(s.routine?.[0].name, 'Push Day');
  assert.equal(s.routine?.[0].exercises[0].sets, 3);
  assert.ok(!JSON.stringify(s).includes('weight'));
});

test('snapshot: workouts share only finished ones, without notes, effort or check-ins', () => {
  const s = buildSnapshot(data(), { routine: false, workouts: true });
  assert.deepEqual(s.recent?.map((w) => w.id), ['s3', 's1'], 'abandoned excluded, newest first');
  assert.equal(s.recent?.[0].short, true);
  assert.equal(s.recent?.[1].minutes, 42);
  assert.equal(s.recent?.[1].sets, 2);
  assert.equal(s.recent?.[1].exercises.length, 1, 'only exercises with a finished set');
  const text = JSON.stringify(s);
  for (const secret of ['awful', 'bad sleep', 'effort', 'mood', '"weight"', '"reps"']) assert.ok(!text.includes(secret), `must not include ${secret}`);
});

test('snapshot: at most 12 workouts', () => {
  const d = data();
  d.sessions = Array.from({ length: 20 }, (_, i) => session('x' + i, `2026-09-${String(i + 1).padStart(2, '0')}`));
  assert.equal(buildSnapshot(d, { routine: false, workouts: true }).recent?.length, 12);
});

test('feed: only from friends who share, newest first, photos included', () => {
  const f = (id: string, name: string, share: boolean, dates: string[]): SocialProfile => ({ user_id: id, display_name: name, share_routine: false, share_workouts: share, updated_at: '', shared: { recent: dates.map((d, i) => ({ id: `${id}${i}`, name: 'Legs', date: d, minutes: 30, short: false, exercises: [], sets: 6 })) } });
  const friends = { a: f('a', 'Alex', true, ['2026-10-02']), b: f('b', 'Bri', false, ['2026-10-09']) };
  const photos: SharedPhoto[] = [
    { id: 'p1', user_id: 'a', local_id: 'l', path: 'a/p1.jpg', taken_on: '2026-10-05', caption: null, created_at: '' },
    { id: 'p2', user_id: 'me', local_id: 'l', path: 'me/p2.jpg', taken_on: '2026-10-08', caption: null, created_at: '' },
  ];
  const feed = buildFeed(friends, photos);
  assert.deepEqual(feed.map((x) => x.key), ['p:p1', 'w:a0'], 'Bri hid workouts; my own photo is not in my feed');
});

test('friend codes: right alphabet, length and formatting', () => {
  for (let i = 0; i < 200; i++) { const c = makeFriendCode(); assert.ok(isCode(c), c); }
  assert.ok(!/[IO01]/.test(CODE_ALPHABET));
  assert.equal(normalizeCode(' abcd-2345 '), 'ABCD2345');
  assert.equal(formatCode('ABCD2345'), 'ABCD-2345');
  assert.equal(isCode('ABCD234O'), false, 'letter O is never used');
  assert.equal(makeFriendCode(() => 0), 'AAAAAAAA');
});

test('friend pair ordering matches the database (smaller id first)', () => {
  assert.deepEqual(pairOf('bbbb', 'aaaa'), ['aaaa', 'bbbb']);
  assert.deepEqual(pairOf('aaaa', 'bbbb'), ['aaaa', 'bbbb']);
});

test('photo data URL converts to an upload', async () => {
  const b = dataUrlToBlob('data:image/jpeg;base64,' + Buffer.from('hello').toString('base64'));
  assert.equal(b.type, 'image/jpeg');
  assert.equal(await b.text(), 'hello');
});

import { sizeMatches, challengeCount, buildCoachShare } from '../src/lib/social';

const combatFriend = (id: string, sport: string, h: number, w: number, share = true): SocialProfile => ({ user_id: id, display_name: id, share_routine: false, share_workouts: false, share_combat: share, updated_at: '', shared: { combat: { sport, heightCm: h, weightKg: w } } });

test('size matching: same sport, within 8 cm and 10% weight, only if shared', () => {
  const friends = {
    close: combatFriend('close', 'Boxing', 178, 82),
    tall: combatFriend('tall', 'Boxing', 190, 80),
    heavy: combatFriend('heavy', 'Boxing', 180, 95),
    otherSport: combatFriend('otherSport', 'Wrestling', 180, 80),
    hidden: combatFriend('hidden', 'Boxing', 180, 80, false),
  };
  assert.deepEqual(sizeMatches({ sport: 'Boxing', heightCm: 180, weightKg: 80 }, friends), ['close']);
  assert.deepEqual(sizeMatches({ sport: 'Boxing' }, friends), [], 'no size, no matches');
  assert.deepEqual(sizeMatches(undefined, friends), []);
});

test('fight dates show in the feed until the day passes', () => {
  const f = { ...combatFriend('a', 'MMA', 180, 80), display_name: 'Alex' };
  f.shared.combat!.fightDate = '2026-11-20';
  f.shared.combat!.fightName = 'Regional open';
  assert.deepEqual(buildFeed({ a: f }, [], 40, '2026-11-10').map((x) => x.kind), ['fight']);
  assert.deepEqual(buildFeed({ a: f }, [], 40, '2026-11-21'), []);
  assert.deepEqual(buildFeed({ a: { ...f, share_combat: false } }, [], 40, '2026-11-10'), []);
});

test('challenge progress counts finished workouts inside the dates', () => {
  const d = data();
  assert.equal(challengeCount(d, '2026-10-01', '2026-10-31'), 2, 's1 and s3; abandoned s2 excluded');
  assert.equal(challengeCount(d, '2026-10-02', '2026-10-04'), 0);
});

test('coach share: workouts always, check-in numbers only when on, never notes', () => {
  const d = data();
  d.checkins = [
    { date: '2026-10-05', mood: 2, energy: 3, sleepHours: 6, note: 'PRIVATE note', updatedAt: '' },
    { date: '2026-09-01', mood: 5, updatedAt: '' },
  ];
  const off = buildCoachShare(d, false, '2026-10-06');
  assert.equal(off.checkins, undefined);
  assert.deepEqual(off.recent?.map((w) => w.id), ['s3', 's1']);
  const on = buildCoachShare(d, true, '2026-10-06');
  assert.deepEqual(on.checkins, [{ date: '2026-10-05', mood: 2, energy: 3, stress: undefined, sleepHours: 6, soreness: undefined }], 'last 2 weeks only');
  assert.ok(!JSON.stringify(on).includes('PRIVATE'));
});
