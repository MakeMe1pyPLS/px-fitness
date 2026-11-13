import { test } from 'node:test';
import assert from 'node:assert/strict';
import { matchup, campPhase, presetFor, groupOf, fmtClock, fmtHeight, fmtDiff } from '../src/lib/combat';

const me = { sport: 'Boxing' as const, heightCm: 183, stance: 'orthodox' as const };

test('taller boxer gets the long game; shorter gets pressure', () => {
  const t = matchup(me, { heightCm: 170 });
  assert.equal(t.size, 'taller'); assert.equal(t.headline, 'Keep it long'); assert.ok(t.reachEstimated);
  const s = matchup(me, { heightCm: 193 });
  assert.equal(s.size, 'shorter'); assert.equal(s.headline, 'Close the distance');
  assert.equal(matchup(me, { heightCm: 182 }).size, 'even');
});

test('reach decides range over height', () => {
  const m = matchup({ ...me, reachCm: 175 }, { heightCm: 178, reachCm: 190 });
  assert.equal(m.size, 'shorter'); assert.equal(m.reachDiffCm, -15); assert.equal(m.reachEstimated, false);
});

test('kicks and knees only for sports that use them', () => {
  assert.ok(!matchup(me, { heightCm: 170 }).doThis.some((x) => /teep|kick/i.test(x)));
  assert.ok(matchup({ ...me, sport: 'Muay Thai' }, { heightCm: 170 }).doThis.some((x) => /Knees/.test(x)));
});

test('stance advice: open vs closed, not for grappling', () => {
  assert.match(matchup(me, { heightCm: 180, stance: 'southpaw' }).stance!.title, /Open stance/);
  assert.match(matchup(me, { heightCm: 180, stance: 'orthodox' }).stance!.title, /Closed stance/);
  assert.equal(matchup({ ...me, sport: 'Wrestling' }, { heightCm: 180, stance: 'southpaw' }).stance, null);
  assert.equal(groupOf('Jiu-jitsu'), 'grappling');
  assert.equal(matchup({ ...me, sport: 'Jiu-jitsu' }, { heightCm: 160 }).headline, 'Use your length');
});

test('camp phases by days to the fight', () => {
  const d = (n: number) => { const x = new Date('2026-12-01T00:00:00'); x.setDate(x.getDate() + n); return x.toISOString().slice(0, 10); };
  assert.equal(campPhase(d(70), d(0)).id, 'base');
  assert.equal(campPhase(d(40), d(0)).id, 'build');
  assert.equal(campPhase(d(20), d(0)).id, 'sharpen');
  assert.equal(campPhase(d(5), d(0)).id, 'fight-week');
  assert.equal(campPhase(d(0), d(0)).id, 'fight-day');
  assert.equal(campPhase(d(-1), d(0)).id, 'done');
  assert.equal(campPhase(d(20), d(0)).days, 20);
});

test('round presets and formatting', () => {
  assert.deepEqual(presetFor('MMA'), { rounds: 3, workSec: 300, restSec: 60 });
  assert.deepEqual(presetFor('Boxing'), { rounds: 3, workSec: 180, restSec: 60 });
  assert.equal(fmtClock(185), '3:05'); assert.equal(fmtClock(-3), '0:00');
  assert.equal(fmtHeight(183, true), '6′0″'); assert.equal(fmtDiff(-12.7, true), '5 in');
});

import { LESSONS, lessonsFor, strategy, facingFrom, buildTips } from '../src/lib/fightLessons';
test('fight lessons: path, kicks only for kicking sports, plans link to real lessons', () => {
  assert.equal(lessonsFor('Boxing').length, 13);
  assert.equal(lessonsFor('Muay Thai').length, 16);
  const ids = new Set(LESSONS.map((l) => l.id));
  for (const f of ['bigger', 'taller', 'shorter', 'similar'] as const) for (const id of strategy(f, 'MMA').learnFirst) assert.ok(ids.has(id), id);
  // units stay together so the numbered path reads in order
  const units = lessonsFor('MMA').map((l) => l.unit); assert.deepEqual(units, [...units].sort((a, b) => units.indexOf(a) - units.indexOf(b)));
});
test('who you are facing: weight first, then reach/height', () => {
  assert.equal(facingFrom({ weightKg: 70, heightCm: 180 }, { weightKg: 85, heightCm: 175 }), 'bigger');
  assert.equal(facingFrom({ weightKg: 70, heightCm: 175 }, { weightKg: 72, heightCm: 188 }), 'taller');
  assert.equal(facingFrom({ weightKg: 80, heightCm: 185 }, { weightKg: 79, heightCm: 172 }), 'shorter');
  assert.equal(facingFrom({ weightKg: 80 }, { weightKg: 65 }), 'shorter');
  assert.equal(facingFrom({ weightKg: 80, heightCm: 180 }, { weightKg: 81, heightCm: 181 }), 'similar');
  assert.equal(facingFrom({}, {}), null);
  assert.equal(buildTips({ heightCm: 182.9, weightKg: 77 })!.title, 'Tall and rangy');
  assert.equal(buildTips({ heightCm: 168, weightKg: 62 })!.title, 'Shorter and compact');
});
